#!/usr/bin/env bash
# 升级 / 回滚准备。默认先备份数据库，再替换镜像并重建 server。
#
#   sudo bash deploy/upgrade.sh
#   sudo bash deploy/upgrade.sh --image-tar=server-image.tar --no-build
#   sudo bash deploy/upgrade.sh --no-backup
#
# 参数：
#   --image-tar=PATH   导入新镜像（已有 nginx 拓扑必需，除非本地已构建）
#   --no-build         caddy 拓扑下不重新构建，使用本地镜像
#   --no-backup        跳过升级前备份（不推荐）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
. "$SCRIPT_DIR/_common.sh"
cd "$DEPLOY_DIR"

IMAGE_TAR=""
NO_BUILD=0
NO_BACKUP=0
for arg in "$@"; do
  case "$arg" in
    --image-tar=*) IMAGE_TAR="${arg#*=}" ;;
    --no-build) NO_BUILD=1 ;;
    --no-backup) NO_BACKUP=1 ;;
    -h | --help)
      sed -n '2,12p' "$SCRIPT_DIR/upgrade.sh"
      exit 0
      ;;
    *) die "未知参数：$arg" ;;
  esac
done

[ -f .env ] || die '缺少 deploy/.env，先执行 bash deploy/install.sh'
require_cmd docker
docker info >/dev/null 2>&1 || die 'Docker daemon 未运行'

# 允许把 server-image.tar 放在仓库根目录（deploy 的上一级）
if [ -n "$IMAGE_TAR" ] && [ ! -f "$IMAGE_TAR" ] && [ -f "$DEPLOY_DIR/../$IMAGE_TAR" ]; then
  IMAGE_TAR="$DEPLOY_DIR/../$IMAGE_TAR"
fi

topology="$(env_get DEPLOY_TOPOLOGY caddy)"
compose_file="$(deploy_file "$topology")"
server_image="$(env_get SERVER_IMAGE 'meal-reminder-server:prod')"
repo="${server_image%:*}"
prev_image="${repo}:prev"

if [ "$NO_BACKUP" = "0" ]; then
  log '升级前备份数据库'
  bash "$SCRIPT_DIR/backup.sh"
else
  warn '已跳过升级前备份（--no-backup）'
fi

# 保留上一版镜像，失败时可直接回滚
if docker image inspect "$server_image" >/dev/null 2>&1; then
  docker tag "$server_image" "$prev_image"
  log "已标记上一版镜像：$prev_image"
fi

if [ -n "$IMAGE_TAR" ]; then
  [ -f "$IMAGE_TAR" ] || die "找不到镜像归档：$IMAGE_TAR"
  log "导入新镜像：$IMAGE_TAR"
  docker load -i "$IMAGE_TAR"
fi

rollback_hint() {
  warn '升级失败，可回滚：'
  if docker image inspect "$prev_image" >/dev/null 2>&1; then
    warn "  SERVER_IMAGE=$prev_image docker compose -f $compose_file up -d --force-recreate server"
  else
    warn '  没有上一版镜像，无法自动回滚；请检查日志后修复'
  fi
}

if [ "$topology" = "caddy" ]; then
  if [ "$NO_BUILD" = "1" ] || [ -n "$IMAGE_TAR" ]; then
    log '重建容器（caddy 拓扑，不重新构建）'
    compose -f "$compose_file" up -d --no-build --force-recreate server
  else
    log '重新构建并重建容器（caddy 拓扑）'
    compose -f "$compose_file" up -d --build --force-recreate server
  fi
  wait_health_compose "$compose_file" || { rollback_hint; exit 1; }
else
  docker image inspect "$server_image" >/dev/null 2>&1 || die "本机没有镜像 $server_image，请先 npm run image 并上传，或加 --image-tar"
  log '重建 server 容器（已有 nginx / 宝塔拓扑）'
  compose -f "$compose_file" up -d --force-recreate server
  wait_health "http://127.0.0.1:$(env_get API_PORT 8787)/api/health" || { rollback_hint; exit 1; }

  # 静态文件：有 web/dist 就同步
  web_dist="$DEPLOY_DIR/../web/dist"
  static_root="$(env_get STATIC_ROOT)"
  case "$static_root" in "" | "/" | "/www" | "/www/wwwroot") die "STATIC_ROOT 不安全：$static_root" ;; esac
  if [ -d "$web_dist" ]; then
    mkdir -p "$static_root"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete "$web_dist/" "$static_root/"
    else
      cp -a "$web_dist"/. "$static_root"/
    fi
    log "已同步 Web 静态文件到 $static_root"
  else
    warn "未找到 web/dist，跳过静态文件同步"
  fi

  # nginx 配置重新渲染并 reload
  render_nginx_configs "$DEPLOY_DIR"
  nginx_dir="$(env_get NGINX_CONF_DIR '/etc/nginx/conf.d')"
  if [ -d "$nginx_dir" ] && [ -w "$nginx_dir" ]; then
    cp "$DEPLOY_DIR/nginx/generated/$(env_get DOMAIN).conf" "$nginx_dir/"
    cp "$DEPLOY_DIR/nginx/generated/$(env_get NTFY_DOMAIN).conf" "$nginx_dir/"
    if command -v nginx >/dev/null 2>&1 && nginx -t; then nginx -s reload || warn 'nginx reload 失败'; fi
  else
    warn "未自动安装 nginx 配置（$nginx_dir 不存在或不可写）"
  fi
fi

log '升级完成'
