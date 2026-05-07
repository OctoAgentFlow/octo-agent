# Roadmap

## Current Integration Status (Frontend -> Backend)

| Area | Main Pages | Status | Notes |
| --- | --- | --- | --- |
| Auth | `/login` | real | 邮箱验证码、注册、登录、刷新、`/users/me`。 |
| Wallet Binding | `/login`, `/dashboard` | real | `challenge` → 签名 → `bind` / `unbind`。 |
| Dashboard Data | `/dashboard` | real | `GET /dashboard/overview`；`runtime-status` 指标为 **DB 真实统计**（见 [automation.md](../api/automation.md)）。 |
| Accounts | `/accounts` | real | 列表、OAuth、解绑。 |
| Activity | `/activity` | real | `GET /activities`；新用户首次拉取可能插入演示活动行（见 [activity.md](../api/activity.md)）。 |
| Billing | `/billing` | real（MVP） | `GET /billing/subscription|plans|payment-methods`；**BEP20** 下单 `POST /billing/orders`、轮询 `GET /billing/orders/:id`；链上确认 `POST /billing/webhooks/onchain`（Header 密钥）。 |
| Posts | `/posts` | real | `GET/POST/PUT/DELETE /posts`、`POST /posts/:id/execute`；服务端 **每分钟** 调度 `scheduled` 帖子（需 Auto Post 开启），见 [post.md](../api/post.md)。 |
| Agents UI（自动化） | `/agents` | real（automations） | 页面使用 **`/automations`**，非 `GET /agents` 占位接口。 |
| Analytics | `/analytics` | real（MVP） | `GET /analytics/overview` 聚合 7 日活动、自动化拆分与内容状态。 |
| Settings / Profile | `/settings`, `/profile` | real（MVP） | `GET/PATCH /users/me`；语言偏好保存在浏览器本地。 |

## Automation execution (backend)

| 模块 | 状态 |
| --- | --- |
| Auto Post（定时发推） | 已实现（scheduler + X API） |
| Auto Reply（模板回复评论） | 已实现（scheduler + X API；`reply_reservations` 防并发重复） |
| Auto DM | **未实现**（仅有 `automation_configs` 配置与 UI，无执行器） |

## Next API Integration Priorities

1. **Auto DM**：若产品需要，补齐私信 API 与调度任务。
2. **Agents（可选）**：若产品需要与 `GET /agents` 对齐，则改为读库或废弃占位。
3. **Analytics**：继续扩展趋势维度、账号维度与转化指标。
4. **Billing**：继续产品化对账、异常订单处理与支付筛选。

## Milestones

1. M1: Scaffold and UI baseline（done）
2. M2: Auth + wallet（done）
3. M3: Accounts + dashboard overview + automations + activity + billing 读接口（done / 持续迭代）
4. M4: Post scheduling、Auto Reply、计费下单与链上确认（done / 持续迭代）
5. M5: Analytics 扩展 + Auto DM + 计费扩展
