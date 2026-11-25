import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/** 告警 / 审计 / 短信流水 / 概览。Prisma 与 Audit 均为全局模块，无需 import。 */
@Module({
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
