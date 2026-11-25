// 桌面端专属设置卡片：只在 Electron 环境渲染，浏览器里返回 null。
//
// 内容：
// - 开机自启：直接写系统登录项（Windows 注册表 Run 键 / macOS 登录项 / Linux autostart）；
// - ntfy 订阅状态：主进程负责长连接与系统通知，这里只展示连接健康度。
import { useEffect, useState } from 'react';
import { Text } from '@fluentui/react-components';
import { Card, CardHeader } from '@/components/Card';
import { Switch } from '@/components/Form';
import { APP_NAME } from '@/lib/brand';
import { getDesktop } from '@/lib/desktop';

export function DesktopSettingsCard() {
  const desktop = getDesktop();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [ntfy, setNtfy] = useState<{ connected: boolean; topic: string | null } | null>(null);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;

    async function load() {
      if (!desktop) return;
      const [enabled, status] = await Promise.all([
        desktop.isAutostartEnabled().catch(() => null),
        desktop.ntfyStatus().catch(() => null),
      ]);
      if (cancelled) return;
      setAutostart(enabled);
      setNtfy(status ? { connected: status.connected, topic: status.topic } : null);
    }

    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [desktop]);

  if (!desktop) return null;

  async function handleAutostart(next: boolean) {
    if (!desktop) return;
    setSaving(true);
    try {
      const applied = await desktop.setAutostart(next);
      setAutostart(applied);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="桌面端"
        description={`${APP_NAME}桌面客户端 ${desktop.appVersion} · ${desktop.platform}`}
      />
      <div className="space-y-4">
        <Switch
          label="开机自启"
          description="登录系统后自动在托盘启动，入柜提醒不依赖手动打开应用"
          checked={autostart === true}
          disabled={saving || autostart === null}
          onChange={(next) => void handleAutostart(next)}
        />
        <div className="text-sm text-slate-700">
          <p>
            入柜提醒订阅：
            {ntfy === null ? (
              <span className="text-slate-500">获取状态中…</span>
            ) : ntfy.connected ? (
              <span className="text-emerald-700">已连接，命中后会弹系统通知</span>
            ) : (
              <span className="text-amber-700">未连接（可在上方开启「允许主动连接 ntfy」）</span>
            )}
          </p>
          {ntfy?.topic ? (
            <p className="mt-1 text-xs text-slate-500">
              订阅主题：<span className="font-mono">{ntfy.topic}</span>
            </p>
          ) : null}
        </div>
        <Text size={200} className="block text-slate-500">
          关闭窗口时应用会缩到系统托盘继续运行，从托盘菜单才能真正退出。
        </Text>
      </div>
    </Card>
  );
}
