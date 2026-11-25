#!/usr/bin/env node
/**
 * FCM 凭据自检工具。
 *
 * 用法：
 *   node scripts/check-fcm-config.mjs <文件路径>
 *
 * 支持两种文件，自动识别：
 *   1. google-services.json（客户端）→ 校验包名，并打印可直接粘贴到
 *      android/local.properties 的四项值（走免插件路径时用）
 *   2. Firebase 服务账号密钥（服务端）→ 校验关键字段，并提示放置路径
 *
 * 只做本地校验，不联网、不上传任何内容。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXPECTED_PACKAGE = 'com.wildcreator.mealreminder';
const EXPECTED_SERVER_PATH = 'deploy/secrets/firebase-service-account.json';

const path = process.argv[2];
if (!path) {
  console.error('用法：node scripts/check-fcm-config.mjs <google-services.json | 服务账号 json>');
  process.exit(2);
}

let raw;
try {
  raw = readFileSync(resolve(path), 'utf8');
} catch (error) {
  console.error(`读不到文件：${error.message}`);
  process.exit(2);
}

let json;
try {
  json = JSON.parse(raw);
} catch (error) {
  console.error(`不是合法 JSON：${error.message}`);
  process.exit(2);
}

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};
const ok = (message) => console.log(`✓ ${message}`);
const warn = (message) => console.warn(`! ${message}`);

// ------------------------------------------------------------ 客户端配置
if (Array.isArray(json.client)) {
  console.log('类型：google-services.json（Android 客户端）');

  const clients = json.client.filter(
    (item) => item?.client_info?.android_client_info?.package_name === EXPECTED_PACKAGE,
  );
  if (clients.length === 0) {
    const found = json.client
      .map((item) => item?.client_info?.android_client_info?.package_name)
      .filter(Boolean);
    fail(
      `包名不匹配：文件里是 [${found.join(', ') || '无'}]，本项目要求 ${EXPECTED_PACKAGE}。\n` +
        '  请回 Firebase 控制台删除该应用后，用正确包名重新添加并下载。',
    );
  }

  const client = clients[0];
  const projectId = json.project_info?.project_id ?? '';
  const projectNumber = json.project_info?.project_number ?? '';
  const appId = client.client_info?.mobilesdk_app_id ?? '';
  const apiKey = client.api_key?.[0]?.current_key ?? '';

  if (!projectId || !projectNumber || !appId || !apiKey) {
    fail('字段不全：project_info.project_id / project_number / mobilesdk_app_id / api_key 必须都存在');
  }
  ok(`包名正确：${EXPECTED_PACKAGE}`);
  ok(`project_id：${projectId}`);
  ok(`project_number：${projectNumber}`);
  ok(`mobilesdk_app_id：${appId}`);
  ok(`api_key：${apiKey.slice(0, 8)}…（已省略）`);

  console.log('\n放置方式（二选一）：');
  console.log('  A. 推荐：把文件放到 android/app/google-services.json，然后重新构建。');
  console.log('     构建脚本检测到该文件会自动启用 google-services 插件，无需手填任何值。');
  console.log('  B. 不用插件：把下面四行写进 android/local.properties，删掉该 json 文件。');
  console.log('');
  console.log(`FCM_PROJECT_ID=${projectId}`);
  console.log(`FCM_APP_ID=${appId}`);
  console.log(`FCM_API_KEY=${apiKey}`);
  console.log(`FCM_SENDER_ID=${projectNumber}`);
  process.exit(0);
}

// ------------------------------------------------------------ 服务端密钥
if (json.type === 'service_account') {
  console.log('类型：Firebase 服务账号密钥（服务端）');

  for (const key of ['project_id', 'client_email', 'private_key']) {
    if (!json[key]) fail(`缺少字段 ${key}`);
  }
  ok(`project_id：${json.project_id}`);
  ok(`client_email：${json.client_email}`);
  ok(`private_key：${String(json.private_key).slice(0, 27)}…（已省略）`);

  if (!String(json.private_key).includes('BEGIN PRIVATE KEY')) {
    fail('private_key 格式异常，应包含 BEGIN PRIVATE KEY');
  }

  console.log('\n放置方式：');
  console.log(`  1. 复制到 ${EXPECTED_SERVER_PATH}（该目录已被 .gitignore 忽略）`);
  console.log('  2. deploy/.env 里设置：');
  console.log('     FIREBASE_SERVICE_ACCOUNT_PATH=/run/secrets/firebase-service-account.json');
  console.log('  3. 重启 server 容器，日志应出现「FCM 已启用：project=...」');
  console.log('\n注意：该文件是最高权限密钥，不要提交到 git，也不要放进 APK。');
  process.exit(0);
}

fail('无法识别的文件：既不是 google-services.json，也不是服务账号密钥');
