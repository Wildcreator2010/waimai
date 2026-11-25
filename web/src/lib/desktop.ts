// 桌面端（Electron）桥接层。
//
// 桌面壳通过 contextBridge 暴露 window.mealDesktop；纯浏览器环境没有这个对象。
// 所以约定：所有桌面专属能力都必须先 getDesktop() 判空，保证 Web 与桌面共用同一套页面代码。
// 类型必须与 desktop/src/preload.ts 的暴露面保持一致。

export interface DesktopConfig {
  appUrl: string;
  autostart: boolean;
  closeToTray: boolean;
  ntfyEnabled: boolean;
  ntfyServerUrl: string;
  ntfyTopic: string;
}

export interface DesktopNotifyPayload {
  title: string;
  body: string;
  /** 点击通知后要打开的站内路径，如 /reminders/:id */
  path?: string;
}

export interface DesktopNtfyStatus {
  connected: boolean;
  serverUrl: string | null;
  topic: string | null;
}

export interface DesktopNtfyMessage {
  title: string;
  message: string;
  tags?: string[];
}

export interface MealDesktopBridge {
  platform: string;
  appVersion: string;
  getConfig(): Promise<DesktopConfig>;
  setConfig(patch: Partial<DesktopConfig>): Promise<DesktopConfig>;
  notify(payload: DesktopNotifyPayload): Promise<boolean>;
  navigate(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  setBadge(count: number): Promise<void>;
  isAutostartEnabled(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<boolean>;
  ntfyStatus(): Promise<DesktopNtfyStatus>;
  onNavigate(cb: (path: string) => void): () => void;
  onNtfyMessage(cb: (msg: DesktopNtfyMessage) => void): () => void;
}

declare global {
  interface Window {
    mealDesktop?: MealDesktopBridge;
  }
}

export function getDesktop(): MealDesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.mealDesktop ?? null;
}

export function isDesktop(): boolean {
  return getDesktop() !== null;
}
