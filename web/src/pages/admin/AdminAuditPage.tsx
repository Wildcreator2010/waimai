import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/Button';
import { AlertBanner } from '@/components/Feedback';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import { Field, Input } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { useAuditLogs } from '@/hooks/useAdmin';
import { downloadFile, errorText } from '@/lib/api';
import type { AuditListParams } from '@/lib/queryKeys';
import type { AuditLog } from '@/lib/types';
import { formatDateTimeSeconds, localInputToIso } from '@/lib/utils';

const PAGE_SIZE = 20;

export function AdminAuditPage() {
  const [actionInput, setActionInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [params, setParams] = useState<AuditListParams>({
    action: '',
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const query = useAuditLogs(params);

  function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParams({
      action: actionInput.trim(),
      from: localInputToIso(fromInput),
      to: localInputToIso(toInput),
      page: 1,
      pageSize: PAGE_SIZE,
    });
  }

  function handleReset() {
    setActionInput('');
    setFromInput('');
    setToInput('');
    setParams({ action: '', page: 1, pageSize: PAGE_SIZE });
  }

  const columns: Column<AuditLog>[] = [
    {
      key: 'createdAt',
      header: '时间',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-500">
          {formatDateTimeSeconds(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actor',
      header: '操作者',
      render: (row) => (
        <span className="text-xs">{row.actorEmail || row.actorId || '系统'}</span>
      ),
    },
    {
      key: 'action',
      header: '动作',
      render: (row) => <span className="font-mono text-xs text-slate-700">{row.action}</span>,
    },
    {
      key: 'target',
      header: '目标',
      render: (row) =>
        row.targetType || row.targetId ? (
          <span className="text-xs text-slate-600">
            {row.targetType || '—'}
            {row.targetId ? ` · ${row.targetId}` : ''}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: 'detail',
      header: '详情',
      className: 'max-w-[360px]',
      render: (row) => (
        <p className="whitespace-pre-wrap break-words text-xs text-slate-600">{row.detail || '—'}</p>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      render: (row) => <span className="font-mono text-xs text-slate-500">{row.ip || '—'}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="审计日志"
        description="角色变更、MemberToken、系统设置、邀请码、告警确认等写操作都会留痕（保留 90 天）。"
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={exporting}
            onClick={async () => {
              setExporting(true);
              setExportError(null);
              try {
                const params = new URLSearchParams();
                if (actionInput.trim()) params.set('action', actionInput.trim());
                const fromIso = localInputToIso(fromInput);
                if (fromIso) params.set('from', fromIso);
                const toIso = localInputToIso(toInput);
                if (toIso) params.set('to', toIso);
                const query = params.toString();
                await downloadFile(
                  `/admin/audit/export${query ? `?${query}` : ''}`,
                  `audit-${new Date().toISOString().slice(0, 10)}.csv`,
                );
              } catch (err) {
                setExportError(errorText(err, '导出失败'));
              } finally {
                setExporting(false);
              }
            }}
          >
            导出 CSV
          </Button>
        }
      />

      {exportError ? (
        <AlertBanner tone="error" className="mb-3">
          {exportError}
        </AlertBanner>
      ) : null}

      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={handleFilter}>
          <Field label="动作" htmlFor="action" className="min-w-[180px] flex-1" hint="按 action 精确/模糊匹配由服务端决定">
            <Input
              id="action"
              placeholder="例如 ROLE_CHANGE"
              value={actionInput}
              onChange={(event) => setActionInput(event.target.value)}
            />
          </Field>
          <Field label="起始时间" htmlFor="from" className="w-48">
            <Input
              id="from"
              type="datetime-local"
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
            />
          </Field>
          <Field label="结束时间" htmlFor="to" className="w-48">
            <Input
              id="to"
              type="datetime-local"
              value={toInput}
              onChange={(event) => setToInput(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="secondary">
            筛选
          </Button>
          <Button type="button" variant="ghost" onClick={handleReset}>
            重置
          </Button>
        </form>

        <DataTable
          columns={columns}
          rows={query.data?.items}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyTitle="没有审计记录"
          emptyDescription="调整筛选条件后重试。"
          minWidthClass="min-w-[900px]"
        />

        {query.data ? (
          <Pagination
            page={params.page}
            pageSize={PAGE_SIZE}
            total={query.data.total}
            onChange={(page) => setParams((prev) => ({ ...prev, page }))}
            disabled={query.isFetching}
          />
        ) : null}
      </Card>
    </div>
  );
}
