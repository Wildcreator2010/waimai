import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

/**
 * 注意：preload 运行在 sandbox: true 环境，只能 require('electron')，
 * 不能 import 本地模块，因此这里的类型与频道名是 src/config.ts / src/ipc.ts 的镜像，改动需同步。
 */
export interface DesktopConfig {
  appUrl: string;
  autostart: boolean;
  closeToTray: boolean;
  ntfyEnabled: boolean;
  ntfyServerUrl: string;
  ntfyTopic: string;
}

export interface NtfyEvent {
  title: string;
  message: string;
  tags?: string[];
}

export interface NotifyInput {
  title: string;
  body: string;
  path?: string;
}

export interface NtfyStatusInfo {
  connected: boolean;
  serverUrl: string | null;
  topic: string | null;
}

export interface MealDesktopApi {
  platform: string;
  appVersion: string;
  getConfig: () => Promise<DesktopConfig>;
  setConfig: (patch: Partial<DesktopConfig>) => Promise<DesktopConfig>;
  notify: (payload: NotifyInput) => Promise<boolean>;
  navigate: (path: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  setBadge: (count: number) => Promise<void>;
  isAutostartEnabled: () => Promise<boolean>;
  setAutostart: (enabled: boolean) => Promise<boolean>;
  ntfyStatus: () => Promise<NtfyStatusInfo>;
  onNavigate: (cb: (path: string) => void) => () => void;
  onNtfyMessage: (cb: (msg: NtfyEvent) => void) => () => void;
}

const CH = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new TypeError(`${name} 必须是字符串`);
  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${name} 必须是布尔值`);
  return value;
}

function requireFunction(value: unknown, name: string): (...args: never[]) => void {
  if (typeof value !== 'function') throw new TypeError(`${name} 必须是函数`);
  return value as (...args: never[]) => void;
}

function readAppVersion(): string {
  try {
    const value: unknown = ipcRenderer.sendSync(CH.versionSync);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function sanitizeConfigPatch(input: unknown): Partial<DesktopConfig> {
  if (!isRecord(input)) throw new TypeError('patch 必须是对象');
  const patch: Partial<DesktopConfig> = {};
  if ('appUrl' in input) patch.appUrl = requireString(input.appUrl, 'appUrl');
  if ('autostart' in input) patch.autostart = requireBoolean(input.autostart, 'autostart');
  if ('closeToTray' in input) patch.closeToTray = requireBoolean(input.closeToTray, 'closeToTray');
  if ('ntfyEnabled' in input) patch.ntfyEnabled = requireBoolean(input.ntfyEnabled, 'ntfyEnabled');
  if ('ntfyServerUrl' in input) patch.ntfyServerUrl = requireString(input.ntfyServerUrl, 'ntfyServerUrl');
  if ('ntfyTopic' in input) patch.ntfyTopic = requireString(input.ntfyTopic, 'ntfyTopic');
  return patch;
}

function sanitizeNotifyInput(input: unknown): NotifyInput {
  if (!isRecord(input)) throw new TypeError('notify payload 必须是对象');
  const payload: NotifyInput = {
    title: requireString(input.title, 'title'),
    body: requireString(input.body, 'body'),
  };
  if (input.path !== undefined) payload.path = requireString(input.path, 'path');
  return payload;
}

function sanitizeNtfyEvent(input: unknown): NtfyEvent | null {
  if (!isRecord(input)) return null;
  const title = typeof input.title === 'string' ? input.title : '';
  const message = typeof input.message === 'string' ? input.message : '';
  const tags = Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === 'string') : undefined;
  return { title, message, tags };
}

const api: MealDesktopApi = {
  platform: process.platform,
  appVersion: readAppVersion(),

  getConfig: async () => (await ipcRenderer.invoke(CH.getConfig)) as DesktopConfig,

  setConfig: async (patch) => {
    const clean = sanitizeConfigPatch(patch);
    return (await ipcRenderer.invoke(CH.setConfig, clean)) as DesktopConfig;
  },

  notify: async (payload) => {
    const clean = sanitizeNotifyInput(payload);
    return (await ipcRenderer.invoke(CH.notify, clean)) as boolean;
  },

  navigate: async (path) => {
    const target = requireString(path, 'path');
    await ipcRenderer.invoke(CH.navigate, target);
  },

  openExternal: async (url) => {
    const target = requireString(url, 'url');
    await ipcRenderer.invoke(CH.openExternal, target);
  },

  setBadge: async (count) => {
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
      throw new TypeError('count 必须是非负数字');
    }
    await ipcRenderer.invoke(CH.setBadge, count);
  },

  isAutostartEnabled: async () => (await ipcRenderer.invoke(CH.autostartGet)) as boolean,

  setAutostart: async (enabled) => {
    const value = requireBoolean(enabled, 'enabled');
    return (await ipcRenderer.invoke(CH.autostartSet, value)) as boolean;
  },

  ntfyStatus: async () => (await ipcRenderer.invoke(CH.ntfyStatus)) as NtfyStatusInfo,

  onNavigate: (cb) => {
    requireFunction(cb, 'cb');
    const handler = cb as (path: string) => void;
    const listener = (_event: IpcRendererEvent, path: unknown): void => {
      if (typeof path === 'string') handler(path);
    };
    ipcRenderer.on(CH.eventNavigate, listener);
    return () => {
      ipcRenderer.removeListener(CH.eventNavigate, listener);
    };
  },

  onNtfyMessage: (cb) => {
    requireFunction(cb, 'cb');
    const handler = cb as (msg: NtfyEvent) => void;
    const listener = (_event: IpcRendererEvent, payload: unknown): void => {
      const message = sanitizeNtfyEvent(payload);
      if (message) handler(message);
    };
    ipcRenderer.on(CH.eventNtfyMessage, listener);
    return () => {
      ipcRenderer.removeListener(CH.eventNtfyMessage, listener);
    };
  },
};

try {
  contextBridge.exposeInMainWorld('mealDesktop', api);
} catch (err) {
  console.error('[preload] 暴露 mealDesktop 失败:', err);
}

declare global {
  interface Window {
    mealDesktop: MealDesktopApi;
  }
}
