#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-${PROD_HOST:-}}"
USER_NAME="${PROD_USER:-ubuntu}"
DOMAINS="${PROD_HTTPS_DOMAINS:-octo-agent.com,www.octo-agent.com,admin.octo-agent.com}"

if [ -z "$HOST" ]; then
  echo "usage: $0 <host>"
  echo "example: $0 <your-server-ip>"
  exit 1
fi

domain_args=()
IFS=',' read -ra domain_list <<<"$DOMAINS"
for domain in "${domain_list[@]}"; do
  domain="$(echo "$domain" | xargs)"
  if [ -n "$domain" ]; then
    domain_args+=("-d" "$domain")
  fi
done

if [ "${#domain_args[@]}" -eq 0 ]; then
  echo "no domains provided"
  exit 1
fi

printf -v remote_domains '%q ' "${domain_args[@]}"

ssh "$USER_NAME@$HOST" "DOMAIN_ARGS='$remote_domains' bash -s" <<'REMOTE'
set -euo pipefail

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx $DOMAIN_ARGS --register-unsafely-without-email --agree-tos --non-interactive --redirect
sudo nginx -t
sudo systemctl reload nginx
echo "[https] enabled"
REMOTE

