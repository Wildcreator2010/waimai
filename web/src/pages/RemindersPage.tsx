import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/Feedback';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { ReminderStatusBadge, REMINDER_STATUS_TEXT } from '@/components/StatusBadge';
import { useNow } from '@/hooks/useNow';
import { useReminders } from '@/hooks/useReminders';
import type { Reminder, ReminderStatus } from '@/lib/types';
import { formatDateTime, formatRemaining, isActiveReminderStatus } from '@/lib/utils';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{ value: ReminderStatus | ''; label: string }> = [
  { value: '', label: '全部状态' },
  ...(Object.keys(REMINDER_STATUS_TEXT) as ReminderStatus[]).map((status) => ({
    value: status,
    label: REMINDER_STATUS_TEXT[status],
  })),
];

function ReminderCard({ reminder, nowMs }: { reminder: Reminder; nowMs: number }) {
  const active = isActiveReminderStatus(reminder.status);
  const remaining = active ? formatRemaining(reminder.endsAt, nowMs) : null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">取餐码</p>
          <p className="truncate font-mono text-lg font-semibold text-slate-900">
            {reminder.pickupCode}
          </p>
        </div>
        <ReminderStatusBadge status={reminder.status} />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="min-w-0">
          <dt className="text-slate-500">柜机 cabCode</dt>
          <dd className="truncate font-mono text-slate-800">{reminder.cabCode}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-slate-500">剩余时间</dt>
          <dd className="text-slate-800">
            {active ? (remaining ?? '即将超时') : reminder.status === 'TIMEOUT' ? '已超时' : '—'}
          </dd>
        </div>
        {reminder.cabinet ? (
          <div className="min-w-0">
            <dt className="text-slate-500">柜号</dt>
            <dd className="truncate font-mono text-slate-800">{reminder.cabinet}</dd>
          </div>
        ) : null}
        <div className="min-w-0">
          <dt className="text-slate-500">创建时间</dt>
          <dd className="truncate text-slate-800">{formatDateTime(reminder.createdAt)}</dd>
        </div>
      </dl>

      {reminder.lastDetail ? (
        <p className="line-clamp-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          {reminder.lastDetail}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Link to={`/reminders/${reminder.id}`}>
          <Button size="sm" variant="secondary">
            查看详情
          </Button>
        </Link>
      </div>
    </Card>
  );
}

export function RemindersPage() {
  const [status, setStatus] = useState<ReminderStatus | ''>('');
  const [page, setPage] = useState(1);
  const now = useNow(1000);

  const query = useReminders({ status, page, pageSize: PAGE_SIZE });

  function handleStatusChange(next: ReminderStatus | '') {
    setStatus(next);
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="提醒任务"
        description="服务端按轮询间隔查询取餐柜，检测到你的取餐码入柜后会通过推送与短信提醒。"
        actions={
          <Link to="/reminders/new">
            <Button>创建任务</Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((option) => {
          const active = option.value === status;
          return (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => handleStatusChange(option.value)}
              className={
                active
                  ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white'
                  : 'rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {query.isLoading ? <LoadingBlock /> : null}

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : null}

      {query.data ? (
        query.data.items.length === 0 ? (
          <EmptyState
            title="还没有提醒任务"
            description="创建任务后，服务端会持续监控取餐柜，入柜即提醒。"
            action={
              <Link to="/reminders/new">
                <Button size="sm">创建第一个任务</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {query.data.items.map((reminder) => (
                <ReminderCard key={reminder.id} reminder={reminder} nowMs={now} />
              ))}
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={query.data.total}
              onChange={setPage}
              disabled={query.isFetching}
            />
          </>
        )
      ) : null}
    </div>
  );
}
