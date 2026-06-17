# Agent API

Base path: `/api/v1`

> **说明**：`/agents` 当前作为兼容接口保留，数据来源已与 **自动化模块（`automation_configs`）** 对齐。当前产品主线是 [OAF Bot](./automation.md#oaf-bot)、`/automations`、`/content-drafts`、`/handling-list` 与 `/exposure-radar`，不要把 `/agents` 当作新的机器人模型。

## GET /api/v1/agents

- **鉴权**：需要（Bearer Token）
- **用途**：返回当前用户的自动化兼容视图（`post` / `reply` / `dm`）。
- **实现**：首次访问会确保当前用户存在默认自动化配置行，然后从 `automation_configs` 读取真实状态。

示例响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": 12,
      "name": "Reply Agent",
      "model": "automation:reply",
      "type": "reply",
      "state": "Queued",
      "enabled": true,
      "next_run_at": "2026-05-07T08:00:00Z"
    }
  ]
}
```

## Notes

- 该接口不再返回硬编码 `default-agent`。
- `model` 字段当前为兼容展示字段，格式为 `automation:<type>`。
- 新的 AI 社交人格机器人请使用 `/oaf-bots`。
- `agents` 表仍属于历史 scaffold/兼容实体。
