import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

export type CaptchaProvider = 'builtin' | 'turnstile' | 'off';

interface Challenge {
  answer: string;
  purpose: string;
  expiresAt: number;
}

export interface IssuedChallenge {
  id: string;
  question: string;
  provider: CaptchaProvider;
  expiresInSec: number;
}

const TTL_MS = 120_000;
const MAX_ENTRIES = 5000;

/**
 * 人机验证。
 *
 * 两种 provider：
 * - `builtin`（默认）：服务端出一道算术题，2 分钟内有效、一次性。不依赖第三方，
 *   国内网络可用；强度一般，靠配合限频使用（注册/发信/发短信本身都有独立限频）。
 * - `turnstile`：Cloudflare Turnstile，免费且对用户无感；需要站点 key + 密钥。
 *
 * 切换：`CAPTCHA_PROVIDER=turnstile` + `TURNSTILE_SECRET=...`。
 * 关闭（仅限本地调试）：`CAPTCHA_PROVIDER=off`。
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger('Captcha');
  private readonly challenges = new Map<string, Challenge>();
  private readonly provider: CaptchaProvider;
  private readonly turnstileSecret: string;
  private readonly turnstileSiteKey: string;

  constructor(private readonly config: ConfigService) {
    const raw = (config.get<string>('CAPTCHA_PROVIDER', 'builtin') || 'builtin').toLowerCase();
    this.provider =
      raw === 'off' || raw === 'turnstile' || raw === 'builtin' ? (raw as CaptchaProvider) : 'builtin';
    this.turnstileSecret = config.get<string>('TURNSTILE_SECRET', '');
    this.turnstileSiteKey = config.get<string>('TURNSTILE_SITE_KEY', '');
    if (this.provider === 'turnstile' && !this.turnstileSecret) {
      this.logger.warn('CAPTCHA_PROVIDER=turnstile 但缺少 TURNSTILE_SECRET，已回退到 builtin');
      this.provider = 'builtin';
    }
    this.logger.log(`人机验证 provider=${this.provider}`);
  }

  get activeProvider(): CaptchaProvider {
    return this.provider;
  }

  /** 前端渲染所需配置（site key 是公开的，secret 不返回）。 */
  publicConfig(): { provider: CaptchaProvider; siteKey: string } {
    return {
      provider: this.provider,
      siteKey: this.provider === 'turnstile' ? this.turnstileSiteKey : '',
    };
  }

  /** 签发一道挑战。purpose 与使用场景绑定，防止拿注册的题去换短信码。 */
  issue(purpose: string): IssuedChallenge {
    if (this.provider !== 'builtin') {
      // 第三方 provider 不需要服务端出题，前端直接用其组件拿 token
      return { id: '', question: '', provider: this.provider, expiresInSec: 0 };
    }
    this.sweep();
    const a = 2 + Math.floor(Math.random() * 8);
    const b = 2 + Math.floor(Math.random() * 8);
    const useMultiply = Math.random() < 0.5;
    const answer = String(useMultiply ? a * b : a + b);
    const question = useMultiply ? `${a} × ${b} = ?` : `${a} + ${b} = ?`;

    const id = randomUUID();
    this.challenges.set(id, { answer, purpose, expiresAt: Date.now() + TTL_MS });
    return { id, question, provider: 'builtin', expiresInSec: TTL_MS / 1000 };
  }

  /** 校验并消费挑战：无论对错都删除，避免反复猜。 */
  verify(id: string, answer: string, purpose: string): boolean {
    if (this.provider === 'off') return true;
    if (this.provider !== 'builtin') return false;
    if (!id || !answer) return false;

    const entry = this.challenges.get(id);
    if (!entry) return false;
    this.challenges.delete(id);

    if (entry.purpose !== purpose) return false;
    if (entry.expiresAt < Date.now()) return false;
    return entry.answer === String(answer).trim();
  }

  /** Cloudflare Turnstile 校验。 */
  async verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
    if (this.provider === 'off') return true;
    if (this.provider !== 'turnstile') return false;
    if (!token) return false;

    try {
      const form = new URLSearchParams();
      form.set('secret', this.turnstileSecret);
      form.set('response', token);
      if (remoteIp) form.set('remoteip', remoteIp);

      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json()) as { success?: boolean };
      return payload.success === true;
    } catch (error) {
      this.logger.warn(`Turnstile 校验请求失败：${(error as Error).message}`);
      return false;
    }
  }

  /** 清理过期挑战，防止内存无限增长。 */
  private sweep(): void {
    if (this.challenges.size < MAX_ENTRIES) {
      const now = Date.now();
      for (const [id, entry] of this.challenges) {
        if (entry.expiresAt < now) this.challenges.delete(id);
      }
      return;
    }
    const now = Date.now();
    for (const [id, entry] of this.challenges) {
      if (entry.expiresAt < now) this.challenges.delete(id);
    }
  }
}
