import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertBanner } from '@/components/Feedback';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { CaptchaField, type CaptchaPayload } from '@/components/CaptchaField';
import { Field, Input } from '@/components/Form';
import { api, errorText } from '@/lib/api';
import { PASSWORD_HINT, registerSchema, zodErrors } from '@/lib/schemas';
import type { RegisterInput } from '@/lib/schemas';

export function RegisterPage() {
  const [values, setValues] = useState<RegisterInput>({
    email: '',
    password: '',
    confirmPassword: '',
    inviteCode: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<CaptchaPayload>({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }
    if (!acceptTerms) {
      setTermsError('请先阅读并同意《用户协议》');
      return;
    }

    setErrors({});
    setTermsError(null);
    setFailure(null);
    setSubmitting(true);
    try {
      await api.post<void>('/auth/register', {
        email: parsed.data.email,
        password: parsed.data.password,
        inviteCode: parsed.data.inviteCode,
        acceptTerms: true,
        ...captcha,
      });
      setSentTo(parsed.data.email);
    } catch (err) {
      setFailure(errorText(err, '注册失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout
        title="注册成功，请验证邮箱"
        description="验证邮件已发送，点击邮件中的链接即可激活账号。"
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            返回登录
          </Link>
        }
      >
        <AlertBanner tone="success" title={`验证邮件已发送至 ${sentTo}`}>
          邮件 1 小时内有效。未收到可回到登录页点击「重新发送验证邮件」（60 秒一次、每天 5 次）。
        </AlertBanner>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="注册"
      description="邀请码由管理员生成并绑定你的邮箱，请向管理员索取。"
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          已有账号，去登录
        </Link>
      }
    >
      <div className="space-y-4">
        {failure ? (
          <AlertBanner tone="error" title="注册失败">
            {failure}
          </AlertBanner>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Field label="邮箱" htmlFor="email" required error={errors.email} hint="必须与邀请码绑定的邮箱一致">
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

          <Field label="邀请码" htmlFor="inviteCode" required error={errors.inviteCode}>
            <Input
              id="inviteCode"
              placeholder="INV-XXXXXX"
              value={values.inviteCode}
              invalid={Boolean(errors.inviteCode)}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, inviteCode: event.target.value }))
              }
            />
          </Field>

          <Field
            label="密码"
            htmlFor="password"
            required
            hint={PASSWORD_HINT}
            error={errors.password}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={values.password}
              invalid={Boolean(errors.password)}
              onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
            />
          </Field>

          <Field label="确认密码" htmlFor="confirmPassword" required error={errors.confirmPassword}>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={values.confirmPassword}
              invalid={Boolean(errors.confirmPassword)}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, confirmPassword: event.target.value }))
              }
            />
          </Field>

          <CaptchaField purpose="register" onChange={setCaptcha} />

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300"
              checked={acceptTerms}
              onChange={(event) => {
                setAcceptTerms(event.target.checked);
                if (event.target.checked) setTermsError(null);
              }}
            />
            <span>
              我已阅读并同意
              <Link to="/terms" target="_blank" className="mx-1 font-medium text-brand-600 underline">
                《用户协议》
              </Link>
              与隐私说明
            </span>
          </label>
          {termsError ? <p className="text-xs text-rose-600">{termsError}</p> : null}

          <Button type="submit" className="w-full" loading={submitting}>
            注册并发送验证邮件
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
