#!/usr/bin/env bash
# 一键安装 / 重建（幂等）。
#
#   sudo bash deploy/install.sh --domain=meal.example.com
#   sudo bash deploy/install.sh --domain=meal.example.com --topology=external --image-tar=server-image.tar
#
# 参数：
#   --domain=NAME           主域名（首次安装必填）
#   --ntfy-domain=NAME      ntfy 子域，默认 ntfy.<主域>
#   --topology=auto|caddy|external   默认 auto：80/443 被占用则走已有 nginx
#   --image-tar=PATH        已有 nginx 拓扑下，先 docker load 的镜像归档
#   --no-build              caddy 拓扑下不重新构建镜像（使用本地已有镜像）
#   --skip-health           跳过健康检查（不推荐）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
. "$SCRIPT_DIR/_common.sh"
cd "$DEPLOY_DIR"

TOPOLOGY_ARG="auto"
DOMAIN_ARG=""
NTFY_DOMAIN_ARG=""
IMAGE_TAR=""
NO_BUILD=0
SKIP_HEALTH=0

for arg in "$@"; do
  case "$arg" in
    --domain=*) DOMAIN_ARG="${arg#*=}" ;;
    --ntfy-domain=*) NTFY_DOMAIN_ARG="${arg#*=}" ;;
    --topology=*) TOPOLOGY_ARG="${arg#*=}" ;;
    --image-tar=*) IMAGE_TAR="${arg#*=}" ;;
    --no-build) NO_BUILD=1 ;;
    --skip-health) SKIP_HEALTH=1 ;;
    -h | --help)
      sed -n '2,13p' "$SCRIPT_DIR/install.sh"
      exit 0
      ;;
    *) die "未知参数：$arg" ;;
  esac
done

# 导入镜像意味着不重新构建
if [ -n "$IMAGE_TAR" ]; then NO_BUILD=1; fi

require_cmd docker
docker info >/dev/null 2>&1 || die "Docker daemon 未运行"

# 允许把 server-image.tar 放在仓库根目录（deploy 的上一级）
if [ -n "$IMAGE_TAR" ] && [ ! -f "$IMAGE_TAR" ] && [ -f "$DEPLOY_DIR/../$IMAGE_TAR" ]; then
  IMAGE_TAR="$DEPLOY_DIR/../$IMAGE_TAR"
fi

# ------------------------------------------------------------------ 环境文件
if [ ! -f .env ]; then
  [ -f .env.example ] || die '缺少 deploy/.env.example'
  cp .env.example .env
  log '已从 .env.example 创建 deploy/.env'
fi
mkdir -p secrets

domain="${DOMAIN_ARG:-$(env_get DOMAIN)}"
old_domain="$(env_get DOMAIN)"
case "$domain" in
  "" | example.com | *.example.com)
    if [ -n "$DOMAIN_ARG" ]; then
      domain="$DOMAIN_ARG"
    elif [ -t 0 ]; then
      read -r -p '主域名（例如 meal.example.com）：' domain
    fi
    ;;
esac
[ -n "$domain" ] || die '缺少主域名：加 --domain=meal.example.com'
domain="${domain#https://}"
domain="${domain#http://}"
domain="${domain%%/*}"
case "$domain" in
  example.com | *.example.com) die '域名仍是 example.com，请换成真实域名' ;;
esac

ntfy_domain="${NTFY_DOMAIN_ARG:-$(env_get NTFY_DOMAIN)}"
case "$ntfy_domain" in
  "" | example.com | *.example.com) ntfy_domain="ntfy.$domain" ;;
esac

set_env DOMAIN "$domain"
set_env NTFY_DOMAIN "$ntfy_domain"
set_env APP_BASE_URL "https://$domain"
set_env NTFY_PUBLIC_URL "https://$ntfy_domain"
set_env NTFY_BASE_URL "https://$ntfy_domain"
set_env NTFY_SERVER_URL 'http://ntfy:80'
set_env STATIC_ROOT "$(env_get STATIC_ROOT "/var/www/$domain/dist")"
set_env NTFY_STATIC_ROOT "$(env_get NTFY_STATIC_ROOT "/var/www/$ntfy_domain")"
case "$(env_get STATIC_ROOT)" in *example.com*) set_env STATIC_ROOT "/var/www/$domain/dist" ;; esac
case "$(env_get NTFY_STATIC_ROOT)" in *example.com*) set_env NTFY_STATIC_ROOT "/var/www/$ntfy_domain" ;; esac
set_env CERT_DIR "$(env_get CERT_DIR '/etc/letsencrypt/live')"
set_env NGINX_CONF_DIR "$(env_get NGINX_CONF_DIR '/etc/nginx/conf.d')"
if [ -n "$DOMAIN_ARG" ] && [ "$old_domain" != "$domain" ]; then
  set_env STATIC_ROOT "/var/www/$domain/dist"
  set_env NTFY_STATIC_ROOT "/var/www/$ntfy_domain"
fi

# ------------------------------------------------------------------ 品牌
set_env APP_NAME "$(env_get APP_NAME 取餐提醒)"
case "$(env_get VITE_APP_NAME)" in
  "" | 取餐提醒) set_env VITE_APP_NAME "$(env_get APP_NAME 取餐提醒)" ;;
esac
case "$(env_get WEBPUSH_SUBJECT)" in
  "" | *example.com*) set_env WEBPUSH_SUBJECT "mailto:admin@$domain" ;;
esac

# ------------------------------------------------------------------ 密钥
jwt="$(env_get JWT_SECRET)"
need_openssl=0
case "$jwt" in "" | change-me*) need_openssl=1 ;; esac
if [ "${#jwt}" -lt 32 ]; then need_openssl=1; fi

enc="$(env_get MEMBER_TOKEN_ENC_KEY)"
if [ -z "$enc" ] || [ "${#enc}" -lt 44 ]; then need_openssl=1; fi

db_pw="$(env_get POSTGRES_PASSWORD)"
db_pw_changed=0
case "$db_pw" in "" | change-me*) db_pw_changed=1 ;; esac

if [ "$need_openssl" = "1" ] || [ "$db_pw_changed" = "1" ]; then
  require_cmd openssl
fi
if [ "$need_openssl" = "1" ]; then
  case "$jwt" in "" | change-me*) jwt="$(gen_hex)" ;; esac
  if [ "${#jwt}" -lt 32 ]; then jwt="$(gen_hex)"; fi
  set_env JWT_SECRET "$jwt"

  if [ -z "$enc" ] || [ "${#enc}" -lt 44 ]; then
    enc="$(gen_b64)"
    set_env MEMBER_TOKEN_ENC_KEY "$enc"
  fi
fi

if [ "$db_pw_changed" = "1" ]; then db_pw="$(gen_password)"; fi
set_env POSTGRES_PASSWORD "$db_pw"
set_env POSTGRES_USER "$(env_get POSTGRES_USER meal)"
set_env POSTGRES_DB "$(env_get POSTGRES_DB meal)"
if [ "$db_pw_changed" = "1" ] || [ -z "$(env_get DATABASE_URL)" ]; then
  set_env DATABASE_URL "postgresql://$(env_get POSTGRES_USER meal):$db_pw@db:5432/$(env_get POSTGRES_DB meal)"
fi

# 首次安装安全模式：没有对应凭据就不真发，避免注册验证邮件静默失败
if [ -z "$(env_get SMTP_USER)" ]; then set_env MAIL_DRY_RUN 'true'; fi
if [ -z "$(env_get ALIYUN_ACCESS_KEY_ID)" ]; then set_env ALIYUN_DRY_RUN 'true'; fi
if [ -z "$(env_get LOCKER_MOCK)" ]; then set_env LOCKER_MOCK 'true'; fi
chmod 600 .env

# ------------------------------------------------------------------ 拓扑
topology="$TOPOLOGY_ARG"
if [ "$topology" = "auto" ]; then topology="$(env_get DEPLOY_TOPOLOGY '')"; fi
if [ -z "$topology" ] || [ "$topology" = "auto" ]; then topology="$(detect_topology)"; fi
case "$topology" in
  caddy | external) ;;
  *) die '--topology 只能是 auto / caddy / external' ;;
esac
set_env DEPLOY_TOPOLOGY "$topology"
log "部署拓扑：$topology"

# 默认在线多阶段构建；如果 .env 仍指向离线 Dockerfile 但本机没有离线产物，自动切换
if [ "$topology" = "caddy" ] && [ "$NO_BUILD" = "0" ]; then
  dockerfile="$(env_get SERVER_DOCKERFILE Dockerfile.online)"
  if [ "$dockerfile" = "Dockerfile" ] && [ ! -d "$DEPLOY_DIR/../server/.image-deps/node_modules" ]; then
    warn '未检测到离线构建产物 server/.image-deps，自动改用 Dockerfile.online（需要联网）'
    set_env SERVER_DOCKERFILE Dockerfile.online
  fi
fi

server_image="$(env_get SERVER_IMAGE 'meal-reminder-server:prod')"
compose_file="$(deploy_file "$topology")"

if [ -n "$IMAGE_TAR" ]; then
  [ -f "$IMAGE_TAR" ] || die "找不到镜像归档：$IMAGE_TAR"
  log "导入镜像 $IMAGE_TAR"
  docker load -i "$IMAGE_TAR"
fi

if [ "$topology" = "external" ]; then
  docker image inspect "$server_image" >/dev/null 2>&1 ||
    die "本机没有镜像 $server_image。请先在本机构建并上传（npm run image），或加 --image-tar=server-image.tar"
elif [ "$NO_BUILD" = "1" ]; then
  docker image inspect "$server_image" >/dev/null 2>&1 ||
    die "本机没有镜像 $server_image，不能使用 --no-build。去掉该参数或先导入镜像"
  web_image="$(env_get WEB_IMAGE 'meal-reminder-web:prod')"
  docker image inspect "$web_image" >/dev/null 2>&1 ||
    die "本机没有前端镜像 $web_image，不能使用 --no-build。去掉该参数或先构建前端镜像"
fi

# ------------------------------------------------------------------ 启动
set_env SERVER_IMAGE "$server_image"
if [ "$topology" = "caddy" ]; then
  if [ "$NO_BUILD" = "1" ]; then
    log '启动容器（caddy 拓扑，不重新构建）'
    compose -f "$compose_file" up -d --no-build
  else
    log '构建并启动容器（caddy 拓扑）'
    compose -f "$compose_file" up -d --build
  fi
  if [ "$SKIP_HEALTH" = "0" ]; then wait_health_compose "$compose_file"; fi
else
  log '启动容器（已有 nginx / 宝塔拓扑）'
  compose -f "$compose_file" up -d
  if [ "$SKIP_HEALTH" = "0" ]; then
    wait_health "http://127.0.0.1:$(env_get API_PORT 8787)/api/health"
  fi

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
    warn "未找到 web/dist，跳过静态文件同步（可在本机构建后上传到 $static_root）"
  fi
fi

# ------------------------------------------------------------------ nginx 配置
if [ "$topology" = "external" ]; then
  render_nginx_configs "$DEPLOY_DIR"
  nginx_dir="$(env_get NGINX_CONF_DIR '/etc/nginx/conf.d')"
  if [ -d "$nginx_dir" ] && [ -w "$nginx_dir" ]; then
    cp "$DEPLOY_DIR/nginx/generated/$(env_get DOMAIN).conf" "$nginx_dir/"
    cp "$DEPLOY_DIR/nginx/generated/$(env_get NTFY_DOMAIN).conf" "$nginx_dir/"
    if command -v nginx >/dev/null 2>&1; then
      if nginx -t; then
        nginx -s reload || warn 'nginx reload 失败，请手动执行'
      else
        warn 'nginx -t 未通过，已保留配置文件但未 reload'
      fi
    else
      warn '未找到 nginx 命令，请手动 reload'
    fi
  else
    warn "未自动安装 nginx 配置（$nginx_dir 不存在或不可写）"
    warn "请手动复制 $DEPLOY_DIR/nginx/generated/*.conf 到 nginx vhost 目录并 reload"
  fi
fi

# ------------------------------------------------------------------ 引导码
if [ "$SKIP_HEALTH" = "0" ]; then
  code="$(env_get BOOTSTRAP_SETUP_CODE '')"
  if [ -z "$code" ]; then
    code="$(compose -f "$compose_file" exec -T server sh -c 'cat /app/data/bootstrap-code.txt 2>/dev/null' 2>/dev/null | tr -d '\r\n' || true)"
  fi
  if [ -z "$code" ]; then
    code="$(compose -f "$compose_file" logs server 2>/dev/null | grep -E '引导码' | tail -n 1 | sed 's/.*引导码[：:][[:space:]]*//' | tr -d '\r' || true)"
  fi
  echo
  if [ -n "$code" ]; then
    log "首次初始化引导码：$code"
  else
    log '未读到引导码（可能已初始化）。查看：compose logs server | grep 引导码'
  fi
fi

cat <<EOF

安装完成。
  主站      https://$(env_get DOMAIN)
  ntfy      https://$(env_get NTFY_DOMAIN)
  初始化    https://$(env_get DOMAIN)/setup（用引导码创建 ROOT）
  健康检查  curl -fsS https://$(env_get DOMAIN)/api/health

下一步：
  1. 用引导码创建 ROOT，然后生成邀请码
  2. 按需求配置 SMTP / 阿里云短信 / FCM，并把 .env 里的 dry-run 改成 false
  3. 在管理台录入 MemberToken，把 LOCKER_MOCK 改成 false
  4. npm run deploy:check / node scripts/smoke.mjs --base=https://$(env_get DOMAIN)
EOF
