#!/usr/bin/env node
/**
 * 跨平台入口：调用 deploy/config.sh。
 *
 *   npm run config
 *   npm run config -- --show
 *   npm run config -- --set SMTP_HOST=smtp.example.com MAIL_DRY_RUN=false
 *
 * Windows 下会自动寻找 Git Bash；Linux/macOS 直接使用 bash。
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(ROOT, 'deploy/config.sh');

if (!existsSync(script)) {
  console.error(`找不到 ${script}`);
  process.exit(1);
}

const candidates =
  process.platform === 'win32'
    ? ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe', 'bash']
    : ['bash'];

let bash = null;
for (const candidate of candidates) {
  const check = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
  if (check.status === 0) {
    bash = candidate;
    break;
  }
}

if (!bash) {
  console.error('未找到 bash。Windows 请安装 Git for Windows，或直接在服务器上运行 bash deploy/config.sh。');
  process.exit(1);
}

const result = spawnSync(bash, [script, ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
