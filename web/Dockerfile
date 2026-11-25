# 取餐提醒 · Web 镜像
# 国内网络拉不到 Docker Hub 时，用镜像加速地址覆盖：
#   docker build --build-arg NODE_IMAGE=... --build-arg NGINX_IMAGE=... .
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM ${NGINX_IMAGE} AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
