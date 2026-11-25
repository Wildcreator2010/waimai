import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertBanner, ErrorState, LoadingBlock } from '@/components/Feedback';
import { Button } from '@/components/Button';
import { Card, CardHeader } from '@/components/Card';
import { Field, Input, Switch } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { useAdminSettings, useUpdateAdminSettings } from '@/hooks/useAdmin';
import { errorText, api } from '@/lib/api';
import { adminSettingsSchema, zodErrors } from '@/lib/schemas';
import type { AdminSettingsInput } from '@/lib/schemas';
import type { SystemSettings } from '@/lib/types';

function toForm(settings: SystemSettings): AdminSettingsInput {
  return {
    pollIntervalSec: String(settings.pollIntervalSec),
    defaultDurationMin: String(settings.defaultDurationMin),
    maxDurationMin: String(settings.maxDurationMin),
    maxActiveRemindersPerUser: String(settings.maxActiveRemindersPerUser),
    lockerDeviceSn: settings.lockerDeviceSn,
    defaultLockerCabCode: settings.defaultLockerCabCode,
    lockerApiBase: settings.lockerApiBase,
    ntfyServerUrl: settings.ntfyServerUrl,
    registrationOpen: settings.registrationOpen,
    showNotifyDetailsDefault: settings.showNotifyDetailsDefault,
  };
}

export function AdminSettingsPage() {
  const settings = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();

  const [form, setForm] = useState<AdminSettingsInput | null>(null);
  const [fcm, setFcm] = useState<{
    enabled: boolean;
    deviceCount: number;
    fcmDeviceCount: number;
    hint: string;
  } | null>(null);

  useEffect(() => {
    api
      .get<{ enabled: boolean; deviceCount: number; fcmDeviceCount: number; hint: string }>(
        '/admin/notifications/fcm/status',
      )
      .then(setFcm)
      .catch(() => setFcm(null));
  }, []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data && form === null) setForm(toForm(settings.data));
  }, [settings.data, form]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (updateSettings.isPending || !form) return;

    const parsed = adminSettingsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }
    setErrors({});
    setFailure(null);
    setNotice(null);
    try {
      await updateSettings.mutateAsync(parsed.data);
      setNotice('系统设置已保存，轮询间隔等参数会在下一轮调度生效');
    } catch (err) {
      setFailure(errorText(err, '保存失败'));
    }
  }

  if (settings.isLoading) return <LoadingBlock text="正在加载系统设置…" />;
  if (settings.isError) {
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  }
  if (!form) return <ErrorState error={new Error('系统设置为空')} />;

  function patch(next: Partial<AdminSettingsInput>) {
    setForm((prev) => (prev ? { ...prev, ...next } : prev));
  }

  return (
    <div>
      <PageHeader
        title="系统设置"
        description="全局运行参数。轮询间隔、时长上限与任务上限影响所有用户。"
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (settings.data) {
                  setForm(toForm(settings.data));
                  setErrors({});
                }
              }}
            >
              重置
            </Button>
            <Button size="sm" type="submit" form="admin-settings-form" loading={updateSettings.isPending}>
              保存
            </Button>
          </>
        }
      />

      {notice ? <AlertBanner tone="success" className="mb-3">{notice}</AlertBanner> : null}
      {failure ? (
        <AlertBanner tone="error" title="保存失败" className="mb-3">
          {failure}
        </AlertBanner>
      ) : null}

      <Card>
        <CardHeader title="调度与任务" />
        <form id="admin-settings-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
          <Field
            label="轮询间隔（秒）"
            htmlFor="pollIntervalSec"
            required
            hint="下限 10；默认 60"
            error={errors.pollIntervalSec}
          >
            <Input
              id="pollIntervalSec"
              inputMode="numeric"
              value={form.pollIntervalSec}
              invalid={Boolean(errors.pollIntervalSec)}
              onChange={(event) => patch({ pollIntervalSec: event.target.value })}
            />
          </Field>

          <Field
            label="单用户任务上限"
            htmlFor="maxActiveRemindersPerUser"
            required
            hint="同时等待中的任务数上限"
            error={errors.maxActiveRemindersPerUser}
          >
            <Input
              id="maxActiveRemindersPerUser"
              inputMode="numeric"
              value={form.maxActiveRemindersPerUser}
              invalid={Boolean(errors.maxActiveRemindersPerUser)}
              onChange={(event) => patch({ maxActiveRemindersPerUser: event.target.value })}
            />
          </Field>

          <Field
            label="默认监控时长（分钟）"
            htmlFor="defaultDurationMin"
            required
            error={errors.defaultDurationMin}
          >
            <Input
              id="defaultDurationMin"
              inputMode="numeric"
              value={form.defaultDurationMin}
              invalid={Boolean(errors.defaultDurationMin)}
              onChange={(event) => patch({ defaultDurationMin: event.target.value })}
            />
          </Field>

          <Field
            label="最大监控时长（分钟）"
            htmlFor="maxDurationMin"
            required
            error={errors.maxDurationMin}
          >
            <Input
              id="maxDurationMin"
              inputMode="numeric"
              value={form.maxDurationMin}
              invalid={Boolean(errors.maxDurationMin)}
              onChange={(event) => patch({ maxDurationMin: event.target.value })}
            />
          </Field>

          <Field
            label="取餐柜设备 SN"
            htmlFor="lockerDeviceSn"
            required
            hint="短信模板里的 ${SN} 取这个值（默认 2680）"
            error={errors.lockerDeviceSn}
          >
            <Input
              id="lockerDeviceSn"
              value={form.lockerDeviceSn}
              invalid={Boolean(errors.lockerDeviceSn)}
              onChange={(event) => patch({ lockerDeviceSn: event.target.value })}
            />
          </Field>

          <Field
            label="默认柜机 cabCode"
            htmlFor="defaultLockerCabCode"
            required
            hint="建任务表单会自动预填这个值（抓包得到的柜机编号），用户仍可改"
            error={errors.defaultLockerCabCode}
          >
            <Input
              id="defaultLockerCabCode"
              value={form.defaultLockerCabCode}
              invalid={Boolean(errors.defaultLockerCabCode)}
              onChange={(event) => patch({ defaultLockerCabCode: event.target.value })}
            />
          </Field>

          <Field
            label="取餐柜接口地址"
            htmlFor="lockerApiBase"
            required
            hint="一般无需修改"
            error={errors.lockerApiBase}
          >
            <Input
              id="lockerApiBase"
              value={form.lockerApiBase}
              invalid={Boolean(errors.lockerApiBase)}
              onChange={(event) => patch({ lockerApiBase: event.target.value })}
            />
          </Field>

          <Field
            label="ntfy 服务地址"
            htmlFor="ntfyServerUrl"
            required
            hint="自建或公共实例，例如 https://ntfy.sh"
            error={errors.ntfyServerUrl}
            className="sm:col-span-2"
          >
            <Input
              id="ntfyServerUrl"
              value={form.ntfyServerUrl}
              invalid={Boolean(errors.ntfyServerUrl)}
              onChange={(event) => patch({ ntfyServerUrl: event.target.value })}
            />
          </Field>

          <div className="space-y-4 sm:col-span-2">
            <Switch
              label="开放注册"
              description="关闭后即使有邀请码也不能注册新账号"
              checked={form.registrationOpen}
              onChange={(next) => patch({ registrationOpen: next })}
            />
            <Switch
              label="通知内容默认显示柜号与取餐码"
              description="新用户的 showNotifyDetails 默认值（短信模板不受影响）"
              checked={form.showNotifyDetailsDefault}
              onChange={(next) => patch({ showNotifyDetailsDefault: next })}
            />
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="推送通道状态"
          description="FCM 需要服务端放置 Firebase 服务账号；未配置时全部设备走 ntfy。"
        />
        {fcm === null ? (
          <p className="text-sm text-slate-500">读取中…</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              FCM：
              <span className={fcm.enabled ? 'text-emerald-600' : 'text-amber-600'}>
                {fcm.enabled ? '已启用' : '未配置'}
              </span>
            </p>
            <p className="text-slate-600">
              设备总数 {fcm.deviceCount}，其中 FCM 设备 {fcm.fcmDeviceCount}
            </p>
            <p className="text-xs text-slate-500">{fcm.hint}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
