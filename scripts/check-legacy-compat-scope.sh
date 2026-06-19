#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_REF=""
RUN_GUARD=0

usage() {
  cat <<'USAGE'
usage: scripts/check-legacy-compat-scope.sh [--base <ref>] [--run]

Checks whether the current diff touches paths guarded by the legacy
compatibility contract. By default it only prints guidance. Use --run to execute
scripts/check-legacy-compat-contracts.sh when guarded paths are found.

Examples:
  scripts/check-legacy-compat-scope.sh
  scripts/check-legacy-compat-scope.sh --base origin/main
  scripts/check-legacy-compat-scope.sh --base HEAD~1 --run
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      if [[ $# -lt 2 ]]; then
        echo "[legacy-compat-scope] --base requires a git ref" >&2
        exit 2
      fi
      BASE_REF="$2"
      shift 2
      ;;
    --run)
      RUN_GUARD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[legacy-compat-scope] unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

is_guarded_path() {
  case "$1" in
    backend/internal/model/auto_post_*.go|\
    backend/internal/dto/automation_dto.go|\
    backend/internal/dto/billing_dto.go|\
    backend/internal/repository/auto_post_*repository.go|\
    backend/internal/repository/ai_generation_usage_repository.go|\
    backend/internal/service/review_queue_service.go|\
    backend/internal/service/feedback_learning_signals.go|\
    backend/internal/jobs/*|\
    backend/internal/router/*|\
    scripts/check-legacy-compat-contracts.sh|\
    scripts/check-legacy-compat-scope.sh|\
    scripts/smoke-core-workflows.sh|\
    .github/workflows/legacy-compat-guard.yml|\
    docs/technical/content-draft-route-migration.md|\
    docs/technical/high-risk-legacy-data-migration-plan.md|\
    docs/runbooks/core-workflow-smoke-test.md)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

changed_files() {
  if [[ -n "$BASE_REF" ]]; then
    git -C "$ROOT_DIR" diff --name-only "$BASE_REF"...HEAD
    return
  fi

  {
    git -C "$ROOT_DIR" diff --name-only
    git -C "$ROOT_DIR" diff --name-only --cached
    git -C "$ROOT_DIR" ls-files --others --exclude-standard
  } | sort -u
}

changed=()
guarded=()

while IFS= read -r path; do
  if [[ -n "$path" ]]; then
    changed+=("$path")
  fi
done < <(changed_files)

for path in "${changed[@]}"; do
  if is_guarded_path "$path"; then
    guarded+=("$path")
  fi
done

if [[ ${#changed[@]} -eq 0 ]]; then
  echo "[legacy-compat-scope] no changed files detected"
  exit 0
fi

if [[ ${#guarded[@]} -eq 0 ]]; then
  echo "[legacy-compat-scope] no guarded compatibility paths changed"
  exit 0
fi

echo "[legacy-compat-scope] guarded compatibility paths changed:"
printf '  - %s\n' "${guarded[@]}"
echo "[legacy-compat-scope] recommended check:"
echo "  SMOKE_LEGACY_COMPAT=1 scripts/smoke-core-workflows.sh"

if [[ "$RUN_GUARD" == "1" ]]; then
  echo "[legacy-compat-scope] running legacy compatibility guard"
  "$ROOT_DIR/scripts/check-legacy-compat-contracts.sh"
fi
