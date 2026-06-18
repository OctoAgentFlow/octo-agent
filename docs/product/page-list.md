# Page List

This document maps the current product pages to their backend API areas. It is written around the current manual, safe X growth workflow.

## Public And Auth

| Path | Purpose | Backend/API |
| --- | --- | --- |
| `/` | Marketing site for AI social operations, Exposure Radar, OAF Bot, Content Memory, and manual workflows. | `GET /public/site-links`; pricing copy is localized in the frontend and plan data comes from Billing. |
| `/login` | Login and registration with email codes. | `POST /auth/email-code/send`, `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /users/me`. |
| `/unsubscribe/[token]` | Public historical DM unsubscribe page. | `GET/POST /auto-dm/unsubscribe/:token`; no login required. |

## Operator App

| Path | Purpose | Backend/API |
| --- | --- | --- |
| `/dashboard` | Operator overview: subscription, readiness, recent activity, account status, and workflow health. | `GET /dashboard/overview`, `GET /billing/subscription`, `GET /activities`, `GET /automations/runtime-status`. |
| `/start-today` | Stable first-run entry point for a safe daily growth session; redirects to the day-one Daily Growth Desk path. | Redirects to `/exposure-radar?tab=today&activation=first_day#first-day-path`. |
| `/accounts` | Bind, inspect, and disconnect X accounts; show readiness, account intelligence entry points, and data-source boundaries for public X data, user-provided context, OAF workflow data, and unavailable Creator Studio private metrics. | `GET /accounts`, `POST /accounts/oauth/x/start`, OAuth callback, `DELETE /accounts/:id`. |
| `/oaf-bots` | Configure account persona, voice, topics, boundaries, language style, and learning preferences. | `GET/POST/PUT /oaf-bots`, `POST /oaf-bots/:id/test-generate`, `GET /oaf-bots/:id/generation-usages`. |
| `/exposure-radar` | Daily Growth Desk: opportunity signals, hot/rising filters, diagnostics, strategy, reply angles, people radar, manual records, and learning loop. | `/trends/exposure-radar*`, `/exposure-radar/drafts*`, `/exposure-radar/manual-records*`, `/exposure-radar/strategy`, `/exposure-radar/people*`. |
| `/content-drafts` | Content strategy drafts from persona, memory, trends, and opportunity context. | `/content-drafts/plans*`, `/content-drafts/runs`, `/content-drafts/drafts*`, `/content-library/items`. |
| `/content-library` | First-class Content Memory page for reusable product context, signal notes, reply learnings, and source-traced memory. Focus links can open a specific memory item. | `GET/POST/PUT/DELETE /content-library/items`; generation handoff links back into `/content-drafts`. |
| `/daily-x-queue` | Downlined compatibility route; redirects to Content Drafts generation mode. | Redirects to `/content-drafts?panel=generate&legacy_source=daily_x_queue`; old API client is compatibility-only. |
| `/handling-list` | Manual handling list: review, edit, copy, open original post, mark usable/handled, inspect feedback, and track result states. Publisher actions stay limited to post drafts. | `GET /review-queue`, content draft actions, exposure draft actions, publishing job actions, and feedback APIs. |
| `/posts` | Post archive and direct content management. New creation is routed into Content Drafts. | `GET/POST/PUT/DELETE /posts`, `POST /posts/:id/execute`, `POST /posts/generate`; `/posts/create` redirects to `/content-drafts?panel=generate&legacy_source=posts_create`. |
| `/activity` | Support/debug activity log for generated drafts, manual handoffs, failures, and historical compatibility records. | `GET /activities` with type, status, time range, account, and failure filters. |
| `/analytics` | Operations analytics and available public X metrics; not a replacement for Creator Studio private audience panels. | `GET /analytics/overview?range=7d|30d&account_id=...`. |
| `/billing` | Plans, subscription, AI generation usage, opportunity draft capacity, orders, and payment methods. | `/billing/subscription`, `/billing/plans`, `/billing/payment-methods`, `/billing/orders*`. |
| `/settings` | User profile, password, notification settings, and language preference. | `GET/PATCH /users/me`, `PATCH /users/me/password`, `GET/PATCH /users/me/notification-settings`. |
| `/profile` | Current user profile. | `GET /users/me`. |

## Admin App

| Path | Purpose | Backend/API |
| --- | --- | --- |
| `/admin` | Admin overview, users, billing operations, execution metrics, system status, and diagnostics. | Admin API: `/admin/overview`, `/admin/users`, `PATCH /admin/users/:id`, billing/admin endpoints. |

## Legacy And Compatibility

| Legacy Path/API | Current Status | Replacement |
| --- | --- | --- |
| `/auto-post` page/API | Downlined. | `/content-drafts` and `/api/v1/content-drafts`. |
| `/automations` page | Downlined frontend route; redirects to Dashboard. Authenticated `/api/v1/automations*` remains internal compatibility for workflow health and paused-module recovery. | `/dashboard`, `/content-drafts`, `/handling-list`, and `/exposure-radar`. |
| `/points` page | Downlined user route; redirects to Billing. Point-like concepts are treated as billing credits/referrals, not a standalone product loop. | `/billing`. |
| `/trends` page | Downlined user route; redirects to Exposure Radar diagnostics. Trend cache tools remain admin/debug context. | `/exposure-radar?view=source-health` and Admin trend tools. |
| `/execution-queue` page | Downlined. | `/handling-list`. |
| `/review-queue` page | Downlined frontend route; backend API remains for Handling List data. | `/handling-list`. |
| `/auto-replies` API | Downlined authenticated legacy automation API. | Manual reply/opportunity drafts through `/api/v1/exposure-radar/drafts`. |
| Authenticated `/auto-dm` API | Downlined authenticated legacy automation API. Public unsubscribe remains. | Manual growth workflows and account operations; no direct replacement for automated DM outreach. |
| `/auto-comment` and `/auto-comments` APIs | Downlined authenticated legacy automation APIs. | `/api/v1/exposure-radar/drafts` and manual handling records. |
| `/agents` page | Legacy frontend route now redirects to the real OAF Bot workspace. | `/oaf-bots`. Backend `/api/v1/agents` remains a compatibility API only. |

Historical DB fields, stored activity keys, and DTO names may still use old `auto_*` wording for data compatibility. They are not public product routes.

## Information Architecture

- OAF Bot is the persona layer: it defines how the account should sound and what boundaries it should respect.
- Exposure Radar is the discovery layer: it finds and explains timely X opportunities.
- Content Memory is the context layer: it stores reusable product, signal, and feedback knowledge.
- Content Drafts are the creation layer: they produce copy-ready suggestions.
- Handling List is the human decision layer: operators review, copy, publish manually where appropriate, and record outcomes.
- Analytics and Admin are supporting observability layers: they show usage, results, costs, and operational health without competing with the Daily Growth Desk activation path.
