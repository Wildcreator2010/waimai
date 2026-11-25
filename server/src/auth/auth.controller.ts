import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { CurrentUser, Public, type AuthUser } from '../common/decorators';
import { CaptchaGuard } from '../captcha/captcha.guard';
import { CaptchaPurpose } from '../captcha/captcha.decorator';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  EmailOnlyDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto';

const COOKIE_NAME = 'mr_rt';
/** 与 REFRESH_TTL_DAYS 默认值保持一致；cookie 只是承载，真正的过期以库为准。 */
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

function isAppClient(req: Request): boolean {
  return String(req.headers['x-client'] ?? '').toLowerCase() === 'app';
}

function clientMeta(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '';
  return { ip, userAgent: String(req.headers['user-agent'] ?? '') };
}

function setRefreshCookie(res: Response, token: string, maxAgeMs: number): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: maxAgeMs,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/api/auth' });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(CaptchaGuard)
  @CaptchaPurpose('register')
  @Post('register')
  @HttpCode(202)
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, clientMeta(req).ip);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    return this.auth.verifyEmail(dto.token, clientMeta(req).ip);
  }

  @Public()
  @UseGuards(CaptchaGuard)
  @CaptchaPurpose('resend')
  @Post('resend-verification')
  @HttpCode(202)
  async resend(@Body() dto: EmailOnlyDto, @Req() req: Request) {
    await this.auth.resendVerification(dto.email, clientMeta(req).ip);
    return { status: 'ACCEPTED' };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const meta = clientMeta(req);
    const result = await this.auth.login(dto, meta);
    if (isAppClient(req)) {
      return result;
    }
    setRefreshCookie(res, result.refreshToken, REFRESH_COOKIE_MAX_AGE_MS);
    return { ...result, refreshToken: '' };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
    const raw = dto.refreshToken || fromCookie || '';
    const meta = clientMeta(req);
    const result = await this.auth.refresh(raw, meta);
    if (isAppClient(req)) {
      return result;
    }
    setRefreshCookie(res, result.refreshToken, REFRESH_COOKIE_MAX_AGE_MS);
    return { ...result, refreshToken: '' };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
    await this.auth.logout(dto.refreshToken || fromCookie || '');
    clearRefreshCookie(res);
    return { status: 'OK' };
  }

  @Public()
  @UseGuards(CaptchaGuard)
  @CaptchaPurpose('forgot')
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() dto: EmailOnlyDto, @Req() req: Request) {
    await this.auth.forgotPassword(dto.email, clientMeta(req).ip);
    return { status: 'ACCEPTED' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.auth.resetPassword(dto, clientMeta(req).ip);
    return { status: 'OK' };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Patch('password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = clientMeta(req);
    const pair = await this.auth.changePassword(user, dto, meta);
    if (isAppClient(req)) return pair;
    setRefreshCookie(res, pair.refreshToken, REFRESH_COOKIE_MAX_AGE_MS);
    return { ...pair, refreshToken: '' };
  }
}
