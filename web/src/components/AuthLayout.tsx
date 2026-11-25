import type { ReactNode } from 'react';
import { APP_INITIAL, APP_NAME } from '@/lib/brand';

export interface AuthLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** 未登录页面（登录 / 注册 / 验证 / 重置）的统一外框 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">
            {APP_INITIAL}
          </span>
          <span className="text-lg font-semibold text-slate-900">{APP_NAME}</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          <div className="mt-5">{children}</div>
        </div>

        {footer ? <div className="mt-4 text-center text-sm text-slate-500">{footer}</div> : null}
      </div>
    </div>
  );
}
