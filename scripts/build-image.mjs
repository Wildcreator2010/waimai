#!/usr/bin/env node
/**
 * 构建服务端生产镜像（离线流程）：
 *   1. bash scripts/prepare-image.sh（编译 dist、生产依赖、Prisma linux-musl 引擎）
 *   2. docker build
 *   3. 可选 docker save 成 tar，便于上传到服务器
 *
 *   npm run image
 *   npm run image -- --no-prepare --no-save
 *   npm run image -- --dockerfile=Dockerfile.online
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dockerfileArg = args.find((a) => a.startsWith('--dockerfile='));
const dockerfile = dockerfileArg ? dockerfileArg.slice(13) : process.env.SERVER_DOCKERFILE || 'Dockerfile';
const offline = dockerfile === 'Dockerfile';
const prepare = offline && !args.includes('--no-prepare');
const save = !args.includes('--no-save');
const outputArg = args.find((a) => a.startsWith('--output='));
const output = resolve(ROOT, outputArg ? outputArg.slice(9) : 'server-image.tar');
const version = readFileSync(resolve(ROOT, 'VERSION'), 'utf8').trim();
const image = process.env.SERVER_IMAGE || `meal-reminder-server:${version}`;
const nodeImage = process.env.NODE_IMAGE || 'node:22-alpine';

function run(command, runArgs, options = {}) {
  console.log(`\n$ ${command} ${runArgs.join(' ')}`);
  const result = spawnSync(command, runArgs, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
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

if (prepare) {
  const bash = findBash();
  if (!bash) {
    console.error('未找到 bash，无法执行 scripts/prepare-image.sh。');
    console.error('请安装 Git Bash/WSL，或在已准备好的构建机上使用 --no-prepare。');
    process.exit(1);
  }
  run(bash, ['scripts/prepare-image.sh']);
} else if (offline) {
  console.log('跳过 prepare-image.sh（--no-prepare）');
  for (const path of ['server/dist', 'server/.image-deps/node_modules', 'server/.prisma-generated/client']) {
    if (!existsSync(resolve(ROOT, path))) {
      console.error(`缺少 ${path}，不能跳过准备步骤`);
      process.exit(1);
    }
  }
} else {
  console.log(`使用 ${dockerfile} 多阶段构建，跳过离线准备`);
}

run('docker', [
  'build',
  '--build-arg',
  `NODE_IMAGE=${nodeImage}`,
  '-f',
  `server/${dockerfile}`,
  '-t',
  image,
  'server',
]);

if (image !== 'meal-reminder-server:prod') {
  run('docker', ['tag', image, 'meal-reminder-server:prod']);
}

if (save) {
  run('docker', ['save', '-o', output, image, 'meal-reminder-server:prod']);
  const size = (statSync(output).size / 1024 / 1024).toFixed(1);
  console.log(`\n镜像归档：${output}（${size} MB）`);
  console.log('上传到服务器后执行：');
  console.log('  docker load -i server-image.tar');
  console.log('  bash deploy/install.sh   # 或 bash deploy/upgrade.sh');
}

console.log(`\n镜像：${image}（同时标记为 meal-reminder-server:prod）`);
