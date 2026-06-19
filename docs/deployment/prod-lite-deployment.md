# Prod Lite Deployment Runbook

This runbook documents the current lightweight production deployment flow for the AWS t3.micro server.

Current production host:

- EC2 public IP: `<your-server-ip>`
- SSH user: `ubuntu`
- Base directory: `/home/ubuntu/octo`
- User site: `https://octo-agent.com`
- Admin site: `https://admin.octo-agent.com/admin`

Cloudflare DNS should point `octo-agent.com`, `www.octo-agent.com`, and `admin.octo-agent.com` to the current EC2 public IP. The origin also has a Let's Encrypt certificate, so both proxied and DNS-only HTTPS modes can work.

## Service Layout

| Service | Port | Bind | Notes |
| --- | ---: | --- | --- |
| API backend | `12001` | all interfaces | `APP_ENV=prod APP_SERVICE=api` |
| Admin backend | `12002` | all interfaces | `APP_ENV=prod APP_SERVICE=admin` |
| User frontend | `4300` | `127.0.0.1` | Next.js `api` role |
| Admin frontend | `4301` | `127.0.0.1` | Next.js `admin` role |
| nginx HTTP | `80` | all interfaces | redirects to HTTPS after certbot |
| nginx HTTPS | `443` | all interfaces | reverse proxy |

Runtime directories:

| Path | Purpose |
| --- | --- |
| `/home/ubuntu/octo/current` | symlink to active release |
| `/home/ubuntu/octo/releases/<version>` | unpacked releases |
| `/home/ubuntu/octo/uploads` | uploaded release archives |
| `/home/ubuntu/octo/shared/backend/configs/.env` | server-local secrets, never committed |
| `/home/ubuntu/octo/shared/logs/deploy` | service logs |
| `/home/ubuntu/octo/shared/logs/pid` | service PID files |

## First-Time Server Setup

1. Confirm local SSH works:

```bash
ssh ubuntu@<your-server-ip> 'hostname'
```

2. Initialize packages, swap, directories, and nginx:

```bash
scripts/prod-lite-init-server.sh <your-server-ip>
```

3. Put production secrets on the server:

```bash
scp backend/configs/.env ubuntu@<your-server-ip>:/home/ubuntu/octo/shared/backend/configs/.env
```

Do not commit `.env` files or print secret values in logs.

4. Enable HTTPS after DNS points at the server:

```bash
scripts/prod-lite-enable-https.sh <your-server-ip>
```

## Normal Deployment

The lightweight deployment builds locally and only uploads the runtime artifact to the server. This avoids building Go and Next.js on t3.micro.

### Release Checklist

Before deploying a branch that touches Content Drafts, Handling List, billing
quota fields, scheduler naming, router registration, AI usage scenes, activity
display compatibility, or legacy `auto_post` contracts, run the compatibility
guard locally:

```bash
scripts/check-legacy-compat-contracts.sh
```

Or include it in the core workflow smoke:

```bash
SMOKE_LEGACY_COMPAT=1 scripts/smoke-core-workflows.sh
```

The GitHub Actions workflow `Legacy Compatibility Guard` is also available as a
manual `workflow_dispatch` check and runs automatically on pull requests that
touch the guarded compatibility paths. It is a release safety check, not a data
migration step.

```bash
scripts/prod-lite-build-upload.sh <your-server-ip>
```

The script:

- builds Linux amd64 backend binaries locally
- builds user and admin Next.js bundles locally
- excludes Next.js build caches from the release archive
- uploads the archive to `/home/ubuntu/octo/uploads`
- extracts it under `/home/ubuntu/octo/releases`
- switches `/home/ubuntu/octo/current`
- restarts the four services
- runs local health checks before reporting success
- after successful health checks, keeps the latest 3 releases and upload archives, then removes older ones to protect disk space

To keep more rollback points during a risky deploy, override the cleanup retention:

```bash
PROD_LITE_KEEP_RELEASES=5 scripts/prod-lite-build-upload.sh <your-server-ip>
```

## Health Check

Run the full production health check:

```bash
scripts/prod-lite-health-check.sh <your-server-ip>
```

It verifies:

- current release symlink and revision
- server-local `.env` presence without printing values
- backend, frontend, nginx HTTP, and nginx HTTPS listeners
- backend health endpoints
- user and admin frontend routes
- nginx config syntax
- memory and disk status
- external HTTPS access for user, www, and admin domains

The script exits non-zero when a required check fails.

## Manual Checks

Useful focused checks:

```bash
ssh ubuntu@<your-server-ip> 'cat /home/ubuntu/octo/current/REVISION'
ssh ubuntu@<your-server-ip> 'ss -ltnp | grep -E ":1200(1|2)|:430(0|1)|:80|:443"'
curl -I https://octo-agent.com/
curl -I https://admin.octo-agent.com/admin
```

Service logs:

```bash
ssh ubuntu@<your-server-ip> 'tail -100 /home/ubuntu/octo/shared/logs/deploy/backend-api.log'
ssh ubuntu@<your-server-ip> 'tail -100 /home/ubuntu/octo/shared/logs/deploy/backend-admin.log'
ssh ubuntu@<your-server-ip> 'tail -100 /home/ubuntu/octo/shared/logs/deploy/api-front.log'
ssh ubuntu@<your-server-ip> 'tail -100 /home/ubuntu/octo/shared/logs/deploy/admin-front.log'
```

## Rollback

To roll back to a previous release, list releases and activate the target version:

```bash
ssh ubuntu@<your-server-ip> 'ls -1 /home/ubuntu/octo/releases'
ssh ubuntu@<your-server-ip> 'bash /home/ubuntu/octo/releases/<version>/scripts/prod-lite-activate-remote.sh <version>'
```

Then run:

```bash
scripts/prod-lite-health-check.sh <your-server-ip>
```

## Notes

- Test deployment scripts are deprecated because the test server was released.
- Keep production secrets only in `/home/ubuntu/octo/shared/backend/configs/.env` or other server-local secret stores.
- Production Node.js runtime is Node 22+. Run `scripts/prod-lite-init-server.sh` on a fresh host before deploying.
- t3.micro is enough for the current lightweight runtime, but local builds are preferred because installing/building on the server uses swap and can be slow.
- If package runtime dependencies change heavily, the first deployment of a new release may spend several minutes in `npm install --omit=dev`.
- The release activator cleans old `/home/ubuntu/octo/releases/octo-*` directories and `/home/ubuntu/octo/uploads/octo-*.tar.gz` archives only after health checks pass. The default retention is 3 and can be changed with `PROD_LITE_KEEP_RELEASES`.
