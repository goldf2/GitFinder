# Xiangshu Panel → GitFinder 动态拓扑 API v1

- 状态：GitFinder 客户端契约与 Mock 已实现，Panel 生产端尚未实现/验证
- 基础路径：`/api/gitfinder/v1`
- 权限：只读 Bearer Token
- 内容类型：`application/json`

## 能力发现

`GET /capabilities` 必须至少返回现有 `catalog:read`、`snapshots:read`。要启用动态白板，还必须包含 `topology:read`；`events:read` 是后续增量事件能力，不阻塞首批轮询。

```json
{
  "apiVersion": "1.1",
  "providerKind": "xiangshu-panel",
  "capabilities": ["catalog:read", "snapshots:read", "topology:read"]
}
```

## 动态拓扑

`GET /topology`

```json
{
  "apiVersion": "1.1",
  "generatedAt": "2026-08-29T02:00:00.000Z",
  "cursor": "opaque-cursor",
  "servers": [
    {
      "nodeId": "node-1",
      "name": "Con01",
      "status": "online",
      "observedAt": "2026-08-29T02:00:00.000Z",
      "lastSeenAt": "2026-08-29T01:59:58.000Z",
      "latencyMs": 32,
      "resourceCount": 12,
      "panelUrl": "https://panel.example.com/nodes/node-1"
    }
  ],
  "deployments": [
    {
      "resourceUuid": "app-1",
      "nodeId": "node-1",
      "projectUuid": "project-1",
      "environmentUuid": "production",
      "name": "MES Lite",
      "type": "application",
      "status": "running",
      "projectName": "MES",
      "environmentName": "生产",
      "serverName": "Con01",
      "domains": ["https://mes.example.com"],
      "observedAt": "2026-08-29T02:00:00.000Z",
      "latencyMs": 86,
      "latencyKind": "http",
      "branch": "main",
      "commit": "0123456789abcdef",
      "imageReference": "ghcr.io/example/mes:2.4.0",
      "imageDigest": "sha256:…",
      "lastDeployment": {
        "deploymentUuid": "deployment-10",
        "status": "finished",
        "success": true,
        "createdAt": "2026-08-29T01:42:00.000Z",
        "updatedAt": "2026-08-29T01:45:00.000Z",
        "finishedAt": "2026-08-29T01:45:00.000Z",
        "commit": "0123456789abcdef",
        "branch": "main",
        "message": "release 2.4.0"
      },
      "recentFailure": {
        "hasFailure": false,
        "occurredAt": null,
        "deploymentUuid": null,
        "message": "",
        "recoveredAt": null
      },
      "panelUrl": "https://panel.example.com/resources/app-1",
      "coolifyUrl": "https://coolify.example.com/project/app-1"
    }
  ]
}
```

## 字段语义

- `status`：当前服务器或资源运行状态。
- `observedAt`：Panel 最后一次确认该状态的时间，不是部署时间。
- `latencyMs`：最近一次探测延迟；无数据时省略或为 `null`，不能用 `0` 代表未知。
- `latencyKind`：`http`、`tcp`、`icmp` 或 `agent`；避免把不同探测口径直接比较。
- `lastDeployment`：最近一次部署尝试，不等于当前运行状态。
- `recentFailure`：Panel 按配置窗口计算的最近失败事实；恢复后可保留失败时间并填写 `recoveredAt`。
- `commit`：部署使用的完整或可唯一识别提交；未知时为空。不得由当前本地 HEAD 猜测。

## 安全与容量限制

- 响应正文最多 2 MiB。
- `servers` 最多 256 项，`deployments` 最多 2000 项，每项域名最多 20 个。
- ID 只允许字母、数字、点、下划线、冒号和连字符，最长 180 字符。
- 名称最长 160 字符，事件消息最长 500 字符，URL 最长 2048 字符。
- 时间必须是带时区的 ISO 8601；延迟范围 0–600000 ms。
- URL 只允许 HTTP(S)，不得包含用户名或密码。
- 响应不得包含 Coolify Token、SSH 密钥、环境变量或其他敏感字段。

## 刷新、过期与失败

- 首批 GitFinder 在白板打开时每 30 秒轮询；切走白板后停止轮询。
- 新请求必须使用序号或取消信号，旧响应不得覆盖新响应。
- 超过 90 秒未成功更新显示“数据陈旧”；请求失败显示同步错误，但不得把所有资源改成 stopped/offline。
- 后续可增加 SSE `GET /events?cursor=…`，事件断开后仍以 `/topology` 全量快照校准。

## 生产验收样例

Panel 端实现后，至少用以下场景验收：正常运行、当前故障、部署失败后已恢复、无延迟数据、无部署提交、资源迁移服务器、资源删除、重复/乱序响应和 Token 权限不足。
