import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';

import { Public } from '../common/decorators';
import { CaptchaService } from './captcha.service';

class ChallengeQuery {
  @IsOptional()
  @IsIn(['register', 'resend', 'forgot', 'phone'])
  purpose?: string;
}

@Controller('captcha')
export class CaptchaController {
  constructor(private readonly captcha: CaptchaService) {}

  /** 前端渲染所需配置：provider 与（Turnstile 的）公开 site key */
  @Public()
  @Get('config')
  config() {
    return this.captcha.publicConfig();
  }

  /** 取一道人机验证题；purpose 必须与将要调用的接口一致。 */
  @Public()
  @Get('challenge')
  challenge(@Query() query: ChallengeQuery) {
    return this.captcha.issue(query.purpose ?? 'register');
  }
}
