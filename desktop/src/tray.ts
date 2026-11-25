import { Menu, Tray, nativeImage } from 'electron';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';

/**
 * 32x32 托盘图标：蓝色圆角方块 + 白色钟表。
 * 由一次性 Node 脚本生成 PNG 后内联为 base64，不依赖任何外部图片文件。
 */
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABX0lEQVR42s1XvWrDMBDOy2g35D36BB0MmvMOGTp17Et0KqZz56zxlgcI2WRwhxYaQlD5TGUuRiedo9rywYHQz92n704nabVaoihtSqVNpbRplTY2Uds/W6XEcaG0qf/BKaewXYSctxM6p4wUPgD1DM57JnwxtzNrSQFUYxavN419fP60T69fnaKNvpEAKgpAFHs4+tifLScYwxxpLlAA0R2/7X6sVDBXwogIAAwdjpfe+Km5drQ/bNu+D230YcwJ1sRAiADQnQ935oRjCu0kAIhnyNgQgA90KCeiAFzCgVofnRwAzHXhgI27AMCIE8TXN4cDAMUaJ1wuBAFQ+pFkYwHQJOXCEARAd8BRyMnL+/fNOMdgMgA4mgyAJAQhTQ6BJAlDmpyEkmMYqp7Jx1BSiCTVM6kQxUpx7NJKLsWxy4gm3GSX0VzXcfYHSfYnWd5HafZn+SI+Jtm/Zov4nOaQX+mbHy1IYxXPAAAAAElFTkSuQmCC';

/** 16x16 Windows overlay 徽标：红色圆 + 白色数字（1-9 与 9+） */
const BADGE_OVERLAY_BASE64: Record<string, string> = {
  '1': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAgUlEQVR42q2T7QkAIQiGXcQdGsNxHKHNmsUJGqGjMAhOq+sSXujP++QngBGCFASJBSmq6jvAKtSYBKk4Si5IzXli7soviGfusYR4aU8ArZzxd9O4AJSWhXb4FMCgYyoHJVTFKwD+AWCziR8AwRyjF+YYrUXaAOxv49YqXzmm03N+AEQ98+RPhCUcAAAAAElFTkSuQmCC',
  '2': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAeUlEQVR42mNgwAIeynoYPJT1KHgo69EAxSC2AQMhANW4/6Gsx38ceD9Og6Ca3+PRDMPvMQxB14wL4DQE3dlEGAD2DrLteJ2Nw4D/YFdAQ5hcAwoYoNH0nwwvgHADVQwoIMHJWL1gQIEBBpRHI1USEsVJmSqZidzsDABTTwiHuflphwAAAABJRU5ErkJggg==',
  '3': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAdElEQVR42mNgwAIeynoYPJT1KHgo69EAxSC2AQMhANW4/6Gsx38ceD9Og6Ca3+PRDMPvMQxB14wL4DQE3dlEGAD2DrLteJ2Nw4D/YFdAQ5hcAwoYoNH0nwwvgHADVQyg2AuUBSLF0UiVhERxUqZKZiI3OwMA5YAIh4cVL5wAAAAASUVORK5CYII=',
  '4': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAgElEQVR42mNgwAIeynoYPJT1KHgo69EAxSC2AQMhANW4/6Gsx38ceD9Og6Ca3+PRDMPvMQxB1wwDuPgYhqA7mwgDwN5Btv0/GQb8B7sCGsLkGlDAAI0mrAagAywGNFDFgAJCUUfICwYUGGCANRqJNGA/0amQYEKiOClTJTORm50Bd9X6wL0gh7YAAAAASUVORK5CYII=',
  '5': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAe0lEQVR42mNgwAIeynoYPJT1KHgo69EAxSC2AQMhANW4/6Gsx38ceD9Og6Ca3+PRDMPvMQxB14wL4DQE3dlEGAD2DrLt/7EZQIR3DBigIUyuAQUM0Gj6T4YXQLiBKgYUEHIqHgMKsAYiCQYYUB6NVElIFCdlqmQmcrMzAFNPCIdQ374TAAAAAElFTkSuQmCC',
  '6': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAeklEQVR42mNgwAIeynoYPJT1KHgo69EAxSC2AQMhANW4/6Gsx38ceD9Og6Ca3+PRDMPvMQxB14wL4DQE3dlEGAD2DrLt/7EZQIR3DBigIUyuAQUM0Gj6T4YXQLiBKgYQ9AIeAwqICkQ8BhhQHo1USUgUJ2WqZCZyszMA/vcPY5GO+v4AAAAASUVORK5CYII=',
  '7': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAd0lEQVR42mNgwAIeynoYPJT1KHgo69EAxSC2AQMhANW4/6Gsx38ceD9Og6Ca3+PRDMPvMQxB14wL4DQE3dlEGAD2DrLteJ2Nw4D/YFdAQ5hcAwoYoNFErgENVDGAYi9QFojYopFIA/YTnQoJJiSKkzJVMhO52RkApILtCOd1PrwAAAAASUVORK5CYII=',
  '8': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAdElEQVR42mNgwAIeynoYPJT1KHgo69EAxSC2AQMhANW4/6Gsx38ceD9Og6Ca3+PRDMPvMQxB14wL4DQE3dlEGAD2DrLt/7EZgIuPhA0YoCFMrgEFDNBo+k+GF0C4gSoGUOwFygKR4mikSkKiOClTJTORm50BNMcWP+5XGE8AAAAASUVORK5CYII=',
  '9': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAeklEQVR42mNgwAIeynoYPJT1KHgo69EAxSC2AQMhANW4/6Gsx38ceD9Og6Ca3+PRDMPvMQxB14wL4DQE3dlEGAD2DrLt/7EZgIuPhA0YoCFMrgEFDNBo+k+GF0C4gSoGFBCKOkJeMKDAAAPKo5EqCYnipEyVzERudgYAiRAPY4M2mGAAAAAASUVORK5CYII=',
  '9+': 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAdUlEQVR42mNgwAIeynoYPJT1KHgo69EAxSC2AQMhANW4/6Gsx38ceD9Og6Ca3+PRDMPvMQz5jwMQbQgZBoC9A3c6ugZcBmARNwAZUECBAQUgAxoIeQGPfANVDCggwql4vWBAgQEGlEcjVRISxUmZKpmJ3OwMAAHTM+0D8PnFAAAAAElFTkSuQmCC',
};

export interface TrayOptions {
  onOpen: () => void;
  onNavigate: (path: string) => void;
  onToggleWindow: () => void;
  onQuit: () => void;
  isAutostartEnabled: () => boolean;
  setAutostart: (enabled: boolean) => boolean;
  getWindow: () => BrowserWindow | null;
}

export interface TrayController {
  /** 更新托盘 tooltip 与 Windows overlay 徽标 */
  setBadge: (count: number) => void;
  /** 重建菜单（开机自启状态变化后调用） */
  refreshMenu: () => void;
  /** Windows 托盘气泡降级通知 */
  displayBalloon: (title: string, content: string) => void;
  destroy: () => void;
}

function createMenuTemplate(options: TrayOptions): MenuItemConstructorOptions[] {
  return [
    { label: '打开主窗口', click: () => options.onOpen() },
    { label: '提醒任务', click: () => options.onNavigate('/reminders') },
    { label: '通知设置', click: () => options.onNavigate('/settings') },
    { label: '管理后台', click: () => options.onNavigate('/admin') },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: options.isAutostartEnabled(),
      click: (item) => {
        const ok = options.setAutostart(item.checked);
        item.checked = ok;
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => options.onQuit() },
  ];
}

export function createTray(options: TrayOptions): TrayController {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`);
  if (icon.isEmpty()) throw new Error('托盘图标解析失败');
  const tray = new Tray(icon);
  tray.setToolTip('取餐提醒');

  const buildMenu = (): Menu => Menu.buildFromTemplate(createMenuTemplate(options));
  const refreshMenu = (): void => {
    if (process.platform === 'darwin') return; // macOS 右键时现建菜单
    tray.setContextMenu(buildMenu());
  };

  refreshMenu();

  tray.on('click', () => options.onToggleWindow());
  if (process.platform === 'darwin') {
    tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  }

  const setBadge = (count: number): void => {
    const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    tray.setToolTip(safe > 0 ? `取餐提醒 · ${safe} 条待取` : '取餐提醒');
    if (process.platform !== 'win32') return;
    const win = options.getWindow();
    if (!win || win.isDestroyed()) return;
    if (safe <= 0) {
      win.setOverlayIcon(null, '');
      return;
    }
    const key = safe >= 10 ? '9+' : String(safe);
    const image = nativeImage.createFromDataURL(
      `data:image/png;base64,${BADGE_OVERLAY_BASE64[key] ?? BADGE_OVERLAY_BASE64['9+']}`,
    );
    win.setOverlayIcon(image.isEmpty() ? null : image, `${safe} 条待取提醒`);
  };

  const displayBalloon = (title: string, content: string): void => {
    if (process.platform === 'win32') {
      try {
        tray.displayBalloon({ title, content });
        return;
      } catch (err) {
        console.warn('[tray] 气泡通知失败:', err);
      }
    }
    console.log(`[notify:fallback] ${title} — ${content}`);
  };

  return {
    setBadge,
    refreshMenu,
    displayBalloon,
    destroy: () => {
      tray.destroy();
    },
  };
}
