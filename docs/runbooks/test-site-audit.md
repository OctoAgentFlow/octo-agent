# Test Site Audit Runbook

Deprecated: the test environment servers have been released. This runbook is retained for the isolated-browser audit workflow only. For current server QA, pass a prod base URL explicitly and use production-safety precautions.

Use this when Chrome extension automation is slow, restores old tabs, or cannot reliably inspect the test site.

## What It Does

`scripts/audit-test-site.mjs` launches a temporary isolated Chrome profile with DevTools enabled, audits the target site, writes JSON and Markdown reports, then closes Chrome and removes the temporary profile.

It does not use the daily Chrome profile, so it does not restore old tabs or mutate the user's browser session.

## Smoke Audit

```bash
node scripts/audit-test-site.mjs --base=https://octo-agent.com
```

Latest reports:

```text
logs/audit/test-site-audit-latest.json
logs/audit/test-site-audit-latest.md
```

## Focused Audit

```bash
node scripts/audit-test-site.mjs \
  --base=https://octo-agent.com \
  '--routes=/dashboard,/opportunities,/execution-queue?publish_outcome=dry_run'
```

## Authenticated Audit

The dashboard app stores auth at `localStorage.octo_auth_session`.

Use a dedicated test user, not a personal daily Chrome profile:

```bash
OAF_AUDIT_EMAIL='test@example.com' \
OAF_AUDIT_PASSWORD='...' \
node scripts/audit-test-site.mjs --base=https://octo-agent.com
```

You can also provide a token directly:

```bash
OAF_AUDIT_ACCESS_TOKEN='...' \
OAF_AUDIT_REFRESH_TOKEN='...' \
node scripts/audit-test-site.mjs --base=https://octo-agent.com
```

Or provide the full session JSON:

```bash
OAF_AUDIT_AUTH_SESSION='{"loggedIn":true,"loginAt":1760000000000,"accessToken":"...","refreshToken":"..."}' \
node scripts/audit-test-site.mjs --base=https://octo-agent.com
```

## Useful Options

```text
--base=<url>          Target site. Do not use released test URLs; pass the current prod URL explicitly.
--routes=<csv>        Comma-separated routes.
--timeout=<ms>        Per-route navigation wait. Defaults to 9000.
--output=<dir>        Report directory. Defaults to logs/audit.
--headed              Show the isolated Chrome window.
--keep-profile        Keep the temporary Chrome profile for debugging.
--profile-dir=<path>  Use a specific disposable profile directory.
--chrome=<path>       Override Chrome binary path.
--no-control-check    Skip interactive control inventory checks.
```

## Interpreting Results

- `FAIL`: route has visible untranslated keys or a runtime/navigation error.
- `Warning: login-gated`: the isolated profile reached `/login`; provide a test token for authenticated QA.
- `Warning: Body text is nearly empty`: the page shell mounted but no meaningful content rendered within the timeout.
- `Controls checked`: visible buttons, links, inputs, selects, textareas, and role=button elements discovered across audited routes.
- `Warning: Missing expected controls`: the page loaded, but a route-specific expected action was not visible in the current data state.
- `Warning: Unlabeled controls`: a visible interactive element has no text, aria label, title, placeholder, or value.
- `Warning: Controls with blocked click targets`: the control was visible and enabled, but its center point was not the element Chrome would click.
- Console and network errors are included in the page notes.
