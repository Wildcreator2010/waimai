import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReminderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { readIntSetting, SETTING_KEYS } from '../common/setting-reader';
import { ReminderRunner } from './reminder-runner.service';

/** 单实例调度锁的固定 key（多实例部署时靠它避免重复查询，见 decisions D-11）。 */
const ADVISORY_LOCK_KEY = 823_451;
const MAX_CONCURRENCY = 20;

/**
 * 进程内轮询调度器。
 * - 间隔取 SystemSetting.pollIntervalSec（默认 60s，下限 10s）
 * - 每轮最多 20 个任务并行，避免打爆取餐柜接口
 * - 用 Postgres advisory lock 保证同一时刻只有一个实例在跑
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Scheduler');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: ReminderRunner,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV', 'development') === 'test') return;
    if (process.env.DISABLE_SCHEDULER === '1') {
      this.logger.warn('调度器已禁用（DISABLE_SCHEDULER=1）');
      return;
    }
    this.scheduleNext(3_000);
    this.logger.log('轮询调度器已启动');
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(delayMs?: number): void {
    if (this.stopped) return;
    const run = async () => {
      if (this.stopped) return;
      let intervalSec = 60;
      try {
        await this.tick();
      } catch (error) {
        this.logger.error(`调度轮次异常：${(error as Error).message}`);
      } finally {
        try {
          intervalSec = await readIntSetting(
            this.prisma,
            SETTING_KEYS.pollIntervalSec,
            60,
            10,
            3600,
          );
        } catch {
          intervalSec = 60;
        }
        this.scheduleNext(intervalSec * 1000);
      }
    };
    this.timer = setTimeout(() => void run(), delayMs ?? 60_000);
  }

  /** 执行一轮。导出为 public 便于测试与手工触发。 */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let locked = false;
    try {
      locked = await this.acquireLock();
      if (!locked) {
        this.logger.debug('另一个实例持有调度锁，本轮跳过');
        return;
      }

      const tasks = await this.prisma.reminder.findMany({
        where: {
          status: { in: [ReminderStatus.PENDING, ReminderStatus.BASELINE, ReminderStatus.WAITING] },
        },
        select: { id: true, endsAt: true },
        orderBy: { endsAt: 'asc' },
        take: 500,
      });
      if (tasks.length === 0) return;

      const now = Date.now();
      for (let i = 0; i < tasks.length; i += MAX_CONCURRENCY) {
        const chunk = tasks.slice(i, i + MAX_CONCURRENCY);
        await Promise.all(
          chunk.map(async (task) => {
            try {
              if (task.endsAt.getTime() <= now) {
                await this.runner.markTimeout(task.id);
              } else {
                await this.runner.check(task.id);
              }
            } catch (error) {
              this.logger.warn(`任务 ${task.id} 处理失败：${(error as Error).message}`);
            }
          }),
        );
      }
    } finally {
      if (locked) await this.releaseLock();
      this.running = false;
    }
  }

  private async acquireLock(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
        `SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`,
      );
      return Boolean(rows[0]?.locked);
    } catch {
      // 非 Postgres（如测试环境）时退化为单进程语义
      return true;
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      await this.prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
    } catch {
      /* 忽略：连接断开时锁会自动释放 */
    }
  }
}
