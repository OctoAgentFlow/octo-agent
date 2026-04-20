# Agent API

Base path: `/api/v1`

> **说明**：本组接口与 **自动化（`automations`）** 无关。控制台「Agents / 自动化」页使用的真实配置与开关来自 [automation.md](./automation.md)。

## GET /api/v1/agents

- **鉴权**：需要（Bearer Token）
- **用途**：返回 Agent 列表（**硬编码占位**，未读数据库 `agents` 表）
- **实现**：`AgentController.List` 固定返回 `[{ "id": 1, "name": "default-agent" }]`。

示例响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": 1,
      "name": "default-agent"
    }
  ]
}
```

## 后续

- 若产品与「自动化模块」合并，可在此接口中改为查询 `agents` / 关联任务，或与 `automations` 数据模型对齐；**以届时代码为准**。
