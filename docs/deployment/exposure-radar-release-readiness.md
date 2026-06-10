# Exposure Radar Release Readiness

Last updated: 2026-06-11

## Decision Gate

Exposure Radar can move to prod only after the checklist below is complete. The feature is review-first: it may generate reply drafts and route them into the review queue, but it must not publish automatically.

## Release Scope

- `/exposure-radar` user-facing page.
- `GET /api/v1/trends/exposure-radar`.
- `GET /api/v1/trends/exposure-radar/performance`.
- `POST /api/v1/auto-comments/exposure-radar-drafts`.
- Owned English and Chinese X recent-search collectors.
- Chinese TL1 fallback.
- Review-memory ranking, collector learning, and Bot/account-scoped learning.

## Required Prod Configuration

Backend API config must include:

```yaml
x_trends:
  enabled: true
  bearer_token: "<X bearer token with trends and recent-search access>"
  interval_hours: 12
  max_trends: 20
  retention_days: 14
  exposure_refresh_minutes: 15
  exposure_topic_limit: 16
  exposure_search_results: 25
  exposure_max_fans: 10000
  exposure_min_heat: 3
  exposure_learning:
    ranking_enabled: true
    collector_enabled: true
    mode: "hybrid"
    window_days: 30
```

Environment overrides are documented in [env.md](./env.md). If prod uses env overrides, verify the runtime environment, not only the YAML file.

## Pre-Deploy Checklist

- `APP_ENV` points at prod config; test config paths are deprecated.
- `X_TRENDS_BEARER_TOKEN` or `X_BEARER_TOKEN` is present in the backend API runtime.
- X bearer token has access to X API v2 recent search.
- `x_trends.enabled=true` in the API service config.
- `exposure_refresh_minutes` is not lower than planned API quota can support.
- `exposure_topic_limit * exposure_search_results` is within the expected per-refresh X API budget.
- `exposure_learning.ranking_enabled` is intentionally set.
- `exposure_learning.collector_enabled` is intentionally set.
- `exposure_learning.mode` is one of `hybrid`, `workspace`, or `scoped`.
- `exposure_learning.window_days` is between 1 and 90.
- `x_publisher` remains review/manual safe; scheduler must not auto-publish real X actions from Radar.
- DB AutoMigrate includes `exposure_tweet_signals` and the added `auto_comment_tasks` source metadata columns before smoke testing.
- Frontend build includes the `/exposure-radar` route and sidebar/mobile navigation entry.

## Deploy-Time Validation

Run before opening the feature broadly:

```bash
cd backend
go test ./...

cd ../frontend
npm run lint:i18n
npm run lint
npm run build
```

Then perform the smoke test in [exposure-radar-smoke-test.md](../runbooks/exposure-radar-smoke-test.md).

## Operator Checks

Use the page-level Source Health panel to confirm:

- Chinese region shows `OAF Chinese tweet collector` when owned signals exist.
- Chinese region shows `TL1 fallback` only when owned Chinese signals are unavailable.
- English region shows `OAF English tweet collector` when owned signals exist.
- English region shows `X Trends cache` only when recent-search owned signals are unavailable.
- `Last collected` is recent enough for the configured `exposure_refresh_minutes`.
- `Data quality` is `tweet-level` before generating drafts.

Use the Performance panel to confirm:

- `Ranking learning` shows the intended on/off state.
- `Collector learning` shows the intended on/off state.
- `Mode` matches prod config.
- `Window` matches prod config.
- `Ranking scope` is explainable for the selected Bot/account.

## Tuning Notes

- Increase `exposure_topic_limit` only when X API quota can support broader scanning.
- Increase `exposure_search_results` when high-quality topics return too few candidates.
- Increase `exposure_refresh_minutes` if recent-search API usage is too high.
- Lower `exposure_max_fans` to focus on smaller authors and less crowded reply sections.
- Raise `exposure_min_heat` to reduce low-signal candidates.
- Disable `collector_enabled` if review-memory topics become too narrow or repeat too often.
- Use `mode=scoped` when a Bot/account has enough history and should not inherit workspace-level preferences.
- Use `mode=workspace` during cold start or when multiple Bots share similar audience/context.
- Keep `mode=hybrid` as the default production posture.

## Rollback Plan

Soft rollback options:

- Disable ranking learning:
  - `X_TRENDS_EXPOSURE_LEARNING_RANKING_ENABLED=false`
- Disable collector learning:
  - `X_TRENDS_EXPOSURE_LEARNING_COLLECTOR_ENABLED=false`
- Slow collector refresh:
  - increase `X_TRENDS_EXPOSURE_REFRESH_MINUTES`
- Stop owned collection while keeping fallback/topic cache available:
  - `X_TRENDS_ENABLED=false`

Hard rollback:

- Hide `/exposure-radar` from navigation if a user-facing issue appears.
- Keep the backend routes deployed if review queue tasks already reference Exposure Radar source metadata.

## Known Limitations

- X recent search access and quota determine owned collector freshness.
- `lang:zh` does not perfectly represent every Chinese-language X community.
- TL1 is a public fallback only, not an owned or contracted data dependency.
- Owned raw signal collection is shared; Bot/account personalization happens after a user routes opportunities into review.
- Ranking memory is based on review outcomes, not guaranteed future engagement.
- The feature supports controlled social operations and review-first reply workflows; it must not be positioned as guaranteed exposure or automated growth.
