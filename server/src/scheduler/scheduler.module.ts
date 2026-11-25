import { Module } from '@nestjs/common';

import { LockerModule } from '../locker/locker.module';
import { ReminderRunner } from './reminder-runner.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [LockerModule],
  providers: [ReminderRunner, SchedulerService],
  exports: [ReminderRunner, SchedulerService],
})
export class SchedulerModule {}
