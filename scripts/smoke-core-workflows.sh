#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-}"
API_BASE_URL="${API_BASE_URL:-}"

required_files=(
  "frontend/src/app/(dashboard)/dashboard/page.tsx"
  "frontend/src/app/(dashboard)/start-today/page.tsx"
  "frontend/src/app/(dashboard)/exposure-radar/page.tsx"
  "frontend/src/app/(dashboard)/daily-x-queue/page.tsx"
  "frontend/src/app/(dashboard)/content-drafts/page.tsx"
  "frontend/src/app/(dashboard)/handling-list/page.tsx"
  "frontend/src/app/(dashboard)/billing/page.tsx"
  "frontend/src/app/(dashboard)/admin/page.tsx"
  "backend/internal/router/daily_x_queue_router.go"
  "backend/internal/router/trend_router.go"
  "backend/internal/router/auto_post_router.go"
  "backend/internal/router/review_queue_router.go"
  "backend/internal/controller/admin_controller.go"
)

echo "[smoke] static workflow file checks"
for path in "${required_files[@]}"; do
  if [[ ! -f "$ROOT_DIR/$path" ]]; then
    echo "[smoke] missing required file: $path" >&2
    exit 1
  fi
  echo "[smoke] ok file: $path"
done

check_url() {
  local name="$1"
  local url="$2"
  local code
  code="$(curl -k -sS -L -o /dev/null -w "%{http_code}" "$url")"
  if [[ "$code" != "200" ]]; then
    echo "[smoke] $name failed: $url -> $code" >&2
    exit 1
  fi
  echo "[smoke] ok url: $name -> $code"
}

if [[ -n "$BASE_URL" ]]; then
  base="${BASE_URL%/}"
  echo "[smoke] frontend route checks: $base"
  check_url login "$base/login"
  check_url dashboard "$base/dashboard"
  check_url start-today "$base/start-today"
  check_url exposure-radar "$base/exposure-radar"
  check_url daily-x-queue "$base/daily-x-queue"
  check_url content-drafts "$base/content-drafts"
  check_url handling-list "$base/handling-list"
  check_url billing "$base/billing"
fi

if [[ -n "$API_BASE_URL" ]]; then
  api="${API_BASE_URL%/}"
  echo "[smoke] api health checks: $api"
  check_url api-health "$api/health"
fi

echo "[smoke] core workflow smoke checks passed"
