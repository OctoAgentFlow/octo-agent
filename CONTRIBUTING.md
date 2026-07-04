# Contributing

Thanks for your interest in OctoAgentFlow.

## Development Setup

1. Install prerequisites:
   - Node.js 22+
   - npm 10+
   - Go 1.25+
   - MySQL 8+
2. Install dependencies:

```bash
make install
```

3. Configure local secrets:

```bash
cp backend/configs/.env.example backend/configs/.env
cp frontend/.env.example frontend/.env.local
```

4. Edit `backend/configs/config.local.api.yaml` and
   `backend/configs/config.local.admin.yaml` for your local MySQL DSN and any
   optional provider credentials.

## Common Commands

```bash
make api-local
make admin-local
make api-front-local
make admin-front-local
make lint
scripts/smoke-core-workflows.sh
```

## Pull Requests

- Keep changes focused and explain the user-visible behavior.
- Add or update tests when touching backend contracts, billing, auth, posting,
  review queues, scheduler behavior, or shared frontend state.
- Do not commit `.env` files, credentials, production endpoints, logs, build
  output, or private deployment notes.
- Run relevant checks before opening a pull request.

## Compatibility Guard

Some historical `auto_post` names remain as stable database and API contracts.
When touching guarded backend paths, run:

```bash
scripts/check-legacy-compat-contracts.sh
```
