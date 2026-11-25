import { Notification } from 'electron';

export interface NotifyPayload {
  title: string;
  body: string;
  /** 点击通知后要导航到的站点内路径，例如 /reminders/123 */
  path?: string;
}

interface NotificationDeps {
  /** 点击通知：显示主窗口并按 path 导航 */
  onClick: (path?: string) => void;
  /** 系统通知不可用时的降级（托盘气泡 / 日志） */
  fallback: (payload: NotifyPayload) => void;
}

let deps: NotificationDeps | null = null;

export function configureNotifications(next: NotificationDeps): void {
  deps = next;
}

/**
 * 发送系统通知。永不抛错：不支持时返回 false 并走降级。
 */
export function notify(payload: NotifyPayload): boolean {
  const title = typeof payload?.title === 'string' ? payload.title : '';
  const body = typeof payload?.body === 'string' ? payload.body : '';
  const path = typeof payload?.path === 'string' && payload.path ? payload.path : undefined;
  if (!title && !body) return false;

  if (Notification.isSupported()) {
    try {
      const notification = new Notification({
        title: title || '取餐提醒',
        body,
        silent: false,
      });
      notification.on('click', () => {
        try {
          deps?.onClick(path);
        } catch (err) {
          console.warn('[notify] 点击处理失败:', err);
        }
      });
      notification.show();
      return true;
    } catch (err) {
      console.warn('[notify] 系统通知发送失败，降级处理:', err);
    }
  }

  try {
    deps?.fallback({ title: title || '取餐提醒', body, path });
  } catch (err) {
    console.warn('[notify] 降级通知失败:', err);
  }
  return false;
}
