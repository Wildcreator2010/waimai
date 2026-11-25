#!/usr/bin/env node
/**
 * 一条命令启动本地开发环境：
 *   1. 确保 server/.env 存在（缺失时按开发模式生成）
 *   2. 启动 deploy/docker-compose.dev.yml 的 Postgres（5433）
 *   3. 执行 prisma migrate deploy
 *   4. 并行启动 NestJS（8787）与 Vite（5173）
 *
 *   npm run dev
 *   npm run dev -- --no-db
 */
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noDb = process.argv.includes('--no-db');
const children = [];

function log(message) {
  console.log(`[dev] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function compose(args) {
  if (spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0) {
    return ['docker', ['compose', ...args]];
  }
  return ['docker-compose', args];
}

async function waitForDb() {
  for (let i = 0; i < 40; i += 1) {
    const result = spawnSync(
      'docker',
      ['exec', 'meal-reminder-dev-db', 'pg_isready', '-U', 'meal', '-d', 'meal_test'],
      { stdio: 'ignore' },
    );
    if (result.status === 0) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('开发数据库 40 秒内未就绪，执行 docker logs meal-reminder-dev-db 查看原因');
}

function prefix(name, stream) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) console.log(`[${name}] ${line}`);
  });
}

function start(name, command, args) {
  const child = spawn(command, args, { cwd: ROOT, env: process.env, shell: process.platform === 'win32' });
  prefix(name, child.stdout);
  prefix(name, child.stderr);
  child.on('exit', (code) => {
    if (code && code !== 0) log(`${name} 退出，代码 ${code}`);
    shutdown();
  });
  children.push(child);
  return child;
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (!existsSync(resolve(ROOT, 'server/.env'))) {
  log('未找到 server/.env，按开发模式生成');
  run('node', ['scripts/gen-env.mjs', '--mode=dev']);
}

for (const [name, dir] of [['server', 'server/node_modules'], ['web', 'web/node_modules']]) {
  if (!existsSync(resolve(ROOT, dir))) {
    console.error(`[dev] ${name} 依赖未安装：cd ${name} && npm install`);
    process.exit(1);
  }
}

if (!noDb) {
  log('启动开发数据库（Postgres 16，端口 5433）');
  const [cmd, args] = compose(['-f', 'deploy/docker-compose.dev.yml', 'up', '-d']);
  run(cmd, args);
  await waitForDb();
  log('数据库已就绪，执行迁移');
  run('npm', ['--prefix', 'server', 'run', 'prisma:deploy']);
} else {
  log('跳过数据库启动与迁移（--no-db）');
}

log('启动服务端 http://127.0.0.1:8787 与 Web http://localhost:5173');
start('server', 'npm', ['--prefix', 'server', 'run', 'start:dev']);
start('web', 'npm', ['--prefix', 'web', 'run', 'dev']);
