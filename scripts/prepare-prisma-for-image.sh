#!/usr/bin/env bash
# 为 Docker 镜像准备 Prisma 客户端与 linux-musl 引擎。
#
# 背景：构建容器所在网络可能连不上 Prisma 引擎源，导致 `prisma generate` 失败。
# 本脚本在宿主机生成好产物，Dockerfile 直接 COPY 进镜像。
#
# 用法：bash scripts/prepare-prisma-for-image.sh
set -euo pipefail

cd "$(dirname "$0")/../server"

MIRROR="${PRISMA_ENGINES_MIRROR:-https://registry.npmmirror.com/-/binary/prisma}"
echo "使用引擎镜像：$MIRROR"

echo '1) 生成 Prisma 客户端（含 linux-musl 查询引擎）'
PRISMA_ENGINES_MIRROR="$MIRROR" npx prisma generate

echo '2) 复制客户端到构建上下文'
rm -rf .prisma-generated
mkdir -p .prisma-generated/engines
cp -r node_modules/.prisma/client .prisma-generated/client

echo '3) 下载 linux-musl schema 引擎（容器内 prisma migrate deploy 需要）'
# 从已生成客户端的 enginesVersion 推断提交哈希
VERSION="$(node -e "console.log(require('./node_modules/@prisma/engines-version').enginesVersion)")"
URL="$MIRROR/all_commits/$VERSION/linux-musl-openssl-3.0.x/schema-engine.gz"
echo "   引擎版本：$VERSION"
curl -fsSL "$URL" -o /tmp/schema-engine.gz
gunzip -c /tmp/schema-engine.gz > .prisma-generated/engines/schema-engine-linux-musl-openssl-3.0.x
chmod +x .prisma-generated/engines/schema-engine-linux-musl-openssl-3.0.x
rm -f /tmp/schema-engine.gz

echo '4) 完成'
du -sh .prisma-generated
