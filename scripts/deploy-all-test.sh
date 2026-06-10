#!/usr/bin/env bash
set -euo pipefail

echo "[deprecated] test environment servers have been released. Do not use test deploy scripts; use ./scripts/deploy-all-prod.sh for server deployment."
exit 1

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
LOG_FILE="$ROOT_DIR/logs/deploy/all-test.log"

mkdir -p "$(dirname "$LOG_FILE")"
printf "" >"$LOG_FILE"

echo "[all:test] root=$ROOT_DIR"
echo "[all:test] starting services: backend-api, backend-admin, api-front, admin-front"
START_TS="$(date +%s)"
step_reports=()

run_step() {
  local name="$1"
  local script="$2"
  local t0 t1 cost
  t0="$(date +%s)"
  echo "[all:test] -> $name ($script)"
  if "$script" 2>&1 | tee -a "$LOG_FILE"; then
    t1="$(date +%s)"
    cost=$((t1 - t0))
    step_reports+=("$name: success (${cost}s)")
    echo "[all:test] $name deploy success (${cost}s)"
  else
    local code=$?
    t1="$(date +%s)"
    cost=$((t1 - t0))
    step_reports+=("$name: failed (${cost}s, exit=$code)")
    echo "[all:test] deploy failed: $name (exit=$code, ${cost}s)"
    echo "[all:test] aggregate log: $LOG_FILE"
    tail -n 80 "$LOG_FILE" || true
    exit "$code"
  fi
}

run_step "backend-api" "$SCRIPTS_DIR/deploy-backend-api-test.sh"
run_step "backend-admin" "$SCRIPTS_DIR/deploy-backend-admin-test.sh"
run_step "api-front" "$SCRIPTS_DIR/deploy-api-front-test.sh"
run_step "admin-front" "$SCRIPTS_DIR/deploy-admin-front-test.sh"

END_TS="$(date +%s)"
echo "[all:test] deploy success"
echo "[all:test] summary:"
for report in "${step_reports[@]}"; do
  echo "[all:test]   - $report"
done
echo "[all:test] total cost: $((END_TS - START_TS))s"
echo "[all:test] aggregate log: $LOG_FILE"
