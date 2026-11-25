#!/usr/bin/env node
/**
 * 按 deploy/.env 渲染 nginx 配置模板（适用于「已有 nginx / 宝塔」拓扑）。
 *
 *   npm run deploy:render
 *   npm run deploy:render -- --env deploy/.env --out deploy/nginx/generated
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = {
    env: 'deploy/.env',
    out: 'deploy/nginx/generated',
    staticRoot: '',
    ntfyStaticRoot: '',
    certDir: '',
    apiPort: '',
    ntfyPort: '',
  };
  const keys = {
    '--env': 'env',
    '--out': 'out',
    '--static-root': 'staticRoot',
    '--ntfy-static-root': 'ntfyStaticRoot',
    '--cert-dir': 'certDir',
    '--api-port': 'apiPort',
    '--ntfy-port': 'ntfyPort',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [flag, inline] = arg.split(/=(.*)/s);
    if (keys[flag]) {
      const value = inline !== undefined ? inline : argv[++i];
      if (value === undefined) {
        console.error(`${flag} 缺少值`);
        process.exit(2);
      }
      opts[keys[flag]] = value;
    } else if (arg === '--help' || arg === '-h') {
      console.log('用法：npm run deploy:render -- [--env=deploy/.env] [--out=deploy/nginx/generated]');
      process.exit(0);
    } else {
      console.error(`未知参数：${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

function readEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function render(template, vars) {
  let text = template;
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  const leftover = text.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`模板仍有未替换变量：${[...new Set(leftover)].join(', ')}`);
  return text;
}

const opts = parseArgs(process.argv.slice(2));
const envPath = resolve(ROOT, opts.env);
if (!existsSync(envPath)) {
  console.error(`找不到 ${envPath}，先执行 npm run env:init`);
  process.exit(1);
}

const env = readEnv(envPath);
const domain = env.DOMAIN || '';
const ntfyDomain = env.NTFY_DOMAIN || '';
const isExample = (value) => /^(.*\.)?example\.com$/i.test(value);
if (!domain || isExample(domain)) {
  console.error('deploy/.env 里的 DOMAIN 未填写或仍是 example.com');
  process.exit(1);
}
if (!ntfyDomain || isExample(ntfyDomain)) {
  console.error('deploy/.env 里的 NTFY_DOMAIN 未填写或仍是 example.com');
  process.exit(1);
}

const staticRoot = opts.staticRoot || env.STATIC_ROOT || `/var/www/${domain}/dist`;
const ntfyStaticRoot = opts.ntfyStaticRoot || env.NTFY_STATIC_ROOT || `/var/www/${ntfyDomain}`;
const certDir = opts.certDir || env.CERT_DIR || '/etc/letsencrypt/live';
const apiPort = opts.apiPort || env.API_PORT || '8787';
const ntfyPort = opts.ntfyPort || env.NTFY_PORT || '8081';
const confDir = env.NGINX_CONF_DIR || '/etc/nginx/conf.d';

const vars = {
  DOMAIN: domain,
  NTFY_DOMAIN: ntfyDomain,
  STATIC_ROOT: staticRoot,
  NTFY_STATIC_ROOT: ntfyStaticRoot,
  CERT_DIR: certDir,
  API_PORT: apiPort,
  NTFY_PORT: ntfyPort,
};
const templateDir = resolve(ROOT, 'deploy/nginx');
const outDir = resolve(ROOT, opts.out);
mkdirSync(outDir, { recursive: true });

const files = [
  ['app.conf.tpl', `${domain}.conf`],
  ['ntfy.conf.tpl', `${ntfyDomain}.conf`],
];
for (const [tpl, name] of files) {
  const source = readFileSync(resolve(templateDir, tpl), 'utf8');
  const target = resolve(outDir, name);
  writeFileSync(target, render(source, vars), 'utf8');
  console.log(`已生成 ${relative(ROOT, target)}`);
}

console.log(`
下一步（把生成的两个文件放进 nginx 的 vhost 目录）：
  sudo cp ${relative(ROOT, resolve(outDir, `${domain}.conf`))} ${confDir}/
  sudo cp ${relative(ROOT, resolve(outDir, `${ntfyDomain}.conf`))} ${confDir}/
  sudo nginx -t && sudo nginx -s reload

静态文件目录：${staticRoot}
证书目录：    ${certDir}
后端端口：    ${apiPort}，ntfy 端口：${ntfyPort}
`);
