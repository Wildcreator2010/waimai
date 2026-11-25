import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  Prisma,
  Role,
  TokenPurpose,
  UserStatus,
  type User,
} from '@prisma/client';

import { AppError, Errors } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimiter } from '../common/rate-limit';
import {
  assertPasswordStrength,
  hashPassword,
  verifyPassword,
} from '../common/crypto/password';
import { randomToken, sha256Hex } from '../common/crypto/tokens';
import { BootstrapService } from './bootstrap.service';
import type { AuthUser } from '../common/decorators';
import type {
  BootstrapDto,
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TransferRootDto,
} from './dto';

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 用户协议版本：条款更新时改这里，注册记录会存下当时同意的版本。 */
export const TERMS_VERSION = '2026-11-12';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
    private readonly bootstrap: BootstrapService,
  ) {}

  // ------------------------------------------------------------ 引导

  async bootstrapStatus(): Promise<{ needsBootstrap: boolean }> {
    return { needsBootstrap: !(await this.bootstrap.hasRoot()) };
  }

  async createRoot(dto: BootstrapDto, ip: string): Promise<{ user: ReturnType<typeof toPublicUser> }> {
    if (await this.bootstrap.hasRoot()) {
      throw Errors.conflict('ALREADY_BOOTSTRAPPED', '系统已完成初始化');
    }
    if (!this.limiter.consume(`bootstrap:${ip}`, 10, HOUR)) throw Errors.tooMany();
    if (!this.bootstrap.verify(dto.setupCode)) {
      throw new AppError('INVALID_SETUP_CODE', '引导码不正确', 403);
    }

    const email = normalizeEmail(dto.email);
    assertStrength(dto.password);
    const pwd = await hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        ...pwd,
        role: Role.ROOT,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        displayName: (dto.displayName ?? '根管理员').slice(0, 32),
      },
    });

    this.bootstrap.invalidate();
    await this.audit.record({
      actorId: user.id,
      action: 'ROOT_BOOTSTRAP',
      targetType: 'user',
      targetId: user.id,
      detail: `创建初始管理员 ${email}`,
      ip,
    });
    this.logger.log(`ROOT 已创建：${email}`);
    return { user: toPublicUser(user) };
  }

  // ------------------------------------------------------------ 注册 / 验证

  async register(dto: RegisterDto, ip: string): Promise<{ status: 'PENDING_VERIFICATION' }> {
    if (!this.limiter.consume(`register:${ip}`, 5, HOUR)) throw Errors.tooMany();

    const email = normalizeEmail(dto.email);
    assertStrength(dto.password);

    const invite = await this.prisma.invite.findUnique({ where: { code: dto.inviteCode.trim() } });
    if (!invite) throw new AppError('INVITE_INVALID', '邀请码不存在', 403);
    if (invite.usedAt) throw new AppError('INVITE_USED', '邀请码已被使用', 403);
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new AppError('INVITE_EXPIRED', '邀请码已过期', 403);
    }
    if (normalizeEmail(invite.email) !== email) {
      throw new AppError('INVITE_EMAIL_MISMATCH', '邀请码与邮箱不匹配', 403);
    }

    const exists = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) throw Errors.conflict('EMAIL_TAKEN', '该邮箱已注册');

    const pwd = await hashPassword(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          ...pwd,
          role: Role.USER,
          status: UserStatus.PENDING_VERIFICATION,
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { usedAt: new Date(), usedById: created.id },
      });
      return created;
    });

    const raw = await this.issueToken(user.id, TokenPurpose.EMAIL_VERIFY, 60, '');
    await this.mail.sendVerifyEmail(email, this.link('verify-email', raw));
    await this.audit.record({
      actorId: user.id,
      action: 'USER_REGISTER',
      targetType: 'user',
      targetId: user.id,
      detail: `邮箱注册 ${email}`,
      ip,
    });
    return { status: 'PENDING_VERIFICATION' };
  }

  async verifyEmail(token: string, ip: string): Promise<{ verified: true }> {
    const record = await this.consumeToken(token, TokenPurpose.EMAIL_VERIFY);
    const user = await this.prisma.user.update({
      where: { id: record.userId },
      data: { status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'EMAIL_VERIFIED',
      targetType: 'user',
      targetId: user.id,
      ip,
    });
    return { verified: true };
  }

  async resendVerification(emailRaw: string, ip: string): Promise<void> {
    const email = normalizeEmail(emailRaw);
    if (!this.limiter.consume(`resend:${email}`, 5, DAY)) throw Errors.tooMany();
    if (!this.limiter.consume(`resend-fast:${email}`, 1, MINUTE)) throw Errors.tooMany('请 1 分钟后再试');

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) return;

    const raw = await this.issueToken(user.id, TokenPurpose.EMAIL_VERIFY, 60, '');
    await this.mail.sendVerifyEmail(email, this.link('verify-email', raw));
  }

  // ------------------------------------------------------------ 登录 / 刷新

  async me(actor: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    return toPublicUser(user);
  }

  async login(
    dto: LoginDto,
    meta: { ip: string; userAgent: string },
  ): Promise<TokenPair & { user: ReturnType<typeof toPublicUser> }> {
    const email = normalizeEmail(dto.email);
    if (!this.limiter.consume(`login:${email}`, 5, 10 * MINUTE)) throw Errors.tooMany();
    if (!this.limiter.consume(`login-ip:${meta.ip}`, 20, 10 * MINUTE)) throw Errors.tooMany();

    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = user
      ? await verifyPassword(dto.password, {
          passwordHash: user.passwordHash,
          passwordSalt: user.passwordSalt,
          passwordIterations: user.passwordIterations,
        })
      : false;

    if (!user || !ok) throw new AppError('INVALID_CREDENTIALS', '邮箱或密码不正确', 401);
    if (user.status === UserStatus.DISABLED) {
      throw new AppError('ACCOUNT_DISABLED', '账号已被停用', 403);
    }
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new AppError('EMAIL_NOT_VERIFIED', '邮箱尚未验证，请先查收验证邮件', 403);
    }

    this.limiter.reset(`login:${email}`);
    const pair = await this.issueSession(user, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      actorId: user.id,
      action: 'LOGIN',
      targetType: 'user',
      targetId: user.id,
      ip: meta.ip,
    });
    return { ...pair, user: toPublicUser(user) };
  }

  async refresh(rawToken: string, meta: { ip: string; userAgent: string }): Promise<TokenPair> {
    const tokenHash = sha256Hex(rawToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session) throw new AppError('REFRESH_INVALID', '登录状态无效，请重新登录', 401);
    if (session.revokedAt) throw new AppError('REFRESH_REVOKED', '登录状态已失效，请重新登录', 401);
    if (session.expiresAt.getTime() < Date.now()) {
      throw new AppError('REFRESH_EXPIRED', '登录已过期，请重新登录', 401);
    }
    if (session.user.status !== UserStatus.ACTIVE) {
      throw new AppError('ACCOUNT_DISABLED', '账号不可用', 403);
    }

    const nextRaw = randomToken();
    const nextExpires = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      }),
      this.prisma.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: sha256Hex(nextRaw),
          ip: meta.ip.slice(0, 64),
          userAgent: meta.userAgent.slice(0, 256),
          expiresAt: nextExpires,
        },
      }),
    ]);

    return {
      accessToken: await this.signAccess(session.user),
      expiresIn: this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900),
      refreshToken: nextRaw,
    };
  }

  async logout(rawToken: string): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: sha256Hex(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ------------------------------------------------------------ 密码

  async forgotPassword(emailRaw: string, ip: string): Promise<void> {
    const email = normalizeEmail(emailRaw);
    if (!this.limiter.consume(`forgot:${email}`, 5, DAY)) throw Errors.tooMany();
    if (!this.limiter.consume(`forgot-fast:${email}`, 1, MINUTE)) throw Errors.tooMany('请 1 分钟后再试');

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === UserStatus.DISABLED) return;

    const raw = await this.issueToken(user.id, TokenPurpose.PASSWORD_RESET, 60, '');
    await this.mail.sendResetEmail(email, this.link('reset-password', raw));
    await this.audit.record({
      actorId: user.id,
      action: 'PASSWORD_RESET_REQUEST',
      targetType: 'user',
      targetId: user.id,
      ip,
    });
  }

  async resetPassword(dto: ResetPasswordDto, ip: string): Promise<void> {
    assertStrength(dto.newPassword);
    const record = await this.consumeToken(dto.token, TokenPurpose.PASSWORD_RESET);
    const pwd = await hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { ...pwd, sessionVersion: { increment: 1 } },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      actorId: record.userId,
      action: 'PASSWORD_RESET',
      targetType: 'user',
      targetId: record.userId,
      ip,
    });
  }

  async changePassword(
    actor: AuthUser,
    dto: ChangePasswordDto,
    meta: { ip: string; userAgent: string },
  ): Promise<TokenPair> {
    if (dto.currentPassword === dto.newPassword) {
      throw Errors.validation('新密码不能与当前密码相同');
    }
    assertStrength(dto.newPassword);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const ok = await verifyPassword(dto.currentPassword, {
      passwordHash: user.passwordHash,
      passwordSalt: user.passwordSalt,
      passwordIterations: user.passwordIterations,
    });
    if (!ok) throw new AppError('INVALID_CREDENTIALS', '当前密码不正确', 401);

    const pwd = await hashPassword(dto.newPassword);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id: user.id },
        data: { ...pwd, sessionVersion: { increment: 1 } },
      });
      await tx.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return next;
    });

    await this.audit.record({
      actorId: user.id,
      action: 'PASSWORD_CHANGED',
      targetType: 'user',
      targetId: user.id,
      ip: meta.ip,
    });
    // 旧会话全部作废，直接签发一对新的，避免用户被踢回登录页
    return this.issueSession(updated, meta);
  }

  // ------------------------------------------------------------ ROOT 转让

  async transferRoot(
    actor: AuthUser,
    dto: TransferRootDto,
    ip: string,
  ): Promise<{ transferredTo: string }> {
    if (actor.role !== Role.ROOT) throw Errors.forbidden('只有初始管理员可以转让');
    if (dto.userId === actor.id) throw Errors.validation('不能转让给自己');

    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const ok = await verifyPassword(dto.password, {
      passwordHash: me.passwordHash,
      passwordSalt: me.passwordSalt,
      passwordIterations: me.passwordIterations,
    });
    if (!ok) throw new AppError('INVALID_CREDENTIALS', '密码不正确', 401);

    const target = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!target) throw Errors.notFound('目标用户不存在');
    if (target.status !== UserStatus.ACTIVE) throw Errors.validation('目标账号不可用');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { role: Role.ROOT, sessionVersion: { increment: 1 } },
      });
      await tx.user.update({
        where: { id: me.id },
        data: { role: Role.ADMIN, sessionVersion: { increment: 1 } },
      });
      await tx.refreshSession.updateMany({
        where: { userId: { in: [me.id, target.id] }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record({
      actorId: me.id,
      action: 'ROOT_TRANSFER',
      targetType: 'user',
      targetId: target.id,
      detail: `ROOT 由 ${me.email} 转让给 ${target.email}`,
      ip,
    });
    return { transferredTo: target.email };
  }

  // ------------------------------------------------------------ 内部工具

  private async issueSession(user: User, meta: { ip: string; userAgent: string }): Promise<TokenPair> {
    const raw = randomToken();
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(raw),
        ip: meta.ip.slice(0, 64),
        userAgent: meta.userAgent.slice(0, 256),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });
    return {
      accessToken: await this.signAccess(user),
      expiresIn: this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900),
      refreshToken: raw,
    };
  }

  private async signAccess(user: User): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      ver: user.sessionVersion,
      jti: randomToken(12),
    });
  }

  private async issueToken(
    userId: string,
    purpose: TokenPurpose,
    ttlMinutes: number,
    meta: string,
  ): Promise<string> {
    const raw = randomToken();
    await this.prisma.verificationToken.create({
      data: {
        userId,
        purpose,
        tokenHash: sha256Hex(raw),
        meta,
        expiresAt: new Date(Date.now() + ttlMinutes * MINUTE),
      },
    });
    return raw;
  }

  private async consumeToken(raw: string, purpose: TokenPurpose) {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: sha256Hex(raw) },
    });
    if (!record || record.purpose !== purpose || record.consumedAt) {
      throw new AppError('TOKEN_INVALID', '链接无效或已被使用', 400);
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new AppError('TOKEN_EXPIRED', '链接已过期，请重新获取', 400);
    }
    await this.prisma.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return record;
  }

  private link(path: string, token: string): string {
    const base = this.config.get<string>('APP_BASE_URL', 'http://127.0.0.1:5173').replace(/\/$/, '');
    return `${base}/${path}?token=${encodeURIComponent(token)}`;
  }

  private refreshTtlMs(): number {
    return this.config.get<number>('REFRESH_TTL_DAYS', 30) * DAY;
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

/** 对外用户对象：手机号掩码，绝不返回密码字段。 */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    displayName: user.displayName,
    emailVerifiedAt: user.emailVerifiedAt,
    phone: maskPhone(user.phone),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    showNotifyDetails: user.showNotifyDetails,
    smsEnabled: user.smsEnabled,
    ntfyEnabled: user.ntfyEnabled,
    ntfyTopic: user.ntfyTopic,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 7) return '***';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export type { Prisma };
