import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Form';
import { api } from '@/lib/api';

export interface CaptchaPayload {
  captchaId?: string;
  captchaAnswer?: string;
  captchaToken?: string;
}

interface Challenge {
  id: string;
  question: string;
  provider: 'builtin' | 'turnstile' | 'off';
  expiresInSec: number;
}

type Purpose = 'register' | 'resend' | 'forgot' | 'phone';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void },
      ) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * 人机验证输入。两种 provider 自动切换：
 * - builtin（默认）：服务端出算术题，2 分钟一次性
 * - turnstile：加载 Cloudflare 脚本渲染官方 widget，拿到 token 后随请求提交
 */
export function CaptchaField({
  purpose,
  onChange,
  error,
}: {
  purpose: Purpose;
  onChange: (payload: CaptchaPayload) => void;
  error?: string;
}) {
  const [provider, setProvider] = useState<'builtin' | 'turnstile' | 'off' | null>(null);
  const [siteKey, setSiteKey] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  // 1) 取 provider 配置
  useEffect(() => {
    let alive = true;
    api
      .get<{ provider: 'builtin' | 'turnstile' | 'off'; siteKey: string }>('/captcha/config')
      .then((config) => {
        if (!alive) return;
        setProvider(config.provider);
        setSiteKey(config.siteKey);
      })
      .catch(() => alive && setProvider('builtin'));
    return () => {
      alive = false;
    };
  }, []);

  // 2) builtin：取题
  const loadChallenge = useCallback(async () => {
    setLoadError(null);
    setAnswer('');
    onChange({ captchaId: '', captchaAnswer: '' });
    try {
      const next = await api.get<Challenge>(`/captcha/challenge?purpose=${purpose}`);
      setChallenge(next);
      onChange({ captchaId: next.id, captchaAnswer: '' });
    } catch {
      setLoadError('人机验证加载失败，请点击刷新');
    }
  }, [purpose, onChange]);

  useEffect(() => {
    if (provider === 'builtin') void loadChallenge();
  }, [provider, loadChallenge]);

  // 3) turnstile：加载脚本并渲染 widget
  useEffect(() => {
    if (provider !== 'turnstile' || !siteKey) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.turnstile || !widgetRef.current) return;
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onChange({ captchaToken: token }),
        'error-callback': () => setLoadError('人机验证加载失败，请刷新页面重试'),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.onload = render;
      script.onerror = () => setLoadError('无法加载 Turnstile 脚本（网络受限）');
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [provider, siteKey, onChange]);

  if (provider === null) {
    return <p className="text-xs text-slate-500">正在加载人机验证…</p>;
  }

  if (provider === 'off') {
    return <p className="text-xs text-slate-500">当前环境未启用人机验证。</p>;
  }

  if (provider === 'turnstile') {
    return (
      <Field label="人机验证" htmlFor="turnstile-widget" required error={error ?? loadError ?? undefined}>
        <div id="turnstile-widget" ref={widgetRef} />
      </Field>
    );
  }

  return (
    <Field
      label="人机验证"
      htmlFor="captchaAnswer"
      required
      hint={challenge ? `请计算：${challenge.question}` : '正在加载题目…'}
      error={error ?? loadError ?? undefined}
    >
      <div className="flex gap-2">
        <Input
          id="captchaAnswer"
          inputMode="numeric"
          autoComplete="off"
          placeholder="填写计算结果"
          value={answer}
          invalid={Boolean(error ?? loadError)}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d-]/g, '').slice(0, 6);
            setAnswer(next);
            onChange({ captchaId: challenge?.id ?? '', captchaAnswer: next });
          }}
        />
        <Button type="button" variant="secondary" onClick={() => void loadChallenge()}>
          换一题
        </Button>
      </div>
    </Field>
  );
}
