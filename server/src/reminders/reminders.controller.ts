import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators';
import { PaginationQuery } from '../common/dto/pagination.dto';
import { CreateReminderDto, ListRemindersQuery } from './dto';
import { RemindersService } from './reminders.service';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateReminderDto) {
    return this.reminders.create(actor, dto);
  }

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: ListRemindersQuery) {
    return this.reminders.list(actor, query);
  }

  @Get(':id')
  detail(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.reminders.detail(actor, id);
  }

  @Post(':id/check')
  @HttpCode(200)
  check(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.reminders.check(actor, id);
  }

  @Post(':id/stop')
  @HttpCode(200)
  stop(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.reminders.stop(actor, id);
  }

  /** 一键开箱：会物理开门，仅任务本人、已入柜、有订单号时可用 */
  @Post(':id/open')
  @HttpCode(200)
  openBox(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.reminders.openBox(actor, id);
  }

  @Get(':id/events')
  events(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Query() query: PaginationQuery,
  ) {
    return this.reminders.events(actor, id, query);
  }
}
