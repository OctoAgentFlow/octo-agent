# Roadmap

## Current Integration Status (Frontend -> Backend)

| Area | Main Pages | Status | Notes |
| --- | --- | --- | --- |
| Auth | `/login` | real | 邮箱验证码、注册、登录、刷新、`/users/me`。 |
| Wallet Binding | `/login`, `/dashboard` | real | `challenge` → 签名 → `bind` / `unbind`。 |
| Dashboard Data | `/dashboard` | partial | `GET /dashboard/overview` 为真实数据；若 UI 仍展示 `runtime-status` 中的队列等字段，部分为**占位算法**（见 [automation.md](../api/automation.md)）。 |
| Accounts | `/accounts` | real | 列表、OAuth、解绑。 |
| Activity | `/activity` | real | `GET /activities`；新用户首次拉取会插入演示活动行（见 [activity.md](../api/activity.md)）。 |
| Billing | `/billing` | partial | `GET /billing/*` 已接；支付方式等可能为空列表；订阅侧为 MVP 逻辑。 |
| Posts | `/posts` | real | `GET/POST/PUT/DELETE /posts`；调度/执行发推仍待接入。 |
| Agents UI（自动化） | `/agents` | real（automations） | 页面使用 **`/automations`** 与 **`/automations/runtime-status`**，非 `GET /agents` 占位接口。 |
| Analytics | `/analytics` | mock | 无独立聚合 API。 |
| Settings / Profile | `/settings`, `/profile` | partial | 视页面；资料常见为 `GET /users/me`。 |

## Next API Integration Priorities

1. **Posts**：真实列表/创建/调度，替换 `PostController` 占位实现。
2. **Agents（可选）**：若产品需要与 `GET /agents` 对齐，则改为读库或废弃占位。
3. **Automation runtime**：将 `runtime-status` 中占位字段改为队列/执行流水真实指标。
4. **Analytics**：聚合接口与前端对接。
5. **Billing**：支付方式与链上/第三方支付对接。

## Milestones

1. M1: Scaffold and UI baseline（done）
2. M2: Auth + wallet（done）
3. M3: Accounts + dashboard overview + automations + activity + billing 读接口（done / 持续迭代）
4. M4: Post scheduling 与真实帖子 API
5. M5: Analytics + 计费支付闭环
