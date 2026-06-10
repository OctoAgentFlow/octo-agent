# Environment Variables

Test 环境服务器已释放。`APP_ENV=test`、`backend/configs/config.test*.yaml`、`https://test*.octo-agent.com` 仅保留为历史/兼容引用；当前服务器开发和部署使用 prod 环境配置，并按生产安全流程操作。

- `NEXT_PUBLIC_FRONTEND_ROLE`（前端：`api` / `admin`，决定用户端或后台端入口行为）
- `NEXT_PUBLIC_API_BASE_URL`（前端，见 `frontend` 本地开发说明）
- `APP_ENV`（后端：选择环境；未设置时默认为 `local`）
- `APP_SERVICE`（后端：可选，`api` / `admin`；设置后读取 `backend/configs/config.<APP_ENV>.<APP_SERVICE>.yaml`，未设置时兼容读取 `backend/configs/config.<APP_ENV>.yaml`）

HTTP API 一览见 [docs/api/README.md](../api/README.md)。

**X 账号 OAuth**、**OAuth 完成后的前端跳转基址** 已改为在 `backend/configs/config.<env>.yaml` 中配置（`x_oauth`、`app.frontend_base_url`），无需再设置 `X_OAUTH_*` / `FRONTEND_BASE_URL` 环境变量。

> Backend 现已完全以 YAML 为准（含 MySQL 密码），不再通过 `MYSQL_PASSWORD` 环境变量覆盖。

## Recommended Local Values

- Frontend (`frontend/.env.local`)
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:10001/api/v1`
  - API Front：`NEXT_PUBLIC_FRONTEND_ROLE=api`
  - Admin Front：`NEXT_PUBLIC_FRONTEND_ROLE=admin` 且 `NEXT_PUBLIC_API_BASE_URL=http://localhost:10002/api/v1`

- Backend runtime
  - `APP_ENV=local`
  - API：`APP_SERVICE=api`
  - Admin API：`APP_SERVICE=admin`

## Local Service Split

本地开发按四个服务拆分，和部署形态保持一致：

| Service | Command | URL |
| --- | --- | --- |
| API Front | `make api-front-local` | `http://localhost:3000` |
| Admin Front | `make admin-front-local` | `http://localhost:3001` |
| API | `make api-local` | `http://localhost:10001` |
| Admin API | `make admin-api-local` | `http://localhost:10002` |

API 与 Admin API 使用拆分后的 `backend/configs/config.<env>.api.yaml` / `backend/configs/config.<env>.admin.yaml`。未设置 `APP_SERVICE` 时仍兼容旧的 `backend/configs/config.<env>.yaml`。Admin API 只挂载后台和登录相关接口，不启动用户端自动化调度任务。

## X（Twitter）OAuth 2.0（YAML）

在对应 API 环境 YAML（如 `configs/config.local.api.yaml`）中配置：

```yaml
app:
  frontend_base_url: "http://localhost:3000"

x_oauth:
  client_id: "<OAuth 2.0 Client ID>"
  client_secret: "<Client Secret>"
  redirect_uri: "http://localhost:10001/api/v1/accounts/oauth/x/callback"
  scopes: "tweet.read tweet.write users.read offline.access"
  state_secret: ""  # 可选；生产环境建议填写随机长字符串
```

- **未填写** `client_id` / `redirect_uri` 时，`POST /accounts/oauth/x/start` 会返回 400，提示在 yaml 中配置。
- `redirect_uri` 必须与 [X Developer Portal](https://developer.twitter.com/en/portal/dashboard) 里 **Callback URL** 完全一致。
- 当前 Auto Post / Auto Reply / Auto Comment 的 Publishing Pipeline 灰度发布要求 scope 至少包含：`tweet.read tweet.write users.read offline.access`。
- 如果历史账号授权时缺少 `tweet.write`，需要用户重新绑定 X 账号，后端才能在 `/publishing/status` 中识别为可发布账号。

## X Publisher（YAML）

真实 X 发布灰度由 `x_publisher` 配置控制，位于 API 服务 YAML（当前服务器使用 `backend/configs/config.prod.api.yaml`；`config.test.api.yaml` 已废弃）：

```yaml
x_publisher:
  real_publish_enabled: false
  manual_publish_enabled: true
  per_account_daily_limit: 1
  per_account_min_interval_seconds: 300
  dry_run: true
```

字段含义：

- `real_publish_enabled=false`：禁止真实调用 X API。
- `manual_publish_enabled=true`：允许前端展示人工发布入口。
- `dry_run=true`：手动发布只做发布演练，不真实发送到 X。
- `per_account_daily_limit`：单个 X 账号每日手动发布/演练次数上限。
- `per_account_min_interval_seconds`：同一 X 账号两次手动发布之间的冷却时间。

生产安全默认建议保持 `real_publish_enabled=false` 或 `dry_run=true`。只有做单账号灰度验收时，才临时改为：

```yaml
x_publisher:
  real_publish_enabled: true
  manual_publish_enabled: true
  per_account_daily_limit: 1
  per_account_min_interval_seconds: 300
  dry_run: false
```

灰度步骤见 [x-publisher-gray-release.md](./x-publisher-gray-release.md)。scheduler 不会自动真实发布；真实发布只能由用户在 Execution Queue 中手动触发。

## Exposure Radar Data Sources

Release readiness and smoke validation:

- [Exposure Radar Release Readiness](./exposure-radar-release-readiness.md)
- [Exposure Radar Smoke Test Runbook](../runbooks/exposure-radar-smoke-test.md)

Exposure Radar is available to logged-in free-plan users. It has two data-source modes:

- Chinese region (`region=zh`): uses the project's own X recent-search collector first. It searches Chinese posts from configured seed topics plus cached Chinese-looking trend topics, then stores tweet-level signals in `exposure_tweet_signals`. TL1 is retained only as a fallback when owned Chinese signals are unavailable. TL1 publicly attributes its data to 5118 collection and analysis, but this is not an owned integration, contract, or SLA.
- English region (`region=en`): uses the project's own X data path. The backend first refreshes X Trends through `x_trends`, then searches recent English tweets for selected trend topics and stores tweet-level signals in `exposure_tweet_signals`.

The English collector reuses the X bearer token already used by trends:

```yaml
x_trends:
  enabled: true
  bearer_token: "<X bearer token with recent search access>"
  exposure_refresh_minutes: 15
  exposure_topic_limit: 16
  exposure_search_results: 25
  exposure_max_fans: 10000
  exposure_min_heat: 3
  exposure_learning:
    ranking_enabled: true
    collector_enabled: true
    mode: "hybrid" # hybrid | workspace | scoped
    window_days: 30
  exposure_zh_seed_topics:
    - "AI"
    - "AI Agent"
    - "Web3"
    - "比特币"
    - "以太坊"
    - "加密货币"
    - "空投"
    - "链上"
    - "出海"
    - "创业"
    - "SaaS"
    - "增长"
```

Environment overrides:

- `X_TRENDS_BEARER_TOKEN`
- `X_BEARER_TOKEN` as a fallback
- `X_TRENDS_EXPOSURE_REFRESH_MINUTES`
- `X_TRENDS_EXPOSURE_TOPIC_LIMIT`
- `X_TRENDS_EXPOSURE_SEARCH_RESULTS`
- `X_TRENDS_EXPOSURE_MAX_FANS`
- `X_TRENDS_EXPOSURE_MIN_HEAT`
- `X_TRENDS_EXPOSURE_ZH_SEED_TOPICS` comma-separated Chinese collector seed topics
- `X_TRENDS_EXPOSURE_LEARNING_RANKING_ENABLED`
- `X_TRENDS_EXPOSURE_LEARNING_COLLECTOR_ENABLED`
- `X_TRENDS_EXPOSURE_LEARNING_MODE` (`hybrid`, `workspace`, or `scoped`)
- `X_TRENDS_EXPOSURE_LEARNING_WINDOW_DAYS`

Both owned collectors prefer low-follower authors, skip sensitive or stale posts, and store only posts above the minimum public heat threshold. English uses configured trend regions. Chinese uses Chinese seed topics and any cached trend topics that already look Chinese. If the bearer token is missing, disabled, or does not have recent search access, English Exposure Radar falls back to topic-level X Trends cache and Chinese Exposure Radar falls back to TL1 public data.

The `/api/v1/trends/exposure-radar` response includes source health metadata for the UI:

- `source_type`: `owned_collector`, `tl1_fallback`, or `x_trends_cache`
- `source_status`: `fresh`, `stale`, `fallback`, `cache`, `empty`, or `unknown`
- `last_collected_at`: latest owned collector or cache timestamp when available
- `freshness_seconds`: age of the latest owned collector snapshot

The `/api/v1/trends/exposure-radar/performance` response powers the Radar performance panel. It summarizes the selected region over the requested window:

- owned signal count from `exposure_tweet_signals`
- review draft counts from `auto_comment_tasks.source_type=exposure_radar`
- pending, approved, rejected, published, and handled counts
- approval and completion rates
- region breakdown and top topic memory

Exposure Radar ranking also uses recent review memory. When a radar item has a `topic_name` that matches recent `auto_comment_tasks.source_type=exposure_radar` feedback, the backend adjusts its card score and returns:

- `ranking_delta`: positive values promote historically useful topics; negative values down-rank topics with recent rejected/failed drafts
- `ranking_reason`: short explanation shown on the card

New Exposure Radar reply drafts send `topic_name` into `matched_keywords`, so the ranking loop becomes more accurate as operators approve, reject, publish, or mark items handled.

Radar ranking and performance can be scoped with `bot_id` and `x_account_id`:

- `/api/v1/trends/exposure-radar?region=en&bot_id=123&x_account_id=456`
- `/api/v1/trends/exposure-radar/performance?region=en&bot_id=123&x_account_id=456`

When a selected Bot/account has review memory, card ranking uses that scoped memory first. If the selected scope has no matching topic memory yet, ranking falls back to the user's workspace-level Exposure Radar memory. Owned signal counts are still collector-level because raw X signal collection is shared before a user routes an item into a Bot/account review workflow.

Learning controls:

- `ranking_enabled`: enables or disables review-memory score adjustment on Radar cards.
- `collector_enabled`: enables or disables review-memory topics entering the owned collector topic pool.
- `mode=hybrid`: selected Bot/account memory first, then workspace fallback.
- `mode=workspace`: always use workspace-level memory for ranking.
- `mode=scoped`: use selected Bot/account memory only; if no selected-scope memory exists, no ranking adjustment is applied.
- `window_days`: review-memory lookback window for ranking and collector learning. Values above 90 are clamped to 90.

The Exposure Radar performance panel shows these controls as read-only operational state: ranking learning, collector learning, mode, window, and ranking scope. Change them in prod config or environment variables rather than in the end-user UI.

The owned collectors also use review memory when building their recent-search topic pool. Topic priority is:

1. high-performing Exposure Radar topics from recent review memory, where approved/published/handled counts are higher than rejected/failed counts
2. cached X Trends topics for the configured trend regions
3. Chinese seed topics from `exposure_zh_seed_topics` for `region=zh`

Review-memory topics use the same safety classifier as trend topics and skip high-risk topics before they are searched.

## Email Provider

Email provider is configured in backend YAML files (`backend/configs/config.*.yaml`) and can be overridden by environment variables when deploying.

Local development defaults to `provider: local`. It does not call an external email service; verification codes are written to the API log and returned in the local API response.

```yaml
email:
  provider: "local"
  local:
    expose_code: true
  resend:
    api_key: ""
    from_email: "Octo Agent <no-reply@mail.octo-agent.com>"
  ses:
    region: "ap-southeast-1"
    access_key_id: ""
    secret_access_key: ""
    from_email: "no-reply@mail.octo-agent.com"
```

For production, use Resend:

```yaml
email:
  provider: "resend"
  resend:
    api_key: ""
    from_email: "Octo Agent <no-reply@mail.octo-agent.com>"
```

Recommended deployment environment overrides:

- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY=<resend_api_key>`
- `RESEND_FROM_EMAIL=Octo Agent <no-reply@mail.octo-agent.com>`

`RESEND_FROM_EMAIL` must be a valid sender address from a verified Resend domain. If only a domain such as `mail.octo-agent.com` is supplied, the backend normalizes it to `Octo Agent <no-reply@mail.octo-agent.com>`.

`backend/configs/.env` is gitignored and can be used for local private overrides.
