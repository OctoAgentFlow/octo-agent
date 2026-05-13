#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/backend"
LOG_DIR="$ROOT_DIR/logs/deploy"
PID_DIR="$ROOT_DIR/logs/pid"
LABEL="backend-admin:prod"
LOG_FILE="$LOG_DIR/backend-admin-prod.log"
PID_FILE="$PID_DIR/backend-admin-prod.pid"
APP_ENV_VALUE="prod"
APP_SERVICE_VALUE="admin"
PORT="${PORT:-12002}"
STARTUP_TIMEOUT_SECONDS="${STARTUP_TIMEOUT_SECONDS:-120}"
STARTUP_CHECK_INTERVAL_SECONDS="${STARTUP_CHECK_INTERVAL_SECONDS:-1}"

source "$ROOT_DIR/scripts/lib/deploy-common.sh"

trap 'code=$?; echo "[$LABEL] deploy failed: $BASH_COMMAND (exit=$code)"; octo_print_recent_log "$LABEL" "$LOG_FILE" 80; exit $code' ERR

echo "[$LABEL] root=$ROOT_DIR"
echo "[$LABEL] app=$APP_DIR"
echo "[$LABEL] APP_ENV=$APP_ENV_VALUE APP_SERVICE=$APP_SERVICE_VALUE PORT=$PORT"

mkdir -p "$LOG_DIR" "$PID_DIR"
cd "$APP_DIR"

octo_assert_config_port "$LABEL" "$APP_DIR/configs/config.${APP_ENV_VALUE}.${APP_SERVICE_VALUE}.yaml" "admin" "$PORT"
octo_stop_from_pid_file "$LABEL" "$PID_FILE"
octo_ensure_port_free "$LABEL" "$PORT"

echo "[$LABEL] starting go run ./cmd/admin"
nohup env APP_ENV="$APP_ENV_VALUE" APP_SERVICE="$APP_SERVICE_VALUE" \
  go run ./cmd/admin >>"$LOG_FILE" 2>&1 &
echo "$!" >"$PID_FILE"

octo_wait_for_port "$LABEL" "$PORT" "$PID_FILE" "$STARTUP_TIMEOUT_SECONDS" "$STARTUP_CHECK_INTERVAL_SECONDS"
echo "[$LABEL] log: $LOG_FILE"
