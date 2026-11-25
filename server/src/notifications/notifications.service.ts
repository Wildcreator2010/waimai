import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushMode, type Reminder, type User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { randomTopic } from '../common/crypto/tokens';
import { FcmService } from './fcm.service';
import { NtfyService } from './ntfy.service';
import { SmsQueueService } from './sms-queue.service';
import { WebPushService } from './webpush.service';

export interface NotifySummary {
  fcm: { sent: number; skipped: boolean; reason?: string };
  ntfy: { attempted: boolean; ok: boolean; reason?: string };
  /** 浏览器 Web Push */
  webpush: { attempted: boolean; sent: number; reason?: string };
  /** queued=true 表示已入队异步发送，最终结果看 SmsLog */
  sms: { attempted: boolean; ok: boolean; queued?: boolean; reason?: string };
}

/**
 * 通知分发。规则（docs/architecture.md §8）：
 * - 有 GMS 的设备走 FCM；无 GMS 的设备走 ntfy；用户开了 ntfyEnabled 时即使有 FCM 也发一份
 * - 已绑定手机号且未关闭短信 → 必发短信；未绑定 → 只推送
 * - 任何一条通道失败都不影响其他通道，失败原因进事件流
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notify');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly fcm: FcmService,
    private readonly ntfy: NtfyService,
    private readonly webpush: WebPushService,
    private readonly smsQueue: SmsQueueService,
  ) {}

  async notifyArrival(reminder: Reminder, user: User): Promise<NotifySummary> {
    const showDetails = user.showNotifyDetails;
    const title = '外卖已入柜';
    const body = showDetails
      ? `柜号 ${reminder.cabinet || '未知'} · 取餐码 ${reminder.pickupCode}`
      : '外卖到了，打开 App 查看柜号与取餐码';
    return this.deliver(user, reminder.id, {
      title,
      body,
      kind: 'arrival',
      withSms: true,
      smsContext: { cabCode: reminder.cabCode, boxSn: reminder.cabinet },
    });
  }

  async notifyTimeout(reminder: Reminder, user: User): Promise<NotifySummary> {
    const title = '外卖提醒超时';
    const body = `取餐码 ${reminder.pickupCode} 在 ${reminder.durationMin} 分钟内未检测到入柜，请手动确认`;
    return this.deliver(user, reminder.id, {
      title,
      body,
      kind: 'timeout',
      withSms: true,
      smsContext: { cabCode: reminder.cabCode, boxSn: reminder.cabinet },
    });
  }

  /** 管理台「发送测试推送」：只走 FCM + ntfy，不发短信（避免产生费用）。 */
  async sendTest(user: User): Promise<NotifySummary> {
    return this.deliver(user, 'test', {
      title: '测试推送',
      body: '收到这条通知说明推送通道可用',
      kind: 'arrival',
      withSms: false,
      smsContext: { cabCode: '', boxSn: '' },
    });
  }

  private async deliver(
    user: User,
    reminderId: string,
    content: {
      title: string;
      body: string;
      kind: 'arrival' | 'timeout';
      withSms: boolean;
      smsContext: { cabCode: string; boxSn: string };
    },
  ): Promise<NotifySummary> {
    const summary: NotifySummary = {
      fcm: { sent: 0, skipped: true },
      ntfy: { attempted: false, ok: false },
      webpush: { attempted: false, sent: 0 },
      sms: { attempted: false, ok: false },
    };

    const devices = await this.prisma.device.findMany({ where: { userId: user.id } });
    const fcmTokens = devices
      .filter((d) => d.pushMode === PushMode.FCM && d.fcmToken)
      .map((d) => d.fcmToken as string);
    const hasNtfyDevice = devices.some((d) => d.pushMode === PushMode.NTFY);

    // ---- FCM ----
    if (fcmTokens.length > 0 && this.fcm.isEnabled()) {
      const result = await this.fcm.send(fcmTokens, {
        title: content.title,
        body: content.body,
        data: { type: content.kind, reminderId },
      });
      summary.fcm = { sent: result.sent, skipped: result.skipped, reason: result.reason };
      if (result.invalidTokens.length > 0) {
        await this.prisma.device.deleteMany({ where: { fcmToken: { in: result.invalidTokens } } });
        this.logger.log(`清理失效 FCM 令牌 ${result.invalidTokens.length} 个`);
      }
    } else if (fcmTokens.length > 0) {
      summary.fcm = { sent: 0, skipped: true, reason: 'FCM 未启用' };
    }

    // ---- ntfy（服务端 publish；客户端另可主动订阅）----
    if (user.ntfyEnabled || hasNtfyDevice) {
      const topic = user.ntfyTopic || (await this.ensureTopic(user.id));
      const serverUrl = await this.setting('ntfyServerUrl', this.config.get<string>('NTFY_SERVER_URL', 'http://127.0.0.1:8080'));
      const result = await this.ntfy.publish({
        serverUrl,
        topic,
        title: content.title,
        message: content.body,
        priority: content.kind === 'arrival' ? 'high' : 'default',
      });
      summary.ntfy = { attempted: true, ok: result.ok, reason: result.reason };
    }

    // ---- 浏览器 Web Push（有订阅就发，不影响其它通道）----
    try {
      const result = await this.webpush.sendToUser(user.id, {
        title: content.title,
        body: content.body,
        url: reminderId === 'test' ? '/settings' : `/reminders/${reminderId}`,
        tag: `meal-${reminderId}`,
      });
      summary.webpush = { attempted: result.attempted, sent: result.sent, reason: result.reason };
    } catch (error) {
      summary.webpush = { attempted: true, sent: 0, reason: (error as Error).message };
    }

    // ---- 短信：已绑定且开启 → 必发，但走异步队列，不阻塞主流程 ----
    if (content.withSms && user.phone && user.phoneVerifiedAt && user.smsEnabled) {
      void this.smsQueue.enqueue({
        userId: user.id,
        phone: user.phone,
        cabCode: content.smsContext.cabCode,
        boxSn:
          content.kind === 'arrival'
            ? content.smsContext.boxSn
            : content.smsContext.boxSn || '未入柜',
        sn: await this.setting('lockerDeviceSn', this.config.get<string>('LOCKER_DEVICE_SN', '2680')),
        kind: content.kind,
        reminderId,
      });
      summary.sms = { attempted: true, ok: true, queued: true };
    }

    return summary;
  }

  private async ensureTopic(userId: string): Promise<string> {
    const topic = randomTopic();
    await this.prisma.user.update({ where: { id: userId }, data: { ntfyTopic: topic } });
    return topic;
  }

  private async setting(key: string, fallback: string): Promise<string> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row?.value || fallback;
  }
}
