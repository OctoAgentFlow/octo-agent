#!/usr/bin/env bash
set -euo pipefail
service="${1:-api}"
if [ "$service" = "admin" ]; then
  go run ./cmd/admin
else
  go run ./cmd/api
fi
