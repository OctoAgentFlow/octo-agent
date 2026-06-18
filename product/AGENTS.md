# Product Notes Rules

Most files in this `product/` directory are historical research notes from the
Daily X Queue exploration phase. The current OctoAgentFlow product direction is
Daily Growth Desk / Exposure Radar as the first-day workbench, with Content
Drafts, Content Memory, OAF Bots, and Handling List as supporting surfaces.

Deprecated: the test environment servers have been released. Do not use `https://test.octo-agent.com` or test deployment scripts for acceptance.

All E2E acceptance and product readiness checks that require a server
environment should now run against the prod environment, with production-safety
precautions.

Local checks may be used only for development sanity, such as lint, build, and unit tests. Local environment is not the acceptance source of truth.

Do not block acceptance because local `OPENAI_API_KEY` is missing.

Do not ask for local secrets.

The prod backend owns server-side LLM configuration.

Current product readiness means:

- prod-environment browser flow passes
- registration/login can reach the day-one path
- account analysis can apply Growth Strategy into Daily Growth Desk
- Exposure Radar explains data quality when no hot opportunities appear
- a manual reply draft can be generated, copied, and recorded as handled
- Content Memory and Handling List reflect the handoff
- no leakage into legacy Auto Post, Review Queue, Execution Queue, or
  unattended automation language
