#!/usr/bin/env node
/**
 * 一键打包 / 再部署。
 *
 *   npm run release                 # 只生成 release/meal-reminder-<版本>.tar.gz
 *   npm run redeploy                # 配了 DEPLOY_HOST 就上传并远程升级；否则只打包
 *   npm run redeploy -- --local     # 在服务器本机执行 deploy/upgrade.sh
 *   npm run redeploy -- --git       # 远程 git pull + upgrade（适合 caddy 拓扑）
 *
 * 常用参数：
 *   --bundle-only   只打包，不上传
 *   --skip-build    复用已有 web/dist 与 server-image.tar
 *   --no-backup     跳过升级前备份（传给 upgrade.sh）
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opts = {
  bundleOnly: argv.includes('--bundle-only'),
  skipBuild: argv.includes('--skip-build'),
  noBackup: argv.includes('--no-backup'),
  local: argv.includes('--local'),
  git: argv.includes('--git'),
};

function log(message) {
  console.log(`[redeploy] ${message}`);
}

function die(message) {
  console.error(`[redeploy] 错误：${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function readEnv(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function findBash() {
  const candidates =
    process.platform === 'win32'
      ? ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe', 'bash']
      : ['bash'];
  for (const candidate of candidates) {
    if (spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0) return candidate;
  }
  return null;
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const envPath = resolve(ROOT, 'deploy/.env');
const env = readEnv(envPath);
if (!existsSync(envPath) && !opts.bundleOnly) {
  die('缺少 deploy/.env。先执行 npm run env:init -- --domain=你的域名，或从服务器下载现有配置');
}
const version = readFileSync(resolve(ROOT, 'VERSION'), 'utf8').trim();
const topology = env.DEPLOY_TOPOLOGY || 'caddy';
const host = env.DEPLOY_HOST || '';
const user = env.DEPLOY_USER || 'root';
const port = env.DEPLOY_PORT || '22';
const remotePath = env.DEPLOY_PATH || '/opt/meal-reminder';
const sshKey = env.DEPLOY_SSH_KEY || '';
const bundleName = `meal-reminder-${version}.tar.gz`;
const bundlePath = resolve(ROOT, 'release', bundleName);
const stagingPath = resolve(ROOT, '.release', `meal-reminder-${version}`);

if (opts.local && opts.git) die('--local 与 --git 只能选一个');
if (opts.git && !host) die('--git 需要先在 deploy/.env 里配置 DEPLOY_HOST');
if (topology === 'caddy' && !opts.bundleOnly && host && !opts.git) {
  die('caddy 拓扑的镜像上传模式不会更新 web 容器；请用 npm run redeploy -- --git，或在服务器执行 git pull && bash deploy/upgrade.sh');
}

const sshBase = [];
if (sshKey) sshBase.push('-i', sshKey, '-o', 'IdentitiesOnly=yes');
sshBase.push('-p', port, '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new');

// ------------------------------------------------------------------ 本地升级
if (opts.local) {
  const bash = findBash() || die('未找到 bash，无法在 Windows 上执行 --local');
  const args = ['deploy/upgrade.sh'];
  if (opts.noBackup) args.push('--no-backup');
  run(bash, args);
  log('本地升级完成');
  process.exit(0);
}

// ------------------------------------------------------------------ git 模式
if (opts.git) {
  if (topology !== 'caddy') {
    log(`当前拓扑是 ${topology}，git 模式仍可用；如果服务器没有源码，请改用默认的镜像上传模式`);
  }
  const upgrade = ['bash', 'deploy/upgrade.sh'];
  if (opts.noBackup) upgrade.push('--no-backup');
  const remote = `set -e; cd ${shQuote(remotePath)}; git pull; ${upgrade.join(' ')}`;
  run('ssh', [...sshBase, `${user}@${host}`, remote]);
  log('远程 git 升级完成');
  process.exit(0);
}

// ------------------------------------------------------------------ 构建
if (!opts.skipBuild) {
  log(`构建 Web（版本 ${version}）`);
  run('npm', ['--prefix', 'web', 'run', 'build'], { shell: process.platform === 'win32' });
  log('构建服务端镜像');
  run(process.execPath, ['scripts/build-image.mjs']);
} else {
  log('跳过构建，复用已有产物（--skip-build）');
}

for (const required of ['web/dist/index.html', 'server-image.tar']) {
  if (!existsSync(resolve(ROOT, required))) die(`缺少 ${required}，去掉 --skip-build 或先构建`);
}

// ------------------------------------------------------------------ 打包
log('生成发布包');
rmSync(stagingPath, { recursive: true, force: true });
mkdirSync(join(stagingPath, 'deploy'), { recursive: true });
mkdirSync(join(stagingPath, 'scripts'), { recursive: true });
mkdirSync(join(stagingPath, 'web'), { recursive: true });

const deployFiles = [
  'install.sh',
  'upgrade.sh',
  'backup.sh',
  'backup-db.sh',
  'restore.sh',
  'config.sh',
  '_common.sh',
  '.env.example',
  'docker-compose.yml',
  'docker-compose.server.yml',
  'docker-compose.dev.yml',
  'Caddyfile',
  'README.md',
];
for (const file of deployFiles) {
  const source = resolve(ROOT, 'deploy', file);
  if (existsSync(source)) cpSync(source, join(stagingPath, 'deploy', file));
}
mkdirSync(join(stagingPath, 'deploy/nginx'), { recursive: true });
for (const file of ['app.conf.tpl', 'ntfy.conf.tpl']) {
  cpSync(resolve(ROOT, 'deploy/nginx', file), join(stagingPath, 'deploy/nginx', file));
}
cpSync(resolve(ROOT, 'web/dist'), join(stagingPath, 'web/dist'), { recursive: true });
cpSync(resolve(ROOT, 'server-image.tar'), join(stagingPath, 'server-image.tar'));
cpSync(resolve(ROOT, 'VERSION'), join(stagingPath, 'VERSION'));
cpSync(resolve(ROOT, 'scripts/check-env.mjs'), join(stagingPath, 'scripts/check-env.mjs'));

mkdirSync(resolve(ROOT, 'release'), { recursive: true });
const tarCheck = spawnSync('tar', ['--version'], { stdio: 'ignore' });
if (tarCheck.status !== 0) die('未找到 tar 命令，无法打包');
run('tar', ['-czf', bundlePath, '-C', stagingPath, '.']);
const size = (statSync(bundlePath).size / 1024 / 1024).toFixed(1);
log(`发布包：release/${bundleName}（${size} MB）`);

if (opts.bundleOnly || !host) {
  console.log(`
下一步（两种方式任选）：

1) 手动上传：
   scp ${bundlePath} ${user}@你的服务器:/tmp/${bundleName}
   ssh ${user}@你的服务器
   cd ${remotePath}
   tar xzf /tmp/${bundleName}
   bash deploy/upgrade.sh --image-tar=../server-image.tar

2) 自动上传（推荐）：
   在 deploy/.env 里配置 DEPLOY_HOST / DEPLOY_USER / DEPLOY_SSH_KEY / DEPLOY_PATH
   然后执行：npm run redeploy
`);
  process.exit(0);
}

// ------------------------------------------------------------------ 上传并远程升级
const remoteBundle = `/tmp/${bundleName}`;
log(`上传到 ${user}@${host}:${remoteBundle}`);
const scpArgs = [];
if (sshKey) scpArgs.push('-i', sshKey, '-o', 'IdentitiesOnly=yes');
scpArgs.push('-P', port, '-o', 'StrictHostKeyChecking=accept-new', bundlePath, `${user}@${host}:${remoteBundle}`);
run('scp', scpArgs);

const upgrade = ['bash', 'deploy/upgrade.sh', `--image-tar=${shQuote(`${remotePath}/server-image.tar`)}`];
if (opts.noBackup) upgrade.push('--no-backup');
const remote = [
  'set -e',
  `mkdir -p ${shQuote(remotePath)}`,
  `cd ${shQuote(remotePath)}`,
  `tar xzf ${shQuote(remoteBundle)}`,
  upgrade.join(' '),
].join('; ');

log('远程升级');
run('ssh', [...sshBase, `${user}@${host}`, remote]);

const domain = env.DOMAIN || '你的域名';
log(`完成：https://${domain}`);
