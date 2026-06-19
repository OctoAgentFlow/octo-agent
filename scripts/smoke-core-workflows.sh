#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-}"
API_BASE_URL="${API_BASE_URL:-}"
SMOKE_LEGACY_COMPAT="${SMOKE_LEGACY_COMPAT:-}"

required_files=(
  "frontend/src/app/(dashboard)/dashboard/page.tsx"
  "frontend/src/app/(dashboard)/start-today/page.tsx"
  "frontend/src/app/(dashboard)/exposure-radar/page.tsx"
  "frontend/src/app/(dashboard)/accounts/page.tsx"
  "frontend/src/app/(dashboard)/oaf-bots/page.tsx"
  "frontend/src/app/(dashboard)/content-library/page.tsx"
  "frontend/src/app/(dashboard)/content-drafts/page.tsx"
  "frontend/src/app/(dashboard)/handling-list/page.tsx"
  "frontend/src/app/(dashboard)/billing/page.tsx"
  "frontend/src/app/(dashboard)/admin/page.tsx"
  "backend/internal/router/account_router.go"
  "backend/internal/router/oaf_bot_router.go"
  "backend/internal/router/content_library_router.go"
  "backend/internal/router/trend_router.go"
  "backend/internal/controller/admin_controller.go"
  "scripts/check-legacy-compat-contracts.sh"
)

required_patterns=(
  "backend/internal/router|func RegisterContentDrafts"
  "backend/internal/controller|type ContentDraftController struct"
  "backend/internal/router|func RegisterReviewQueue"
  "backend/internal/controller|type ReviewQueueController struct"
)

forbidden_patterns=(
  "backend/internal/router/router.go|RegisterDailyXQueue"
)

echo "[smoke] static workflow file checks"
for path in "${required_files[@]}"; do
  if [[ ! -f "$ROOT_DIR/$path" ]]; then
    echo "[smoke] missing required file: $path" >&2
    exit 1
  fi
  echo "[smoke] ok file: $path"
done

echo "[smoke] semantic backend route checks"
for entry in "${required_patterns[@]}"; do
  scope="${entry%%|*}"
  pattern="${entry#*|}"
  if ! rg -q "$pattern" "$ROOT_DIR/$scope"; then
    echo "[smoke] missing required symbol: $pattern in $scope" >&2
    exit 1
  fi
  echo "[smoke] ok symbol: $pattern"
done

echo "[smoke] legacy route registration checks"
for entry in "${forbidden_patterns[@]}"; do
  scope="${entry%%|*}"
  pattern="${entry#*|}"
  if rg -q "$pattern" "$ROOT_DIR/$scope"; then
    echo "[smoke] forbidden legacy registration still present: $pattern in $scope" >&2
    exit 1
  fi
  echo "[smoke] ok absent: $pattern"
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
  check_url accounts "$base/accounts"
  check_url oaf-bots "$base/oaf-bots"
  check_url content-library "$base/content-library"
  check_url content-drafts "$base/content-drafts"
  check_url handling-list "$base/handling-list"
  check_url billing "$base/billing"
fi

if [[ -n "$API_BASE_URL" ]]; then
  api="${API_BASE_URL%/}"
  echo "[smoke] api health checks: $api"
  health_url="$api/health"
  if [[ "$api" == */api/v1 ]]; then
    health_url="${api%/api/v1}/health"
  elif [[ "$api" == */api ]]; then
    health_url="${api%/api}/health"
  fi
  check_url api-health "$health_url"
fi

if [[ "$SMOKE_LEGACY_COMPAT" == "1" || "$SMOKE_LEGACY_COMPAT" == "true" ]]; then
  echo "[smoke] legacy compatibility guard"
  "$ROOT_DIR/scripts/check-legacy-compat-contracts.sh"
fi

echo "[smoke] core workflow smoke checks passed"
