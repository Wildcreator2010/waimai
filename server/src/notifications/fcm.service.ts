import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';
import { existsSync, readFileSync } from 'node:fs';

export interface PushResult {
  sent: number;
  invalidTokens: string[];
  skipped: boolean;
  reason?: string;
}

/**
 * FCM（HTTP v1）。凭据缺失时整体降级为「未启用」，不抛错、不影响 ntfy 与短信。
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger('FCM');
  private app: App | null = null;
  private initTried = false;

  constructor(private readonly config: ConfigService) {}

  /** 启动时就把「启用/未启用」写进日志，避免只有第一次发推送才知道状态。 */
  onModuleInit(): void {
    this.ensureInit();
  }

  isEnabled(): boolean {
    this.ensureInit();
    return this.app !== null;
  }

  async send(
    tokens: string[],
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<PushResult> {
    this.ensureInit();
    if (!this.app || tokens.length === 0) {
      return { sent: 0, invalidTokens: [], skipped: true, reason: 'FCM 未启用或没有设备令牌' };
    }

    const message: MulticastMessage = {
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: {
        priority: 'high',
        notification: { channelId: 'meal_arrival', defaultSound: true },
      },
    };

    try {
      const result = await getMessaging(this.app).sendEachForMulticast(message);
      const invalidTokens: string[] = [];
      result.responses.forEach((response, index) => {
        if (response.success) return;
        const code = response.error?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          invalidTokens.push(tokens[index]);
        }
      });
      return { sent: result.successCount, invalidTokens, skipped: false };
    } catch (error) {
      this.logger.warn(`FCM 发送失败：${(error as Error).message}`);
      return { sent: 0, invalidTokens: [], skipped: false, reason: (error as Error).message };
    }
  }

  private ensureInit(): void {
    if (this.initTried) return;
    this.initTried = true;

    const inline = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON', '');
    const path = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH', '');

    let raw = '';
    if (inline) {
      raw = inline;
    } else if (path && existsSync(path)) {
      raw = readFileSync(path, 'utf8');
    }

    if (!raw) {
      this.logger.log('FCM 未配置（无 service account），全部设备按 ntfy 处理');
      return;
    }

    try {
      const credentials = JSON.parse(raw) as Record<string, unknown>;
      const existing = getApps();
      this.app = existing.length > 0 ? existing[0] : initializeApp({ credential: cert(credentials as never) });
      this.logger.log(`FCM 已启用：project=${String(credentials.project_id ?? 'unknown')}`);
    } catch (error) {
      this.app = null;
      this.logger.error(`FCM 初始化失败（将降级为 ntfy）：${(error as Error).message}`);
    }
  }
}
