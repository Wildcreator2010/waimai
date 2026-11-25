# REST API 契约

> 前缀 `/api`。请求/响应均 `application/json; charset=utf-8`。
> 时间统一 ISO-8601 UTC（`2026-11-10T15:00:00.000Z`），客户端本地化展示。
> 鉴权：`Authorization: Bearer <accessToken>`；Web 端 refresh 走 httpOnly cookie。

## 0. 通用约定

### 0.1 错误响应

```json
{ "code": "EMAIL_NOT_VERIFIED", "message": "邮箱尚未验证", "details": null }
```

| HTTP | 含义 | 典型 code |
|---|---|---|
| 400 | 参数错误 | `VALIDATION_FAILED` |
| 401 | 未登录/令牌无效 | `UNAUTHENTICATED` / `TOKEN_EXPIRED` |
| 403 | 无权限 | `FORBIDDEN` / `EMAIL_NOT_VERIFIED` / `ACCOUNT_DISABLED` |
| 404 | 资源不存在 | `NOT_FOUND` |
| 409 | 冲突 | `EMAIL_TAKEN` / `INVITE_USED` |
| 429 | 限频 | `TOO_MANY_REQUESTS` |
| 500 | 服务端错误 | `INTERNAL` |

### 0.2 分页

`?page=1&pageSize=20`（pageSize 上限 100），响应：

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0 }
```

### 0.3 用户对象

```json
{
  "id": "uuid",
  "email": "a@b.com",
  "role": "USER",
  "status": "ACTIVE",
  "displayName": "",
  "emailVerifiedAt": "...",
  "phone": "138****8000",
  "phoneVerified": true,
  "showNotifyDetails": true,
  "smsEnabled": true,
  "ntfyEnabled": false,
  "ntfyTopic": "3f9c...",
  "createdAt": "...",
  "lastLoginAt": "..."
}
```

> `phone` 永远掩码；`ntfyTopic` 仅本人与管理员可见。

---

## 1. 引导（首次部署）

### GET /api/bootstrap/status
无鉴权。
```json
{ "needsBootstrap": true }
```

### POST /api/bootstrap
无鉴权，但需一次性引导码。
```json
{ "setupCode": "K7F2-9QX1", "email": "root@example.com", "password": "...", "displayName": "根管理员" }
```
- 201：创建 ROOT（`status=ACTIVE`、`emailVerifiedAt=now`），引导入口永久关闭。
- 403 `INVALID_SETUP_CODE`：引导码错误。
- 409 `ALREADY_BOOTSTRAPPED`：已存在 ROOT。

---

## 2. 认证

### GET /api/captcha/challenge?purpose=register|resend|forgot|phone
无鉴权。取一道人机验证题（默认内置算术题，2 分钟一次性）。
```json
{ "id": "uuid", "question": "6 × 7 = ?", "provider": "builtin", "expiresInSec": 120 }
```
`provider=turnstile` 时 `id/question` 为空，客户端应改用 Turnstile 组件拿 token；
`provider=off` 表示当前环境未启用（仅调试）。

**需要人机验证的接口**（都接受 `captchaId` + `captchaAnswer`，或 `captchaToken`）：
`POST /auth/register`、`POST /auth/resend-verification`、`POST /auth/forgot-password`、
`POST /me/phone/request-code`。校验失败返回 400 `CAPTCHA_FAILED`。

### POST /api/auth/register
```json
{
  "email": "a@b.com",
  "password": "至少8位含字母数字",
  "inviteCode": "INV-XXXX",
  "acceptTerms": true,
  "captchaId": "uuid",
  "captchaAnswer": "42"
}
```
`acceptTerms` 必须为 `true`（否则 400）；服务端记录同意时间与协议版本。
- 202：创建 `PENDING_VERIFICATION` 账号，发送验证邮件。
- 400 `VALIDATION_FAILED`：密码强度不足/邮箱格式错误。
- 403 `INVITE_INVALID` / `INVITE_EXPIRED` / `INVITE_EMAIL_MISMATCH`。
- 409 `EMAIL_TAKEN`。

### POST /api/auth/verify-email
```json
{ "token": "<邮件里的明文 token>" }
```
- 200：`status=ACTIVE`。
- 400 `TOKEN_INVALID` / `TOKEN_EXPIRED`。

### POST /api/auth/resend-verification
```json
{ "email": "a@b.com" }
```
- 202：无论邮箱是否存在都返回 202（防枚举）；限频 60s/次、5 次/天。

### POST /api/auth/login
```json
{ "email": "a@b.com", "password": "..." }
```
- 200：
```json
{
  "accessToken": "eyJ...",
  "expiresIn": 900,
  "refreshToken": "opaque",   // App 用；Web 端此字段为空，改为 Set-Cookie
  "user": { }
}
```
- 401 `INVALID_CREDENTIALS`。
- 403 `EMAIL_NOT_VERIFIED` / `ACCOUNT_DISABLED`。
- 429 `TOO_MANY_REQUESTS`。

### POST /api/auth/refresh
App：`{ "refreshToken": "opaque" }`；Web：空 body + cookie。
- 200：新 access + 新 refresh（旧的立即作废，轮换）。
- 401 `REFRESH_INVALID` / `REFRESH_EXPIRED` / `REFRESH_REVOKED`。

### POST /api/auth/logout
撤销当前 refresh session。

### GET /api/auth/me
返回当前用户对象。

### POST /api/auth/forgot-password
```json
{ "email": "a@b.com" }
```
- 202：恒返回 202；若存在则发重置邮件（1 小时有效）。

### POST /api/auth/reset-password
```json
{ "token": "...", "newPassword": "..." }
```
- 200：改密成功，撤销该用户全部会话。

### PATCH /api/auth/password
已登录改密。
```json
{ "currentPassword": "...", "newPassword": "..." }
```
- 200：撤销其他会话，保留当前会话。

---

## 3. 当前用户设置

### GET /api/me/settings
```json
{
  "showNotifyDetails": true,
  "smsEnabled": true,
  "ntfyEnabled": false,
  "phone": "138****8000",
  "phoneVerified": true,
  "ntfyTopic": "3f9c...",
  "ntfyServerUrl": "https://ntfy.example.com",
  "smsAvailable": true
}
```

### PATCH /api/me/settings
```json
{ "showNotifyDetails": false, "smsEnabled": true, "ntfyEnabled": true }
```

### POST /api/me/phone/request-code
```json
{ "phone": "13800138000" }
```
- 202：发送 6 位验证码短信（模板 `SMS_VERIFY`），5 分钟有效；同号 60s 限频、5 次/天。
- 409 `PHONE_TAKEN`。

### POST /api/me/phone/verify
```json
{ "phone": "13800138000", "code": "123456" }
```
- 200：`phoneVerifiedAt=now`，`phone` 落库。
- 400 `CODE_INVALID` / `CODE_EXPIRED`。

### POST /api/me/phone/unbind
200。解绑后不再发短信（并在 App 启动时提示）。

### POST /api/me/ntfy/rotate
200，返回新 topic；旧 topic 立即作废（服务端不再 publish）。

### GET /api/me/ntfy/config
返回 App 主动连接所需配置：
```json
{ "serverUrl": "wss://ntfy.example.com", "topic": "3f9c...", "token": null }
```

### 设备

#### POST /api/me/devices
```json
{ "name": "Pixel 7", "platform": "android", "pushMode": "FCM", "fcmToken": "...", "appVersion": "1.0.0" }
```
- 201。同一 fcmToken 幂等更新。
- 无 GMS 时传 `pushMode=NTFY`、`fcmToken=null`。

#### GET /api/me/devices
返回裸数组（设备量小，不分页）：
```json
[ { "id": "uuid", "name": "Pixel 7", "platform": "android", "pushMode": "NTFY", "hasFcmToken": false, "appVersion": "1.0.0", "lastSeenAt": "..." } ]
```
#### DELETE /api/me/devices/:id
200 `{ "deleted": true }`。

---

## 4. 提醒任务

### POST /api/reminders
```json
{ "pickupCode": "1234", "cabCode": "SYA61026AP", "durationMin": 60 }
```
- 201：创建，`status=PENDING`，下一次轮询做基线。
- 400 `VALIDATION_FAILED`：`durationMin` 1..720；`pickupCode` 1..64；`cabCode` 1..32。
- 409 `TOO_MANY_ACTIVE_REMINDERS`：单用户同时等待中任务 > 5。
- 409 `PHONE_NOT_BOUND_WARNING`：**不阻断**，仅在响应里带 `warnings`：

```json
{
  "id": "uuid",
  "status": "PENDING",
  "warnings": [{ "code": "PHONE_NOT_BOUND", "message": "未绑定手机号，短信提醒不可达，只能通过 App/网页查看" }]
}
```

### GET /api/reminders?status=&page=&pageSize=
只返回当前用户的任务（管理员同样只看自己的）。

### GET /api/reminders/:id
含 `events` 最近 50 条。

### POST /api/reminders/:id/check
立即查询一次，返回：
```json
{ "ok": true, "arrived": false, "detail": "尚未入柜：未找到取件码为 1234 的订单" }
```

### POST /api/reminders/:id/stop
置 `STOPPED`。

### POST /api/reminders/:id/open
一键开箱（会物理开门）。仅任务本人、状态为 `ARRIVED`、且已记录 `orderId`/`lockerId` 时可用。
```json
{ "ok": true, "message": "开箱命令已发送", "openCount": 1, "cabinet": "A-07" }
```
约束与错误码：

| 场景 | HTTP | code |
|---|---|---|
| 未入柜 | 409 | `REMINDER_NOT_ARRIVED` |
| 没记录到订单号 | 409 | `ORDER_ID_MISSING` |
| 已开 3 次 | 409 | `OPEN_LIMIT_REACHED` |
| 10 秒内重复 | 409 | `OPEN_TOO_FREQUENT` |
| 未配置 MemberToken | 409 | `MEMBER_TOKEN_MISSING` |
| 接口返回失败 | 409 | `OPEN_FAILED` |

每次成功开箱写 `AuditLog(action=LOCKER_OPEN)` 与任务事件。

### GET /api/reminders/:id/events?page=
事件流：`level` ∈ `INFO|WARN|ERROR|SUCCESS`。

---

## 5. 管理员

> 全部需要 `ADMIN` 或 `ROOT`。除 `GET /api/admin/member-token` 外的写操作都要写审计。

### 5.1 用户

#### GET /api/admin/users?q=&role=&status=&page=
```json
{ "items": [ { "id": "...", "email": "...", "role": "USER", "status": "ACTIVE", "phone": "138****8000", "createdAt": "...", "lastLoginAt": "..." } ], "total": 1 }
```

#### POST /api/admin/users
直接创建账号（不发邮件，`status=ACTIVE`，首登强制改密）。
```json
{ "email": "a@b.com", "password": "...", "role": "USER", "displayName": "" }
```

#### PATCH /api/admin/users/:id
```json
{ "displayName": "张三", "status": "DISABLED" }
```
- ROOT 才能：`{ "role": "ADMIN" }`（提权/降级）。
- 任何管理员都不能改 ROOT 的 `role`/`status`；ROOT 自己也不能降自己（只能转让）。

#### DELETE /api/admin/users/:id
- ROOT 不能删；ADMIN 不能删其他 ADMIN。
- 级联删除该用户任务、设备、会话。

#### POST /api/admin/root/transfer
仅 ROOT。
```json
{ "userId": "uuid", "password": "<ROOT 当前密码确认>" }
```
- 200：目标升 ROOT，原 ROOT 降 ADMIN，双方会话全撤销，写审计。

### 5.2 邀请码

#### POST /api/admin/invites
```json
{ "email": "invitee@b.com", "expiresInDays": 7, "note": "" }
```
- 201：`{ "id": "...", "code": "INV-7K2M9Q", "email": "...", "expiresAt": "..." }`
- 409 `INVITE_EMAIL_PENDING`：同邮箱已有未用邀请码。

#### GET /api/admin/invites?status=unused|used|expired&page=
#### DELETE /api/admin/invites/:id
仅未使用的可删。

### 5.3 MemberToken

#### GET /api/admin/member-token
```json
{
  "configured": true,
  "masked": "abcd12…wxyz",
  "updatedAt": "...",
  "updatedBy": "root@example.com",
  "lastVerifiedAt": "...",
  "lastVerifyOk": true,
  "lastVerifyMessage": "token 有效",
  "expiringSoon": false
}
```

#### PUT /api/admin/member-token
```json
{ "token": "<MemberToken 明文>" }
```
- 200：加密入库、立即调 `openMark` 验证、写审计。
- 400 `VALIDATION_FAILED`：长度 < 8 或含空白。

#### POST /api/admin/member-token/verify
无 body，用已存凭证验证一次，返回 `{ ok, message }`。

### 5.4 系统设置

#### GET /api/admin/settings
```json
{
  "pollIntervalSec": 60,
  "defaultDurationMin": 60,
  "maxDurationMin": 720,
  "maxActiveRemindersPerUser": 5,
  "lockerDeviceSn": "2680",
  "lockerApiBase": "https://csmini.guangeiot.com",
  "ntfyServerUrl": "https://ntfy.example.com",
  "registrationOpen": true,
  "showNotifyDetailsDefault": true
}
```

#### PATCH /api/admin/settings
只接受上表字段；`pollIntervalSec` 下限 10。

### 5.5 告警 / 审计 / 短信流水

#### GET /api/admin/alerts?acked=false&page=
#### POST /api/admin/alerts/:id/ack
#### GET /api/admin/audit?action=&actorId=&from=&to=&page=
#### GET /api/admin/sms-logs?status=&phone=&from=&to=&page=

### 5.6 概览

#### GET /api/admin/overview
```json
{
  "users": { "total": 12, "active": 10, "admins": 2 },
  "reminders": { "waiting": 3, "arrivedToday": 7, "timeoutToday": 1 },
  "sms": { "sentToday": 9, "failedToday": 0 },
  "alerts": { "unacked": 1 },
  "locker": { "configured": true, "lastVerifyOk": true }
}
```

---

## 6. 健康检查

### GET /api/health
无鉴权。
```json
{ "status": "ok", "db": "ok", "uptimeSec": 123, "version": "1.0.0" }
```

---

## 7. 前端约定

- access token 失效（401 `TOKEN_EXPIRED`）→ 自动 `POST /auth/refresh` 重试一次，失败则跳登录。
- 所有列表接口用 TanStack Query 缓存，写操作后 `invalidateQueries`。
- App 冷启动顺序：`/bootstrap/status` → 有本地 refresh → `/auth/refresh` → `/auth/me` → `/me/settings` → 未绑手机号则弹窗。
