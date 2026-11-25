#!/usr/bin/env bash
# deploy/ 下脚本共用的辅助函数。只做定义，不执行动作。

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
warn() { printf '[%s] 提醒：%s\n' "$(date '+%F %T')" "$*" >&2; }
die() {
  printf '[%s] 错误：%s\n' "$(date '+%F %T')" "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

# 读取 .env 中的键（不 source，避免值里的 < > 被 shell 解释）
# 值为空时回退到 fallback，便于 compose 里常见的 VAR= 空串场景
env_get() {
  local key="$1" fallback="${2:-}" line value
  if [ ! -f "$DEPLOY_DIR/.env" ]; then
    printf '%s' "$fallback"
    return 0
  fi
  line="$(grep -E "^[[:space:]]*${key}=" "$DEPLOY_DIR/.env" | tail -n 1 | tr -d '\r' || true)"
  if [ -z "$line" ]; then
    printf '%s' "$fallback"
    return 0
  fi
  value="${line#*=}"
  if [ -z "$value" ]; then
    printf '%s' "$fallback"
  else
    printf '%s' "$value"
  fi
}

sed_i() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

set_env() {
  local key="$1" value="$2"
  if grep -qE "^[[:space:]]*${key}=" "$DEPLOY_DIR/.env"; then
    sed_i "s|^[[:space:]]*${key}=.*|${key}=${value}|" "$DEPLOY_DIR/.env"
  else
    printf '%s=%s\n' "$key" "$value" >>"$DEPLOY_DIR/.env"
  fi
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    die "未找到 docker compose（需要 Docker Compose v2 或 docker-compose）"
  fi
}

# 按拓扑选择编排文件：caddy 用完整版，external 用服务器精简版
deploy_file() {
  local topology="${1:-$(env_get DEPLOY_TOPOLOGY caddy)}"
  if [ "$topology" = "external" ]; then
    printf 'docker-compose.server.yml'
  else
    printf 'docker-compose.yml'
  fi
}

wait_health() {
  local url="${1:-http://127.0.0.1:8787/api/health}" tries="${2:-60}"
  if ! command -v curl >/dev/null 2>&1; then
    warn "未安装 curl，跳过健康检查"
    return 0
  fi
  local i
  for i in $(seq 1 "$tries"); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      log "健康检查通过：$url"
      return 0
    fi
    sleep 2
  done
  warn "健康检查失败：$url（查看 compose logs server）"
  return 1
}

# caddy 拓扑没有对外暴露 8787，用容器内 node fetch 检查
wait_health_compose() {
  local file="$1" tries="${2:-60}" i
  for i in $(seq 1 "$tries"); do
    if compose -f "$file" exec -T server node -e \
      "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      log '健康检查通过（容器内 /api/health）'
      return 0
    fi
    sleep 2
  done
  warn '健康检查失败（查看 compose logs server）'
  return 1
}

detect_topology() {
  if docker ps --filter 'label=com.docker.compose.project=meal-reminder' --format '{{.Names}}' 2>/dev/null |
    grep -q 'caddy'; then
    printf 'caddy'
    return
  fi
  local busy=0
  if command -v ss >/dev/null 2>&1; then
    if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE ':(80|443)$'; then busy=1; fi
  elif command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:80 -sTCP:LISTEN -t >/dev/null 2>&1; then busy=1; fi
  fi
  if [ "$busy" = "1" ]; then printf 'external'; else printf 'caddy'; fi
}

gen_hex() { openssl rand -hex 32; }
gen_b64() { openssl rand -base64 32 | tr -d '\n'; }
gen_password() { openssl rand -base64 24 | tr -d '\n/+='; }

# 按 .env 渲染 nginx 模板到 <deploy>/nginx/generated
render_nginx_configs() {
  local dir="${1:-$DEPLOY_DIR}" d nd sr nsr cd ap np out
  d="$(env_get DOMAIN)"
  nd="$(env_get NTFY_DOMAIN)"
  sr="$(env_get STATIC_ROOT "/var/www/$d/dist")"
  nsr="$(env_get NTFY_STATIC_ROOT "/var/www/$nd")"
  cd="$(env_get CERT_DIR '/etc/letsencrypt/live')"
  ap="$(env_get API_PORT 8787)"
  np="$(env_get NTFY_PORT 8081)"
  out="$dir/nginx/generated"
  mkdir -p "$out"
  sed -e "s|{{DOMAIN}}|$d|g" -e "s|{{NTFY_DOMAIN}}|$nd|g" \
    -e "s|{{STATIC_ROOT}}|$sr|g" -e "s|{{NTFY_STATIC_ROOT}}|$nsr|g" \
    -e "s|{{CERT_DIR}}|$cd|g" -e "s|{{API_PORT}}|$ap|g" -e "s|{{NTFY_PORT}}|$np|g" \
    "$dir/nginx/app.conf.tpl" >"$out/$d.conf"
  sed -e "s|{{DOMAIN}}|$d|g" -e "s|{{NTFY_DOMAIN}}|$nd|g" \
    -e "s|{{STATIC_ROOT}}|$sr|g" -e "s|{{NTFY_STATIC_ROOT}}|$nsr|g" \
    -e "s|{{CERT_DIR}}|$cd|g" -e "s|{{API_PORT}}|$ap|g" -e "s|{{NTFY_PORT}}|$np|g" \
    "$dir/nginx/ntfy.conf.tpl" >"$out/$nd.conf"
  log "已生成 nginx 配置：$out"
}
