import { Global, Module } from '@nestjs/common';

import { FcmService } from './fcm.service';
import { NotificationsService } from './notifications.service';
import { NtfyService } from './ntfy.service';
import { SmsQueueService } from './sms-queue.service';
import { SmsService } from './sms.service';
import { TestPushController } from './test-push.controller';
import { WebPushController } from './webpush.controller';
import { WebPushService } from './webpush.service';

@Global()
@Module({
  controllers: [TestPushController, WebPushController],
  providers: [
    SmsService,
    SmsQueueService,
    FcmService,
    NtfyService,
    WebPushService,
    NotificationsService,
  ],
  exports: [
    SmsService,
    SmsQueueService,
    FcmService,
    NtfyService,
    WebPushService,
    NotificationsService,
  ],
})
export class NotificationsModule {}
