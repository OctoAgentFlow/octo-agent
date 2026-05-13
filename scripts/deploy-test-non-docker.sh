#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

OCTO_ENV="${OCTO_ENV:-test}"
if [[ "${OCTO_ENV}" != "test" ]]; then
  echo "This deploy script only supports the Octo-Agent test environment." >&2
  exit 1
fi

APP_ROOT="${APP_ROOT:-/opt/octo-agent}"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_LINK="${APP_ROOT}/current"
PRIVATE_DIR="${PRIVATE_DIR:-/etc/octo-agent/test}"
RUNTIME_GO="${APP_ROOT}/runtime/go/current/bin"
RUNTIME_NODE="${APP_ROOT}/runtime/node/current/bin"
PATH_VALUE="${RUNTIME_GO}:${RUNTIME_NODE}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

USER_DOMAIN="${USER_DOMAIN:-test.octo-agent.com}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-testadmin.octo-agent.com}"
API_PORT="${API_PORT:-11001}"
ADMIN_API_PORT="${ADMIN_API_PORT:-11002}"
API_FRONT_PORT="${API_FRONT_PORT:-4200}"
ADMIN_FRONT_PORT="${ADMIN_FRONT_PORT:-4201}"
HEALTH_SCHEME="${HEALTH_SCHEME:-http}"

SOURCE_DIR="${SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_file() {
  [[ -f "$1" ]] || {
    echo "Required file is missing: $1" >&2
    exit 1
  }
}

run_as_octo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    runuser -u octo -- "$@"
  else
    sudo -u octo "$@"
  fi
}

require_cmd tar
require_cmd curl
require_cmd ss

require_file "${PRIVATE_DIR}/config.test.api.yaml"
require_file "${PRIVATE_DIR}/config.test.admin.yaml"
require_file "${SOURCE_DIR}/deploy/systemd/octo-api.service"
require_file "${SOURCE_DIR}/deploy/systemd/octo-admin-api.service"
require_file "${SOURCE_DIR}/deploy/systemd/octo-api-front.service"
require_file "${SOURCE_DIR}/deploy/systemd/octo-admin-front.service"
require_file "${SOURCE_DIR}/deploy/nginx/octo-test.conf"

[[ -x "${RUNTIME_GO}/go" ]] || {
  echo "Missing Octo-Agent Go runtime: ${RUNTIME_GO}/go" >&2
  exit 1
}
[[ -x "${RUNTIME_NODE}/node" ]] || {
  echo "Missing Octo-Agent Node runtime: ${RUNTIME_NODE}/node" >&2
  exit 1
}
[[ -x "${RUNTIME_NODE}/npm" ]] || {
  echo "Missing Octo-Agent npm runtime: ${RUNTIME_NODE}/npm" >&2
  exit 1
}

check_port_available_or_owned_by_service() {
  local port="$1"
  local service="$2"
  if ss -lnt | awk '{print $4}' | grep -Eq "(:|\\])${port}$"; then
    if ! systemctl is-active --quiet "${service}"; then
      echo "Port ${port} is already occupied and ${service} is not active. Refusing to touch existing processes." >&2
      exit 1
    fi
  fi
}

check_port_available_or_owned_by_service "${API_PORT}" octo-api.service
check_port_available_or_owned_by_service "${ADMIN_API_PORT}" octo-admin-api.service
check_port_available_or_owned_by_service "${API_FRONT_PORT}" octo-api-front.service
check_port_available_or_owned_by_service "${ADMIN_FRONT_PORT}" octo-admin-front.service

echo "Deploying Octo-Agent test release ${RELEASE_ID}"
echo "Source: ${SOURCE_DIR}"
echo "Release: ${RELEASE_DIR}"

if ! id octo >/dev/null 2>&1; then
  "${SUDO[@]}" useradd --system --create-home --home-dir "${APP_ROOT}" --shell /usr/sbin/nologin octo
fi

"${SUDO[@]}" mkdir -p "${RELEASES_DIR}" "${PRIVATE_DIR}"
"${SUDO[@]}" mkdir -p "${APP_ROOT}/shared/logs"
"${SUDO[@]}" install -d -o octo -g octo "${RELEASE_DIR}"

tar \
  --exclude='.git' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/.next' \
  --exclude='frontend/.next-api' \
  --exclude='frontend/.next-admin' \
  --exclude='backend/bin' \
  --exclude='backend/logs' \
  -C "${SOURCE_DIR}" -cf - . | "${SUDO[@]}" tar -C "${RELEASE_DIR}" -xf -

"${SUDO[@]}" chown -R octo:octo "${RELEASE_DIR}"
"${SUDO[@]}" mkdir -p "${RELEASE_DIR}/backend/bin" "${RELEASE_DIR}/backend/logs"
"${SUDO[@]}" rm -f "${RELEASE_DIR}/backend/configs/config.test.api.yaml"
"${SUDO[@]}" rm -f "${RELEASE_DIR}/backend/configs/config.test.admin.yaml"
"${SUDO[@]}" ln -s "${PRIVATE_DIR}/config.test.api.yaml" "${RELEASE_DIR}/backend/configs/config.test.api.yaml"
"${SUDO[@]}" ln -s "${PRIVATE_DIR}/config.test.admin.yaml" "${RELEASE_DIR}/backend/configs/config.test.admin.yaml"
"${SUDO[@]}" chown -h octo:octo "${RELEASE_DIR}/backend/configs/config.test.api.yaml"
"${SUDO[@]}" chown -h octo:octo "${RELEASE_DIR}/backend/configs/config.test.admin.yaml"

create_env_if_missing() {
  local target="$1"
  local content="$2"
  if [[ -e "${target}" ]]; then
    echo "Keeping existing private env file: ${target}"
    return
  fi
  printf '%s\n' "${content}" | "${SUDO[@]}" tee "${target}" >/dev/null
  "${SUDO[@]}" chmod 600 "${target}"
}

create_env_if_missing "${PRIVATE_DIR}/backend.env" "APP_ENV=test
EMAIL_PROVIDER=local"
create_env_if_missing "${PRIVATE_DIR}/api-front.env" "NODE_ENV=production
NEXT_PUBLIC_FRONTEND_ROLE=api
NEXT_PUBLIC_API_BASE_URL=https://${USER_DOMAIN}/api/v1"
create_env_if_missing "${PRIVATE_DIR}/admin-front.env" "NODE_ENV=production
NEXT_PUBLIC_FRONTEND_ROLE=admin
NEXT_PUBLIC_API_BASE_URL=https://${ADMIN_DOMAIN}/api/v1"

echo "Runtime versions:"
"${RUNTIME_GO}/go" version
"${RUNTIME_NODE}/node" -v
"${RUNTIME_NODE}/npm" -v

echo "Building backend..."
run_as_octo env PATH="${PATH_VALUE}" bash -lc "cd '${RELEASE_DIR}/backend' && go mod download && go test ./... && go build -o bin/octo-api ./cmd/api && go build -o bin/octo-admin-api ./cmd/admin"

echo "Building frontend..."
run_as_octo env PATH="${PATH_VALUE}" bash -lc "cd '${RELEASE_DIR}/frontend' && npm ci"
run_as_octo env PATH="${PATH_VALUE}" NEXT_PUBLIC_FRONTEND_ROLE=api NEXT_PUBLIC_API_BASE_URL="https://${USER_DOMAIN}/api/v1" bash -lc "cd '${RELEASE_DIR}/frontend' && npm run build"
run_as_octo env PATH="${PATH_VALUE}" NEXT_PUBLIC_FRONTEND_ROLE=admin NEXT_PUBLIC_API_BASE_URL="https://${ADMIN_DOMAIN}/api/v1" bash -lc "cd '${RELEASE_DIR}/frontend' && npm run build"

"${SUDO[@]}" ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
"${SUDO[@]}" chown -h octo:octo "${CURRENT_LINK}"

echo "Installing Octo-Agent systemd units..."
"${SUDO[@]}" install -m 0644 "${SOURCE_DIR}/deploy/systemd/octo-api.service" /etc/systemd/system/octo-api.service
"${SUDO[@]}" install -m 0644 "${SOURCE_DIR}/deploy/systemd/octo-admin-api.service" /etc/systemd/system/octo-admin-api.service
"${SUDO[@]}" install -m 0644 "${SOURCE_DIR}/deploy/systemd/octo-api-front.service" /etc/systemd/system/octo-api-front.service
"${SUDO[@]}" install -m 0644 "${SOURCE_DIR}/deploy/systemd/octo-admin-front.service" /etc/systemd/system/octo-admin-front.service

NGINX_TARGET="/etc/nginx/conf.d/octo-agent-test.conf"
if [[ -e "${NGINX_TARGET}" ]]; then
  if cmp -s "${SOURCE_DIR}/deploy/nginx/octo-test.conf" "${NGINX_TARGET}"; then
    echo "Nginx config already exists and matches: ${NGINX_TARGET}"
  else
    echo "Nginx config already exists and differs: ${NGINX_TARGET}" >&2
    echo "Refusing to overwrite existing Nginx config." >&2
    exit 1
  fi
else
  echo "Installing independent Octo-Agent Nginx config: ${NGINX_TARGET}"
  "${SUDO[@]}" install -m 0644 "${SOURCE_DIR}/deploy/nginx/octo-test.conf" "${NGINX_TARGET}"
fi

"${SUDO[@]}" systemctl daemon-reload
"${SUDO[@]}" systemctl enable octo-api octo-admin-api octo-api-front octo-admin-front
"${SUDO[@]}" systemctl restart octo-api
"${SUDO[@]}" systemctl restart octo-admin-api
"${SUDO[@]}" systemctl restart octo-api-front
"${SUDO[@]}" systemctl restart octo-admin-front

"${SUDO[@]}" nginx -t
"${SUDO[@]}" systemctl reload nginx

expect_status() {
  local url="$1"
  local expected="$2"
  local status
  status="$(curl -ksS -o /tmp/octo-agent-health.out -w '%{http_code}' "${url}")"
  if [[ "${status}" != "${expected}" ]]; then
    echo "Unexpected status for ${url}: got ${status}, expected ${expected}" >&2
    cat /tmp/octo-agent-health.out >&2 || true
    exit 1
  fi
}

expect_status_in() {
  local url="$1"
  shift
  local status
  status="$(curl -ksS -o /tmp/octo-agent-health.out -w '%{http_code}' "${url}")"
  for expected in "$@"; do
    if [[ "${status}" == "${expected}" ]]; then
      return
    fi
  done
  echo "Unexpected status for ${url}: got ${status}, expected one of $*" >&2
  cat /tmp/octo-agent-health.out >&2 || true
  exit 1
}

echo "Running internal health checks..."
expect_status "http://127.0.0.1:${API_PORT}/health" "200"
expect_status "http://127.0.0.1:${ADMIN_API_PORT}/health" "200"
expect_status "http://127.0.0.1:${ADMIN_API_PORT}/admin/health" "200"
expect_status_in "http://127.0.0.1:${API_FRONT_PORT}" "200" "301" "302" "307" "308"
expect_status_in "http://127.0.0.1:${ADMIN_FRONT_PORT}" "200" "301" "302" "307" "308"

echo "Running Nginx health and route isolation checks..."
expect_status_in "${HEALTH_SCHEME}://${USER_DOMAIN}" "200" "301" "302" "307" "308"
expect_status_in "${HEALTH_SCHEME}://${ADMIN_DOMAIN}" "200" "301" "302" "307" "308"
expect_status_in "${HEALTH_SCHEME}://${USER_DOMAIN}/api/v1/dashboard/overview" "401"
expect_status_in "${HEALTH_SCHEME}://${ADMIN_DOMAIN}/api/v1/admin/overview" "401"
expect_status_in "${HEALTH_SCHEME}://${USER_DOMAIN}/api/v1/admin/overview" "404"
expect_status_in "${HEALTH_SCHEME}://${ADMIN_DOMAIN}/api/v1/auth/email-code/send" "404"

echo "Octo-Agent test deployment completed successfully."
