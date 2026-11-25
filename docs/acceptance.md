# 验收清单

> 按顺序执行。每一步都给出「怎么做 / 期望看到什么」。已自动化的部分标注 ✅（`npm test` / `npm run test:e2e`）。

## 0. 本地起服务

```bash
# 1) 数据库（端口 5433，避开已有实例）
docker compose -f deploy/docker-compose.dev.yml up -d

# 2) 服务端
cd server
cp .env.example .env      # 然后改 MEMBER_TOKEN_ENC_KEY / JWT_SECRET
#   MEMBER_TOKEN_ENC_KEY: openssl rand -base64 32
#   JWT_SECRET:           openssl rand -hex 32
npm install
npx prisma migrate deploy
npm run start:dev         # http://127.0.0.1:8787/api/health

# 3) Web
cd ../web
npm install
npm run dev               # http://localhost:5173
```

`server/.env` 里先保持 `LOCKER_MOCK=true`、`MAIL_DRY_RUN=true`、`ALIYUN_DRY_RUN=true`，这样不依赖任何外部凭据也能跑通全链路。

## 1. 引导与登录

- [ ] 打开 `http://localhost:5173/setup`，输入一次性引导码（服务端启动日志里的 `首次部署引导码：XXXX-XXXX`，或 `server/data/bootstrap-code.txt`）
- [ ] 创建 ROOT 成功，跳到登录页；再次访问 `/setup` 应提示系统已初始化
- [ ] 用 ROOT 邮箱密码登录，进入任务列表
- [ ] 错误密码 → 提示「邮箱或密码不正确」；连续错 5 次 → 429

✅ 自动化：`npm run test:e2e` 覆盖引导码错误/正确、登录、refresh 轮换、旧 refresh 失效。

## 2. 邀请码与注册

- [ ] 管理台 → 邀请码 → 生成，邮箱填 `test@example.com`
- [ ] 用该邮箱注册（密码需含字母+数字，≥8 位）
- [ ] 未验证邮箱直接登录 → 「邮箱尚未验证」
- [ ] 服务端日志出现 `[MAIL-DRY-RUN]` 邮件，里面有 `verify-email?token=...` 链接
- [ ] 打开链接 → 验证成功 → 可以登录
- [ ] 用另一个邮箱 + 同一邀请码注册 → 「邀请码与邮箱不匹配」

✅ 自动化：邀请码一码一邮箱、未验证不可登录、验证后可登录。

## 3. 取餐提醒（mock 模式）

- [ ] 创建任务：取餐码 `1234`、柜机 `SYA61026AP`、时长 30
- [ ] 若未绑手机号，页面出现琥珀色提示「短信提醒不可达」
- [ ] 详情页点「立即查询」→ 事件流出现「基线记录」，状态变 `BASELINE`
- [ ] 再点「立即查询」→ 状态 `ARRIVED`，柜号 `A-07`，事件流出现「检测到入柜」
- [ ] 再点一次 → 不会重复提醒（一次性）
- [ ] 创建第二个任务并把时长设为 1 分钟，等 1 分钟后查询 → `TIMEOUT`

✅ 自动化：基线不提醒、第二次命中、三通道分发结果、超时。

## 4. 通知

- [ ] 未绑手机号：`notify.sms.attempted=false`（不发送）
- [ ] 绑定手机号后（需配置验证码模板）再次命中 → `notify.sms.attempted=true`
- [ ] 服务端日志出现 `[SMS-DRY-RUN]`，`SmsLog` 表有 `SENT` 记录
- [ ] 管理台 → 短信流水 → 能看到该条记录，手机号掩码

- [ ] ntfy：设置页开启「ntfy 主动连接」，服务端命中后 `notify.ntfy.ok=true`
- [ ] 手机 ntfy App 或网页订阅同一 topic 能收到消息
- [ ] 验证消息确实进了 topic（不依赖手机）：
  ```bash
  # 在服务器上，用容器内网直接查 topic 缓存
  docker run --rm --network meal-reminder_default curlimages/curl:latest \
    -s "http://ntfy:80/<topic>/json?poll=1&since=all"
  ```
  应看到 `"event":"message","title":"外卖已入柜","message":"柜号 A-07 · 取餐码 8888"`
- [ ] FCM：配置 `google-services.json` 与 service account 后，有 GMS 的设备收到系统通知；`notify.fcm.sent>=1`
- [ ] 未配置 FCM 时启动日志是「FCM 未配置」，不影响 ntfy 与短信
- [ ] 通道自测：管理员调用
  ```bash
  curl -X POST http://127.0.0.1:8787/api/admin/notifications/test \
    -H "Authorization: Bearer <access token>"
  ```
  返回 `{fcm,ntfy,sms}` 三块；`sms.attempted` 恒为 `false`（测试推送不发短信，避免费用）

✅ 自动化：测试推送接口的权限与返回结构。

## 5. 权限矩阵

| 操作 | USER | ADMIN | ROOT | 期望 |
|---|:--:|:--:|:--:|---|
| 看他人任务 | ✗ | ✗ | ✗ | 列表只返回自己的 |
| 看 MemberToken | ✗ | ✓（掩码） | ✓（掩码） | 明文任何接口都不返回 |
| 改 MemberToken | ✗ | ✓ | ✓ | 写审计 |
| 生成邀请码 | ✗ | ✓ | ✓ | |
| 停用 USER | ✗ | ✓ | ✓ | 被停用者下次请求 403 `ACCOUNT_DISABLED` |
| 提权 USER→ADMIN | ✗ | ✗ | ✓ | ADMIN 调用 403 |
| 降级 ADMIN | ✗ | ✗ | ✓ | |
| 操作 ROOT | ✗ | ✗ | 仅转让 | 改 ROOT 角色/状态 403 |

✅ 自动化：普通用户访问 MemberToken 403、停用后令牌立即失效、非 ROOT 改角色 403、ROOT 不可被改。

## 6. MemberToken

- [ ] 管理台 → 取餐柜凭证 → 粘贴一个假 token 保存 → 返回「验证失败」但仍保存（mock 模式下验证通过）
- [ ] 页面只显示掩码（前 6 后 4）
- [ ] 审计日志出现 `MEMBER_TOKEN_UPDATE`
- [ ] 点「测试有效性」→ 写 `MEMBER_TOKEN_VERIFY` 审计
- [ ] 把 `LOCKER_MOCK` 设为 `false` 并填真实 token → 任务能正常查询
- [ ] token 过期（接口返回 401）→ 告警表出现 `MEMBER_TOKEN_INVALID`，轮询进入退避

## 7. 部署

- [ ] `deploy/.env` 填好域名、数据库密码、JWT_SECRET、MEMBER_TOKEN_ENC_KEY、SMTP、阿里云、ntfy
- [ ] `deploy/secrets/firebase-service-account.json` 放好（可选）
- [ ] `docker compose -f deploy/docker-compose.yml up -d --build`
- [ ] 访问 `https://你的域名` 自动跳 HTTPS，证书有效
- [ ] `/api/health` 返回 `{"status":"ok","db":"ok"}`
- [ ] 首次部署看 `docker compose logs server | grep 引导码`，用它创建 ROOT
- [ ] ntfy 子域可用：`https://ntfy.你的域名/v1/health` 返回 `{"healthy":true}`
- [ ] App 设置页显示的 ntfy 地址是 `wss://ntfy.你的域名`（不是容器内网地址）

## 8. 数据保留

- [ ] 服务端启动日志出现「下次数据清理约在 N 小时后」
- [ ] 手动验证：把某条任务的 `createdAt` 改到 31 天前，次日 03:00 后该任务与事件被删除
- [ ] 短信流水与审计在 90 天后删除；过期的一次性令牌与 refresh 会话在 7 天后删除

✅ 自动化：`RetentionService` 的截止时间计算、删除范围、返回计数、`msUntilNextRun` 边界（6 个单测）。

## 9. 已知限制（不是 bug，是设计）

1. **同一柜机 + 同一取餐码连续两单不会提醒第二次**——指纹相同。换取餐码即可。
2. **单实例部署**：服务器重启期间轮询中断（分钟级），对「入柜提醒」可接受；扩容需换 Redis 队列（见 decisions D-11）。
3. **FCM 在国内网络不稳定**，这是 Google 服务本身的问题，ntfy 与短信是兜底。
4. **短信单号码 20 条/天**（阿里云硬限制），超限会被跳过并告警。
5. **管理员看不到他人任务**（隐私取舍），排障只能看告警、审计、事件计数。
6. **任务与事件保留 30 天**，短信与审计保留 90 天，每日清理。
7. **Android 已编译通过但未在真机运行**：`assembleDebug` 成功（JDK 21 + Gradle 8.9 + SDK 35，14.2 MB APK），真机上的通知、前台服务、GMS 判定需你实机验证。
