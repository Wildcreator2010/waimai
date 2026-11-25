#!/usr/bin/env node
/**
 * 生成环境文件（不会覆盖已有文件，除非显式 --force）。
 *
 * 用法：
 *   npm run env:init -- --domain=meal.example.com
 *   npm run env:init -- --mode=dev
 *   npm run env:init -- --domain=meal.example.com --topology=external --force
 *
 * 只使用 Node 内置模块；生成后可用 `npm run deploy:check` 校验。
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `生成环境文件（默认不覆盖已有文件）

用法：
  npm run env:init -- --domain=meal.example.com
  npm run env:init -- --mode=dev
  npm run env:init -- --domain=meal.example.com --topology=external --force

参数：
  --mode=dev|prod          dev 生成 server/.env，prod 生成 deploy/.env（默认 prod）
  --domain=NAME            主域名（prod 必填）
  --ntfy-domain=NAME       ntfy 子域，默认 ntfy.<主域>
  --topology=caddy|external  记录部署拓扑，默认 caddy
  --out=PATH               自定义输出路径
  --force                  覆盖已有文件
  --non-interactive        不询问，缺少必填项直接失败`;


function parseArgs(argv) {
  const opts = {
    mode: 'prod',
    out: '',
    domain: '',
    ntfyDomain: '',
    topology: 'caddy',
    force: false,
    nonInteractive: false,
  };
  for (const arg of argv) {
    if (arg === '--force') opts.force = true;
    else if (arg === '--non-interactive' || arg === '-y') opts.nonInteractive = true;
    else if (arg.startsWith('--mode=')) opts.mode = arg.slice(7);
    else if (arg.startsWith('--out=')) opts.out = arg.slice(6);
    else if (arg.startsWith('--domain=')) opts.domain = arg.slice(9);
    else if (arg.startsWith('--ntfy-domain=')) opts.ntfyDomain = arg.slice(14);
    else if (arg.startsWith('--topology=')) opts.topology = arg.slice(11);
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      console.error(`未知参数：${arg}`);
      process.exit(2);
    }
  }
  if (!['dev', 'prod'].includes(opts.mode)) {
    console.error('--mode 只能是 dev 或 prod');
    process.exit(2);
  }
  if (!['caddy', 'external'].includes(opts.topology)) {
    console.error('--topology 只能是 caddy 或 external');
    process.exit(2);
  }
  return opts;
}

/** 只替换已有 KEY 行或追加，保留模板里的注释与顺序。 */
function setEnv(text, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(text)) return text.replace(pattern, () => `${key}=${value}`);
  const base = text.endsWith('\n') ? text : `${text}\n`;
  return `${base}${key}=${value}\n`;
}

function readEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function vapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-65);
  const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  if (pub[0] !== 0x04) throw new Error('VAPID 公钥格式异常');
  return { publicKey: pub.toString('base64url'), privateKey: priv.toString('base64url') };
}

function randomPassword() {
  return randomBytes(24).toString('base64url');
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const isDev = opts.mode === 'dev';
  const templatePath = resolve(ROOT, isDev ? 'server/.env.example' : 'deploy/.env.example');
  const outPath = resolve(ROOT, opts.out || (isDev ? 'server/.env' : 'deploy/.env'));

  if (!existsSync(templatePath)) {
    console.error(`找不到模板：${templatePath}`);
    process.exit(1);
  }
  if (existsSync(outPath) && !opts.force) {
    console.log(`已存在 ${outPath}，未覆盖（需要重建请加 --force）`);
    return;
  }

  let domain = opts.domain;
  if (!isDev && !domain) {
    if (process.stdin.isTTY && !opts.nonInteractive) {
      domain = await ask('主域名（例如 meal.example.com）：');
    }
    if (!domain) {
      console.error('缺少 --domain。示例：npm run env:init -- --domain=meal.example.com');
      process.exit(2);
    }
  }
  const ntfyDomain = opts.ntfyDomain || (domain ? `ntfy.${domain}` : '');

  let text = readFileSync(templatePath, 'utf8');
  const existing = readEnv(text);
  const jwt = randomBytes(32).toString('hex');
  const encKey = randomBytes(32).toString('base64');
  const dbPassword = randomPassword();
  const vapid = vapidKeys();

  if (isDev) {
    text = setEnv(text, 'NODE_ENV', 'development');
    text = setEnv(text, 'DATABASE_URL', 'postgresql://meal:meal@127.0.0.1:5433/meal_test');
    text = setEnv(text, 'APP_BASE_URL', 'http://localhost:5173');
    text = setEnv(text, 'JWT_SECRET', jwt);
    text = setEnv(text, 'MEMBER_TOKEN_ENC_KEY', encKey);
    text = setEnv(text, 'MAIL_DRY_RUN', 'true');
    text = setEnv(text, 'ALIYUN_DRY_RUN', 'true');
    text = setEnv(text, 'LOCKER_MOCK', 'true');
    text = setEnv(text, 'NTFY_SERVER_URL', 'http://127.0.0.1:8080');
    text = setEnv(text, 'NTFY_PUBLIC_URL', 'http://127.0.0.1:8080');
    text = setEnv(text, 'WEBPUSH_PUBLIC_KEY', vapid.publicKey);
    text = setEnv(text, 'WEBPUSH_PRIVATE_KEY', vapid.privateKey);
    text = setEnv(text, 'WEBPUSH_SUBJECT', 'mailto:admin@localhost');
  } else {
    text = setEnv(text, 'DOMAIN', domain);
    text = setEnv(text, 'NTFY_DOMAIN', ntfyDomain);
    text = setEnv(text, 'APP_BASE_URL', `https://${domain}`);
    text = setEnv(text, 'NTFY_PUBLIC_URL', `https://${ntfyDomain}`);
    text = setEnv(text, 'NTFY_BASE_URL', `https://${ntfyDomain}`);
    text = setEnv(text, 'NTFY_SERVER_URL', 'http://ntfy:80');
    text = setEnv(text, 'POSTGRES_PASSWORD', dbPassword);
    text = setEnv(text, 'DATABASE_URL', `postgresql://meal:${dbPassword}@db:5432/meal`);
    text = setEnv(text, 'JWT_SECRET', jwt);
    text = setEnv(text, 'MEMBER_TOKEN_ENC_KEY', encKey);
    text = setEnv(text, 'WEBPUSH_PUBLIC_KEY', vapid.publicKey);
    text = setEnv(text, 'WEBPUSH_PRIVATE_KEY', vapid.privateKey);
    text = setEnv(text, 'WEBPUSH_SUBJECT', `mailto:admin@${domain}`);
    text = setEnv(text, 'DEPLOY_TOPOLOGY', opts.topology);
    text = setEnv(text, 'STATIC_ROOT', `/var/www/${domain}/dist`);
    text = setEnv(text, 'CERT_DIR', `/etc/letsencrypt/live`);
    if (!existing.NGINX_CONF_DIR) text = setEnv(text, 'NGINX_CONF_DIR', '/etc/nginx/conf.d');
  }

  // 首次安装保持安全模式：没填凭据就不真发邮件/短信，取餐柜用 mock。
  if (!isDev) {
    text = setEnv(text, 'MAIL_DRY_RUN', existing.SMTP_USER ? 'false' : 'true');
    text = setEnv(text, 'ALIYUN_DRY_RUN', existing.ALIYUN_ACCESS_KEY_ID ? 'false' : 'true');
    text = setEnv(text, 'LOCKER_MOCK', 'true');
    text = setEnv(text, 'BOOTSTRAP_SETUP_CODE', '');
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text, 'utf8');

  console.log(`已生成 ${outPath}`);
  console.log(`  JWT_SECRET              ${jwt.length} 字符`);
  console.log(`  MEMBER_TOKEN_ENC_KEY    ${Buffer.from(encKey, 'base64').length} 字节`);
  console.log(`  POSTGRES_PASSWORD       ${dbPassword.length} 字符`);
  console.log(`  VAPID 公钥/私钥         已生成`);
  if (!isDev) {
    console.log(`  拓扑                    ${opts.topology}`);
    console.log('\n下一步：');
    console.log('  1. 按需填写 SMTP / 阿里云短信 / FCM 配置');
    console.log('  2. npm run deploy:check');
    console.log('  3. bash deploy/install.sh');
    console.log('\n首次安装为安全模式：MAIL_DRY_RUN / ALIYUN_DRY_RUN 为 true，LOCKER_MOCK 为 true。');
    console.log('验证码会打印在服务端日志里，绑定真实通道后记得改成 false。');
  } else {
    console.log('\n下一步：npm run dev（会自动启动开发数据库并跑迁移）');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
