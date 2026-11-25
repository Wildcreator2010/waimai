# 变更记录

版本号以仓库根目录 [VERSION](VERSION) 为唯一来源；`npm run version` 校验各端版本是否一致。

## 未发布

### 开源与可复用

- 仓库改为 MIT License，新增 `LICENSE`、`SECURITY.md`、`CONTRIBUTING.md`。
- 品牌名可配置：服务端 `APP_NAME`、Web `VITE_APP_NAME`、Android `APP_NAME` / `APP_APPLICATION_ID`。
- 补齐 compose 中缺失的 `FIREBASE_SERVICE_ACCOUNT_JSON`，并将 `APP_NAME` / `VITE_APP_NAME` 传入容器与 Web 构建。
- 默认使用联网多阶段构建 `Dockerfile.online`，新增 `deploy/quickstart.sh` 一行命令部署。
- 新增 `Dockerfile.online.dockerignore` / `Dockerfile.dockerignore`，缩短镜像构建上下文。
- 移除仅面向作者的 `docs/what-i-need.md`，换品牌与供应商适配说明并入 `docs/self-hosting.md`。

### 配置与再部署

- 新增 `deploy/config.sh`：菜单式修改 `.env`，支持 `--show`（密钥只显示长度）、`--set KEY=VALUE`、`--validate` 与重建 server。
- 新增 `npm run config`：Windows 自动寻找 Git Bash，跨平台调用配置菜单。
- 新增 `npm run release`：构建 Web 与服务端镜像，生成单文件发布包 `release/meal-reminder-<版本>.tar.gz`。
- 新增 `npm run redeploy`：读取 `DEPLOY_HOST/DEPLOY_USER/DEPLOY_SSH_KEY/DEPLOY_PATH`，一键上传并远程执行 `upgrade.sh`；支持 `--skip-build`、`--git`、`--local`。
- 发布包只含 `deploy/`、`web/dist`、`server-image.tar`、`VERSION`，不含 `.env` 与 `secrets/`。

## 1.0.0 — 2026-11-25

### 可复用与再部署

- 新增根目录统一命令入口（`npm run doctor / env:init / dev / build / test / image / smoke`）。
- 新增 `scripts/gen-env.mjs`：生成 `deploy/.env` 或 `server/.env`，自动创建数据库密码、JWT 密钥、MemberToken 加密密钥与 VAPID 密钥，已有文件默认不覆盖。
- 新增 `scripts/render-deploy.mjs` 与 `deploy/nginx/*.conf.tpl`：按 `.env` 渲染主站与 ntfy 的 nginx 配置，不再依赖个人域名。
- 新增 `deploy/install.sh`、`upgrade.sh`、`backup.sh`、`restore.sh`：自动识别 Caddy 与「已有 nginx/宝塔」两种拓扑；`backup-db.sh` 保留为兼容入口。
- 新增 `docs/self-hosting.md`（从零复刻）与 `docs/operations.md`（升级、回滚、备份、恢复、密钥轮换、排障）。
- compose 参数化镜像名与 Dockerfile，补齐 Web Push / 人机验证 / 邮件令牌等环境变量。
- 新增 `server/Dockerfile.online`：可联网环境下的多阶段构建；离线构建流程保持不变。
- 新增 GitHub Actions CI：服务端单测与构建、Web 构建、Android debug 构建、服务端镜像构建。

### 版本与质量

- 建立 `VERSION` 单一版本源与 `CHANGELOG.md`。
- 新增 `scripts/doctor.mjs` 本机环境自检与 `scripts/smoke.mjs` 部署后冒烟检查。
- `server/.env.example` 的本地数据库地址改为与 `deploy/docker-compose.dev.yml` 一致的 `127.0.0.1:5433/meal_test`。

## 0.9.x — 2026-11-11 至 2026-11-24

线上功能基线：注册/登录/邀请码、提醒任务状态机、FCM / ntfy / Web Push / 阿里云短信四通道、一键开箱、MemberToken 加密、管理台、Android 与 Electron 客户端、宝塔 nginx 部署与每日备份。
