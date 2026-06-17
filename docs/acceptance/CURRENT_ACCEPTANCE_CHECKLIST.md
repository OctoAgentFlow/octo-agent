# CURRENT_ACCEPTANCE_CHECKLIST

当前阶段验收重点是 OAF Bot、Exposure Radar、Content Drafts、Handling List 和 Publishing Pipeline。历史 MVP 验收文档仍保留，但不再作为最新调试入口。

## 1. 四服务健康

- API：`GET /health` 返回 200。
- Admin API：`GET /health`、`GET /admin/health` 返回 200。
- 用户前端可访问。
- 后台前端可访问。
- 用户前端请求用户 API，后台前端请求 Admin API。

## 2. Auth / Account

- 用户邮箱验证码登录/注册可用。
- Admin 登录只允许配置中的管理员邮箱。
- X OAuth callback 与当前环境域名一致。
- 绑定 X 账号后 scopes 包含 `tweet.write`，否则 Publishing 状态应提示缺少写权限。

## 3. OAF Bot

- 可以创建/编辑 OAF Bot。
- 一个 X 账号同一时间只能绑定一个 active OAF Bot。
- 创建页可配置主要输出语言和语言策略。
- test-generate 按选定 scene 只返回一条内容。
- test-generate 不展示 JSON。
- test-generate 消耗 1 次 AI 生成额度。
- OAF Bot 页面本月 AI 用量按 scene 展示分布。

## 4. Billing

- `GET /billing/subscription` 返回当前套餐、limits 和 usage。
- Dashboard 当前套餐与额度展示正确。
- Billing 页面 AI 生成额度进度条正确。
- AI 用量接近上限时有 warning；用尽时提示升级。

## 5. Content Draft Planner

- `/content-drafts` 页面可访问。
- 可以保存 Planner。
- 可以新增/编辑/暂停/删除 Content Library 素材。
- 手动生成 Content Draft 成功。
- run-now 成功时生成草稿并记录 run。
- enabled planner 到点后 scheduler 能自动生成草稿。
- 没有素材时 run 显示 `no_active_content_source`，不崩溃。
- AI 额度不足时显示 `ai_generation_quota_exceeded`。
- 生成成功后 AI 用量 +1，素材 usage_count / last_used_at 更新。

## 6. Exposure Radar Manual Workflow

- `/exposure-radar` 可以加载中文区 / 英文区机会信号。
- 机会卡支持生成回复、复制回复、打开原贴、保存记忆、记录处理结果。
- 手动结果回填后可在页面看到处理状态和学习反馈。
- 旧自动评论 / 自动回复 / 自动 DM 路由不作为验收入口。

## 7. Handling List

- `/handling-list` 可访问。
- 可按 type/status/execution_mode 筛选。
- post/comment/reply 均可展示。
- pending_review 内容可编辑、批准、拒绝。
- ready_to_publish 内容展示发布任务状态。
- failed 内容展示失败原因。

## 8. Publishing Pipeline

- `GET /publishing/status` 未登录返回 401。
- `POST /publishing/jobs/:id/publish-now` 未登录返回 401。
- `dry_run=true` 时不会真实调用 X。
- `real_publish_enabled=false` 且 `dry_run=false` 时返回 `publisher_real_publish_disabled`。
- `source_type=post` 的 job 可 dry-run 发布。
- dry-run 成功后 source draft 状态变为 `published`，publish job `publish_mode=dry_run`。
- scheduler 只 simulated publish，不真实调用 X。
- admin-api 不启动发布器。

## 9. 单账号真实发布灰度

只在明确测试账号上执行，流程见：

```text
docs/deployment/x-publisher-gray-release.md
```

验收后必须恢复：

```yaml
x_publisher:
  real_publish_enabled: false
  dry_run: true
```

## 10. 构建检查

```bash
cd backend && go test ./...
cd backend && go build ./...
cd frontend && npm run lint
cd frontend && npm run build
```
