import { Module } from '@nestjs/common';

import { LockerModule } from '../locker/locker.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  // LockerModule 提供 LockerClient 与 CredentialService（一键开箱要用）
  imports: [SchedulerModule, LockerModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
