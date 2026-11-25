import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertBanner, LoadingBlock } from '@/components/Feedback';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { CaptchaField, type CaptchaPayload } from '@/components/CaptchaField';
import { Field, Input } from '@/components/Form';
import { api, errorText } from '@/lib/api';

type VerifyState =
  | { status: 'pending' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<VerifyState>({ status: 'pending' });
  // 验证 token 是一次性的：StrictMode / 重复渲染下只提交一次
  const startedRef = useRef(false);

  const [email, setEmail] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaPayload>({});
  const [sending, setSending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!token) {
      setState({
        status: 'error',
        message: '链接缺少 token 参数，请重新点击邮件里的验证链接。',
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await api.post<void>('/auth/verify-email', { token });
        if (!cancelled) setState({ status: 'success' });
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'error', message: errorText(err, '验证失败，链接可能已失效') });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleResend() {
    setResendError(null);
    setResendNotice(null);
    if (!email.includes('@')) {
      setResendError('请输入注册时使用的邮箱');
      return;
    }
    setSending(true);
    try {
      // 接口无论邮箱是否存在都返回 202（防枚举）
      await api.post<void>('/auth/resend-verification', { email: email.trim(), ...captcha });
      setResendNotice('已提交。若该邮箱待验证，新的验证邮件已发出（60 秒一次、每天 5 次）。');
    } catch (err) {
      setResendError(errorText(err, '发送失败，请稍后重试'));
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthLayout
      title="邮箱验证"
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          返回登录
        </Link>
      }
    >
      {state.status === 'pending' ? <LoadingBlock text="正在验证…" /> : null}

      {state.status === 'success' ? (
        <AlertBanner tone="success" title="邮箱验证成功">
          账号已激活，现在可以登录了。
        </AlertBanner>
      ) : null}

      {state.status === 'error' ? (
        <AlertBanner tone="error" title="验证失败">
          <p>{state.message}</p>
        </AlertBanner>
      ) : null}

      <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
        <p className="text-sm text-slate-600">没收到邮件？输入注册邮箱重新发送：</p>
        <Field label="注册邮箱" htmlFor="resendEmail">
          <Input
            id="resendEmail"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setResendError(null);
            }}
          />
        </Field>
        <CaptchaField purpose="resend" onChange={setCaptcha} />
        {resendError ? <p className="text-xs text-rose-600">{resendError}</p> : null}
        {resendNotice ? <p className="text-xs text-emerald-600">{resendNotice}</p> : null}
        <Button loading={sending} onClick={handleResend}>
          重新发送验证邮件
        </Button>
      </div>
    </AuthLayout>
  );
}
