import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';
import { AdminUsersController } from './admin-users.controller';
import { MeController } from './me.controller';
import { UsersService } from './users.service';

/**
 * 账号模块：`/api/me/*`（本人）与 `/api/admin/users/*`（管理员）。
 * 依赖的 Prisma / Audit / RateLimiter / Sms 都是全局模块；
 * SettingsModule 虽是全局，这里仍显式 import，让依赖关系在模块图上可见。
 */
@Module({
  imports: [SettingsModule],
  controllers: [MeController, AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
