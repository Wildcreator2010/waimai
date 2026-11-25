import { Injectable, Logger } from '@nestjs/common';
import { EventLevel, ReminderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CredentialService } from '../locker/credential.service';
import { LockerClient, LockerError } from '../locker/locker.client';
import { NotificationsService, type NotifySummary } from '../notifications/notifications.service';
import { readSetting, SETTING_KEYS } from '../common/setting-reader';

export interface CheckResult {
  ok: boolean;
  arrived: boolean;
  baseline?: boolean;
  cabinet?: string;
  detail?: string;
  error?: string;
  notify?: NotifySummary;
}

const ACTIVE_STATUSES: ReminderStatus[] = [
  ReminderStatus.PENDING,
  ReminderStatus.BASELINE,
  ReminderStatus.WAITING,
];

/**
 * 单任务查询与状态推进。调度器与「立即查询」共用这一份逻辑，避免两套判定。
 *
 * 状态机（docs/architecture.md §7）：
 *   PENDING --首次查询--> BASELINE --指纹变化且命中--> ARRIVED
 *   超过 endsAt --> TIMEOUT；用户手动 --> STOPPED
 */
@Injectable()
export class ReminderRunner {
  private readonly logger = new Logger('Runner');

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialService,
    private readonly locker: LockerClient,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async check(reminderId: string): Promise<CheckResult> {
    const reminder = await this.prisma.reminder.findUnique({ where: { id: reminderId } });
    if (!reminder) return { ok: false, arrived: false, error: '任务不存在' };
    if (!ACTIVE_STATUSES.includes(reminder.status)) {
      return { ok: false, arrived: false, error: '任务已结束' };
    }

    if (reminder.endsAt.getTime() <= Date.now()) {
      await this.markTimeout(reminderId);
      return { ok: true, arrived: false, detail: '已超时' };
    }

    const token = await this.credentials.getToken();
    if (!token && !this.locker.isMock()) {
      await this.recordFailure(reminderId, '未配置 MemberToken，无法查询');
      return { ok: false, arrived: false, error: '未配置 MemberToken' };
    }

    let state;
    try {
      state = await this.locker.query(token ?? '', reminder.pickupCode, reminder.cabCode);
    } catch (error) {
      if (error instanceof LockerError) {
        if (error.kind === 'expired') {
          await this.credentials.markInvalid(error.message);
          await this.recordFailure(reminderId, error.message, true);
          return { ok: false, arrived: false, error: error.message };
        }
        await this.recordFailure(reminderId, error.message);
        return { ok: false, arrived: false, error: error.message };
      }
      await this.recordFailure(reminderId, (error as Error).message);
      return { ok: false, arrived: false, error: (error as Error).message };
    }

    const firstCheck = reminder.checkCount === 0;
    const now = new Date();

    if (firstCheck) {
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: {
          status: ReminderStatus.BASELINE,
          baselineFingerprint: state.fingerprint,
          lastDetail: state.detail.slice(0, 300),
          checkCount: 1,
          failCount: 0,
          lastCheckAt: now,
        },
      });
      await this.addEvent(reminderId, EventLevel.INFO, `基线记录：${state.detail.slice(0, 200)}`);
      return { ok: true, arrived: false, baseline: true, detail: state.detail };
    }

    const isFreshArrival =
      state.arrived &&
      Boolean(state.fingerprint) &&
      state.fingerprint !== reminder.baselineFingerprint;

    if (isFreshArrival) {
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: {
          status: ReminderStatus.ARRIVED,
          cabinet: state.cabinet,
          orderId: state.orderId,
          lockerId: state.lockerId,
          lastDetail: state.detail.slice(0, 300),
          checkCount: { increment: 1 },
          failCount: 0,
          lastCheckAt: now,
          finishedAt: now,
          notifiedAt: now,
        },
      });
      await this.addEvent(reminderId, EventLevel.SUCCESS, `检测到入柜，柜号 ${state.cabinet}`);

      const user = await this.prisma.user.findUnique({ where: { id: reminder.userId } });
      if (!user) return { ok: true, arrived: true, cabinet: state.cabinet };

      const notify = await this.notifications.notifyArrival(
        { ...reminder, cabinet: state.cabinet },
        user,
      );
      await this.addEvent(
        reminderId,
        notify.sms.attempted && !notify.sms.ok ? EventLevel.WARN : EventLevel.INFO,
        describeNotify(notify),
      );
      return { ok: true, arrived: true, cabinet: state.cabinet, notify };
    }

    await this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: reminder.status === ReminderStatus.PENDING ? ReminderStatus.WAITING : reminder.status,
        lastDetail: state.detail.slice(0, 300),
        checkCount: { increment: 1 },
        failCount: 0,
        lastCheckAt: now,
      },
    });
    return { ok: true, arrived: false, detail: state.detail };
  }

  async markTimeout(reminderId: string): Promise<void> {
    const reminder = await this.prisma.reminder.findUnique({ where: { id: reminderId } });
    if (!reminder || !ACTIVE_STATUSES.includes(reminder.status)) return;

    const now = new Date();
    await this.prisma.reminder.update({
      where: { id: reminderId },
      data: { status: ReminderStatus.TIMEOUT, finishedAt: now },
    });
    await this.addEvent(reminderId, EventLevel.WARN, '监控超时：设定时长内未检测到入柜');

    const user = await this.prisma.user.findUnique({ where: { id: reminder.userId } });
    if (!user) return;
    const notify = await this.notifications.notifyTimeout(reminder, user);
    await this.addEvent(reminderId, EventLevel.INFO, describeNotify(notify));
  }

  private async recordFailure(reminderId: string, message: string, expired = false): Promise<void> {
    const reminder = await this.prisma.reminder.update({
      where: { id: reminderId },
      data: { failCount: { increment: 1 }, lastCheckAt: new Date() },
    });
    await this.addEvent(reminderId, EventLevel.ERROR, `查询失败：${message.slice(0, 180)}`);
    if (expired) return;
    if (reminder.failCount > 0 && reminder.failCount % 5 === 0) {
      await this.audit.alert(
        'WARN',
        'REMINDER_QUERY_FAILING',
        `任务 ${reminderId.slice(0, 8)} 连续查询失败 ${reminder.failCount} 次：${message.slice(0, 120)}`,
      );
    }
  }

  private async addEvent(reminderId: string, level: EventLevel, message: string): Promise<void> {
    await this.prisma.reminderEvent.create({
      data: { reminderId, level, message: message.slice(0, 400) },
    });
  }

  /** 供调度器读取待查任务用。 */
  async deviceSn(): Promise<string> {
    return readSetting(this.prisma, SETTING_KEYS.lockerDeviceSn, '2680');
  }
}

function describeNotify(summary: NotifySummary): string {
  const parts: string[] = [];
  if (!summary.fcm.skipped) parts.push(`FCM 送达 ${summary.fcm.sent}`);
  else if (summary.fcm.reason) parts.push(`FCM 跳过（${summary.fcm.reason}）`);
  if (summary.ntfy.attempted) parts.push(`ntfy ${summary.ntfy.ok ? '成功' : `失败（${summary.ntfy.reason ?? '未知'}）`}`);
  if (summary.webpush.attempted) parts.push(`Web Push 送达 ${summary.webpush.sent}`);
  if (summary.sms.queued) parts.push('短信 已入队');
  else if (summary.sms.attempted) {
    parts.push(`短信 ${summary.sms.ok ? '已发送' : `失败（${summary.sms.reason ?? '未知'}）`}`);
  }
  return `通知结果：${parts.join('；') || '无可用通道'}`;
}
