import { Global, Module } from '@nestjs/common';

import { AdminSettingsController } from './admin-settings.controller';
import { SystemSettingService } from './settings.service';

/**
 * 系统设置模块。
 * 设为 @Global 与 PrismaModule / AuditModule / NotificationsModule 的做法一致：
 * 调度器、任务、用户模块都要读设置，逐个 import 只会制造无意义的样板。
 */
@Global()
@Module({
  controllers: [AdminSettingsController],
  providers: [SystemSettingService],
  exports: [SystemSettingService],
})
export class SettingsModule {}
