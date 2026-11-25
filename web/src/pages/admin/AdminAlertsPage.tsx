import { useState } from 'react';
import { AlertBanner } from '@/components/Feedback';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import { Select } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { AlertLevelBadge } from '@/components/StatusBadge';
import { useAckAlert, useAdminAlerts } from '@/hooks/useAdmin';
import { errorText } from '@/lib/api';
import { api } from '@/lib/api';
import type { AdminAlert } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

const PAGE_SIZE = 20;

export function AdminAlertsPage() {
  const [acked, setAcked] = useState<boolean | ''>(false);
  const [page, setPage] = useState(1);

  const query = useAdminAlerts({ acked, page, pageSize: PAGE_SIZE });
  const ack = useAckAlert();

  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function handleAck(alert: AdminAlert) {
    setFailure(null);
    setNotice(null);
    try {
      await ack.mutateAsync(alert.id);
      setNotice(`已确认告警：${alert.type}`);
    } catch (err) {
      setFailure(errorText(err, '确认告警失败'));
    }
  }

  const columns: Column<AdminAlert>[] = [
    {
      key: 'level',
      header: '级别',
      render: (row) => <AlertLevelBadge level={row.level} />,
    },
    {
      key: 'type',
      header: '类型',
      render: (row) => <span className="font-mono text-xs text-slate-600">{row.type}</span>,
    },
    {
      key: 'message',
      header: '内容',
      className: 'max-w-[420px]',
      render: (row) => <p className="whitespace-pre-wrap break-words text-sm">{row.message}</p>,
    },
    {
      key: 'createdAt',
      header: '创建时间',
      render: (row) => (
        <span className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'acked',
      header: '确认状态',
      render: (row) =>
        row.ackedAt ? (
          <span className="text-xs text-slate-500">
            已确认 · {formatDateTime(row.ackedAt)}
            {row.ackedByEmail ? ` · ${row.ackedByEmail}` : ''}
          </span>
        ) : (
          <span className="text-xs font-medium text-amber-600">未确认</span>
        ),
    },
    {
      key: 'actions',
      header: '操作',
      render: (row) =>
        row.ackedAt ? (
          <span className="text-xs text-slate-400">—</span>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            loading={ack.isPending}
            onClick={() => void handleAck(row)}
          >
            确认
          </Button>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="告警"
        description="短信失败、MemberToken 失效、轮询异常等会在这里留痕，并同时发邮件给 ROOT。"
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={testing}
            onClick={async () => {
              setTesting(true);
              setNotice(null);
              setFailure(null);
              try {
                const result = await api.post<{
                  fcm: { sent: number; skipped: boolean; reason?: string };
                  ntfy: { attempted: boolean; ok: boolean };
                }>('/admin/notifications/test');
                setNotice(
                  `测试推送已发出：FCM ${result.fcm.skipped ? '跳过' : `送达 ${result.fcm.sent}`}，ntfy ${
                    result.ntfy.attempted ? (result.ntfy.ok ? '成功' : '失败') : '未启用'
                  }`,
                );
              } catch (err) {
                setFailure(errorText(err, '测试推送失败'));
              } finally {
                setTesting(false);
              }
            }}
          >
            发送测试推送
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">告警列表</h2>
          <Select
            aria-label="筛选确认状态"
            className="h-8 w-32 py-0 text-xs"
            value={acked === '' ? '' : String(acked)}
            onChange={(event) => {
              const value = event.target.value;
              setAcked(value === '' ? '' : value === 'true');
              setPage(1);
            }}
          >
            <option value="false">未确认</option>
            <option value="true">已确认</option>
            <option value="">全部</option>
          </Select>
        </div>

        <DataTable
          columns={columns}
          rows={query.data?.items}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyTitle="没有告警"
          emptyDescription="当前没有需要处理的告警。"
          minWidthClass="min-w-[820px]"
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
