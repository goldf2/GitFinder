# GitFinder 2.0

GitFinder 2.0 的定位是“本地开发与部署管理中心”。它是与 GitFinder 1.x 分离的新项目，但会在逐项验证后复用 1.x 已经成熟的能力，不以“全部重写”为目标。

2.0 的界面以 GitFinder 1.x v1.30.13 为基线，保留现有窗口骨架、侧栏、工作区标签、目录/项目详情、右侧检查器和关系白板。Xiangshu Panel 数据以原生“部署面板”组件整合进这些结构，不嵌入 Panel 网页。

## 当前状态

| 状态 | 结论 |
| --- | --- |
| 已记录 | 产品定位、1.x/2.0 边界、Panel 集成边界和 Alpha 闭环 |
| 已设计 | 复用分类、应用自有会话边界、Panel 动态拓扑契约、repositoryId 身份与白板投影验收 |
| 已实现 | 1.x v1.30.13 界面基线、可移除受管位置、多 Panel 只读 Provider、无钥匙串应用会话、v2 多仓库关联、服务器/部署动态白板、标签页独立窗口，以及关系类型/方向/显示名称编辑 |
| 已验证 | 666 项测试与 185 个 JavaScript 文件语法检查通过；双 Mock Panel 聚合、应用会话迁移、只读投影、位置移除、视图切换竞态保护、整卡拖动和关系编辑回归通过 |
| 尚未验证 | 真实 Xiangshu Panel `/topology` API、真实 Windows x64 runner/虚拟机、SSE 事件与系统通知 |

当前开发版本为 `2.0.0-alpha.7`。它是本地可运行的开发 Alpha，不是稳定发布版；完整 MVS-01 仍需真实 Panel、真实 Windows、事件和通知验收。

## 产品边界

- GitFinder 1.x 进入稳定维护期，只处理严重缺陷、安全问题和必要兼容性。
- GitFinder 2.0 负责本地项目、Git 仓库、部署关联、项目详情、关系白板和系统通知。
- Xiangshu Panel 继续独立运行，负责 Coolify 多节点聚合、服务器端监控和管理后台。
- GitFinder 只通过经过身份验证、最小权限、稳定版本化的 Panel API 读取聚合事实与事件。
- GitFinder 不读取系统钥匙串或保存 Panel 密码；可撤销只读令牌作为应用会话保存在本机用户数据中，不进入项目配置。
- 每个 Panel 根地址拥有独立、稳定的 `providerId` 和应用会话；白板汇总多个 Provider，远端同名 ID 不会互相串联。
- 左侧“位置”中的手动受管根可从应用列表移除；此操作不会删除磁盘文件夹或文件。
- GitFinder 2 不直连 Coolify，也不显示 Coolify Token 输入框；Coolify 只作为 Panel 快照中的外部跳转目标。
- Alpha 阶段只读；不停止、重启、删除或修改服务器与 Coolify 资源。
- 部署概览进入项目详情、白板和侧边工具，不新增一级主视图。

## 当前已知环境

- GitFinder 1.x 仓库：`/Volumes/project/已部署/git-status-monitor`。
- 1.x 当前本地版本：`1.30.13`，本地 `main` 已包含一个未推送的稳定维护提交。
- 本地“开发中/已部署”范围未找到 Xiangshu Panel 源码仓库；在有 API 契约前，Panel 按外部数据提供方处理。

## 文档入口

- [领域上下文](./CONTEXT.md)
- [ADR-0001：2.0 独立架构与复用边界](./docs/adr/0001-independent-architecture.md)
- [ADR-0002：Panel 动态拓扑与仓库稳定身份](./docs/adr/0002-panel-topology-and-repository-identity.md)
- [ADR-0003：Panel 应用自有会话，不使用系统钥匙串](./docs/adr/0003-app-owned-panel-session.md)
- [Alpha 1 最小垂直切片与验收](./docs/product/alpha-1-vertical-slice.md)
- [Panel 原生界面整合方案](./docs/product/panel-ui-integration.md)
- [Panel 动态拓扑 API v1](./docs/contracts/panel-topology-api-v1.md)
- [动态部署关系白板](./docs/product/dynamic-deployment-board.md)
- [2.0.0-alpha.1 MVS-01 阶段验证记录](./docs/verification/2.0.0-alpha.1-mvs-01.md)
- [2.0.0-alpha.3 Panel 动态白板验证记录](./docs/verification/2.0.0-alpha.3-panel-topology.md)
- [2.0.0-alpha.4 应用会话与普通启动验证记录](./docs/verification/2.0.0-alpha.4-app-session.md)
- [2.0.0-alpha.5 多 Panel 与位置移除验证记录](./docs/verification/2.0.0-alpha.5-multi-provider-and-locations.md)
- [2.0.0-alpha.6 视图切换与标签页独立窗口验证记录](./docs/verification/2.0.0-alpha.6-view-switch-and-tab-windows.md)
- [2.0.0-alpha.7 可编辑关系与自动发现边界](./docs/verification/2.0.0-alpha.7-editable-relationships.md)
