#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-${PROD_HOST:-}}"
USER_NAME="${PROD_USER:-ubuntu}"
BASE_DIR="${PROD_BASE_DIR:-/home/ubuntu/octo}"

if [ -z "$HOST" ]; then
  echo "usage: $0 <host>"
  echo "example: $0 <your-server-ip>"
  exit 1
fi

ssh "$USER_NAME@$HOST" "BASE_DIR='$BASE_DIR' bash -s" <<'REMOTE'
set -euo pipefail

echo "[init] base=$BASE_DIR"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg nginx rsync tar gzip lsof

if ! command -v node >/dev/null 2>&1 || ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 20 || (major === 20 && minor >= 9) ? 0 : 1)' >/dev/null 2>&1; then
  echo "[init] installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

if ! swapon --show | awk 'NR > 1 { found = 1 } END { exit found ? 0 : 1 }'; then
  echo "[init] creating 4G swap"
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  if ! grep -q '^/swapfile ' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
fi

mkdir -p "$BASE_DIR/releases" "$BASE_DIR/uploads" "$BASE_DIR/shared/backend/configs" "$BASE_DIR/shared/logs/deploy" "$BASE_DIR/shared/logs/pid"

cat > /tmp/octo-agent.nginx <<'NGINX'
server {
    listen 80;
    server_name octo-agent.com www.octo-agent.com;

    client_max_body_size 20m;

    location /api/v1/ {
        proxy_pass http://127.0.0.1:12001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:4300;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name admin.octo-agent.com;

    client_max_body_size 20m;

    location /api/v1/ {
        proxy_pass http://127.0.0.1:12002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:4301;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
sudo mv /tmp/octo-agent.nginx /etc/nginx/sites-available/octo-agent
sudo ln -sfn /etc/nginx/sites-available/octo-agent /etc/nginx/sites-enabled/octo-agent
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx >/dev/null
sudo systemctl reload nginx

echo "[init] node=$(node -v) npm=$(npm -v)"
free -h
echo "[init] done"
REMOTE

