#!/usr/bin/env bash
# 数据库备份：pg_dump → gzip → 完整性校验 → 清理过期文件。
#
#   sudo bash deploy/backup.sh
#   BACKUP_DIR=/data/backups KEEP_DAYS=14 bash deploy/backup.sh
#
# cron 示例（每日 04:00）：
#   0 4 * * * cd /opt/meal-reminder && bash deploy/backup.sh >> /var/log/meal-reminder-backup.log 2>&1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_common.sh
. "$SCRIPT_DIR/_common.sh"
cd "$DEPLOY_DIR"

[ -f .env ] || die '缺少 deploy/.env'
require_cmd docker

topology="$(env_get DEPLOY_TOPOLOGY caddy)"
compose_file="$(deploy_file "$topology")"
db_user="$(env_get POSTGRES_USER meal)"
db_name="$(env_get POSTGRES_DB meal)"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
PREFIX="${PREFIX:-meal}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/${PREFIX}-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

compose -f "$compose_file" exec -T db \
  pg_dump -U "$db_user" -d "$db_name" --no-owner --clean --if-exists |
  gzip -9 >"$FILE"

if ! gzip -t "$FILE" 2>/dev/null; then
  rm -f "$FILE"
  die "备份损坏：$FILE"
fi
# grep 命中后会提前关闭管道，这里临时关掉 pipefail，避免误判 gzip 的 SIGPIPE
if ! (set +o pipefail; gzip -dc "$FILE" | grep -q 'CREATE TABLE'); then
  rm -f "$FILE"
  die "备份内容异常（没有 CREATE TABLE）：$FILE"
fi

log "备份完成 $FILE（$(du -h "$FILE" | cut -f1)）"

find "$BACKUP_DIR" -name "${PREFIX}-*.sql.gz" -type f -mtime +"$KEEP_DAYS" -print -delete |
  sed 's/^/已删除过期备份 /'

count="$(find "$BACKUP_DIR" -name "${PREFIX}-*.sql.gz" -type f | wc -l | tr -d ' ')"
log "当前保留 $count 个备份（保留天数：$KEEP_DAYS）"
