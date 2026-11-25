// 登录后的整体框架：顶部导航 + 未绑手机号提示 + 内容区。

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertBanner } from '@/components/Feedback';
import { Button } from '@/components/Button';
import { RoleBadge } from '@/components/StatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { useMeSettings, useNtfyConfig } from '@/hooks/useMe';
import { getDesktop } from '@/lib/desktop';
import { cn } from '@/lib/utils';

const USER_NAV = [
  { to: '/reminders', label: '提醒任务' },
  { to: '/settings', label: '通知设置' },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
  );
}

export function AppLayout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const settings = useMeSettings();
  const [loggingOut, setLoggingOut] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const queryClient = useQueryClient();
  const desktop = getDesktop();
  // 只有桌面端才需要这份配置（浏览器端没有主进程去订阅）
  const ntfyConfig = useNtfyConfig({ enabled: Boolean(desktop) });

  // 桌面端：把用户的 ntfy 配置下发给主进程，由主进程维持长连接并弹系统通知。
  // ntfyEnabled=false 时主进程会主动断开，与「允许主动连接 ntfy」开关保持一致。
  useEffect(() => {
    if (!desktop) return;
    const me = settings.data;
    const config = ntfyConfig.data;
    if (!me || !config) return;
    void desktop
      .setConfig({
        ntfyEnabled: Boolean(me.ntfyEnabled),
        ntfyServerUrl: config.serverUrl,
        ntfyTopic: config.topic,
      })
      .catch(() => undefined);
  }, [desktop, settings.data, ntfyConfig.data]);

  // 桌面端：收到入柜推送后刷新提醒列表，避免界面停在旧状态。
  useEffect(() => {
    if (!desktop) return;
    return desktop.onNtfyMessage(() => {
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
    });
  }, [desktop, queryClient]);

  // 未绑定手机号 → 短信通道不可达（docs/architecture.md §8.1）
  const phoneBound = Boolean(settings.data?.phoneVerified && settings.data?.phone);
  const showPhoneNotice = settings.data !== undefined && !phoneBound && !noticeDismissed;

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/reminders" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              取
            </span>
            <span className="text-base font-semibold text-slate-900">取餐提醒</span>
          </Link>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden max-w-[220px] truncate text-sm text-slate-600 sm:inline">
              {user?.email}
            </span>
            {user ? <RoleBadge role={user.role} /> : null}
            <Button size="sm" variant="secondary" loading={loggingOut} onClick={handleLogout}>
              退出
            </Button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {USER_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink to="/admin" className={navLinkClass}>
              管理后台
            </NavLink>
          ) : null}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5">
        {showPhoneNotice ? (
          <AlertBanner tone="warn" title="尚未绑定手机号">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>短信提醒不可达，任务命中后只能通过 App / 网页查看。</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigate('/settings')}>
                  去绑定
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNoticeDismissed(true)}>
                  知道了
                </Button>
              </div>
            </div>
          </AlertBanner>
        ) : null}

        <Outlet />
      </main>
    </div>
  );
}
