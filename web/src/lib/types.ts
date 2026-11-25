// 与 docs/api.md 的响应体一一对应；未在契约中出现的字段不臆造。
// 枚举取值来自 server/prisma/schema.prisma（数据模型唯一事实来源）。

export type Role = 'ROOT' | 'ADMIN' | 'USER';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
export type ReminderStatus = 'PENDING' | 'BASELINE' | 'WAITING' | 'ARRIVED' | 'TIMEOUT' | 'STOPPED';
export type EventLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
export type PushMode = 'FCM' | 'NTFY';
export type SmsStatus = 'SENT' | 'FAILED' | 'SKIPPED';
export type AlertLevel = 'INFO' | 'WARN' | 'ERROR';

/** docs/api.md §0.3 用户对象 */
export interface User {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  displayName: string;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerified: boolean;
  showNotifyDetails: boolean;
  smsEnabled: boolean;
  ntfyEnabled: boolean;
  ntfyTopic: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

/** docs/api.md §0.2 分页响应 */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * 部分列表接口：docs/api.md 里 §5.1 只给了 { items, total }，
 * 分页参数按 §0.2 约定，因此 page/pageSize 视情况可能缺省。
 */
export interface ListResult<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

/** docs/api.md §2 POST /auth/login */
export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  /** App 用；Web 端为空，改为 Set-Cookie */
  refreshToken?: string | null;
  user: User;
}

/** docs/api.md §1 GET /bootstrap/status */
export interface BootstrapStatus {
  needsBootstrap: boolean;
}

/** docs/api.md §4 创建任务响应里附带的告警 */
export interface ReminderWarning {
  code: string;
  message: string;
}

/** docs/api.md §4 提醒任务（字段与 prisma Reminder 对齐） */
export interface Reminder {
  id: string;
  pickupCode: string;
  cabCode: string;
  durationMin: number;
  status: ReminderStatus;
  cabinet?: string;
  /** 命中时记录的订单号；为空表示无法开箱 */
  orderId?: string;
  /** 取餐码来源：custom / phone_tail */
  codeMode?: string;
  lockerId?: string;
  /** 已开箱次数（服务端限 3 次） */
  openCount?: number;
  lastOpenedAt?: string | null;
  lastDetail?: string;
  checkCount?: number;
  failCount?: number;
  createdAt: string;
  endsAt: string;
  finishedAt?: string | null;
  notifiedAt?: string | null;
  lastCheckAt?: string | null;
}

/** docs/api.md §4 GET /reminders/:id 含最近 50 条事件 */
export interface ReminderDetail extends Reminder {
  events: ReminderEvent[];
}

export interface ReminderEvent {
  id: string;
  reminderId?: string;
  level: EventLevel;
  message: string;
  createdAt: string;
}

/** docs/api.md §4 POST /reminders 201 响应 */
export interface CreateReminderResponse {
  id: string;
  status: ReminderStatus;
  warnings?: ReminderWarning[];
}

/** docs/api.md §4 POST /reminders/:id/check */
export interface CheckReminderResponse {
  ok: boolean;
  arrived: boolean;
  detail: string;
}

/** docs/api.md §3 GET /me/settings */
export interface MeSettings {
  showNotifyDetails: boolean;
  smsEnabled: boolean;
  ntfyEnabled: boolean;
  phone: string | null;
  phoneVerified: boolean;
  ntfyTopic: string | null;
  ntfyServerUrl: string;
  smsAvailable: boolean;
  /** 建任务表单预填：柜机编号 */
  defaultCabCode: string;
  /** 建任务表单预填：默认监控时长（分钟） */
  defaultDurationMin: number;
  /** 监控时长上限（分钟） */
  maxDurationMin: number;
}

/** docs/api.md §3 GET /me/ntfy/config */
export interface NtfyConfig {
  serverUrl: string;
  topic: string;
  token: string | null;
}

/** docs/api.md §3 POST /me/ntfy/rotate */
export interface RotateNtfyResponse {
  topic: string;
}

/** docs/api.md §3 设备 */
export interface Device {
  id: string;
  name: string;
  platform: string;
  pushMode: PushMode;
  appVersion: string;
  createdAt: string;
  lastSeenAt: string;
}

// ---------------------------------------------------------------- 管理端

/** docs/api.md §5.1 GET /admin/users */
export interface AdminUserRow {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  displayName?: string;
  phone: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

/** docs/api.md §5.2 邀请码 */
export interface Invite {
  id: string;
  code: string;
  email: string;
  note?: string;
  createdAt?: string;
  expiresAt: string;
  usedAt?: string | null;
  usedById?: string | null;
}

/** docs/api.md §5.3 GET /admin/member-token（只回掩码） */
export interface MemberTokenInfo {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  lastVerifiedAt: string | null;
  lastVerifyOk: boolean | null;
  lastVerifyMessage: string | null;
  expiringSoon: boolean;
}

/** docs/api.md §5.3 POST /admin/member-token/verify */
export interface VerifyMemberTokenResponse {
  ok: boolean;
  message: string;
}

/** docs/api.md §5.4 系统设置 */
export interface SystemSettings {
  pollIntervalSec: number;
  defaultDurationMin: number;
  maxDurationMin: number;
  maxActiveRemindersPerUser: number;
  lockerDeviceSn: string;
  /** 建任务表单预填的柜机编号（抓包得到，管理台可改） */
  defaultLockerCabCode: string;
  lockerApiBase: string;
  ntfyServerUrl: string;
  registrationOpen: boolean;
  showNotifyDetailsDefault: boolean;
}

/** docs/api.md §5.5 管理员告警 */
export interface AdminAlert {
  id: string;
  level: AlertLevel;
  type: string;
  message: string;
  ackedAt: string | null;
  ackedById: string | null;
  ackedByEmail?: string | null;
  createdAt: string;
}

/** docs/api.md §5.5 审计日志 */
export interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  ip: string;
  createdAt: string;
}

/** docs/api.md §5.5 短信流水 */
export interface SmsLog {
  id: string;
  userId: string | null;
  phone: string;
  template: string;
  params: string;
  status: SmsStatus;
  providerId: string;
  errorCode: string;
  errorMsg: string;
  createdAt: string;
}

/** docs/api.md §5.6 概览 */
export interface AdminOverview {
  users: { total: number; active: number; admins: number };
  reminders: { waiting: number; arrivedToday: number; timeoutToday: number };
  sms: { sentToday: number; failedToday: number };
  alerts: { unacked: number };
  locker: { configured: boolean; lastVerifyOk: boolean | null };
}

/** docs/api.md §6 健康检查 */
export interface HealthResponse {
  status: string;
  db: string;
  uptimeSec: number;
  version: string;
}
