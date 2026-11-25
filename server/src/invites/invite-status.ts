import { randomBytes } from 'node:crypto';

/** 邀请码列表的状态过滤（docs/api.md §5.2） */
export enum InviteStatusFilter {
  unused = 'unused',
  used = 'used',
  expired = 'expired',
}

export type InviteStatus = InviteStatusFilter;

export const INVITE_CODE_PREFIX = 'INV-';
export const INVITE_CODE_LENGTH = 6;

/**
 * 邀请码字符集：去掉 I/O/0/1 等易混字符，便于口头或手抄传递。
 * 32 个字符 × 6 位 ≈ 10.7 亿组合，配合「一码一邮箱 + 限时 + 限用一次」足够。
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 生成形如 `INV-7K2M9Q` 的邀请码（6 位大写字母数字）。 */
export function randomInviteCode(): string {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let body = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${INVITE_CODE_PREFIX}${body}`;
}

/** 邀请码的展示状态：已使用优先于已过期（用过就不再关心过期）。 */
export function inviteStatusOf(
  invite: { usedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): InviteStatus {
  if (invite.usedAt) return InviteStatusFilter.used;
  return invite.expiresAt.getTime() <= now.getTime()
    ? InviteStatusFilter.expired
    : InviteStatusFilter.unused;
}
