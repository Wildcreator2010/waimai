import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppError } from '../common/errors';
import { CAPTCHA_PURPOSE_KEY } from './captcha.decorator';
import { CaptchaService } from './captcha.service';

interface CaptchaBody {
  captchaId?: string;
  captchaAnswer?: string;
  captchaToken?: string;
}

/**
 * 人机验证守卫。挂在「会消耗资源/会发消息」的接口上：
 * 注册、重发验证邮件、忘记密码、请求短信验证码。
 *
 * 客户端提交：
 * - builtin：captchaId + captchaAnswer（先用 GET /api/captcha/challenge 取题）
 * - turnstile：captchaToken（前端组件拿到的 token）
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly captcha: CaptchaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const purpose = this.reflector.get<string>(CAPTCHA_PURPOSE_KEY, context.getHandler());
    if (!purpose) return true;

    const request = context.switchToHttp().getRequest<{
      body?: CaptchaBody;
      headers: Record<string, string | undefined>;
      socket?: { remoteAddress?: string };
    }>();
    const body = request.body ?? {};

    if (this.captcha.activeProvider === 'off') return true;

    if (this.captcha.activeProvider === 'turnstile') {
      const forwarded = request.headers['x-forwarded-for'];
      const ip =
        (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
        request.socket?.remoteAddress ||
        '';
      const ok = await this.captcha.verifyTurnstile(body.captchaToken ?? '', ip);
      if (!ok) throw new AppError('CAPTCHA_FAILED', '人机验证未通过，请重试', 400);
      return true;
    }

    const ok = this.captcha.verify(body.captchaId ?? '', body.captchaAnswer ?? '', purpose);
    if (!ok) {
      throw new AppError('CAPTCHA_FAILED', '人机验证未通过或已过期，请刷新后重试', 400);
    }
    return true;
  }
}
