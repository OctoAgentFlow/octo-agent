# Roadmap

## Current Integration Status (Frontend -> Backend)

| Area | Main Pages | Status | Notes |
| --- | --- | --- | --- |
| Auth | `/login` | real | 邮箱验证码、注册、登录、刷新、`/users/me`、已登录用户修改密码。 |
| Wallet Binding | `/login`, `/dashboard` | real | `challenge` → 签名 → `bind` / `unbind`。 |
| Dashboard Data | `/dashboard` | real | `GET /dashboard/overview`；`runtime-status` 指标为 **DB 真实统计**（见 [automation.md](../api/automation.md)）。 |
| Accounts | `/accounts` | real | 列表、OAuth、解绑。 |
| Activity | `/activity` | real | `GET /activities` 支持类型、状态、时间范围、账号与失败原因筛选；可从 Analytics 跳转排查。 |
| Billing | `/billing` | real（MVP+） | `GET /billing/subscription|plans|payment-methods`；**BEP20** 下单、轮询、用户补交 tx hash、自动过期、失败原因记录；链上确认 `POST /billing/webhooks/onchain`（Header 密钥）；支付记录支持 owner/admin 对账筛选、人工审核和操作审计。 |
| Posts | `/posts` | real | `GET/POST/PUT/DELETE /posts`、`POST /posts/:id/execute`；服务端 **每分钟** 调度 `scheduled` 帖子（需 Auto Post 开启），见 [post.md](../api/post.md)。 |
| Agents UI（自动化） | `/agents` | real（automations） | 页面使用 **`/automations`**；`GET /agents` 已作为兼容列表读取自动化配置。 |
| Analytics | `/analytics` | real（MVP+） | `GET /analytics/overview?range=7d|30d&account_id=...` 聚合账号对比、账号级活动趋势、自动化拆分、失败原因、待处理项与内容状态，并跳转 Activity 排查。 |
| Settings / Profile | `/settings`, `/profile` | real（MVP+） | `GET/PATCH /users/me`；`PATCH /users/me/password`；`GET/PATCH /users/me/notification-settings`；语言偏好保存在浏览器本地。 |

## Automation execution (backend)

| 模块 | 状态 |
| --- | --- |
| Auto Post（定时发推） | 已实现（scheduler + X API） |
| Auto Reply（模板回复评论） | 已实现（scheduler + X API；`reply_reservations` 防并发重复） |
| Auto DM | 真实发送 + 安全重试 + 名单/偏好中心 + 名单审计/管理/运营可视化已实现（近期互动候选、审批、X DM API 发送、失败分类、retry queue、白/黑名单、CSV allowlist、导入历史、名单搜索/筛选/批量操作、名单变更 Activity、Analytics 运营摘要、公开退订页、成功/失败 Activity） |

## Next API Integration Priorities

1. **用户端新手引导与空状态**：把账号绑定、自动化开启、首条内容发布串成更清晰的首次使用路径。
2. **Posts 发布体验增强**：补发布前校验、失败重试提示和计划发布反馈。
3. **Settings 安全继续增强**：后续再补多会话管理、安全提醒和更完整的工作区级配置。
4. **Analytics 深度指标**：后续再接真实 X impressions / engagement 等外部表现指标。
5. **Admin / Billing 运营后台**：财务对账导出、异常订单报表等放到后台管理系统研发阶段处理。
6. **Agents（可选）**：若后续需要独立 Agent 实体，再将 `agents` 表与自动化配置建立关联。

## Milestones

1. M1: Scaffold and UI baseline（done）
2. M2: Auth + wallet（done）
3. M3: Accounts + dashboard overview + automations + activity + billing 读接口（done / 持续迭代）
4. M4: Post scheduling、Auto Reply、计费下单与链上确认（done / 持续迭代）
5. M5: Analytics 扩展 + Auto DM + 计费扩展
