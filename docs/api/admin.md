# Admin API

Base path: `/api/v1/admin`

所有接口都需要 Bearer Token，且当前用户 `role` 必须为 `owner` 或 `admin`，账号状态必须为 `active`。

## GET /api/v1/admin/overview

- **用途**：后台管理首页聚合。
- **权限**：`owner` / `admin`
- **响应内容**：
  - `operator`：当前操作人
  - `users`：用户总数、active/suspended、owner/admin、订阅状态摘要
  - `billing`：全站订单状态、对账状态、审核状态摘要
  - `activity`：最近 24 小时活动成功/失败/待审核统计
  - `content`：连接账号、帖子、自动化启用状态摘要
  - `config`：Email、Resend、X OAuth、Billing method、前端 URL 配置状态
  - `recent_users` / `recent_orders` / `recent_events`：后台首页最近记录

## GET /api/v1/admin/users

- **用途**：用户管理列表。
- **权限**：`owner` / `admin`
- **Query**：
  - `page`：默认 1
  - `page_size`：默认 20，最大 100
  - `query`：按邮箱或显示名模糊搜索
  - `role`：`owner` / `admin` / `user`
  - `status`：`active` / `suspended`
- **响应**：`items` + `pagination`

## PATCH /api/v1/admin/users/{id}

- **用途**：更新用户角色或状态。
- **权限**：
  - `owner/admin` 可更新用户 `status`
  - 只有 `owner` 可更新用户 `role`
- **安全限制**：
  - 不能停用自己的账号
  - 不能移除系统最后一个 `owner`
- **Body 示例**：

```json
{
  "role": "admin",
  "status": "active"
}
```

- `role` 可选：`owner` / `admin` / `user`
- `status` 可选：`active` / `suspended`
