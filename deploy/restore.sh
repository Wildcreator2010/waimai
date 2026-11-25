#!/usr/bin/env bash
# 从备份恢复数据库。默认会停止 server、覆盖现有数据、恢复后重启。
#
#   sudo bash deploy/restore.sh backups/meal-20261125-040000.sql.gz
#   sudo bash deploy/restore.sh 备份文件 --yes --no-stop
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
. "$SCRIPT_DIR/_common.sh"
cd "$DEPLOY_DIR"

FILE=""
YES=0
NO_STOP=0
for arg in "$@"; do
  case "$arg" in
    --yes | -y) YES=1 ;;
    --no-stop) NO_STOP=1 ;;
    -h | --help)
      sed -n '2,6p' "$SCRIPT_DIR/restore.sh"
      exit 0
      ;;
    -*)
      die "未知参数：$arg"
      ;;
    *)
      FILE="$arg"
      ;;
  esac
done

[ -n "$FILE" ] || die '用法：bash deploy/restore.sh <backup.sql.gz> [--yes]'
[ -f "$FILE" ] || die "找不到备份文件：$FILE"
gzip -t "$FILE" 2>/dev/null || die "不是有效的 gzip 文件：$FILE"
[ -f .env ] || die '缺少 deploy/.env'
require_cmd docker

topology="$(env_get DEPLOY_TOPOLOGY caddy)"
compose_file="$(deploy_file "$topology")"
db_user="$(env_get POSTGRES_USER meal)"
db_name="$(env_get POSTGRES_DB meal)"

warn "即将用 $FILE 覆盖数据库 $db_name，当前数据会丢失。"
if [ "$YES" != "1" ]; then
  [ -t 0 ] || die '非交互环境请加 --yes'
  read -r -p '输入 restore 确认：' answer
  [ "$answer" = "restore" ] || die '已取消'
fi

if [ "$NO_STOP" = "0" ]; then
  log '停止 server（避免恢复期间写入）'
  compose -f "$compose_file" stop server
fi

log '恢复数据库'
if ! gunzip -c "$FILE" | compose -f "$compose_file" exec -T db \
  psql -U "$db_user" -d "$db_name" -v ON_ERROR_STOP=1; then
  warn '恢复失败，尝试重新启动 server'
  if [ "$NO_STOP" = "0" ]; then compose -f "$compose_file" start server || true; fi
  exit 1
fi

if [ "$NO_STOP" = "0" ]; then
  log '启动 server'
  compose -f "$compose_file" start server
  wait_health "http://127.0.0.1:$(env_get API_PORT 8787)/api/health" || warn '恢复完成但健康检查未通过，请查看日志'
fi

log '恢复完成'
