import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertBanner, ErrorState, LoadingBlock } from '@/components/Feedback';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card, CardHeader } from '@/components/Card';
import { Field, Input } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { useMemberToken, useUpdateMemberToken, useVerifyMemberToken } from '@/hooks/useAdmin';
import { errorText } from '@/lib/api';
import { memberTokenSchema, zodErrors } from '@/lib/schemas';
import { formatDateTime } from '@/lib/utils';

export function AdminMemberTokenPage() {
  const token = useMemberToken();
  const updateToken = useUpdateMemberToken();
  const verifyToken = useVerifyMemberToken();

  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (updateToken.isPending) return;

    const parsed = memberTokenSchema.safeParse({ token: value });
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }
    setErrors({});
    setFailure(null);
    setNotice(null);
    try {
      await updateToken.mutateAsync(parsed.data.token);
      setValue('');
      setNotice('MemberToken 已加密入库，并已用 openMark 验证一次');
    } catch (err) {
      setFailure(errorText(err, '保存失败'));
    }
  }

  async function handleVerify() {
    setFailure(null);
    setNotice(null);
    setVerifyResult(null);
    try {
      const result = await verifyToken.mutateAsync();
      setVerifyResult(result);
    } catch (err) {
      setFailure(errorText(err, '测试失败'));
    }
  }

  if (token.isLoading) return <LoadingBlock text="正在加载凭证状态…" />;
  if (token.isError) return <ErrorState error={token.error} onRetry={() => void token.refetch()} />;
  if (!token.data) return <ErrorState error={new Error('凭证信息为空')} />;

  const info = token.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="MemberToken"
        description="取餐柜开放接口凭证。任何接口都不回传明文，只展示掩码；保存后会立即验证并写审计。"
        actions={
          <Button size="sm" variant="secondary" loading={verifyToken.isPending} onClick={handleVerify}>
            测试有效性
          </Button>
        }
      />

      {notice ? <AlertBanner tone="success">{notice}</AlertBanner> : null}
      {failure ? (
        <AlertBanner tone="error" title="操作失败">
          {failure}
        </AlertBanner>
      ) : null}
      {verifyResult ? (
        <AlertBanner
          tone={verifyResult.ok ? 'success' : 'error'}
          title={verifyResult.ok ? '验证通过' : '验证失败'}
        >
          {verifyResult.message}
        </AlertBanner>
      ) : null}
      {info.expiringSoon ? (
        <AlertBanner tone="warn" title="凭证即将过期">
          请尽快在取餐柜侧更新 MemberToken 并重新保存，避免轮询中断。
        </AlertBanner>
      ) : null}
      {!info.configured ? (
        <AlertBanner tone="warn" title="尚未配置 MemberToken">
          未配置时轮询无法查询取餐柜，任务会一直停留在待查询状态。
        </AlertBanner>
      ) : null}

      <Card>
        <CardHeader
          title="当前凭证"
          actions={
            <Badge tone={info.configured ? 'green' : 'amber'}>
              {info.configured ? '已配置' : '未配置'}
            </Badge>
          }
        />
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">掩码</dt>
            <dd className="break-all font-mono text-sm text-slate-800">{info.masked ?? '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">最后修改</dt>
            <dd className="text-sm text-slate-800">
              {formatDateTime(info.updatedAt)}
              {info.updatedBy ? ` · ${info.updatedBy}` : ''}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">最近验证时间</dt>
            <dd className="text-sm text-slate-800">{formatDateTime(info.lastVerifiedAt)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">最近验证结果</dt>
            <dd className="text-sm text-slate-800">
              {info.lastVerifyOk === null ? (
                <Badge tone="gray">未验证</Badge>
              ) : info.lastVerifyOk ? (
                <Badge tone="green">通过</Badge>
              ) : (
                <Badge tone="red">失败</Badge>
              )}
              {info.lastVerifyMessage ? (
                <span className="ml-2 text-xs text-slate-500">{info.lastVerifyMessage}</span>
              ) : null}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="更新凭证"
          description="粘贴新的 MemberToken 明文，保存后服务端加密入库并立即验证。"
        />
        <form className="space-y-3" onSubmit={handleSave} noValidate>
          <Field label="新的 MemberToken" htmlFor="memberToken" required error={errors.token}>
            <Input
              id="memberToken"
              type={reveal ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="至少 8 个字符，不能含空白"
              value={value}
              invalid={Boolean(errors.token)}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={updateToken.isPending} disabled={!value.trim()}>
              保存并验证
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setReveal((prev) => !prev)}>
              {reveal ? '隐藏输入' : '显示输入'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
