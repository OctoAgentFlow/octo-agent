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

1. Create env file:
   - `cp backend/configs/.env.example backend/configs/.env`
2. Ensure MySQL is running and the target DB exists.
3. Start backend services:
   - API: `make api-dev`
   - Admin: `make admin-dev`

Backend services:
- API listens on `http://localhost:10001`, with:
- health check: `GET /health`
- API prefix: `/api/v1`
- Admin listens on `http://localhost:10002`, with:
  - health check: `GET /health`
  - admin health: `GET /admin/health`

### 2) Frontend

1. Create env file:
   - `cp frontend/.env.example frontend/.env.local`
2. Install deps:
   - `cd frontend && npm install`
3. Start frontend services:
   - API Front: `make api-front-dev`
   - Admin Front: `make admin-front-dev`

Frontend services:
- API Front runs on `http://localhost:3000`
- Admin Front runs on `http://localhost:3001`

## Useful Commands

- `make frontend-dev` - run default Next.js dev server (api-front)
- `make api-front-dev` - run API Front service (3000)
- `make admin-front-dev` - run Admin Front service (3001)
- `make api-dev` - run Gin API service (10001)
- `make admin-dev` - run Gin Admin service (10002)
- `make install` - install frontend deps + tidy go mod
- `make lint` - frontend lint + backend tests

## Current Scaffold Coverage

- Frontend route groups:
  - `(auth)`: login
  - `(dashboard)`: dashboard/accounts/posts/agents/analytics/settings
- Backend layered architecture:
  - `controller`, `service`, `model`, `repository`, `router`, `middleware`, `dto`, `integration`, `jobs`
- AutoMigrate models:
  - `User`, `TwitterAccount`, `Post`, `Agent`, `Task`
- Deployment/doc templates:
  - `deploy/nginx`, `deploy/docker`, `deploy/compose`, `docs/*`

## Repository Structure

- `frontend/`: Next.js application
- `backend/`: Gin API service
- `deploy/`: Nginx, Docker, Compose templates
- `docs/`: Product/API/Database/Deployment docs
- `scripts/`: Root helper scripts
