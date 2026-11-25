# 取餐提醒（Meal Reminder）

外卖入柜后，自动通过 **FCM / ntfy / 浏览器 Web Push / 阿里云短信** 四条通道提醒你去取餐，
并在任务详情页提供**一键开箱**。

- 服务端：NestJS 10 + TypeScript + Prisma 6 + PostgreSQL 16
- Web：React 18 + Vite 5 + TypeScript + Fluent UI v9 + Tailwind（用户端 + 管理端）
- Android：Kotlin 2.0 + Jetpack Compose（minSdk 24）
- 电脑版：Electron 复用 Web 站点（托盘常驻、系统通知）
- 部署：Docker Compose（Caddy 自动 HTTPS，或复用已有 nginx/宝塔），ntfy 使用独立子域

> 本仓库自带可复刻的部署套件：`npm run env:init` 生成密钥与配置，`deploy/install.sh` 一键安装，
> 支持 Caddy 全自动 HTTPS 与「已有 nginx/宝塔」两种拓扑。见 [docs/self-hosting.md](docs/self-hosting.md)。

## 功能

**用户侧**
- 邮箱注册（邀请码一码一邮箱）、邮箱验证、找回密码
- 建任务：自定义取餐码 / 手机尾号后四位（自动校验）、柜机 cabCode、监控时长
- 状态机：`PENDING → BASELINE（首次只记指纹）→ WAITING → ARRIVED / TIMEOUT / STOPPED`
- 命中后多渠道通知；任务详情含事件流、立即查询、停止、**一键开箱**（限 3 次、间隔 10 秒、入柜后 24 小时内有效）
- 通知设置：内容开关、短信开关、ntfy 开关与 topic 重置、设备管理
- 手机号绑定/解绑、修改密码、注销账号、用户协议

**管理侧**
- 概览（30 秒自动刷新）、用户管理（停用/删除/改角色/ROOT 转让）、邀请码
- MemberToken（AES-256-GCM 加密入库、掩码展示、有效性测试）
- 系统设置（含 FCM 状态卡片）、告警（确认 + 发送测试推送）
- 审计日志、短信流水，均支持 **CSV 导出**（带筛选、Excel 兼容 BOM）

**安全**
- 密码 PBKDF2-HMAC-SHA512（210000 次迭代 + 16B 盐），不存明文
- JWT access 15 分钟 + 可撤销 refresh 30 天（库内只存 SHA-256，轮换使用）
- `sessionVersion` 使旧 access 令牌立即失效
- 人机验证覆盖：注册 / 重发验证邮件 / 找回密码 / 发送短信验证码（内置算术题，可切 Cloudflare Turnstile）
- 三级角色：ROOT（唯一、可转让）、ADMIN、USER；管理员看不到他人任务

## 文档

| 文件 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 架构、状态机、通知分发、安全、部署 |
| [docs/api.md](docs/api.md) | 全部 REST 接口契约 |
| [docs/decisions.md](docs/decisions.md) | 决策记录（含单/多实例权衡） |
| [docs/self-hosting.md](docs/self-hosting.md) | 从零复刻：密钥、两种拓扑、三端指向 |
| [docs/operations.md](docs/operations.md) | 备份、恢复、升级、回滚、密钥轮换、排障 |
| [docs/desktop.md](docs/desktop.md) | 桌面端配置、打包与安全模型 |
| [docs/firebase-setup.md](docs/firebase-setup.md) | 10 分钟拿到 FCM 凭据 |
| [docs/aliyun-sms-setup.md](docs/aliyun-sms-setup.md) | 短信配置 |
| [docs/acceptance.md](docs/acceptance.md) | 验收步骤 |
| [server/prisma/schema.prisma](server/prisma/schema.prisma) | 数据模型（唯一事实来源） |

## 现状

| 模块 | 状态 | 验证方式 |
|---|---|---|
| 服务端 | 完成 | `npm run build` 通过；**54 单测**、**31 e2e** 全绿（真实 Postgres + 迁移 + mock 取餐柜） |
| Web | 完成 | `tsc` 零错误；线上已部署并逐页验证 |
| Android | 完成 | `assembleDebug` 通过，产出 `app-debug.apk`；未在真机长期运行 |
| 电脑版（Electron） | 已实现 | 代码在 `desktop/`，本轮未重新验证 |
| 部署 | 完成 | 线上 healthy，每日备份 cron，证书自动续期 |

### 线上已实测通过的链路

引导码创建 ROOT → 邀请码 → 注册（人机验证 + 协议）→ 邮箱验证（真实 SMTP 送达）
→ 登录 → JWT refresh 轮换 → 建任务 → 首次基线 → 命中入柜
→ ntfy 推送（WebSocket 收到）→ 短信实发（阿里云 bizId 已核对）
→ MemberToken 加密入库/掩码/审计 → 角色越权拦截 → 停用账号令牌立即失效。

真实取餐柜接口已验证：`openMark` 返回 `locker_id`，`takeCode` 对不存在取餐码返回「未找到」，
即「尚未入柜」的正常态。

## 快速开始（零外部凭据）

```bash
npm run env:init -- --mode=dev     # 生成 server/.env（含随机密钥）
npm --prefix server install
npm --prefix web install
npm run dev                        # 起 Postgres(5433) + 迁移 + server + web
```

打开 http://localhost:5173。开发模式默认 `LOCKER_MOCK=true`（第 2 次查询模拟入柜）、
`MAIL_DRY_RUN=true`（验证链接打到日志）、`ALIYUN_DRY_RUN=true`（短信只记日志），整条链路可零凭据跑通。

等价的手动方式：

```bash
docker compose -f deploy/docker-compose.dev.yml up -d   # Postgres :5433
cd server && cp .env.example .env && npx prisma migrate deploy && npm run start:dev
cd ../web && npm run dev                                 # http://localhost:5173
```

## 统一命令

在仓库根目录执行（Windows / macOS / Linux 通用）：

| 命令 | 作用 |
|---|---|
| `npm run doctor` | 检查 Node、Docker、依赖、端口、环境文件 |
| `npm run config` | 交互式修改 `deploy/.env`（密钥掩码、逐项编辑、校验、重建） |
| `npm run env:init -- --domain=...` | 生成 `deploy/.env`；`--mode=dev` 生成 `server/.env` |
| `npm run dev` | 开发数据库 + 迁移 + 服务端 + Web |
| `npm run build` | 构建 server 与 web |
| `npm test` / `npm run test:e2e` | 服务端单测 / e2e（需开发数据库） |
| `npm run android:debug` | Android debug APK |
| `npm run image` | 离线构建服务端镜像并导出 `server-image.tar`（Windows 需 Git Bash/WSL） |
| `npm run release` | 构建并生成单文件发布包 `release/meal-reminder-<版本>.tar.gz` |
| `npm run redeploy` | 配好 `DEPLOY_HOST` 后一键上传并远程升级；未配置则只打包 |
| `npm run deploy:render` | 按 `.env` 渲染 nginx 配置 |
| `npm run deploy:check` | 部署前静态自检 |
| `npm run smoke -- --base=https://域名` | 部署后健康检查 / 首页冒烟 |
| `npm run version` | 校验各端版本与 `VERSION` 一致 |

## 一键部署 / 再部署

```bash
npm run doctor
npm run env:init -- --domain=meal.example.com
npm run config                    # 菜单式改配置（可选）
npm run deploy:check
sudo bash deploy/install.sh
```

改完代码后：

```bash
npm run redeploy                  # 构建 + 打包 + 上传 + 远程升级（需 DEPLOY_HOST）
npm run redeploy -- --git         # 服务器有源码时：git pull + upgrade
npm run release                   # 只生成单文件发布包
```

- 80/443 空闲 → 自动走 Caddy；已被占用 → 走已有 nginx/宝塔
- 升级、回滚、备份、恢复：`deploy/upgrade.sh`、`deploy/backup.sh`、`deploy/restore.sh`
- 完整步骤见 [docs/self-hosting.md](docs/self-hosting.md)，日常运维见 [docs/operations.md](docs/operations.md)

## 换成你自己的服务器（开源部署）

三个客户端都**不写死**域名，别人可以指向自己的部署：

**Android**（运行时可改，无需重新编译）
- 登录页底部「服务器：…（点击修改）」或设置页「服务器地址」
- 输入 `https://你的域名` → 点「保存并测试」→ 先请求 `/api/health` 探活，通了才保存
- 保存后本地会话自动清空，用该服务器的账号重新登录
- 实现：`ServerConfig`（SharedPreferences）+ `BaseUrlInterceptor`（请求时改写 scheme/host/port）
- 编译期默认值仍可指定：`android/local.properties` 里 `API_BASE_URL=https://你的域名/`

**Web**
- 同源部署（nginx 反代 `/api`）时无需配置，默认 `VITE_API_BASE=/api`
- 前后端不同源时：构建前设 `VITE_API_BASE=https://你的域名/api`

**电脑版（Electron）**
- 环境变量 `MEAL_APP_URL=https://你的域名`，或首次运行在设置窗口里填

**服务端**
- 域名只出现在 `deploy/` 下的 nginx 配置与部署脚本里，替换成你的域名即可
- `.env` 里要改的是 `APP_BASE_URL`（用于邮件里的链接）与 `NTFY_PUBLIC_URL`

## 构建与部署（重要：构建机网络受限）

本机 Docker 容器**无法访问外网**（DNS 正常但 TCP 被拦），因此镜像构建时不能在容器里 `npm ci`。
依赖与 Prisma 引擎全部在宿主机准备，镜像只做拷贝：

```bash
npm run image                    # 等价于下面三步 + docker save
# 或手动：
bash scripts/prepare-image.sh    # 编译 dist + 装生产依赖 + 生成 Prisma 客户端(含 linux-musl 引擎)
docker build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine \
  -t meal-reminder-server:prod server
docker save meal-reminder-server:prod -o server-image.tar   # 传到服务器后 docker load
```

构建机可以联网时，用多阶段 Dockerfile 更简单：

```bash
docker build -f server/Dockerfile.online -t meal-reminder-server:prod server
# 或在 deploy/.env 里设置 SERVER_DOCKERFILE=Dockerfile.online
```

服务器侧：部署目录下放 `deploy/`，容器只监听 `127.0.0.1:8787`（external 拓扑），
由本机 nginx 反代；`server` 启动时自动执行 `prisma migrate deploy`。

**新增环境变量后必须同步 compose**：compose 使用显式 `environment:` 列表，
不读取 `.env` 全文。可选变量务必带默认值（`${VAR:-default}`），空串会导致启动校验失败。

## 环境变量（关键项）

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `JWT_SECRET` / `MEMBER_TOKEN_ENC_KEY` | 令牌签名 / 凭证加密（base64 32 字节） |
| `LOCKER_MOCK` | `true` 用模拟取餐柜；线上为 `false`（真实查询） |
| `SMTP_*` / `MAIL_DRY_RUN` | 邮箱验证与告警邮件 |
| `ALIYUN_*` / `ALIYUN_DRY_RUN` | 短信 |
| `NTFY_SERVER_URL` / `NTFY_PUBLIC_URL` | 服务端发布地址 / 客户端连接地址（两者不同） |
| `WEBPUSH_PUBLIC_KEY` / `WEBPUSH_PRIVATE_KEY` / `WEBPUSH_SUBJECT` | 浏览器推送（VAPID，自签名即可） |
| `CAPTCHA_PROVIDER` | `builtin`（默认）/ `turnstile` / `off` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | 切 Turnstile 时需要 |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | FCM 服务账号路径；为空则全部设备走 ntfy |

生成 VAPID 密钥：`npx web-push generate-vapid-keys`

## Android 编译

```bash
npm run android:debug           # 根目录，Windows / macOS / Linux 通用
# 或
cd android
# local.properties 里写 sdk.dir=<你的 Android SDK 路径>
./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
# 产物：app/build/outputs/apk/debug/app-debug.apk
```

本机用 JDK 21 + Gradle 8.9 + Android SDK 35 编译通过。
FCM 可选，`google-services.json` 放进 `android/app/` 即自动启用插件；不填则走 ntfy。

## 运维

- **备份**：`sudo bash deploy/backup.sh`（cron 每日 04:00，默认保留 7 天，带 gzip 与 SQL 完整性校验）
  ```bash
  # 恢复
  sudo bash deploy/restore.sh deploy/backups/meal-YYYYMMDD-HHMMSS.sql.gz
  ```
- **升级**：`sudo bash deploy/upgrade.sh`（先备份、保留上一版镜像、健康检查）
- **短信队列**：落库（`SmsJob`），重启不丢；卡在 `SENDING` 的任务重启后标 `FAILED` 且不重发（防重复扣费）
- **数据保留**：任务与事件 30 天、短信流水与审计 90 天，自动清理

## 已知限制

- 浏览器 Web Push 经浏览器厂商推送服务转发（Chrome 走 Google），**国内网络下可能不可达**；短信是国内最可靠通道
- 同一柜机 + 同一取餐码连续两单，指纹相同，第二次不会提醒
- 阿里云单号码短信 20 条/天（服务商硬限制）
- FCM 需自备 Firebase 项目与凭据

## 版本与 CI

- 版本号唯一来源：根目录 `VERSION`；`npm run version` 校验，`npm run version -- --write` 同步各端
- 变更记录：[CHANGELOG.md](CHANGELOG.md)
- CI：`.github/workflows/ci.yml`（版本一致性、服务端单测与构建、Web 构建、Android debug、服务端镜像）

## 许可

私有项目，未授权不得分发。
