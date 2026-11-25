# Firebase / FCM 接入指引

> 目标：拿到两个文件，让「有 GMS 的手机」收到原生推送。
> 没有这两个文件也能跑：服务端会记一条 `FCM 未启用`，所有设备自动走 ntfy。但既然你要求接 FCM，按下面做完即可。

预计耗时：10–15 分钟。全部免费（Spark 计划足够，FCM 不限量）。

---

## 速览：本项目要做的 6 步

你需要拿到**两个文件**：

| 文件 | 放哪 | 作用 |
|---|---|---|
| `google-services.json` | `android/app/`（本机构建时） | 客户端凭据；构建脚本检测到后自动启用插件 |
| 服务账号私钥 `*.json` | 服务器 `/opt/meal-reminder/secrets/firebase-service-account.json` | 服务端投递凭据 |

1. Firebase 建项目 → 添加 Android 应用（包名 `com.wildcreator.mealreminder`）→ 下载 `google-services.json`
2. 项目设置 → 服务账号 → 生成新的私钥 → 下载第二个 json
3. 本机校验两个文件：`node scripts/check-fcm-config.mjs <文件路径>`
4. **客户端**：把 `google-services.json` 放进 `android/app/` → `./gradlew assembleDebug` → 装上新的 APK
5. **服务端**：把私钥传到服务器 secrets 目录，`.env` 加一行，重启容器（**不需要重建镜像**）：
   ```bash
   scp firebase-service-account.json deployer@127.0.0.1:/opt/meal-reminder/secrets/
   bash /opt/meal-reminder/set-env.sh FIREBASE_SERVICE_ACCOUNT_PATH=/run/secrets/firebase-service-account.json
   cd /opt/meal-reminder && sudo docker compose up -d --force-recreate server
   ```
6. **验证三处**：
   - 服务端日志出现 `[FCM] FCM 已启用：project=...`
   - App 设置页显示推送方式为 FCM（服务端 `Device` 表 `pushMode=FCM`）
   - 管理员调 `POST /api/admin/notifications/test`，手机收到系统通知

> 不做这些也能用：全部设备走 ntfy，服务端只记一条 `FCM 未配置`，不报错。

---

## 步骤 1：创建 Firebase 项目

1. 打开 <https://console.firebase.google.com/>，用 Google 账号登录。
2. 「添加项目」→ 项目名称填 `meal-reminder`（名字随便，只影响控制台显示）→ 关闭 Google Analytics（本项目不需要）→ 创建。

## 步骤 2：添加 Android 应用

1. 项目首页点 Android 图标「添加应用」。
2. **Android 软件包名称必须精确填**：`com.wildcreator.mealreminder`
   > 包名一旦与 App 的 `applicationId` 不一致，FCM 注册会静默失败。
3. 应用别名填 `取餐提醒`；SHA-1 可留空（不用 Google 登录）。
4. 点「注册应用」→ 下载 `google-services.json`。

### 客户端两条接入路径（按顺序自动选择）

**路径 A（推荐）：把文件放进工程，零手填**

```bash
# 1. 校验文件（包名、字段是否齐全），并打印可选的四项值
node scripts/check-fcm-config.mjs ~/Downloads/google-services.json

# 2. 放进 app 目录
cp ~/Downloads/google-services.json android/app/google-services.json

# 3. 重新构建 —— 构建脚本检测到文件后会自动启用 google-services 插件
cd android && ./gradlew assembleDebug
```

构建日志会打印 `FCM: 检测到 app/google-services.json，已启用 google-services 插件`，
并出现 `processDebugGoogleServices` 任务。插件生成的 `google_app_id` 等资源让 Firebase 自动初始化。

**路径 B（不用插件）：写进 `local.properties`**

```properties
# android/local.properties（该文件不入库）
FCM_PROJECT_ID=meal-reminder
FCM_APP_ID=1:123456789012:android:abcdef123456
FCM_API_KEY=AIzaSy...
FCM_SENDER_ID=123456789012
```

四项值都能从 `google-services.json` 里取（`project_info.project_id`、`client[0].client_info.mobilesdk_app_id`、
`client[0].api_key[0].current_key`、`project_info.project_number`），`check-fcm-config.mjs` 会直接打印。

**两条路径都缺失时**：客户端视为「FCM 未配置」，自动走 ntfy，构建与运行都不报错。
`google-services.json` 已被 `.gitignore` 忽略，不会进仓库。

## 步骤 3：生成服务端凭据（Service Account）

1. Firebase 控制台 → 左上齿轮「项目设置」→「服务账号」标签页。
2. 点「生成新的私钥」→ 确认 → 浏览器下载一个 `*.json`（形如 `meal-reminder-firebase-adminsdk-xxxxx-xxxxxxxxxx.json`）。
3. **这个文件是最高权限密钥，绝不能进 git、绝不能进 APK。**
4. 先校验：

   ```bash
   node scripts/check-fcm-config.mjs ~/Downloads/meal-reminder-firebase-adminsdk-*.json
   ```

   会打印 `project_id` 与 `client_email`，并确认 `private_key` 存在。

5. 放到服务器：`deploy/secrets/firebase-service-account.json`
6. 在 `deploy/.env` 里填：
   ```ini
   FIREBASE_SERVICE_ACCOUNT_PATH=/run/secrets/firebase-service-account.json
   # 或者直接内联（不推荐，容易泄露到进程列表）：
   # FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   ```
7. `deploy/docker-compose.yml` 已把 `./secrets` 只读挂载到 `/run/secrets`。

## 步骤 4：确认 Cloud Messaging 已启用

Firebase 控制台 → 左侧「Cloud Messaging」→ 能看到「Firebase Cloud Messaging API (V1)」即已启用（新项目默认启用）。若显示需要启用，点一下「启用」。

## 步骤 5：把 `google-services.json` 的关键字段核对一遍

打开文件，确认：

```json
{
  "project_info": { "project_id": "meal-reminder", "project_number": "123456789012" },
  "client": [
    { "client_info": { "mobilesdk_app_id": "1:123456789012:android:abcdef",
                       "android_client_info": { "package_name": "com.wildcreator.mealreminder" } } }
  ]
}
```

- `package_name` 必须是 `com.wildcreator.mealreminder`
- `project_id` 要和服务端 service account 文件里的 `project_id` 一致

## 步骤 6：验证

1. 服务端启动日志出现：`FCM enabled: project=meal-reminder`（而不是 `FCM disabled`）。
2. App 登录后，`POST /api/me/devices` 的 `pushMode` 为 `FCM`。
3. 管理台 → 告警页 → 「发送测试推送」按钮（实现阶段提供），手机应收到通知。

---

## 常见坑

| 现象 | 原因 | 处理 |
|---|---|---|
| App 里 `pushMode` 一直是 `NTFY` | 设备没有 GMS（国产 ROM 常见）或 `google-services.json` 包名不符 | 前者正常，走 ntfy；后者改正包名重新下载 |
| 服务端日志 `FCM disabled` | `FIREBASE_SERVICE_ACCOUNT_PATH` 路径错或文件不可读 | 检查挂载与权限（容器内 `ls /run/secrets`） |
| 构建日志 `FCM: 未找到 app/google-services.json` | 文件没放对位置 | 必须放在 `android/app/google-services.json`，不是 `android/google-services.json` |
| App 里 `pushMode` 一直是 `NTFY` 且日志说「Firebase 未配置」 | 两条路径都没生效 | 检查 `android/app/` 是否有文件，或 `local.properties` 四项是否齐全 |
| 发送返回 `UNREGISTERED` | 设备 token 失效（卸载重装/清数据） | 服务端会自动删除该 token，属正常 |
| 发送返回 `SENDER_ID_MISMATCH` | 客户端与服务端不是同一个 Firebase 项目 | 核对 `project_id` 是否一致 |
| 国内网络下偶发超时 | FCM 依赖 Google 服务与网络 | 属预期，ntfy 通道兜底；不要指望 FCM 在国内 100% 可达 |

---

## 没有凭据时会发生什么（重要）

- 服务端：启动时检测到未配置 → 记 INFO 日志，跳过 FCM provider，**不崩溃**。
- 客户端：Firebase 初始化失败 → 自动 `pushMode=NTFY`，走 ntfy 主动连接。
- 短信：不受影响，照常发送。
- 结论：**没有 FCM 凭据，产品依然可用**，只是失去「系统级推送」这一层。
