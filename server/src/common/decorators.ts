import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role, UserStatus } from '@prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
/** 标记无需登录即可访问的路由。 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** 限定可访问角色；未标注表示任意已登录用户。 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** 挂在 request 上的已认证用户。 */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  displayName: string;
  emailVerifiedAt: Date | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
