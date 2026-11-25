import { app, BrowserWindow, shell } from 'electron';
import * as path from 'node:path';
import { DEFAULT_APP_URL, isConfigured, readConfig, writeConfig } from './config';
import type { Config } from './config';
import * as autostart from './autostart';
import { broadcastNavigate, broadcastNtfyMessage, registerIpc } from './ipc';
import type { IpcContext } from './ipc';
import { configureNotifications, notify } from './notifications';
import type { NotifyPayload } from './notifications';
import { NtfySubscriber } from './ntfy';
import type { NtfyMessage, NtfyStatus } from './ntfy';
import { createTray } from './tray';
import type { TrayController } from './tray';
import { openSetupWindow } from './setup-window';

const DEEP_LINK_PROTOCOL = 'mealreminder';
const APP_USER_MODEL_ID = 'com.mealreminder.desktop';
const SMOKE_MODE = process.argv.includes('--smoke-test');

let mainWindow: BrowserWindow | null = null;
let tray: TrayController | null = null;
let subscriber: NtfySubscriber | null = null;
let currentAppUrl = DEFAULT_APP_URL;
let badgeCount = 0;
let quitting = false;
let appReady = false;
let pendingDeepLink: string | null = null;

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------

interface CreateWindowOptions {
  show: boolean;
  load: boolean;
}

function buildTargetUrl(targetPath: string): string {
  const base = currentAppUrl.replace(/\/+$/, '');
  const normalized = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  return `${base}${normalized}`;
}

async function loadApp(win: BrowserWindow, targetPath = '/'): Promise<void> {
  try {
    await win.loadURL(buildTargetUrl(targetPath));
  } catch (err) {
    console.warn('[window] loadURL 失败:', err instanceof Error ? err.message : err);
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSameOrigin(value: string): boolean {
  try {
    return new URL(value).origin === new URL(currentAppUrl).origin;
  } catch {
    return false;
  }
}

async function openExternalSafe(url: string): Promise<void> {
  try {
    await shell.openExternal(url);
  } catch (err) {
    console.warn('[shell] openExternal 失败:', err instanceof Error ? err.message : err);
  }
}

function installNavigationGuards(win: BrowserWindow): void {
  // 拒绝任何新建窗口；外链交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url) && !isSameOrigin(url)) void openExternalSafe(url);
    return { action: 'deny' };
  });

  // 只允许 appUrl 同源导航，其余一律阻止并交给系统浏览器
  win.webContents.on('will-navigate', (event, url) => {
    if (isSameOrigin(url)) return;
    event.preventDefault();
    if (isHttpUrl(url)) void openExternalSafe(url);
  });

  win.webContents.on('will-redirect', (event, url) => {
    if (isSameOrigin(url)) return;
    event.preventDefault();
    if (isHttpUrl(url)) void openExternalSafe(url);
  });
}

function createMainWindow(options: CreateWindowOptions = { show: true, load: true }): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (options.show) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    return mainWindow;
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '取餐提醒',
    autoHideMenuBar: true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
    },
  });

  mainWindow = win;
  win.setMenuBarVisibility(false);
  installNavigationGuards(win);

  win.once('ready-to-show', () => {
    if (options.show) win.show();
  });

  win.on('close', (event) => {
    if (!quitting && readConfig().closeToTray) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) console.warn(`[window] 加载失败 (${code} ${description}): ${url}`);
  });

  if (options.load) void loadApp(win, '/');
  return win;
}

function showMainWindow(): BrowserWindow {
  const win = createMainWindow({ show: true, load: false });
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return win;
}

function toggleMainWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) {
    createMainWindow({ show: true, load: true });
    return;
  }
  if (win.isVisible()) win.hide();
  else showMainWindow();
}

function resolveSitePath(raw: string): string {
  const value = String(raw ?? '').trim();
  if (!value) return '/';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('无效的导航地址');
    }
    if (!isSameOrigin(value)) throw new Error('只允许导航到站点同源地址');
    return `${parsed.pathname || '/'}${parsed.search}${parsed.hash}`;
  }
  return value.startsWith('/') ? value : `/${value}`;
}

async function navigateTo(rawPath: string): Promise<void> {
  const target = resolveSitePath(rawPath);
  const win = showMainWindow();
  await loadApp(win, target);
  broadcastNavigate(target);
}

// ---------------------------------------------------------------------------
// ntfy / 通知
// ---------------------------------------------------------------------------

function handleNtfyMessage(msg: NtfyMessage): void {
  const title = (msg.title ?? '').trim() || '取餐提醒';
  const body = (msg.message ?? '').trim();
  notify({ title, body });
  broadcastNtfyMessage({
    title,
    message: body,
    tags: Array.isArray(msg.tags) ? msg.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
  });
}

function applyNtfyConfig(cfg: Config): void {
  if (SMOKE_MODE) return;
  if (!cfg.ntfyEnabled || !cfg.ntfyServerUrl || !cfg.ntfyTopic) {
    subscriber?.stop();
    return;
  }
  if (!subscriber) subscriber = new NtfySubscriber(handleNtfyMessage);
  subscriber.start(cfg.ntfyServerUrl, cfg.ntfyTopic);
}

function currentNtfyStatus(): NtfyStatus {
  return subscriber?.status() ?? { connected: false, serverUrl: null, topic: null };
}

// ---------------------------------------------------------------------------
// IPC 上下文
// ---------------------------------------------------------------------------

function applyAutostart(enabled: boolean): boolean {
  const actual = autostart.setEnabled(enabled);
  try {
    writeConfig({ autostart: actual });
  } catch (err) {
    console.warn('[autostart] 同步配置失败:', err);
  }
  tray?.refreshMenu();
  return actual;
}

const ipcContext: IpcContext = {
  getConfig: () => readConfig(),

  setConfig: (patch) => {
    const previous = readConfig();
    const next = writeConfig(patch);
    if (next.appUrl !== previous.appUrl) {
      currentAppUrl = next.appUrl;
      if (mainWindow && !mainWindow.isDestroyed()) void loadApp(mainWindow, '/');
    }
    if (typeof patch.autostart === 'boolean') {
      if (autostart.isEnabled() !== patch.autostart) applyAutostart(patch.autostart);
    }
    applyNtfyConfig(next);
    return next;
  },

  notify: (payload: NotifyPayload) => notify(payload),

  navigate: (target) => navigateTo(target),

  openExternal: async (url) => {
    await shell.openExternal(url);
  },

  setBadge: (count) => {
    badgeCount = count;
    tray?.setBadge(count);
    if (process.platform === 'darwin') app.dock?.setBadge(count > 0 ? String(count) : '');
  },

  isAutostartEnabled: () => autostart.isEnabled(),

  setAutostart: (enabled) => applyAutostart(enabled),

  ntfyStatus: () => currentNtfyStatus(),
};

// ---------------------------------------------------------------------------
// 托盘 / 协议
// ---------------------------------------------------------------------------

function createTraySafe(): void {
  try {
    tray = createTray({
      onOpen: () => showMainWindow(),
      onNavigate: (target) => {
        showMainWindow();
        void navigateTo(target).catch((err: unknown) => console.warn('[tray] 导航失败:', err));
      },
      onToggleWindow: () => toggleMainWindow(),
      onQuit: () => {
        quitting = true;
        app.quit();
      },
      isAutostartEnabled: () => autostart.isEnabled(),
      setAutostart: (enabled) => applyAutostart(enabled),
      getWindow: () => mainWindow,
    });
    tray.setBadge(badgeCount);
  } catch (err) {
    tray = null;
    console.error('[tray] 创建托盘失败:', err);
  }
}

function registerProtocol(): void {
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
    }
  } catch (err) {
    console.warn('[protocol] 注册自定义协议失败:', err);
  }
}

function handleDeepLink(rawUrl: string): void {
  // macOS 的 open-url 可能在 app ready 之前到达，先排队
  if (!appReady) {
    pendingDeepLink = rawUrl;
    return;
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== `${DEEP_LINK_PROTOCOL}:`) return;
    const sitePath = `/${url.host}${url.pathname}`.replace(/\/{2,}/g, '/');
    showMainWindow();
    void navigateTo(sitePath).catch((err: unknown) => console.warn('[deeplink] 导航失败:', err));
  } catch (err) {
    console.warn('[deeplink] 无法解析链接:', err);
  }
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  registerProtocol();

  configureNotifications({
    onClick: (targetPath) => {
      showMainWindow();
      if (targetPath) {
        void navigateTo(targetPath).catch((err: unknown) => console.warn('[notify] 导航失败:', err));
      }
    },
    fallback: (payload) => {
      if (tray) tray.displayBalloon(payload.title, payload.body);
      else console.log(`[notify:fallback] ${payload.title} — ${payload.body}`);
    },
  });

  let cfg = readConfig();
  if (!isConfigured()) {
    const chosen = await openSetupWindow(DEFAULT_APP_URL);
    if (!chosen) {
      quitting = true;
      app.quit();
      return;
    }
    cfg = writeConfig({ appUrl: chosen });
  }
  currentAppUrl = cfg.appUrl;
  appReady = true;

  // 必须先注册 IPC：preload 会用 sendSync 取版本号
  registerIpc(ipcContext);
  createMainWindow({ show: true, load: true });
  createTraySafe();
  applyNtfyConfig(cfg);

  // 首次通过 mealreminder:// 协议拉起时，Windows 会把链接放在启动参数里；
  // macOS 的 open-url 可能已提前排队
  const initialDeepLink = pendingDeepLink ?? process.argv.find((arg) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`));
  pendingDeepLink = null;
  if (initialDeepLink) handleDeepLink(initialDeepLink);
}

function bootstrapSmoke(): void {
  try {
    const cfg = readConfig(); // 缺少配置时使用默认值，不弹设置窗口
    currentAppUrl = cfg.appUrl;
    registerIpc(ipcContext);
    const win = createMainWindow({ show: false, load: false }); // 隐藏窗口，不加载网络地址
    createTraySafe();

    // --smoke-load：额外验证「桌面壳真的能把站点加载起来」。
    // 单实例锁依赖 Chromium 的命名管道，在受限环境里拿不到，非 smoke 启动会直接退出；
    // 因此这条路径是沙箱/CI 中唯一能验证 loadURL 的入口。
    if (process.argv.includes('--smoke-load')) {
      const finish = (code: number, line: string): void => {
        process.stdout.write(`${line}\n`, () => app.exit(code));
        setTimeout(() => app.exit(code), 3000);
      };
      win.webContents.once('did-fail-load', (_event, code, description) =>
        finish(1, `SMOKE_LOAD_FAIL ${code} ${description}`),
      );
      win.webContents.once('did-finish-load', () => {
        // did-finish-load 只代表文档加载完成；React 是异步挂载的，等一下再确认 #root 有子节点，
        // 否则「加载成功」可能只是拿到了一张白屏。
        setTimeout(() => {
          void win.webContents
            .executeJavaScript(
              '({ title: document.title, mounted: (document.getElementById("root")?.childElementCount ?? 0) > 0, path: location.pathname, bridge: typeof window.mealDesktop })',
            )
            .then((info: { title: string; mounted: boolean; path: string; bridge: string }) =>
              finish(
                info.mounted && info.bridge === 'object' ? 0 : 1,
                `SMOKE_LOAD_${info.mounted && info.bridge === 'object' ? 'OK' : 'FAIL'} ${currentAppUrl} title=${info.title} path=${info.path} bridge=${info.bridge}`,
              ),
            )
            .catch((err: unknown) =>
              finish(1, `SMOKE_LOAD_EVAL_FAIL ${err instanceof Error ? err.message : String(err)}`),
            );
        }, 1200);
      });
      void loadApp(win, '/login');
      return;
    }

    printSmokeOk();
  } catch (err) {
    console.error('[smoke] 启动失败:', err);
    app.exit(1);
  }
}

function printSmokeOk(): void {
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    app.exit(0);
  };
  try {
    process.stdout.write(`SMOKE_OK ${app.getVersion()}\n`, finish);
  } catch {
    console.log(`SMOKE_OK ${app.getVersion()}`);
    finish();
  }
  // 极端情况下 stdout 回调不触发时兜底退出
  setTimeout(finish, 2000);
}

if (SMOKE_MODE) {
  // 冒烟测试不抢单实例锁，避免本机已有正式实例时无法验证
  void app.whenReady().then(bootstrapSmoke);
} else {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', (_event, argv) => {
      const deepLink = argv.find((arg) => arg.startsWith(`${DEEP_LINK_PROTOCOL}://`));
      if (!appReady) {
        if (deepLink) pendingDeepLink = deepLink;
        return;
      }
      if (deepLink) handleDeepLink(deepLink);
      else showMainWindow();
    });

    app.on('open-url', (event, url) => {
      event.preventDefault();
      handleDeepLink(url);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow({ show: true, load: true });
      else showMainWindow();
    });

    app.on('window-all-closed', () => {
      if (process.platform === 'darwin') return;
      // closeToTray 为 true 时窗口关闭被拦截，这里只处理真正关闭的情况
      if (!readConfig().closeToTray) app.quit();
    });

    app.on('before-quit', () => {
      quitting = true;
      subscriber?.stop();
      subscriber = null;
      tray?.destroy();
      tray = null;
    });

    void app.whenReady().then(bootstrap).catch((err: unknown) => {
      console.error('[app] 启动失败:', err);
      app.exit(1);
    });
  }
}
