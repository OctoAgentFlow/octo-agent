# OAF Bot + Billing 第一阶段技术设计

## 现有结构依据

- API 路由集中注册在 `backend/internal/router/router.go`。
- Billing 路由在 `backend/internal/router/billing_router.go`，控制器在 `backend/internal/controller/billing_controller.go`，服务在 `backend/internal/service/billing_service.go`。
- 订阅状态字段在 `backend/internal/model/user.go`：`subscription_plan_code`、`subscription_status`、`subscription_expires_at`。
- 免费试用天数和订阅有效性判断在 `backend/internal/pkg/subscription/access.go`、`backend/internal/pkg/subscription/view.go`。
- X 账号绑定逻辑在 `backend/internal/service/account_service.go`，账号数量统计在 `backend/internal/repository/twitter_account_repository.go`。
- OpenAI 客户端在 `backend/internal/integration/openai/client.go`，AI 服务在 `backend/internal/service/ai_service.go`。
- Billing 前端入口在 `frontend/src/app/(dashboard)/billing/page.tsx`，组件在 `frontend/src/components/billing/*`。
- 官网 Pricing 组件在 `frontend/src/components/marketing/pricing-section.tsx`。

## 后端设计

### 1. PlanLimits 统一模型

新增订阅套餐目录，放在 `backend/internal/pkg/subscription/plans.go`：

- `PlanLimits`：统一描述套餐额度和功能开关。
- `PlanDefinition`：描述套餐展示信息、月付价格、年付价格、标签、权益文案。
- `Catalog()`：返回 Basic / Plus / Pro / Pro+。
- `NormalizePlanCode()`：兼容 `basic_monthly` 这类历史 plan_code，并归一为 `basic`。
- `NormalizeBillingCycle()`：支持 `monthly` / `yearly`，默认 monthly。
- `LimitsForUser()`：根据用户当前订阅返回权益。免费试用沿用 1 个 X 账号，并给 1 个 OAF Bot 的体验额度。

Billing、OAF Bot、X 账号绑定共用这套规则，避免多个模块各自维护限制。

### 2. Billing API 扩展

保持已有路由不变：

- `GET /api/v1/billing/plans`
- `GET /api/v1/billing/subscription`
- `POST /api/v1/billing/orders`

扩展 DTO：

- plans 返回 `monthly_price`、`yearly_price`、`limits`、`benefits`、`badge`、`audience`。
- subscription 返回 `plan`、`billing_cycle`、`expiration_date`、`limits`、`usage`。
- create order 请求新增 `billing_cycle`。

订单兼容策略：

- 新订单 `plan_code` 存储归一后的基础套餐编码，例如 `basic`、`plus`、`pro`、`pro_plus`。
- 支付金额按 `billing_cycle` 选择月付或年付价格。
- 第一阶段不新增订单表字段，支付确认时通过订单金额反推周期：匹配套餐年付价格则按 1 年开通，否则按 1 月开通。
- 后续如果需要精确审计，可再新增 `billing_cycle` 字段并迁移历史订单。

### 3. OAF Bot 数据模型

新增：

- `backend/internal/model/oaf_bot.go`
- `backend/internal/repository/oaf_bot_repository.go`
- `backend/internal/dto/oaf_bot_dto.go`
- `backend/internal/service/oaf_bot_service.go`
- `backend/internal/controller/oaf_bot_controller.go`
- `backend/internal/router/oaf_bot_router.go`

表：`oaf_bots`

核心字段：

- `user_id`
- `twitter_account_id`
- `name`
- `occupation`
- `industry`
- `age_range`
- `gender`
- `education`
- `mbti`
- `personality_tags`
- `identity_summary`
- `voice_tone`
- `topics`
- `forbidden_topics`
- `growth_goal`
- `safety_mode`

`personality_tags`、`topics`、`forbidden_topics` 第一阶段以 JSON 字符串存储，DTO 层对外保持数组结构。

### 4. OAF Bot API

新增用户端认证路由：

- `GET /api/v1/oaf-bots`
- `POST /api/v1/oaf-bots`
- `GET /api/v1/oaf-bots/:id`
- `PUT /api/v1/oaf-bots/:id`
- `POST /api/v1/oaf-bots/:id/test-generate`

创建限制：

- 查询用户当前套餐 limits。
- 统计用户当前 OAF Bot 数量。
- 当 `count >= limits.max_bots` 时拒绝创建，并返回明确错误。

绑定账号校验：

- 如果传入 `twitter_account_id`，必须属于当前用户且不是 disconnected。

test-generate：

- 复用现有 `AIService`。
- 生成示例 tweet / reply / dm。
- 如果 OpenAI 配置缺失或调用失败，返回后端错误，不做真实发送。

### 5. X 账号绑定限制

修改 `backend/internal/service/account_service.go`：

- 从只判断 free_trial 改为读取 `subscription.LimitsForUser(user)`。
- 当前账号数量通过 `CountByUserIDExcludingIdentity` 统计。
- 超出 `max_twitter_accounts` 时拒绝绑定。

### 6. 数据迁移

`backend/internal/database/migrate.go` 加入 `model.OAFBot{}`，随现有 AutoMigrate 机制创建表。

## 前端设计

### 1. Billing 类型与服务

更新：

- `frontend/src/services/billing.service.ts`
- `frontend/src/types/billing.ts`

新增类型：

- `PlanLimits`
- `PlanUsage`
- `BillingCycle`
- `PlanFeature`

Billing 页面从后端 plans/subscription 数据直接渲染套餐卡和用量，不再硬编码 Basic-only 视图。

### 2. Billing 页面

更新：

- `frontend/src/app/(dashboard)/billing/page.tsx`
- `frontend/src/components/billing/billing-page-content.tsx`
- `frontend/src/components/billing/plan-comparison.tsx`
- `frontend/src/components/billing/subscription-status-card.tsx`
- `frontend/src/components/billing/billing-checkout-dialog.tsx`

新增：

- Monthly / Yearly 切换。
- 当前套餐用量卡。
- 四档套餐卡。
- Plus / Pro 标签。
- 高级能力锁定态。
- 套餐卡升级按钮打开对应 plan_code + billing_cycle 的支付弹窗。

### 3. 官网 Pricing

更新：

- `frontend/src/components/marketing/pricing-section.tsx`
- `frontend/src/mocks/marketing/landing.mock.ts`

用本地静态套餐目录展示四档套餐，支持 Monthly / Yearly 切换。官网 Pricing 不依赖登录态接口。

### 4. OAF Bot 页面

新增：

- `frontend/src/services/oaf-bot.service.ts`
- `frontend/src/types/oaf-bot.ts`
- `frontend/src/app/(dashboard)/oaf-bots/page.tsx`

侧边栏新增 OAF Bot 菜单入口。

页面结构：

- 顶部：当前用量和套餐限制。
- 左侧：Bot 列表。
- 右侧：创建/编辑表单。
- 底部：test-generate 示例内容。

## 非目标

- 不接入真实自动发推/回复/评论/私信执行链路。
- 不做 AI 生成次数扣减。
- 不新增团队席位管理。
- 不重构现有 Billing 对账、支付记录、Auto DM、Posts 或 Automations。
- 不修改认证逻辑。

## 第二阶段最小闭环补充

第二阶段只接入 Auto Post 内容生成链路，不接入 Auto Reply、Auto DM、Auto Comment。

新增后端能力：

- `ai_generation_usages`：按 `user_id + bot_id + scene + month` 记录 AI 生成次数。
- `POST /api/v1/posts/generate`：根据 `x_account_id` 生成一条 Auto Post 内容。
- 当 X 账号绑定了 OAF Bot 时，生成 Prompt 注入该 Bot 的完整人设字段。
- 当 X 账号没有绑定 OAF Bot 时，使用默认 Octo-Agent Flow 内容风格，不中断原有流程。
- `POST /api/v1/oaf-bots/:id/test-generate` 生成成功后记录 1 次 AI 用量。
- `POST /api/v1/posts/generate` 生成成功后记录 1 次 AI 用量，`scene=auto_post`，并关联 `bot_id`；未绑定 Bot 时 `bot_id=0`。
- Billing subscription usage 从 `ai_generation_usages` 读取当月真实 AI 生成次数。

额度规则：

- 每次生成前读取当前用户 `PlanLimits.ai_generations_monthly`。
- 当当月已用次数大于等于套餐额度时，返回 `error_code=ai_generation_quota_exceeded`。
- 前端在 Posts 创建页展示升级提示，Billing 页面展示真实 AI 生成用量。

## 回归验证

后端：

```bash
cd backend && go test ./...
```

前端：

```bash
cd frontend && npm run lint
cd frontend && npm run build
```
