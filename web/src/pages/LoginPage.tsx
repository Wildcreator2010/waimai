import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AlertBanner } from '@/components/Feedback';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { CaptchaField, type CaptchaPayload } from '@/components/CaptchaField';
import { Field, Input } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/hooks/useAuth';
import { useBootstrapStatus } from '@/hooks/useBootstrapStatus';
import { ApiError, api, errorText } from '@/lib/api';
import { loginSchema, zodErrors } from '@/lib/schemas';
import type { LoginInput } from '@/lib/schemas';

export function LoginPage() {
  const { login, status } = useAuth();
  const location = useLocation();
  const bootstrap = useBootstrapStatus();

  const [values, setValues] = useState<LoginInput>({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<{ code: string | null; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [resendOpen, setResendOpen] = useState(false);
  const [resendCaptcha, setResendCaptcha] = useState<CaptchaPayload>({});
  const [resendError, setResendError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/reminders';

  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }

    setErrors({});
    setFailure(null);
    setResend('idle');
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
    } catch (err) {
      setFailure({
        code: err instanceof ApiError ? err.code : null,
        message: errorText(err, '登录失败，请稍后重试'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResend('sending');
    setResendError(null);
    try {
      // 接口无论邮箱是否存在都返回 202，这里不区分结果（防枚举）
      await api.post<void>('/auth/resend-verification', {
        email: values.email.trim(),
        ...resendCaptcha,
      });
      setResend('sent');
      setResendOpen(false);
    } catch (err) {
      setResend('idle');
      setResendError(errorText(err, '发送失败，请稍后重试'));
    }
  }

  return (
    <AuthLayout
      title="登录"
      description="用管理员发放的邀请码注册，并完成邮箱验证后即可登录。"
      footer={
        <>
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            注册（需邀请码）
          </Link>
          <span className="mx-2 text-slate-300">|</span>
          <Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
            忘记密码
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        {bootstrap.data?.needsBootstrap ? (
          <AlertBanner tone="warn" title="系统尚未初始化">
            还没有 ROOT 账号，
            <Link to="/setup" className="font-medium underline">
              先去完成引导
            </Link>
            。
          </AlertBanner>
        ) : null}

        {failure ? (
          <AlertBanner tone="error" title="登录失败">
            <p>{failure.message}</p>
            {failure.code === 'EMAIL_NOT_VERIFIED' ? (
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={resend === 'sending'}
                  disabled={!values.email.trim()}
                  onClick={() => {
                    setResendError(null);
                    setResendOpen(true);
                  }}
                >
                  重新发送验证邮件
                </Button>
                {resend === 'sent' ? (
                  <span className="text-xs">已提交，请检查邮箱（60 秒内仅一次）</span>
                ) : null}
              </div>
            ) : null}
          </AlertBanner>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Field label="邮箱" htmlFor="email" required error={errors.email}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={values.email}
              invalid={Boolean(errors.email)}
              onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
            />
          </Field>

          <Field label="密码" htmlFor="password" required error={errors.password}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              value={values.password}
              invalid={Boolean(errors.password)}
              onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
            />
          </Field>

          <Button type="submit" className="w-full" loading={submitting}>
            登录
          </Button>
        </form>
      </div>

      <Modal
        open={resendOpen}
        title="重新发送验证邮件"
        description={`将向 ${values.email.trim() || '你的邮箱'} 发送新的验证链接（60 秒一次、每天 5 次）。`}
        onClose={() => setResendOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResendOpen(false)}>
              取消
            </Button>
            <Button loading={resend === 'sending'} onClick={handleResend}>
              发送
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <CaptchaField purpose="resend" onChange={setResendCaptcha} />
          {resendError ? <p className="text-xs text-rose-600">{resendError}</p> : null}
        </div>
      </Modal>
    </AuthLayout>
  );
}
