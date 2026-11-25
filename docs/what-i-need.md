# 我需要你提供什么

> 一句话：**只有账号与域名类凭据需要你给，密钥我自己生成、你自己填页面。**
> 填完后跑 `node scripts/check-env.mjs` 自检，全绿就能部署。

## 1. 必须你提供的（4 项）

| # | 数据 | 从哪拿 | 填到哪 | 缺了会怎样 |
|---|---|---|---|---|
| 1 | **域名 + DNS**：主域（如 `meal.你的域名.com`）与 ntfy 子域（`ntfy.meal.你的域名.com`），两条 A 记录指向 VPS | 你的域名服务商控制台 | `deploy/.env` 的 `DOMAIN` / `NTFY_DOMAIN` / `APP_BASE_URL` / `NTFY_PUBLIC_URL` / `NTFY_BASE_URL` | Caddy 申请不了证书，整站不可访问；ntfy 无法独立主机名（它不支持子路径） |
| 2 | **SMTP**：`SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | QQ 邮箱→设置→账户→开启 SMTP 并生成**授权码**（不是登录密码）；或 163/企业邮 | `deploy/.env` | 收不到注册验证邮件，账号无法激活；ROOT 告警邮件也发不出 |
| 3 | **阿里云 AK**：`ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET` | 阿里云控制台 → RAM 访问控制 → 创建**子账号** → 只授 `AliyunDysmsFullAccess` → 创建 AccessKey | `deploy/.env` | 短信发不出（到柜短信是「已绑定必发」，属核心功能） |
| 4 | **阿里云短信签名 + 两个模板 CODE**：`ALIYUN_SIGN_NAME`、`ALIYUN_TEMPLATE_ARRIVAL`（你已有 `SMS_XXXXXXXX`）、`ALIYUN_TEMPLATE_VERIFY`（**需新申请**，验证码类型） | 短信服务控制台 → 国内消息 → 签名管理 / 模板管理 | `deploy/.env` | 没签名/模板 → 短信被拒；没验证码模板 → 手机号绑定不可用（到柜短信仍可发） |

## 2. 可选（不给我也能跑）

| 数据 | 用途 | 缺省行为 |
|---|---|---|
| Firebase `google-services.json` | 有 GMS 的手机用 FCM 系统级推送 | 全部设备走 ntfy |
| Firebase 服务账号 json | 服务端向 FCM 投递 | 启动日志 `FCM 未配置`，不报错 |
| 阿里云**验证码模板**（上面第 4 项里已列） | 手机号绑定 | 绑定接口返回 `SMS_TEMPLATE_NOT_CONFIGURED` |

## 3. 不需要给我的（别贴到聊天里）

| 项 | 谁生成 / 谁填 |
|---|---|
| `JWT_SECRET` | 我生成后直接写进 `deploy/.env`（`openssl rand -hex 32`） |
| `MEMBER_TOKEN_ENC_KEY` | 同上（`openssl rand -base64 32`） |
| 数据库密码 | 我生成强随机值并同步写进 `POSTGRES_PASSWORD` 与 `DATABASE_URL` |
| 初始管理员邮箱/密码 | 部署后你在 `/setup` 页面自己填，我拿不到也不需要 |
| 取餐柜 **MemberToken** | 登录后到管理台「取餐柜凭证」粘贴，加密入库，任何接口都不回显明文 |
| 你的手机号 | 在 App「设置 → 绑定手机号」自己填，服务端只存并掩码展示 |

## 4. 安全要求

1. **密钥不要贴聊天记录**。最稳的做法：你把 4 项凭据自己写进 `deploy/.env`（该文件已在 `.gitignore` 里），我只读不打印。
   如果你确实要贴给我，我会写进文件并**不在回复里回显**，但聊天记录本身仍会留痕。
2. 阿里云 AK 用 **RAM 子账号**，只授短信权限，不要用主账号 AK。
3. 服务账号 json（FCM）只放 `deploy/secrets/`，永不入库、永不进 APK。
4. 上线后如果怀疑泄露：换 AK、重新生成 `JWT_SECRET`（会让所有人重新登录）、重新生成 `MEMBER_TOKEN_ENC_KEY` 并重新录入 MemberToken。

## 5. 填完之后

```bash
node scripts/check-env.mjs
```

它会逐项检查：占位符是否没换、密钥长度、`DATABASE_URL` 与密码是否一致、SMTP/短信是否配齐、
ntfy 是否误挂子路径、FCM 文件是否存在。全绿输出「可以部署」。

## 6. 最小可用路径

如果只想先看到完整功能跑起来，**只需要第 1、2 项**（域名 + SMTP）：

```ini
MAIL_DRY_RUN=false
ALIYUN_DRY_RUN=true     # 短信先不发
LOCKER_MOCK=true        # 取餐柜先模拟
```

这样能完成：注册 → 邮箱验证 → 登录 → 建提醒 → 模拟入柜 → ntfy/App 推送 → 管理台全部功能。
短信与真实取餐柜之后再打开。
