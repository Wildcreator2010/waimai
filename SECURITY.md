# 安全说明

## 报告漏洞

请通过 GitHub 仓库的 **Security → Advisories → Report a vulnerability** 私密报告，不要公开发 Issue。

报告时请提供：

- 受影响的版本或提交
- 最小复现步骤
- 影响范围（是否能读取他人数据、绕过鉴权、写入磁盘等）

## 支持范围

仅最新发布版本接收安全修复。自托管部署请保持 `deploy/.env` 中的依赖镜像为受支持的大版本。

## 部署安全清单

- `JWT_SECRET`、`MEMBER_TOKEN_ENC_KEY`、`POSTGRES_PASSWORD` 必须由 `npm run env:init` 或 `deploy/install.sh` 生成，不要使用示例值。
- `deploy/.env`、`deploy/secrets/`、`android/local.properties`、`google-services.json` 不得提交到任何仓库。
- 取餐柜 `MemberToken` 只在管理台录入，服务端以 AES-256-GCM 加密存储。
- 公网部署必须启用 HTTPS；ntfy 也必须使用独立域名的 HTTPS 地址。
- 阿里云 AccessKey 使用仅授予短信权限的 RAM 子账号。
- 怀疑泄露时：轮换短信 AK、重新生成 `JWT_SECRET`（所有用户重新登录）、重新生成 `MEMBER_TOKEN_ENC_KEY` 并重新录入 MemberToken。

## 不在范围内

- 依赖第三方服务（取餐柜接口、ntfy、阿里云短信、FCM/浏览器推送）自身的故障与限制。
- 未按本文档启用 HTTPS、或把管理端口直接暴露到公网导致的配置问题。
