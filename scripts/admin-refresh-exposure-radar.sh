#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${OAF_ADMIN_API_BASE_URL:-https://admin.octo-agent.com/api/v1}"
REGION="${1:-${OAF_EXPOSURE_REGION:-all}}"
TOKEN="${OAF_ADMIN_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "missing OAF_ADMIN_TOKEN"
  echo "usage: OAF_ADMIN_TOKEN=<admin bearer token> $0 [all|en|zh]"
  exit 1
fi

case "$REGION" in
  all | en | english | zh | cn | chinese) ;;
  *)
    echo "invalid region: $REGION"
    echo "usage: OAF_ADMIN_TOKEN=<admin bearer token> $0 [all|en|zh]"
    exit 1
    ;;
esac

ENDPOINT="${BASE_URL%/}/admin/trends/exposure-refresh-now"

echo "[exposure-refresh] endpoint=$ENDPOINT region=$REGION"
curl -fsS \
  --connect-timeout 10 \
  -X POST "$ENDPOINT?region=$REGION" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"region\":\"$REGION\"}"
echo
echo "[exposure-refresh] done"
