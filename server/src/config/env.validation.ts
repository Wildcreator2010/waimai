import { z } from 'zod';

/**
 * 环境变量校验。启动即失败，避免「跑起来才发现缺配置」。
 * 所有密钥只从这里进内存，绝不写日志。
 */
const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().int().min(min).max(max));

const optional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === '' ? '' : v));

/** 展示名称：空串按未设置处理，避免 compose 传空变量时清空品牌名。 */
const name = (def: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? def : v.trim()));

/** 带默认值的枚举：空字符串按未设置处理（compose 传空串是常见情况）。 */
const enumWithDefault = <T extends [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess(
    (value) => (value === '' || value === undefined || value === null ? fallback : value),
    z.enum(values),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** 产品名：用于邮件标题、告警与前端标题，可替换成自己的品牌 */
  APP_NAME: name('取餐提醒'),
  PORT: int(8787, 1, 65535),
  APP_BASE_URL: z.string().default('http://127.0.0.1:5173'),
  TZ: z.string().default('Asia/Shanghai'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL 必填'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少 32 字符'),
  JWT_ACCESS_TTL_SECONDS: int(900, 60, 86400),
  REFRESH_TTL_DAYS: int(30, 1, 365),
  EMAIL_TOKEN_TTL_MINUTES: int(60, 5, 1440),
  RESET_TOKEN_TTL_MINUTES: int(60, 5, 1440),

  MEMBER_TOKEN_ENC_KEY: z
    .string()
    .min(44, 'MEMBER_TOKEN_ENC_KEY 必须是 32 字节的 base64（44 字符）'),

  LOCKER_API_BASE: z.string().default('https://csmini.guangeiot.com'),
  LOCKER_OPENMARK_PATH: z.string().default('/wechat/locker/openMark'),
  LOCKER_TAKE_PATH: z.string().default('/wechat/locker/takeCode'),
  LOCKER_OPENBOX_PATH: z.string().default('/wechat/locker/takeOpen'),
  LOCKER_TIMEOUT_MS: int(10000, 1000, 60000),
  LOCKER_DEVICE_SN: z.string().default('2680'),
  /** 演示模式：不调真实接口，第 MOCK_ARRIVAL_AFTER 次查询起模拟入柜 */
  LOCKER_MOCK: bool(false),
  MOCK_ARRIVAL_AFTER: int(2, 1, 100),

  SMTP_HOST: optional,
  SMTP_PORT: int(465, 1, 65535),
  SMTP_SECURE: bool(true),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  /** 留空时由 MailService 用 APP_NAME 生成「品牌名 <no-reply@example.com>」 */
  SMTP_FROM: optional,
  MAIL_DRY_RUN: bool(true),

  FIREBASE_SERVICE_ACCOUNT_PATH: optional,
  FIREBASE_SERVICE_ACCOUNT_JSON: optional,

  NTFY_SERVER_URL: z.string().default('http://127.0.0.1:8080'),
  /** App 要连的公网 ntfy 地址（如 https://ntfy.example.com）；留空则回落到 SystemSetting */
  NTFY_PUBLIC_URL: optional,
  NTFY_BASE_URL: optional,
  NTFY_ACCESS_TOKEN: optional,

  ALIYUN_ACCESS_KEY_ID: optional,
  ALIYUN_ACCESS_KEY_SECRET: optional,
  ALIYUN_REGION: z.string().default('cn-hangzhou'),
  ALIYUN_SIGN_NAME: optional,
  ALIYUN_TEMPLATE_ARRIVAL: z.string().default('SMS_XXXXXXXX'),
  ALIYUN_TEMPLATE_VERIFY: optional,
  ALIYUN_DRY_RUN: bool(true),

  BOOTSTRAP_SETUP_CODE: optional,

  /** 人机验证：builtin（内置算术题，默认）/ turnstile（Cloudflare）/ off（仅调试） */
  CAPTCHA_PROVIDER: enumWithDefault(['builtin', 'turnstile', 'off'], 'builtin'),
  TURNSTILE_SECRET: optional,
  TURNSTILE_SITE_KEY: optional,

  /** 浏览器 Web Push（VAPID）。留空则跳过浏览器推送 */
  WEBPUSH_PUBLIC_KEY: optional,
  WEBPUSH_PRIVATE_KEY: optional,
  WEBPUSH_SUBJECT: z.string().default('mailto:admin@example.com'),

  /** 数据保留：提醒与事件、短信与审计（docs/decisions.md D-12） */
  RETENTION_REMINDER_DAYS: int(30, 1, 3650),
  RETENTION_AUDIT_DAYS: int(90, 1, 3650),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // 只打印字段名与原因，绝不打印值
    throw new Error(`环境变量校验失败：\n${lines.join('\n')}`);
  }
  return parsed.data;
}
