# Billing API

Base path: `/api/v1`

所有路由均需 **Bearer Token**。

## GET /api/v1/billing/subscription

- **用途**：返回当前用户订阅摘要（MVP：与试用逻辑绑定在用户表时间上，非独立订阅系统）。

响应字段（JSON）：

- `plan`：固定为 `free_trial`（与 `dashboard` / 用户创建时间推算一致）
- `status`：当前为 `active`
- `expiration_date`：试用结束日期（`YYYY-MM-DD`）
- `trial_days_left`：剩余试用天数
- `billing_hint`：展示用提示文案

## GET /api/v1/billing/plans

- **用途**：返回可展示的套餐列表（**静态配置**，非数据库）。

## GET /api/v1/billing/payment-methods

- **用途**：返回已保存支付方式；当前实现返回 **`items: []`**（空列表），占位供后续对接链上/第三方支付。
