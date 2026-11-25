import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush, { type PushSubscription as WebPushTarget } from 'web-push';

import { PrismaService } from '../prisma/prisma.service';

export interface WebPushPayload {
  title: string;
  body: string;
  /** 点击通知后打开的站内路径 */
  url: string;
  tag?: string;
}

export interface WebPushResult {
  attempted: boolean;
  sent: number;
  removed: number;
  reason?: string;
}

/**
 * 浏览器 Web Push。
 *
 * 说明：
 * - 用 VAPID 自签名，不需要任何第三方账号；密钥由 `web-push generate-vapid-keys` 生成
 * - 浏览器推送最终由浏览器厂商的推送服务转发（Chrome 走 FCM、Edge 走 WNS、Firefox 走 Mozilla），
 *   因此**国内网络下 Chrome/Edge 的 Web Push 可能不可达**，这是通道本身的限制，不是配置问题
 * - endpoint 失效（404/410）时自动删除该订阅
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger('WebPush');
  private readonly enabled: boolean;
  private readonly publicKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.publicKey = config.get<string>('WEBPUSH_PUBLIC_KEY', '');
    const privateKey = config.get<string>('WEBPUSH_PRIVATE_KEY', '');
    const subject = config.get<string>('WEBPUSH_SUBJECT', 'mailto:admin@example.com');

    if (this.publicKey && privateKey) {
      try {
        webpush.setVapidDetails(subject, this.publicKey, privateKey);
        this.enabled = true;
        this.logger.log(`Web Push 已启用（subject=${subject}）`);
      } catch (error) {
        this.enabled = false;
        this.logger.error(`Web Push 初始化失败：${(error as Error).message}`);
      }
    } else {
      this.enabled = false;
      this.logger.log('Web Push 未配置（缺 VAPID 密钥），浏览器推送跳过');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getPublicKey(): string {
    return this.enabled ? this.publicKey : '';
  }

  async subscribe(
    userId: string,
    input: { endpoint: string; p256dh: string; auth: string; userAgent?: string },
  ): Promise<{ id: string }> {
    const row = await this.prisma.webPushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: (input.userAgent ?? '').slice(0, 256),
      },
      update: {
        // 同一 endpoint 可能换了账号（同浏览器换人登录），归属跟到当前用户
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: (input.userAgent ?? '').slice(0, 256),
      },
    });
    return { id: row.id };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<{ deleted: boolean }> {
    const result = await this.prisma.webPushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { deleted: result.count > 0 };
  }

  async list(userId: string) {
    const rows = await this.prisma.webPushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastUsedAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      // endpoint 里含推送服务商地址与令牌，只回显域名前缀
      endpointHost: safeHost(row.endpoint),
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    }));
  }

  /** 给该用户所有浏览器订阅发一条通知；返回送达数与清理数。 */
  async sendToUser(userId: string, payload: WebPushPayload): Promise<WebPushResult> {
    if (!this.enabled) {
      return { attempted: false, sent: 0, removed: 0, reason: 'Web Push 未配置' };
    }

    const subs = await this.prisma.webPushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) {
      return { attempted: false, sent: 0, removed: 0, reason: '该用户没有浏览器订阅' };
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag ?? 'meal-reminder',
    });

    let sent = 0;
    const dead: string[] = [];
    await Promise.all(
      subs.map(async (sub) => {
        const target: WebPushTarget = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(target, body, { TTL: 3600, timeout: 8000 });
          sent += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            dead.push(sub.id);
          } else {
            this.logger.warn(`Web Push 发送失败（status=${status ?? '?'}）：${(error as Error).message}`);
          }
        }
      }),
    );

    if (dead.length > 0) {
      await this.prisma.webPushSubscription.deleteMany({ where: { id: { in: dead } } });
    }
    if (sent > 0) {
      await this.prisma.webPushSubscription.updateMany({
        where: { userId },
        data: { lastUsedAt: new Date() },
      });
    }

    return { attempted: true, sent, removed: dead.length };
  }
}

function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return '(invalid)';
  }
}
