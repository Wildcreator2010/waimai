#!/usr/bin/env bash
# 交互式编辑 deploy/.env（也可以非交互设置单个键）。
#
#   bash deploy/config.sh                 # 菜单
#   bash deploy/config.sh --show          # 查看当前配置（密钥掩码）
#   bash deploy/config.sh --validate      # 校验配置
#   bash deploy/config.sh --set KEY=VALUE  # 设置一个或多个键
#
# 修改后需要重建 server 容器才会加载新环境变量（菜单第 10 项）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
. "$SCRIPT_DIR/_common.sh"
cd "$DEPLOY_DIR"

require_env() {
  [ -f .env ] || die '缺少 deploy/.env。先执行 bash deploy/install.sh 或 npm run env:init -- --domain=你的域名'
}

mask() {
  printf '****（%s 字符）' "${#1}"
}

show_config() {
  require_env
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | '#'*) printf '%s\n' "$line" ;;
      *=*)
        key="${line%%=*}"
        value="${line#*=}"
        case "$key" in
          *PASS* | *SECRET* | *TOKEN* | *PASSWORD* | MEMBER_TOKEN_ENC_KEY | *PRIVATE_KEY*)
            if [ -n "$value" ]; then printf '%s=%s\n' "$key" "$(mask "$value")"; else printf '%s=\n' "$key"; fi
            ;;
          *) printf '%s\n' "$line" ;;
        esac
        ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < .env
  return 0
}

ask() {
  local key="$1" label="$2" current value
  current="$(env_get "$key")"
  if [ -n "$current" ]; then
    read -r -p "$label [$current]: " value || true
  else
    read -r -p "$label: " value || true
  fi
  if [ -n "$value" ]; then set_env "$key" "$value"; fi
}

ask_secret() {
  local key="$1" label="$2" current value
  current="$(env_get "$key")"
  if [ -n "$current" ]; then
    read -r -s -p "$label [已设置，回车保留，输入 - 清空]: " value || true
  else
    read -r -s -p "$label: " value || true
  fi
  printf '\n'
  if [ "$value" = "-" ]; then
    set_env "$key" ''
  elif [ -n "$value" ]; then
    set_env "$key" "$value"
  fi
}

ask_bool() {
  local key="$1" label="$2" fallback="$3" current value
  current="$(env_get "$key" "$fallback")"
  read -r -p "$label（true/false）[$current]: " value || true
  case "$value" in
    true | false) set_env "$key" "$value" ;;
    '') ;;
    *) warn "输入不是 true/false，保持 $current" ;;
  esac
}

ask_choice() {
  local key="$1" label="$2" choices="$3" fallback="${4:-}" current value
  current="$(env_get "$key" "$fallback")"
  read -r -p "$label（$choices）[$current]: " value || true
  [ -n "$value" ] || return 0
  case " $choices " in
    *" $value "*) set_env "$key" "$value" ;;
    *) warn "可选值：$choices，保持 $current" ;;
  esac
}

edit_domain() {
  local old new
  old="$(env_get DOMAIN)"
  ask DOMAIN '主域名'
  new="$(env_get DOMAIN)"
  ask NTFY_DOMAIN 'ntfy 子域'
  local ntfy
  ntfy="$(env_get NTFY_DOMAIN)"
  if [ -n "$new" ]; then
    set_env APP_BASE_URL "https://$new"
    set_env NTFY_PUBLIC_URL "https://$ntfy"
    set_env NTFY_BASE_URL "https://$ntfy"
  fi
  if [ -n "$old" ] && [ "$old" != "$new" ]; then
    warn '域名已变化：请确认 DNS、证书，以及 external 拓扑下的 STATIC_ROOT / NGINX_CONF_DIR'
  fi
  ask_choice DEPLOY_TOPOLOGY '部署拓扑' 'caddy external' 'caddy'
}

edit_smtp() {
  ask SMTP_HOST 'SMTP 主机'
  ask SMTP_PORT 'SMTP 端口'
  ask_bool SMTP_SECURE '使用 SSL/TLS' 'true'
  ask SMTP_USER 'SMTP 用户名'
  ask_secret SMTP_PASS 'SMTP 密码/授权码'
  ask SMTP_FROM '发件人'
  ask_bool MAIL_DRY_RUN '邮件 dry-run（true 只打日志）' 'true'
}

edit_sms() {
  ask ALIYUN_ACCESS_KEY_ID '阿里云 AccessKey ID'
  ask_secret ALIYUN_ACCESS_KEY_SECRET '阿里云 AccessKey Secret'
  ask ALIYUN_REGION '阿里云地域'
  ask ALIYUN_SIGN_NAME '短信签名'
  ask ALIYUN_TEMPLATE_ARRIVAL '到柜短信模板 CODE'
  ask ALIYUN_TEMPLATE_VERIFY '验证码短信模板 CODE'
  ask_bool ALIYUN_DRY_RUN '短信 dry-run（true 只打日志）' 'true'
}

edit_locker() {
  ask LOCKER_API_BASE '取餐柜接口地址'
  ask LOCKER_DEVICE_SN '默认设备 SN'
  ask_bool LOCKER_MOCK '取餐柜 mock（true 不查真实接口）' 'true'
  ask MOCK_ARRIVAL_AFTER 'mock 第几次查询模拟入柜'
}

edit_brand() {
  ask APP_NAME '服务端品牌名（邮件标题、告警）'
  ask VITE_APP_NAME 'Web 品牌名（页面标题、Logo）'
  if [ -z "$(env_get VITE_APP_NAME)" ]; then
    set_env VITE_APP_NAME "$(env_get APP_NAME 取餐提醒)"
  fi
  warn 'Web 品牌名在构建时注入：需重新执行 docker compose build web 并重建 web 容器'
}

edit_webpush() {
  ask WEBPUSH_PUBLIC_KEY 'VAPID 公钥'
  ask_secret WEBPUSH_PRIVATE_KEY 'VAPID 私钥'
  ask WEBPUSH_SUBJECT 'VAPID subject（mailto:...）'
}

edit_captcha() {
  ask_choice CAPTCHA_PROVIDER '人机验证方式' 'builtin turnstile off' 'builtin'
  ask TURNSTILE_SITE_KEY 'Turnstile Site Key'
  ask_secret TURNSTILE_SECRET 'Turnstile Secret'
}

edit_retention() {
  ask RETENTION_REMINDER_DAYS '任务与事件保留天数'
  ask RETENTION_AUDIT_DAYS '短信与审计保留天数'
}

edit_remote() {
  ask DEPLOY_HOST '远程服务器地址（留空则只打包，不上传）'
  ask DEPLOY_USER 'SSH 用户'
  ask DEPLOY_PORT 'SSH 端口'
  ask DEPLOY_PATH '服务器部署目录'
  ask DEPLOY_SSH_KEY 'SSH 私钥路径（留空使用默认密钥）'
}

validate_config() {
  require_env
  local failed=0 domain jwt enc db
  if command -v node >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/../scripts/check-env.mjs" ]; then
    node "$SCRIPT_DIR/../scripts/check-env.mjs" "$DEPLOY_DIR/.env" || failed=1
  else
    domain="$(env_get DOMAIN)"
    jwt="$(env_get JWT_SECRET)"
    enc="$(env_get MEMBER_TOKEN_ENC_KEY)"
    db="$(env_get DATABASE_URL)"
    case "$domain" in '' | example.com | *.example.com) warn 'DOMAIN 未填写或仍是 example.com'; failed=1 ;; *) log "DOMAIN=$domain" ;; esac
    if [ "${#jwt}" -lt 32 ]; then warn 'JWT_SECRET 少于 32 字符'; failed=1; else log 'JWT_SECRET 长度正常'; fi
    if [ "${#enc}" -lt 44 ]; then warn 'MEMBER_TOKEN_ENC_KEY 不是 32 字节 base64'; failed=1; else log 'MEMBER_TOKEN_ENC_KEY 长度正常'; fi
    if [ -z "$db" ]; then warn 'DATABASE_URL 未填写'; failed=1; else log 'DATABASE_URL 已填写'; fi
  fi
  if [ "$failed" = "1" ]; then
    warn '存在必须修复的项'
    return 1
  fi
  log '配置看起来可用'
}

restart_server() {
  local topology file answer
  topology="$(env_get DEPLOY_TOPOLOGY caddy)"
  file="$(deploy_file "$topology")"
  if [ ! -t 0 ]; then
    warn '非交互模式，跳过重建。请手动执行：compose -f '"$file"' up -d --force-recreate server'
    return 0
  fi
  read -r -p "重建 server 容器以加载新配置？输入 yes 确认：" answer || true
  [ "$answer" = "yes" ] || { log '已取消'; return 0; }
  compose -f "$file" up -d --force-recreate server
  if [ "$topology" = "external" ]; then
    wait_health "http://127.0.0.1:$(env_get API_PORT 8787)/api/health" || true
  else
    wait_health_compose "$file" || true
  fi
}

main_menu() {
  require_env
  local choice
  while true; do
    cat <<'EOF'

========== 取餐提醒 · 配置编辑 ==========
  1) 域名与部署拓扑
  2) SMTP 邮件
  3) 阿里云短信
  4) 取餐柜与 mock
  5) 浏览器 Web Push
  6) 人机验证
  7) 数据保留
  8) 远程再部署（DEPLOY_HOST 等）
  9) 校验配置
 10) 重建 server 加载配置
 11) 品牌名称（APP_NAME / VITE_APP_NAME）
  0) 退出
==========================================
EOF
    if ! read -r -p '选择: ' choice; then printf '\n'; return 0; fi
    case "$choice" in
      1) edit_domain ;;
      2) edit_smtp ;;
      3) edit_sms ;;
      4) edit_locker ;;
      5) edit_webpush ;;
      6) edit_captcha ;;
      7) edit_retention ;;
      8) edit_remote ;;
      9) validate_config || true ;;
      10) restart_server ;;
      11) edit_brand ;;
      0 | q | Q) return 0 ;;
      *) warn '无效选择' ;;
    esac
    chmod 600 .env 2>/dev/null || true
    echo
  done
}

case "${1:-}" in
  --show)
    show_config
    ;;
  --validate)
    validate_config
    ;;
  --set)
    shift
    require_env
    [ "$#" -gt 0 ] || die '用法：config.sh --set KEY=VALUE [KEY=VALUE ...]'
    for pair in "$@"; do
      key="${pair%%=*}"
      value="${pair#*=}"
      if [ "$key" = "$pair" ] || ! printf '%s' "$key" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*$'; then
        die "格式应为 KEY=VALUE：$pair"
      fi
      set_env "$key" "$value"
      log "已设置 $key"
    done
    chmod 600 .env 2>/dev/null || true
    ;;
  -h | --help)
    sed -n '2,12p' "$SCRIPT_DIR/config.sh"
    ;;
  '')
    main_menu
    ;;
  *)
    die "未知参数：$1"
    ;;
esac
