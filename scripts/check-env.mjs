#!/usr/bin/env node
/**
 * 部署前预检：检查 deploy/.env 是否可上线。
 *
 * 用法：
 *   node scripts/check-env.mjs                 # 默认检查 deploy/.env
 *   node scripts/check-env.mjs path/to/.env
 *
 * 只做本地静态检查：读文件、看格式、看密钥长度、看占位符是否没换。
 * 不联网、不连数据库、不打印任何密钥内容（只报长度与是否像占位符）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const envPath = resolve(process.argv[2] ?? 'deploy/.env');
if (!existsSync(envPath)) {
  console.error(`找不到 ${envPath}\n先执行：cp deploy/.env.example deploy/.env`);
  process.exit(2);
}

const env = {};
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
}

const problems = [];
const warnings = [];
const passes = [];

const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);
const ok = (msg) => passes.push(msg);

const get = (key) => env[key] ?? '';
const isPlaceholder = (value) =>
  !value ||
  /change-me|your-|placeholder|xxxx|TODO/i.test(value) ||
  /\bexample\.com\b/i.test(value);

/** 取 URL 的 path（不含主机名里的点），用来判断是否误挂了子路径。 */
const urlPath = (value) => {
  try {
    return new URL(value).pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- 基础
const domain = get('DOMAIN');
if (!domain) fail('DOMAIN 未填');
else if (/\bexample\.com\b/i.test(domain)) fail('DOMAIN 还是 example.com 占位符');
else if (domain.startsWith(':')) warn('DOMAIN 是纯端口（仅本机测试可用，公网需真实域名）');
else ok(`DOMAIN=${domain}`);

const ntfyDomain = get('NTFY_DOMAIN');
if (!ntfyDomain) fail('NTFY_DOMAIN 未填（ntfy 必须独立主机名，不能挂子路径）');
else if (!ntfyDomain.startsWith('ntfy.')) {
  warn(`NTFY_DOMAIN=${ntfyDomain} 建议用 ntfy.<主域>，便于证书与 DNS 管理`);
} else ok(`NTFY_DOMAIN=${ntfyDomain}`);

const baseUrl = get('APP_BASE_URL');
if (!baseUrl.startsWith('https://')) fail('APP_BASE_URL 必须是 https:// 开头（邮件链接会指向它）');
else ok(`APP_BASE_URL=${baseUrl}`);

// ---------------------------------------------------------------- 密钥
const jwt = get('JWT_SECRET');
if (jwt.length < 32) fail(`JWT_SECRET 太短（${jwt.length} 字符，至少 32）`);
else if (isPlaceholder(jwt)) fail('JWT_SECRET 还是占位符，用 openssl rand -hex 32 重新生成');
else ok(`JWT_SECRET 长度 ${jwt.length}`);

const encKey = get('MEMBER_TOKEN_ENC_KEY');
if (!encKey) fail('MEMBER_TOKEN_ENC_KEY 未填，用 openssl rand -base64 32 生成');
else {
  let bytes = 0;
  try {
    bytes = Buffer.from(encKey, 'base64').length;
  } catch {
    bytes = 0;
  }
  if (bytes !== 32) fail(`MEMBER_TOKEN_ENC_KEY 解码后应为 32 字节，实际 ${bytes} 字节`);
  else ok('MEMBER_TOKEN_ENC_KEY 32 字节');
}

// ---------------------------------------------------------------- 数据库
const dbPassword = get('POSTGRES_PASSWORD');
if (!dbPassword || dbPassword.length < 8) fail('POSTGRES_PASSWORD 未填或短于 8 位');
else if (isPlaceholder(dbPassword)) fail('POSTGRES_PASSWORD 还是占位符');
else ok('POSTGRES_PASSWORD 已设置');

const dbUrl = get('DATABASE_URL');
if (!dbUrl) fail('DATABASE_URL 未填');
else {
  if (!dbUrl.includes(dbPassword) && dbPassword) {
    fail('DATABASE_URL 里的密码与 POSTGRES_PASSWORD 不一致（容器启动会连不上库）');
  }
  if (!dbUrl.includes('@db:5432/')) {
    warn('DATABASE_URL 主机名建议是 @db:5432/（容器网络内的服务名）');
  }
  if (!problems.some((p) => p.startsWith('DATABASE_URL'))) ok('DATABASE_URL 与密码一致');
}

// ---------------------------------------------------------------- 邮件
const mailDryRun = get('MAIL_DRY_RUN').toLowerCase() === 'true';
if (mailDryRun) {
  warn('MAIL_DRY_RUN=true：不会真发邮件，注册验证链接只写日志（上线前改 false）');
} else {
  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
    if (!get(key)) fail(`${key} 未填（MAIL_DRY_RUN=false 时必须配齐 SMTP）`);
  }
  if (get('SMTP_FROM') && !get('SMTP_FROM').includes('@')) fail('SMTP_FROM 不像邮箱地址');
  if (!problems.some((p) => p.startsWith('SMTP'))) ok('SMTP 配置齐全');
}

// ---------------------------------------------------------------- 阿里云短信
const smsDryRun = get('ALIYUN_DRY_RUN').toLowerCase() === 'true';
if (smsDryRun) {
  warn('ALIYUN_DRY_RUN=true：短信不会真发（上线前改 false）');
} else {
  for (const key of ['ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET', 'ALIYUN_SIGN_NAME']) {
    if (!get(key)) fail(`${key} 未填（ALIYUN_DRY_RUN=false 时必须配齐）`);
  }
  if (!get('ALIYUN_TEMPLATE_ARRIVAL')) fail('ALIYUN_TEMPLATE_ARRIVAL 未填');
  if (!get('ALIYUN_TEMPLATE_VERIFY')) {
    warn('ALIYUN_TEMPLATE_VERIFY 未填：手机号绑定会返回 SMS_TEMPLATE_NOT_CONFIGURED（到柜短信不受影响）');
  } else ok('阿里云短信配置齐全（含验证码模板）');
}

// ---------------------------------------------------------------- ntfy
const ntfyServer = get('NTFY_SERVER_URL');
const ntfyPublic = get('NTFY_PUBLIC_URL');
const ntfyBase = get('NTFY_BASE_URL');
if (!ntfyServer) fail('NTFY_SERVER_URL 未填（服务端 publish 用，建议 http://ntfy:80）');
else if (!ntfyServer.startsWith('http://ntfy:')) {
  warn('NTFY_SERVER_URL 建议用容器内网地址 http://ntfy:80，手机不可达的地址不能填这里');
} else ok('NTFY_SERVER_URL 指向容器内网');

if (!ntfyPublic) fail('NTFY_PUBLIC_URL 未填（App 订阅用，必须是手机可达的 https 地址）');
else if (!ntfyPublic.startsWith('https://')) fail('NTFY_PUBLIC_URL 必须是 https://（App 禁止明文）');
else if (urlPath(ntfyPublic)) fail('NTFY_PUBLIC_URL 不能带子路径：ntfy 不支持子路径部署');
else ok(`NTFY_PUBLIC_URL=${ntfyPublic}`);

if (!ntfyBase) {
  warn('NTFY_BASE_URL 未填，ntfy 生成的链接可能不对（应等于 NTFY_PUBLIC_URL）');
} else if (urlPath(ntfyBase)) {
  fail('NTFY_BASE_URL 不能带子路径（ntfy 会拒绝启动）');
}

// ---------------------------------------------------------------- 取餐柜
if (get('LOCKER_MOCK').toLowerCase() === 'true') {
  warn('LOCKER_MOCK=true：不会查真实取餐柜，只会模拟第 2 次命中（上线前改 false）');
}
if (!get('LOCKER_DEVICE_SN')) warn('LOCKER_DEVICE_SN 未填，默认 2680');

// ---------------------------------------------------------------- FCM（可选）
const fcmPath = get('FIREBASE_SERVICE_ACCOUNT_PATH');
const fcmJson = get('FIREBASE_SERVICE_ACCOUNT_JSON');
if (!fcmPath && !fcmJson) {
  warn('未配置 FCM（可选）：全部设备走 ntfy，短信照发');
} else if (fcmPath) {
  const hostPath = resolve(dirname(envPath), 'secrets/firebase-service-account.json');
  if (!existsSync(hostPath)) {
    fail(`FCM 已设置路径，但主机上 ${hostPath} 不存在（容器内挂载点对应 deploy/secrets/）`);
  } else ok('FCM 服务账号文件存在');
} else ok('FCM 服务账号以 JSON 内联提供');

// ---------------------------------------------------------------- 输出
console.log(`检查文件：${envPath}\n`);
if (passes.length) {
  console.log('通过：');
  for (const line of passes) console.log(`  ✓ ${line}`);
}
if (warnings.length) {
  console.log('\n提醒（不阻断部署）：');
  for (const line of warnings) console.log(`  ! ${line}`);
}
if (problems.length) {
  console.log('\n必须修：');
  for (const line of problems) console.log(`  ✗ ${line}`);
  console.log(`\n结果：${problems.length} 项必须修，${warnings.length} 项提醒`);
  process.exit(1);
}
console.log(`\n结果：可以部署（${warnings.length} 项提醒）`);
