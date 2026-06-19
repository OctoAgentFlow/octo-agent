#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

check_present() {
  local label="$1"
  local scope="$2"
  local pattern="$3"
  if ! rg -q "$pattern" "$ROOT_DIR/$scope"; then
    echo "[legacy-compat] missing required contract: $label" >&2
    echo "[legacy-compat] scope=$scope pattern=$pattern" >&2
    exit 1
  fi
  echo "[legacy-compat] ok present: $label"
}

check_absent() {
  local label="$1"
  local scope="$2"
  local pattern="$3"
  if rg -q "$pattern" "$ROOT_DIR/$scope"; then
    echo "[legacy-compat] unexpected active legacy surface: $label" >&2
    echo "[legacy-compat] scope=$scope pattern=$pattern" >&2
    exit 1
  fi
  echo "[legacy-compat] ok absent: $label"
}

section() {
  echo "[legacy-compat] $1"
}

check_preserved_contract() {
  check_present "preserved contract: $1" "$2" "$3"
}

check_semantic_alias() {
  check_present "semantic alias: $1" "$2" "$3"
}

check_downlined_surface_absent() {
  check_absent "downlined surface remains absent: $1" "$2" "$3"
}

echo "[legacy-compat] static compatibility contract checks"

section "preserved storage contracts"
check_preserved_contract "legacy auto_post_plans table model" "backend/internal/model/auto_post_plan.go" "type AutoPostPlan struct"
check_preserved_contract "legacy auto_post_drafts table model" "backend/internal/model/auto_post_draft.go" "type AutoPostDraft struct"
check_preserved_contract "legacy auto_post_generation_runs table model" "backend/internal/model/auto_post_generation_run.go" "type AutoPostGenerationRun struct"

section "semantic alias layer"
check_semantic_alias "ContentDraftPlanRepository alias" "backend/internal/repository/auto_post_plan_repository.go" "type ContentDraftPlanRepository = AutoPostPlanRepository"
check_semantic_alias "ContentDraftRepository alias" "backend/internal/repository/auto_post_draft_repository.go" "type ContentDraftRepository = AutoPostDraftRepository"
check_semantic_alias "ContentDraftGenerationRunRepository alias" "backend/internal/repository/auto_post_generation_run_repository.go" "type ContentDraftGenerationRunRepository = AutoPostGenerationRunRepository"
check_semantic_alias "ContentDraft DTO plan alias" "backend/internal/dto/automation_dto.go" "type ContentDraftPlanRequest = AutoPostPlanRequest"
check_semantic_alias "ContentDraft DTO item alias" "backend/internal/dto/automation_dto.go" "type ContentDraftItem = AutoPostDraftItem"
check_semantic_alias "ContentDraft DTO response alias" "backend/internal/dto/automation_dto.go" "type ContentDraftsResponse = AutoPostDraftsResponse"
check_semantic_alias "billing monthly_content_drafts field" "backend/internal/dto/billing_dto.go" 'MonthlyContentDrafts[[:space:]]+int64[[:space:]]+`json:"monthly_content_drafts"`'
check_semantic_alias "billing content_drafts_month usage field" "backend/internal/dto/billing_dto.go" 'ContentDraftsMonth[[:space:]]+int64[[:space:]]+`json:"content_drafts_month"`'

section "preserved billing wire contracts"
check_preserved_contract "billing legacy monthly_auto_posts field" "backend/internal/dto/billing_dto.go" 'MonthlyAutoPosts[[:space:]]+int64[[:space:]]+`json:"monthly_auto_posts"`'
check_preserved_contract "billing legacy auto_posts_month usage field" "backend/internal/dto/billing_dto.go" 'AutoPostsMonth[[:space:]]+int64[[:space:]]+`json:"auto_posts_month"`'

section "historical workflow contracts"
check_preserved_contract "AI usage scene remains auto_post" "backend/internal/repository/ai_generation_usage_repository.go" 'AIGenerationSceneAutoPost[[:space:]]+= "auto_post"'
check_preserved_contract "review queue accepts legacy auto_post queue type" "backend/internal/service/review_queue_service.go" 'case "auto_post":'
check_preserved_contract "feedback learning accepts legacy auto_post queue type" "backend/internal/service/feedback_learning_signals.go" '"auto_post"'
check_semantic_alias "active scheduler uses Content Draft entrypoint" "backend/internal/jobs/scheduler.go" "RunContentDraftOnce"
check_preserved_contract "legacy scheduler wrapper remains available" "backend/internal/jobs/auto_post_job.go" "func RunAutoPostOnce"

section "downlined route surfaces"
check_downlined_surface_absent "old Auto Post API route registration" "backend/internal/router/router.go" "RegisterAutoPost"
check_downlined_surface_absent "old Daily X Queue API route registration" "backend/internal/router/router.go" "RegisterDailyXQueue"

echo "[legacy-compat] targeted Go compatibility tests"
(
  cd "$ROOT_DIR/backend"
  go test ./internal/model ./internal/dto ./internal/repository ./internal/router
)

echo "[legacy-compat] compatibility contract checks passed"
