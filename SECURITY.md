# Security Policy

## Supported Versions

Security fixes are handled on the default branch.

This public repository does not include private deployment runbooks, production
secrets, or server access material.

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

Report privately through GitHub Security Advisories for this repository. Include
as much of the following as you safely can:

- Affected component, route, job, or workflow.
- Steps to reproduce.
- Expected impact.
- Whether credentials, user data, billing data, or publishing workflows are
  involved.
- Relevant logs with secrets and private identifiers removed.

## Secret Handling

Never commit:

- API keys or LLM provider keys.
- OAuth client secrets, access tokens, refresh tokens, or bearer tokens.
- Database credentials or DSNs.
- JWT, webhook, signing, or state secrets.
- Wallet private keys or production payment addresses.
- Deployment hostnames, private server IPs, SSH details, logs, or runbooks.
- Screenshots that expose tokens, dashboards, customer data, or private billing
  details.

Use local ignored files such as `backend/configs/.env` and
`frontend/.env.local` for private values.

## Security-Sensitive Areas

Use extra care when changing:

- Authentication and wallet binding.
- Billing scanners, payment matching, and credit accounting.
- Scheduler jobs and publishing workflows.
- X OAuth or provider integrations.
- Admin routes and internal operational tooling.
- GitHub Actions and deployment configuration.

## Disclosure Expectations

Please give maintainers reasonable time to investigate and patch a report before
public disclosure. We will prioritize issues based on impact, exploitability,
and whether private credentials or user-controlled publishing behavior are at
risk.
