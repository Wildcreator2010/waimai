import { app } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const LINUX_DESKTOP_FILE = 'meal-reminder.desktop';

function linuxAutostartDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg.trim() : path.join(os.homedir(), '.config');
  return path.join(base, 'autostart');
}

function linuxDesktopFilePath(): string {
  return path.join(linuxAutostartDir(), LINUX_DESKTOP_FILE);
}

function linuxDesktopEntry(): string {
  const exec = process.execPath;
  const appPath = app.getAppPath();
  const appArg = app.isPackaged ? '' : ` "${appPath}"`;
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=取餐提醒',
    'Comment=外卖入柜后的取餐提醒',
    `Exec="${exec}"${appArg}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

/** 当前是否已开启开机自启 */
export function isEnabled(): boolean {
  try {
    if (process.platform === 'linux') {
      return fs.existsSync(linuxDesktopFilePath());
    }
    return app.getLoginItemSettings().openAtLogin;
  } catch (err) {
    console.warn('[autostart] 读取开机自启状态失败:', err);
    return false;
  }
}

/** 设置开机自启，返回设置后的实际状态（失败时保持原状态） */
export function setEnabled(enabled: boolean): boolean {
  try {
    if (process.platform === 'linux') {
      const file = linuxDesktopFilePath();
      if (enabled) {
        fs.mkdirSync(linuxAutostartDir(), { recursive: true });
        fs.writeFileSync(file, linuxDesktopEntry(), 'utf8');
      } else {
        fs.rmSync(file, { force: true });
      }
    } else {
      // Windows / macOS：开发态需要把应用目录作为启动参数，否则会只启动 Electron 空壳
      const args = app.isPackaged ? [] : [app.getAppPath()];
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: false,
        path: process.execPath,
        args,
      });
    }
  } catch (err) {
    console.warn('[autostart] 设置开机自启失败:', err);
  }
  return isEnabled();
}
