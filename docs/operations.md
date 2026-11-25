# 运维手册

## 1. 拓扑速查

`.env` 里的 `DEPLOY_TOPOLOGY` 决定用哪份编排：

| 值 | 编排文件 | TLS / 静态托管 |
|---|---|---|
| `caddy` | `deploy/docker-compose.yml` | Caddy 容器自动 HTTPS，web 容器托管前端 |
| `external` | `deploy/docker-compose.server.yml` | 已有 nginx / 宝塔，容器只监听 127.0.0.1 |

所有命令都在 `deploy/` 目录下执行，或使用 `-f` 指定文件。下文用 `compose` 代指 `docker compose`。

## 2. 日常命令

```bash
cd /opt/meal-reminder        # 你的部署目录

docker compose -f deploy/docker-compose.yml ps          # caddy 拓扑
docker compose -f deploy/docker-compose.server.yml ps   # external 拓扑

docker compose -f <file> logs -f server
docker compose -f <file> restart server
docker compose -f <file> down && docker compose -f <file> up -d
docker stats --no-stream
```

健康检查：

```bash
curl -fsS https://你的域名/api/health
# external 拓扑也可直接查本机
curl -fsS http://127.0.0.1:8787/api/health
```

部署后冒烟：

```bash
node scripts/smoke.mjs --base=https://你的域名 --web=https://你的域名
```

## 3. 备份

`deploy/backup.sh` 会 `pg_dump` → gzip → 校验（gzip 完整 + 含 `CREATE TABLE`）→ 清理过期文件。

```bash
sudo bash deploy/backup.sh
# 自定义目录与保留天数
BACKUP_DIR=/data/backups KEEP_DAYS=14 bash deploy/backup.sh
```

安装每日 cron（04:00）：

```bash
(crontab -l 2>/dev/null; echo "0 4 * * * cd /opt/meal-reminder && bash deploy/backup.sh >> /var/log/meal-reminder-backup.log 2>&1") | crontab -
```

建议把备份再同步到另一台机器或对象存储；数据库备份和 `.env`、`deploy/secrets/` 要一起保存（丢了 `MEMBER_TOKEN_ENC_KEY` 只能重新录入 MemberToken）。

## 4. 恢复

恢复会停止 server、覆盖现有数据库、恢复后重启：

```bash
sudo bash deploy/restore.sh deploy/backups/meal-20261125-040000.sql.gz
# 非交互环境
sudo bash deploy/restore.sh 备份文件 --yes
```

恢复前建议先对当前库再做一次备份。

## 5. 升级与回滚

### 5.1 external（已有 nginx / 宝塔）

本地构建并上传：

```bash
npm --prefix web run build
npm run image
scp server-image.tar user@server:/opt/meal-reminder/
# 前端有改动时，把 web/dist 一并同步到服务器的仓库目录（upgrade.sh 会再同步到 STATIC_ROOT）
rsync -a web/dist/ user@server:/opt/meal-reminder/web/dist/
```

服务器：

```bash
cd /opt/meal-reminder
sudo bash deploy/upgrade.sh --image-tar=server-image.tar
```

脚本会先备份、把当前镜像标记为 `:prev`、导入新镜像、重建 server、同步 `web/dist`、重渲染 nginx、健康检查。

### 5.2 caddy

```bash
cd /opt/meal-reminder
git pull
sudo bash deploy/upgrade.sh            # 重新构建并重建
sudo bash deploy/upgrade.sh --no-build # 使用本地已有镜像
```

### 5.3 回滚

```bash
# 查看上一版是否存在
docker image ls | grep meal-reminder-server

# external
SERVER_IMAGE=meal-reminder-server:prev \
  docker compose -f deploy/docker-compose.server.yml up -d --force-recreate server

# caddy
docker tag meal-reminder-server:prev meal-reminder-server:prod
docker compose -f deploy/docker-compose.yml up -d --no-build --force-recreate server
```

数据库迁移默认只前进；回滚镜像前先确认新版本的迁移是否向后兼容。

### 5.4 修改配置

推荐用菜单，不需要手动翻 `.env`：

```bash
sudo bash deploy/config.sh          # 菜单：域名、SMTP、短信、mock、VAPID、人机验证、保留天数
bash deploy/config.sh --show        # 查看（敏感值只显示长度）
bash deploy/config.sh --set SMTP_HOST=smtp.example.com MAIL_DRY_RUN=false
bash deploy/config.sh --validate
```

本地 Windows 可用 `npm run config`（自动寻找 Git Bash）。修改后选菜单第 10 项重建 server，
或手动：

```bash
docker compose -f deploy/docker-compose.yml up -d --force-recreate server
```

注意：`restart` 不会重新读取环境变量，必须 `up -d --force-recreate server`。

### 5.5 一键再部署

在本地仓库根目录：

```bash
npm run redeploy                  # 构建 Web + 镜像，打包、上传、远程升级
npm run redeploy -- --skip-build  # 复用已有 web/dist 与 server-image.tar
npm run redeploy -- --git         # 服务器有源码：git pull + upgrade（caddy 拓扑）
npm run release                   # 只生成 release/meal-reminder-<版本>.tar.gz
```

远程模式需要在 `deploy/.env` 配置：

```ini
DEPLOY_HOST=你的服务器IP或域名
DEPLOY_USER=root
DEPLOY_PORT=22
DEPLOY_PATH=/opt/meal-reminder
DEPLOY_SSH_KEY=C:/Users/你/.ssh/你的密钥
```

发布包只含 `deploy/`、`web/dist`、`server-image.tar`、`VERSION`，不含 `.env` 与 `secrets/`，
不会覆盖服务器上的密钥。远程执行的是 `deploy/upgrade.sh --image-tar=server-image.tar`，
仍会先备份、保留上一版镜像并做健康检查。

## 6. 密钥轮换

| 密钥 | 影响 | 操作 |
|---|---|---|
| `JWT_SECRET` | 旧 access 立即失效；refresh 仍可用（库里只存哈希） | 改 `.env` → 重启 server |
| `MEMBER_TOKEN_ENC_KEY` | 已加密的 MemberToken 无法解密 | 改 `.env` → 重启 → 管理台重新录入并测试 |
| `POSTGRES_PASSWORD` | 容器连不上库 | 改 `.env`，并在库内执行 `ALTER USER meal WITH PASSWORD '新密码';`，再重启 |
| `WEBPUSH_*` | 旧浏览器订阅失效 | 改 `.env` → 重启 → 用户在设置页重新订阅 |
| 阿里云 AK | 短信失败 | 控制台换 AK → 改 `.env` → 重启 |
| 取餐柜 MemberToken | 查询 401 | 管理台重新粘贴 → 测试有效性 |

## 7. 数据保留

- `Reminder` / `ReminderEvent`：30 天
- `SmsLog` / `AuditLog`：90 天
- 过期的一次性令牌与 refresh 会话：7 天
- 每日 03:00 自动清理，天数由 `RETENTION_*` 控制

## 8. 排障

| 现象 | 先看什么 | 常见原因 |
|---|---|---|
| 502 / 504 | `compose logs server`、`nginx -t` | server 未就绪、端口不一致、迁移失败 |
| 容器反复重启 | `compose logs server` 首行 | `.env` 校验失败（密钥长度、空串） |
| 登录 429 | 服务端日志 | 同邮箱 5 次/10 分钟、同 IP 20 次/10 分钟限流 |
| 收不到邮件 | `MAIL_DRY_RUN`、SMTP 日志 | 授权码错误、端口/SSL 不匹配 |
| 短信失败 | 管理台短信流水 `errorCode` | 签名/模板未报备、余额、20 条/天限制 |
| ntfy 收不到 | `curl https://ntfy域名/v1/health` | 子域未解析、`NTFY_PUBLIC_URL` 错、客户端 topic 被重置 |
| 任务一直 WAITING | 管理台告警、`MEMBER_TOKEN` 状态 | 凭证过期（401）、取餐码/柜机码填错 |
| 开箱失败 | 任务事件流 | 订单号缺失、超过 24 小时窗口、超过 3 次 |
| 内存不足 / OOM | `docker stats`、`dmesg` | 服务器在跑构建；应在本地构建后上传镜像 |

## 9. 单实例与扩容

当前是单实例：进程内调度 + Postgres advisory lock，重启期间轮询会中断几十秒到几分钟。
用户量到数百或要求高可用时，把 `server/src/scheduler/` 换成 Redis/BullMQ 队列即可，其余模块不动（见 [decisions.md](decisions.md) D-11）。

## 10. 日志与告警

- 服务端日志：`compose logs -f server`（含引导码、调度轮次、通知结果）
- 管理员告警：管理台「告警」页；同时邮件给 ROOT
- 审计与短信流水：管理台可筛选并导出 CSV
- 建议给 `/api/health` 配外部监控（Uptime Kuma 等），失败时通知

## 11. 版本

- 版本号唯一来源：仓库根目录 `VERSION`
- 校验：`npm run version`
- 同步各端：`npm run version -- --write`
- 变更记录：[CHANGELOG.md](../CHANGELOG.md)
