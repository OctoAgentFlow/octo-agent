# Billing API

Base path: `/api/v1`

除 **链上 Webhook** 外，路由均需 **Bearer Token**。

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

## GET /api/v1/billing/orders/{id}

- **用途**：轮询单笔订单状态（仅当前用户自己的订单）。
- **Path**：`id` 为 **数字主键**（与 `order_id` 字符串一致）。
- **响应**：含 `chain_id`、`tx_hash`、`paid_at`（已支付时）等。

## POST /api/v1/billing/webhooks/onchain

- **鉴权**：**不使用** Bearer；请求头 **`X-Billing-Webhook-Secret`** 须与配置 `billing.webhook_secret` 一致。
- **Body**：`{ "order_id": "<与订单 id 一致的字符串>", "network": "BEP20", "tx_hash": "0x..." }`
- **用途**：对 **BEP20** 转账做链上校验（金额、收款地址、代币合约等），成功后更新订单并延长订阅；同一链上 `tx_hash` 通过 `billing_chain_txs` 去重，不可重复确认多笔订单。

> 当前 MVP **不支持** TRC20/ERC20 收款；配置中仅保留 BEP20 时，其它 `network` 会校验失败。
