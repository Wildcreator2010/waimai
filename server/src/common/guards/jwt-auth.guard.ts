import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';

import { AppError, Errors } from '../errors';
import { IS_PUBLIC_KEY, type AuthUser } from '../decorators';
import { PrismaService } from '../../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  /** 会话版本：改密/转让 ROOT 时递增，使旧 access 立即失效 */
  ver: number;
  jti: string;
}

/**
 * 全局鉴权守卫：验签 → 查库 → 校验状态。
 * 每次查库是有意为之：封号、改密、降权要立即生效，不能等 token 过期。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const header = request.headers['authorization'] ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw Errors.unauthenticated();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw Errors.tokenExpired();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        displayName: true,
        emailVerifiedAt: true,
        phone: true,
        phoneVerifiedAt: true,
        sessionVersion: true,
      },
    });

    if (!user) throw Errors.unauthenticated('账号不存在');
    if (user.status === UserStatus.DISABLED) {
      throw new AppError('ACCOUNT_DISABLED', '账号已被停用', 403);
    }
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new AppError('EMAIL_NOT_VERIFIED', '邮箱尚未验证', 403);
    }
    if (user.sessionVersion !== payload.ver) throw Errors.tokenExpired();

    request.user = user as AuthUser;
    return true;
  }
}
