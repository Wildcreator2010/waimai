// TanStack Query 的 key 工厂：统一前缀，方便按域批量 invalidate。

import type { ReminderStatus, Role, SmsStatus, UserStatus } from './types';

export interface ReminderListParams {
  status?: ReminderStatus | '';
  page: number;
  pageSize: number;
}

export interface AdminUserListParams {
  q: string;
  role: Role | '';
  status: UserStatus | '';
  page: number;
  pageSize: number;
}

export type InviteFilter = 'unused' | 'used' | 'expired';

export interface AdminInviteListParams {
  status: InviteFilter | '';
  page: number;
  pageSize: number;
}

export interface AlertListParams {
  /** true=只看已确认；false=只看未确认；''=全部 */
  acked: boolean | '';
  page: number;
  pageSize: number;
}

export interface AuditListParams {
  action: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface SmsLogListParams {
  status: SmsStatus | '';
  phone: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export const qk = {
  me: ['me'] as const,
  bootstrapStatus: ['bootstrap-status'] as const,

  reminders: (params: ReminderListParams) => ['reminders', params] as const,
  reminder: (id: string) => ['reminder', id] as const,
  reminderEvents: (id: string, page: number) => ['reminder-events', id, page] as const,

  meSettings: ['me-settings'] as const,
  devices: ['devices'] as const,
  ntfyConfig: ['ntfy-config'] as const,

  adminUsers: (params: AdminUserListParams) => ['admin-users', params] as const,
  adminInvites: (params: AdminInviteListParams) => ['admin-invites', params] as const,
  memberToken: ['admin-member-token'] as const,
  adminSettings: ['admin-settings'] as const,
  alerts: (params: AlertListParams) => ['admin-alerts', params] as const,
  audit: (params: AuditListParams) => ['admin-audit', params] as const,
  smsLogs: (params: SmsLogListParams) => ['admin-sms-logs', params] as const,
  overview: ['admin-overview'] as const,
};
