import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';

export interface ArrivalSmsJob {
  userId: string;
  phone: string;
  cabCode: string;
  boxSn: string;
  sn: string;
  /** 仅用于日志区分：arrival / timeout */
  kind: 'arrival' | 'timeout';
  reminderId: string;
}

/**
 * 短信发送队列（落库，重启不丢）。
 *
 * 为什么：香港到阿里云杭州首字节 2–15 秒，同步等待会拖住调度器。
 *
 * 状态机：PENDING → SENDING → SENT / FAILED
 * - 入队先写库，再唤醒 worker，进程崩溃后未发的任务仍在库里
 * - 启动时：PENDING 继续发；停留在 SENDING 的视为「结果未知」，标 FAILED 但**不重发**，
 *   避免重复扣费与重复打扰（宁可漏一条也不重复发）
 * - 并发 2；worker 排空即退出，下一次入队再唤醒，不做空转轮询
 */
@Injectable()
export class SmsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SmsQueue');
  private readonly concurrency = 2;
  private workers = 0;
  private stopped = false;
  private sentOk = 0;
  private sentFail = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    // 上次进程退出时卡在 SENDING 的，无法判断是否已发出，标记失败且不重发
    const stale = await this.prisma.smsJob.updateMany({
      where: { status: 'SENDING' },
      data: {
        status: 'FAILED',
        lastError: '进程重启，发送结果未知（为避免重复不重发）',
        processedAt: new Date(),
      },
    });
    if (stale.count > 0) {
      this.logger.warn(`恢复队列：${stale.count} 条 SENDING 任务标记为 FAILED（不重发）`);
    }
    this.drain();
  }

  /** 入队即返回；写库失败只记日志，不影响主流程。 */
  async enqueue(job: ArrivalSmsJob): Promise<void> {
    if (this.stopped) {
      this.logger.warn('队列已停止，丢弃一条短信任务');
      return;
    }
    try {
      await this.prisma.smsJob.create({
        data: {
          userId: job.userId,
          phone: job.phone,
          cabCode: job.cabCode,
          boxSn: job.boxSn,
          sn: job.sn,
          kind: job.kind,
          reminderId: job.reminderId,
          status: 'PENDING',
        },
      });
    } catch (error) {
      this.logger.error(`短信入队失败：${(error as Error).message}`);
      return;
    }
    this.drain();
  }

  /** 当前在跑的 worker 数（观测用）。 */
  get activeWorkers(): number {
    return this.workers;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    const deadline = Date.now() + 20_000;
    while (this.workers > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (this.workers > 0) {
      this.logger.warn(`退出时仍有 ${this.workers} 个 worker 在处理短信`);
    }
  }

  private drain(): void {
    while (!this.stopped && this.workers < this.concurrency) {
      this.workers += 1;
      void this.worker().finally(() => {
        this.workers -= 1;
      });
    }
  }

  private async worker(): Promise<void> {
    for (;;) {
      if (this.stopped) return;
      const job = await this.claim();
      if (!job) return;
      await this.process(job);
    }
  }

  /** 抢占一条待发任务：条件更新保证多 worker 不会重复处理。 */
  private async claim() {
    try {
      const next = await this.prisma.smsJob.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      if (!next) return null;
      const claimed = await this.prisma.smsJob.updateMany({
        where: { id: next.id, status: 'PENDING' },
        data: { status: 'SENDING' },
      });
      return claimed.count === 1 ? next : null;
    } catch (error) {
      this.logger.error(`领取短信任务失败：${(error as Error).message}`);
      return null;
    }
  }

  private async process(job: {
    id: string;
    userId: string | null;
    phone: string;
    cabCode: string;
    boxSn: string;
    sn: string;
    kind: string;
    reminderId: string;
    attempts: number;
  }): Promise<void> {
    const started = Date.now();
    try {
      const result = await this.sms.sendArrival({
        userId: job.userId ?? '',
        phone: job.phone,
        cabCode: job.cabCode,
        boxSn: job.boxSn,
        sn: job.sn,
      });
      const elapsed = Date.now() - started;
      await this.prisma.smsJob.update({
        where: { id: job.id },
        data: {
          status: result.ok ? 'SENT' : 'FAILED',
          attempts: { increment: 1 },
          lastError: (result.reason ?? '').slice(0, 240),
          processedAt: new Date(),
        },
      });
      if (result.ok) {
        this.sentOk += 1;
        this.logger.log(`短信已发送（${job.kind}，${elapsed}ms）reminder=${job.reminderId.slice(0, 8)}`);
      } else {
        this.sentFail += 1;
        this.logger.warn(`短信发送失败（${job.kind}，${elapsed}ms）${result.reason ?? ''}`);
      }
    } catch (error) {
      this.sentFail += 1;
      const message = (error as Error).message.slice(0, 240);
      this.logger.error(`短信任务异常：${message}`);
      await this.prisma.smsJob
        .update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            attempts: { increment: 1 },
            lastError: message,
            processedAt: new Date(),
          },
        })
        .catch(() => undefined);
      await this.audit.alert('ERROR', 'SMS_JOB_CRASHED', `短信任务异常：${message}`);
    }
  }

  /** 统计（观测用）。 */
  stats(): { sentOk: number; sentFail: number; workers: number } {
    return { sentOk: this.sentOk, sentFail: this.sentFail, workers: this.workers };
  }
}
