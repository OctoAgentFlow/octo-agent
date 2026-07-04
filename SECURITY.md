# Security Policy

## Supported Versions

Security fixes are handled on the default branch.

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability.

Report privately through GitHub Security Advisories for this repository. Include:

- Affected component or route.
- Steps to reproduce.
- Expected impact.
- Any relevant logs with secrets removed.

## Secret Handling

Never commit:

- API keys or LLM provider keys.
- OAuth client secrets, access tokens, refresh tokens, or bearer tokens.
- Database credentials or DSNs.
- JWT, webhook, signing, or state secrets.
- Wallet private keys or production payment addresses.
- Deployment hostnames, private server IPs, SSH details, logs, or runbooks.

Use local ignored files such as `backend/configs/.env` and
`frontend/.env.local` for private values.
