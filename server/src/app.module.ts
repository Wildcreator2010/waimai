import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaModule } from './prisma/prisma.service';
import { MailModule } from './mail/mail.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CaptchaModule } from './captcha/captcha.module';
import { HealthModule } from './health/health.module';
import { LockerModule } from './locker/locker.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { RemindersModule } from './reminders/reminders.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { InvitesModule } from './invites/invites.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validate: validateEnv,
    }),
    CommonModule,
    PrismaModule,
    MailModule,
    AuditModule,
    AuthModule,
    CaptchaModule,
    HealthModule,
    NotificationsModule,
    LockerModule,
    SchedulerModule,
    RemindersModule,
    MaintenanceModule,
    SettingsModule,
    UsersModule,
    InvitesModule,
    AdminModule,
  ],
  providers: [
    // 顺序有意义：先认证，再判角色
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
