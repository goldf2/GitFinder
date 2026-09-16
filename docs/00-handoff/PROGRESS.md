# GitFinder 开发进度看板

> 自动生成。只编辑 `management/development-tasks.json`，然后执行 `npm run handoff:update`。

更新时间：2026-09-16T21:17:23+08:00。以alpha.193为核验基线的近期维护与后续路线；不是全部产品功能或整体完成百分比。

核验基线：2.0.0-alpha.193 / `99eef1d2992e389f32a48182a25fda3b9adf1958`；证据：[docs/00-handoff/LAYOUT_OPTIONS_ALPHA193.md](LAYOUT_OPTIONS_ALPHA193.md)。

**唯一下一任务：GF-LABS-001**

## 阶段汇总

| 阶段 | 纳入任务 | 已交付 | 开发中/已验证 | 阻塞/暂缓 |
| --- | ---: | ---: | ---: | ---: |
| GF-P0 接续工程 | 2 | 2 | 0 | 0 |
| GF-P1 桌面稳定 | 10 | 4 | 1 | 1 |
| GF-P2 可维护与性能 | 4 | 0 | 0 | 0 |
| GF-P3 可分发 | 5 | 0 | 0 | 3 |
| GF-P4 全流程事件 | 5 | 0 | 0 | 1 |
| GF-P5 Web与同步（需授权） | 4 | 0 | 0 | 4 |

以上是本清单任务计数，不代表产品整体完成度。交付与用户反馈分别记录；脚本不会判定验收真假。

## 任务列表

| 编号 | 优先级 | 状态 | 负责人 | 任务 |
| --- | --- | --- | --- | --- |
| GF-HANDOFF-001 | P0 | 已交付 | 本轮 ChatGPT / AgentDock Cloudflare | 详细开发方案与单一进度接续体系 |
| GF-PANEL-189 | P1 | 已交付 | 历史交付记录 | 白板右栏可调宽及配置恢复 |
| GF-SAVE-191 | P1 | 已交付 | 历史交付记录 | 白板自动/手动保存统一生命周期 |
| GF-MEDIA-192 | P1 | 已交付 | 历史交付记录 | 媒体来源绑定、迟到结果及重开保护（随193交付） |
| GF-LAYOUT-193 | P1 | 已交付 | 历史交付记录 | 分组布局菜单与均衡主机总览 |
| GF-ACCEPT-001 | P1 | 阻塞 | unassigned | 实际布局、保存与媒体体验反馈及修复归档 |
| GF-QUALITY-001 | P1 | 可开始 | unassigned | 35部署基线与100/300/1000节点的可重复规模验证 |
| GF-UI-001 | P1 | 可开始 | unassigned | 全屏偶发输入与键盘/主题可访问性矩阵 |
| GF-DATA-001 | P1 | 可开始 | unassigned | 保存失败、进程中断与冲突恢复矩阵 |
| GF-DATA-002 | P1 | 可开始 | unassigned | 媒体搬迁、缺失引用和损坏包边界 |
| GF-ARCH-001 | P2 | 计划中 | unassigned | 白板显示几何或菜单生命周期的兼容拆分 |
| GF-PERF-001 | P2 | 计划中 | unassigned | 按测量证据优化重绘与读写热点 |
| GF-STORAGE-001 | P2 | 可开始 | unassigned | 已实现存储格式和恢复边界清单 |
| GF-CI-001 | P1 | 可开始 | unassigned | 当前远端CI结果和跨平台测试入口核验 |
| GF-WIN-001 | P2 | 计划中 | unassigned | Windows x64正常安装与默认GPU路径验收 |
| GF-UPDATE-001 | P2 | 阻塞 | unassigned | 正式签名与旧版到新版更新链路 |
| GF-RELEASE-001 | P2 | 暂缓 | unassigned | 公开发布控制面、manifest与回退联合验收 |
| GF-AUTH-001 | P2 | 阻塞 | unassigned | 现有独立账户的真实登录/刷新/退出验收 |
| GF-EVENT-001 | P2 | 计划中 | unassigned | 部署事件模型与有界历史增量契约 |
| GF-EVENT-002 | P2 | 计划中 | unassigned | 一个仓库双环境的项目事件时间线 |
| GF-NOTIFY-001 | P2 | 计划中 | unassigned | 桌面通知去重、免打扰与白板定位 |
| GF-WEBHOOK-001 | P3 | 暂缓 | unassigned | 可选事件接收器与游标订阅 |
| GF-CI-EVENT-001 | P3 | 计划中 | unassigned | 提交—构建—产物—部署证据关联 |
| GF-CLOUD-001 | P3 | 暂缓 | unassigned | Web与同步范围、隐私和存储契约决策 |
| GF-CLOUD-002 | P3 | 暂缓 | unassigned | 一个白板和图片的双端同步闭环 |
| GF-CLOUD-003 | P3 | 暂缓 | unassigned | 云快照、实时连接器及协作扩展评审 |
| GF-DB-001 | P3 | 暂缓 | unassigned | 本地数据库/存储迁移决策与恢复设计 |
| GF-PROGRESS-001 | P0 | 已交付 | ChatGPT / AgentDock Cloudflare | 仓库进度接入开发任务与仪表盘 |
| GF-LABS-001 | P0 | 已验证 | ChatGPT / AgentDock Cloudflare | 设置测试功能区与仪表盘/开发进度默认关闭 |
| GF-AI-PROGRESS-001 | P1 | 计划中 | unassigned | AI辅助进度识别与人工确认的证据链设计 |

## 可执行任务卡

### GF-HANDOFF-001 · 详细开发方案与单一进度接续体系

阶段：GF-P0；优先级：P0；状态：**已交付**；负责人：本轮 ChatGPT / AgentDock Cloudflare；用户验收：不要求用户确认。

更新：2026-09-16T16:13:30+08:00。依赖：无。

**验收标准**
1. 从仓库入口可以定位当前版本、唯一下一任务及明确验收，不依赖聊天历史。
2. 任务源与生成看板一致，异常字段/依赖/路径/过期看板检查有回归。
3. 修正过期README和旧AI入口，保护已有未提交内容；按项目规则完成交付。

**接续动作：** 工程接续体系已交付；下一任务为GF-QUALITY-001，先准备可复现隔离fixture和规模基线，不自动启动云/数据库实施。

源码/设计入口：[AGENTS.md](../../AGENTS.md)；[docs/00-handoff/DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md)；[docs/00-handoff/HANDOFF_PROTOCOL.md](HANDOFF_PROTOCOL.md)；[scripts/handoff-status.js](../../scripts/handoff-status.js)；[docs/00-handoff/RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)。

证据：[docs/00-handoff/HANDOFF_SYSTEM_ALPHA194.md](HANDOFF_SYSTEM_ALPHA194.md)

交付：2.0.0-alpha.194；源码 `e142524c3de4448c7a9bd15b945b3eb3918c7c2d`。

### GF-PANEL-189 · 白板右栏可调宽及配置恢复

阶段：GF-P1；优先级：P1；状态：**已交付**；负责人：历史交付记录；用户验收：待用户反馈。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 拖动、键盘和取消行为有回归，宽度写本机偏好而非白板。
2. 安装版退出重启恢复宽度；核验范围和原生输入限制如实记录。

**接续动作：** 保持历史证据；实际反馈纳入GF-ACCEPT-001，不重复实现。

源码/设计入口：[src/renderer/scripts/relationshipPanelResize.js](../../src/renderer/scripts/relationshipPanelResize.js)；[test/relationship-panel-resize.test.js](../../test/relationship-panel-resize.test.js)。

证据：[docs/00-handoff/RIGHT_PANEL_WIDTH_ALPHA189.md](RIGHT_PANEL_WIDTH_ALPHA189.md)

交付：2.0.0-alpha.189；源码 `c824659c13d6e6aeb71e0225ac41d43d2c8d5070`。

### GF-SAVE-191 · 白板自动/手动保存统一生命周期

阶段：GF-P1；优先级：P1；状态：**已交付**；负责人：历史交付记录；用户验收：待用户反馈。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 保存期间新编辑不被旧结果覆盖，后继请求使用新revision。
2. 取消另存为与工作区切换失败有恢复，实际文件读回及重启通过。

**接续动作：** 保持历史证据；实际反馈纳入GF-ACCEPT-001，不重复实现。

源码/设计入口：[src/renderer/scripts/relationshipBoardPersistence.js](../../src/renderer/scripts/relationshipBoardPersistence.js)；[test/relationship-save-lifecycle.test.js](../../test/relationship-save-lifecycle.test.js)。

证据：[docs/00-handoff/SAVE_LIFECYCLE_ALPHA191.md](SAVE_LIFECYCLE_ALPHA191.md)

交付：2.0.0-alpha.191；源码 `fc72a86a611813307601ebccd54a8a2474562e7f`。

### GF-MEDIA-192 · 媒体来源绑定、迟到结果及重开保护（随193交付）

阶段：GF-P1；优先级：P1；状态：**已交付**；负责人：历史交付记录；用户验收：待用户反馈。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 换图、旧路径恢复与迟到预览不串源，历史附件不盲删。
2. 媒体字节/界面及安装重开有证据；192不冒充单独安装过。

**接续动作：** 保持历史证据；实际反馈纳入GF-ACCEPT-001，不重复实现。

源码/设计入口：[test/relationship-media-lifecycle.test.js](../../test/relationship-media-lifecycle.test.js)；[scripts/verify-relationship-media-lifecycle.js](../../scripts/verify-relationship-media-lifecycle.js)。

证据：[docs/00-handoff/MEDIA_LIFECYCLE_ALPHA192.md](MEDIA_LIFECYCLE_ALPHA192.md)

交付：2.0.0-alpha.193；源码 `99eef1d2992e389f32a48182a25fda3b9adf1958`。

### GF-LAYOUT-193 · 分组布局菜单与均衡主机总览

阶段：GF-P1；优先级：P1；状态：**已交付**；负责人：历史交付记录；用户验收：待用户反馈。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 三主机不均衡样本多列显示，算法/Controller/Flow三层一致，不改成员归属。
2. 菜单桌面/窄屏/全屏、撤销与重开有验证，原用户布局未自动改写。

**接续动作：** 保持历史证据；实际反馈纳入GF-ACCEPT-001，不重复实现。

源码/设计入口：[src/shared/relationshipFlowAdapter.js](../../src/shared/relationshipFlowAdapter.js)；[src/shared/relationshipLayoutPrimitives.js](../../src/shared/relationshipLayoutPrimitives.js)；[test/relationship-project-balanced.test.js](../../test/relationship-project-balanced.test.js)。

证据：[docs/00-handoff/LAYOUT_OPTIONS_ALPHA193.md](LAYOUT_OPTIONS_ALPHA193.md)

交付：2.0.0-alpha.193；源码 `99eef1d2992e389f32a48182a25fda3b9adf1958`。

### GF-ACCEPT-001 · 实际布局、保存与媒体体验反馈及修复归档

阶段：GF-P1；优先级：P1；状态：**阻塞**；负责人：unassigned；用户验收：待用户反馈。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 用户主动操作原白板并反馈，无替用户操作或代签确认。
2. 具体问题绑定稳定ID、截图和版本；确认有效后按支持文档规则归档。

**接续动作：** 收集用户实际体验；没有明确确认时保持pending，不阻断独立测试准备。

源码/设计入口：[docs/00-handoff/LAYOUT_OPTIONS_ALPHA193.md](LAYOUT_OPTIONS_ALPHA193.md)；[docs/00-handoff/DEBUG_LOG.md](DEBUG_LOG.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

**阻塞/暂缓原因：** 等待用户实际体验反馈；内部安装验收不能代替用户确认。

### GF-QUALITY-001 · 35部署基线与100/300/1000节点的可重复规模验证

阶段：GF-P1；优先级：P1；状态：**可开始**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T16:13:30+08:00。依赖：GF-LAYOUT-193。

**验收标准**
1. 提供确定性fixture准备方式，独立profile内完成，无真实用户config/凭据。
2. 35部署基线与100/300/1000节点样本分别记录实体/显示节点数、环境和首屏/排列/保存/重开测量，不把单样本30%改善推广到所有场景。
3. 重复应用/后台刷新/序列化及实际Flow显示一致，保留失败与前后截图。

**接续动作：** 阅读四个验证脚本对fixture的输入要求，先实现可重复临时数据准备并测35节点基线。

源码/设计入口：[scripts/verify-relationship-layout-options.js](../../scripts/verify-relationship-layout-options.js)；[scripts/verify-relationship-save-lifecycle.js](../../scripts/verify-relationship-save-lifecycle.js)；[scripts/verify-relationship-media-lifecycle.js](../../scripts/verify-relationship-media-lifecycle.js)；[test/relationship-project-balanced.test.js](../../test/relationship-project-balanced.test.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-UI-001 · 全屏偶发输入与键盘/主题可访问性矩阵

阶段：GF-P1；优先级：P1；状态：**可开始**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T16:13:30+08:00。依赖：GF-PANEL-189。

**验收标准**
1. 记录pointer/blur/cancel、DPR和窗口状态，明确alpha190偏差是否复现。
2. 菜单不会穿透到画布删除/撤销，浅深/窄屏/减少动画路径有证据。
3. 权限拒绝、CDP输入和系统级输入分别描述，不用未复现宣称根因修复。

**接续动作：** 保留alpha190输入偏差和alpha194全屏后窄屏菜单首轮隐藏记录，先在独立profile采集resize/菜单事件，复现后再决定是否改产品。

源码/设计入口：[src/renderer/scripts/relationshipBoardActionRouter.js](../../src/renderer/scripts/relationshipBoardActionRouter.js)；[scripts/verify-relationship-panel-resize.js](../../scripts/verify-relationship-panel-resize.js)；[docs/00-handoff/OPTIMIZATION_ALPHA190.md](OPTIMIZATION_ALPHA190.md)。

证据：[docs/00-handoff/HANDOFF_SYSTEM_ALPHA194.md](HANDOFF_SYSTEM_ALPHA194.md)

### GF-DATA-001 · 保存失败、进程中断与冲突恢复矩阵

阶段：GF-P1；优先级：P1；状态：**可开始**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-SAVE-191。

**验收标准**
1. 临时目录覆盖旧revision、写入失败、取消、外部修改和中断。
2. 失败后原内容可见、可重试、不会跨文档写入；正常退出与崩溃分别测试。
3. 原始文件/重开读回一致，失败证据与恢复步骤可复跑。

**接续动作：** 列出当前保存回归未覆盖的IO边界，先补临时文件故障与旧revision测试。

源码/设计入口：[src/renderer/scripts/relationshipBoardPersistence.js](../../src/renderer/scripts/relationshipBoardPersistence.js)；[src/main/services/whiteboardDocumentService.js](../../src/main/services/whiteboardDocumentService.js)；[test/relationship-save-lifecycle.test.js](../../test/relationship-save-lifecycle.test.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-DATA-002 · 媒体搬迁、缺失引用和损坏包边界

阶段：GF-P1；优先级：P1；状态：**可开始**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-MEDIA-192。

**验收标准**
1. 图片替换、外部引用失效、包搬迁、损坏包和名称碰撞在临时目录验证。
2. 只读取已授权资源，不删除用于撤销的旧附件。
3. 源标识、字节、预览和重开结果同时核对，不把fixture注入当磁盘故障。

**接续动作：** 盘点现有媒体验收未覆盖的搬迁/损坏包矩阵，再补最小失败用例。

源码/设计入口：[src/main/services/whiteboardDocumentService.js](../../src/main/services/whiteboardDocumentService.js)；[src/main/services/whiteboardPackageService.js](../../src/main/services/whiteboardPackageService.js)；[test/relationship-media-lifecycle.test.js](../../test/relationship-media-lifecycle.test.js)；[test/whiteboard-package.test.js](../../test/whiteboard-package.test.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-ARCH-001 · 白板显示几何或菜单生命周期的兼容拆分

阶段：GF-P2；优先级：P2；状态：**计划中**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-QUALITY-001。

**验收标准**
1. 只选一个职责切片，旧公开入口委托仍兼容，明确输入/输出/副作用。
2. 正式HTML和所有相关fixture加载顺序同步更新。
3. P1矩阵前后语义和持久化一致，不以代码行数作为完成度。

**接续动作：** 完成基线后选显示几何或菜单状态之一，先画职责表再小步抽取。

源码/设计入口：[src/renderer/scripts/relationshipBoardController.js](../../src/renderer/scripts/relationshipBoardController.js)；[src/renderer/scripts/relationshipBoardActionRouter.js](../../src/renderer/scripts/relationshipBoardActionRouter.js)；[src/shared/relationshipFlowAdapter.js](../../src/shared/relationshipFlowAdapter.js)；[docs/adr/0008-relationship-whiteboard-module-boundaries.md](../adr/0008-relationship-whiteboard-module-boundaries.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-PERF-001 · 按测量证据优化重绘与读写热点

阶段：GF-P2；优先级：P2；状态：**计划中**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-QUALITY-001。

**验收标准**
1. 热点由相同输入的profile证明，不凭体感或单一节点规模。
2. 优化后保存状态、布局、缓存失效和卸载清理回归不退化。
3. 分别记录调用次数、耗时、文件写入和帧率，量化前后差异及限制。

**接续动作：** 使用GF-QUALITY-001基线选择一个最耗时路径，再实施最小优化。

源码/设计入口：[src/shared/panelTopologyProjection.js](../../src/shared/panelTopologyProjection.js)；[src/shared/relationshipFlowAdapter.js](../../src/shared/relationshipFlowAdapter.js)；[src/renderer/scripts/relationshipPanelResize.js](../../src/renderer/scripts/relationshipPanelResize.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-STORAGE-001 · 已实现存储格式和恢复边界清单

阶段：GF-P2；优先级：P2；状态：**可开始**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 每种格式列出所有者、schema、大小限制、原子写、冲突/恢复和路径边界。
2. 当前格式与未来目标格式分开，目录/源码/凭据不混入白板。
3. 不实施SQLite或数据迁移，不擅自提交已有未提交存储草稿。

**接续动作：** 从当前服务和测试提取已实现格式，形成单独可审阅清单，不移动用户数据。

源码/设计入口：[src/main/services/configService.js](../../src/main/services/configService.js)；[src/main/services/relationshipBoardService.js](../../src/main/services/relationshipBoardService.js)；[src/main/services/whiteboardDocumentService.js](../../src/main/services/whiteboardDocumentService.js)；[src/main/services/localProjectService.js](../../src/main/services/localProjectService.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-CI-001 · 当前远端CI结果和跨平台测试入口核验

阶段：GF-P3；优先级：P1；状态：**可开始**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 核对真实当前提交的各平台结果，不将旧Linux诊断当当前失败。
2. 本机和CI均只运行当前test目录，工程进度检查一并执行。
3. 失败明确归因环境/fixture/产品，保留实际退出状态和日志。

**接续动作：** 读取当前远端CI运行并绑定commit，先记录事实；本轮尚未查询远端CI结果。

源码/设计入口：[.github/workflows/ci.yml](../../.github/workflows/ci.yml)；[scripts/check-syntax.js](../../scripts/check-syntax.js)；[test/test-discovery.test.js](../../test/test-discovery.test.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-WIN-001 · Windows x64正常安装与默认GPU路径验收

阶段：GF-P3；优先级：P2；状态：**计划中**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-CI-001。

**验收标准**
1. 真实Windows生成NSIS/ZIP并按普通用户路径启动，不只使用disable-gpu。
2. 基础界面、布局保存/重开、卸载与数据保留有证据。
3. 每个平台版本/产物/签名状态单独记录。

**接续动作：** 先确认可用Windows验证环境和范围，再建立隔离安装回归。

源码/设计入口：[scripts/build-win.js](../../scripts/build-win.js)；[scripts/verify-windows-runtime.js](../../scripts/verify-windows-runtime.js)；[docs/windows-installer-build-guide.md](../windows-installer-build-guide.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-UPDATE-001 · 正式签名与旧版到新版更新链路

阶段：GF-P3；优先级：P2；状态：**阻塞**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 确认签名/公证和测试发布源，旧版真实发现、下载、确认重启后版本正确。
2. 取消、断网、校验失败保留可用旧版及用户数据。
3. 发布清单、平台/架构与产物一致，开发签名不冒充正式发行。

**接续动作：** 确认签名资源与授权的测试发布源；没有证据前不宣称正式升级可用。

源码/设计入口：[src/main/services/updateService.js](../../src/main/services/updateService.js)；[scripts/verify-release.js](../../scripts/verify-release.js)；[docs/online-update-publishing.md](../online-update-publishing.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

**阻塞/暂缓原因：** 尚无本轮可复核的正式签名/公证及旧版升级证据；执行前需确认签名资源和发布范围。

### GF-RELEASE-001 · 公开发布控制面、manifest与回退联合验收

阶段：GF-P3；优先级：P2；状态：**暂缓**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-WIN-001、GF-UPDATE-001。

**验收标准**
1. 取得明确公开发布授权，先上传可验证制品后原子切换manifest。
2. 产品页、发布记录、下载和客户端版本一致，回退记录可复核。
3. 不把本机安装或普通git push当商店/GitHub Release已发布。

**接续动作：** 待平台与升级门禁完成并获授权后执行发布预演。

源码/设计入口：[docs/release-control-plane.md](../release-control-plane.md)；[scripts/create-store-release.js](../../scripts/create-store-release.js)；[scripts/push-store-release.js](../../scripts/push-store-release.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

**阻塞/暂缓原因：** 本次仅工程接续和macOS本机交付，未授权公开发行。

### GF-AUTH-001 · 现有独立账户的真实登录/刷新/退出验收

阶段：GF-P3；优先级：P2；状态：**阻塞**；负责人：unassigned；用户验收：待用户反馈。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 用户自行输入真实账号，完成登录、刷新、退出和会话错误恢复。
2. 未登录/离线不阻断目录、Git与白板核心功能。
3. 不新建账号体系，不把第三方Token或账号凭据写入任务/日志。

**接续动作：** 与用户确认测试账户和交互窗口，仅准备隔离流程不代填密码。

源码/设计入口：[src/main/services/accountService.js](../../src/main/services/accountService.js)；[src/main/services/accountStore.js](../../src/main/services/accountStore.js)；[docs/casdoor-desktop-login.md](../casdoor-desktop-login.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

**阻塞/暂缓原因：** 真实账号交互与授权待用户配合；客户端模块存在不是账号验收证据。

### GF-EVENT-001 · 部署事件模型与有界历史增量契约

阶段：GF-P4；优先级：P2；状态：**计划中**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 核对实际Coolify版本的只读历史字段/分页，定义数量上限与增量游标。
2. provider/资源/部署ID、源时间与接收时间明确，未知不按名称猜测。
3. 归一化、重复、乱序和运行版本未知均有纯函数回归。

**接续动作：** 实施前核对当前Provider已读字段与实际API契约，再写事件schema和fixture。

源码/设计入口：[src/main/services/coolifyProviderService.js](../../src/main/services/coolifyProviderService.js)；[docs/product/delivery-observability-notifications-plan.md](../product/delivery-observability-notifications-plan.md)；[src/shared/repositoryAssociation.js](../../src/shared/repositoryAssociation.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-EVENT-002 · 一个仓库双环境的项目事件时间线

阶段：GF-P4；优先级：P2；状态：**计划中**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-EVENT-001。

**验收标准**
1. 同仓库测试/生产两部署显示多次历史，重启/刷新不重复。
2. 失败部署SHA不标作当前运行版本，来源和时间可见。
3. 从事件定位白板及关联仓库，无本地副本时保留明确占位。

**接续动作：** 以GF-EVENT-001最小事件模型建立本地事件存储和只读时间线垂直切片。

源码/设计入口：[src/main/services/coolifyProviderService.js](../../src/main/services/coolifyProviderService.js)；[src/renderer/scripts/relationshipBoardController.js](../../src/renderer/scripts/relationshipBoardController.js)；[docs/product/delivery-observability-notifications-plan.md](../product/delivery-observability-notifications-plan.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-NOTIFY-001 · 桌面通知去重、免打扰与白板定位

阶段：GF-P4；优先级：P2；状态：**计划中**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-EVENT-002。

**验收标准**
1. 部署失败即时策略与HTTP连续失败阈值分开。
2. 故障周期、恢复、冷却、重启/权限拒绝和免打扰均有验收。
3. 点击定位对应资源；退出/休眠不承诺持续弹窗，不自动打开不可信URL。

**接续动作：** 先定义策略和故障周期状态机，再接主进程系统通知并分平台验证。

源码/设计入口：[main.js](../../main.js)；[src/main/services/endpointHealthService.js](../../src/main/services/endpointHealthService.js)；[docs/product/delivery-observability-notifications-plan.md](../product/delivery-observability-notifications-plan.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-WEBHOOK-001 · 可选事件接收器与游标订阅

阶段：GF-P4；优先级：P3；状态：**暂缓**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-EVENT-002。

**验收标准**
1. 隔离模拟服务覆盖来源认证、重复/乱序、离线重连和游标恢复。
2. 只保存白名单事件，不复用管理Token，不假定源有HMAC/重试保证。
3. 生产部署和Coolify通知配置另行授权，不制造生产故障验收。

**接续动作：** 先确认接收地址、访问控制与保留策略；获准后只做本地协议切片。

源码/设计入口：[docs/product/delivery-observability-notifications-plan.md](../product/delivery-observability-notifications-plan.md)；[src/main/services/coolifyProviderService.js](../../src/main/services/coolifyProviderService.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

**阻塞/暂缓原因：** 常在线接收服务与生产通知配置未授权，基础桌面功能不依赖它。

### GF-CI-EVENT-001 · 提交—构建—产物—部署证据关联

阶段：GF-P4；优先级：P3；状态：**计划中**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-EVENT-002。

**验收标准**
1. 只选择一种实际使用CI源，保留run/commit/artifact/部署稳定ID。
2. 时间线显示各阶段来源和缺失状态，不自动推断故障因果。
3. 应用自己的CI与被管理项目的CI数据分开。

**接续动作：** 确认用户实际CI数据源，再设计只读关联与事件入口。

源码/设计入口：[src/main/services/projectTaskGitEvidenceService.js](../../src/main/services/projectTaskGitEvidenceService.js)；[docs/product/delivery-observability-notifications-plan.md](../product/delivery-observability-notifications-plan.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

### GF-CLOUD-001 · Web与同步范围、隐私和存储契约决策

阶段：GF-P5；优先级：P3；状态：**暂缓**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：无。

**验收标准**
1. 明确域名、部署位置、账户范围、容量和备份/保留策略。
2. 同步白名单排除源码、绝对路径、目录授权和数据源凭据。
3. 本机server.js不直接暴露公网；复用模型而非重写桌面。

**接续动作：** 待用户选择Web/云同步为执行目标，再完成最小契约与安全评审。

源码/设计入口：[docs/product/web-cloud-release-memo.md](../product/web-cloud-release-memo.md)；[docs/product/cloud-whiteboard-sync.md](../product/cloud-whiteboard-sync.md)；[server.js](../../server.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

**阻塞/暂缓原因：** 当前优先桌面可靠性；方案不授权云端部署或上传用户数据。

### GF-CLOUD-002 · 一个白板和图片的双端同步闭环

阶段：GF-P5；优先级：P3；状态：**暂缓**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-CLOUD-001、GF-AUTH-001。

**验收标准**
1. 用户主动选择单白板和图片，双端一致，账户隔离。
2. 离线/冲突双方保留，revision或ETag控制并发，tombstone防删除复活。
3. 实际上传内容白名单扫描，未授权外部引用不上传，缺本地目录可重新关联。

**接续动作：** 先完成范围决策和账号验收，再以隔离租户与样本实现往返。

源码/设计入口：[docs/product/cloud-whiteboard-sync.md](../product/cloud-whiteboard-sync.md)；[src/main/services/whiteboardDocumentService.js](../../src/main/services/whiteboardDocumentService.js)；[src/shared/relationshipGraphModel.js](../../src/shared/relationshipGraphModel.js)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

**阻塞/暂缓原因：** 云同步契约与产品授权尚未落实，禁止先上传真实白板。

### GF-CLOUD-003 · 云快照、实时连接器及协作扩展评审

阶段：GF-P5；优先级：P3；状态：**暂缓**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-CLOUD-002。

**验收标准**
1. 桌面同步快照和云端持续读取分别说明来源/时间。
2. 云端凭据独立授权，不自动复制桌面Token。
3. 多人协作/公开分享和租户隔离单独评审，不捆绑首期同步。

**接续动作：** 在单白板同步闭环后，依据用户需求选快照或独立连接器，先评审不部署。

源码/设计入口：[docs/product/web-cloud-release-memo.md](../product/web-cloud-release-memo.md)；[docs/product/cloud-whiteboard-sync.md](../product/cloud-whiteboard-sync.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

**阻塞/暂缓原因：** 后续增强方向，不属于当前桌面或首期同步交付。

### GF-DB-001 · 本地数据库/存储迁移决策与恢复设计

阶段：GF-P5；优先级：P3；状态：**暂缓**；负责人：unassigned；用户验收：不要求用户确认。

更新：2026-09-16T15:52:24+08:00。依赖：GF-STORAGE-001。

**验收标准**
1. 数据格式稳定后才有新ADR，唯一事实源与读写权威明确。
2. 幂等迁移、备份、失败回滚、旧版读取/恢复策略可验证。
3. 未经用户确认不改变现有JSON及目录布局，不以数据库引入为完成目标。

**接续动作：** 先完成GF-STORAGE-001盘点，仅在用户批准后评估迁移设计。

源码/设计入口：[src/main/services/configService.js](../../src/main/services/configService.js)；[src/main/services/relationshipBoardService.js](../../src/main/services/relationshipBoardService.js)；[docs/data-platform-strategy.md](../data-platform-strategy.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。

**阻塞/暂缓原因：** 已确认数据结构稳定前暂缓数据库；本次不实施迁移。

### GF-PROGRESS-001 · 仓库进度接入开发任务与仪表盘

阶段：GF-P0；优先级：P0；状态：**已交付**；负责人：ChatGPT / AgentDock Cloudflare；用户验收：待用户反馈。

更新：2026-09-16T16:57:50+08:00。依赖：无。

**验收标准**
1. 无需复制台账，识别受管项目的两种任务源并在现有开发任务和仪表盘显示一致统计。
2. 保留原任务状态/验收/交付区别；同项目旧投影去重；无效/冲突源显式报错且不回退伪正常。
3. 只读接入，不执行仓库脚本、不写台账或控制CSV；范围/符号链接/容量边界、定期刷新和界面跳转有隔离测试。
4. 可追溯macOS构建安装及实际任务/仪表盘验收通过后推送，保护并行改动与用户数据。

**接续动作：** alpha195已安装并推送；正常配置中的文稿文件夹权限由用户确认。后续开发回到GF-QUALITY-001；仓库任务仍在原台账修改，App只读刷新。

源码/设计入口：[src/main/services/projectTaskProjectionService.js](../../src/main/services/projectTaskProjectionService.js)；[src/renderer/scripts/projectTasks.js](../../src/renderer/scripts/projectTasks.js)；[src/renderer/scripts/app.js](../../src/renderer/scripts/app.js)；[docs/00-handoff/REPOSITORY_PROGRESS_BRIDGE.md](REPOSITORY_PROGRESS_BRIDGE.md)。

证据：[docs/00-handoff/PROGRESS_BRIDGE_ALPHA195.json](PROGRESS_BRIDGE_ALPHA195.json)；[docs/00-handoff/REPOSITORY_PROGRESS_BRIDGE.md](REPOSITORY_PROGRESS_BRIDGE.md)

交付：2.0.0-alpha.195；源码 `564fadb98b813afc839da5f22655b30934f8930c`。

### GF-LABS-001 · 设置测试功能区与仪表盘/开发进度默认关闭

阶段：GF-P1；优先级：P0；状态：**已验证**；负责人：ChatGPT / AgentDock Cloudflare；用户验收：待用户反馈。

更新：2026-09-16T21:17:23+08:00。依赖：GF-PROGRESS-001。

**验收标准**
1. 两个功能独立开关、默认关闭；菜单、旧标签恢复、跨窗口与主进程入口遵守开关。
2. 关闭停止相关刷新，迟到结果不重开视图；原台账/白板不删除，开启与重启可恢复。
3. 专项、全量检查与实际安装版验收有证据，项目文档保留AI结合待设计边界。

**接续动作：** 最终1299项测试/288JS、15项新专项、18项设置门禁UI和9项显式开启后的进度UI通过；从当前提交构建并验收已安装App，再推送。

源码/设计入口：[src/renderer/scripts/settingsNavigation.js](../../src/renderer/scripts/settingsNavigation.js)；[src/renderer/scripts/projectProgress.js](../../src/renderer/scripts/projectProgress.js)；[src/main/ipc/projectTasks.js](../../src/main/ipc/projectTasks.js)；[src/shared/experimentalFeatures.js](../../src/shared/experimentalFeatures.js)；[src/renderer/scripts/experimentalFeaturesController.js](../../src/renderer/scripts/experimentalFeaturesController.js)；[test/experimental-features.test.js](../../test/experimental-features.test.js)。

证据：[docs/00-handoff/EXPERIMENTAL_FEATURES_ALPHA196.md](EXPERIMENTAL_FEATURES_ALPHA196.md)

### GF-AI-PROGRESS-001 · AI辅助进度识别与人工确认的证据链设计

阶段：GF-P2；优先级：P1；状态：**计划中**；负责人：unassigned；用户验收：待用户反馈。

更新：2026-09-16T21:14:08+08:00。依赖：GF-LABS-001。

**验收标准**
1. 明确任务语义、可读数据范围、证据归属及模型/执行位置，不按提交数推算完成度。
2. AI建议与人工确认分开，保留可审阅变更/冲突/撤销；不默认上传源码、凭据或台账。
3. 确定验收方案与授权后才实现，不自动恢复默认开放的仪表盘与进度页。

**接续动作：** 先讨论AI参与的输入、输出、确认点和数据边界，形成可验证设计；不立即开发外部模型接入。

源码/设计入口：[docs/00-handoff/EXPERIMENTAL_FEATURES_ALPHA196.md](EXPERIMENTAL_FEATURES_ALPHA196.md)；[docs/00-handoff/REPOSITORY_PROGRESS_BRIDGE.md](REPOSITORY_PROGRESS_BRIDGE.md)。

证据：尚无本任务完成证据；源码文件存在不表示验收通过。
