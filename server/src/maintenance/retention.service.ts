import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

export interface RetentionResult {
  reminders: number;
  smsLogs: number;
  auditLogs: number;
  tokens: number;
  sessions: number;
}

const DAY = 24 * 3600_000;
/** 每日清理时间（服务器本地时区） */
const RUN_HOUR = 3;

/**
 * 数据保留清理（docs/architecture.md §10 / decisions D-12）。
 * - 提醒与事件：30 天（事件随任务级联删除）
 * - 短信流水与审计：90 天
 * - 过期/已消费的一次性令牌、过期或已撤销的 refresh 会话：7 天
 *
 * 说明：删除的是「已经结束」的历史，运行中的任务不受影响。
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Retention');
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  private readonly reminderDays: number;
  private readonly auditDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.reminderDays = Number(config.get<string | number>('RETENTION_REMINDER_DAYS', 30)) || 30;
    this.auditDays = Number(config.get<string | number>('RETENTION_AUDIT_DAYS', 90)) || 90;
  }

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV', 'development') === 'test') return;
    if (process.env.DISABLE_SCHEDULER === '1') return;
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** 立即执行一次清理，返回各表删除行数。 */
  async runOnce(now = new Date()): Promise<RetentionResult> {
    const reminderCutoff = new Date(now.getTime() - this.reminderDays * DAY);
    const auditCutoff = new Date(now.getTime() - this.auditDays * DAY);
    const housekeepingCutoff = new Date(now.getTime() - 7 * DAY);

    const [reminders, smsLogs, auditLogs, tokens, sessions] = await this.prisma.$transaction([
      this.prisma.reminder.deleteMany({ where: { createdAt: { lt: reminderCutoff } } }),
      this.prisma.smsLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
      this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
      this.prisma.verificationToken.deleteMany({
        where: {
          createdAt: { lt: housekeepingCutoff },
          OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: now } }],
        },
      }),
      this.prisma.refreshSession.deleteMany({
        where: {
          createdAt: { lt: housekeepingCutoff },
          OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: now } }],
        },
      }),
    ]);

    const result: RetentionResult = {
      reminders: reminders.count,
      smsLogs: smsLogs.count,
      auditLogs: auditLogs.count,
      tokens: tokens.count,
      sessions: sessions.count,
    };
    this.logger.log(
      `清理完成：任务 ${result.reminders}，短信 ${result.smsLogs}，审计 ${result.auditLogs}，令牌 ${result.tokens}，会话 ${result.sessions}`,
    );
    return result;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const delay = msUntilNextRun(new Date(), RUN_HOUR);
    this.timer = setTimeout(() => {
      void (async () => {
        try {
          await this.runOnce();
        } catch (error) {
          this.logger.error(`清理失败：${(error as Error).message}`);
        } finally {
          this.scheduleNext();
        }
      })();
    }, delay);
    this.logger.log(`下次数据清理约在 ${Math.round(delay / 3600_000)} 小时后`);
  }
}

/** 计算距离下一个 hour:00 的毫秒数（本地时区）。 */
export function msUntilNextRun(now: Date, hour: number): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}
