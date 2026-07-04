# OctoAgentFlow

[![Release](https://img.shields.io/github/v/release/OctoAgentFlow/octo-agent?label=release)](https://github.com/OctoAgentFlow/octo-agent/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Validate](https://github.com/OctoAgentFlow/octo-agent/actions/workflows/validate.yml/badge.svg)](https://github.com/OctoAgentFlow/octo-agent/actions/workflows/validate.yml)

[Website](https://octoagentflow.github.io/octo-agent/)

OctoAgentFlow is an AI social operations workflow for X accounts.

The product is centered on controlled, human-in-the-loop growth work: finding timely opportunities, generating persona-aware drafts, saving useful context into memory, and helping operators handle replies and content manually with guardrails.

It is not positioned as a fully automated engagement bot. The current product direction is safe manual operation with AI assistance.

## Product Direction

Core surfaces:

- Daily Growth Desk: a daily operating surface for X growth work.
- Exposure Radar: Chinese and English opportunity signals, hot/rising classification, diagnostics, reply angle suggestions, and manual handling records.
- OAF Bots: persona, voice, topics, boundaries, and learning preferences for each X account.
- Content Memory: reusable product points, signal context, reply learnings, and source traces.
- Content Drafts: copy-ready post or reply suggestions built from persona, memory, and opportunity context.
- Handling List: review, edit, copy, open original post, record handling outcome, and track follow-through.
- Account Intelligence: public-account positioning analysis and improvement suggestions based on data the system can legally access.

## Tech Stack

- Frontend: Next.js App Router, React, Tailwind CSS, shadcn-style components, React Hook Form, Zod.
- Backend: Gin, GORM, MySQL.
- Tooling: Make targets plus smoke and compatibility checks under `scripts/`.

## Environment Prerequisites

- Node.js 22+
- npm 10+
- Go 1.25+
- MySQL 8+

## Local Development

### Backend

1. Configure MySQL and YAML:
   - API uses `backend/configs/config.local.api.yaml`.
   - Admin API uses `backend/configs/config.local.admin.yaml`.
   - Compatibility fallback: if `APP_SERVICE` is not set, backend reads `backend/configs/config.local.yaml`.
   - Optional: copy `backend/configs/.env.example` to `backend/configs/.env`; otherwise local is used.
2. Ensure MySQL is running and the target database exists.
3. Start backend services:
   - API: `make api-local`
   - Admin API: `make admin-local`

Backend service defaults:

- API: `http://localhost:10001`
- API health: `GET /health`
- API prefix: `/api/v1`
- Admin API: `http://localhost:10002`
- Admin health: `GET /admin/health`

### Frontend

1. Create `frontend/.env.local` when needed:
   - `NEXT_PUBLIC_API_BASE_URL=http://localhost:10001/api/v1`
2. Install dependencies:
   - `cd frontend && npm install`
3. Start frontend services:
   - API Front: `make api-front-local`
   - Admin Front: `make admin-front-local`

Frontend service defaults:

- API Front: `http://localhost:3000`
- Admin Front: `http://localhost:3001`

## Useful Commands

- `make api-front-local` - run API Front on port 3000.
- `make admin-front-local` - run Admin Front on port 3001.
- `make api-local` - run local API service.
- `make admin-local` - run local Admin API service.
- `make install` - install frontend dependencies and tidy Go modules.
- `make lint` - run frontend lint and backend tests.
- `scripts/smoke-core-workflows.sh` - run static workflow checks.
- `scripts/check-legacy-compat-contracts.sh` - validate preserved compatibility contracts.

## Runtime Notes

The default backend scheduler currently focuses on safe operational jobs:

- Email-code cleanup.
- Scheduled post compatibility.
- Content Draft generation.
- Exposure Radar refresh.
- X Trends cache refresh.
- Publishing job processing with configured publisher guardrails.
- Billing scanner, point expiry, and margin alerts.

Legacy Auto Reply, Auto Comment, and Auto DM background loops are not part of the default scheduler path. Their authenticated historical API routes are no longer registered; public DM unsubscribe links remain for compliance.

## Legacy Boundaries

Some historical names remain in code, database fields, and compatibility DTOs because existing data still depends on them.

- New product code should prefer `ContentDraft`, `HandlingList`, `ExposureRadar`, `DailyGrowthDesk`, and `ContentMemory` language.
- `/content-drafts` is the product route for content strategy drafts.
- `/handling-list` is the product route for manual review and follow-through.
- `/auto-post`, `/execution-queue`, `/review-queue`, `/auto-replies`, authenticated `/auto-dm`, `/auto-comment`, and `/auto-comments` are downlined routes and should return no product surface.
- Historical DB table names, JSON quota fields, activity keys, and AI usage scene strings remain stable until a dedicated data migration is planned.
- Public DM unsubscribe links remain available for historical compliance.

## Repository Structure

- `frontend/`: Next.js application.
- `backend/`: Gin API and Admin API services.
- `scripts/`: local development, smoke, and compatibility helpers.
- `docs/`: public API and database reference documents.

Private deployment runbooks, launch notes, growth plans, and acceptance reports
are intentionally not included in this public repository.

## Security

Do not commit `.env` files, API keys, OAuth secrets, database credentials,
wallet private keys, or production payment addresses. See [SECURITY.md](SECURITY.md)
for reporting guidance.
