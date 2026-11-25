import { Body, Controller, Get, HttpCode, Post, Put, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { CredentialService } from './credential.service';

class SetTokenDto {
  @IsString()
  @MinLength(8, { message: 'MemberToken 至少 8 个字符' })
  @MaxLength(4096)
  token!: string;
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  return (
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    ''
  );
}

/** MemberToken 只允许管理员（含 ROOT）查看掩码与修改，用户完全不可见。 */
@Controller('admin/member-token')
@Roles(Role.ADMIN, Role.ROOT)
export class MemberTokenController {
  constructor(private readonly credentials: CredentialService) {}

  @Get()
  status() {
    return this.credentials.status();
  }

  @Put()
  @HttpCode(200)
  update(@Body() dto: SetTokenDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.credentials.update(dto.token, actor.id, clientIp(req));
  }

  @Post('verify')
  @HttpCode(200)
  verify(@CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.credentials.verifyNow(actor.id, clientIp(req));
  }
}
