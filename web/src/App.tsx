import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { RequireAdmin, RequireAuth } from '@/components/RouteGuards';
import { AuthProvider } from '@/hooks/useAuth';
import { ApiError } from '@/lib/api';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ReminderDetailPage } from '@/pages/ReminderDetailPage';
import { ReminderNewPage } from '@/pages/ReminderNewPage';
import { RemindersPage } from '@/pages/RemindersPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { TermsPage } from '@/pages/TermsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SetupPage } from '@/pages/SetupPage';
import { VerifyEmailPage } from '@/pages/VerifyEmailPage';
import { AdminAlertsPage } from '@/pages/admin/AdminAlertsPage';
import { AdminAuditPage } from '@/pages/admin/AdminAuditPage';
import { AdminInvitesPage } from '@/pages/admin/AdminInvitesPage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { AdminMemberTokenPage } from '@/pages/admin/AdminMemberTokenPage';
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage';
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage';
import { AdminSmsLogsPage } from '@/pages/admin/AdminSmsLogsPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx 是确定性失败（无权限、参数错误），重试没有意义
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: {
      retry: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* 未登录可访问 */}
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/terms" element={<TermsPage />} />

            {/* 登录后 */}
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Navigate to="/reminders" replace />} />
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="/reminders/new" element={<ReminderNewPage />} />
              <Route path="/reminders/:id" element={<ReminderDetailPage />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* 仅 ADMIN / ROOT；USER 会看到 403 页面 */}
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <AdminLayout />
                  </RequireAdmin>
                }
              >
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<AdminOverviewPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="invites" element={<AdminInvitesPage />} />
                <Route path="member-token" element={<AdminMemberTokenPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="alerts" element={<AdminAlertsPage />} />
                <Route path="audit" element={<AdminAuditPage />} />
                <Route path="sms-logs" element={<AdminSmsLogsPage />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
