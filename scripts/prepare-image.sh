#!/usr/bin/env bash
# 构建镜像前的准备工作（宿主机执行，需要联网）：
#   1. 编译 TypeScript → dist
#   2. 安装生产依赖 → .image-deps/node_modules（含 prisma CLI）
#   3. 生成 Prisma 客户端（含 linux-musl 引擎）→ .prisma-generated
#
# 之后 docker build 不需要任何网络。
set -euo pipefail
cd "$(dirname "$0")/../server"

echo '1/3 编译 TypeScript'
npm run build

echo '2/3 安装生产依赖'
rm -rf .image-deps
mkdir -p .image-deps
cp package.json package-lock.json .npmrc .image-deps/
( cd .image-deps && npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm install --no-save --omit=dev prisma@6 --ignore-scripts --no-audit --no-fund )

echo '3/3 生成 Prisma 客户端与 linux-musl 引擎'
PRISMA_ENGINES_MIRROR="${PRISMA_ENGINES_MIRROR:-https://registry.npmmirror.com/-/binary/prisma}" \
  npx prisma generate
rm -rf .prisma-generated
mkdir -p .prisma-generated/engines
cp -r node_modules/.prisma/client .prisma-generated/client

VERSION="$(node -e "console.log(require('./node_modules/@prisma/engines-version').enginesVersion)")"
URL="${PRISMA_ENGINES_MIRROR:-https://registry.npmmirror.com/-/binary/prisma}/all_commits/$VERSION/linux-musl-openssl-3.0.x/schema-engine.gz"
echo "    下载 schema engine（$VERSION）"
curl -fsSL "$URL" | gunzip > .prisma-generated/engines/schema-engine-linux-musl-openssl-3.0.x
chmod +x .prisma-generated/engines/schema-engine-linux-musl-openssl-3.0.x

echo '完成：可以执行 docker build'
