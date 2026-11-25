import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  PushMode,
  Role,
  TokenPurpose,
  UserStatus,
  type Device,
  type User,
} from '@prisma/client';

import { AppError, Errors } from '../common/errors';
import type { AuthUser } from '../common/decorators';
import { paged, type Paged } from '../common/dto/pagination.dto';
import { assertPasswordStrength, hashPassword, verifyPassword } from '../common/crypto/password';
import { randomNumericCode, randomTopic, sha256Hex } from '../common/crypto/tokens';
import { RateLimiter } from '../common/rate-limit';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService, normalizePhone } from '../notifications/sms.service';
import { SETTING_DEFS } from '../settings/setting-keys';
import { SystemSettingService } from '../settings/settings.service';
import { maskPhone, toPublicUser } from '../auth/auth.service';
import type {
  AdminUserQueryDto,
  CreateUserDto,
  RegisterDeviceDto,
  RequestPhoneCodeDto,
  UpdateMySettingsDto,
  UpdateUserDto,
  VerifyPhoneDto,
} from './dto';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** 手机号验证码有效期 5 分钟（docs/api.md §3） */
const PHONE_CODE_TTL_MINUTES = 5;
const PHONE_CODE_MAX_PER_DAY = 5;

export interface MeSettingsView {
  showNotifyDetails: boolean;
  smsEnabled: boolean;
  ntfyEnabled: boolean;
  phone: string | null;
  phoneVerified: boolean;
  ntfyTopic: string | null;
  ntfyServerUrl: string;
  smsAvailable: boolean;
  /** 建任务表单预填值：柜机编号、默认时长与上限 */
  defaultCabCode: string;
  defaultDurationMin: number;
  maxDurationMin: number;
}

export interface DeviceView {
  id: string;
  name: string;
  platform: string;
  pushMode: PushMode;
  fcmToken: string | null;
  appVersion: string;
  createdAt: Date;
  lastSeenAt: Date;
}

export type AdminUserView = ReturnType<typeof toPublicUser>;

/**
 * 账号相关：本人设置、手机号绑定、ntfy、设备，以及管理员用户管理。
 *
 * 两条硬规则贯穿全文件：
 * 1. 所有「按 id 操作」的用户接口都带 `userId` 条件（`deleteMany` / `updateMany` 或先查后校验），
 *    绝不只按 id 命中别人的数据。
 * 2. 对外对象一律 `toPublicUser`（手机号掩码、无 passwordHash/passwordSalt）。
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger('Users');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------ 当前用户设置

  async meSettings(actor: AuthUser): Promise<MeSettingsView> {
    const user = await this.requireUser(actor.id);
    // 新账号还没有 topic：读取时懒生成，保证 App 冷启动一定能拿到可订阅的 topic
    const topic = user.ntfyTopic ?? (await this.ensureNtfyTopic(user.id));
    return {
      showNotifyDetails: user.showNotifyDetails,
      smsEnabled: user.smsEnabled,
      ntfyEnabled: user.ntfyEnabled,
      phone: maskPhone(user.phone),
      phoneVerified: Boolean(user.phoneVerifiedAt),
      ntfyTopic: topic,
      ntfyServerUrl: await this.ntfyServerUrl(),
      smsAvailable: this.sms.canSendVerify(),
      defaultCabCode: await this.settings.getString(
        'defaultLockerCabCode',
        SETTING_DEFS.defaultLockerCabCode.default,
      ),
      defaultDurationMin: await this.settings.getInt(
        'defaultDurationMin',
        SETTING_DEFS.defaultDurationMin.default,
      ),
      maxDurationMin: await this.settings.getInt(
        'maxDurationMin',
        SETTING_DEFS.maxDurationMin.default,
      ),
    };
  }

  async updateMySettings(actor: AuthUser, dto: UpdateMySettingsDto): Promise<MeSettingsView> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.showNotifyDetails !== undefined) data.showNotifyDetails = dto.showNotifyDetails;
    if (dto.smsEnabled !== undefined) data.smsEnabled = dto.smsEnabled;
    if (dto.ntfyEnabled !== undefined) data.ntfyEnabled = dto.ntfyEnabled;
    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({ where: { id: actor.id }, data });
    }
    return this.meSettings(actor);
  }

  // ------------------------------------------------------------ 注销自己

  /**
   * 注销当前账号：需要密码确认，ROOT 不允许自我注销（否则系统会失去根账号）。
   * 级联删除：任务、事件、设备、会话、验证令牌（Prisma onDelete: Cascade）。
   */
  async deleteSelf(actor: AuthUser, password: string): Promise<{ deleted: true }> {
    if (actor.role === Role.ROOT) {
      throw Errors.conflict('ROOT_CANNOT_DELETE_SELF', '初始管理员不能注销自己，请先转让 ROOT');
    }
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) throw Errors.notFound('账号不存在');

    const ok = await verifyPassword(password, {
      passwordHash: user.passwordHash,
      passwordSalt: user.passwordSalt,
      passwordIterations: user.passwordIterations,
    });
    if (!ok) throw new AppError('INVALID_CREDENTIALS', '密码不正确', 401);

    await this.audit.record({
      actorId: user.id,
      action: 'ACCOUNT_SELF_DELETE',
      targetType: 'user',
      targetId: user.id,
      detail: `用户自行注销：${user.email}`,
    });
    await this.prisma.user.delete({ where: { id: user.id } });
    return { deleted: true };
  }

  // ------------------------------------------------------------ 手机号绑定

  async requestPhoneCode(
    actor: AuthUser,
    dto: RequestPhoneCodeDto,
  ): Promise<{ status: 'ACCEPTED'; phone: string; expiresInSec: number }> {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw Errors.validation('手机号格式不正确');

    // 模板没配就别浪费用户一次配额
    if (!this.sms.canSendVerify()) {
      throw new AppError(
        'SMS_TEMPLATE_NOT_CONFIGURED',
        '短信验证码模板未配置，暂时无法发送验证码',
        503,
      );
    }

    if (!this.limiter.consume(`phone-code:60s:${phone}`, 1, MINUTE)) {
      throw Errors.tooMany('验证码已发送，请 60 秒后再试');
    }
    if (!this.limiter.consume(`phone-code:day:${phone}`, PHONE_CODE_MAX_PER_DAY, DAY)) {
      throw Errors.tooMany('该手机号今日验证码次数已达上限');
    }
    if (!this.limiter.consume(`phone-code:user:${actor.id}`, PHONE_CODE_MAX_PER_DAY, DAY)) {
      throw Errors.tooMany('今日验证码次数已达上限');
    }

    const holder = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (holder && holder.id !== actor.id) {
      throw Errors.conflict('PHONE_TAKEN', '该手机号已被其他账号绑定');
    }

    const code = randomNumericCode(6);
    const tokenHash = sha256Hex(`${actor.id}:${phone}:${code}`);
    const expiresAt = new Date(Date.now() + PHONE_CODE_TTL_MINUTES * MINUTE);

    // 同一用户只保留最新一条有效验证码，旧码立即作废（避免多码并行猜解）
    await this.prisma.verificationToken.updateMany({
      where: { userId: actor.id, purpose: TokenPurpose.PHONE_VERIFY, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const record = await this.prisma.verificationToken.create({
      data: {
        userId: actor.id,
        purpose: TokenPurpose.PHONE_VERIFY,
        tokenHash,
        meta: phone,
        expiresAt,
      },
    });

    const sent = await this.sms.sendVerifyCode(phone, code, actor.id);
    if (!sent.ok) {
      // 发不出去的码不留存，否则库里躺着一条"有效但用户不知道"的令牌
      await this.prisma.verificationToken
        .delete({ where: { id: record.id } })
        .catch(() => undefined);
      this.logger.warn(
        `验证码发送失败 user=${actor.id} phone=${maskPhone(phone)} reason=${sent.reason ?? 'unknown'}`,
      );
      throw new AppError('SMS_SEND_FAILED', '验证码短信发送失败，请稍后重试', 503);
    }

    this.logger.log(`已发送手机号验证码 user=${actor.id} phone=${maskPhone(phone)}`);
    return {
      status: 'ACCEPTED',
      phone: maskPhone(phone) ?? phone,
      expiresInSec: PHONE_CODE_TTL_MINUTES * 60,
    };
  }

  async verifyPhone(
    actor: AuthUser,
    dto: VerifyPhoneDto,
  ): Promise<{ phone: string | null; phoneVerified: boolean; phoneVerifiedAt: Date | null }> {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw Errors.validation('手机号格式不正确');
    // 6 位数字码必须限次，否则可暴力枚举
    if (!this.limiter.consume(`phone-verify:${actor.id}`, 10, 10 * MINUTE)) {
      throw Errors.tooMany('验证码错误次数过多，请稍后再试');
    }

    const tokenHash = sha256Hex(`${actor.id}:${phone}:${dto.code}`);
    const record = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });
    if (
      !record ||
      record.purpose !== TokenPurpose.PHONE_VERIFY ||
      record.consumedAt ||
      record.meta !== phone ||
      record.userId !== actor.id
    ) {
      throw new AppError('CODE_INVALID', '验证码不正确', 400);
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new AppError('CODE_EXPIRED', '验证码已过期，请重新获取', 400);
    }

    const holder = await this.prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (holder && holder.id !== actor.id) {
      throw Errors.conflict('PHONE_TAKEN', '该手机号已被其他账号绑定');
    }

    let updated: User;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        await tx.verificationToken.update({
          where: { id: record.id },
          data: { consumedAt: new Date() },
        });
        return tx.user.update({
          where: { id: actor.id },
          data: { phone, phoneVerifiedAt: new Date() },
        });
      });
    } catch (error) {
      // 并发下唯一约束兜底：两个账号同时绑同一号码
      if (isUniqueViolation(error)) {
        throw Errors.conflict('PHONE_TAKEN', '该手机号已被其他账号绑定');
      }
      throw error;
    }

    this.logger.log(`手机号已绑定 user=${actor.id} phone=${maskPhone(phone)}`);
    await this.audit.record({
      actorId: actor.id,
      action: 'PHONE_BOUND',
      targetType: 'user',
      targetId: actor.id,
      detail: `绑定手机号 ${maskPhone(phone)}`,
    });
    return {
      phone: maskPhone(updated.phone),
      phoneVerified: Boolean(updated.phoneVerifiedAt),
      phoneVerifiedAt: updated.phoneVerifiedAt,
    };
  }

  async unbindPhone(actor: AuthUser): Promise<{ phone: null; phoneVerified: false }> {
    const before = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { phone: true },
    });
    await this.prisma.user.update({
      where: { id: actor.id },
      data: { phone: null, phoneVerifiedAt: null },
    });
    this.logger.log(`手机号已解绑 user=${actor.id}`);
    await this.audit.record({
      actorId: actor.id,
      action: 'PHONE_UNBOUND',
      targetType: 'user',
      targetId: actor.id,
      detail: `解绑手机号 ${maskPhone(before?.phone ?? null) ?? '（无）'}`,
    });
    return { phone: null, phoneVerified: false };
  }

  // ------------------------------------------------------------ ntfy

  async ntfyConfig(actor: AuthUser): Promise<{
    serverUrl: string;
    topic: string | null;
    token: null;
  }> {
    const user = await this.requireUser(actor.id);
    const topic = user.ntfyTopic ?? (await this.ensureNtfyTopic(user.id));
    return {
      serverUrl: toWebSocketUrl(await this.ntfyServerUrl()),
      topic,
      // 自建实例的 access token 不发给客户端；App 主动连接只订阅 topic
      token: null,
    };
  }

  async rotateNtfy(actor: AuthUser): Promise<{ topic: string }> {
    const topic = await this.assignNtfyTopic(actor.id);
    this.logger.log(`ntfy topic 已重置 user=${actor.id}`);
    return { topic };
  }

  // ------------------------------------------------------------ 设备

  /** 设备量很小，不分页，直接返回数组（Web 与 App 两端都按裸数组解析）。 */
  async listDevices(actor: AuthUser): Promise<DeviceView[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId: actor.id },
      orderBy: { lastSeenAt: 'desc' },
    });
    return devices.map(toDeviceView);
  }

  async registerDevice(actor: AuthUser, dto: RegisterDeviceDto): Promise<DeviceView[]> {
    const fcmToken = dto.fcmToken?.trim() || null;
    if (dto.pushMode === PushMode.FCM && !fcmToken) {
      throw Errors.validation('FCM 推送模式必须提供 fcmToken');
    }

    const data = {
      name: (dto.name ?? '').slice(0, 64),
      platform: (dto.platform ?? 'android').slice(0, 32),
      pushMode: dto.pushMode,
      fcmToken,
      appVersion: (dto.appVersion ?? '').slice(0, 32),
      lastSeenAt: new Date(),
    };

    if (fcmToken) {
      // 同一 fcmToken 幂等更新；换账号登录同一台手机时把归属改到当前用户
      await this.prisma.device.upsert({
        where: { fcmToken },
        create: { ...data, userId: actor.id },
        update: { ...data, userId: actor.id },
      });
    } else {
      // 无 fcmToken 没有唯一键可 upsert：按 (用户, 推送方式, 名称, 平台) 找已有记录更新，避免每次启动多一条
      const existing = await this.prisma.device.findFirst({
        where: {
          userId: actor.id,
          pushMode: dto.pushMode,
          fcmToken: null,
          name: data.name,
          platform: data.platform,
        },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.device.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.device.create({ data: { ...data, userId: actor.id } });
      }
    }

    return this.listDevices(actor);
  }

  async deleteDevice(actor: AuthUser, id: string): Promise<{ deleted: true }> {
    // userId 条件不能省：否则可以按 id 删别人的设备
    const result = await this.prisma.device.deleteMany({ where: { id, userId: actor.id } });
    if (result.count === 0) throw Errors.notFound('设备不存在');
    return { deleted: true };
  }

  // ------------------------------------------------------------ 管理员：用户

  async listUsers(query: AdminUserQueryDto): Promise<Paged<AdminUserView>> {
    const where: Prisma.UserWhereInput = {};
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paged(rows.map(toPublicUser), total, query);
  }

  async createUser(
    actor: AuthUser,
    dto: CreateUserDto,
    ip: string,
  ): Promise<AdminUserView> {
    const email = normalizeEmail(dto.email);
    const role = dto.role ?? Role.USER;

    if (role === Role.ROOT) {
      throw Errors.forbidden('不能通过该接口创建 ROOT 账号，请使用 ROOT 转让');
    }
    // 权限矩阵：ADMIN 可以建普通用户，但「把 USER 提升为 ADMIN」只有 ROOT 能做
    if (role === Role.ADMIN && actor.role !== Role.ROOT) {
      throw Errors.forbidden('只有初始管理员可以创建管理员账号');
    }

    const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) throw Errors.conflict('EMAIL_TAKEN', '该邮箱已注册');

    assertStrength(dto.password);
    const password = await hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        ...password,
        role,
        // 管理员直接建号：不发验证邮件，直接可用
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        displayName: (dto.displayName ?? '').slice(0, 32),
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'USER_CREATE',
      targetType: 'user',
      targetId: user.id,
      detail: `创建账号 ${email}（role=${role}）`,
      ip,
    });
    this.logger.log(`管理员创建账号 ${email} role=${role} by=${actor.email}`);

    return toPublicUser(user);
  }

  async updateUser(
    actor: AuthUser,
    id: string,
    dto: UpdateUserDto,
    ip: string,
  ): Promise<AdminUserView> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw Errors.notFound('用户不存在');

    const nextName = dto.displayName;
    const nextStatus = dto.status;
    const nextRole = dto.role;
    const nameChanged = nextName !== undefined && nextName !== target.displayName;
    const statusChanged = nextStatus !== undefined && nextStatus !== target.status;
    const roleChanged = nextRole !== undefined && nextRole !== target.role;

    if (!nameChanged && !statusChanged && !roleChanged) {
      return toPublicUser(target);
    }

    // ROOT 唯一、不可降级、不可停用（只能通过 /admin/root/transfer 转让）
    if (target.role === Role.ROOT && (roleChanged || statusChanged)) {
      throw Errors.forbidden('ROOT 账号的角色与状态不可修改，只能转让');
    }
    if (roleChanged) {
      if (actor.role !== Role.ROOT) {
        throw Errors.forbidden('只有初始管理员可以修改角色');
      }
      if (nextRole === Role.ROOT) {
        throw Errors.forbidden('ROOT 只能通过转让产生');
      }
    }
    // 「降级/停用其他 ADMIN」是 ROOT 专属
    if (statusChanged && target.role === Role.ADMIN && actor.role !== Role.ROOT) {
      throw Errors.forbidden('只有初始管理员可以停用管理员账号');
    }

    const data: Prisma.UserUpdateInput = {};
    const changes: Record<string, unknown> = {};
    if (nameChanged && nextName !== undefined) {
      data.displayName = nextName.slice(0, 32);
      changes.displayName = data.displayName;
    }
    if (statusChanged && nextStatus !== undefined) {
      data.status = nextStatus;
      changes.status = nextStatus;
      if (nextStatus === UserStatus.DISABLED) {
        // 停用立刻生效：旧 access 靠 sessionVersion 失效，refresh 全部撤销
        data.sessionVersion = { increment: 1 };
      }
    }
    if (roleChanged && nextRole !== undefined) {
      data.role = nextRole;
      changes.role = nextRole;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({ where: { id }, data });
      if (nextStatus === UserStatus.DISABLED && statusChanged) {
        await tx.refreshSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return next;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'USER_UPDATE',
      targetType: 'user',
      targetId: id,
      detail: `${target.email} ${JSON.stringify(changes)}`,
      ip,
    });
    this.logger.log(`账号已更新 ${target.email} ${JSON.stringify(changes)} by=${actor.email}`);

    return toPublicUser(updated);
  }

  async deleteUser(actor: AuthUser, id: string, ip: string): Promise<{ deleted: true }> {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw Errors.notFound('用户不存在');
    if (target.role === Role.ROOT) throw Errors.forbidden('ROOT 账号不可删除');
    if (target.id === actor.id) throw Errors.validation('不能删除自己的账号');
    // ADMIN 不能删其他 ADMIN（也不能删自己，上一行已挡）
    if (target.role === Role.ADMIN && actor.role !== Role.ROOT) {
      throw Errors.forbidden('只有初始管理员可以删除管理员账号');
    }

    // 级联（任务、事件、设备、会话、令牌、短信、审计）由 Prisma onDelete 处理
    await this.prisma.user.delete({ where: { id } });

    await this.audit.record({
      actorId: actor.id,
      action: 'USER_DELETE',
      targetType: 'user',
      targetId: id,
      detail: `删除账号 ${target.email}（role=${target.role}）`,
      ip,
    });
    this.logger.log(`账号已删除 ${target.email} by=${actor.email}`);

    return { deleted: true };
  }

  // ------------------------------------------------------------ 内部工具

  private async requireUser(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw Errors.unauthenticated('账号不存在');
    return user;
  }

  /**
   * 客户端（App）要连的 ntfy 地址。
   * 必须是对手机可达的公网地址；`NTFY_SERVER_URL` 是服务端 publish 用的内网地址（如 http://ntfy:80），
   * 两者不能混用，否则 App 会拿到容器内部主机名。
   */
  private async ntfyServerUrl(): Promise<string> {
    const publicUrl =
      this.config.get<string>('NTFY_PUBLIC_URL', '') || this.config.get<string>('NTFY_BASE_URL', '');
    if (publicUrl) return publicUrl.replace(/\/$/, '');
    return this.settings.getString('ntfyServerUrl', SETTING_DEFS.ntfyServerUrl.default);
  }

  /** 懒生成 topic：只有 ntfyTopic 仍为 null 时才写，天然幂等。 */
  private async ensureNtfyTopic(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const topic = randomTopic();
      const result = await this.prisma.user.updateMany({
        where: { id: userId, ntfyTopic: null },
        data: { ntfyTopic: topic },
      });
      if (result.count > 0) return topic;
      const fresh = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { ntfyTopic: true },
      });
      if (fresh?.ntfyTopic) return fresh.ntfyTopic;
    }
    throw Errors.internal('生成 ntfy topic 失败，请重试');
  }

  /** 重置 topic：旧 topic 立即作废（服务端只往新 topic publish）。 */
  private async assignNtfyTopic(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const topic = randomTopic();
      try {
        await this.prisma.user.update({ where: { id: userId }, data: { ntfyTopic: topic } });
        return topic;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw Errors.internal('生成 ntfy topic 失败，请重试');
  }
}

function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

function assertStrength(password: string): void {
  try {
    assertPasswordStrength(password);
  } catch (error) {
    throw Errors.validation((error as Error).message);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** http→ws / https→wss，并去掉末尾斜杠（客户端会自己拼 `/{topic}/ws`）。 */
export function toWebSocketUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, '');
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
}

function toDeviceView(device: Device): DeviceView {
  return {
    id: device.id,
    name: device.name,
    platform: device.platform,
    pushMode: device.pushMode,
    fcmToken: device.fcmToken,
    appVersion: device.appVersion,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
  };
}
