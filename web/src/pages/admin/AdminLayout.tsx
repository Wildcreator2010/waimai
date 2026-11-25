import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ADMIN_TABS = [
  { to: '/admin/overview', label: '概览' },
  { to: '/admin/users', label: '用户' },
  { to: '/admin/invites', label: '邀请码' },
  { to: '/admin/member-token', label: 'MemberToken' },
  { to: '/admin/settings', label: '系统设置' },
  { to: '/admin/alerts', label: '告警' },
  { to: '/admin/audit', label: '审计日志' },
  { to: '/admin/sms-logs', label: '短信流水' },
];

export function AdminLayout() {
  return (
    <div>
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card">
        {ADMIN_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
                isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
