# ADR 0002：Panel 动态拓扑与仓库稳定身份

- 状态：已接受，GitFinder 客户端首批垂直切片已实现
- 日期：2026-08-29
- 适用版本：GitFinder 2.0 Alpha

> 2026-08-29 更新：稳定身份、显式仓库关联和只读动态投影仍然有效；Panel 作为唯一动态事实来源的决定已由 [ADR-0004](./0004-direct-coolify-provider.md) 取代。

## 背景

GitFinder 已能识别本地项目和 Git 仓库，也有可拖拽连线的关系白板。Xiangshu Panel 则持续汇总 Coolify 节点、部署资源、公开端点和可用性。两者需要建立清晰联动，使用户从服务器或部署异常直接定位到本地项目、仓库和对应提交。

本地目录路径不能作为跨设备身份：路径会因操作系统、盘符、挂载点和移动操作改变。Coolify 资源 UUID 也不能替代仓库身份，因为同一仓库可以部署到多个环境，一个部署也可能由多个仓库共同构成。

## 决策

1. **Panel 是动态事实来源。** Panel 保存 Coolify 凭据并持续采集服务器、部署、延迟、更新时间和部署事件；GitFinder 仅使用最小权限的聚合 API。
2. **GitFinder 是本地身份和交互来源。** GitFinder 保存项目身份、`repositoryId`、当前本地路径、白板手工事实和本机显示偏好。
3. **部署通过 `repositoryId` 显式关联本地仓库。** 不以目录名、仓库名或远程 URL 的模糊匹配作为最终关联；它们只能提供待确认建议。
4. **动态拓扑不写入持久白板事实。** 服务器和部署状态由 Panel 快照生成只读投影，与手工节点在渲染时合并；刷新、过期或断线不会修改用户白板。
5. **当前状态与最近失败是不同维度。** 服务可以当前正常但最近部署失败；界面必须同时保留这两个事实，不能用单一红绿状态替代。
6. **便携配置不得包含敏感信息和绝对路径。** `.gitfinder/deployments.json` 只保存 Provider、Panel 资源 ID 和 GitFinder `repositoryId`；令牌只存在应用本机会话，具体边界见 ADR-0003。

## 稳定身份

| 对象 | 稳定身份 | 说明 |
| --- | --- | --- |
| Panel Provider | `providerId` | 由 Panel 根地址派生 |
| 服务器 | `providerId + nodeId` | 不使用服务器显示名 |
| 部署资源 | `providerId + resourceUuid` | 同一资源跨快照保持一致 |
| 本地项目 | `projectId` | 来自 `.gitfinder/project.json` |
| Git 仓库 | `repositoryId` | GitFinder 仓库注册表；移动目录后仍可解析 |

`repositoryId` 优先由规范化远程地址或根提交派生。没有远程和根提交时可能使用本机随机身份；这种绑定可以保留，但其他设备会显示“本地仓库不可用”，不会猜测成另一个仓库。

## 关联配置 v2

```json
{
  "schemaVersion": 2,
  "bindings": [
    {
      "providerKind": "xiangshu-panel",
      "providerId": "panel_…",
      "nodeId": "node-1",
      "projectUuid": "panel-project-1",
      "environmentUuid": "production",
      "resourceUuid": "app-1",
      "repositoryIds": ["r_0123456789ab"],
      "primaryRepositoryId": "r_0123456789ab"
    }
  ]
}
```

- 一个部署可关联 0–8 个仓库；未关联时仍显示 Panel 节点，但标记“未关联本地仓库”。
- `primaryRepositoryId` 必须属于 `repositoryIds`。
- v1 的 `repositoryRelativePath` 只用于兼容读取和人工迁移，不再作为跨设备主身份。
- 找不到某个 `repositoryId` 时保留配置，并显示“本机尚无该仓库”，不删除关联。

## 只读投影

```text
Panel 快照
  ├─ 服务器（动态、只读）
  └─ 部署资源（动态、只读）
       ├─ runs_on → 服务器
       └─ source_of ← repositoryId 对应仓库
                         └─ contains ← 本地项目
```

投影节点使用确定性 ID，以便每次刷新保持选择和布局稳定。首批版本使用自动分栏布局；后续仅持久化节点位置覆盖值，不持久化动态状态内容。

## 安全边界

- GitFinder 不接收或保存 Coolify Token。
- Panel Token 不进入项目数据、Git 或白板；当前由应用自有会话保存，不读取系统钥匙串或保存 Panel 密码，具体边界见 ADR-0003。
- 首批 API 和界面只读，不提供部署、重启、停止、删除和服务器配置。
- 外部链接必须来自最近一次已验证的 Panel 响应，并由用户点击后打开。

## 后果

- 本地目录移动、Windows 盘符差异不会破坏已建立的稳定关联。
- Panel 暂时不可用时，本地文件和 Git 管理仍可用；白板明确显示同步错误或陈旧快照，而不是误报服务下线。
- 真实部署与源码提交可以比较，但只有 Panel 提供部署提交时才能判断“本地是否领先/部署是否落后”。
- Xiangshu Panel 必须实现本文配套的拓扑契约；在此之前只能用本地 Mock 验证 GitFinder 侧行为。
