import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertBanner, LoadingBlock } from '@/components/Feedback';
import { AuthLayout } from '@/components/AuthLayout';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Form';
import { useBootstrapStatus } from '@/hooks/useBootstrapStatus';
import { api, errorText } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import { PASSWORD_HINT, setupSchema, zodErrors } from '@/lib/schemas';
import type { SetupInput } from '@/lib/schemas';

/**
 * 首次部署引导页：一次性引导码 + 邮箱 + 密码创建 ROOT。
 * 引导码由服务端启动时生成（见 docs/decisions.md D-14），成功后入口永久关闭。
 */
export function SetupPage() {
  const status = useBootstrapStatus();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<SetupInput>({
    setupCode: '',
    email: '',
    password: '',
    displayName: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const parsed = setupSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }

    setErrors({});
    setFailure(null);
    setSubmitting(true);
    try {
      const displayName = parsed.data.displayName?.trim();
      await api.post<void>('/bootstrap', {
        setupCode: parsed.data.setupCode,
        email: parsed.data.email,
        password: parsed.data.password,
        ...(displayName ? { displayName } : {}),
      });
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: qk.bootstrapStatus });
    } catch (err) {
      setFailure(errorText(err, '引导失败，请检查引导码'));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthLayout
        title="ROOT 账号已创建"
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            去登录
          </Link>
        }
      >
        <AlertBanner tone="success" title="引导完成">
          引导入口已永久关闭。现在用刚才的邮箱和密码登录，随后可生成邀请码邀请其他用户。
        </AlertBanner>
      </AuthLayout>
    );
  }

  if (status.isLoading) {
    return (
      <AuthLayout title="系统引导">
        <LoadingBlock text="正在检查引导状态…" />
      </AuthLayout>
    );
  }

  if (status.data && !status.data.needsBootstrap) {
    return (
      <AuthLayout
        title="系统已完成引导"
        footer={
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            去登录
          </Link>
        }
      >
        <AlertBanner tone="info" title="引导入口已关闭">
          已存在 ROOT 账号，无需再次引导。如需转移根权限，请登录后由 ROOT 在「用户管理」中转让。
        </AlertBanner>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="初始化系统"
      description="填写一次性引导码创建 ROOT 账号。引导码在服务端启动日志或 data/bootstrap-code.txt 中。"
      footer={
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
          已有账号，去登录
        </Link>
      }
    >
      <div className="space-y-4">
        {status.isError ? (
          <AlertBanner tone="warn" title="无法确认引导状态">
            可能服务端尚未启动。仍可尝试提交，若已引导会提示「已完成引导」。
          </AlertBanner>
        ) : null}

        {failure ? (
          <AlertBanner tone="error" title="引导失败">
            {failure}
          </AlertBanner>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Field
            label="一次性引导码"
            htmlFor="setupCode"
            required
            hint="形如 K7F2-9QX1，仅可使用一次"
            error={errors.setupCode}
          >
            <Input
              id="setupCode"
              autoComplete="off"
              placeholder="K7F2-9QX1"
              value={values.setupCode}
              invalid={Boolean(errors.setupCode)}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, setupCode: event.target.value }))
              }
            />
          </Field>

          <Field label="ROOT 邮箱" htmlFor="email" required error={errors.email}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="root@example.com"
              value={values.email}
              invalid={Boolean(errors.email)}
              onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
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

          <Field
            label="昵称"
            htmlFor="displayName"
            hint="可选，默认留空"
            error={errors.displayName}
          >
            <Input
              id="displayName"
              value={values.displayName}
              invalid={Boolean(errors.displayName)}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, displayName: event.target.value }))
              }
            />
          </Field>

          <Button type="submit" className="w-full" loading={submitting}>
            创建 ROOT 账号
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
