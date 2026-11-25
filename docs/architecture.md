# 架构设计 · 取餐提醒

> 状态：待你确认（骨架阶段）。确认后按 `docs/decisions.md` 的顺序实现。

## 1. 产品目标

用户在自己外卖即将入柜时创建一个「取餐提醒」任务，服务端按固定间隔调用取餐柜接口，检测到自己的取餐码出现入柜记录后，**同时**通过三条通道提醒：FCM（有 GMS 的设备）、ntfy（无 GMS 的设备）、阿里云短信（已绑定手机号则必发）。

### 1.1 从旧版继承的只有一件事

**取餐柜状态查询 API**（`app/query.py` 逆向结果）：

```
POST https://csmini.guangeiot.com/wechat/locker/openMark
  Header: MemberToken: <凭证>
  Body:   {"cabCode": "SYA61026AP"}
  → 200 {code:200, data:{locker_id: ...}}

POST https://csmini.guangeiot.com/wechat/locker/takeCode
  Header: MemberToken: <凭证>
  Body:   {"locker_id": "...", "code": "<取餐码>"}
  → code 200/302 + data[] 非空，含 box_sn → 已入柜，box_sn 即柜号
  → code 400 + "未找到取件码为..."        → 尚未入柜（正常轮询态）
  → code 401                               → MemberToken 失效
```

其余（登录、注册、账号、通知、调度、前端）全部重写。

### 1.2 明确不继承

- Python 标准库 Web 服务、cookie session、PBKDF2 旧实现
- `.env` 里明文存 MemberToken
- PushPlus / ServerChan / Bark / 企业微信 / 微信公众号通道
- 旧版页面与 mock 适配器

## 2. 总体架构

```
┌──────────────────────┐        ┌───────────────────────────┐
│ Android (Kotlin)     │        │ React Web 管理台           │
│ Compose · minSdk 24  │        │ Vite + TS + Tailwind      │
│ FCM / ntfy 主动订阅   │        │ 用户端 + 管理端            │
└─────────┬────────────┘        └─────────────┬─────────────┘
          │ HTTPS REST + WS                  │ HTTPS REST
          └───────────────┬──────────────────┘
                          ▼
        ┌────────────────────────────────────────────┐
        │ NestJS + TypeScript（单实例，Docker）        │
        │  auth · users · invites · reminders         │
        │  scheduler（进程内轮询）                     │
        │  locker（openMark/takeCode 客户端）          │
        │  notifications（FCM / ntfy / Aliyun SMS）   │
        │  mail（SMTP）· audit · alerts               │
        └───┬──────────┬──────────┬─────────┬────────┘
            │          │          │         │
      ┌─────▼───┐ ┌────▼────┐ ┌───▼────┐ ┌──▼──────────┐
      │Postgres │ │ ntfy    │ │ FCM    │ │ 阿里云短信    │
      │         │ │(自建/公共)│ │(可选)  │ │ Dysmsapi    │
      └─────────┘ └─────────┘ └────────┘ └─────────────┘
                          │
                 ┌────────▼─────────┐
                 │ 取餐柜开放接口     │
                 │ csmini.guangeiot │
                 └──────────────────┘
```

单实例部署（一个 VPS + Docker Compose + Caddy 自动 HTTPS）。理由与多实例对比见 `decisions.md` D-11。

## 3. 目录结构

```
waimai/
├─ docs/                     设计与接入文档
├─ server/                   NestJS 服务端
│  ├─ prisma/schema.prisma   数据模型（唯一事实来源）
│  ├─ src/
│  │  ├─ main.ts
│  │  ├─ app.module.ts
│  │  ├─ config/             环境变量校验（zod）
│  │  ├─ common/             guards · decorators · filters · crypto · pagination
│  │  ├─ auth/               注册/登录/刷新/验证邮箱/找回密码/JWT 策略
│  │  ├─ users/              账号 CRUD、角色、手机号绑定
│  │  ├─ invites/            一码一邮箱邀请码
│  │  ├─ reminders/          任务 CRUD、立即查询、停止
│  │  ├─ scheduler/          轮询引擎（含单实例锁）
│  │  ├─ locker/             openMark/takeCode 客户端 + MemberToken 服务
│  │  ├─ notifications/      dispatcher + fcm / ntfy / sms 三个 provider
│  │  ├─ mail/               SMTP 发信 + 模板
│  │  ├─ audit/              审计日志 + 管理员告警
│  │  └─ health/
│  ├─ test/                  e2e（supertest + 测试库）
│  └─ Dockerfile
├─ web/                      React 管理台 + 用户端
├─ android/                  Compose 客户端
├─ deploy/                   docker-compose.yml · Caddyfile · .env.example
└─ README.md
```

## 4. 领域模型

完整字段见 `server/prisma/schema.prisma`。核心实体与关系：

| 实体 | 作用 | 关键约束 |
|---|---|---|
| `User` | 账号 | email 唯一；ROOT 唯一；phone 唯一 |
| `RefreshSession` | 可撤销刷新令牌 | 只存 SHA-256；每次刷新轮换 |
| `VerificationToken` | 邮箱验证/重置密码 | 一次性、限时、只存哈希 |
| `Invite` | 邀请码 | 一码一邮箱、限时、限用一次 |
| `Device` | 推送设备 | FCM token 唯一；pushMode 决定通道 |
| `Reminder` | 提醒任务 | 三变量 pickupCode/cabCode/durationMin |
| `ReminderEvent` | 任务事件流 | 基线/命中/超时/失败/通知结果 |
| `LockerCredential` | MemberToken | 单行、AES-256-GCM 加密、掩码展示 |
| `SystemSetting` | 运行参数 | 轮询间隔、任务上限、设备 SN、ntfy 地址 |
| `SmsLog` | 短信流水 | 日配额统计依据 |
| `AuditLog` | 审计 | 谁在何时改了什么 |
| `AdminAlert` | 管理员告警 | 邮件给 ROOT + 站内给全部管理员 |

### 4.1 「三个变量」的两套概念（按你的选择分别建模）

**A. 任务三变量**（决定轮询逻辑，存 `Reminder`）

| 变量 | 字段 | 说明 |
|---|---|---|
| 取餐码 | `pickupCode` | 用户自定义任意字符串，即 `takeCode` 的 `code` |
| 柜机 cabCode | `cabCode` | 二维码里的柜机编号，即 `openMark` 的 `cabCode` |
| 监控时长 | `durationMin` | 默认 60，上限 720，超时置 `TIMEOUT` |

**B. 短信模板三变量**（决定短信内容，`SMS_XXXXXXXX`）

| 模板占位符 | 取值来源 |
|---|---|
| `${cabCode}` | `Reminder.cabCode` |
| `${SN}` | `SystemSetting.lockerDeviceSn`（全局设备号，管理台可改，默认 2680） |
| `${box_sn}` | 接口返回的柜号 `Reminder.cabinet` |

## 5. 认证与会话

### 5.1 注册（邀请码 + 邮箱验证）

```
管理员生成邀请码（绑定目标邮箱，默认 7 天有效）
        │
用户 POST /auth/register {email, password, inviteCode}
        │ 校验：邀请码存在、未使用、未过期、email 完全匹配
        │ 校验：密码强度、邮箱未被注册
        ▼
创建 User(status=PENDING_VERIFICATION) → 消耗邀请码 → 发验证邮件
        │
用户点邮件链接 → POST /auth/verify-email {token}
        ▼
status=ACTIVE，可登录
```

未验证账号登录返回 `403 EMAIL_NOT_VERIFIED`，可重发验证邮件（限频 60s/次、5 次/天）。

### 5.2 密码

- 算法：**PBKDF2-HMAC-SHA512**，随机 16 字节盐，默认 210000 次迭代。
- 存储：`passwordHash`（hex）+ `passwordSalt`（hex）+ `passwordIterations`。
- 校验：`timingSafeEqual`，防时序侧信道。
- 改密/重置后：撤销该用户全部 refresh session，并要求重新登录。
- 任何日志、审计、错误响应中都不出现密码或其哈希。

> 这是「SHA512 入库、绝不明文」的安全实现；裸 SHA-512 会被彩虹表秒破，见 `decisions.md` D-03。

### 5.3 JWT

| 令牌 | 形式 | 有效期 | 撤销 |
|---|---|---|---|
| access | JWT HS256，`sub`/`role`/`ver`/`jti` | 15 分钟 | 短命，不单独撤销 |
| refresh | 随机 32 字节，仅存 SHA-256 | 30 天，轮换 | `RefreshSession.revokedAt` |

- access 由 `Authorization: Bearer` 携带，不落 cookie（App 与 Web 共用一套）。
- Web 端 refresh token 存 httpOnly + Secure + SameSite=Lax cookie，避免 XSS 窃取；App 端存 EncryptedSharedPreferences。
- `User.passwordChangedAt`（由 `ver` 派生）使旧 access 在改密后自然失效；`status=DISABLED` 时 guard 每次查库拒绝。
- 登录失败节流：同邮箱 5 次/10 分钟，同 IP 20 次/10 分钟，超限 429。

### 5.4 角色与权限矩阵

| 能力 | ROOT | ADMIN | USER |
|---|:--:|:--:|:--:|
| 创建/停用/删除普通用户 | ✓ | ✓ | ✗ |
| 生成邀请码 | ✓ | ✓ | ✗ |
| 把 USER 提升为 ADMIN | ✓ | ✗ | ✗ |
| 降级/停用其他 ADMIN | ✓ | ✗ | ✗ |
| 操作 ROOT（删除/降级） | ✗（仅转让） | ✗ | ✗ |
| 查看他人提醒任务 | ✗ | ✗ | — |
| 查看/修改 MemberToken | ✓ | ✓ | ✗ |
| 系统设置、审计、短信流水、告警 | ✓ | ✓ | ✗ |
| 自己的任务与通知设置 | ✓ | ✓ | ✓ |
| 手机号绑定、ntfy topic 重置 | ✓ | ✓ | ✓ |

ROOT 唯一、不可删除、不可降级，**可转让**：转让时原 ROOT 降为 ADMIN，目标账号升为 ROOT，写审计并撤销双方全部会话。

> 注：第三轮你曾选「管理员可管用户和任务」，第六轮又选「管理员看不到他人任务」。本方案按**后者**执行：ADMIN 管账号，不看他人的取餐码与任务。若这不是你的本意，指出即可改。

## 6. 取餐柜凭证（MemberToken）

- 单行表 `LockerCredential`，`AES-256-GCM` 加密：密钥来自环境变量 `MEMBER_TOKEN_ENC_KEY`（32 字节 base64），AAD 固定为 `locker-credential-v1`。
- 读接口只返回掩码（`abcd12…wxyz`），**任何 API 都不回传明文**。
- 写接口仅 ADMIN/ROOT；写后立刻做一次 `openMark` 验证，结果写入 `lastVerifyOk` 与审计。
- 轮询遇到 `code 401`：置 `lastVerifyOk=false`，暂停轮询并进入退避（10 分钟一次探测），产生 `AdminAlert`（邮件给 ROOT + 站内），避免刷屏与误报。
- 凭证失效期间任务保持 `WAITING`，不判超时失败，凭证恢复后自动继续。

## 7. 提醒状态机

```
            ┌──────────┐  创建
            ▼          │
        ┌────────┐     │
        │PENDING │─────┘
        └───┬────┘
     首次查询 │
            ▼
        ┌────────┐  记录基线指纹
        │BASELINE│
        └───┬────┘
            ▼
        ┌────────┐  指纹 ≠ 基线且 arrived=true   ┌─────────┐
        │WAITING │──────────────────────────────▶│ ARRIVED │ 通知一次
        └───┬────┘                               └─────────┘
            │ 超过 endsAt
            ▼
        ┌────────┐
        │TIMEOUT │ 通知超时
        └────────┘
   用户手动停止 → STOPPED
```

- **基线**：创建后第一次查询只记录指纹，不提醒，避免把上一单当新到。
- **指纹**：`cabinet|identity`（identity 取 data 里首个非空的 id/orderId/takeCode 等）。
- **一次性**：`notifiedAt` 非空后不再提醒。
- **超时**：到 `endsAt` 仍未命中 → `TIMEOUT`，发一条超时通知（同样走三通道策略，短信仅在已绑定时发）。
- **立即查询**：手动触发一次，不改变 `endsAt`。
- 查询异常：不改变主状态，`failCount++`、写 `ERROR` 事件；连续失败 5 次产生一次管理员告警。

## 8. 通知分发

### 8.1 通道选择

```
任务命中（ARRIVED）或超时（TIMEOUT）
        │
        ├─ 站内：写 ReminderEvent + 客户端轮询/推送可见（始终）
        │
        ├─ 推送：
        │    遍历该用户 Device：
        │      pushMode=FCM  → firebase-admin send（失败则清理无效 token）
        │      pushMode=NTFY → 汇总后向用户 topic publish 一次
        │    若用户 ntfyEnabled=true，即使有 FCM 也 publish 一次（主动连接模式）
        │
        └─ 短信：phone 已绑定且 smsEnabled → 必发（模板 SMS_XXXXXXXX）
                 未绑定 → 不发，仅站内记录，App 启动时提示
```

关键规则（你的原话）：**已绑定手机号必发短信；未绑定照常推送，但每次打开 App 弹窗提示「未绑手机号只能通过 App/网页查看，短信不可达」。**

### 8.2 推送内容

- `showNotifyDetails=true`（默认）：标题「外卖已入柜」，正文「柜号 A-07 · 取餐码 1234」。
- `showNotifyDetails=false`：「外卖到了，打开 App 查看」。
- 注册引导页明确告知该开关可开可关，默认开。
- 短信内容由阿里云模板固定，不受该开关影响。

### 8.3 FCM

- 服务端：`firebase-admin`，凭据来自 `FIREBASE_SERVICE_ACCOUNT_JSON`（文件路径或 JSON 字符串）。
- 未配置凭据时**不报错**，只记一条 INFO：FCM 未启用，全部设备按 NTFY 处理。
- 客户端：`GoogleApiAvailability.isGooglePlayServicesAvailable()` 判定 GMS；有 GMS 且 Firebase 初始化成功才注册 FCM token，否则 `pushMode=NTFY`。

### 8.4 ntfy

**部署形态（实测约束）**：ntfy 明确不支持挂在子路径下——`base-url` 带路径会直接拒绝启动。
因此必须给它一个独立主机名（`ntfy.<你的域名>`），Caddy 里单独一个站点块。两条 DNS A 记录：主域 + ntfy 子域。

**两个地址不能混用**：

| 变量 | 用途 | 示例 |
|---|---|---|
| `NTFY_SERVER_URL` | 服务端 publish（容器内网） | `http://ntfy:80` |
| `NTFY_PUBLIC_URL` | App 主动订阅（公网） | `https://ntfy.example.com` |

- 每用户一个随机 topic（32 hex），仅本人与管理员可见；管理台可重置（旧 topic 立即作废）。
- 服务端 publish：`POST {NTFY_SERVER_URL}/{topic}`，`Authorization: Bearer <ntfyToken>`（自建实例的 access token）。
- 客户端主动连接：`wss://{NTFY_PUBLIC_URL 主机}/{topic}/ws?since=all`，前台服务 + 指数退避重连；断线期间的离线消息由 ntfy 的 `since` 缓存补齐。
- 「允许主动连接 ntfy」= App 内可手动开关该长连接，且在无 GMS 时默认开启。
- 不想自建：把 `NTFY_PUBLIC_URL` 与 `NTFY_SERVER_URL` 都指向 `https://ntfy.sh` 即可（topic 不可猜）。


### 8.5 阿里云短信

- 官方 Node SDK：`@alicloud/dysmsapi20170525`（`SendSms`）。
- 模板 `SMS_XXXXXXXX`，参数 `{cabCode, SN, box_sn}`。
- 日配额：同一号码当日 `SENT` 计数 ≥ 20 则记 `SKIPPED` 并告警（阿里云单号码 20 条/天硬限制）。
- 失败重试：可重试错误码（限流、超时）最多 2 次，指数退避；最终失败写 `SmsLog` + `AdminAlert`。
- 发送前校验号码格式，日志中号码掩码（`138****8000`）。

## 9. 轮询调度器

- 单实例、进程内 `setInterval`，间隔取 `SystemSetting.pollIntervalSec`（默认 60，下限 10）。
- 每轮：
  1. `SELECT ... WHERE status IN ('PENDING','BASELINE','WAITING') FOR UPDATE SKIP LOCKED` 取出待查任务（同时起到单实例防重作用）。
  2. 逐任务检查 `endsAt` → 超时。
  3. 调 `locker` 客户端查询，按状态机更新。
  4. 命中则触发通知分发。
- 并发：每轮最多 20 个任务并行，避免打爆取餐柜接口。
- 优雅退出：`SIGTERM` 时停止新一轮，等待进行中的查询完成。

## 10. 安全

| 面 | 措施 |
|---|---|
| 传输 | Caddy 自动 HTTPS，HSTS；App 强制 https（`usesCleartextTraffic=false`，ntfy 自建可配 ws 例外） |
| 密码 | PBKDF2-HMAC-SHA512 + 随机盐 + 迭代，恒定时比较 |
| 令牌 | access 短命；refresh 轮换 + 可撤销；改密/停用/转让全撤 |
| 引导页 | 一次性引导码（服务端生成，写日志与 `data/bootstrap-code.txt`），成功创建 ROOT 后永久关闭 |
| 越权 | 每个查询按 `userId` 过滤；管理员接口用 `@Roles()` + 资源归属双重校验 |
| 注入 | Prisma 参数化；输入用 `class-validator`/zod 白名单 |
| 限频 | 登录、注册、发验证邮件、发短信、手动查询均限频 |
| 审计 | 角色变更、MemberToken、设置、邀请码、告警确认全部留痕 |
| 日志 | 不记录密码、token 明文、MemberToken 明文；手机号掩码 |
| 数据保留 | 任务与事件 30 天、短信与审计 90 天，定时清理任务 |

## 11. 部署

`deploy/docker-compose.yml` 四个服务：

| 服务 | 镜像 | 说明 |
|---|---|---|
| `db` | `postgres:16-alpine` | 数据卷持久化 |
| `ntfy` | `binwiederhier/ntfy` | 自建推送，可换成公共实例 |
| `server` | 本地构建 `server/Dockerfile` | 启动时 `prisma migrate deploy` |
| `web` | 本地构建（nginx 静态）或 Caddy 直接托管 | React 产物 |
| `caddy` | `caddy:2-alpine` | 两个站点块：主域（`/api` → server、其余 → web）+ `ntfy.<域名>`（→ ntfy），自动证书 |

环境变量集中在 `deploy/.env`（模板 `deploy/.env.example`），密钥不进仓库。

## 12. 客户端

### 12.1 Android（Kotlin 2.x · Compose · minSdk 24 · targetSdk 35）

- 包名 `com.wildcreator.mealreminder`，App 名「取餐提醒」。
- 分层：`data`（Retrofit + OkHttp + DataStore/EncryptedSharedPreferences）、`domain`、`ui`（Compose 导航）、`push`（FCM 服务 + ntfy 前台服务）、`di`（Hilt）。
- 页面：登录、注册（邀请码）、邮箱验证提示、任务列表、创建任务、任务详情（事件流）、通知设置（短信/手机号绑定/ntfy 开关/内容开关）、账号、管理员页（用户、邀请码、MemberToken、设置、告警、审计）。
- 启动检测：GMS → FCM 注册；无 GMS → ntfy 前台长连接。
- 未绑手机号：每次冷启动弹一次提示（含「去绑定」入口）。
- 令牌：access 内存 + DataStore，refresh 加密存储；401 自动刷新重试一次。

### 12.2 React Web

- Vite + TS + Tailwind + React Router + TanStack Query + zod。
- 与 App 功能对等：用户端（任务、通知设置、手机号、ntfy）+ 管理端（用户、邀请码、MemberToken、系统设置、告警、审计、短信流水）。
- 引导页 `/setup`：输入一次性引导码创建 ROOT。
- 所有请求走 `/api`，refresh token 用 httpOnly cookie。

## 13. 测试

- 单元：密码哈希与校验、JWT 签发/校验/撤销、邀请码规则、指纹与状态机、短信日配额、ntfy topic 生成、MemberToken 加解密。
- e2e（supertest + 测试 Postgres）：注册→验证→登录→刷新→登出；角色越权矩阵；任务全生命周期（mock 取餐柜客户端）；MemberToken 修改权限与审计。
- 手工验收清单见 `docs/acceptance.md`（实现阶段补）。

## 14. 尚未决定 / 需要你后续提供

| 项 | 状态 |
|---|---|
| 域名 | 占位 `meal.example.com`，部署时替换 |
| Firebase 项目与凭据 | 你按 `docs/firebase-setup.md` 创建后给我两个文件 |
| 阿里云 AK / 签名 / 模板 | 你已确认就绪，实现时填 `deploy/.env` |
| SMTP 账号 | 你提供后填 `deploy/.env` |
| 初始管理员邮箱 | 部署时在引导页填写 |
