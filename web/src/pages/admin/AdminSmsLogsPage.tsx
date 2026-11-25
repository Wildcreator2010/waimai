import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/Button';
import { AlertBanner } from '@/components/Feedback';
import { Card } from '@/components/Card';
import { DataTable } from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import { Field, Input, Select } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { SmsStatusBadge, SMS_STATUS_TEXT } from '@/components/StatusBadge';
import { useSmsLogs } from '@/hooks/useAdmin';
import { downloadFile, errorText } from '@/lib/api';
import type { SmsLogListParams } from '@/lib/queryKeys';
import type { SmsLog, SmsStatus } from '@/lib/types';
import { formatDateTimeSeconds, localInputToIso } from '@/lib/utils';

const PAGE_SIZE = 20;

export function AdminSmsLogsPage() {
  const [statusInput, setStatusInput] = useState<SmsStatus | ''>('');
  const [phoneInput, setPhoneInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [params, setParams] = useState<SmsLogListParams>({
    status: '',
    phone: '',
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const query = useSmsLogs(params);

  function handleFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParams({
      status: statusInput,
      phone: phoneInput.trim(),
      from: localInputToIso(fromInput),
      to: localInputToIso(toInput),
      page: 1,
      pageSize: PAGE_SIZE,
    });
  }

  function handleReset() {
    setStatusInput('');
    setPhoneInput('');
    setFromInput('');
    setToInput('');
    setParams({ status: '', phone: '', page: 1, pageSize: PAGE_SIZE });
  }

  const columns: Column<SmsLog>[] = [
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
      key: 'phone',
      header: '手机号',
      render: (row) => <span className="font-mono text-xs">{row.phone}</span>,
    },
    {
      key: 'template',
      header: '模板',
      render: (row) => <span className="font-mono text-xs text-slate-600">{row.template}</span>,
    },
    {
      key: 'status',
      header: '状态',
      render: (row) => <SmsStatusBadge status={row.status} />,
    },
    {
      key: 'error',
      header: '错误',
      className: 'max-w-[320px]',
      render: (row) =>
        row.errorCode || row.errorMsg ? (
          <p className="break-words text-xs text-red-600">
            {row.errorCode ? `${row.errorCode} · ` : ''}
            {row.errorMsg}
          </p>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: 'params',
      header: '模板参数',
      className: 'max-w-[280px]',
      render: (row) => (
        <span className="break-all font-mono text-xs text-slate-500">{row.params || '—'}</span>
      ),
    },
    {
      key: 'providerId',
      header: '供应商回执',
      render: (row) => (
        <span className="break-all font-mono text-xs text-slate-500">{row.providerId || '—'}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="短信流水"
        description="每条短信的发送结果。同一号码当日 SENT 达 20 条会被跳过并告警（阿里云硬限制）。"
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={exporting}
            onClick={async () => {
              setExporting(true);
              setExportError(null);
              try {
                const query = new URLSearchParams();
                if (statusInput) query.set('status', statusInput);
                if (phoneInput.trim()) query.set('phone', phoneInput.trim());
                const fromIso = localInputToIso(fromInput);
                if (fromIso) query.set('from', fromIso);
                const toIso = localInputToIso(toInput);
                if (toIso) query.set('to', toIso);
                const qs = query.toString();
                await downloadFile(
                  `/admin/sms-logs/export${qs ? `?${qs}` : ''}`,
                  `sms-${new Date().toISOString().slice(0, 10)}.csv`,
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
          <Field label="状态" htmlFor="smsStatus" className="w-32">
            <Select
              id="smsStatus"
              value={statusInput}
              onChange={(event) => setStatusInput(event.target.value as SmsStatus | '')}
            >
              <option value="">全部</option>
              {(Object.keys(SMS_STATUS_TEXT) as SmsStatus[]).map((value) => (
                <option key={value} value={value}>
                  {SMS_STATUS_TEXT[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="手机号" htmlFor="smsPhone" className="min-w-[160px] flex-1">
            <Input
              id="smsPhone"
              inputMode="tel"
              placeholder="完整号码或掩码"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
            />
          </Field>
          <Field label="起始时间" htmlFor="smsFrom" className="w-48">
            <Input
              id="smsFrom"
              type="datetime-local"
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
            />
          </Field>
          <Field label="结束时间" htmlFor="smsTo" className="w-48">
            <Input
              id="smsTo"
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
          emptyTitle="没有短信记录"
          emptyDescription="调整筛选条件后重试。"
          minWidthClass="min-w-[960px]"
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
