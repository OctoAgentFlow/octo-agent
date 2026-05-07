# Roadmap

## Current Integration Status (Frontend -> Backend)

| Area | Main Pages | Status | Notes |
| --- | --- | --- | --- |
| Auth | `/login` | real | 邮箱验证码、注册、登录、刷新、`/users/me`。 |
| Wallet Binding | `/login`, `/dashboard` | real | `challenge` → 签名 → `bind` / `unbind`。 |
| Dashboard Data | `/dashboard` | real | `GET /dashboard/overview`；`runtime-status` 指标为 **DB 真实统计**（见 [automation.md](../api/automation.md)）。 |
| Accounts | `/accounts` | real | 列表、OAuth、解绑。 |
| Activity | `/activity` | real | `GET /activities` 支持类型、状态、时间范围、账号与失败原因筛选；可从 Analytics 跳转排查。 |
| Billing | `/billing` | real（MVP+） | `GET /billing/subscription|plans|payment-methods`；**BEP20** 下单、轮询、用户补交 tx hash、自动过期、失败原因记录；链上确认 `POST /billing/webhooks/onchain`（Header 密钥）。 |
| Posts | `/posts` | real | `GET/POST/PUT/DELETE /posts`、`POST /posts/:id/execute`；服务端 **每分钟** 调度 `scheduled` 帖子（需 Auto Post 开启），见 [post.md](../api/post.md)。 |
| Agents UI（自动化） | `/agents` | real（automations） | 页面使用 **`/automations`**；`GET /agents` 已作为兼容列表读取自动化配置。 |
| Analytics | `/analytics` | real（MVP+） | `GET /analytics/overview?range=7d|30d&account_id=...` 聚合账号对比、账号级活动趋势、自动化拆分、失败原因、待处理项与内容状态，并跳转 Activity 排查。 |
| Settings / Profile | `/settings`, `/profile` | real（MVP+） | `GET/PATCH /users/me`；`GET/PATCH /users/me/notification-settings`；语言偏好保存在浏览器本地。 |

## Automation execution (backend)

| 模块 | 状态 |
| --- | --- |
| Auto Post（定时发推） | 已实现（scheduler + X API） |
| Auto Reply（模板回复评论） | 已实现（scheduler + X API；`reply_reservations` 防并发重复） |
| Auto DM | dry-run / capability-check 已实现（scheduler 写入 Activity，真实私信发送待 X DM 权限与风控确认） |

## Next API Integration Priorities

1. **Auto DM**：在 dry-run 基础上确认 X DM 权限、收件人规则、限流和审计后，再接真实私信发送。
2. **Analytics**：继续扩展转化指标与更细的内容表现指标。
3. **Billing**：继续产品化对账、退款/人工审核与支付筛选。
4. **Agents（可选）**：若后续需要独立 Agent 实体，再将 `agents` 表与自动化配置建立关联。

## Milestones

1. M1: Scaffold and UI baseline（done）
2. M2: Auth + wallet（done）
3. M3: Accounts + dashboard overview + automations + activity + billing 读接口（done / 持续迭代）
4. M4: Post scheduling、Auto Reply、计费下单与链上确认（done / 持续迭代）
5. M5: Analytics 扩展 + Auto DM + 计费扩展
