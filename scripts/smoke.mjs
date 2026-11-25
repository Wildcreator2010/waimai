#!/usr/bin/env node
/**
 * 部署后冒烟检查：服务端健康检查 + 可选 Web 首页。
 *
 *   npm run smoke
 *   npm run smoke -- --base=https://meal.example.com --web=https://meal.example.com
 */
function parseArgs(argv) {
  const opts = { base: 'http://127.0.0.1:8787', web: '', timeout: 8000 };
  for (const arg of argv) {
    if (arg.startsWith('--base=')) opts.base = arg.slice(7);
    else if (arg.startsWith('--web=')) opts.web = arg.slice(6);
    else if (arg.startsWith('--timeout=')) opts.timeout = Number(arg.slice(10));
    else if (arg === '--help' || arg === '-h') {
      console.log('用法：npm run smoke -- [--base=http://127.0.0.1:8787] [--web=https://域名]');
      process.exit(0);
    } else {
      console.error(`未知参数：${arg}`);
      process.exit(2);
    }
  }
  opts.base = opts.base.replace(/\/+$/, '');
  opts.web = opts.web.replace(/\/+$/, '');
  return opts;
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(check.timeout) });
  return { status: response.status, text: await response.text() };
}

const check = parseArgs(process.argv.slice(2));
let failed = false;

try {
  const { status, text } = await get(`${check.base}/api/health`);
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 120) };
  }
  const ok = status === 200 && payload.status === 'ok' && payload.db === 'ok';
  console.log(`${ok ? '✓' : '✗'} 健康检查 ${check.base}/api/health → HTTP ${status} ${JSON.stringify(payload)}`);
  if (!ok) failed = true;
} catch (error) {
  console.log(`✗ 健康检查 ${check.base}/api/health → ${error.message}`);
  failed = true;
}

if (check.web) {
  try {
    const { status, text } = await get(check.web);
    const ok = status === 200 && /id="root"/.test(text);
    console.log(`${ok ? '✓' : '✗'} Web 首页 ${check.web} → HTTP ${status}${ok ? '' : '（未找到 #root）'}`);
    if (!ok) failed = true;
  } catch (error) {
    console.log(`✗ Web 首页 ${check.web} → ${error.message}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
