import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Config {
  /** Web 站点根地址（不带末尾斜杠），主窗口与外链同源判断都基于它 */
  appUrl: string;
  /** 开机自启 */
  autostart: boolean;
  /** 点击关闭按钮时隐藏到托盘而不是退出 */
  closeToTray: boolean;
  /** 是否在主进程订阅 ntfy 提醒 */
  ntfyEnabled: boolean;
  /** ntfy 服务器根地址（不带末尾斜杠） */
  ntfyServerUrl: string;
  /** ntfy 订阅主题 */
  ntfyTopic: string;
}

export const DEFAULT_APP_URL = 'http://127.0.0.1:5173';

export const DEFAULT_CONFIG: Config = {
  appUrl: DEFAULT_APP_URL,
  autostart: false,
  closeToTray: true,
  ntfyEnabled: false,
  ntfyServerUrl: 'https://ntfy.sh',
  ntfyTopic: '',
};

const ENV_APP_URL = 'MEAL_APP_URL';

export function configFilePath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

/** 判断主机是否是本机/内网地址，用于决定补 http:// 还是 https:// */
function isLocalHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.startsWith('127.') ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** 归一化站点地址：补协议、去末尾斜杠；非法返回 null */
export function normalizeAppUrl(input: string): string | null {
  let raw = String(input ?? '').trim();
  if (!raw) return null;
  // 明确带了非 http(s) 协议（如 ftp://、file://）直接拒绝，避免被补成畸形地址
  if (/:\/\//.test(raw) && !/^https?:\/\//i.test(raw)) return null;
  if (!/^https?:\/\//i.test(raw)) {
    try {
      const probe = new URL(`http://${raw}`);
      raw = `${isLocalHost(probe.hostname) ? 'http' : 'https'}://${raw}`;
    } catch {
      return null;
    }
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function envAppUrl(): string | null {
  const raw = process.env[ENV_APP_URL];
  if (!raw || !raw.trim()) return null;
  return normalizeAppUrl(raw);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/** 把任意解析结果收敛为合法 Config，非法字段回退默认值 */
function sanitize(raw: unknown): Config {
  const cfg: Config = { ...DEFAULT_CONFIG };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cfg;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.appUrl === 'string') {
    const normalized = normalizeAppUrl(obj.appUrl);
    if (normalized) cfg.appUrl = normalized;
  }
  for (const key of ['autostart', 'closeToTray', 'ntfyEnabled'] as const) {
    if (typeof obj[key] === 'boolean') cfg[key] = obj[key] as boolean;
  }
  if (typeof obj.ntfyServerUrl === 'string' && obj.ntfyServerUrl.trim()) {
    cfg.ntfyServerUrl = stripTrailingSlash(obj.ntfyServerUrl.trim());
  }
  if (typeof obj.ntfyTopic === 'string') cfg.ntfyTopic = obj.ntfyTopic.trim();
  return cfg;
}

function readRawFile(): unknown {
  let text: string;
  try {
    text = fs.readFileSync(configFilePath(), 'utf8');
  } catch (err) {
    // 不存在 / 不可读：一律回退默认值
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // 损坏文件：改名备份后回退默认值
    try {
      fs.renameSync(configFilePath(), `${configFilePath()}.corrupt`);
    } catch {
      // 备份失败不影响使用默认值
    }
    return {};
  }
}

/** 读取生效配置（文件内容 + MEAL_APP_URL 环境变量覆盖） */
export function readConfig(): Config {
  const cfg = sanitize(readRawFile());
  const fromEnv = envAppUrl();
  if (fromEnv) cfg.appUrl = fromEnv;
  return cfg;
}

/** 合并写入配置文件（环境变量覆盖不落盘），返回写入后的生效配置 */
export function writeConfig(patch: Partial<Config>): Config {
  const merged = sanitize({ ...sanitize(readRawFile()), ...patch });
  const file = configFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('[config] 写入配置失败，仅本次内存生效:', err);
  }
  const fromEnv = envAppUrl();
  if (fromEnv) merged.appUrl = fromEnv;
  return merged;
}

/** 是否已有可用配置（环境变量或有效配置文件），决定是否弹首次设置窗口 */
export function isConfigured(): boolean {
  if (envAppUrl()) return true;
  let text: string;
  try {
    text = fs.readFileSync(configFilePath(), 'utf8');
  } catch {
    return false;
  }
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== 'object') return false;
    const appUrl = (raw as Record<string, unknown>).appUrl;
    return typeof appUrl === 'string' && appUrl.trim().length > 0 && normalizeAppUrl(appUrl) !== null;
  } catch {
    return false;
  }
}
