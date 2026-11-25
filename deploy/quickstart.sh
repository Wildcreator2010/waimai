#!/usr/bin/env bash
# 一行命令部署（在全新 Linux 服务器上执行）
#
#   curl -fsSL https://raw.githubusercontent.com/Wildcreator2010/waimai/master/deploy/quickstart.sh \
#     | sudo bash -s -- --domain=meal.example.com
#
# 也可以在仓库内执行：
#   sudo bash deploy/quickstart.sh --domain=meal.example.com
#
# 可选参数：
#   --dir=/opt/meal-reminder   安装目录（默认 /opt/meal-reminder）
#   --repo=<git url>           仓库地址（默认官方仓库）
#   --branch=<name>            分支（默认仓库默认分支）
#   其余参数原样传给 deploy/install.sh（--topology、--no-build、--image-tar 等）
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Wildcreator2010/waimai.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/meal-reminder}"
BRANCH="${BRANCH:-}"
PASSTHROUGH=()

usage() {
  cat <<'EOF'
用法：
  sudo bash deploy/quickstart.sh --domain=meal.example.com
  curl -fsSL <raw quickstart.sh> | sudo bash -s -- --domain=meal.example.com

参数：
  --domain=NAME          主域名（默认直接交给 install.sh 交互询问）
  --dir=PATH             安装目录（默认 /opt/meal-reminder）
  --repo=URL             仓库地址
  --branch=NAME          分支
  其余参数（--topology / --no-build / --image-tar 等）原样传给 deploy/install.sh
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dir=*) INSTALL_DIR="${arg#*=}" ;;
    --repo=*) REPO_URL="${arg#*=}" ;;
    --branch=*) BRANCH="${arg#*=}" ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) PASSTHROUGH+=("$arg") ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 或 sudo 运行（安装容器与可选 nginx 配置需要写权限）" >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  echo "缺少 docker。请先安装 Docker Engine 与 Docker Compose v2。" >&2
  exit 1
}

# 情况一：直接执行仓库里的脚本 → 把参数交给 install.sh
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/install.sh" ]; then
  exec bash "$SELF_DIR/install.sh" ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}
fi

# 情况二：curl | bash → 先拉代码，再安装
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "使用已有代码目录：$INSTALL_DIR"
else
  command -v git >/dev/null 2>&1 || {
    echo "缺少 git。请先安装 git，或把仓库克隆到 $INSTALL_DIR 后重新执行。" >&2
    exit 1
  }
  mkdir -p "$(dirname "$INSTALL_DIR")"
  echo "克隆仓库到 $INSTALL_DIR"
  if [ -n "$BRANCH" ]; then
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  else
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  fi
fi

exec bash "$INSTALL_DIR/deploy/install.sh" ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}
