import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertBanner, EmptyState, ErrorState, LoadingBlock } from '@/components/Feedback';
import { Card, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { EventLevelBadge, ReminderStatusBadge } from '@/components/StatusBadge';
import { useNow } from '@/hooks/useNow';
import {
  useCheckReminder,
  useOpenBox,
  useReminder,
  useReminderEvents,
  useStopReminder,
} from '@/hooks/useReminders';
import { errorText } from '@/lib/api';
import type { ReminderEvent } from '@/lib/types';
import {
  formatDateTime,
  formatDateTimeSeconds,
  formatRemaining,
  isActiveReminderStatus,
} from '@/lib/utils';

const EVENT_PAGE_SIZE = 20;

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="truncate text-sm text-slate-800">{value}</dd>
    </div>
  );
}

function EventRow({ event }: { event: ReminderEvent }) {
  return (
    <li className="flex flex-wrap items-start gap-2 border-b border-slate-100 py-2 last:border-0">
      <EventLevelBadge level={event.level} />
      <span className="min-w-0 flex-1 break-words text-sm text-slate-700">{event.message}</span>
      <span className="text-xs text-slate-400">{formatDateTimeSeconds(event.createdAt)}</span>
    </li>
  );
}

export function ReminderDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const now = useNow(1000);

  const detail = useReminder(id);
  const [eventPage, setEventPage] = useState(1);
  const events = useReminderEvents(id, eventPage, EVENT_PAGE_SIZE);
  const check = useCheckReminder(id);
  const stop = useStopReminder(id);
  const openBox = useOpenBox(id);

  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (detail.isLoading) {
    return <LoadingBlock text="正在加载任务…" />;
  }

  if (detail.isError) {
    return (
      <div className="space-y-3">
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
        <Link to="/reminders" className="text-sm font-medium text-brand-600">
          返回任务列表
        </Link>
      </div>
    );
  }

  if (!detail.data) {
    return <EmptyState title="任务不存在" description="任务可能已超过 30 天保留期被清理。" />;
  }

  const reminder = detail.data;
  const active = isActiveReminderStatus(reminder.status);
  const remaining = active ? formatRemaining(reminder.endsAt, now) : null;

  async function handleCheck() {
    setActionError(null);
    setNotice(null);
    try {
      const result = await check.mutateAsync();
      setNotice(
        `${result.arrived ? '已入柜' : '尚未入柜'}：${result.detail || (result.ok ? '查询完成' : '查询失败')}`,
      );
    } catch (err) {
      setActionError(errorText(err, '立即查询失败'));
    }
  }

  async function handleStop() {
    setActionError(null);
    try {
      await stop.mutateAsync();
      setConfirmStop(false);
      setNotice('任务已停止，不再继续查询。');
    } catch (err) {
      setActionError(errorText(err, '停止任务失败'));
    }
  }

  async function handleOpenBox() {
    setActionError(null);
    setNotice(null);
    try {
      const result = await openBox.mutateAsync();
      setConfirmOpen(false);
      setNotice(`开箱命令已发送（第 ${result.openCount} 次）：${result.message}`);
    } catch (err) {
      setConfirmOpen(false);
      setActionError(errorText(err, '开箱失败'));
    }
  }

  const canOpenBox =
    reminder.status === 'ARRIVED' && Boolean(reminder.orderId) && (reminder.openCount ?? 0) < 3;

  const sortedEvents = events.data
    ? [...events.data.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`取餐码 ${reminder.pickupCode}`}
        description={`柜机 ${reminder.cabCode} · 监控 ${reminder.durationMin} 分钟`}
        actions={
          <>
            <Link to="/reminders">
              <Button variant="secondary" size="sm">
                返回列表
              </Button>
            </Link>
            <Button size="sm" loading={check.isPending} onClick={handleCheck}>
              立即查询
            </Button>
            {canOpenBox ? (
              <Button size="sm" loading={openBox.isPending} onClick={() => setConfirmOpen(true)}>
                一键开箱
              </Button>
            ) : null}
            {active ? (
              <Button size="sm" variant="danger" onClick={() => setConfirmStop(true)}>
                停止任务
              </Button>
            ) : null}
          </>
        }
      />

      {actionError ? (
        <AlertBanner tone="error" title="操作失败">
          {actionError}
        </AlertBanner>
      ) : null}

      {notice ? <AlertBanner tone="info">{notice}</AlertBanner> : null}

      <Card>
        <CardHeader
          title="任务状态"
          actions={<ReminderStatusBadge status={reminder.status} />}
        />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <InfoItem label="柜号" value={reminder.cabinet || '—'} />
          <InfoItem
            label="取餐码来源"
            value={reminder.codeMode === 'phone_tail' ? '手机尾号' : '自定义'}
          />
          <InfoItem
            label="剩余时间"
            value={active ? (remaining ?? '即将超时') : reminder.status === 'TIMEOUT' ? '已超时' : '—'}
          />
          <InfoItem label="创建时间" value={formatDateTime(reminder.createdAt)} />
          <InfoItem label="结束时间" value={formatDateTime(reminder.endsAt)} />
          <InfoItem label="完成时间" value={formatDateTime(reminder.finishedAt)} />
          <InfoItem label="最近查询" value={formatDateTime(reminder.lastCheckAt)} />
          <InfoItem label="查询次数" value={String(reminder.checkCount ?? 0)} />
          <InfoItem label="失败次数" value={String(reminder.failCount ?? 0)} />
          <InfoItem label="通知时间" value={formatDateTime(reminder.notifiedAt)} />
        </dl>
        {reminder.lastDetail ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            最近一次查询结果：{reminder.lastDetail}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="事件流" description="基线、命中、超时、失败与通知结果" />
        {events.isLoading ? <LoadingBlock /> : null}
        {events.isError ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} />
        ) : null}
        {events.data ? (
          events.data.items.length === 0 ? (
            <EmptyState title="暂无事件" description="任务刚开始监控时可能还没有事件。" />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {sortedEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ul>
              <Pagination
                page={eventPage}
                pageSize={EVENT_PAGE_SIZE}
                total={events.data.total}
                onChange={setEventPage}
                disabled={events.isFetching}
              />
            </>
          )
        ) : null}
      </Card>

      <Modal
        open={confirmStop}
        title="停止这个任务？"
        description="停止后不再查询取餐柜，也不会再发送提醒。此操作不可撤销。"
        onClose={() => setConfirmStop(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmStop(false)}>
              取消
            </Button>
            <Button variant="danger" loading={stop.isPending} onClick={handleStop}>
              确认停止
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          取餐码 {reminder.pickupCode} · 柜机 {reminder.cabCode}
        </p>
      </Modal>

      <Modal
        open={confirmOpen}
        title="确认一键开箱？"
        description="这会向取餐柜发送真实的开门指令，请先确认你站在正确的柜机前。"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button loading={openBox.isPending} onClick={handleOpenBox}>
              确认开箱
            </Button>
          </>
        }
      >
        <div className="space-y-1 text-sm text-slate-600">
          <p>
            柜机 {reminder.cabCode} · 柜号 {reminder.cabinet || '—'}
          </p>
          <p>
            取餐码 {reminder.pickupCode} · 已开箱 {reminder.openCount ?? 0}/3 次
          </p>
          <p className="text-xs text-amber-700">
            开箱结果取决于取餐柜运营方，可能失败或延迟；请确认柜前安全后再操作。
          </p>
        </div>
      </Modal>
    </div>
  );
}
