// 管理端：用户、邀请码、MemberToken、系统设置、告警、审计、短信流水、概览。
// 全部接口要求 ADMIN 或 ROOT；写操作后端会写审计，前端只需成功后 invalidate。

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, buildQuery } from '@/lib/api';
import { qk } from '@/lib/queryKeys';
import type {
  AdminInviteListParams,
  AdminUserListParams,
  AlertListParams,
  AuditListParams,
  SmsLogListParams,
} from '@/lib/queryKeys';
import type {
  AdminAlert,
  AdminOverview,
  AdminUserRow,
  AuditLog,
  Invite,
  ListResult,
  MemberTokenInfo,
  Role,
  SmsLog,
  SystemSettings,
  UserStatus,
  VerifyMemberTokenResponse,
} from '@/lib/types';

// ---------------------------------------------------------------- 用户

export function useAdminUsers(params: AdminUserListParams) {
  return useQuery({
    queryKey: qk.adminUsers(params),
    queryFn: () =>
      api.get<ListResult<AdminUserRow>>(
        `/admin/users${buildQuery({
          q: params.q || undefined,
          role: params.role || undefined,
          status: params.status || undefined,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export interface AdminUserCreateBody {
  email: string;
  password: string;
  role: Role;
  displayName?: string;
}

export function useAdminCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminUserCreateBody) => api.post<AdminUserRow>('/admin/users', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export interface AdminUserPatchBody {
  displayName?: string;
  status?: UserStatus;
  role?: Role;
}

export function useAdminUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AdminUserPatchBody }) =>
      api.patch<AdminUserRow>(`/admin/users/${id}`, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useAdminDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/admin/users/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

/** 仅 ROOT：转让根账号（目标升 ROOT，自己降 ADMIN，双方会话撤销） */
export function useRootTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string; password: string }) =>
      api.post<void>('/admin/root/transfer', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

// ---------------------------------------------------------------- 邀请码

export function useAdminInvites(params: AdminInviteListParams) {
  return useQuery({
    queryKey: qk.adminInvites(params),
    queryFn: () =>
      api.get<ListResult<Invite>>(
        `/admin/invites${buildQuery({
          status: params.status || undefined,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export interface InviteCreateBody {
  email: string;
  expiresInDays: number;
  note?: string;
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteCreateBody) => api.post<Invite>('/admin/invites', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-invites'] });
    },
  });
}

export function useDeleteInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/admin/invites/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-invites'] });
    },
  });
}

// ---------------------------------------------------------------- MemberToken

export function useMemberToken() {
  return useQuery({
    queryKey: qk.memberToken,
    queryFn: () => api.get<MemberTokenInfo>('/admin/member-token'),
  });
}

export function useUpdateMemberToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.put<MemberTokenInfo>('/admin/member-token', { token }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.memberToken });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useVerifyMemberToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<VerifyMemberTokenResponse>('/admin/member-token/verify'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.memberToken });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

// ---------------------------------------------------------------- 系统设置

export function useAdminSettings() {
  return useQuery({
    queryKey: qk.adminSettings,
    queryFn: () => api.get<SystemSettings>('/admin/settings'),
  });
}

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SystemSettings>) =>
      api.patch<SystemSettings>('/admin/settings', patch),
    onSuccess: (data) => {
      queryClient.setQueryData(qk.adminSettings, data);
    },
  });
}

// ---------------------------------------------------------------- 告警 / 审计 / 短信流水

export function useAdminAlerts(params: AlertListParams) {
  return useQuery({
    queryKey: qk.alerts(params),
    queryFn: () =>
      api.get<ListResult<AdminAlert>>(
        `/admin/alerts${buildQuery({
          acked: params.acked === '' ? undefined : params.acked,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAckAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AdminAlert>(`/admin/alerts/${id}/ack`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-alerts'] });
      void queryClient.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useAuditLogs(params: AuditListParams) {
  return useQuery({
    queryKey: qk.audit(params),
    queryFn: () =>
      api.get<ListResult<AuditLog>>(
        `/admin/audit${buildQuery({
          action: params.action || undefined,
          from: params.from,
          to: params.to,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useSmsLogs(params: SmsLogListParams) {
  return useQuery({
    queryKey: qk.smsLogs(params),
    queryFn: () =>
      api.get<ListResult<SmsLog>>(
        `/admin/sms-logs${buildQuery({
          status: params.status || undefined,
          phone: params.phone || undefined,
          from: params.from,
          to: params.to,
          page: params.page,
          pageSize: params.pageSize,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: qk.overview,
    queryFn: () => api.get<AdminOverview>('/admin/overview'),
    // 概览页停留时每 30 秒自动刷新，告警数不需要手动刷
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}
