// 领域状态 → 中文文案 + 颜色。集中在一处，避免各页面颜色语义漂移。

import { Badge } from '@/components/Badge';
import type { BadgeTone } from '@/components/Badge';
import type {
  AlertLevel,
  EventLevel,
  ReminderStatus,
  Role,
  SmsStatus,
  UserStatus,
} from '@/lib/types';

interface ToneText {
  tone: BadgeTone;
  text: string;
}

const REMINDER_STATUS: Record<ReminderStatus, ToneText> = {
  PENDING: { tone: 'gray', text: '待查询' },
  BASELINE: { tone: 'violet', text: '建立基线' },
  WAITING: { tone: 'blue', text: '监控中' },
  ARRIVED: { tone: 'green', text: '已入柜' },
  TIMEOUT: { tone: 'amber', text: '已超时' },
  STOPPED: { tone: 'gray', text: '已停止' },
};

const USER_STATUS: Record<UserStatus, ToneText> = {
  ACTIVE: { tone: 'green', text: '正常' },
  PENDING_VERIFICATION: { tone: 'amber', text: '待验证邮箱' },
  DISABLED: { tone: 'red', text: '已停用' },
};

const ROLE: Record<Role, ToneText> = {
  ROOT: { tone: 'violet', text: 'ROOT' },
  ADMIN: { tone: 'blue', text: 'ADMIN' },
  USER: { tone: 'gray', text: 'USER' },
};

const EVENT_LEVEL: Record<EventLevel, ToneText> = {
  INFO: { tone: 'gray', text: '信息' },
  WARN: { tone: 'amber', text: '警告' },
  ERROR: { tone: 'red', text: '错误' },
  SUCCESS: { tone: 'green', text: '成功' },
};

const ALERT_LEVEL: Record<AlertLevel, ToneText> = {
  INFO: { tone: 'blue', text: '提示' },
  WARN: { tone: 'amber', text: '警告' },
  ERROR: { tone: 'red', text: '严重' },
};

const SMS_STATUS: Record<SmsStatus, ToneText> = {
  SENT: { tone: 'green', text: '已发送' },
  FAILED: { tone: 'red', text: '失败' },
  SKIPPED: { tone: 'gray', text: '已跳过' },
};

export const REMINDER_STATUS_TEXT: Record<ReminderStatus, string> = {
  PENDING: '待查询',
  BASELINE: '建立基线',
  WAITING: '监控中',
  ARRIVED: '已入柜',
  TIMEOUT: '已超时',
  STOPPED: '已停止',
};

export const USER_STATUS_TEXT: Record<UserStatus, string> = {
  ACTIVE: '正常',
  PENDING_VERIFICATION: '待验证邮箱',
  DISABLED: '已停用',
};

export const ROLE_TEXT: Record<Role, string> = { ROOT: 'ROOT', ADMIN: 'ADMIN', USER: 'USER' };

export const SMS_STATUS_TEXT: Record<SmsStatus, string> = {
  SENT: '已发送',
  FAILED: '失败',
  SKIPPED: '已跳过',
};

export function ReminderStatusBadge({ status }: { status: ReminderStatus }) {
  const item: ToneText = REMINDER_STATUS[status] ?? { tone: 'gray', text: String(status) };
  return <Badge tone={item.tone}>{item.text}</Badge>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const item: ToneText = USER_STATUS[status] ?? { tone: 'gray', text: String(status) };
  return <Badge tone={item.tone}>{item.text}</Badge>;
}

export function RoleBadge({ role }: { role: Role }) {
  const item: ToneText = ROLE[role] ?? { tone: 'gray', text: String(role) };
  return <Badge tone={item.tone}>{item.text}</Badge>;
}

export function EventLevelBadge({ level }: { level: EventLevel }) {
  const item: ToneText = EVENT_LEVEL[level] ?? { tone: 'gray', text: String(level) };
  return <Badge tone={item.tone}>{item.text}</Badge>;
}

export function AlertLevelBadge({ level }: { level: AlertLevel }) {
  const item: ToneText = ALERT_LEVEL[level] ?? { tone: 'gray', text: String(level) };
  return <Badge tone={item.tone}>{item.text}</Badge>;
}

export function SmsStatusBadge({ status }: { status: SmsStatus }) {
  const item: ToneText = SMS_STATUS[status] ?? { tone: 'gray', text: String(status) };
  return <Badge tone={item.tone}>{item.text}</Badge>;
}
