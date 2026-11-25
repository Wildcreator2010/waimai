import { Global, Module } from '@nestjs/common';

import { CaptchaController } from './captcha.controller';
import { CaptchaGuard } from './captcha.guard';
import { CaptchaService } from './captcha.service';

@Global()
@Module({
  controllers: [CaptchaController],
  providers: [CaptchaService, CaptchaGuard],
  exports: [CaptchaService, CaptchaGuard],
})
export class CaptchaModule {}
