# Billing API

Base path: `/api/v1`

除 **链上 Webhook** 外，路由均需 **Bearer Token**。Billing 运营动作需要当前用户 `role` 为 `owner` 或 `admin`。

## GET /api/v1/billing/subscription

- **用途**：返回当前用户订阅摘要（MVP：基于 `users` 表上的试用/订阅字段与 `subscription` 包逻辑）。

响应字段（JSON）：

- `plan`：如 `free_trial`、`basic_monthly`（与订单/配置一致；空则展示侧可能回落为 `free_trial`）
- `status`：如 `active`、`expired`（由 `subscription.EffectiveStatus` 计算）
- `expiration_date`：订阅到期日（`YYYY-MM-DD`，可空）
- `trial_days_left`：剩余试用天数
- `billing_hint`：展示用提示文案

## GET /api/v1/billing/plans

- **用途**：返回可展示的套餐列表；数据来自 **`billing.plans` YAML 配置**（非数据库表）。若配置为空则服务层返回内置默认项。

## GET /api/v1/billing/payment-methods

- **用途**：返回 **YAML 配置的链上收款方式**（当前 MVP **仅支持 BEP20 USDT**，多链扩展通过配置增加条目）。
- **响应**：`data.items` 为数组，元素含 `method`、`network`、`token_address`、`receiver_address`、`decimals`、`chain_id`、`is_default`、`note` 等（见 `dto.BillingPaymentMethodItem`）。

## POST /api/v1/billing/orders

- **用途**：创建一笔待支付的链上 USDT 订单（`status=pending`，带过期时间）。
- **Body**：`{ "plan_code": "basic_monthly", "method": "USDT", "network": "BEP20" }`（`method`/`network` 须与配置中的支付方式匹配）
- **响应**：`order_id`（数值订单主键的十进制字符串）、`amount`、`currency`、`network`、`token_address`、`receiver_address`、`expired_at`、`status`

## GET /api/v1/billing/orders

- **用途**：返回当前用户最近支付订单，用于 Billing 页支付记录、对账筛选和退款/人工审核处理。
- **Query**：支持 `status`、`reconciliation_status`、`review_status`、`refund_status`、`limit`（默认 20，最大 100）、`scope`（`own` / `all`；`all` 仅 owner/admin 可用）。
- **响应**：`data.items` 为数组，元素含 `order_id`、`user_id`、`plan_code`、`amount`、`currency`、`method`、`network`、`status`、`tx_hash`、`created_at`、`expired_at`、`paid_at`、`failure_reason`、`last_checked_at`、`can_retry`、`next_action`，以及 `reconciliation_status`、`review_status`、`refund_status`、`refund_reason`、`reviewed_at`、`refund_marked_at`、`ops_note`。owner/admin 响应还会带最近一次审计摘要 `last_audit_action`、`last_audit_at`、`last_audit_operator_id`。
- **运营摘要**：`data.ops_summary` 返回当前用户全部订单的状态计数，包含支付状态、对账异常、待审核与退款状态计数；`data.total` 为当前筛选结果总数。
- **权限标记**：`data.can_operate_billing` 表示当前用户是否可执行人工审核/退款动作；`data.scope` 表示本次返回范围。
- **状态**：常见值为 `pending`、`paid`、`expired`、`failed`。
- **对账状态**：`unchecked`、`matched`、`mismatch`、`needs_review`。
- **审核状态**：`unreviewed`、`review_needed`、`reviewed`。
- **退款状态**：`none`、`requested`、`refunded`、`rejected`。
- **过期处理**：读取列表时会把已超过 `expired_at` 的 `pending`/`failed` 订单自动标记为 `expired`。

## GET /api/v1/billing/orders/{id}

- **用途**：轮询单笔订单状态（仅当前用户自己的订单）。
- **Path**：`id` 为 **数字主键**（与 `order_id` 字符串一致）。
- **响应**：含 `chain_id`、`tx_hash`、`paid_at`（已支付时）、`failure_reason`、`last_checked_at`、`can_retry`、`next_action` 等。
- **过期处理**：读取单笔订单时也会自动落库过期状态。

## POST /api/v1/billing/orders/{id}/ops-action

- **权限**：仅 `owner` / `admin` 可调用；普通用户返回 `403`。
- **用途**：Billing 运营处理入口，用于对账异常、人工审核和退款状态标记。owner/admin 可处理任意用户订单。
- **Body**：
  - `action`：必填，支持 `mark_reviewed`、`mark_review_needed`、`request_refund`、`mark_refunded`、`reject_refund`
  - `ops_note`：可选，运营备注
  - `refund_reason`：可选，退款原因或拒绝退款原因
- **成功响应**：返回更新后的订单详情。
- **审计**：每次成功动作都会写入 `billing_order_audits`，记录操作人、动作、订单所属用户、操作前后订单/对账/审核/退款状态、退款原因和运营备注。
- **状态联动**：
  - `mark_reviewed`：审核置为 `reviewed`，对账置为 `matched`
  - `mark_review_needed`：审核置为 `review_needed`，对账置为 `needs_review`
  - `request_refund`：退款置为 `requested`，审核置为 `review_needed`
  - `mark_refunded`：退款置为 `refunded`，审核置为 `reviewed`
  - `reject_refund`：退款置为 `rejected`，审核置为 `reviewed`

## GET /api/v1/billing/orders/{id}/audits

- **权限**：仅 `owner` / `admin` 可调用；普通用户返回 `403`。
- **用途**：查看单笔订单的运营操作审计记录。
- **响应**：`data.items` 为数组，元素含 `id`、`order_id`、`user_id`、`operator_user_id`、`action`、操作前后订单/对账/审核/退款状态、操作前后退款原因、操作前后运营备注、`created_at`。

## POST /api/v1/billing/orders/{id}/confirm

- **用途**：用户侧异常订单恢复入口。当用户已经转账但 webhook 未到达或订单显示 `failed` 时，可提交链上交易哈希重新触发 BEP20 校验。
- **Body**：`{ "tx_hash": "0x..." }`
- **成功响应**：返回更新后的订单详情；若链上校验通过，订单变为 `paid`，并开通/延长订阅。
- **失败行为**：链上校验失败时订单会记录 `failure_reason`、`last_checked_at`，状态变为 `failed`；在订单未过期前仍可继续提交正确哈希。已过期订单返回 `410`。

## POST /api/v1/billing/webhooks/onchain

- **鉴权**：**不使用** Bearer；请求头 **`X-Billing-Webhook-Secret`** 须与配置 `billing.webhook_secret` 一致。
- **Body**：`{ "order_id": "<与订单 id 一致的字符串>", "network": "BEP20", "tx_hash": "0x..." }`
- **用途**：对 **BEP20** 转账做链上校验（金额、收款地址、代币合约等），成功后更新订单并延长订阅；同一链上 `tx_hash` 通过 `billing_chain_txs` 去重，不可重复确认多笔订单。Webhook 可确认 `pending` 或用户侧校验失败后的 `failed` 订单。

> 当前 MVP **不支持** TRC20/ERC20 收款；配置中仅保留 BEP20 时，其它 `network` 会校验失败。
