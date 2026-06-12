#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-${PROD_HOST:-}}"
USER_NAME="${PROD_USER:-ubuntu}"
BASE_DIR="${PROD_BASE_DIR:-/home/ubuntu/octo}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
STAMP="$(date +%Y%m%d%H%M%S)"
VERSION="octo-$COMMIT-$STAMP"
WORK_DIR="$ROOT_DIR/dist/prod-lite/$VERSION"
TARBALL="$ROOT_DIR/dist/prod-lite/$VERSION.tar.gz"

if [ -z "$HOST" ]; then
  echo "usage: $0 <host>"
  echo "example: $0 <your-server-ip>"
  exit 1
fi

rm -rf "$WORK_DIR" "$TARBALL"
mkdir -p "$WORK_DIR/backend/bin" "$WORK_DIR/backend/configs" "$WORK_DIR/frontend" "$WORK_DIR/scripts"

echo "[build] backend linux/amd64 binaries"
(
  cd "$ROOT_DIR/backend"
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$WORK_DIR/backend/bin/api" ./cmd/api
  CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$WORK_DIR/backend/bin/admin" ./cmd/admin
)

echo "[build] frontend api bundle"
(
  cd "$ROOT_DIR/frontend"
  NEXT_PUBLIC_FRONTEND_ROLE=api NEXT_PUBLIC_API_BASE_URL=https://octo-agent.com/api/v1 npm run build
)

echo "[build] frontend admin bundle"
(
  cd "$ROOT_DIR/frontend"
  NEXT_PUBLIC_FRONTEND_ROLE=admin NEXT_PUBLIC_API_BASE_URL=https://admin.octo-agent.com/api/v1 npm run build
)

cp "$ROOT_DIR"/backend/configs/config.prod*.yaml "$WORK_DIR/backend/configs/"
rsync -a --delete --exclude cache "$ROOT_DIR/frontend/.next-api" "$WORK_DIR/frontend/"
rsync -a --delete --exclude cache "$ROOT_DIR/frontend/.next-admin" "$WORK_DIR/frontend/"
rsync -a --delete "$ROOT_DIR/frontend/public" "$WORK_DIR/frontend/"
cp "$ROOT_DIR/frontend/package.json" "$ROOT_DIR/frontend/package-lock.json" "$ROOT_DIR/frontend/next.config.ts" "$WORK_DIR/frontend/"
cp "$ROOT_DIR/scripts/prod-lite-activate-remote.sh" "$WORK_DIR/scripts/"
chmod +x "$WORK_DIR/backend/bin/api" "$WORK_DIR/backend/bin/admin" "$WORK_DIR/scripts/prod-lite-activate-remote.sh"

echo "$COMMIT" >"$WORK_DIR/REVISION"

echo "[pack] $TARBALL"
COPYFILE_DISABLE=1 tar --format ustar -C "$WORK_DIR/.." -czf "$TARBALL" "$VERSION"

echo "[upload] $HOST:$BASE_DIR/uploads/"
ssh "$USER_NAME@$HOST" "mkdir -p '$BASE_DIR/uploads' '$BASE_DIR/releases'"
scp "$TARBALL" "$USER_NAME@$HOST:$BASE_DIR/uploads/"
ssh "$USER_NAME@$HOST" "set -euo pipefail; rm -rf '$BASE_DIR/releases/$VERSION'; tar -C '$BASE_DIR/releases' -xzf '$BASE_DIR/uploads/$VERSION.tar.gz'; bash '$BASE_DIR/releases/$VERSION/scripts/prod-lite-activate-remote.sh' '$VERSION'"

echo "[done] deployed $VERSION"
