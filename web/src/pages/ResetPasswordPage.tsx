import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertBanner } from '@/components/Feedback';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Form';
import { api, errorText } from '@/lib/api';
import { PASSWORD_HINT, resetPasswordSchema, zodErrors } from '@/lib/schemas';
import type { ResetPasswordInput } from '@/lib/schemas';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [values, setValues] = useState<ResetPasswordInput>({
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const parsed = resetPasswordSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }

    setErrors({});
    setFailure(null);
    setSubmitting(true);
    try {
      await api.post<void>('/auth/reset-password', {
        token,
        newPassword: parsed.data.newPassword,
      });
      setDone(true);
    } catch (err) {
      setFailure(errorText(err, '重置失败，链接可能已失效'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout
        title="重置密码"
        footer={
          <Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
            重新发送重置邮件
          </Link>
        }
      >
        <AlertBanner tone="error" title="链接无效">
          缺少 token 参数，请重新点击邮件里的重置链接。
        </AlertBanner>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout
        title="密码已重置"
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            去登录
          </Link>
        }
      >
        <AlertBanner tone="success" title="密码已更新">
          该账号的其他登录会话已全部失效，请用新密码重新登录。
        </AlertBanner>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="重置密码" description="设置一个新密码，提交后其他设备需重新登录。">
      <div className="space-y-4">
        {failure ? (
          <AlertBanner tone="error" title="重置失败">
            {failure}
          </AlertBanner>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Field
            label="新密码"
            htmlFor="newPassword"
            required
            hint={PASSWORD_HINT}
            error={errors.newPassword}
          >
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={values.newPassword}
              invalid={Boolean(errors.newPassword)}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, newPassword: event.target.value }))
              }
            />
          </Field>

          <Field
            label="确认新密码"
            htmlFor="confirmPassword"
            required
            error={errors.confirmPassword}
          >
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

          <Button type="submit" className="w-full" loading={submitting}>
            提交新密码
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
