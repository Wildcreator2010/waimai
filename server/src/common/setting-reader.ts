import type { PrismaService } from '../prisma/prisma.service';

/**
 * 读取 SystemSetting 的薄封装（带默认值）。
 * 权威实现是 SettingsModule 的 SystemSettingService；这里只服务于调度与任务模块，
 * 避免「调度器依赖管理台模块」的反向耦合。
 */
export async function readSetting(
  prisma: PrismaService,
  key: string,
  fallback: string,
): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value || fallback;
}

export async function readIntSetting(
  prisma: PrismaService,
  key: string,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): Promise<number> {
  const raw = await readSetting(prisma, key, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export const SETTING_KEYS = {
  pollIntervalSec: 'pollIntervalSec',
  defaultDurationMin: 'defaultDurationMin',
  maxDurationMin: 'maxDurationMin',
  maxActiveRemindersPerUser: 'maxActiveRemindersPerUser',
  lockerDeviceSn: 'lockerDeviceSn',
  ntfyServerUrl: 'ntfyServerUrl',
  /** 入柜后允许一键开箱的小时数 */
  openBoxWindowHours: 'openBoxWindowHours',
} as const;
