#!/usr/bin/env sh
set -eu

BASE_DIR="${PROD_BASE_DIR:-/home/ubuntu/octo}"
RELEASE_DIR="${OAF_RELEASE_DIR:-$BASE_DIR/current}"
REGION="${1:-${OAF_EXPOSURE_REGION:-all}}"
HOURS="${OAF_EXPOSURE_HOURS:-4}"
MAX_FANS="${OAF_EXPOSURE_MAX_FANS:-10000}"
LIMIT="${OAF_EXPOSURE_LIMIT:-20}"
MIN_HOT_COUNT="${OAF_EXPOSURE_MIN_HOT_COUNT:-0}"

case "$REGION" in
  all|en|english|zh|cn|chinese) ;;
  *)
    echo "invalid region: $REGION" >&2
    echo "usage: sh $0 [all|en|zh]" >&2
    exit 1
    ;;
esac

if [ ! -x "$RELEASE_DIR/backend/bin/exposure-refresh" ]; then
  echo "missing exposure-refresh binary: $RELEASE_DIR/backend/bin/exposure-refresh" >&2
  echo "deploy a release that includes P27-e-c first" >&2
  exit 1
fi

cd "$RELEASE_DIR/backend"
APP_ENV="${APP_ENV:-prod}" APP_SERVICE="${APP_SERVICE:-admin}" \
  ./bin/exposure-refresh \
    -region "$REGION" \
    -hours "$HOURS" \
    -max-fans "$MAX_FANS" \
    -limit "$LIMIT" \
    -min-hot-count "$MIN_HOT_COUNT"
