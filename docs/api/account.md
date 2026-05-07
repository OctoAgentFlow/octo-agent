# Account API

Base path: `/api/v1`

统一返回结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

## 当前已实现

### GET /api/v1/accounts
- 鉴权：需要（Bearer Token）
- 用途：获取当前登录用户已绑定 X 账号列表

示例响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "id": 12,
        "avatar_url": "https://pbs.twimg.com/profile_images/...",
        "username": "octoagent_ai",
        "display_name": "Octo Agent",
        "status": "connected",
        "last_synced_at": "2026-04-18T08:01:02Z",
        "followers": "12.8K"
      }
    ]
  }
}
```

### POST /api/v1/accounts/oauth/x/start
- 鉴权：需要（Bearer Token）
- 用途：发起 X OAuth 绑定，返回授权地址（服务端生成 state + PKCE challenge）
- 请求体：无
- Scope：当前请求 `tweet.read tweet.write users.read offline.access dm.read dm.write`；其中 DM scope 用于后续 Auto DM 真实发送前的能力检测。若旧账号未带 DM scope，Auto DM 会要求重新授权。

示例响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "auth_url": "https://twitter.com/i/oauth2/authorize?...",
    "state": "eyJ1IjoxLCJ2IjoiLi4uIn0...."
  }
}
```

### GET /api/v1/accounts/oauth/x/callback
- 鉴权：不需要（X OAuth 回调入口）
- 用途：接收 X 回调 code/state，服务端换 token 并落库绑定
- Query：
  - `code`（required）
  - `state`（required）
- 行为：
  - 成功：302 重定向到 `${app.frontend_base_url}/accounts?oauth=success`（见 `configs/config.<env>.yaml` 中 `app.frontend_base_url`）
  - 失败：302 重定向到 `${app.frontend_base_url}/accounts?oauth=failed`

### DELETE /api/v1/accounts/{id}
- 鉴权：需要（Bearer Token）
- 用途：断开当前登录用户指定账号绑定（软断开，状态置为 disconnected）
- Path：
  - `id`：账号 ID

示例响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

## 说明

- 当前仅支持 X 账号（`platform: x`）。
- 列表会过滤已断开账号（`status = disconnected`）。
- OAuth 回调接口用于服务端处理，不建议前端直接调用。
