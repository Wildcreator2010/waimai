import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { FullPageLoading } from '@/components/Feedback';
import { useAuth } from '@/hooks/useAuth';
import { ForbiddenPage } from '@/pages/ForbiddenPage';

/** 未登录 → 跳 /login，并记住来源路径 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoading />;
  if (status !== 'authenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <>{children}</>;
}

/** 非 ADMIN / ROOT → 403 页面（USER 看不到 /admin/*） */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, isAdmin } = useAuth();

  if (status === 'loading') return <FullPageLoading />;
  if (!isAdmin) return <ForbiddenPage />;
  return <>{children}</>;
}
