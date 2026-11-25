import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsStatus } from '@prisma/client';
import Dysmsapi, * as $Dysmsapi from '@alicloud/dysmsapi20170525';
import * as $OpenApi from '@alicloud/openapi-client';
import * as $Util from '@alicloud/tea-util';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { maskPhone } from '../auth/auth.service';

export interface SmsResult {
  ok: boolean;
  reason?: string;
}

const DAILY_LIMIT_PER_PHONE = 20;
const RETRYABLE = ['BUSINESS_LIMIT_CONTROL', 'THROTTLING', 'ServiceUnavailable', 'Timeout', 'ECONNRESET', 'socket hang up'];

/**
 * 阿里云短信（Dysmsapi 2017-05-25）。
 * 约束：
 * - 单号码 20 条/天硬限制，超限直接跳过并告警，不去撞阿里云限频
 * - 可重试错误最多 2 次，指数退避
 * - 日志与告警里手机号一律掩码
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('Sms');
  private readonly client: Dysmsapi | null;
  private readonly signName: string;
  private readonly templateArrival: string;
  private readonly templateVerify: string;
  private readonly dryRun: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    const akId = config.get<string>('ALIYUN_ACCESS_KEY_ID', '');
    const akSecret = config.get<string>('ALIYUN_ACCESS_KEY_SECRET', '');
    this.signName = config.get<string>('ALIYUN_SIGN_NAME', '');
    this.templateArrival = config.get<string>('ALIYUN_TEMPLATE_ARRIVAL', 'SMS_XXXXXXXX');
    this.templateVerify = config.get<string>('ALIYUN_TEMPLATE_VERIFY', '');
    this.dryRun = config.get<boolean>('ALIYUN_DRY_RUN', true);

    if (akId && akSecret && this.signName) {
      // 香港/海外服务器到阿里云杭州首字节可能要 10s+，SDK 默认超时（约 5s/10s）会误判为失败
      const openApiConfig = new $OpenApi.Config({
        accessKeyId: akId,
        accessKeySecret: akSecret,
        connectTimeout: 15000,
        readTimeout: 25000,
      });
      // Dysmsapi 2017-05-25 只有全局 endpoint；不要拼 dysmsapi.<region>.aliyuncs.com
      openApiConfig.endpoint = 'dysmsapi.aliyuncs.com';
      this.client = new Dysmsapi(openApiConfig);
      this.logger.log(
        `阿里云短信已配置（dry-run=${this.dryRun}，验证码模板=${this.templateVerify || '未配置'}）`,
      );
    } else {
      this.client = null;
      this.logger.warn('阿里云短信未配置（缺 AK 或签名），短信将跳过');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  canSendVerify(): boolean {
    return this.client !== null && Boolean(this.templateVerify);
  }

  /** 到柜通知：cabCode / SN / box_sn 三变量，固定模板。 */
  async sendArrival(input: {
    userId: string;
    phone: string;
    cabCode: string;
    boxSn: string;
    sn: string;
  }): Promise<SmsResult> {
    return this.send({
      userId: input.userId,
      phone: input.phone,
      template: this.templateArrival,
      params: { cabCode: input.cabCode, SN: input.sn, box_sn: input.boxSn },
      purpose: 'arrival',
    });
  }

  /** 手机号绑定验证码。 */
  async sendVerifyCode(phone: string, code: string, userId: string): Promise<SmsResult> {
    if (!this.templateVerify) {
      return { ok: false, reason: 'SMS_TEMPLATE_NOT_CONFIGURED' };
    }
    return this.send({
      userId,
      phone,
      template: this.templateVerify,
      params: { code },
      purpose: 'verify',
    });
  }

  /** 某号码今日已成功发送条数（用于配额判断与展示）。 */
  async sentToday(phone: string): Promise<number> {
    const start = startOfToday();
    return this.prisma.smsLog.count({
      where: { phone, status: SmsStatus.SENT, createdAt: { gte: start } },
    });
  }

  private async send(input: {
    userId: string | null;
    phone: string;
    template: string;
    params: Record<string, string>;
    purpose: string;
  }): Promise<SmsResult> {
    const phone = normalizePhone(input.phone);
    if (!phone) {
      await this.record(input, SmsStatus.FAILED, '', 'INVALID_PHONE', '手机号格式不正确');
      return { ok: false, reason: 'INVALID_PHONE' };
    }

    const used = await this.sentToday(phone);
    if (used >= DAILY_LIMIT_PER_PHONE) {
      await this.record(input, SmsStatus.SKIPPED, '', 'DAILY_LIMIT', '触发单号码日配额');
      await this.audit.alert(
        'WARN',
        'SMS_DAILY_LIMIT',
        `手机号 ${maskPhone(phone)} 今日短信已达 ${DAILY_LIMIT_PER_PHONE} 条上限，后续短信被跳过`,
      );
      return { ok: false, reason: 'DAILY_LIMIT' };
    }

    if (!this.client || this.dryRun) {
      this.logger.log(
        `[SMS-DRY-RUN] to=${maskPhone(phone)} template=${input.template} params=${JSON.stringify(input.params)}`,
      );
      await this.record(input, SmsStatus.SENT, 'dry-run', '', '');
      return { ok: true };
    }

    const request = new $Dysmsapi.SendSmsRequest({
      phoneNumbers: phone,
      signName: this.signName,
      templateCode: input.template,
      templateParam: JSON.stringify(input.params),
    });
    const runtime = new $Util.RuntimeOptions({});

    let lastError = '';
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      try {
        const response = await this.client.sendSmsWithOptions(request, runtime);
        const body = response.body;
        if (body?.code === 'OK') {
          await this.record(input, SmsStatus.SENT, body.bizId ?? '', '', '');
          return { ok: true };
        }
        lastError = `${body?.code ?? 'UNKNOWN'}: ${body?.message ?? ''}`;
        if (!isRetryable(body?.code ?? '')) break;
      } catch (error) {
        lastError = (error as Error).message;
        if (!isRetryable(lastError)) break;
      }
      await sleep(attempt === 0 ? 1000 : 3000);
    }

    this.logger.warn(`短信发送失败 to=${maskPhone(phone)} ${lastError}`);
    await this.record(input, SmsStatus.FAILED, '', lastError.slice(0, 120), lastError.slice(0, 240));
    const hint = lastError.includes('NoPermission')
      ? '（RAM 用户缺少 dysms:SendSms 权限，或策略未生效）'
      : lastError.includes('PORT_NOT_REGISTERED')
        ? '（签名未完成运营商实名报备）'
        : '';
    await this.audit.alert(
      'ERROR',
      'SMS_SEND_FAILED',
      `短信发送失败（${input.purpose}）：${maskPhone(phone)} ${lastError.slice(0, 120)}${hint}`,
    );
    return { ok: false, reason: lastError };
  }

  private async record(
    input: { userId: string | null; phone: string; template: string; params: Record<string, string> },
    status: SmsStatus,
    providerId: string,
    errorCode: string,
    errorMsg: string,
  ): Promise<void> {
    try {
      await this.prisma.smsLog.create({
        data: {
          userId: input.userId,
          phone: normalizePhone(input.phone) || input.phone,
          template: input.template,
          params: JSON.stringify(input.params),
          status,
          providerId: providerId.slice(0, 64),
          errorCode: errorCode.slice(0, 64),
          errorMsg: errorMsg.slice(0, 240),
        },
      });
    } catch (error) {
      this.logger.error(`短信流水写入失败：${(error as Error).message}`);
    }
  }
}

export function normalizePhone(input: string): string {
  const digits = String(input ?? '').replace(/[\s-]/g, '').replace(/^\+?86/, '');
  return /^1[3-9]\d{9}$/.test(digits) ? digits : '';
}

function isRetryable(codeOrMessage: string): boolean {
  return RETRYABLE.some((token) => codeOrMessage.includes(token));
}

function startOfToday(): Date {
  const now = new Date();
  // 以服务器本地时区（TZ 环境变量）为准
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
