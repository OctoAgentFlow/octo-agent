# Contributing

Thanks for taking an interest in OctoAgentFlow.

This project is an AI social operations workflow for X accounts. Contributions
should strengthen controlled, review-first social workflows rather than push the
project toward spam, guaranteed growth claims, or unreviewed automation.

## Good Contribution Areas

- Frontend workflow polish for Daily Growth Desk, Exposure Radar, OAF Bots,
  Content Memory, Content Drafts, and Handling List.
- Backend reliability for auth, billing, scheduler jobs, review queues,
  publishing workflows, and compatibility contracts.
- Documentation that helps operators and developers understand the system.
- Security improvements, secret hygiene, test coverage, and safer defaults.
- GitHub Pages website improvements that present the project clearly.

## Local Setup

Prerequisites:

- Node.js 22+
- npm 10+
- Go 1.25+
- MySQL 8+

Install dependencies:

```bash
make install
```

Create local environment files:

```bash
cp backend/configs/.env.example backend/configs/.env
cp frontend/.env.example frontend/.env.local
```

Edit the local backend config files for your MySQL DSN:

- `backend/configs/config.local.api.yaml`
- `backend/configs/config.local.admin.yaml`

Run local services in separate terminals:

```bash
make api-local
make admin-local
make api-front-local
make admin-front-local
```

## Checks

Use the smallest relevant check while developing, then run broader checks before
opening a pull request.

```bash
make lint
scripts/smoke-core-workflows.sh
scripts/check-legacy-compat-contracts.sh
cd frontend && npm run build:github-pages
```

Run the compatibility guard when touching guarded backend models, DTOs,
repositories, routers, scheduler jobs, or legacy billing fields.

## Pull Request Expectations

- Keep changes focused and explain the user-visible behavior.
- Include screenshots for visible frontend or website changes.
- Add or update tests when changing backend contracts, billing, auth,
  publishing, scheduler behavior, review queues, or shared frontend state.
- Preserve compatibility fields unless a migration is explicitly planned.
- Do not commit `.env` files, credentials, production endpoints, logs, build
  output, screenshots with private data, or private deployment notes.

## Product Language

Use concrete, operator-focused language:

- AI social operations
- OAF Bot
- Persona-based workflow
- Content memory
- Guardrails
- Review queue
- Execution queue
- Publishing pipeline
- Controlled automation
- Human-in-the-loop

Avoid claims that imply guaranteed growth, spam behavior, passive income, or
full replacement of human operators.

## Documentation Updates

Update documentation when a change affects setup, public behavior, API shape,
database contracts, GitHub Pages deployment, or contribution workflow.

Public docs live under `docs/`. Private launch notes, deployment runbooks, and
growth plans should stay out of this repository.
