import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** 测试与脚本用的清库辅助：按外键顺序删除，禁止在生产调用。 */
  async truncateAll(): Promise<void> {
    await this.$executeRawUnsafe(
      'TRUNCATE TABLE "ReminderEvent","Reminder","SmsLog","AuditLog","AdminAlert","VerificationToken","RefreshSession","Invite","Device","LockerCredential","SystemSetting","User" RESTART IDENTITY CASCADE',
    );
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
