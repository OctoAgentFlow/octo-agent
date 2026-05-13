# octo-agent

Octo-Agent is a full-stack scaffold for AI-assisted social content operations.

## Tech Stack

- Frontend: Next.js (App Router) + Tailwind + shadcn/ui + React Hook Form + Zod
- Backend: Gin + GORM + MySQL (AutoMigrate on startup)
- Deploy templates: Docker + Docker Compose + Nginx

## Environment Prerequisites

- Node.js 20+
- npm 10+
- Go 1.25+
- MySQL 8+

## Local Development

### 1) Backend

1. Configure MySQL and YAML:
   - API uses `backend/configs/config.local.api.yaml`.
   - Admin API uses `backend/configs/config.local.admin.yaml`.
   - Compatibility fallback: if `APP_SERVICE` is not set, backend still reads `backend/configs/config.local.yaml`.
   - 可选：在 `backend/configs/.env` 中设置 `APP_ENV`（若不存在则默认 `local`）。
2. Ensure MySQL is running and the target DB exists.
3. Start backend services:
   - API: `make api-local`
   - Admin: `make admin-local`

Backend services:
- API listens on `http://localhost:10001`, with:
- health check: `GET /health`
- API prefix: `/api/v1`
- Admin listens on `http://localhost:10002`, with:
  - health check: `GET /health`
  - admin health: `GET /admin/health`

### 2) Frontend

1. Create `frontend/.env.local`（若仓库未提供示例文件，可至少设置）：
   - `NEXT_PUBLIC_API_BASE_URL=http://localhost:10001/api/v1`
2. Install deps:
   - `cd frontend && npm install`
3. Start frontend services:
   - API Front: `make api-front-local`
   - Admin Front: `make admin-front-local`

Frontend services:
- API Front runs on `http://localhost:3000`
- Admin Front runs on `http://localhost:3001`

## Useful Commands

- `make frontend-local` - run default Next.js dev server (api-front)
- `make api-front-local` - run API Front service (3000)
- `make admin-front-local` - run Admin Front service (3001)
- `make api-local` - run Gin API service (见 `config.local.api.yaml` 中 `api.port`，默认与文档示例一致）
- `make admin-local` - run Gin Admin service (10002)
- `make install` - install frontend deps + tidy go mod
- `make lint` - frontend lint + backend tests

## Current Scaffold Coverage

- Frontend（`frontend/src/app`）:
  - `(auth)`：登录注册
  - `(dashboard)`：dashboard、accounts、agents、activity、billing、posts、analytics、settings、profile 等
- Backend 分层：
  - `controller`, `service`, `model`, `repository`, `router`, `middleware`, `dto`, `email`, `jobs` 等
- AutoMigrate（见 `backend/internal/database/migrate.go`）:
  - `User`, `EmailVerificationCode`, `WalletChallenge`, `UserWallet`, `TwitterAccount`, `AutomationConfig`, `ActivityLog`, `ReplyReservation`, `Post`, `Agent`, `Task`, `BillingOrder`, `BillingChainTx`
  - 启动时会执行表注释（`ApplyTableComments`）及部分活动字段回填（`BackfillActivityReplyFields`）
- 文档：`docs/`（[API 索引](docs/api/README.md)、库表、部署环境等）

## Repository Structure

- `frontend/`: Next.js application
- `backend/`: Gin API service
- `deploy/`: Nginx, Docker, Compose templates
- `docs/`: Product/API/Database/Deployment/Audit docs, see [docs/README.md](docs/README.md)
- `scripts/`: Root helper scripts
