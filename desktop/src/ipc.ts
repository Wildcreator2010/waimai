import { app, BrowserWindow, ipcMain } from 'electron';
import { normalizeAppUrl } from './config';
import type { Config } from './config';
import type { NotifyPayload } from './notifications';
import type { NtfyStatus } from './ntfy';

export const CHANNELS = {
  getConfig: 'meal:get-config',
  setConfig: 'meal:set-config',
  notify: 'meal:notify',
  navigate: 'meal:navigate',
  openExternal: 'meal:open-external',
  setBadge: 'meal:set-badge',
  autostartGet: 'meal:autostart-get',
  autostartSet: 'meal:autostart-set',
  ntfyStatus: 'meal:ntfy-status',
  versionSync: 'meal:version-sync',
  eventNavigate: 'meal:event:navigate',
  eventNtfyMessage: 'meal:event:ntfy-message',
} as const;

export interface NtfyEventPayload {
  title: string;
  message: string;
  tags?: string[];
}

/** main.ts 注入给 IPC 层的全部能力，避免 ipc.ts 反向依赖窗口实现 */
export interface IpcContext {
  getConfig: () => Config;
  setConfig: (patch: Partial<Config>) => Config;
  notify: (payload: NotifyPayload) => boolean;
  navigate: (path: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  setBadge: (count: number) => void;
  isAutostartEnabled: () => boolean;
  setAutostart: (enabled: boolean) => boolean;
  ntfyStatus: () => NtfyStatus;
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new TypeError(`${name} 必须是字符串`);
  return value;
}

function assertBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${name} 必须是布尔值`);
  return value;
}

function assertCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError('count 必须是非负数字');
  }
  return Math.floor(value);
}

function assertExternalUrl(value: unknown): string {
  const raw = assertString(value, 'url');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError('url 不是合法地址');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
    throw new TypeError('只允许打开 http(s) 或 mailto 链接');
  }
  return parsed.toString();
}

function sanitizePatch(value: unknown): Partial<Config> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('patch 必须是对象');
  }
  const input = value as Record<string, unknown>;
  const patch: Partial<Config> = {};
  if ('appUrl' in input) {
    const raw = assertString(input.appUrl, 'appUrl');
    const normalized = normalizeAppUrl(raw);
    if (!normalized) throw new TypeError('appUrl 不是合法的 http(s) 地址');
    patch.appUrl = normalized;
  }
  if ('autostart' in input) patch.autostart = assertBoolean(input.autostart, 'autostart');
  if ('closeToTray' in input) patch.closeToTray = assertBoolean(input.closeToTray, 'closeToTray');
  if ('ntfyEnabled' in input) patch.ntfyEnabled = assertBoolean(input.ntfyEnabled, 'ntfyEnabled');
  if ('ntfyServerUrl' in input) patch.ntfyServerUrl = assertString(input.ntfyServerUrl, 'ntfyServerUrl').trim();
  if ('ntfyTopic' in input) patch.ntfyTopic = assertString(input.ntfyTopic, 'ntfyTopic').trim();
  return patch;
}

function sanitizeNotifyPayload(value: unknown): NotifyPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('notify payload 必须是对象');
  }
  const input = value as Record<string, unknown>;
  const payload: NotifyPayload = {
    title: assertString(input.title, 'title'),
    body: assertString(input.body, 'body'),
  };
  if ('path' in input && input.path !== undefined) {
    payload.path = assertString(input.path, 'path');
  }
  return payload;
}

export function registerIpc(ctx: IpcContext): void {
  ipcMain.handle(CHANNELS.getConfig, () => ctx.getConfig());

  ipcMain.handle(CHANNELS.setConfig, (_event, patch: unknown) => ctx.setConfig(sanitizePatch(patch)));

  ipcMain.handle(CHANNELS.notify, (_event, payload: unknown) => ctx.notify(sanitizeNotifyPayload(payload)));

  ipcMain.handle(CHANNELS.navigate, async (_event, target: unknown) => {
    await ctx.navigate(assertString(target, 'path'));
  });

  ipcMain.handle(CHANNELS.openExternal, async (_event, url: unknown) => {
    await ctx.openExternal(assertExternalUrl(url));
  });

  ipcMain.handle(CHANNELS.setBadge, (_event, count: unknown) => {
    ctx.setBadge(assertCount(count));
  });

  ipcMain.handle(CHANNELS.autostartGet, () => ctx.isAutostartEnabled());
  ipcMain.handle(CHANNELS.autostartSet, (_event, enabled: unknown) => ctx.setAutostart(assertBoolean(enabled, 'enabled')));
  ipcMain.handle(CHANNELS.ntfyStatus, () => ctx.ntfyStatus());

  // 预加载脚本需要在 exposeInMainWorld 前同步拿到版本号
  ipcMain.on(CHANNELS.versionSync, (event) => {
    event.returnValue = app.getVersion();
  });
}

/** 通知渲染进程导航（例如点击通知后由 preload 的 onNavigate 订阅） */
export function broadcastNavigate(path: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(CHANNELS.eventNavigate, path);
  }
}

/** 把主进程订阅到的 ntfy 消息转发给渲染进程 */
export function broadcastNtfyMessage(payload: NtfyEventPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(CHANNELS.eventNtfyMessage, payload);
  }
}
