# Agent API

Base path: `/api/v1`

> **说明**：`/agents` 当前作为兼容接口保留，数据来源已与 **自动化模块（`automation_configs`）** 对齐。控制台「Agents / 自动化」页仍主要使用 [automation.md](./automation.md) 中的 `/automations` 接口进行配置编辑。

## GET /api/v1/agents

- **鉴权**：需要（Bearer Token）
- **用途**：返回当前用户的自动化 Agent 视图（`post` / `reply` / `dm`）。
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
- 若后续引入独立 Agent 实体，可再将 `agents` 表与自动化配置建立明确关联。
