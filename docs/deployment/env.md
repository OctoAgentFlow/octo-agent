# Environment Variables

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

真实 X 发布灰度由 `x_publisher` 配置控制，位于 API 服务 YAML（例如 `backend/configs/config.test.api.yaml`）：

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

测试环境默认必须保持 `real_publish_enabled=false` 或 `dry_run=true`。只有做单账号灰度验收时，才临时改为：

```yaml
x_publisher:
  real_publish_enabled: true
  manual_publish_enabled: true
  per_account_daily_limit: 1
  per_account_min_interval_seconds: 300
  dry_run: false
```

灰度步骤见 [x-publisher-gray-release.md](./x-publisher-gray-release.md)。scheduler 不会自动真实发布；真实发布只能由用户在 Execution Queue 中手动触发。

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
