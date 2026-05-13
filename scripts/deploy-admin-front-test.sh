#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/logs/deploy"
PID_DIR="$ROOT_DIR/logs/pid"
LABEL="admin-front:test"
LOG_FILE="$LOG_DIR/admin-front-test.log"
PID_FILE="$PID_DIR/admin-front-test.pid"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-4201}"
NEXT_PUBLIC_FRONTEND_ROLE_VALUE="admin"
NEXT_PUBLIC_API_BASE_URL_VALUE="${NEXT_PUBLIC_API_BASE_URL:-https://testadmin.octo-agent.com/api/v1}"
STARTUP_TIMEOUT_SECONDS="${STARTUP_TIMEOUT_SECONDS:-60}"
STARTUP_CHECK_INTERVAL_SECONDS="${STARTUP_CHECK_INTERVAL_SECONDS:-1}"

source "$ROOT_DIR/scripts/lib/deploy-common.sh"

trap 'code=$?; echo "[$LABEL] deploy failed: $BASH_COMMAND (exit=$code)"; octo_print_recent_log "$LABEL" "$LOG_FILE" 80; exit $code' ERR

echo "[$LABEL] root=$ROOT_DIR"
echo "[$LABEL] web=$WEB_DIR"
echo "[$LABEL] role=$NEXT_PUBLIC_FRONTEND_ROLE_VALUE api=$NEXT_PUBLIC_API_BASE_URL_VALUE host=$HOST port=$PORT"

mkdir -p "$LOG_DIR" "$PID_DIR"
cd "$WEB_DIR"

if [ ! -d node_modules ]; then
  echo "[$LABEL] node_modules not found, running npm install"
  npm install
fi

echo "[$LABEL] building Next.js admin frontend"
NEXT_PUBLIC_FRONTEND_ROLE="$NEXT_PUBLIC_FRONTEND_ROLE_VALUE" \
NEXT_PUBLIC_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL_VALUE" \
  npm run build

octo_stop_from_pid_file "$LABEL" "$PID_FILE"
octo_ensure_port_free "$LABEL" "$PORT"

echo "[$LABEL] starting next start"
nohup env NEXT_PUBLIC_FRONTEND_ROLE="$NEXT_PUBLIC_FRONTEND_ROLE_VALUE" \
  NEXT_PUBLIC_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL_VALUE" \
  npx next start -H "$HOST" -p "$PORT" >>"$LOG_FILE" 2>&1 &
echo "$!" >"$PID_FILE"

octo_wait_for_port "$LABEL" "$PORT" "$PID_FILE" "$STARTUP_TIMEOUT_SECONDS" "$STARTUP_CHECK_INTERVAL_SECONDS"
echo "[$LABEL] log: $LOG_FILE"
