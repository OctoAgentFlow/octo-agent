#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-${PROD_HOST:-}}"
USER_NAME="${PROD_USER:-ubuntu}"
BASE_DIR="${PROD_BASE_DIR:-/home/ubuntu/octo}"
USER_DOMAIN="${PROD_USER_DOMAIN:-octo-agent.com}"
WWW_DOMAIN="${PROD_WWW_DOMAIN:-www.octo-agent.com}"
ADMIN_DOMAIN="${PROD_ADMIN_DOMAIN:-admin.octo-agent.com}"

if [ -z "$HOST" ]; then
  echo "usage: $0 <host>"
  echo "example: $0 <your-server-ip>"
  exit 1
fi

failures=0

check_url() {
  local label="$1"
  local expected="$2"
  local url="$3"
  local status
  status="$(curl -ksS --connect-timeout 10 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || true)"
  if [ "$status" = "$expected" ]; then
    echo "[ok] $label $status $url"
  else
    echo "[fail] $label expected=$expected actual=${status:-curl_error} $url"
    failures=$((failures + 1))
  fi
}

echo "[prod-lite] remote health: $USER_NAME@$HOST base=$BASE_DIR"
ssh "$USER_NAME@$HOST" "BASE_DIR='$BASE_DIR' bash -s" <<'REMOTE'
set -euo pipefail

failures=0
API_PORT="${API_PORT:-12001}"
ADMIN_PORT="${ADMIN_PORT:-12002}"
API_FRONT_PORT="${API_FRONT_PORT:-4300}"
ADMIN_FRONT_PORT="${ADMIN_FRONT_PORT:-4301}"

fail() {
  echo "[fail] $*"
  failures=$((failures + 1))
}

ok() {
  echo "[ok] $*"
}

check_port() {
  local label="$1"
  local port="$2"
  if ss -H -ltn "sport = :$port" 2>/dev/null | grep -q .; then
    ok "$label listens on $port"
  else
    fail "$label missing listener on $port"
  fi
}

check_local_url() {
  local label="$1"
  local expected="$2"
  local url="$3"
  shift 3
  local status
  status="$(curl -ksS --connect-timeout 5 -o /dev/null -w "%{http_code}" "$@" "$url" 2>/dev/null || true)"
  if [ "$status" = "$expected" ]; then
    ok "$label $status $url"
  else
    fail "$label expected=$expected actual=${status:-curl_error} $url"
  fi
}

check_local_url_any() {
  local label="$1"
  local expected_csv="$2"
  local url="$3"
  shift 3
  local status
  status="$(curl -ksS --connect-timeout 5 -o /dev/null -w "%{http_code}" "$@" "$url" 2>/dev/null || true)"
  if echo ",$expected_csv," | grep -q ",$status,"; then
    ok "$label $status $url"
  else
    fail "$label expected=$expected_csv actual=${status:-curl_error} $url"
  fi
}

echo "[release]"
if [ -L "$BASE_DIR/current" ]; then
  readlink -f "$BASE_DIR/current"
else
  fail "$BASE_DIR/current is not a symlink"
fi

if [ -f "$BASE_DIR/current/REVISION" ]; then
  echo "revision=$(cat "$BASE_DIR/current/REVISION")"
else
  fail "missing current REVISION"
fi

if [ -f "$BASE_DIR/shared/backend/configs/.env" ]; then
  ok "shared backend .env exists"
else
  fail "missing $BASE_DIR/shared/backend/configs/.env"
fi

echo "[ports]"
check_port backend-api "$API_PORT"
check_port backend-admin "$ADMIN_PORT"
check_port api-front "$API_FRONT_PORT"
check_port admin-front "$ADMIN_FRONT_PORT"
check_port nginx-http 80
check_port nginx-https 443

echo "[local urls]"
check_local_url backend-api-health 200 "http://127.0.0.1:$API_PORT/health"
check_local_url backend-admin-health 200 "http://127.0.0.1:$ADMIN_PORT/health"
check_local_url api-front 200 "http://127.0.0.1:$API_FRONT_PORT/"
check_local_url admin-front 200 "http://127.0.0.1:$ADMIN_FRONT_PORT/admin"
check_local_url_any nginx-user-http "200,301" "http://127.0.0.1/" -H "Host: octo-agent.com"
check_local_url_any nginx-admin-http "200,301" "http://127.0.0.1/admin" -H "Host: admin.octo-agent.com"
check_local_url nginx-user-https 200 "https://127.0.0.1/" -H "Host: octo-agent.com"
check_local_url nginx-admin-https 200 "https://127.0.0.1/admin" -H "Host: admin.octo-agent.com"

echo "[nginx]"
if sudo nginx -t >/dev/null; then
  ok "nginx config"
else
  fail "nginx config"
fi

echo "[resources]"
free -h
df -h /

if [ "$failures" -gt 0 ]; then
  echo "[summary] remote failures=$failures"
  exit 1
fi
echo "[summary] remote ok"
REMOTE

echo "[prod-lite] external HTTPS"
check_url "$USER_DOMAIN" 200 "https://$USER_DOMAIN/"
check_url "$WWW_DOMAIN" 200 "https://$WWW_DOMAIN/"
check_url "$ADMIN_DOMAIN" 200 "https://$ADMIN_DOMAIN/admin"

if [ "$failures" -gt 0 ]; then
  echo "[summary] external failures=$failures"
  exit 1
fi

echo "[summary] prod-lite health ok"
