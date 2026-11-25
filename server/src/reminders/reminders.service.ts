import { Injectable } from '@nestjs/common';
import { EventLevel, ReminderStatus } from '@prisma/client';

import { Errors } from '../common/errors';
import { paged, type PaginationQuery } from '../common/dto/pagination.dto';
import { readIntSetting, SETTING_KEYS } from '../common/setting-reader';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CredentialService } from '../locker/credential.service';
import { LockerClient } from '../locker/locker.client';
import { ReminderRunner } from '../scheduler/reminder-runner.service';
import type { AuthUser } from '../common/decorators';
import type { CreateReminderDto, ListRemindersQuery } from './dto';

const ACTIVE: ReminderStatus[] = [
  ReminderStatus.PENDING,
  ReminderStatus.BASELINE,
  ReminderStatus.WAITING,
];

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: ReminderRunner,
    private readonly locker: LockerClient,
    private readonly credentials: CredentialService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, dto: CreateReminderDto) {
    const maxDuration = await readIntSetting(this.prisma, SETTING_KEYS.maxDurationMin, 720, 1, 1440);
    const defaultDuration = await readIntSetting(
      this.prisma,
      SETTING_KEYS.defaultDurationMin,
      60,
      1,
      maxDuration,
    );
    const maxActive = await readIntSetting(
      this.prisma,
      SETTING_KEYS.maxActiveRemindersPerUser,
      5,
      1,
      50,
    );

    const durationMin = Math.min(dto.durationMin ?? defaultDuration, maxDuration);
    if (durationMin < 1) throw Errors.validation('时长不合法');

    const pickupCode = dto.pickupCode.trim();
    if (!pickupCode) throw Errors.validation('请填写取餐码');
    // 手机尾号模式：必须恰好 4 位数字，避免把「12345」「123a」这类值当尾号提交
    if (dto.codeMode === 'phone_tail' && !/^\d{4}$/.test(pickupCode)) {
      throw Errors.validation('手机尾号必须是 4 位数字');
    }

    const activeCount = await this.prisma.reminder.count({
      where: { userId: actor.id, status: { in: ACTIVE } },
    });
    if (activeCount >= maxActive) {
      throw Errors.conflict(
        'TOO_MANY_ACTIVE_REMINDERS',
        `同时最多 ${maxActive} 个等待中的提醒，请先停止或等待现有任务结束`,
      );
    }

    const now = new Date();
    const reminder = await this.prisma.reminder.create({
      data: {
        userId: actor.id,
        pickupCode,
        cabCode: dto.cabCode.trim(),
        codeMode: dto.codeMode === 'phone_tail' ? 'phone_tail' : 'custom',
        durationMin,
        status: ReminderStatus.PENDING,
        endsAt: new Date(now.getTime() + durationMin * 60_000),
      },
    });

    await this.prisma.reminderEvent.create({
      data: {
        reminderId: reminder.id,
        level: EventLevel.INFO,
        message: `提醒已创建：取餐码 ${maskCode(reminder.pickupCode)}，柜机 ${reminder.cabCode}，时长 ${durationMin} 分钟`,
      },
    });

    const warnings: Array<{ code: string; message: string }> = [];
    if (!actor.phoneVerifiedAt) {
      warnings.push({
        code: 'PHONE_NOT_BOUND',
        message: '未绑定手机号，短信提醒不可达，只能通过 App 或网页查看',
      });
    }

    return { ...reminder, warnings };
  }

  async list(actor: AuthUser, query: ListRemindersQuery) {
    const where = { userId: actor.id, ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reminder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.pageSize,
      }),
      this.prisma.reminder.count({ where }),
    ]);
    return paged(items, total, query as unknown as PaginationQuery);
  }

  async detail(actor: AuthUser, id: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, userId: actor.id },
      include: {
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!reminder) throw Errors.notFound('提醒不存在');
    return reminder;
  }

  async check(actor: AuthUser, id: string) {
    await this.assertOwned(actor, id);
    const result = await this.runner.check(id);
    return result;
  }

  async stop(actor: AuthUser, id: string) {
    const reminder = await this.assertOwned(actor, id);
    if (!ACTIVE.includes(reminder.status)) {
      throw Errors.conflict('REMINDER_NOT_ACTIVE', '该提醒已结束，无需停止');
    }
    const updated = await this.prisma.reminder.update({
      where: { id },
      data: { status: ReminderStatus.STOPPED, finishedAt: new Date() },
    });
    await this.prisma.reminderEvent.create({
      data: { reminderId: id, level: EventLevel.WARN, message: '用户手动停止提醒' },
    });
    return updated;
  }

  /**
   * 一键开箱：只允许任务本人在「已入柜」后调用。
   *
   * 安全约束（这是会物理开门的操作）：
   * - 必须是自己且已 ARRIVED 的任务，且已保存 orderid / locker_id
   * - 同一任务最多开 3 次，两次之间至少 10 秒
   * - 全部写审计与事件流
   */
  async openBox(actor: AuthUser, id: string) {
    const reminder = await this.assertOwned(actor, id);
    if (reminder.status !== ReminderStatus.ARRIVED) {
      throw Errors.conflict('REMINDER_NOT_ARRIVED', '只有已入柜的任务才能开箱');
    }
    if (!reminder.orderId || !reminder.lockerId) {
      throw Errors.conflict(
        'ORDER_ID_MISSING',
        '该任务没有记录到订单号，无法开箱；请重新创建任务或在取餐柜小程序里操作',
      );
    }
    if (reminder.openCount >= 3) {
      throw Errors.conflict('OPEN_LIMIT_REACHED', '该任务开箱次数已达上限（3 次）');
    }
    if (reminder.lastOpenedAt && Date.now() - reminder.lastOpenedAt.getTime() < 10_000) {
      throw Errors.conflict('OPEN_TOO_FREQUENT', '开箱请求过于频繁，请 10 秒后再试');
    }

    // 开箱时间窗口：入柜后 N 小时内有效，防止几天后再开门
    const windowHours = await readIntSetting(
      this.prisma,
      SETTING_KEYS.openBoxWindowHours,
      24,
      1,
      168,
    );
    const arrivedAt = reminder.finishedAt ?? reminder.notifiedAt;
    if (arrivedAt && Date.now() - arrivedAt.getTime() > windowHours * 3600_000) {
      throw Errors.conflict(
        'OPEN_WINDOW_EXPIRED',
        `已超过开箱时间窗口（入柜后 ${windowHours} 小时内），请到取餐柜小程序操作`,
      );
    }

    const token = await this.credentials.getToken();
    if (!token && !this.locker.isMock()) {
      throw Errors.conflict('MEMBER_TOKEN_MISSING', '未配置 MemberToken，无法开箱');
    }

    const result = await this.locker.openBox(token ?? '', reminder.lockerId, reminder.orderId);
    if (!result.ok) {
      await this.prisma.reminderEvent.create({
        data: {
          reminderId: id,
          level: EventLevel.ERROR,
          message: `开箱失败：${result.message.slice(0, 200)}`,
        },
      });
      throw Errors.conflict('OPEN_FAILED', `开箱失败：${result.message}`);
    }

    const updated = await this.prisma.reminder.update({
      where: { id },
      data: { openCount: { increment: 1 }, lastOpenedAt: new Date() },
    });
    await this.prisma.reminderEvent.create({
      data: {
        reminderId: id,
        level: EventLevel.SUCCESS,
        message: `一键开箱已发送（第 ${updated.openCount} 次）：${result.message.slice(0, 120)}`,
      },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'LOCKER_OPEN',
      targetType: 'reminder',
      targetId: id,
      detail: `开箱柜号 ${reminder.cabinet}，订单 ${reminder.orderId}，第 ${updated.openCount} 次`,
    });

    return {
      ok: true,
      message: result.message,
      openCount: updated.openCount,
      cabinet: reminder.cabinet,
    };
  }

  async events(actor: AuthUser, id: string, query: PaginationQuery) {
    await this.assertOwned(actor, id);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reminderEvent.findMany({
        where: { reminderId: id },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.reminderEvent.count({ where: { reminderId: id } }),
    ]);
    return paged(items, total, query);
  }

  private async assertOwned(actor: AuthUser, id: string) {
    const reminder = await this.prisma.reminder.findFirst({ where: { id, userId: actor.id } });
    if (!reminder) throw Errors.notFound('提醒不存在');
    return reminder;
  }
}

function maskCode(code: string): string {
  if (code.length <= 2) return code;
  return `${code[0]}${'*'.repeat(Math.min(code.length - 2, 4))}${code.slice(-1)}`;
}
