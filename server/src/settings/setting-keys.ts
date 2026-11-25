/**
 * 系统设置键表：唯一事实来源（默认值、类型、取值范围）。
 *
 * 存储约定：`SystemSetting.value` 存**标量文本**（数字 `60`、布尔 `true`、字符串原样），
 * 不存 JSON 引号。原因：`src/common/setting-reader.ts` 是调度/任务模块读取同一张表的薄封装，
 * 它直接 `Number(row.value)` / 原样取字符串；两边编码必须一致，否则轮询间隔会被读成 NaN。
 * 读取侧仍容忍 JSON 引号（`"60"`）与布尔别名，防止历史数据或手工改库把服务读崩。
 */

export type SettingType = 'int' | 'string' | 'bool';

export interface SettingDefBase {
  type: SettingType;
}

export interface IntSettingDef extends SettingDefBase {
  type: 'int';
  default: number;
  min: number;
  max: number;
}

export interface StringSettingDef extends SettingDefBase {
  type: 'string';
  default: string;
  /** 是否必须为 http(s) 地址 */
  url?: boolean;
  maxLength: number;
}

export interface BoolSettingDef extends SettingDefBase {
  type: 'bool';
  default: boolean;
}

export type SettingDef = IntSettingDef | StringSettingDef | BoolSettingDef;

export const SETTING_DEFS = {
  pollIntervalSec: { type: 'int', default: 60, min: 10, max: 3600 },
  defaultDurationMin: { type: 'int', default: 60, min: 1, max: 720 },
  maxDurationMin: { type: 'int', default: 720, min: 1, max: 720 },
  maxActiveRemindersPerUser: { type: 'int', default: 5, min: 1, max: 100 },
  lockerDeviceSn: { type: 'string', default: '2680', maxLength: 32 },
  /** 建任务时表单预填的柜机编号；用户仍可改。来源是抓包得到的固定柜机。 */
  defaultLockerCabCode: { type: 'string', default: 'SYA61026AP', maxLength: 32 },
  lockerApiBase: {
    type: 'string',
    default: 'https://csmini.guangeiot.com',
    url: true,
    maxLength: 200,
  },
  ntfyServerUrl: { type: 'string', default: 'http://127.0.0.1:8080', url: true, maxLength: 200 },
  registrationOpen: { type: 'bool', default: true },
  showNotifyDetailsDefault: { type: 'bool', default: true },
  /** 入柜后允许多久内一键开箱（小时），超时只能去取餐柜小程序操作 */
  openBoxWindowHours: { type: 'int', default: 24, min: 1, max: 168 },
} as const satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTING_DEFS;
export type SettingValue = number | string | boolean;

/** 固定顺序的键列表：GET /api/admin/settings 的输出顺序稳定，便于前端 diff。 */
export const SETTING_KEYS = Object.keys(SETTING_DEFS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFS, key);
}

/** 写入数据库的文本形式。 */
export function encodeSettingValue(value: SettingValue): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** 去掉一层 JSON 字符串引号（兼容手工写入的 `"60"`）。 */
function stripJsonQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return typeof parsed === 'string' ? parsed.trim() : trimmed;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function decodeIntSetting(raw: string | null | undefined, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  const text = stripJsonQuotes(raw);
  if (text === '') return fallback;
  const value = Number(text);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export function decodeBoolSetting(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === null || raw === undefined) return fallback;
  const text = stripJsonQuotes(raw).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

export function decodeStringSetting(raw: string | null | undefined, fallback: string): string {
  if (raw === null || raw === undefined) return fallback;
  const text = stripJsonQuotes(raw);
  return text === '' ? fallback : text;
}

/** 按定义解码一条原始文本；`raw` 为空表示库里没有该键。 */
export function decodeSetting(def: SettingDef, raw: string | null | undefined): SettingValue {
  if (def.type === 'int') return decodeIntSetting(raw, def.default);
  if (def.type === 'bool') return decodeBoolSetting(raw, def.default);
  return decodeStringSetting(raw, def.default);
}
