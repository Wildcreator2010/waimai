import { SetMetadata } from '@nestjs/common';

export const CAPTCHA_PURPOSE_KEY = 'captchaPurpose';

/** 标记该路由需要人机验证，并绑定到某个用途（register / resend / forgot / phone）。 */
export const CaptchaPurpose = (purpose: string) => SetMetadata(CAPTCHA_PURPOSE_KEY, purpose);
