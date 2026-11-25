#!/usr/bin/env node
/**
 * Android 构建入口（Windows / macOS / Linux 通用）。
 *
 *   npm run android:debug
 *   node scripts/android.mjs assembleRelease
 */
import { chmodSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = resolve(ROOT, 'android');
const task = process.argv[2] || 'assembleDebug';
const wrapper = resolve(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

if (!existsSync(wrapper)) {
  console.error('找不到 Gradle wrapper：android/gradlew');
  process.exit(1);
}
if (process.platform !== 'win32') {
  try {
    chmodSync(wrapper, 0o755);
  } catch {
    /* 忽略：权限已正确或文件系统不支持 */
  }
}
if (!existsSync(resolve(androidDir, 'local.properties'))) {
  console.warn('[android] 没有 local.properties：SDK 路径与 API_BASE_URL 将使用默认值');
  console.warn('[android] 可参考 android/local.properties.example');
}

const result = spawnSync(wrapper, [task], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status === 0) {
  const apk = resolve(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
  if (existsSync(apk)) console.log(`\n产物：${apk}`);
}
process.exit(result.status ?? 1);
