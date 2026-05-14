# X Publisher 灰度验收 Runbook

## 目标

本 Runbook 用于在测试环境逐步验证 Publishing Pipeline V2 的真实 X 发布能力。默认不自动发布，scheduler 仍然只执行 simulated publish；真实发布只能由用户在 Execution Queue 中手动触发。

测试环境默认配置：

```yaml
x_publisher:
  real_publish_enabled: false
  manual_publish_enabled: true
  per_account_daily_limit: 20
  per_account_min_interval_seconds: 300
  dry_run: true
```

## 阶段 1：只读检查

1. 检查 X App 权限

   - 进入 X Developer Portal。
   - 确认 App permissions 至少包含 `Read and write`。
   - 如果未来需要私信，再确认包含 Direct Message 权限；本次 reply/comment 只要求 `tweet.write`。
   - 确认 Type of App 为 Web App / Automated App or Bot。
   - 确认 callback URL 包含测试环境：

```text
https://test.octo-agent.com/api/v1/accounts/oauth/x/callback
```

2. 检查后端 OAuth 配置

```bash
cd /home/ubuntu/octo/octo-agent/backend
APP_ENV=test APP_SERVICE=api go run ./cmd/api
```

或查看私有测试配置中的：

```yaml
x_oauth:
  scopes: "tweet.read tweet.write users.read offline.access"
```

3. 检查当前发布器模式

登录用户端后调用：

```bash
curl -H "Authorization: Bearer <USER_JWT>" \
  https://test.octo-agent.com/api/v1/publishing/status
```

期望返回不包含任何 token，并包含：

```json
{
  "real_publish_enabled": false,
  "manual_publish_enabled": true,
  "dry_run": true,
  "per_account_daily_limit": 20,
  "per_account_min_interval_seconds": 300,
  "current_user_connected_accounts_count": 1,
  "accounts_missing_tweet_write_count": 0
}
```

4. 检查测试 X 账号 token 可用

如果 `accounts_missing_tweet_write_count > 0`：

- 用户需要重新绑定 X 账号。
- 重新绑定前确认后端 `x_oauth.scopes` 已包含 `tweet.write`。
- 重新绑定后再次调用 `/api/v1/publishing/status`。

## 阶段 2：dry-run 手动发布

目标：验证人工 publish-now 链路、Activity、Execution Queue 和 `publish_jobs` 状态，但不调用真实 X API。

1. 保持以下任一安全配置：

```yaml
x_publisher:
  real_publish_enabled: false
  dry_run: true
```

或：

```yaml
x_publisher:
  real_publish_enabled: true
  dry_run: true
```

2. 生成 `ready_to_publish` job

推荐路径：

- 打开用户端 `/auto-comments` 或 `/auto-replies`。
- 选择已绑定的测试 X 账号。
- 执行模式选择全托管。
- 录入目标推文或待回复评论。
- 点击生成评论/回复草稿。
- 确认 Execution Queue 中出现 `ready_to_publish` 内容和 `publish_job`。

3. 执行 dry-run

在 Execution Queue 中点击“发布演练”。也可以直接调用：

```bash
curl -X POST \
  -H "Authorization: Bearer <USER_JWT>" \
  https://test.octo-agent.com/api/v1/publishing/jobs/<JOB_ID>/publish-now
```

4. 验收结果

- 不应调用真实 X API。
- 响应中应包含：

```json
{
  "dry_run": true,
  "real_publish_enabled": false,
  "publish_mode": "dry_run",
  "external_id": "dry-run-<JOB_ID>"
}
```

- `publish_jobs.status = published`
- `publish_jobs.publish_mode = dry_run`
- `auto_comment_tasks` 或 `auto_reply_drafts` 状态变为 `published`
- Activity 出现 `activity.preview.manualPublishDryRunSuccess`
- X 上不应出现真实评论或回复。

## 阶段 3：单账号真实发布

目标：只使用一个测试 X 账号验证真实发布。不要开启全托管真实发布，不要让 scheduler 自动真实发布。

1. 选择测试账号

- 仅使用一个明确的测试 X 账号。
- 确认该账号已重新授权，`tweet.write` scope 存在。
- 确认该账号不会影响正式品牌账号或客户账号。

2. 修改测试环境私有配置

只在测试服务器私有配置中修改：

```yaml
x_publisher:
  real_publish_enabled: true
  manual_publish_enabled: true
  dry_run: false
  per_account_daily_limit: 1
  per_account_min_interval_seconds: 300
```

3. 重启 API

```bash
cd /home/ubuntu/octo/octo-agent
bash scripts/deploy-backend-api-test.sh
```

4. 再次只读确认

```bash
curl -H "Authorization: Bearer <USER_JWT>" \
  https://test.octo-agent.com/api/v1/publishing/status
```

确认：

- `real_publish_enabled = true`
- `dry_run = false`
- `per_account_daily_limit = 1`
- `accounts_missing_tweet_write_count = 0`

5. 手动触发真实发布

- 在 Execution Queue 中点击“真实发布”。
- 二次确认文案必须出现：`这将真实发布到 X，操作不可撤销。`
- 发布后检查 X 上是否出现真实回复/评论。

6. 验收结果

- `publish_jobs.status = published`
- `publish_jobs.publish_mode = real`
- `publish_jobs.external_id` 有值
- `publish_jobs.external_url` 有值
- Activity 出现 `activity.preview.realPublishSuccess`
- Execution Queue 显示已发布和 external URL。

7. 验证限流

同一测试 X 账号立即再次发布，应返回：

```json
{
  "error_code": "publisher_daily_limit_exceeded"
}
```

或在未到冷却时间时返回：

```json
{
  "error_code": "publisher_cooldown_active"
}
```

## 阶段 4：回滚

任一异常出现后立即回滚。

1. 修改测试环境配置：

```yaml
x_publisher:
  real_publish_enabled: false
  dry_run: true
```

2. 重启 API：

```bash
cd /home/ubuntu/octo/octo-agent
bash scripts/deploy-backend-api-test.sh
```

3. 验证回滚：

```bash
curl -H "Authorization: Bearer <USER_JWT>" \
  https://test.octo-agent.com/api/v1/publishing/status
```

确认：

- `real_publish_enabled = false`
- `dry_run = true`

4. 再次调用 `publish-now`

- 如果 `dry_run=true`，应只执行发布演练。
- 如果同时设置 `dry_run=false` 且 `real_publish_enabled=false`，应返回：

```json
{
  "error_code": "publisher_real_publish_disabled"
}
```

## 排查入口

1. Execution Queue

```text
https://test.octo-agent.com/execution-queue
```

查看：

- 内容状态
- publish job id
- publish mode
- last_error
- external_url

2. Activity

```text
https://test.octo-agent.com/activity
```

重点检查：

- `activity.preview.manualPublishTriggered`
- `activity.preview.manualPublishDryRunSuccess`
- `activity.preview.realPublishSuccess`
- `activity.preview.realPublishFailed`

3. 数据库只读查询

```sql
SELECT id, user_id, twitter_account_id, source_type, source_id, status,
       publish_mode, attempt_count, last_error, external_id, external_url,
       published_at, created_at, updated_at
FROM publish_jobs
ORDER BY id DESC
LIMIT 20;
```

4. API 日志

```bash
tail -n 200 /home/ubuntu/octo/octo-agent/logs/deploy/backend-api-test.log
tail -n 200 /home/ubuntu/octo/octo-agent/backend/logs/api.log
```

## 重要边界

- 不要修改 admin-api；admin-api 不启动 Publishing Pipeline。
- 不要开启 scheduler 自动真实发布。
- 不要在生产环境直接把 `dry_run=false`。
- 不要使用真实品牌账号做首次验证。
- 不要暴露或打印 X access token。
