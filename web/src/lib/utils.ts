// 通用格式化与工具函数。

/** 拼接 class，过滤假值 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** ISO-8601 UTC → 本地「2026-11-10 15:00」 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** ISO-8601 UTC → 本地「2026-11-10 15:00:12」 */
export function formatDateTimeSeconds(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDateTime(iso)}:${pad(date.getSeconds())}`;
}

/** ISO-8601 UTC → 本地「2026-11-10」 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 剩余时长：endsAt - now，返回「01:23:45」形式。
 * 已过期返回 null，由调用方决定文案（不同状态文案不同）。
 */
export function formatRemaining(endsAt: string, nowMs: number): string | null {
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;
  const diff = end - nowMs;
  if (diff <= 0) return null;

  const totalSec = Math.floor(diff / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** <input type="datetime-local"> 的本地值 → ISO-8601 UTC 字符串 */
export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/** 是否为「进行中」的任务状态（PENDING / BASELINE / WAITING） */
export function isActiveReminderStatus(status: string): boolean {
  return status === 'PENDING' || status === 'BASELINE' || status === 'WAITING';
}
