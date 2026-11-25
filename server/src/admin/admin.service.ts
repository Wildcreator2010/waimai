import { Injectable } from '@nestjs/common';
import {
  AlertLevel,
  ReminderStatus,
  Role,
  SmsStatus,
  UserStatus,
  type AdminAlert,
  type Prisma,
} from '@prisma/client';

import { Errors } from '../common/errors';
import type { AuthUser } from '../common/decorators';
import { paged, type Paged } from '../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { maskPhone } from '../auth/auth.service';
import { normalizePhone } from '../notifications/sms.service';
import type { AlertQueryDto, AuditQueryDto, SmsLogQueryDto } from './dto';

export interface AlertView {
  id: string;
  level: AlertLevel;
  type: string;
  message: string;
  createdAt: Date;
  ackedAt: Date | null;
  ackedById: string | null;
  ackedByEmail: string | null;
}

export interface AuditView {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  ip: string;
  createdAt: Date;
}

export interface SmsLogView {
  id: string;
  userId: string | null;
  userEmail: string | null;
  /** 永远掩码 */
  phone: string | null;
  template: string;
  params: Record<string, unknown>;
  status: SmsStatus;
  providerId: string;
  errorCode: string;
  errorMsg: string;
  createdAt: Date;
}

export interface OverviewView {
  users: { total: number; active: number; admins: number };
  reminders: { waiting: number; arrivedToday: number; timeoutToday: number };
  sms: { sentToday: number; failedToday: number };
  alerts: { unacked: number };
  locker: { configured: boolean; lastVerifyOk: boolean | null };
}

const ACTIVE_REMINDER_STATUSES = [
  ReminderStatus.PENDING,
  ReminderStatus.BASELINE,
  ReminderStatus.WAITING,
];

/**
 * 管理台只读视图 + 告警确认 + 概览聚合（docs/api.md §5.5 / §5.6）。
 * 这里不做任何写业务数据的操作，只有告警确认会落库（并写审计）。
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ 告警

  async listAlerts(query: AlertQueryDto): Promise<Paged<AlertView>> {
    const where: Prisma.AdminAlertWhereInput = {};
    if (query.acked === true) where.ackedAt = { not: null };
    else if (query.acked === false) where.ackedAt = null;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.adminAlert.findMany({
        where,
        include: { ackedBy: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.adminAlert.count({ where }),
    ]);

    return paged(rows.map(toAlertView), total, query);
  }

  async ackAlert(actor: AuthUser, id: string, ip: string): Promise<AlertView> {
    const alert = await this.prisma.adminAlert.findUnique({ where: { id } });
    if (!alert) throw Errors.notFound('告警不存在');

    // 幂等：已确认过就原样返回，不覆盖首次确认人
    if (alert.ackedAt) {
      const existing = await this.prisma.adminAlert.findUniqueOrThrow({
        where: { id },
        include: { ackedBy: { select: { email: true } } },
      });
      return toAlertView(existing);
    }

    const updated = await this.prisma.adminAlert.update({
      where: { id },
      data: { ackedAt: new Date(), ackedById: actor.id },
      include: { ackedBy: { select: { email: true } } },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'ALERT_ACK',
      targetType: 'alert',
      targetId: id,
      detail: `确认告警 ${alert.type}: ${alert.message.slice(0, 120)}`,
      ip,
    });

    return toAlertView(updated);
  }

  // ------------------------------------------------------------ 审计

  async listAudit(query: AuditQueryDto): Promise<Paged<AuditView>> {
    const where = this.auditWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paged(rows.map(toAuditView), total, query);
  }

  /** 导出用：不分页，最多 5000 条，避免一次拉爆内存。 */
  async exportAudit(query: AuditQueryDto): Promise<AuditView[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.auditWhere(query),
      include: { actor: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    return rows.map(toAuditView);
  }

  private auditWhere(query: AuditQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action.trim();
    if (query.actorId) where.actorId = query.actorId.trim();
    const range = createdAtRange(query.from, query.to);
    if (range) where.createdAt = range;
    return where;
  }

  // ------------------------------------------------------------ 短信流水

  async listSmsLogs(query: SmsLogQueryDto): Promise<Paged<SmsLogView>> {
    const where = this.smsWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.smsLog.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.smsLog.count({ where }),
    ]);

    return paged(rows.map(toSmsLogView), total, query);
  }

  /** 导出用：不分页，最多 5000 条。 */
  async exportSmsLogs(query: SmsLogQueryDto): Promise<SmsLogView[]> {
    const rows = await this.prisma.smsLog.findMany({
      where: this.smsWhere(query),
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    return rows.map(toSmsLogView);
  }

  private smsWhere(query: SmsLogQueryDto): Prisma.SmsLogWhereInput {
    const where: Prisma.SmsLogWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.phone) {
      // 精确匹配：库里的号码已归一化，这里同样归一化后再比；非法输入按原文匹配，避免静默变成"全部"
      const normalized = normalizePhone(query.phone);
      where.phone = normalized || query.phone.trim();
    }
    const range = createdAtRange(query.from, query.to);
    if (range) where.createdAt = range;
    return where;
  }

  // ------------------------------------------------------------ 概览

  async overview(): Promise<OverviewView> {
    const today = startOfToday();
    const todayHit = { gte: today };

    const [
      total,
      active,
      admins,
      waiting,
      arrivedToday,
      timeoutToday,
      sentToday,
      failedToday,
      unacked,
      credential,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { role: { in: [Role.ADMIN, Role.ROOT] } } }),
      this.prisma.reminder.count({ where: { status: { in: ACTIVE_REMINDER_STATUSES } } }),
      // 命中/超时以结束时间或通知时间落今日为准（调度器写 finishedAt，通知写 notifiedAt）
      this.prisma.reminder.count({
        where: {
          status: ReminderStatus.ARRIVED,
          OR: [{ finishedAt: todayHit }, { notifiedAt: todayHit }],
        },
      }),
      this.prisma.reminder.count({
        where: {
          status: ReminderStatus.TIMEOUT,
          OR: [{ finishedAt: todayHit }, { notifiedAt: todayHit }],
        },
      }),
      this.prisma.smsLog.count({ where: { status: SmsStatus.SENT, createdAt: todayHit } }),
      this.prisma.smsLog.count({ where: { status: SmsStatus.FAILED, createdAt: todayHit } }),
      this.prisma.adminAlert.count({ where: { ackedAt: null } }),
      this.prisma.lockerCredential.findUnique({
        where: { id: 1 },
        select: { lastVerifyOk: true },
      }),
    ]);

    return {
      users: { total, active, admins },
      reminders: { waiting, arrivedToday, timeoutToday },
      sms: { sentToday, failedToday },
      alerts: { unacked },
      locker: {
        configured: Boolean(credential),
        lastVerifyOk: credential?.lastVerifyOk ?? null,
      },
    };
  }
}

/** 服务器本地时区的今日 00:00（docs/api.md §5.6「今日」） */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * 时间区间 → Prisma 过滤条件，半开区间 `[from, to)`。
 * 只给日期（`YYYY-MM-DD`）时按本地时区解释，`to` 取次日零点，符合"查到今天为止"的直觉。
 */
function createdAtRange(from?: string, to?: string): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = parseBound(from, false);
  if (to) range.lt = parseBound(to, true);
  if (range.gte && range.lt && range.gte.getTime() >= range.lt.getTime()) {
    throw Errors.validation('from 必须早于 to');
  }
  return range;
}

function parseBound(value: string, endOfDay: boolean): Date {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, endOfDay ? day + 1 : day);
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw Errors.validation(`时间格式不正确：${text}`);
  return parsed;
}

function toAlertView(alert: AdminAlert & { ackedBy?: { email: string } | null }): AlertView {
  return {
    id: alert.id,
    level: alert.level,
    type: alert.type,
    message: alert.message,
    createdAt: alert.createdAt,
    ackedAt: alert.ackedAt,
    ackedById: alert.ackedById,
    ackedByEmail: alert.ackedBy?.email ?? null,
  };
}

function toAuditView(log: {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  ip: string;
  createdAt: Date;
  actor?: { email: string } | null;
}): AuditView {
  return {
    id: log.id,
    actorId: log.actorId,
    actorEmail: log.actor?.email ?? null,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    detail: log.detail,
    ip: log.ip,
    createdAt: log.createdAt,
  };
}

function toSmsLogView(log: {
  id: string;
  userId: string | null;
  phone: string;
  template: string;
  params: string;
  status: SmsStatus;
  providerId: string;
  errorCode: string;
  errorMsg: string;
  createdAt: Date;
  user?: { email: string } | null;
}): SmsLogView {
  return {
    id: log.id,
    userId: log.userId,
    userEmail: log.user?.email ?? null,
    phone: maskPhone(log.phone),
    template: log.template,
    params: parseParams(log.params),
    status: log.status,
    providerId: log.providerId,
    errorCode: log.errorCode,
    errorMsg: log.errorMsg,
    createdAt: log.createdAt,
  };
}

function parseParams(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
