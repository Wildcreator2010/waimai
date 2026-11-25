#!/usr/bin/env node
/**
 * 版本单一来源校验 / 同步。
 *
 *   npm run version           # 校验根目录、server、web、desktop、Android 是否一致
 *   npm run version -- --write  # 以 VERSION 为准写回各端
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const version = readFileSync(resolve(ROOT, 'VERSION'), 'utf8').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`VERSION 不是合法的 x.y.z：${version}`);
  process.exit(1);
}

const results = [];

function syncLock(file, oldVersion) {
  const lockPath = file.replace(/package\.json$/, 'package-lock.json');
  if (!existsSync(resolve(ROOT, lockPath))) return;
  const raw = readFileSync(resolve(ROOT, lockPath), 'utf8');
  const lock = JSON.parse(raw);
  const rootVersions = [lock.version, lock.packages?.['']?.version].filter(Boolean);
  const stale = rootVersions.some((v) => v !== version);
  results.push({ file: lockPath, from: stale ? rootVersions.join('/') : version, changed: stale && write });
  if (stale && write) {
    let replaced = 0;
    const oldLockVersion = lock.version || rootVersions[0] || oldVersion;
    const next = raw.replace(new RegExp(`"version": "${oldLockVersion}"`, 'g'), (match) => {
      if (replaced >= 2) return match;
      replaced += 1;
      return `"version": "${version}"`;
    });
    writeFileSync(resolve(ROOT, lockPath), next, 'utf8');
  }
}

for (const file of ['package.json', 'server/package.json', 'web/package.json', 'desktop/package.json']) {
  const path = resolve(ROOT, file);
  const raw = readFileSync(path, 'utf8');
  const pkg = JSON.parse(raw);
  const previous = pkg.version;
  if (previous !== version) {
    results.push({ file, from: previous, changed: write });
    if (write) {
      pkg.version = version;
      writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    }
  } else {
    results.push({ file, from: version, changed: false });
  }
  if (file !== 'package.json') syncLock(file, previous);
}

const androidPath = resolve(ROOT, 'android/app/build.gradle.kts');
const androidRaw = readFileSync(androidPath, 'utf8');
const androidMatch = androidRaw.match(/versionName\s*=\s*"([^"]*)"/);
if (!androidMatch) {
  console.error('android/app/build.gradle.kts 里找不到 versionName');
  process.exit(1);
}
if (androidMatch[1] !== version) {
  results.push({ file: 'android/app/build.gradle.kts (versionName)', from: androidMatch[1], changed: write });
  if (write) {
    writeFileSync(androidPath, androidRaw.replace(androidMatch[0], `versionName = "${version}"`), 'utf8');
  }
} else {
  results.push({ file: 'android/app/build.gradle.kts (versionName)', from: version, changed: false });
}

const mismatches = results.filter((r) => r.from !== version);
for (const r of results) {
  const mark = r.from === version ? '✓' : write ? '→' : '✗';
  console.log(`  ${mark} ${r.file}${r.from === version ? '' : `：${r.from} → ${version}`}`);
}

if (mismatches.length > 0 && !write) {
  console.error(`\n共 ${mismatches.length} 处与 VERSION=${version} 不一致，执行 npm run version -- --write 修复`);
  process.exit(1);
}
console.log(`\n版本 ${version}${write ? ' 已同步' : ' 一致'}`);
