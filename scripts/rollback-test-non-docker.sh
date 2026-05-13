#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

OCTO_ENV="${OCTO_ENV:-test}"
if [[ "${OCTO_ENV}" != "test" ]]; then
  echo "This rollback script only supports the Octo-Agent test environment." >&2
  exit 1
fi

APP_ROOT="${APP_ROOT:-/opt/octo-agent}"
RELEASES_DIR="${APP_ROOT}/releases"
CURRENT_LINK="${APP_ROOT}/current"
API_PORT="${API_PORT:-11001}"
ADMIN_API_PORT="${ADMIN_API_PORT:-11002}"
API_FRONT_PORT="${API_FRONT_PORT:-4200}"
ADMIN_FRONT_PORT="${ADMIN_FRONT_PORT:-4201}"

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

require_cmd curl

CURRENT_TARGET=""
if [[ -L "${CURRENT_LINK}" ]]; then
  CURRENT_TARGET="$(readlink -f "${CURRENT_LINK}")"
fi

if [[ $# -gt 0 ]]; then
  if [[ "$1" = /* ]]; then
    TARGET_RELEASE="$1"
  else
    TARGET_RELEASE="${RELEASES_DIR}/$1"
  fi
else
  TARGET_RELEASE="$(find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d | sort -r | while read -r candidate; do
    if [[ "${candidate}" != "${CURRENT_TARGET}" ]]; then
      echo "${candidate}"
      break
    fi
  done)"
fi

if [[ -z "${TARGET_RELEASE}" || ! -d "${TARGET_RELEASE}" ]]; then
  echo "No rollback target found. Pass a release id or absolute release path." >&2
  exit 1
fi

echo "Rolling back Octo-Agent test deployment"
echo "Current: ${CURRENT_TARGET:-none}"
echo "Target:  ${TARGET_RELEASE}"
echo "This script does not delete releases, databases, or existing non-Octo processes."

"${SUDO[@]}" ln -sfn "${TARGET_RELEASE}" "${CURRENT_LINK}"
"${SUDO[@]}" chown -h octo:octo "${CURRENT_LINK}"

"${SUDO[@]}" systemctl daemon-reload
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
  status="$(curl -ksS -o /tmp/octo-agent-rollback-health.out -w '%{http_code}' "${url}")"
  if [[ "${status}" != "${expected}" ]]; then
    echo "Unexpected status for ${url}: got ${status}, expected ${expected}" >&2
    cat /tmp/octo-agent-rollback-health.out >&2 || true
    exit 1
  fi
}

expect_status_in() {
  local url="$1"
  shift
  local status
  status="$(curl -ksS -o /tmp/octo-agent-rollback-health.out -w '%{http_code}' "${url}")"
  for expected in "$@"; do
    if [[ "${status}" == "${expected}" ]]; then
      return
    fi
  done
  echo "Unexpected status for ${url}: got ${status}, expected one of $*" >&2
  cat /tmp/octo-agent-rollback-health.out >&2 || true
  exit 1
}

expect_status "http://127.0.0.1:${API_PORT}/health" "200"
expect_status "http://127.0.0.1:${ADMIN_API_PORT}/health" "200"
expect_status "http://127.0.0.1:${ADMIN_API_PORT}/admin/health" "200"
expect_status_in "http://127.0.0.1:${API_FRONT_PORT}" "200" "301" "302" "307" "308"
expect_status_in "http://127.0.0.1:${ADMIN_FRONT_PORT}" "200" "301" "302" "307" "308"

echo "Octo-Agent test rollback completed successfully."
