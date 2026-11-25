# 取餐提醒 · 服务端镜像
#
# 说明：构建容器所在网络可能无法访问 npm / Prisma 引擎源（实测容器内 TCP 出网被拦），
# 因此依赖与 Prisma 产物全部在宿主机准备，镜像内只做拷贝，不再联网安装。
#
# 构建前先执行（在仓库根目录）：
#   bash scripts/prepare-image.sh
# 然后：
#   docker build --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine \
#     -t meal-reminder-server:prod server
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

# 不执行 apk（构建环境无外网）：基础镜像已含 node，健康检查改用 node 自带 fetch。
# 时区只影响日志时间戳，业务时间计算全部是绝对时间（UTC 毫秒），不受影响。
ENV TZ=Asia/Shanghai

# 生产依赖（宿主机 npm ci --omit=dev 产物，含 prisma CLI 用于启动时 migrate deploy）
COPY .image-deps/node_modules ./node_modules

# Prisma 客户端与 linux-musl 引擎（宿主机生成）
COPY .prisma-generated/client ./node_modules/.prisma/client
COPY .prisma-generated/engines/ ./node_modules/@prisma/engines/

# 清掉宿主机平台的二进制，减小体积
RUN rm -f node_modules/.prisma/client/*.dll.node \
 && rm -f node_modules/@prisma/engines/*.exe \
 && chmod +x node_modules/@prisma/engines/schema-engine-linux-musl-openssl-3.0.x

COPY dist ./dist
COPY prisma ./prisma
COPY package.json ./

RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
