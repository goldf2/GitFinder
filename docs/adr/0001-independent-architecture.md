# ADR-0001：GitFinder 2.0 作为独立项目演进

- 状态：已接受
- 日期：2026-08-28
- 决策范围：项目边界、复用策略、Panel 集成、数据与凭据边界

## 背景

GitFinder 1.x 已累积可用的 Finder 式文件管理、Git 状态、本地项目、关系白板和 macOS/Windows 发布能力。继续在 1.x 中叠加部署监控会放大模块耦合、发布风险和产品概念混乱。

Xiangshu Panel 已承担 Coolify 多节点聚合和服务器观测。GitFinder 应消费 Panel 提供的稳定聚合事实，而不应把 Panel 页面、节点 Token 或服务器监控循环复制到桌面端。

## 决策

1. GitFinder 1.x 进入稳定维护期。
2. GitFinder 2.0 使用独立目录 `/Volumes/project/开发中/gitfinder-2`，首个版本目标为 `2.0.0-alpha.1`。
3. 不从零重写。2.0 以 GitFinder 1.x v1.30.13 的已验证界面骨架和交互结构作为起点，再在独立项目中迭代。所有 1.x 复用都必须以现有回归测试和 2.0 契约测试为迁移门禁。
4. Panel 是独立 Provider 和服务器端监控权威。GitFinder 通过稳定、认证、最小权限的版本化 API 读取目录、快照与事件。
5. Alpha 只读，不引入任何 Coolify 或服务器写操作。

## 复用与迁移策略

### A. 优先抽离并复用

| 1.x 候选能力 | 2.0 复用方式 | 迁移门禁 |
| --- | --- | --- |
| 主窗口、侧栏、工作区标签、项目详情、右侧检查器与白板 | 作为 2.0 界面基线，Panel 数据以原生组件插入现有信息层级 | 1.x 文件/Git/项目工作流不因 Panel 数据加载而退化 |
| `localProjectService` 与 `.gitfinder/project.json` | 保留 `projectId`、相对仓库排除和嵌套项目语义 | 1.x 清单只读导入结果与原结果一致 |
| `gitService` | 先复用检测、状态、分支和远程读取 | 不因部署集成扩大 Git 写操作 |
| `fileOperationService` 安全语义 | 复用受管边界、预览/确认、冲突、回收站和跨卷传输策略 | 现有回归用例必须原样通过 |
| `relationshipGraphModel` 与白板持久化 | 复用受控实体、关系、事实来源和核验时间 | 不允许敏感字段或悬空关系 |
| 受信 IPC、目录授权和路径边界 | 作为 2.0 默认桌面安全基线 | 渲染进程继续无 Node 权限 |
| macOS/Windows 构建与实机门禁 | 保留平台状态区分、安装/启动/卸载验收 | 不用交叉打包代替真实 Windows 验证 |

### B. 保留界面行为，重构内部边界

- 1.x 渲染层：保留可见布局、交互和测试行为；将 Panel Provider、部署关联和通知状态做成独立控制器，不继续扩大单一全局对象。
- `configService`：拆分便携项目数据、本机偏好、Provider 配置和安全凭据。
- `coolifyReadOnlyConnectorService`：可复用 HTTPS 约束、字段白名单、响应上限、并发限制、脱敏错误和只读白板投影经验；不复用“桌面端持有 Coolify Token 并逐节点直连”的集成模型。

### C. 禁止复制

- Xiangshu Panel 整页界面、DOM 结构、截图管线或未公开接口。
- 通过 `iframe`/`webview` 把 Panel 网站直接嵌入 GitFinder 的做法。
- Coolify 节点 Token、私钥、Cookie、服务器凭据或凭据派生值。
- Alpha 范围外的停止、重启、删除、部署、服务器配置和复杂日志分析。

## 数据与凭据边界

### 便携项目数据

Alpha 保持现有 `.gitfinder/project.json` `schemaVersion: 1` 不变，避免破坏 1.x 兼容。部署关联如需随项目携带，使用独立 `.gitfinder/deployments.json`，只允许：

- `schemaVersion`
- `providerKind`
- `providerId`
- `nodeId`
- `projectUuid`
- `environmentUuid`
- `resourceUuid`
- 本地 `projectId` 与可选仓库稳定 ID

文件不记录 Provider URL、Token、Authorization 头、Cookie、私钥或任何可恢复凭据的值。

### 本机数据

- Provider URL、连接标签、轮询偏好、通知策略、事件游标和去重状态保存在应用用户数据目录。
- Provider Token 保存在 macOS Keychain / Windows Credential Manager 或留在 Panel 管理的会话中。
- 日志只记录 Provider ID、状态码和经脱敏错误，不记录请求头和原始敏感响应。

## Panel Provider 契约方向

Panel 提供稳定版本的逻辑契约，具体 URL 在 Panel 仓库中确定：

1. **Catalog**：返回服务器节点、Panel/Coolify 项目、环境、资源、公开域名和当前状态。
2. **Snapshot**：按稳定资源 ID 返回状态、环境、服务器、域名、观测时间和跳转 URL。
3. **Events**：通过轮询游标或 SSE 返回稳定 `eventId`、资源身份、之前/当前状态、严重程度、首次/最后观测时间和恢复关联。
4. **Capabilities**：明确宣告 API 版本和只读能力，GitFinder 对未知主版本必须拒绝。

API 凭据只授予上述读取权限，应支持撤销和轮换。

## 通知决策

- 连续失败阈值默认为 3，可配为 2。
- 只对状态变化通知；同一 `eventId` 或等价资源/状态/时间窗口去重。
- 同一事件在冷却窗口内不重复通知。
- 恢复必须通知，并关联到原故障。
- 通知偏好支持项目、环境、严重程度和免打扰时段。
- 点击通知优先打开 GitFinder 对应项目；用户明确选择后才跳转 Panel 或 Coolify。

## 后果

- 2.0 可以独立发布和调整数据模型，不影响 1.x 稳定用户。
- 前期会有抽离模块和契约测试成本，但可避免携带 1.x 的整体耦合。
- Panel API 是 Alpha 的外部前置条件；在契约未确认前，只能实现本地假服务器和契约测试，不能声称已完成 Panel 集成。
