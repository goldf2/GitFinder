# GitFinder 2.0

GitFinder 2.0 的定位是“本地开发与部署管理中心”。它是与 GitFinder 1.x 分离的新项目，但会在逐项验证后复用 1.x 已经成熟的能力，不以“全部重写”为目标。

2.0 的界面以 GitFinder 1.x v1.30.13 为基线，保留现有窗口骨架、侧栏、工作区标签、目录/项目详情、右侧检查器和关系白板。Xiangshu Panel 数据以原生“部署面板”组件整合进这些结构，不嵌入 Panel 网页。

## 当前状态

| 状态 | 结论 |
| --- | --- |
| 已记录 | 产品定位、1.x/2.0 边界、Panel 集成边界和 Alpha 闭环 |
| 已设计 | 复用分类、凭据与便携配置边界、最小垂直切片及验收标准 |
| 已实现 | 1.x v1.30.13 Finder 式界面基线、只读 Panel Provider、系统安全凭据、显式项目关联和原生部署详情 |
| 已验证 | 638 项测试、macOS arm64 构建与实际 App 启动；本地假 Panel 的连接、关联和详情显示端到端通过 |
| 尚未验证 | 真实 Xiangshu Panel API、真实 Windows x64 runner/虚拟机、白板部署投影、事件与系统通知 |

当前开发版本为 `2.0.0-alpha.2`。它是本地可运行的开发 Alpha，不是稳定发布版；完整 MVS-01 仍需真实 Panel、真实 Windows、白板和通知验收。

## 产品边界

- GitFinder 1.x 进入稳定维护期，只处理严重缺陷、安全问题和必要兼容性。
- GitFinder 2.0 负责本地项目、Git 仓库、部署关联、项目详情、关系白板和系统通知。
- Xiangshu Panel 继续独立运行，负责 Coolify 多节点聚合、服务器端监控和管理后台。
- GitFinder 只通过经过身份验证、最小权限、稳定版本化的 Panel API 读取聚合事实与事件。
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
- [Alpha 1 最小垂直切片与验收](./docs/product/alpha-1-vertical-slice.md)
- [Panel 原生界面整合方案](./docs/product/panel-ui-integration.md)
- [2.0.0-alpha.1 MVS-01 阶段验证记录](./docs/verification/2.0.0-alpha.1-mvs-01.md)
