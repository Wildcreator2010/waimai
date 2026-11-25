# 部署指南

两种拓扑，由 `deploy/.env` 的 `DEPLOY_TOPOLOGY` 决定：

| 拓扑 | 编排 | 适用 |
|---|---|---|
| `caddy` | `docker-compose.yml` | 80/443 空闲，Caddy 自动 HTTPS，web 容器托管前端 |
| `external` | `docker-compose.server.yml` | 80/443 已被 nginx / 宝塔占用，容器只监听 127.0.0.1 |

推荐流程（脚本会自动识别拓扑）：

```bash
npm run env:init -- --domain=meal.example.com   # 生成密钥与 deploy/.env
npm run config                                  # 菜单式补 SMTP / 短信等（可选）
npm run deploy:check
sudo bash deploy/install.sh
```

## 1. 前置

- 一台能出网的 VPS（1 核 2G 足够），Docker + Docker Compose v2
- **两条 DNS A 记录**，都指向该 VPS：
  - `你的域名` → 主站与 API
  - `ntfy.你的域名` → 推送服务（ntfy 不支持子路径，必须独立主机名）
- 公网拓扑放行 80 与 443；已有 nginx 拓扑无需放行容器端口

## 2. 环境变量

在仓库根目录执行（脚本会写入 `deploy/.env`）：

```bash
cp deploy/.env.example deploy/.env
# 或自动生成（推荐，会生成数据库密码 / JWT / MemberToken 密钥 / VAPID）
npm run env:init -- --domain=meal.example.com
```

必填项：

```bash
# 生成两个密钥（env:init 会自动做）
openssl rand -hex 32      # → JWT_SECRET
openssl rand -base64 32   # → MEMBER_TOKEN_ENC_KEY

DOMAIN=meal.你的域名.com
NTFY_DOMAIN=ntfy.meal.你的域名.com
APP_BASE_URL=https://meal.你的域名.com
NTFY_PUBLIC_URL=https://ntfy.meal.你的域名.com   # App 订阅用（公网）
NTFY_BASE_URL=https://ntfy.meal.你的域名.com     # ntfy 自身生成的链接
NTFY_SERVER_URL=http://ntfy:80                   # 服务端 publish 用（容器内网，别改）
POSTGRES_PASSWORD=换成一个强密码
DATABASE_URL=postgresql://meal:换成一个强密码@db:5432/meal
```

> `NTFY_SERVER_URL` 与 `NTFY_PUBLIC_URL` 必须分开：前者是容器内网地址，手机不可达；
> 后者是手机真正要连的公网地址。混用会导致 App 订阅到不存在的主机。

`external` 拓扑额外使用：

```ini
NGINX_CONF_DIR=/etc/nginx/conf.d
STATIC_ROOT=/var/www/meal.example.com/dist
NTFY_STATIC_ROOT=/var/www/ntfy.meal.example.com
CERT_DIR=/etc/letsencrypt/live
API_PORT=8787
NTFY_PORT=8081
```

建议同时确认：

- `MAIL_DRY_RUN=false` 且 SMTP 四项已填（否则收不到验证邮件）
- `ALIYUN_DRY_RUN=false` 且 AK / 签名 / 模板已填
- `LOCKER_MOCK=false`（录入 MemberToken 之后）

### 国内网络拉不到 Docker Hub 时

`deploy/.env` 里把镜像换成加速地址（已实测 `docker.m.daocloud.io` 可用）：

```ini
NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine
NGINX_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine
POSTGRES_IMAGE=docker.m.daocloud.io/library/postgres:16-alpine
CADDY_IMAGE=docker.m.daocloud.io/library/caddy:2-alpine
```

### 2.1 菜单式修改配置

不想手动翻 `.env` 时：

```bash
sudo bash deploy/config.sh          # 菜单：域名、SMTP、短信、mock、VAPID、人机验证、保留天数
bash deploy/config.sh --show        # 查看当前配置（敏感值只显示长度）
bash deploy/config.sh --set SMTP_HOST=smtp.example.com MAIL_DRY_RUN=false
bash deploy/config.sh --validate    # 校验
```

修改后选菜单第 10 项重建 server 容器即可加载新变量；也可以手动：

```bash
docker compose -f deploy/docker-compose.yml up -d --force-recreate server
```

## 3. 安装

### caddy 拓扑

```bash
sudo bash deploy/install.sh
# 强制指定
sudo bash deploy/install.sh --topology=caddy
# 使用已有镜像，不重新构建
sudo bash deploy/install.sh --topology=caddy --no-build
```

### external 拓扑

先在本地或构建机产出镜像与前端：

```bash
npm --prefix web run build
npm run image                 # 产出 server-image.tar
```

上传仓库（含 `web/dist`）与 `server-image.tar` 到服务器，然后：

```bash
cd /opt/meal-reminder
sudo bash deploy/install.sh --domain=meal.example.com --topology=external --image-tar=server-image.tar
```

脚本会启动容器、同步 `web/dist` 到 `STATIC_ROOT`、渲染并安装 nginx 配置、健康检查、打印引导码。
证书需自行用宝塔或 acme.sh 签发到 `CERT_DIR/<域名>/`。

### 可选：FCM

把 Firebase 服务账号密钥放到 `deploy/secrets/firebase-service-account.json`。
没有该文件时服务端会记一条「FCM 未配置」，所有设备自动走 ntfy，**不影响启动**。

## 4. 初始化与验证

首次启动日志里会出现：

```
==================================================
首次部署引导码：XXXX-XXXX
==================================================
```

打开 `https://你的域名/setup`，输入该引导码创建 ROOT。创建成功后引导入口永久关闭。

```bash
curl -fsS https://你的域名/api/health
# {"status":"ok","db":"ok",...}
node scripts/smoke.mjs --base=https://你的域名 --web=https://你的域名
```

- 登录 → 生成邀请码 → 注册新用户 → 收验证邮件
- 管理台 → 取餐柜凭证 → 粘贴 MemberToken → 点「测试有效性」
- 管理台 → 告警页 → 调用 `POST /api/admin/notifications/test` 验证推送通道

## 5. 日常运维

| 操作 | 命令 |
|---|---|
| 改配置 | `sudo bash deploy/config.sh` |
| 看日志 | `docker compose -f deploy/docker-compose.yml logs -f server`（external 换成 `docker-compose.server.yml`） |
| 重启 | `docker compose -f <编排> restart server` |
| 备份 | `sudo bash deploy/backup.sh` |
| 恢复 | `sudo bash deploy/restore.sh <备份文件>` |
| 升级 | `sudo bash deploy/upgrade.sh [--image-tar=...]` |
| 渲染 nginx | `npm run deploy:render` |
| 删除过期镜像 | `docker image prune -f` |

### 5.1 一键再部署

在仓库根目录（本机）执行：

```bash
npm run redeploy                  # 构建 Web + 镜像，打包、上传并远程升级
npm run redeploy -- --skip-build  # 复用已有 web/dist 与 server-image.tar
npm run redeploy -- --git         # 服务器有源码：git pull + upgrade（caddy 拓扑用这个）
npm run release                   # 只生成 release/meal-reminder-<版本>.tar.gz
```

远程自动部署需要在 `deploy/.env` 配置：

```ini
DEPLOY_HOST=你的服务器IP或域名
DEPLOY_USER=root
DEPLOY_PORT=22
DEPLOY_PATH=/opt/meal-reminder
DEPLOY_SSH_KEY=C:/Users/你/.ssh/你的密钥
```

发布包只包含 `deploy/`、`web/dist`、`server-image.tar`、`VERSION`，**不含 `.env` 与 `secrets/`**，不会覆盖服务器上的密钥。

备份 cron（每日 04:00，保留 7 天）：

```bash
(crontab -l 2>/dev/null; echo "0 4 * * * cd /opt/meal-reminder && bash deploy/backup.sh >> /var/log/meal-reminder-backup.log 2>&1") | crontab -
```

更完整的升级、回滚、密钥轮换与排障见 [docs/operations.md](../docs/operations.md)。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| install 自动选了 external 但没有镜像 | 80/443 被占用 | `npm run image` 后加 `--image-tar`，或先释放端口再强制 caddy |
| Caddy 起不来 / 证书申请失败 | 域名未解析或 80/443 被占 | `dig 你的域名`；`docker compose logs caddy` |
| server 反复重启 | 环境变量校验失败 | 看日志里的字段名，补 `.env`；`MEMBER_TOKEN_ENC_KEY` 必须是 32 字节 base64 |
| 页面 502 | server 未就绪或端口不一致 | `docker compose logs server`；核对 `API_PORT` 与 nginx |
| ntfy 连不上 | `NTFY_PUBLIC_URL` 与 nginx 子域不一致 | 两者应是同一个子域，且 DNS 已解析 |
| ntfy 容器反复重启 | `NTFY_BASE_URL` 带了路径 | ntfy 不支持子路径，改成独立子域 |
| 收不到验证邮件 | SMTP 未配或 `MAIL_DRY_RUN=true` | 改 `.env` 后重启；dry-run 时链接在日志里 |
| 短信全部跳过 | 触发单号码 20 条/天 | 看 `SmsLog`，属阿里云硬限制 |

## 7. 脚本说明

**标准入口（建议使用）**

| 脚本 | 作用 |
|---|---|
| `install.sh` | 幂等安装：补齐密钥、识别拓扑、启动、健康检查、打印引导码 |
| `config.sh` | 菜单式修改 `.env`；`--show/--set/--validate` |
| `upgrade.sh` | 备份 → 保留上一版镜像 → 导入/构建 → 重建 → 健康检查 |
| `backup.sh` | 数据库备份 + 完整性校验 + 过期清理 |
| `backup-db.sh` | 兼容旧 cron 路径，内部转调 `backup.sh` |
| `restore.sh` | 停 server → 恢复 → 重启 → 健康检查 |
| `_common.sh` | 公共函数（不要直接执行） |

新环境请只使用上面的标准入口；一次性排障脚本已在脱敏时移除。
