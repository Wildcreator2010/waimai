import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';

import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { AuditService } from '../audit/audit.service';
import { clientIp } from '../admin/request-meta';
import { UpdateSettingsDto } from './dto';
import { SystemSettingService, type SettingsMap } from './settings.service';

/** 管理台系统设置：GET 返回扁平对象，PATCH 只接受 setting-keys.ts 里的键。 */
@Controller('admin/settings')
@Roles(Role.ADMIN, Role.ROOT)
export class AdminSettingsController {
  constructor(
    private readonly settings: SystemSettingService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  getAll(): Promise<SettingsMap> {
    return this.settings.getAll();
  }

  @Patch()
  async update(
    @CurrentUser() actor: AuthUser,
    @Body() dto: UpdateSettingsDto,
    @Req() req: Request,
  ): Promise<SettingsMap> {
    const result = await this.settings.update(dto);
    if (result.changed.length > 0) {
      // detail 只记录键名与变化后的值；设置项不含密钥（MemberToken / ntfy token 不在本表）
      const detail: Record<string, unknown> = {};
      for (const key of result.changed) detail[key] = result.settings[key];
      await this.audit.record({
        actorId: actor.id,
        action: 'SETTINGS_UPDATE',
        targetType: 'setting',
        targetId: result.changed.join(','),
        detail: JSON.stringify(detail).slice(0, 1000),
        ip: clientIp(req),
      });
    }
    return result.settings;
  }
}
