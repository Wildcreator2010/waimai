import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/errors';
import { maskSecret, open, seal } from '../common/crypto/aes';
import { LockerClient } from './locker.client';

const CREDENTIAL_ID = 1;

export interface CredentialStatus {
  configured: boolean;
  masked: string;
  updatedAt: Date | null;
  updatedBy: string;
  lastVerifiedAt: Date | null;
  lastVerifyOk: boolean | null;
  lastVerifyMessage: string;
}

/**
 * MemberToken 保管。
 * - 加密入库（AES-256-GCM），密钥只在环境变量里
 * - 任何接口都不返回明文，只回掩码
 * - 每次变更写审计；401 时标记失效并触发告警
 */
@Injectable()
export class CredentialService {
  private readonly logger = new Logger('Credential');
  private readonly encKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly locker: LockerClient,
    private readonly audit: AuditService,
  ) {
    this.encKey = config.get<string>('MEMBER_TOKEN_ENC_KEY', '');
  }

  async getToken(): Promise<string | null> {
    const row = await this.prisma.lockerCredential.findUnique({ where: { id: CREDENTIAL_ID } });
    if (!row) return null;
    try {
      return open({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag }, this.encKey);
    } catch (error) {
      this.logger.error(`MemberToken 解密失败：${(error as Error).message}`);
      return null;
    }
  }

  async status(): Promise<CredentialStatus> {
    const row = await this.prisma.lockerCredential.findUnique({
      where: { id: CREDENTIAL_ID },
      include: { updatedBy: { select: { email: true } } },
    });
    if (!row) {
      return {
        configured: false,
        masked: '',
        updatedAt: null,
        updatedBy: '',
        lastVerifiedAt: null,
        lastVerifyOk: null,
        lastVerifyMessage: '',
      };
    }
    return {
      configured: true,
      masked: row.masked,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy?.email ?? '',
      lastVerifiedAt: row.lastVerifiedAt,
      lastVerifyOk: row.lastVerifyOk,
      lastVerifyMessage: row.lastVerifyMessage,
    };
  }

  /** 更新凭证：入库 → 立刻验证 → 审计。验证失败也保存，但把结果如实返回。 */
  async update(
    token: string,
    actorId: string,
    ip: string,
  ): Promise<{ status: CredentialStatus; verify: { ok: boolean; message: string } }> {
    const trimmed = String(token ?? '').trim();
    if (trimmed.length < 8) throw Errors.validation('MemberToken 长度不足');
    if (/\s/.test(trimmed)) throw Errors.validation('MemberToken 不能包含空白字符');

    const sealed = seal(trimmed, this.encKey);
    const masked = maskSecret(trimmed);
    const cabCode = await this.lockerCabCode();

    const verify = await this.locker.verify(trimmed, cabCode);
    if (verify.ok) this.locker.resetCache();

    await this.prisma.lockerCredential.upsert({
      where: { id: CREDENTIAL_ID },
      create: {
        id: CREDENTIAL_ID,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        masked,
        updatedById: actorId,
        lastVerifiedAt: new Date(),
        lastVerifyOk: verify.ok,
        lastVerifyMessage: verify.message.slice(0, 240),
      },
      update: {
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        masked,
        updatedById: actorId,
        lastVerifiedAt: new Date(),
        lastVerifyOk: verify.ok,
        lastVerifyMessage: verify.message.slice(0, 240),
      },
    });

    await this.audit.record({
      actorId,
      action: 'MEMBER_TOKEN_UPDATE',
      targetType: 'locker_credential',
      targetId: String(CREDENTIAL_ID),
      detail: `更新 MemberToken（${masked}），验证结果：${verify.ok ? '有效' : verify.message}`,
      ip,
    });

    return { status: await this.status(), verify };
  }

  /** 用当前凭证做一次真实探测，并回写结果。 */
  async verifyNow(actorId: string, ip: string): Promise<{ ok: boolean; message: string }> {
    const token = await this.getToken();
    if (!token) throw Errors.conflict('MEMBER_TOKEN_MISSING', '尚未配置 MemberToken');

    const verify = await this.locker.verify(token, await this.lockerCabCode());
    if (verify.ok) this.locker.resetCache();

    await this.prisma.lockerCredential.update({
      where: { id: CREDENTIAL_ID },
      data: {
        lastVerifiedAt: new Date(),
        lastVerifyOk: verify.ok,
        lastVerifyMessage: verify.message.slice(0, 240),
      },
    });
    await this.audit.record({
      actorId,
      action: 'MEMBER_TOKEN_VERIFY',
      targetType: 'locker_credential',
      targetId: String(CREDENTIAL_ID),
      detail: verify.ok ? '凭证有效' : `凭证无效：${verify.message}`,
      ip,
    });
    return verify;
  }

  /** 轮询遇到 401：标记失效并告警（告警内部有 30 分钟去重）。 */
  async markInvalid(message: string): Promise<void> {
    await this.prisma.lockerCredential
      .update({
        where: { id: CREDENTIAL_ID },
        data: { lastVerifiedAt: new Date(), lastVerifyOk: false, lastVerifyMessage: message.slice(0, 240) },
      })
      .catch(() => undefined);
    await this.audit.alert('ERROR', 'MEMBER_TOKEN_INVALID', `MemberToken 已失效：${message}`);
  }

  /**
   * openMark 要的是二维码里的柜机编号（如 SYA61026AP），不是设备 SN（2680）。
   * 用错会返回「设备不存在」。
   */
  private async lockerCabCode(): Promise<string> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: 'defaultLockerCabCode' },
    });
    return row?.value || 'SYA61026AP';
  }
}
