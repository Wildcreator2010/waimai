import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { clientIp } from '../admin/request-meta';
import { AdminUserQueryDto, CreateUserDto, UpdateUserDto } from './dto';
import { UsersService } from './users.service';

/**
 * 管理员用户管理（docs/api.md §5.1）。
 * 细粒度规则（改角色仅 ROOT、不能动 ROOT、ADMIN 不能删其他 ADMIN）在 UsersService 里，
 * 因为那里才有目标用户的当前状态；这里只做入口级的角色门禁。
 */
@Controller('admin/users')
@Roles(Role.ADMIN, Role.ROOT)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: AdminUserQueryDto) {
    return this.users.listUsers(query);
  }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto, @Req() req: Request) {
    return this.users.createUser(actor, dto, clientIp(req));
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ) {
    return this.users.updateUser(actor, id, dto, clientIp(req));
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.users.deleteUser(actor, id, clientIp(req));
  }
}
