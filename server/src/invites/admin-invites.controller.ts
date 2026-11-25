import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { clientIp } from '../admin/request-meta';
import { CreateInviteDto, InviteQueryDto } from './dto';
import { InvitesService } from './invites.service';

/** 邀请码管理（docs/api.md §5.2），全部需要 ADMIN/ROOT。 */
@Controller('admin/invites')
@Roles(Role.ADMIN, Role.ROOT)
export class AdminInvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateInviteDto, @Req() req: Request) {
    return this.invites.create(actor, dto, clientIp(req));
  }

  @Get()
  list(@Query() query: InviteQueryDto) {
    return this.invites.list(query);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.invites.remove(actor, id, clientIp(req));
  }
}
