import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertBanner, EmptyState, ErrorState, LoadingBlock } from '@/components/Feedback';
import { Card, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { CaptchaField, type CaptchaPayload } from '@/components/CaptchaField';
import { DesktopSettingsCard } from '@/components/DesktopSettings';
import { Field, Input, Switch } from '@/components/Form';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import {
  useChangePassword,
  useDeleteAccount,
  useDeleteDevice,
  useDevices,
  useMeSettings,
  useRequestPhoneCode,
  useRotateNtfyTopic,
  useUnbindPhone,
  useUpdateMeSettings,
  useVerifyPhone,
} from '@/hooks/useMe';
import type { MeSettingsPatch } from '@/hooks/useMe';
import { errorText } from '@/lib/api';
import {
  currentSubscription,
  disableWebPush,
  enableWebPush,
  webPushSupported,
} from '@/lib/webpush';
import { phoneRequestSchema, phoneVerifySchema, zodErrors } from '@/lib/schemas';
import { formatDateTime } from '@/lib/utils';

export function SettingsPage() {
  const settings = useMeSettings();
  const updateSettings = useUpdateMeSettings();

  const devices = useDevices();
  const deleteDevice = useDeleteDevice();

  const requestCode = useRequestPhoneCode();
  const changePassword = useChangePassword();
  const deleteAccount = useDeleteAccount();
  const verifyPhone = useVerifyPhone();
  const unbindPhone = useUnbindPhone();
  const rotateNtfy = useRotateNtfyTopic();

  // 开关先存草稿，点「保存」才提交，避免误触即生效
  const [draft, setDraft] = useState<MeSettingsPatch | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // 手机号绑定
  const [phoneInput, setPhoneInput] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaPayload>({});
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pushState, setPushState] = useState<{
    supported: boolean;
    subscribed: boolean;
    permission: string;
  }>({ supported: false, subscribed: false, permission: 'default' });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const supported = webPushSupported();
      const sub = supported ? await currentSubscription() : null;
      if (!alive) return;
      setPushState({
        supported,
        subscribed: Boolean(sub),
        permission: supported ? Notification.permission : 'unsupported',
      });
    })();
    return () => {
      alive = false;
    };
  }, []);
  const [codeInput, setCodeInput] = useState('');
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({});
  const [phoneNotice, setPhoneNotice] = useState<string | null>(null);
  const [phoneFailure, setPhoneFailure] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [confirmUnbind, setConfirmUnbind] = useState(false);

  // ntfy / 设备
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotatedTopic, setRotatedTopic] = useState<string | null>(null);
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (settings.isLoading) {
    return <LoadingBlock text="正在加载通知设置…" />;
  }

  if (settings.isError) {
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  }

  if (!settings.data) {
    return <EmptyState title="没有可展示的设置" />;
  }

  const saved = settings.data;
  const current: MeSettingsPatch = draft ?? {
    showNotifyDetails: saved.showNotifyDetails,
    smsEnabled: saved.smsEnabled,
    ntfyEnabled: saved.ntfyEnabled,
  };
  const dirty =
    current.showNotifyDetails !== saved.showNotifyDetails ||
    current.smsEnabled !== saved.smsEnabled ||
    current.ntfyEnabled !== saved.ntfyEnabled;

  const phoneBound = Boolean(saved.phoneVerified && saved.phone);

  function patchDraft(patch: MeSettingsPatch) {
    setDraft({ ...current, ...patch });
  }

  async function handleSaveSettings() {
    if (updateSettings.isPending || !dirty) return;
    setNotice(null);
    setFailure(null);
    try {
      await updateSettings.mutateAsync(current);
      setDraft(null);
      setNotice('通知设置已保存');
    } catch (err) {
      setFailure(errorText(err, '保存失败，请稍后重试'));
    }
  }

  async function handleRequestCode() {
    setPhoneFailure(null);
    setPhoneNotice(null);
    const parsed = phoneRequestSchema.safeParse({ phone: phoneInput });
    if (!parsed.success) {
      setPhoneErrors(zodErrors(parsed.error));
      return;
    }
    setPhoneErrors({});
    try {
      await requestCode.mutateAsync({ phone: parsed.data.phone, ...captcha });
      setCooldown(60);
      setPhoneNotice('验证码已发送，5 分钟内有效（同号 60 秒一次、每天 5 次）');
    } catch (err) {
      setPhoneFailure(errorText(err, '验证码发送失败'));
    }
  }

  async function handleVerifyPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verifyPhone.isPending) return;

    setPhoneFailure(null);
    const parsed = phoneVerifySchema.safeParse({ phone: phoneInput, code: codeInput });
    if (!parsed.success) {
      setPhoneErrors(zodErrors(parsed.error));
      return;
    }
    setPhoneErrors({});
    try {
      await verifyPhone.mutateAsync(parsed.data);
      setPhoneNotice('手机号已绑定，命中提醒时将必发短信');
      setCodeInput('');
      setPhoneInput('');
    } catch (err) {
      setPhoneFailure(errorText(err, '验证失败'));
    }
  }

  async function handleUnbind() {
    setPhoneFailure(null);
    try {
      await unbindPhone.mutateAsync();
      setConfirmUnbind(false);
      setPhoneNotice('已解绑手机号，之后不再发送短信提醒');
    } catch (err) {
      setConfirmUnbind(false);
      setPhoneFailure(errorText(err, '解绑失败'));
    }
  }

  async function handleRotate() {
    setPhoneFailure(null);
    try {
      const result = await rotateNtfy.mutateAsync();
      setRotatedTopic(result.topic);
      setConfirmRotate(false);
      setNotice('ntfy topic 已重置，旧 topic 立即失效');
    } catch (err) {
      setConfirmRotate(false);
      setFailure(errorText(err, '重置 topic 失败'));
    }
  }

  async function handleDeleteDevice(id: string) {
    setFailure(null);
    try {
      await deleteDevice.mutateAsync(id);
      setPendingDeviceId(null);
      setNotice('设备已删除');
    } catch (err) {
      setPendingDeviceId(null);
      setFailure(errorText(err, '删除设备失败'));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="通知设置"
        description="短信、推送与内容开关都只影响你自己的账号。"
      />

      {notice ? <AlertBanner tone="success">{notice}</AlertBanner> : null}
      {failure ? (
        <AlertBanner tone="error" title="操作失败">
          {failure}
        </AlertBanner>
      ) : null}
      {!saved.smsAvailable ? (
        <AlertBanner tone="warn" title="服务端未启用短信通道">
          当前环境未配置阿里云短信，即使绑定手机号也只会记录站内事件。
        </AlertBanner>
      ) : null}

      <Card>
        <CardHeader
          title="提醒开关"
          description="内容开关只影响推送正文，短信模板由服务端固定，不受影响。"
          actions={
            <Button
              size="sm"
              loading={updateSettings.isPending}
              disabled={!dirty}
              onClick={handleSaveSettings}
            >
              保存
            </Button>
          }
        />
        <div className="space-y-4">
          <Switch
            label="推送显示柜号与取餐码"
            description="关闭后推送只说「外卖到了，打开 App 查看」（默认开启）"
            checked={Boolean(current.showNotifyDetails)}
            onChange={(next) => patchDraft({ showNotifyDetails: next })}
          />
          <Switch
            label="短信提醒"
            description="已绑定手机号时，命中与超时都会发一条短信"
            checked={Boolean(current.smsEnabled)}
            onChange={(next) => patchDraft({ smsEnabled: next })}
          />
          <Switch
            label="允许主动连接 ntfy"
            description="App 端用 WebSocket 长连接接收通知；有 GMS 时也可作为兜底通道"
            checked={Boolean(current.ntfyEnabled)}
            onChange={(next) => patchDraft({ ntfyEnabled: next })}
          />
          {dirty ? <p className="text-xs text-amber-600">有未保存的修改</p> : null}
        </div>
      </Card>

      <DesktopSettingsCard />

      <Card>
        <CardHeader
          title="手机号绑定"
          description="已绑定且开启短信时，任务命中必发短信；未绑定则只能通过 App/网页查看。"
          actions={
            phoneBound ? (
              <Button size="sm" variant="danger" onClick={() => setConfirmUnbind(true)}>
                解绑
              </Button>
            ) : null
          }
        />

        {phoneNotice ? (
          <AlertBanner tone="info" className="mb-3">
            {phoneNotice}
          </AlertBanner>
        ) : null}
        {phoneFailure ? (
          <AlertBanner tone="error" className="mb-3">
            {phoneFailure}
          </AlertBanner>
        ) : null}

        {phoneBound ? (
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            已绑定：<span className="font-mono">{saved.phone}</span>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={handleVerifyPhone} noValidate>
            <CaptchaField purpose="phone" onChange={setCaptcha} />

            <div className="flex flex-wrap items-end gap-2">
              <Field
                label="手机号"
                htmlFor="phone"
                required
                className="min-w-[200px] flex-1"
                error={phoneErrors.phone}
              >
                <Input
                  id="phone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="13800138000"
                  value={phoneInput}
                  invalid={Boolean(phoneErrors.phone)}
                  onChange={(event) => setPhoneInput(event.target.value)}
                />
              </Field>
              <Button
                variant="secondary"
                loading={requestCode.isPending}
                disabled={cooldown > 0}
                onClick={handleRequestCode}
              >
                {cooldown > 0 ? `${cooldown}s 后可重发` : '发送验证码'}
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Field
                label="验证码"
                htmlFor="code"
                required
                className="min-w-[160px] flex-1"
                error={phoneErrors.code}
              >
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6 位数字"
                  value={codeInput}
                  invalid={Boolean(phoneErrors.code)}
                  onChange={(event) => setCodeInput(event.target.value)}
                />
              </Field>
              <Button type="submit" loading={verifyPhone.isPending}>
                校验并绑定
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card>
        <CardHeader
          title="ntfy topic"
          description="每个账号一个随机 topic，仅你与管理员可见；重置后旧 topic 立即作废。"
          actions={
            <Button
              size="sm"
              variant="secondary"
              disabled={!saved.ntfyTopic}
              onClick={() => setConfirmRotate(true)}
            >
              重置 topic
            </Button>
          }
        />
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">当前 topic</dt>
            <dd className="break-all font-mono text-sm text-slate-800">
              {saved.ntfyTopic ?? '未生成'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">ntfy 服务地址</dt>
            <dd className="break-all text-sm text-slate-800">{saved.ntfyServerUrl}</dd>
          </div>
        </dl>
        {rotatedTopic ? (
          <AlertBanner tone="success" className="mt-3" title="新 topic 已生成">
            <span className="break-all font-mono">{rotatedTopic}</span>
            <p className="mt-1 text-xs">请在 App 内重新订阅该 topic。</p>
          </AlertBanner>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="设备列表" description="App 登录后自动注册，pushMode 决定推送通道。" />
        {devices.isLoading ? <LoadingBlock /> : null}
        {devices.isError ? (
          <ErrorState error={devices.error} onRetry={() => void devices.refetch()} />
        ) : null}
        {devices.data ? (
          devices.data.length === 0 ? (
            <EmptyState
              title="还没有注册设备"
              description="在 App 上登录一次即可自动注册推送设备。"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {devices.data.map((device) => (
                <li key={device.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {device.name || '未命名设备'}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {device.platform} · {device.pushMode}
                        {device.appVersion ? ` · v${device.appVersion}` : ''}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      最近活跃 {formatDateTime(device.lastSeenAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={deleteDevice.isPending && pendingDeviceId === device.id}
                    onClick={() => setPendingDeviceId(device.id)}
                  >
                    删除
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>

      <Modal
        open={confirmUnbind}
        title="解绑手机号？"
        description="解绑后不再发送短信，命中提醒只能通过 App/网页查看。"
        onClose={() => setConfirmUnbind(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmUnbind(false)}>
              取消
            </Button>
            <Button variant="danger" loading={unbindPhone.isPending} onClick={handleUnbind}>
              确认解绑
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">当前绑定：{saved.phone}</p>
      </Modal>

      <Modal
        open={confirmRotate}
        title="重置 ntfy topic？"
        description="旧 topic 立即作废，服务端不再向旧 topic 推送，需要在 App 内重新订阅。"
        onClose={() => setConfirmRotate(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRotate(false)}>
              取消
            </Button>
            <Button loading={rotateNtfy.isPending} onClick={handleRotate}>
              确认重置
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">当前 topic：{saved.ntfyTopic ?? '未生成'}</p>
      </Modal>

      <Card>
        <CardHeader
          title="浏览器推送"
          description="开启后即使不装 App，浏览器也能收到入柜提醒（需要浏览器支持 Web Push）。"
        />
        <div className="space-y-2 text-sm">
          {!pushState.supported ? (
            <p className="text-slate-500">当前浏览器不支持 Web Push。</p>
          ) : (
            <>
              <p className="text-slate-600">
                状态：
                <span className={pushState.subscribed ? 'text-emerald-600' : 'text-amber-600'}>
                  {pushState.subscribed ? '已开启' : '未开启'}
                </span>
                {pushState.permission === 'denied' ? '（浏览器已拒绝通知权限，需在站点设置里重新允许）' : ''}
              </p>
              {pushMessage ? <p className="text-xs text-slate-600">{pushMessage}</p> : null}
              <div className="flex gap-2">
                <Button
                  loading={pushBusy}
                  disabled={pushState.subscribed || pushState.permission === 'denied'}
                  onClick={async () => {
                    setPushBusy(true);
                    setPushMessage(null);
                    try {
                      await enableWebPush();
                      const sub = await currentSubscription();
                      setPushState((prev) => ({ ...prev, subscribed: Boolean(sub), permission: Notification.permission }));
                      setPushMessage('已开启，可以用管理台「发送测试推送」验证');
                    } catch (err) {
                      setPushMessage(errorText(err, '开启失败'));
                    } finally {
                      setPushBusy(false);
                    }
                  }}
                >
                  开启浏览器推送
                </Button>
                <Button
                  variant="secondary"
                  loading={pushBusy}
                  disabled={!pushState.subscribed}
                  onClick={async () => {
                    setPushBusy(true);
                    setPushMessage(null);
                    try {
                      await disableWebPush();
                      setPushState((prev) => ({ ...prev, subscribed: false }));
                      setPushMessage('已关闭');
                    } catch (err) {
                      setPushMessage(errorText(err, '关闭失败'));
                    } finally {
                      setPushBusy(false);
                    }
                  }}
                >
                  关闭
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                说明：浏览器推送最终经浏览器厂商的推送服务转发（Chrome 走 Google），国内网络下可能不可达；
                这种情况请以 App 推送或短信为准。
              </p>
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="账号安全" description="修改密码后其他设备会被登出，当前会话保持有效。" />
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setPasswordError(null);
            setPasswordNotice(null);
            if (newPassword.length < 8) {
              setPasswordError('新密码至少 8 位');
              return;
            }
            if (newPassword !== confirmNewPassword) {
              setPasswordError('两次输入的新密码不一致');
              return;
            }
            try {
              await changePassword.mutateAsync({ currentPassword, newPassword });
              setPasswordNotice('密码已修改');
              setCurrentPassword('');
              setNewPassword('');
              setConfirmNewPassword('');
            } catch (err) {
              setPasswordError(errorText(err, '修改密码失败'));
            }
          }}
        >
          <Field label="当前密码" htmlFor="currentPassword" required>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field label="新密码" htmlFor="newPassword" required hint="至少 8 位，且同时包含字母和数字">
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          <Field label="确认新密码" htmlFor="confirmNewPassword" required>
            <Input
              id="confirmNewPassword"
              type="password"
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
            />
          </Field>
          {passwordError ? <p className="text-xs text-rose-600">{passwordError}</p> : null}
          {passwordNotice ? <p className="text-xs text-emerald-600">{passwordNotice}</p> : null}
          <Button type="submit" loading={changePassword.isPending}>
            修改密码
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="危险操作"
          description="注销账号会删除你的全部任务、事件与设备记录，不可恢复。"
        />
        <div className="space-y-2">
          <Field label="输入密码以确认注销" htmlFor="deletePassword">
            <Input
              id="deletePassword"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => {
                setDeletePassword(event.target.value);
                setDeleteError(null);
              }}
            />
          </Field>
          {deleteError ? <p className="text-xs text-rose-600">{deleteError}</p> : null}
          <Button
            variant="danger"
            disabled={!deletePassword}
            onClick={() => setConfirmDelete(true)}
          >
            注销我的账号
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmDelete}
        title="确认注销账号？"
        description="账号与全部任务将被永久删除，无法恢复。"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={deleteAccount.isPending}
              onClick={async () => {
                try {
                  await deleteAccount.mutateAsync(deletePassword);
                  window.location.href = '/login';
                } catch (err) {
                  setConfirmDelete(false);
                  setDeleteError(errorText(err, '注销失败'));
                }
              }}
            >
              确认注销
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          注销后需要管理员重新发邀请码才能再次注册。初始管理员（ROOT）不能注销自己，请先转让。
        </p>
      </Modal>

      <Modal
        open={pendingDeviceId !== null}        title="删除该设备？"
        description="删除后该设备不再收到推送，可让用户重新登录 App 注册。"
        onClose={() => setPendingDeviceId(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDeviceId(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={deleteDevice.isPending}
              onClick={() => pendingDeviceId && handleDeleteDevice(pendingDeviceId)}
            >
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {devices.data?.find((device) => device.id === pendingDeviceId)?.name || '该设备'}
        </p>
      </Modal>
    </div>
  );
}
