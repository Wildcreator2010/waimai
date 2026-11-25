import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertBanner } from '@/components/Feedback';
import { Card, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Field, Input } from '@/components/Form';
import { PageHeader } from '@/components/PageHeader';
import { useCreateReminder } from '@/hooks/useReminders';
import { useMeSettings } from '@/hooks/useMe';
import { errorText } from '@/lib/api';
import { reminderCreateSchema, zodErrors } from '@/lib/schemas';
import type { ReminderCreateInput } from '@/lib/schemas';
import type { CreateReminderResponse } from '@/lib/types';

const FALLBACK_DURATION = '60';
const FALLBACK_MAX_DURATION = 720;

type CodeMode = 'custom' | 'phone_tail';

/** 从掩码手机号（138****8000）里取后四位；取不到返回空串。 */
function tailFromMaskedPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

export function ReminderNewPage() {
  const navigate = useNavigate();
  const createReminder = useCreateReminder();
  const { data: settings } = useMeSettings();

  const [values, setValues] = useState<ReminderCreateInput>({
    codeMode: 'custom',
    pickupCode: '',
    cabCode: '',
    durationMin: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateReminderResponse | null>(null);
  const prefilled = useRef(false);

  const defaultDuration = String(settings?.defaultDurationMin ?? FALLBACK_DURATION);
  const maxDuration = settings?.maxDurationMin ?? FALLBACK_MAX_DURATION;
  const mode: CodeMode = values.codeMode === 'phone_tail' ? 'phone_tail' : 'custom';

  // 服务端下发默认柜机与默认时长后，只自动填一次，避免覆盖用户已输入的内容
  useEffect(() => {
    if (prefilled.current || !settings) return;
    prefilled.current = true;
    setValues((prev) => ({
      ...prev,
      cabCode: prev.cabCode || settings.defaultCabCode,
      durationMin: prev.durationMin || String(settings.defaultDurationMin),
    }));
  }, [settings]);

  function switchMode(next: CodeMode) {
    setErrors((prev) => ({ ...prev, pickupCode: '' }));
    setValues((prev) => {
      if (next === 'custom') {
        return { ...prev, codeMode: next, pickupCode: '' };
      }
      const tail = tailFromMaskedPhone(settings?.phone);
      return { ...prev, codeMode: next, pickupCode: tail || prev.pickupCode };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createReminder.isPending) return;

    const parsed = reminderCreateSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }

    setErrors({});
    setFailure(null);
    try {
      const result = await createReminder.mutateAsync(parsed.data);
      setCreated(result);
    } catch (err) {
      setFailure(errorText(err, '创建失败，请稍后重试'));
    }
  }

  const phoneNotBound = Boolean(
    created?.warnings?.some((warning) => warning.code === 'PHONE_NOT_BOUND'),
  );

  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <PageHeader title="任务已创建" />

        {phoneNotBound ? (
          <AlertBanner tone="warn" title="未绑定手机号，短信不可达，只能通过 App/网页查看">
            <p>
              服务端不会发送短信提醒，任务命中后请留意 App 推送或网页。建议前往
              <Link to="/settings" className="mx-1 font-medium underline">
                通知设置
              </Link>
              绑定手机号。
            </p>
            {created.warnings
              ?.filter((warning) => warning.code === 'PHONE_NOT_BOUND')
              .map((warning) => (
                <p key={warning.code} className="mt-1 text-xs">
                  {warning.message}
                </p>
              ))}
          </AlertBanner>
        ) : null}

        <AlertBanner tone="success" title="已开始监控">
          第一次查询只记录基线，之后只提醒「新出现且与基线不同」的记录，所以不会把上一单当成这一单。
          超过监控时长仍未入柜则通知超时。
        </AlertBanner>

        <Card>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">任务 ID</dt>
              <dd className="break-all font-mono text-slate-800">{created.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">当前状态</dt>
              <dd className="text-slate-800">{created.status}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/reminders/${created.id}`)}>查看任务详情</Button>
            <Button variant="secondary" onClick={() => navigate('/reminders')}>
              返回列表
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCreated(null);
                setValues({
                  codeMode: 'custom',
                  pickupCode: '',
                  cabCode: settings?.defaultCabCode ?? '',
                  durationMin: defaultDuration,
                });
              }}
            >
              再创建一个
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="创建提醒任务"
        description="三个变量决定轮询逻辑：取餐码、柜机 cabCode、监控时长。"
      />

      {failure ? (
        <AlertBanner tone="error" title="创建失败" className="mb-4">
          {failure}
        </AlertBanner>
      ) : null}

      <Card>
        <CardHeader title="任务参数" />
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">取餐码来源</span>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={mode === 'custom'}
                onClick={() => switchMode('custom')}
                className={
                  mode === 'custom'
                    ? 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white'
                    : 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50'
                }
              >
                自定义取餐码
              </button>
              <button
                type="button"
                aria-pressed={mode === 'phone_tail'}
                onClick={() => switchMode('phone_tail')}
                className={
                  mode === 'phone_tail'
                    ? 'rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white'
                    : 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50'
                }
              >
                手机尾号后四位
              </button>
            </div>
          </div>

          <Field
            label={mode === 'phone_tail' ? '手机尾号（4 位数字）' : '取餐码 pickupCode'}
            htmlFor="pickupCode"
            required
            hint={
              mode === 'phone_tail'
                ? settings?.phone
                  ? '已按你绑定的手机号自动填入后四位，可修改；必须正好 4 位数字'
                  : '取餐柜用手机尾号识别时填写，必须正好 4 位数字'
                : '即外卖小票上的取餐码，1..64 个字符'
            }
            error={errors.pickupCode}
          >
            <Input
              id="pickupCode"
              autoComplete="off"
              inputMode={mode === 'phone_tail' ? 'numeric' : 'text'}
              maxLength={mode === 'phone_tail' ? 4 : 64}
              placeholder={mode === 'phone_tail' ? '例如 8000' : '例如 1234'}
              value={values.pickupCode}
              invalid={Boolean(errors.pickupCode)}
              onChange={(event) => {
                const raw = event.target.value;
                const next = mode === 'phone_tail' ? raw.replace(/\D/g, '').slice(0, 4) : raw;
                setValues((prev) => ({ ...prev, pickupCode: next }));
              }}
            />
          </Field>

          <Field
            label="柜机 cabCode"
            htmlFor="cabCode"
            required
            hint={
              settings?.defaultCabCode
                ? '已预填当前柜机编号（来自抓包），换柜机时手动改；1..32 个字符'
                : '取餐柜二维码里的柜机编号，1..32 个字符'
            }
            error={errors.cabCode}
          >
            <Input
              id="cabCode"
              autoComplete="off"
              placeholder="例如 SYA61026AP"
              value={values.cabCode}
              invalid={Boolean(errors.cabCode)}
              onChange={(event) => setValues((prev) => ({ ...prev, cabCode: event.target.value }))}
            />
          </Field>

          <Field
            label="监控时长（分钟）"
            htmlFor="durationMin"
            required
            hint={`默认 ${defaultDuration}，范围 1..${maxDuration}。时长只决定「等多久」；是否误报由基线机制控制——创建后第一次查询只记基线，不会把上一单当成本单。`}
            error={errors.durationMin}
          >
            <Input
              id="durationMin"
              inputMode="numeric"
              placeholder={defaultDuration}
              value={values.durationMin}
              invalid={Boolean(errors.durationMin)}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, durationMin: event.target.value }))
              }
            />
          </Field>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="submit" loading={createReminder.isPending}>
              创建并开始监控
            </Button>
            <Link to="/reminders">
              <Button variant="secondary">取消</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
