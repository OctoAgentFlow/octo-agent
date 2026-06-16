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
| `/accounts` | Bind, inspect, and disconnect X accounts; show readiness and account intelligence entry points. | `GET /accounts`, `POST /accounts/oauth/x/start`, OAuth callback, `DELETE /accounts/:id`. |
| `/oaf-bots` | Configure account persona, voice, topics, boundaries, language style, and learning preferences. | `GET/POST/PUT /oaf-bots`, `POST /oaf-bots/:id/test-generate`, `GET /oaf-bots/:id/generation-usages`. |
| `/exposure-radar` | Daily Growth Desk: opportunity signals, hot/rising filters, diagnostics, strategy, reply angles, people radar, manual records, and learning loop. | `/trends/exposure-radar*`, `/exposure-radar/drafts*`, `/exposure-radar/manual-records*`, `/exposure-radar/strategy`, `/exposure-radar/people*`. |
| `/content-drafts` | Content strategy drafts from persona, memory, trends, and opportunity context. | `/content-drafts/plans*`, `/content-drafts/runs`, `/content-drafts/drafts*`, `/content-library/items`. |
| `/daily-x-queue` | Daily content material and draft preparation workflow. | `/daily-x-queue*`, content memory, OAF Bot, and draft generation APIs. |
| `/handling-list` | Manual handling list: review, edit, copy, open original post, mark handled, inspect feedback, and track publishing/result states. | `GET /review-queue`, content draft actions, exposure draft actions, publishing job actions, and feedback APIs. |
| `/review-queue` | Compatibility redirect to Handling List. | Redirects to `/handling-list`. |
| `/posts` | Traditional post list and creation flow kept for direct content management. | `GET/POST/PUT/DELETE /posts`, `POST /posts/:id/execute`, `POST /posts/generate`. |
| `/activity` | Activity log and failure investigation. | `GET /activities` with type, status, time range, account, and failure filters. |
| `/analytics` | Internal performance analytics and available public X metrics. | `GET /analytics/overview?range=7d|30d&account_id=...`. |
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
| `/auto-post` page/API | Deprecated compatibility for Content Drafts. API access is logged with deprecation headers. | `/content-drafts` and `/api/v1/content-drafts`. |
| `/execution-queue` page | Compatibility implementation behind Handling List. | `/handling-list`. |
| `/auto-replies` API | Protected legacy automation API; blocked by default. | Manual reply/opportunity drafts through `/api/v1/exposure-radar/drafts`. |
| Authenticated `/auto-dm` API | Protected legacy automation API; blocked by default except public unsubscribe. | Manual growth workflows and account operations; no direct replacement for automated DM outreach. |
| `/auto-comment` and `/auto-comments` APIs | Protected legacy automation APIs; blocked by default. | `/api/v1/exposure-radar/drafts` and manual handling records. |

Emergency rollback for protected legacy automation APIs requires setting `OCTO_ALLOW_LEGACY_AUTOMATION_ROUTES=true` in the server environment. This should only be used temporarily while investigating historical data or old clients.

## Information Architecture

- OAF Bot is the persona layer: it defines how the account should sound and what boundaries it should respect.
- Exposure Radar is the discovery layer: it finds and explains timely X opportunities.
- Content Memory is the context layer: it stores reusable product, signal, and feedback knowledge.
- Content Drafts are the creation layer: they produce copy-ready suggestions.
- Handling List is the human decision layer: operators review, copy, publish manually where appropriate, and record outcomes.
- Analytics and Admin are the observability layers: they show usage, results, costs, and operational health.
