# Daily X Queue Acceptance Rules

These rules apply to Daily X Queue E2E acceptance and product readiness checks.

Deprecated: the test environment servers have been released. Do not use `https://test.octo-agent.com` or test deployment scripts for acceptance.

All E2E acceptance and product readiness checks for Daily X Queue that require a server environment should now run against the prod environment, with production-safety precautions.

Local checks may be used only for development sanity, such as lint, build, and unit tests. Local environment is not the acceptance source of truth.

Do not block acceptance because local `OPENAI_API_KEY` is missing.

Do not ask for local secrets.

The prod backend owns server-side LLM configuration.

Daily X Queue readiness means:

- prod-environment browser flow passes
- exactly 3 drafts are generated
- edit, reject, approve, and copy work
- `daily_x_queue_activated` is recorded
- no publishing job is created
- no leakage into legacy Auto Post, Review Queue, Execution Queue, or Publishing Pipeline
- generated draft quality is acceptable
