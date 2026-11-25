# 参与贡献

感谢你愿意改进项目。提交改动前，请先确认以下约定。

## 开发环境

需要 Node.js >= 20、Docker（用于开发数据库），可选 JDK 17 + Android SDK 35。

```bash
npm run env:init -- --mode=dev   # 生成 server/.env（含随机密钥）
npm --prefix server install
npm --prefix web install
npm run dev                      # Postgres(5433) + 迁移 + server + web
```

开发模式默认 `LOCKER_MOCK=true`、`MAIL_DRY_RUN=true`、`ALIYUN_DRY_RUN=true`，零外部凭据即可跑通完整链路。

## 提交前自检

```bash
npm run version        # 各端版本与 VERSION 一致
npm test               # 服务端单测
npm run build          # server + web 构建
npm run android:debug  # 改动 Android 时
```

涉及部署脚本时，额外执行：

```bash
bash -n deploy/*.sh
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.example config
```

## 约定

- **不要提交任何凭据**：`.env`、`deploy/secrets/`、`google-services.json`、keystore、真实域名/手机号/邮箱。
- 新增环境变量时，必须同步更新：`server/src/config/env.validation.ts`、`server/.env.example`、`deploy/.env.example`、两个 compose 文件的 `environment` 列表、README 的环境变量表。
- 数据库结构变更通过 `server/prisma/migrations/` 提交，不要只改 schema。
- 提交信息使用祈使句简述改动，例如 `fix: 修正 ntfy 公网地址回落逻辑`。
- 一个 PR 只做一件事；行为变更请补充或更新对应测试与文档。

## 许可

提交代码即表示同意以 [MIT License](LICENSE) 授权。
