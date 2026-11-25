// 表单校验（zod）。字段名与 docs/api.md 的请求体完全一致。
//
// 数字字段在表单里是字符串，用 intInRange 统一做「必填 + 整数 + 范围」校验，
// 校验通过后 transform 成 number，提交时直接可用。

import { z } from 'zod';

/** 密码规则：至少 8 位且同时含字母与数字（docs/api.md §2） */
export const PASSWORD_HINT = '至少 8 位，需同时包含字母和数字';

const password = z
  .string()
  .min(8, '密码至少 8 位')
  .regex(/[A-Za-z]/, '密码需包含字母')
  .regex(/\d/, '密码需包含数字');

const email = z.string().trim().min(1, '请填写邮箱').email('邮箱格式不正确');

/** 11 位大陆手机号或 E.164（docs/api.md §3） */
const phone = z
  .string()
  .trim()
  .min(1, '请填写手机号')
  .refine((v) => /^1[3-9]\d{9}$/.test(v) || /^\+[1-9]\d{6,14}$/.test(v), '手机号格式不正确');

const intInRange = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `请填写${label}`)
    .refine((v) => /^\d+$/.test(v), `${label}必须是整数`)
    .transform((v) => Number(v))
    .refine((v) => v >= min && v <= max, `${label}需在 ${min}..${max} 之间`);

/** 把 ZodError 摊平成「字段 → 第一条错误」 */
export function zodErrors(error: z.ZodError): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat)) {
    if (messages && messages.length > 0) out[key] = messages[0];
  }
  return out;
}

// ---------------------------------------------------------------- 引导 / 认证

export const setupSchema = z.object({
  setupCode: z.string().trim().min(1, '请填写一次性引导码'),
  email,
  password,
  displayName: z.string().trim().max(64, '昵称不超过 64 字').optional(),
});
export type SetupInput = z.input<typeof setupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, '请填写密码'),
});
export type LoginInput = z.input<typeof loginSchema>;

export const registerSchema = z
  .object({
    email,
    password,
    confirmPassword: z.string().min(1, '请再次输入密码'),
    inviteCode: z.string().trim().min(1, '请填写邀请码'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  });
export type RegisterInput = z.input<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: password,
    confirmPassword: z.string().min(1, '请再次输入密码'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

// ---------------------------------------------------------------- 提醒任务

export const reminderCreateSchema = z
  .object({
    codeMode: z.enum(['custom', 'phone_tail']).optional(),
    pickupCode: z.string().trim().min(1, '请填写取餐码').max(64, '取餐码不超过 64 个字符'),
    cabCode: z.string().trim().min(1, '请填写柜机 cabCode').max(32, 'cabCode 不超过 32 个字符'),
    durationMin: intInRange(1, 720, '监控时长'),
  })
  .superRefine((value, ctx) => {
    if (value.codeMode === 'phone_tail' && !/^\d{4}$/.test(value.pickupCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pickupCode'],
        message: '手机尾号必须是 4 位数字',
      });
    }
  });
export type ReminderCreateInput = z.input<typeof reminderCreateSchema>;

// ---------------------------------------------------------------- 通知设置

export const phoneRequestSchema = z.object({ phone });
export type PhoneRequestInput = z.input<typeof phoneRequestSchema>;

export const phoneVerifySchema = z.object({
  phone,
  code: z
    .string()
    .trim()
    .min(1, '请填写验证码')
    .refine((v) => /^\d{6}$/.test(v), '验证码为 6 位数字'),
});
export type PhoneVerifyInput = z.input<typeof phoneVerifySchema>;

// ---------------------------------------------------------------- 管理端

export const adminUserCreateSchema = z.object({
  email,
  password,
  role: z.enum(['USER', 'ADMIN']),
  displayName: z.string().trim().max(64, '昵称不超过 64 字').optional(),
});
export type AdminUserCreateInput = z.input<typeof adminUserCreateSchema>;

export const inviteCreateSchema = z.object({
  email,
  expiresInDays: intInRange(1, 365, '有效期'),
  note: z.string().trim().max(200, '备注不超过 200 字').optional(),
});
export type InviteCreateInput = z.input<typeof inviteCreateSchema>;

export const memberTokenSchema = z.object({
  token: z
    .string()
    .min(8, 'MemberToken 至少 8 个字符')
    .refine((v) => !/\s/.test(v), 'MemberToken 不能包含空白字符'),
});
export type MemberTokenInput = z.input<typeof memberTokenSchema>;

export const adminSettingsSchema = z.object({
  pollIntervalSec: intInRange(10, 86400, '轮询间隔'),
  defaultDurationMin: intInRange(1, 720, '默认时长'),
  maxDurationMin: intInRange(1, 720, '最大时长'),
  maxActiveRemindersPerUser: intInRange(1, 100, '单用户任务上限'),
  lockerDeviceSn: z.string().trim().min(1, '请填写设备 SN').max(64, '设备 SN 不超过 64 字'),
  defaultLockerCabCode: z
    .string()
    .trim()
    .min(1, '请填写默认柜机编号')
    .max(32, '柜机编号不超过 32 字'),
  lockerApiBase: z.string().trim().min(1, '请填写取餐柜接口地址').url('需是合法 URL'),
  ntfyServerUrl: z.string().trim().min(1, '请填写 ntfy 服务地址').url('需是合法 URL'),
  registrationOpen: z.boolean(),
  showNotifyDetailsDefault: z.boolean(),
});
export type AdminSettingsInput = z.input<typeof adminSettingsSchema>;
