#!/usr/bin/env node
/**
 * 本机环境自检：工具链、仓库文件、依赖、端口占用、环境文件。
 * 只做检查，不安装、不修改任何东西。
 *
 *   npm run doctor
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];
const passes = [];

const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);
const ok = (msg) => passes.push(msg);

function run(command) {
  return spawnSync(command, { shell: true, encoding: 'utf8', timeout: 8000 });
}

function has(command) {
  const result = run(`${command} --version`);
  return result.status === 0;
}

// ---------------------------------------------------------------- Node / npm
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor >= 20) ok(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node} 过低，需要 >= 20`);

if (has('npm')) ok(`npm ${run('npm --version').stdout.trim()}`);
else fail('找不到 npm');

// ---------------------------------------------------------------- Docker
if (has('docker')) {
  ok(`Docker ${run('docker --version').stdout.trim()}`);
  if (run('docker compose version').status === 0) ok('Docker Compose v2');
  else warn('没有 docker compose v2，本地开发与部署脚本需要它');
  if (run('docker info').status === 0) ok('Docker daemon 可连接');
  else warn('Docker daemon 未运行（开发数据库与镜像构建会失败）');
} else {
  warn('未安装 Docker：仅运行服务端单测 / Web 构建不受影响');
}

// ---------------------------------------------------------------- 可选工具
if (has('openssl')) ok('openssl 可用（部署脚本生成密钥需要）');
else warn('未安装 openssl：deploy/install.sh 无法自动生成密钥，可改用 npm run env:init');

const java = run('java -version 2>&1');
if (java.status === 0) ok(`${(java.stderr || java.stdout).split('\n')[0].trim()}`);
else warn('未安装 Java：Android 构建不可用');

if (has('git')) ok('git 可用');
else warn('未安装 git');

if (existsSync(resolve(ROOT, 'android/gradlew'))) ok('Gradle wrapper 存在');
else warn('缺少 android/gradlew');

// ---------------------------------------------------------------- 仓库文件
for (const file of ['README.md', 'server/package.json', 'web/package.json', 'android/app/build.gradle.kts', 'deploy/docker-compose.yml']) {
  if (existsSync(resolve(ROOT, file))) ok(`存在 ${file}`);
  else fail(`缺少 ${file}`);
}

// ---------------------------------------------------------------- 依赖
for (const [name, dir] of [['server', 'server/node_modules'], ['web', 'web/node_modules'], ['desktop', 'desktop/node_modules']]) {
  if (existsSync(resolve(ROOT, dir))) ok(`${name} 依赖已安装`);
  else warn(`${name} 依赖未安装：cd ${name} && npm install`);
}

// ---------------------------------------------------------------- 环境文件
const serverEnv = resolve(ROOT, 'server/.env');
const deployEnv = resolve(ROOT, 'deploy/.env');
if (existsSync(serverEnv)) ok('server/.env 已存在');
else warn('server/.env 不存在：npm run env:init -- --mode=dev');
if (existsSync(deployEnv)) {
  const text = readFileSync(deployEnv, 'utf8');
  if (/example\.com|change-me/.test(text)) warn('deploy/.env 含占位符，上线前执行 npm run deploy:check');
  else ok('deploy/.env 已配置');
} else {
  warn('deploy/.env 不存在：npm run env:init -- --domain=你的域名');
}

// ---------------------------------------------------------------- 端口
const ports = [
  [5173, 'Web 开发服务器'],
  [8787, '服务端'],
  [5433, '开发数据库'],
];
const portState = await Promise.all(
  ports.map(
    ([port]) =>
      new Promise((resolvePort) => {
        const server = createServer();
        server.once('error', () => resolvePort(false));
        server.once('listening', () => server.close(() => resolvePort(true)));
        server.listen(port, '127.0.0.1');
      }),
  ),
);
ports.forEach(([port, label], index) => {
  if (portState[index]) ok(`端口 ${port} 空闲（${label}）`);
  else warn(`端口 ${port} 已被占用（${label}），启动前确认没有旧进程`);
});

// ---------------------------------------------------------------- 输出
console.log(`工作区：${ROOT}\n`);
if (passes.length) {
  console.log('通过：');
  for (const line of passes) console.log(`  ✓ ${line}`);
}
if (warnings.length) {
  console.log('\n提醒：');
  for (const line of warnings) console.log(`  ! ${line}`);
}
if (failures.length) {
  console.log('\n必须处理：');
  for (const line of failures) console.log(`  ✗ ${line}`);
  console.log(`\n结果：${failures.length} 项必须处理，${warnings.length} 项提醒`);
  process.exit(1);
}
console.log(`\n结果：环境可用（${warnings.length} 项提醒）`);
