# 自托管：从零复刻一套

本文假设你拿到的是这个仓库的一份拷贝，目标是在自己的服务器上跑起完整服务。
所有示例域名都使用 `meal.example.com` / `ntfy.meal.example.com`，替换成你自己的即可。

## 最快路径（一行命令）

服务器已安装 Docker 与 git 时：

```bash
curl -fsSL https://raw.githubusercontent.com/Wildcreator2010/waimai/master/deploy/quickstart.sh \
  | sudo bash -s -- --domain=meal.example.com
```

等价于「克隆仓库 + 生成密钥 + 构建镜像 + 启动 + 健康检查」，最后打印初始化引导码。
需要自定义拓扑或已有镜像时，把参数继续往后传，例如：

```bash
curl -fsSL .../quickstart.sh | sudo bash -s -- \
  --domain=meal.example.com --topology=external --image-tar=server-image.tar
```

## 0. 你需要准备

| 项 | 说明 |
|---|---|
| 服务器 | 1 核 2G 起，Linux，安装 Docker 与 Docker Compose v2 |
| 域名 | 两条 A 记录：主域 + `ntfy.` 子域（ntfy 不支持子路径，必须独立主机名） |
| 端口 | 80 / 443。若已被宝塔等 nginx 占用，走「方式 B」 |
| 可选凭据 | SMTP、阿里云短信 AK/签名/模板、Firebase 服务账号 |

服务器只需要 Docker 与 git；下面的 `npm run ...` 是可选的本机辅助命令，需要 Node.js >= 20（`npm run doctor` 会检查）。
Windows 上执行离线镜像构建（`npm run image`）需要 Git Bash 或 WSL；默认的联网多阶段构建使用 `server/Dockerfile.online`，不需要本机 Node。

## 1. 拿到代码并自检

```bash
git clone <你的仓库地址> meal-reminder
cd meal-reminder
npm run doctor
```

`doctor` 只检查不修改：Node、Docker、依赖、端口、环境文件。

## 2. 方式 A：Caddy 全自动（推荐新服务器）

适用于 80/443 空闲、希望自动 HTTPS 的机器。

```bash
# 1) 生成 deploy/.env（自动创建数据库密码、JWT、MemberToken 密钥、VAPID）
npm run env:init -- --domain=meal.example.com

# 2) 按需填写 SMTP / 阿里云 / FCM（不填也能以 dry-run 模式启动）
npm run config          # 菜单式修改，密钥输入有掩码
# 或直接编辑：$EDITOR deploy/.env

# 3) 校验配置
npm run deploy:check

# 4) 安装（构建镜像 + 启动 db/ntfy/server/web/caddy + 健康检查）
sudo bash deploy/install.sh
```

安装完成后会打印一次性引导码。打开 `https://meal.example.com/setup` 创建 ROOT。

国内网络拉不到 Docker Hub 时，在 `.env` 里把 `NODE_IMAGE` / `NGINX_IMAGE` / `POSTGRES_IMAGE` / `CADDY_IMAGE` 换成镜像加速地址（模板里有示例）。

## 3. 方式 B：已有 nginx / 宝塔

适用于 80/443 已被占用、或你希望复用现有 nginx 与证书的机器。

**在本地构建并打包：**

```bash
npm run env:init -- --domain=meal.example.com --topology=external
npm --prefix web run build          # 产出 web/dist
npm run image                       # 产出 server-image.tar
```

**上传到服务器：**

```bash
# 仓库（至少包含 deploy/ 与 web/dist）放到 /opt/meal-reminder
scp server-image.tar user@server:/opt/meal-reminder/
```

**在服务器安装：**

```bash
cd /opt/meal-reminder
sudo bash deploy/install.sh --domain=meal.example.com --topology=external --image-tar=server-image.tar
```

脚本会：

1. 校验/补齐 `.env` 密钥
2. `docker load` 镜像并启动 db/ntfy/server（只监听 `127.0.0.1`）
3. 把 `web/dist` 同步到 `STATIC_ROOT`
4. 按 `.env` 渲染 `deploy/nginx/generated/*.conf`，复制到 `NGINX_CONF_DIR` 并 `nginx -t && nginx -s reload`
5. 打印引导码

证书不在脚本职责内：请用宝塔面板或 acme.sh 为两个域名签发证书，并确保 `CERT_DIR/<域名>/fullchain.pem`、`privkey.pem` 存在。

相关路径都在 `.env` 里：

```ini
NGINX_CONF_DIR=/etc/nginx/conf.d
STATIC_ROOT=/var/www/meal.example.com/dist
NTFY_STATIC_ROOT=/var/www/ntfy.meal.example.com
CERT_DIR=/etc/letsencrypt/live
API_PORT=8787
NTFY_PORT=8081
```

## 4. 首次初始化

1. 浏览器打开 `https://你的主域/setup`
2. 输入安装日志里的引导码（也可读 `server` 容器的 `/app/data/bootstrap-code.txt`）
3. 创建 ROOT 账号；成功后引导入口永久关闭
4. 管理台 → 邀请码 → 生成邀请码 → 注册普通用户

## 5. 让三端指向你的服务器

### Web

同源部署（nginx 反代 `/api`）无需配置。前后端不同源时：

```bash
VITE_API_BASE=https://你的域名/api npm --prefix web run build
```

### Android

运行时可改，无需重新编译：登录页底部「服务器：…（点击修改）」→ 输入 `https://你的域名` → 「保存并测试」。
编译期默认值在 `android/local.properties`：

```properties
API_BASE_URL=https://你的域名/
```

### 电脑版（Electron）

```bash
MEAL_APP_URL=https://你的域名 npm --prefix desktop start
```

或在首次运行的设置窗口里填写站点地址。

## 6. 可选通道

| 通道 | 配置 | 不配的后果 |
|---|---|---|
| SMTP | `SMTP_*`，`MAIL_DRY_RUN=false` | 验证码只打印在服务端日志 |
| 阿里云短信 | `ALIYUN_ACCESS_KEY_ID/SECRET`、`ALIYUN_SIGN_NAME`、两个模板 | 短信不发；手机号绑定不可用 |
| FCM | 服务账号放到 `deploy/secrets/firebase-service-account.json` | 全部设备走 ntfy |
| 浏览器 Web Push | `npm run env:init` 已生成 VAPID；也可 `npx web-push generate-vapid-keys` | 浏览器推送跳过 |
| 人机验证 | `CAPTCHA_PROVIDER=builtin`（默认）/ `turnstile` / `off` | 默认内置算术题 |

真实取餐柜：管理员登录 → 「取餐柜凭证」粘贴 MemberToken → 「测试有效性」→ 把 `.env` 的 `LOCKER_MOCK` 改为 `false` 并重启 server。

## 7. 验证

```bash
npm run deploy:check
node scripts/smoke.mjs --base=https://你的域名 --web=https://你的域名
```

再走一遍：注册 → 邮箱验证 → 登录 → 建任务 → 立即查询 → 命中通知 → 一键开箱。

## 8. 升级、备份、恢复

见 [operations.md](operations.md)。最短路径：

```bash
sudo bash deploy/backup.sh     # 手动备份
sudo bash deploy/upgrade.sh    # 备份 + 升级 + 健康检查
```

改完代码后，在本地仓库根目录：

```bash
npm run redeploy               # 构建 + 打包 + 上传 + 远程升级（需 DEPLOY_HOST）
npm run redeploy -- --git      # 服务器有源码时：git pull + upgrade
npm run release                # 只生成单文件发布包
```

远程模式需要在 `deploy/.env` 配置 `DEPLOY_HOST / DEPLOY_USER / DEPLOY_SSH_KEY / DEPLOY_PATH`。
发布包不含 `.env` 与 `secrets/`，不会覆盖服务器密钥。

## 9. 换品牌（可选）

品牌名已经做成配置项，不需要改源码：

```ini
# deploy/.env
APP_NAME=取餐提醒        # 服务端邮件标题、告警
VITE_APP_NAME=取餐提醒   # Web 页面标题、Logo 文案（install.sh 会自动同步 APP_NAME）
```

- Android 应用名 / 包名：`android/local.properties` 的 `APP_NAME` 与 `APP_APPLICATION_ID`
  （改包名后 FCM 的 `google-services.json` 必须重新生成；`namespace` 与 Kotlin 源码目录仍沿用 `com.wildcreator.mealreminder`）
- 默认站点地址：`android/local.properties` 的 `API_BASE_URL`，或运行期在登录页修改；
  桌面端用 `MEAL_APP_URL`，或首次运行在设置窗口里填
- 桌面端安装包名称：`desktop/electron-builder.yml` 的 `productName` / `appId`
- 短信签名与模板：阿里云控制台申请后填入 `.env`，不要复用他人的签名
- 取餐柜供应商：默认协议适配 `server/src/locker/locker.client.ts`，换供应商需同步调整接口路径与字段映射

## 10. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| install 自动选了 external 但没有镜像 | 80/443 被占用 | `npm run image` 后加 `--image-tar`，或显式 `--topology=caddy`（需先释放端口） |
| 502 | server 未就绪或端口不一致 | `compose logs server`；检查 `API_PORT` 与 nginx 配置一致 |
| ntfy 起不来 | `NTFY_BASE_URL` 带了子路径 | ntfy 不支持子路径，必须是独立主机名 |
| 收不到验证邮件 | `MAIL_DRY_RUN=true` 或 SMTP 未填 | 改 `.env` 后重启 server；dry-run 时链接在日志里 |
| 短信全跳过 | 单号码 20 条/天 | 查看管理台短信流水，属阿里云硬限制 |
| 域名换了但邮件链接还是旧的 | `APP_BASE_URL` 未更新 | 修改后重启 server |
