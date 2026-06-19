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

echo "[legacy-compat] static compatibility contract checks"

check_present "legacy auto_post_plans table model" "backend/internal/model/auto_post_plan.go" "type AutoPostPlan struct"
check_present "legacy auto_post_drafts table model" "backend/internal/model/auto_post_draft.go" "type AutoPostDraft struct"
check_present "legacy auto_post_generation_runs table model" "backend/internal/model/auto_post_generation_run.go" "type AutoPostGenerationRun struct"

check_present "ContentDraftPlanRepository alias" "backend/internal/repository/auto_post_plan_repository.go" "type ContentDraftPlanRepository = AutoPostPlanRepository"
check_present "ContentDraftRepository alias" "backend/internal/repository/auto_post_draft_repository.go" "type ContentDraftRepository = AutoPostDraftRepository"
check_present "ContentDraftGenerationRunRepository alias" "backend/internal/repository/auto_post_generation_run_repository.go" "type ContentDraftGenerationRunRepository = AutoPostGenerationRunRepository"

check_present "ContentDraft DTO plan alias" "backend/internal/dto/automation_dto.go" "type ContentDraftPlanRequest = AutoPostPlanRequest"
check_present "ContentDraft DTO item alias" "backend/internal/dto/automation_dto.go" "type ContentDraftItem = AutoPostDraftItem"
check_present "ContentDraft DTO response alias" "backend/internal/dto/automation_dto.go" "type ContentDraftsResponse = AutoPostDraftsResponse"

check_present "billing legacy monthly_auto_posts field" "backend/internal/dto/billing_dto.go" 'MonthlyAutoPosts[[:space:]]+int64[[:space:]]+`json:"monthly_auto_posts"`'
check_present "billing semantic monthly_content_drafts field" "backend/internal/dto/billing_dto.go" 'MonthlyContentDrafts[[:space:]]+int64[[:space:]]+`json:"monthly_content_drafts"`'
check_present "billing legacy auto_posts_month usage field" "backend/internal/dto/billing_dto.go" 'AutoPostsMonth[[:space:]]+int64[[:space:]]+`json:"auto_posts_month"`'
check_present "billing semantic content_drafts_month usage field" "backend/internal/dto/billing_dto.go" 'ContentDraftsMonth[[:space:]]+int64[[:space:]]+`json:"content_drafts_month"`'

check_present "AI usage scene remains auto_post" "backend/internal/repository/ai_generation_usage_repository.go" 'AIGenerationSceneAutoPost[[:space:]]+= "auto_post"'
check_present "review queue accepts legacy auto_post queue type" "backend/internal/service/review_queue_service.go" 'case "auto_post":'
check_present "feedback learning accepts legacy auto_post queue type" "backend/internal/service/feedback_learning_signals.go" '"auto_post"'
check_present "active scheduler uses Content Draft entrypoint" "backend/internal/jobs/scheduler.go" "RunContentDraftOnce"
check_present "legacy scheduler wrapper remains available" "backend/internal/jobs/auto_post_job.go" "func RunAutoPostOnce"

check_absent "old Auto Post API route registration" "backend/internal/router/router.go" "RegisterAutoPost"
check_absent "old Daily X Queue API route registration" "backend/internal/router/router.go" "RegisterDailyXQueue"

echo "[legacy-compat] targeted Go compatibility tests"
(
  cd "$ROOT_DIR/backend"
  go test ./internal/model ./internal/dto ./internal/repository ./internal/router
)

echo "[legacy-compat] compatibility contract checks passed"
