import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertBanner } from '@/components/Feedback';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { CaptchaField, type CaptchaPayload } from '@/components/CaptchaField';
import { Field, Input } from '@/components/Form';
import { api, errorText } from '@/lib/api';
import { forgotPasswordSchema, zodErrors } from '@/lib/schemas';
import type { ForgotPasswordInput } from '@/lib/schemas';

export function ForgotPasswordPage() {
  const [values, setValues] = useState<ForgotPasswordInput>({ email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<CaptchaPayload>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const parsed = forgotPasswordSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }

    setErrors({});
    setFailure(null);
    setSubmitting(true);
    try {
      await api.post<void>('/auth/forgot-password', { email: parsed.data.email, ...captcha });
      setSentTo(parsed.data.email);
    } catch (err) {
      setFailure(errorText(err, '提交失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout
        title="重置邮件已提交"
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            返回登录
          </Link>
        }
      >
        <AlertBanner tone="info" title={`若 ${sentTo} 已注册，重置邮件已发送`}>
          邮件 1 小时内有效。为防账号枚举，无论邮箱是否存在都返回相同结果。
        </AlertBanner>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="忘记密码"
      description="输入注册邮箱，我们会发送一封重置密码邮件（1 小时内有效）。"
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          返回登录
        </Link>
      }
    >
      <div className="space-y-4">
        {failure ? (
          <AlertBanner tone="error" title="提交失败">
            {failure}
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
              onChange={(event) => setValues({ email: event.target.value })}
            />
          </Field>

          <CaptchaField purpose="forgot" onChange={setCaptcha} />

          <Button type="submit" className="w-full" loading={submitting}>
            发送重置邮件
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
