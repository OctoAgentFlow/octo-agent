#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$ROOT_DIR/scripts"
LOG_FILE="$ROOT_DIR/logs/deploy/all-prod.log"

mkdir -p "$(dirname "$LOG_FILE")"
printf "" >"$LOG_FILE"

echo "[all:prod] root=$ROOT_DIR"
echo "[all:prod] starting services: backend-api, backend-admin, api-front, admin-front"
START_TS="$(date +%s)"
step_reports=()

run_step() {
  local name="$1"
  local script="$2"
  local t0 t1 cost
  t0="$(date +%s)"
  echo "[all:prod] -> $name ($script)"
  if "$script" 2>&1 | tee -a "$LOG_FILE"; then
    t1="$(date +%s)"
    cost=$((t1 - t0))
    step_reports+=("$name: success (${cost}s)")
    echo "[all:prod] $name deploy success (${cost}s)"
  else
    local code=$?
    t1="$(date +%s)"
    cost=$((t1 - t0))
    step_reports+=("$name: failed (${cost}s, exit=$code)")
    echo "[all:prod] deploy failed: $name (exit=$code, ${cost}s)"
    echo "[all:prod] aggregate log: $LOG_FILE"
    tail -n 80 "$LOG_FILE" || true
    exit "$code"
  fi
}

run_step "backend-api" "$SCRIPTS_DIR/deploy-backend-api-prod.sh"
run_step "backend-admin" "$SCRIPTS_DIR/deploy-backend-admin-prod.sh"
run_step "api-front" "$SCRIPTS_DIR/deploy-api-front-prod.sh"
run_step "admin-front" "$SCRIPTS_DIR/deploy-admin-front-prod.sh"

END_TS="$(date +%s)"
echo "[all:prod] deploy success"
echo "[all:prod] summary:"
for report in "${step_reports[@]}"; do
  echo "[all:prod]   - $report"
done
echo "[all:prod] total cost: $((END_TS - START_TS))s"
echo "[all:prod] aggregate log: $LOG_FILE"
