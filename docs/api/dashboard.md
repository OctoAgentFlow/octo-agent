# Dashboard API

Base path: `/api/v1`

统一返回结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

## 当前已实现

### GET /api/v1/dashboard/overview
- 鉴权：需要（Bearer Token）
- 用途：返回 Dashboard 概览核心状态（用于首页 KPI 卡片）

示例响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "plan": "free_trial",
    "trial_days_left": 5,
    "wallet_bound": true,
    "connected_x_count": 1,
    "activity_count_24h": 3,
    "activity_count_prev_24h": 1,
    "activity_success_rate_pct": 80,
    "last_activity_at": "2026-04-18T10:23:00+08:00"
  }
}
```

`last_activity_at` 在无活动记录时 **省略**（JSON `null` 或不返回字段，取决于序列化配置；当前后端为指针字段 `omitempty`）。

## 字段说明

- `plan`：当前套餐编码（代码中固定 `free_trial`）
- `trial_days_left`：试用剩余天数（基于用户创建时间，**固定 7 天试用窗口**）
- `wallet_bound`：是否已绑定主钱包（`user_wallets` 中存在主钱包记录）
- `connected_x_count`：当前用户已连接 X 账号数量（**不含** `status = disconnected`）
- `activity_count_24h`：活动日志在「当前时刻往前 24 小时」内的条数（滚动窗口）
- `activity_count_prev_24h`：再往前 24 小时（即 48h～24h 前）的条数，用于对比
- `activity_success_rate_pct`：近 **7 天**内 `success / (success + failed)` 的百分比（四舍五入为整数；无完成记录时为 0）
- `last_activity_at`：该用户最近一条活动日志的 `executed_at`（RFC3339）；无记录时省略
