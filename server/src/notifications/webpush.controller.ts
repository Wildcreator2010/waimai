import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';

import { CurrentUser, type AuthUser } from '../common/decorators';
import { WebPushService } from './webpush.service';

class SubscribeDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  endpoint!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(255)
  p256dh!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(64)
  auth!: string;
}

class UnsubscribeDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2048)
  endpoint!: string;
}

/** 浏览器 Web Push 订阅管理（仅本人）。 */
@Controller('me/webpush')
export class WebPushController {
  constructor(private readonly webpush: WebPushService) {}

  @Get('key')
  key() {
    return { enabled: this.webpush.isEnabled(), publicKey: this.webpush.getPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(201)
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto, @Req() req: Request) {
    return this.webpush.subscribe(user.id, {
      endpoint: dto.endpoint,
      p256dh: dto.p256dh,
      auth: dto.auth,
      userAgent: String(req.headers['user-agent'] ?? ''),
    });
  }

  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    return this.webpush.unsubscribe(user.id, dto.endpoint);
  }

  @Get('subscriptions')
  list(@CurrentUser() user: AuthUser) {
    return this.webpush.list(user.id);
  }
}
