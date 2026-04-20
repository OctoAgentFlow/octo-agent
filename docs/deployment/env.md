# Environment Variables

- `NEXT_PUBLIC_API_BASE_URL`（前端，见 `frontend` 本地开发说明）
- `APP_ENV`（后端：选择加载 `backend/configs/config.<APP_ENV>.yaml`；未设置时默认为 `local`）

HTTP API 一览见 [docs/api/README.md](../api/README.md)。

**X 账号 OAuth**、**OAuth 完成后的前端跳转基址** 已改为在 `backend/configs/config.<env>.yaml` 中配置（`x_oauth`、`app.frontend_base_url`），无需再设置 `X_OAUTH_*` / `FRONTEND_BASE_URL` 环境变量。

> Backend 现已完全以 YAML 为准（含 MySQL 密码），不再通过 `MYSQL_PASSWORD` 环境变量覆盖。

## Recommended Local Values

- Frontend (`frontend/.env.local`)
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:10001/api/v1`

- Backend runtime
  - `APP_ENV=local`

## X（Twitter）OAuth 2.0（YAML）

在对应环境的 YAML（如 `configs/config.local.yaml`）中配置：

```yaml
app:
  frontend_base_url: "http://localhost:3000"

x_oauth:
  client_id: "<OAuth 2.0 Client ID>"
  client_secret: "<Client Secret>"
  redirect_uri: "http://localhost:10001/api/v1/accounts/oauth/x/callback"
  state_secret: ""  # 可选；生产环境建议填写随机长字符串
```

- **未填写** `client_id` / `redirect_uri` 时，`POST /accounts/oauth/x/start` 会返回 400，提示在 yaml 中配置。
- `redirect_uri` 必须与 [X Developer Portal](https://developer.twitter.com/en/portal/dashboard) 里 **Callback URL** 完全一致；scope 与后端一致：`tweet.read users.read offline.access`。

## Email Provider (YAML Only)

Email sending is configured only via backend YAML files (`backend/configs/config.*.yaml`), no environment override is required.

```yaml
email:
  provider: "ses"
  ses:
    region: "ap-southeast-1"
    access_key_id: "<aws_access_key_id>"
    secret_access_key: "<aws_secret_access_key>"
    from_email: "no-reply@mail.octo-agent.com"
```
