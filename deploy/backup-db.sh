#!/usr/bin/env bash
# 兼容旧路径的备份入口，实际逻辑在 backup.sh。
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup.sh" "$@"
