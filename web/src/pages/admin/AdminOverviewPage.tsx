import { Link } from 'react-router-dom';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ErrorState, LoadingBlock } from '@/components/Feedback';
import { PageHeader } from '@/components/PageHeader';
import { useAdminOverview } from '@/hooks/useAdmin';

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function AdminOverviewPage() {
  const overview = useAdminOverview();

  return (
    <div>
      <PageHeader
        title="概览"
        description="账号、任务、短信与告警的当前状态。"
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={overview.isFetching}
            onClick={() => void overview.refetch()}
          >
            刷新
          </Button>
        }
      />

      {overview.isLoading ? <LoadingBlock /> : null}
      {overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : null}

      {overview.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">用户</h2>
            <dl className="grid grid-cols-3 gap-2">
              <Metric label="总数" value={overview.data.users.total} />
              <Metric label="正常" value={overview.data.users.active} />
              <Metric label="管理员" value={overview.data.users.admins} />
            </dl>
            <Link
              to="/admin/users"
              className="mt-3 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              用户管理 →
            </Link>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">提醒任务</h2>
            <dl className="grid grid-cols-3 gap-2">
              <Metric label="等待中" value={overview.data.reminders.waiting} />
              <Metric label="今日入柜" value={overview.data.reminders.arrivedToday} />
              <Metric label="今日超时" value={overview.data.reminders.timeoutToday} />
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">短信</h2>
            <dl className="grid grid-cols-2 gap-2">
              <Metric label="今日已发" value={overview.data.sms.sentToday} />
              <Metric label="今日失败" value={overview.data.sms.failedToday} />
            </dl>
            <Link
              to="/admin/sms-logs"
              className="mt-3 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              短信流水 →
            </Link>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">告警</h2>
            <dl className="grid grid-cols-1 gap-2">
              <Metric label="未确认" value={overview.data.alerts.unacked} />
            </dl>
            <Link
              to="/admin/alerts"
              className="mt-3 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              查看告警 →
            </Link>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">取餐柜凭证</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span>是否已配置：</span>
              <Badge tone={overview.data.locker.configured ? 'green' : 'amber'}>
                {overview.data.locker.configured ? '已配置' : '未配置'}
              </Badge>
              <span>最近验证：</span>
              {overview.data.locker.lastVerifyOk === null ? (
                <Badge tone="gray">未验证</Badge>
              ) : overview.data.locker.lastVerifyOk ? (
                <Badge tone="green">通过</Badge>
              ) : (
                <Badge tone="red">失败</Badge>
              )}
            </div>
            <Link
              to="/admin/member-token"
              className="mt-3 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              MemberToken 管理 →
            </Link>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">系统设置</h2>
            <p className="text-sm text-slate-600">
              轮询间隔、任务上限、设备 SN、ntfy 地址与注册开关。
            </p>
            <Link
              to="/admin/settings"
              className="mt-3 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              去修改 →
            </Link>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
