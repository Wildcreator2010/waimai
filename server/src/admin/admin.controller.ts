import { Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { toCsv } from '../common/csv';
import { AdminService } from './admin.service';
import { AlertQueryDto, AuditQueryDto, SmsLogQueryDto } from './dto';
import { clientIp } from './request-meta';

/** 管理台只读视图 + 告警确认 + 概览（docs/api.md §5.5 / §5.6）。 */
@Controller('admin')
@Roles(Role.ADMIN, Role.ROOT)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('alerts')
  alerts(@Query() query: AlertQueryDto) {
    return this.admin.listAlerts(query);
  }

  @Post('alerts/:id/ack')
  @HttpCode(200)
  ack(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.admin.ackAlert(actor, id, clientIp(req));
  }

  @Get('audit')
  auditLogs(@Query() query: AuditQueryDto) {
    return this.admin.listAudit(query);
  }

  /** 导出审计日志（CSV，最多 5000 条） */
  @Get('audit/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  async exportAudit(@Query() query: AuditQueryDto) {
    const rows = await this.admin.exportAudit(query);
    const csv = toCsv(
      ['时间', '操作者', '动作', '对象类型', '对象ID', 'IP', '详情'],
      rows.map((row) => [
        row.createdAt,
        row.actorEmail ?? '',
        row.action,
        row.targetType ?? '',
        row.targetId ?? '',
        row.ip ?? '',
        row.detail ?? '',
      ]),
    );
    return `\ufeff${csv}`;
  }

  @Get('sms-logs')
  smsLogs(@Query() query: SmsLogQueryDto) {
    return this.admin.listSmsLogs(query);
  }

  /** 导出短信流水（CSV，最多 5000 条） */
  @Get('sms-logs/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sms-logs.csv"')
  async exportSmsLogs(@Query() query: SmsLogQueryDto) {
    const rows = await this.admin.exportSmsLogs(query);
    const csv = toCsv(
      ['时间', '用户', '手机号', '模板', '状态', '服务商ID', '错误码', '错误信息', '参数'],
      rows.map((row) => [
        row.createdAt,
        row.userEmail ?? '',
        row.phone,
        row.template,
        row.status,
        row.providerId ?? '',
        row.errorCode ?? '',
        row.errorMsg ?? '',
        row.params ? JSON.stringify(row.params) : '',
      ]),
    );
    return `\ufeff${csv}`;
  }

  @Get('overview')
  overview() {
    return this.admin.overview();
  }
}
