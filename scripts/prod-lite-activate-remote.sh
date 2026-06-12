#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${PROD_BASE_DIR:-/home/ubuntu/octo}"
VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "usage: $0 <release-version>"
  exit 1
fi

RELEASE_DIR="$BASE_DIR/releases/$VERSION"
CURRENT_LINK="$BASE_DIR/current"
SHARED_DIR="$BASE_DIR/shared"
LOG_DIR="$SHARED_DIR/logs/deploy"
PID_DIR="$SHARED_DIR/logs/pid"

API_PORT="${API_PORT:-12001}"
ADMIN_PORT="${ADMIN_PORT:-12002}"
API_FRONT_PORT="${API_FRONT_PORT:-4300}"
ADMIN_FRONT_PORT="${ADMIN_FRONT_PORT:-4301}"
KEEP_RELEASES="${PROD_LITE_KEEP_RELEASES:-3}"

mkdir -p "$LOG_DIR" "$PID_DIR"

if [ ! -d "$RELEASE_DIR" ]; then
  echo "[lite] release not found: $RELEASE_DIR"
  exit 1
fi

if [ -f "$SHARED_DIR/backend/configs/.env" ]; then
  ln -sfn "$SHARED_DIR/backend/configs/.env" "$RELEASE_DIR/backend/configs/.env"
else
  echo "[lite] warning: missing $SHARED_DIR/backend/configs/.env"
fi

stop_pid_file() {
  local label="$1"
  local pid_file="$2"
  if [ ! -f "$pid_file" ]; then
    return 0
  fi
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "[$label] stopping pid $pid"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "[$label] force stopping pid $pid"
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$pid_file"
}

port_pids() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltnp "sport = :$port" 2>/dev/null | awk '{ while (match($0, /pid=[0-9]+/)) { print substr($0, RSTART + 4, RLENGTH - 4); $0 = substr($0, RSTART + RLENGTH) } }' | sort -u
  elif command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  fi
}

ensure_port_free() {
  local label="$1"
  local port="$2"
  local pids
  pids="$(port_pids "$port")"
  if [ -z "$pids" ]; then
    return 0
  fi
  echo "[$label] stopping listeners on $port: $pids"
  kill $pids 2>/dev/null || true
  sleep 1
}

wait_port() {
  local label="$1"
  local port="$2"
  local pid_file="$3"
  for _ in $(seq 1 90); do
    if [ -n "$(port_pids "$port")" ]; then
      port_pids "$port" | head -1 >"$pid_file"
      echo "[$label] ready on port $port pid=$(cat "$pid_file")"
      return 0
    fi
    sleep 1
  done
  echo "[$label] failed to listen on $port"
  tail -80 "$LOG_DIR/$label.log" 2>/dev/null || true
  return 1
}

cleanup_old_releases() {
  if ! [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || [ "$KEEP_RELEASES" -lt 1 ]; then
    KEEP_RELEASES=3
  fi

  local current_real
  current_real="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"

  echo "[lite] cleanup old releases: keep=$KEEP_RELEASES"
  local release_index=0
  local release_dir
  while IFS= read -r release_dir; do
    release_index=$((release_index + 1))
    if [ "$release_index" -le "$KEEP_RELEASES" ]; then
      continue
    fi
    if [ -n "$current_real" ] && [ "$(readlink -f "$release_dir" 2>/dev/null || true)" = "$current_real" ]; then
      continue
    fi
    echo "[lite] removing old release $release_dir"
    rm -rf "$release_dir"
  done < <(find "$BASE_DIR/releases" -maxdepth 1 -mindepth 1 -type d -name 'octo-*' -print | sort -r)

  local upload_index=0
  local upload_file
  while IFS= read -r upload_file; do
    upload_index=$((upload_index + 1))
    if [ "$upload_index" -le "$KEEP_RELEASES" ]; then
      continue
    fi
    echo "[lite] removing old upload $upload_file"
    rm -f "$upload_file"
  done < <(find "$BASE_DIR/uploads" -maxdepth 1 -mindepth 1 -type f -name 'octo-*.tar.gz' -print | sort -r)
}

echo "[lite] activating $VERSION"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

cd "$RELEASE_DIR/frontend"
if [ ! -d node_modules ]; then
  echo "[lite] installing frontend runtime dependencies"
  npm install --omit=dev --ignore-scripts --no-audit --no-fund
fi

stop_pid_file backend-api "$PID_DIR/backend-api.pid"
stop_pid_file backend-admin "$PID_DIR/backend-admin.pid"
stop_pid_file api-front "$PID_DIR/api-front.pid"
stop_pid_file admin-front "$PID_DIR/admin-front.pid"

ensure_port_free backend-api "$API_PORT"
ensure_port_free backend-admin "$ADMIN_PORT"
ensure_port_free api-front "$API_FRONT_PORT"
ensure_port_free admin-front "$ADMIN_FRONT_PORT"

cd "$RELEASE_DIR/backend"
mkdir -p logs
echo "[backend-api] starting"
nohup env APP_ENV=prod APP_SERVICE=api ./bin/api >>"$LOG_DIR/backend-api.log" 2>&1 &
echo "$!" >"$PID_DIR/backend-api.pid"
wait_port backend-api "$API_PORT" "$PID_DIR/backend-api.pid"

echo "[backend-admin] starting"
nohup env APP_ENV=prod APP_SERVICE=admin ./bin/admin >>"$LOG_DIR/backend-admin.log" 2>&1 &
echo "$!" >"$PID_DIR/backend-admin.pid"
wait_port backend-admin "$ADMIN_PORT" "$PID_DIR/backend-admin.pid"

cd "$RELEASE_DIR/frontend"
echo "[api-front] starting"
nohup env NEXT_PUBLIC_FRONTEND_ROLE=api NEXT_PUBLIC_API_BASE_URL=https://octo-agent.com/api/v1 \
  ./node_modules/.bin/next start -H 127.0.0.1 -p "$API_FRONT_PORT" >>"$LOG_DIR/api-front.log" 2>&1 &
echo "$!" >"$PID_DIR/api-front.pid"
wait_port api-front "$API_FRONT_PORT" "$PID_DIR/api-front.pid"

echo "[admin-front] starting"
nohup env NEXT_PUBLIC_FRONTEND_ROLE=admin NEXT_PUBLIC_API_BASE_URL=https://admin.octo-agent.com/api/v1 \
  ./node_modules/.bin/next start -H 127.0.0.1 -p "$ADMIN_FRONT_PORT" >>"$LOG_DIR/admin-front.log" 2>&1 &
echo "$!" >"$PID_DIR/admin-front.pid"
wait_port admin-front "$ADMIN_FRONT_PORT" "$PID_DIR/admin-front.pid"

echo "[lite] health checks"
curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null
curl -fsS -o /dev/null "http://127.0.0.1:$API_FRONT_PORT/"
curl -fsS -o /dev/null "http://127.0.0.1:$ADMIN_FRONT_PORT/admin"
sudo nginx -t >/dev/null
sudo systemctl reload nginx
cleanup_old_releases
echo "[lite] deploy success: $VERSION"
