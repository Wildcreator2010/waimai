import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertBanner } from '@/components/Feedback';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import { Field, Input, Select } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { RoleBadge, UserStatusBadge, ROLE_TEXT, USER_STATUS_TEXT } from '@/components/StatusBadge';
import {
  useAdminCreateUser,
  useAdminDeleteUser,
  useAdminUpdateUser,
  useAdminUsers,
  useRootTransfer,
} from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import { errorText } from '@/lib/api';
import { adminUserCreateSchema, zodErrors } from '@/lib/schemas';
import type { AdminUserCreateInput } from '@/lib/schemas';
import type { AdminUserRow, Role, User, UserStatus } from '@/lib/types';
import { formatDate, formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 20;

interface RowPermissions {
  toggleStatus: boolean;
  remove: boolean;
  changeRole: boolean;
  transfer: boolean;
}

/**
 * 权限矩阵（docs/architecture.md §5.4）：
 * - ROOT 不可被停用/删除/降级，只能转让；
 * - ADMIN 只能停用/删除 USER，不能动其他 ADMIN，也不能提权；
 * - ROOT 可以停用/删除 ADMIN 与 USER、提升/降级角色；
 * - 任何人不能停用/删除自己（ROOT 只能转让）。
 */
function rowPermissions(me: User | null, target: AdminUserRow): RowPermissions {
  const none: RowPermissions = {
    toggleStatus: false,
    remove: false,
    changeRole: false,
    transfer: false,
  };
  if (!me) return none;
  if (target.role === 'ROOT') return none;
  if (target.id === me.id) return none;

  if (me.role === 'ROOT') {
    return {
      toggleStatus: true,
      remove: true,
      changeRole: true,
      transfer: target.role === 'ADMIN',
    };
  }
  if (me.role === 'ADMIN' && target.role === 'USER') {
    return { toggleStatus: true, remove: true, changeRole: false, transfer: false };
  }
  return none;
}

export function AdminUsersPage() {
  const { user: me, isRoot } = useAuth();

  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(1);

  const query = useAdminUsers({ q, role, status, page, pageSize: PAGE_SIZE });
  const updateUser = useAdminUpdateUser();
  const deleteUser = useAdminDeleteUser();
  const transferRoot = useRootTransfer();
  const createUser = useAdminCreateUser();

  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUserRow | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<AdminUserRow | null>(null);
  const [transferPassword, setTransferPassword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createValues, setCreateValues] = useState<AdminUserCreateInput>({
    email: '',
    password: '',
    role: 'USER',
    displayName: '',
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  function resetFilters(next: () => void) {
    next();
    setPage(1);
  }

  async function handleToggleStatus(target: AdminUserRow) {
    setFailure(null);
    setNotice(null);
    const nextStatus: UserStatus = target.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await updateUser.mutateAsync({ id: target.id, patch: { status: nextStatus } });
      setNotice(`${target.email} 已${nextStatus === 'ACTIVE' ? '启用' : '停用'}`);
    } catch (err) {
      setFailure(errorText(err, '修改状态失败'));
    }
  }

  async function handleRoleChange(target: AdminUserRow, nextRole: Role) {
    setFailure(null);
    setNotice(null);
    try {
      await updateUser.mutateAsync({ id: target.id, patch: { role: nextRole } });
      setNotice(`${target.email} 的角色已改为 ${ROLE_TEXT[nextRole]}`);
    } catch (err) {
      setFailure(errorText(err, '修改角色失败'));
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setFailure(null);
    try {
      await deleteUser.mutateAsync(pendingDelete.id);
      setNotice(`${pendingDelete.email} 已删除`);
      setPendingDelete(null);
    } catch (err) {
      setPendingDelete(null);
      setFailure(errorText(err, '删除失败'));
    }
  }

  async function handleTransfer() {
    if (!pendingTransfer) return;
    if (!transferPassword) {
      setFailure('请输入你的 ROOT 密码以确认转让');
      return;
    }
    setFailure(null);
    try {
      await transferRoot.mutateAsync({
        userId: pendingTransfer.id,
        password: transferPassword,
      });
      setPendingTransfer(null);
      setTransferPassword('');
      setNotice(
        `ROOT 已转让给 ${pendingTransfer.email}。你的会话已被撤销，请重新登录（你会变成 ADMIN）。`,
      );
    } catch (err) {
      setFailure(errorText(err, '转让失败'));
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createUser.isPending) return;

    const parsed = adminUserCreateSchema.safeParse(createValues);
    if (!parsed.success) {
      setCreateErrors(zodErrors(parsed.error));
      return;
    }
    setCreateErrors({});
    setFailure(null);
    try {
      await createUser.mutateAsync({
        email: parsed.data.email,
        password: parsed.data.password,
        role: parsed.data.role,
        ...(parsed.data.displayName?.trim() ? { displayName: parsed.data.displayName.trim() } : {}),
      });
      setCreateOpen(false);
      setCreateValues({ email: '', password: '', role: 'USER', displayName: '' });
      setNotice('账号已创建（已激活，首次登录需改密）');
    } catch (err) {
      setFailure(errorText(err, '创建账号失败'));
    }
  }

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'email',
      header: '邮箱',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{row.email}</p>
          {row.displayName ? <p className="text-xs text-slate-500">{row.displayName}</p> : null}
        </div>
      ),
    },
    {
      key: 'role',
      header: '角色',
      render: (row) => {
        const perms = rowPermissions(me, row);
        if (!perms.changeRole) return <RoleBadge role={row.role} />;
        return (
          <Select
            aria-label={`修改 ${row.email} 的角色`}
            className="h-8 w-28 py-0 text-xs"
            value={row.role}
            disabled={updateUser.isPending}
            onChange={(event) => void handleRoleChange(row, event.target.value as Role)}
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </Select>
        );
      },
    },
    {
      key: 'status',
      header: '状态',
      render: (row) => <UserStatusBadge status={row.status} />,
    },
    {
      key: 'phone',
      header: '手机号',
      render: (row) => <span className="font-mono text-xs">{row.phone || '—'}</span>,
    },
    {
      key: 'createdAt',
      header: '注册',
      render: (row) => <span className="text-xs text-slate-500">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'lastLoginAt',
      header: '最近登录',
      render: (row) => (
        <span className="text-xs text-slate-500">{formatDateTime(row.lastLoginAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      render: (row) => {
        const perms = rowPermissions(me, row);
        const nothing = !perms.toggleStatus && !perms.remove && !perms.transfer;
        if (nothing) return <span className="text-xs text-slate-400">—</span>;
        return (
          <div className="flex flex-wrap gap-1.5">
            {perms.toggleStatus ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={updateUser.isPending}
                onClick={() => void handleToggleStatus(row)}
              >
                {row.status === 'ACTIVE' ? '停用' : '启用'}
              </Button>
            ) : null}
            {perms.transfer ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setTransferPassword('');
                  setPendingTransfer(row);
                }}
              >
                转让 ROOT
              </Button>
            ) : null}
            {perms.remove ? (
              <Button size="sm" variant="danger" onClick={() => setPendingDelete(row)}>
                删除
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="停用会立刻阻止登录；删除会级联清理该用户的任务、设备与会话。"
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            新建账号
          </Button>
        }
      />

      {notice ? <AlertBanner tone="success" className="mb-3">{notice}</AlertBanner> : null}
      {failure ? (
        <AlertBanner tone="error" title="操作失败" className="mb-3">
          {failure}
        </AlertBanner>
      ) : null}

      <Card>
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            resetFilters(() => setQ(qInput.trim()));
          }}
        >
          <Field label="搜索邮箱" htmlFor="q" className="min-w-[200px] flex-1">
            <Input
              id="q"
              placeholder="按邮箱搜索"
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
            />
          </Field>
          <Field label="角色" htmlFor="role" className="w-32">
            <Select
              id="role"
              value={role}
              onChange={(event) => resetFilters(() => setRole(event.target.value as Role | ''))}
            >
              <option value="">全部</option>
              <option value="ROOT">ROOT</option>
              <option value="ADMIN">ADMIN</option>
              <option value="USER">USER</option>
            </Select>
          </Field>
          <Field label="状态" htmlFor="status" className="w-36">
            <Select
              id="status"
              value={status}
              onChange={(event) =>
                resetFilters(() => setStatus(event.target.value as UserStatus | ''))
              }
            >
              <option value="">全部</option>
              {(Object.keys(USER_STATUS_TEXT) as UserStatus[]).map((value) => (
                <option key={value} value={value}>
                  {USER_STATUS_TEXT[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary">
            搜索
          </Button>
        </form>

        <DataTable
          columns={columns}
          rows={query.data?.items}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyTitle="没有匹配的用户"
          emptyDescription="调整搜索条件后重试。"
          minWidthClass="min-w-[900px]"
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

      <Modal
        open={pendingDelete !== null}
        title="删除该账号？"
        description="将级联删除该用户的任务、设备与登录会话，操作不可撤销。"
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button variant="danger" loading={deleteUser.isPending} onClick={handleDelete}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{pendingDelete?.email}</p>
      </Modal>

      <Modal
        open={pendingTransfer !== null}
        title="转让 ROOT"
        description="目标账号升为 ROOT，你降为 ADMIN，双方会话全部撤销，并写入审计。此操作不可撤销。"
        onClose={() => {
          setPendingTransfer(null);
          setTransferPassword('');
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPendingTransfer(null);
                setTransferPassword('');
              }}
            >
              取消
            </Button>
            <Button
              variant="danger"
              loading={transferRoot.isPending}
              disabled={!transferPassword}
              onClick={handleTransfer}
            >
              确认转让
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">目标账号：{pendingTransfer?.email}</p>
        <Field label="你的 ROOT 密码" htmlFor="transferPassword" required>
          <Input
            id="transferPassword"
            type="password"
            autoComplete="current-password"
            value={transferPassword}
            onChange={(event) => setTransferPassword(event.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={createOpen}
        title="新建账号"
        description="直接创建已激活账号（不发验证邮件），首次登录需改密。"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="submit" form="admin-create-user" loading={createUser.isPending}>
              创建
            </Button>
          </>
        }
      >
        <form id="admin-create-user" className="space-y-3" onSubmit={handleCreate} noValidate>
          <Field label="邮箱" htmlFor="newEmail" required error={createErrors.email}>
            <Input
              id="newEmail"
              type="email"
              value={createValues.email}
              invalid={Boolean(createErrors.email)}
              onChange={(event) =>
                setCreateValues((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </Field>
          <Field
            label="初始密码"
            htmlFor="newPassword"
            required
            hint="至少 8 位，含字母与数字"
            error={createErrors.password}
          >
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={createValues.password}
              invalid={Boolean(createErrors.password)}
              onChange={(event) =>
                setCreateValues((prev) => ({ ...prev, password: event.target.value }))
              }
            />
          </Field>
          <Field label="角色" htmlFor="newRole" required error={createErrors.role}>
            <Select
              id="newRole"
              value={createValues.role}
              onChange={(event) =>
                setCreateValues((prev) => ({ ...prev, role: event.target.value as 'USER' | 'ADMIN' }))
              }
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </Select>
          </Field>
          <Field label="昵称" htmlFor="newDisplayName" error={createErrors.displayName}>
            <Input
              id="newDisplayName"
              value={createValues.displayName}
              onChange={(event) =>
                setCreateValues((prev) => ({ ...prev, displayName: event.target.value }))
              }
            />
          </Field>
          {isRoot ? null : (
            <p className="text-xs text-slate-500">
              提示：ADMIN 创建账号只能创建 USER；提升为 ADMIN 需要 ROOT 操作。
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
}
