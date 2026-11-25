import { Injectable } from '@nestjs/common';

/**
 * 进程内滑动窗口限频。单实例部署足够；多实例时需换 Redis（见 docs/decisions.md D-11）。
 * key 由调用方拼装（如 `login:email:a@b.com`），避免不同动作互相挤占。
 */
@Injectable()
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  /** 消耗一次配额；返回 true 表示放行，false 表示已超限。 */
  consume(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    this.sweep(now);
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  /** 剩余配额（用于响应头或调试）。 */
  remaining(key: string, limit: number, windowMs: number): number {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    return Math.max(0, limit - list.length);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** 每 10 分钟清一次过期键，防止内存无限增长。 */
  private sweep(now: number): void {
    if (now - this.lastSweep < 10 * 60_000) return;
    this.lastSweep = now;
    for (const [key, list] of this.hits) {
      const alive = list.filter((t) => now - t < 24 * 3600_000);
      if (alive.length === 0) this.hits.delete(key);
      else this.hits.set(key, alive);
    }
  }
}
