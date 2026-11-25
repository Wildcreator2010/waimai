import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../common/decorators';
import { AuthService } from './auth.service';
import { BootstrapDto } from './dto';

@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('status')
  status() {
    return this.auth.bootstrapStatus();
  }

  @Public()
  @Post()
  @HttpCode(201)
  create(@Body() dto: BootstrapDto, @Req() req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';
    return this.auth.createRoot(dto, ip);
  }
}
