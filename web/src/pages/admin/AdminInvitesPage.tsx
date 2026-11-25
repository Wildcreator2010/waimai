import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertBanner } from '@/components/Feedback';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card, CardHeader } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import { Field, Input, Select } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { useAdminInvites, useCreateInvite, useDeleteInvite } from '@/hooks/useAdmin';
import type { InviteFilter } from '@/lib/queryKeys';
import { errorText } from '@/lib/api';
import { inviteCreateSchema, zodErrors } from '@/lib/schemas';
import type { InviteCreateInput } from '@/lib/schemas';
import type { Invite } from '@/lib/types';
import { formatDate, formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 20;

type InviteState = 'unused' | 'used' | 'expired';

function inviteState(invite: Invite): InviteState {
  if (invite.usedAt) return 'used';
  if (new Date(invite.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'unused';
}

const STATE_LABEL: Record<InviteState, { text: string; tone: 'green' | 'gray' | 'amber' }> = {
  unused: { text: '未使用', tone: 'green' },
  used: { text: '已使用', tone: 'gray' },
  expired: { text: '已过期', tone: 'amber' },
};

export function AdminInvitesPage() {
  const [filter, setFilter] = useState<InviteFilter | ''>('');
  const [page, setPage] = useState(1);
  const query = useAdminInvites({ status: filter, page, pageSize: PAGE_SIZE });

  const createInvite = useCreateInvite();
  const deleteInvite = useDeleteInvite();

  const [values, setValues] = useState<InviteCreateInput>({
    email: '',
    expiresInDays: '7',
    note: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createInvite.isPending) return;

    const parsed = inviteCreateSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }
    setErrors({});
    setFailure(null);
    try {
      const created = await createInvite.mutateAsync({
        email: parsed.data.email,
        expiresInDays: parsed.data.expiresInDays,
        ...(parsed.data.note?.trim() ? { note: parsed.data.note.trim() } : {}),
      });
      setNotice(`已生成邀请码 ${created.code}（${created.email}，${formatDate(created.expiresAt)} 前有效）`);
      setValues({ email: '', expiresInDays: '7', note: '' });
    } catch (err) {
      setFailure(errorText(err, '生成邀请码失败'));
    }
  }

  async function handleDelete(invite: Invite) {
    setFailure(null);
    setNotice(null);
    try {
      await deleteInvite.mutateAsync(invite.id);
      setNotice(`已删除邀请码 ${invite.code}`);
    } catch (err) {
      setFailure(errorText(err, '删除失败（仅未使用的邀请码可删）'));
    }
  }

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`已复制邀请码 ${code}`);
    } catch {
      setNotice(`复制失败，请手动选中 ${code}`);
    }
  }

  const columns: Column<Invite>[] = [
    {
      key: 'code',
      header: '邀请码',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-slate-800">{row.code}</span>
          <Button size="sm" variant="ghost" onClick={() => void handleCopy(row.code)}>
            复制
          </Button>
        </div>
      ),
    },
    {
      key: 'email',
      header: '绑定邮箱',
      render: (row) => <span className="text-sm">{row.email}</span>,
    },
    {
      key: 'state',
      header: '状态',
      render: (row) => {
        const state = inviteState(row);
        return <Badge tone={STATE_LABEL[state].tone}>{STATE_LABEL[state].text}</Badge>;
      },
    },
    {
      key: 'expiresAt',
      header: '有效期至',
      render: (row) => (
        <span className="text-xs text-slate-500">{formatDateTime(row.expiresAt)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: '创建时间',
      render: (row) => (
        <span className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'note',
      header: '备注',
      render: (row) => <span className="text-xs text-slate-500">{row.note || '—'}</span>,
    },
    {
      key: 'actions',
      header: '操作',
      render: (row) =>
        inviteState(row) === 'unused' ? (
          <Button
            size="sm"
            variant="danger"
            disabled={deleteInvite.isPending}
            onClick={() => void handleDelete(row)}
          >
            删除
          </Button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="邀请码"
        description="一码一邮箱，注册时邮箱必须完全匹配；过期或已使用的不可删除。"
      />

      {notice ? <AlertBanner tone="success" className="mb-3">{notice}</AlertBanner> : null}
      {failure ? (
        <AlertBanner tone="error" title="操作失败" className="mb-3">
          {failure}
        </AlertBanner>
      ) : null}

      <Card className="mb-4">
        <CardHeader title="生成邀请码" />
        <form className="flex flex-wrap items-end gap-2" onSubmit={handleCreate} noValidate>
          <Field
            label="目标邮箱"
            htmlFor="inviteEmail"
            required
            className="min-w-[220px] flex-1"
            error={errors.email}
          >
            <Input
              id="inviteEmail"
              type="email"
              placeholder="invitee@example.com"
              value={values.email}
              invalid={Boolean(errors.email)}
              onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
            />
          </Field>
          <Field
            label="有效期（天）"
            htmlFor="expiresInDays"
            required
            className="w-32"
            error={errors.expiresInDays}
          >
            <Input
              id="expiresInDays"
              inputMode="numeric"
              value={values.expiresInDays}
              invalid={Boolean(errors.expiresInDays)}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, expiresInDays: event.target.value }))
              }
            />
          </Field>
          <Field label="备注" htmlFor="inviteNote" className="min-w-[180px] flex-1" error={errors.note}>
            <Input
              id="inviteNote"
              placeholder="可选"
              value={values.note}
              invalid={Boolean(errors.note)}
              onChange={(event) => setValues((prev) => ({ ...prev, note: event.target.value }))}
            />
          </Field>
          <Button type="submit" loading={createInvite.isPending}>
            生成
          </Button>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">邀请码列表</h2>
          <div className="flex items-center gap-2">
            <Select
              aria-label="筛选邀请码状态"
              className="h-8 w-32 py-0 text-xs"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as InviteFilter | '');
                setPage(1);
              }}
            >
              <option value="">全部</option>
              <option value="unused">未使用</option>
              <option value="used">已使用</option>
              <option value="expired">已过期</option>
            </Select>
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyTitle="没有邀请码"
          emptyDescription="用上方表单生成一个，把邀请码发给对应邮箱的用户。"
          minWidthClass="min-w-[860px]"
        />

        {query.data ? (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={query.data.total}
            onChange={setPage}
            disabled={query.isFetching}
          />
        ) : null}
      </Card>
    </div>
  );
}
