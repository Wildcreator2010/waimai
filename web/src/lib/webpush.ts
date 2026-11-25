import { api } from '@/lib/api';

/** 浏览器是否支持 Web Push（需要 Service Worker + PushManager + 通知权限）。 */
export function webPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/** 当前是否已订阅。 */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** 开启浏览器推送：申请权限 → 订阅 → 上报服务端。 */
export async function enableWebPush(): Promise<void> {
  if (!webPushSupported()) throw new Error('当前浏览器不支持 Web Push');

  const key = await api.get<{ enabled: boolean; publicKey: string }>('/me/webpush/key');
  if (!key.enabled || !key.publicKey) {
    throw new Error('服务端未启用浏览器推送（缺 VAPID 密钥）');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('浏览器拒绝了通知权限');

  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(key.publicKey),
    }));

  const json = sub.toJSON();
  await api.post<void>('/me/webpush/subscribe', {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  });
}

/** 关闭浏览器推送：取消订阅并通知服务端删除。 */
export async function disableWebPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post<void>('/me/webpush/unsubscribe', { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
