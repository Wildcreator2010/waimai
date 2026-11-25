import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { AuthService } from './auth.service';
import { TransferRootDto } from './dto';

/** ROOT 转让单独成控制器，便于和普通管理员接口隔离权限。 */
@Controller('admin/root')
@Roles(Role.ROOT)
export class RootController {
  constructor(private readonly auth: AuthService) {}

  @Post('transfer')
  @HttpCode(200)
  transfer(@CurrentUser() actor: AuthUser, @Body() dto: TransferRootDto, @Req() req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';
    return this.auth.transferRoot(actor, dto, ip);
  }
}
