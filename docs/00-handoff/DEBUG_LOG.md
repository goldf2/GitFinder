# GitFinder 2 Debug 记录

## GF-COOLIFY-20260907-02 · Coolify 拉取日志和数据明细缺失

- 时间：2026-09-07 06:22:00 +0800；状态：已补充本地缓存摘要并完成 alpha.114 构建替换，待用户确认。
- 现象：状态栏只能显示阶段和最终汇总，无法判断某个端点、项目详情或部署历史请求到底在哪里变慢 / 失败；旧版没有持久化逐请求日志。
- 诊断：旧版本机缓存最近一次为 `ready`、`errors=[]`，3 个实例 / 3 台服务器 / 35 个部署；Con01 与 AL03 的只读端点检查均为 HTTP 200，Con01 的应用、服务、项目和部署历史端点耗时更长。橙色的 3 条最近失败来自部署历史，不是同步 API 失败。未对 AL02 发起新的网络探针。
- 修改：`CoolifyProviderService` 持久化有界 `coolify-sync-log.json`，记录安全端点类别、阶段、状态、耗时、响应数量、读取计数、实例结果和脱敏错误；启动时把未结束运行标记为 `interrupted`。Panel IPC / preload 暴露读取和在文件管理器中定位日志的入口；白板新增“日志”面板和最新运行置顶排序；无运行记录时读取本机缓存并显示实例 / 服务器 / 部署摘要。
- 安全边界：日志不保存令牌、Authorization、完整 URL 或原始 API 响应；保留 12 次运行 / 512 事件 / 1 MiB 上限。展示的是可诊断的结构化摘要，不是未经筛选的响应正文。
- 回归：Coolify 专项 29 项、白板 / Panel 专项通过；renderer 构建和 JS 语法检查通过。全量测试唯一失败为工作树既有 `relationship-css-reuse` 边框计数阈值（HEAD 基线同样失败），未由本次改动引入。
- 发布证据：代码提交 `0ccb435d6f9d7e7ef4b1a0aa354dfb1246b89838`；ZIP SHA-256 `cd0e496546db9fb01729993b20001c5247b557c79ebe416dc29d651ccdece436`；ASAR SHA-256 `fa22634ebc54e247c3a7d0679951ce54b2cbb5e22d24c23ee18147c56d782639`；安装路径 `/Applications/GitFinder 2 Alpha87.app`，替换前备份见 `CURRENT_STATE.md`。
- 待验证：alpha.114 安装版点击“日志”确认缓存摘要和真实日志可见；不额外触发 AL02 探针。

## GF-COOLIFY-20260907-01 · Coolify 同步挂起被误判为闪退

- 时间：2026-09-07 04:57:09 +0800；状态：已修复并由用户现场截图确认，交付 alpha.110。
- 现象：关系白板长时间停在“Coolify 后台同步中…”，画布暂时空白；录屏结束后主进程、渲染进程仍存在，未发现 GitFinder 崩溃报告。
- 根因：Coolify 请求原先仅调用 `AbortController.abort()`；当 fetch 或响应体 Promise 不兑现时，IPC 请求仍可永久悬挂，且实例聚合没有 provider 级截止时间。
- 修改：`requestCoolifyJson` 增加硬超时和外部取消；每个 provider 设置 30 秒同步预算并向下传播 `AbortSignal`；连接更新 / 断开取消活跃同步；provider 身份校验阻止迟到结果写入访问点白名单或拓扑缓存。
- 回归：Coolify / endpoint 专项 29/29；全量 `npm run check` 通过 1073/1073 测试、251 个 JavaScript 文件语法检查和 renderer 构建；`npm run pack` 通过。
- 现场验收：安装版 alpha.110 重新打开后状态栏显示“3 个 Coolify · 3 台服务器 · 35 个部署 · 3 个最近失败”，同步已结束且进程保持运行。橙色表示 Coolify 已完成读取但存在 3 条最近失败部署记录，不表示同步再次挂死。
- 交付：修复提交 `e9145ab` 已推送 `origin/main`；macOS arm64 制品和回滚备份路径见 `CURRENT_STATE.md` 与 `RELEASE_LOG.md`。后续若需处理橙色警告，应单独定位 3 条失败部署，不要把它们与本次同步挂起混为一谈。

## GF-DIR-20260905-01 · 目录右键与设为项目动作无响应

- 时间：2026-09-05 18:02:00 +0800；状态：已修复并交付 alpha.98。
- 现象：目录工具中右键没有快捷菜单；选中目录后右侧“设为项目”入口不能完成动作。
- 根因：文档级右键监听依赖有限的卡片类名，部分目录渲染形态可能漏接；详情栏按钮由 `FileSelectionDetailController.show()` 动态生成，却位于 `#content-area` 之外，未被 App 的内容区委托监听。
- 修改：在 `#content-area` 上统一监听带 `data-path`/`data-type` 的目录条目，并阻止原生菜单；动态详情按钮直接调用 `openLocalProjectDialog()`，传入其数据目录路径。
- 回归：`test/file-selection-detail-controller.test.js` 新增动态按钮点击验证；`npm run check` 通过 1041/1041、245 个 JavaScript 文件语法检查和 renderer 构建。
- 涉及：`src/renderer/scripts/app.js`、`src/renderer/scripts/fileSelectionDetailController.js`、`test/file-selection-detail-controller.test.js`、`test/local-project-ui.test.js`、`package.json`、`package-lock.json`。
- 验收：macOS development 包已替换 `/Applications/GitFinder 2 Alpha87.app`；真实目录工具中右侧“设为项目…”可打开项目设置，右键菜单正常出现并包含该动作。
- 交付：提交 `e401c41cf717de7bf6c4d03bd5f73de6168bcb20` 已推送 `origin/main`。用户确认有效后归档支持文档修复报告。

## GF-DIR-20260905-02 · 左侧位置树右键与设为项目动作无响应

- 时间：2026-09-05 20:58:00 +0800；状态：已修复并交付 alpha.99。
- 现象：左侧“位置”树中的 `output` 等目录节点不能打开右键快捷菜单，无法从节点直接执行“设为项目”。
- 根因：树节点没有 `data-type`，且右键监听只绑定 `#content-area`，没有覆盖 `#sidebar-tree`。
- 修改：树节点声明目录类型；右键监听扩展到侧栏树；项目动作保留树节点路径并直接打开项目设置。
- 回归：新增树节点类型和侧栏右键监听断言；`npm run check` 通过 1041/1041、245 个 JavaScript 文件语法检查和 renderer 构建。
- 安装验收：alpha.99 中右键左侧 `output` 节点，菜单正常显示；点击“设为项目…”打开 `/Volumes/project/项目/何晴/output` 的项目设置。
- 交付：提交 `79ce5778980d3c9a56d8e9414d6971ad84c148f8` 已推送 `origin/main`。用户确认有效后归档支持文档修复报告。

## GF-DRAG-20260905-05 · 主机通过隐藏仓库牵动其他主机部署

- 时间：2026-09-05 12:18:08 +0800；状态：alpha.97 已提交、构建、替换并推送；本机键盘联动和重开验收通过，真实鼠标效果待用户确认。
- 证据：09:44 录屏中 con01 移动时另一主机外框不动、内部 3 张部署卡片移动。仅重建拓扑无法复现；加入本机 repoRegistry 后旧 `_expandMovingIds` 准确包含 3 张其他主机部署及其 3 个访问点。
- 根因：隐藏仓库保存为 con01 Project 的物理成员，继承分支锁定后无条件沿 source_of/deployed_from 扩展，将同源但不同主机的部署误当下级。
- 修改：队列携带显式仓库拖动来源标记；容器内仓库随物理成员移动，但不再传播到仓库的其他部署。从仓库本身发起联动继续保留。
- 验证：只读缓存重建跨主机误移动数 3→0；最终专项18/18，新用例在旧控制器2项失败；干净发布提交1035/1035与244个JS通过。macOS产物门禁通过，本机键盘移动使本分支统一(8,8)、外部分支(0,0)，正常重开保持。鼠标自动化只选中无位移，不能计作通过。测试未连接或变更远程服务器，未写入用户原始白板。
- 涉及：`src/renderer/scripts/relationshipBoardController.js`、`test/relationship-linked-drag.test.js`、`docs/host-linked-drag.md`。诊断文件：`/Volumes/project/临时文件/gitfinder-recording-0944.nJUMUR/diagnose-local.cjs`。

## GF-REL-20260905-01 · Project 容器在下级联动拖动中被重排

- 状态：alpha.92 已修复并推送；容器原位的拖动范围已被 GF-DRAG-20260905-03 用户新要求替代，保留此处历史证据。
- 现象：主机开启“固定下级”后，拖动结果被 Project 自动排列改写，造成容器像被固定或分支被拉回。
- 根因：`_displayGeometryMap()` 无条件重算局部联动成员所属 Project 的自动布局。
- 修复：局部联动期间保持 Project 容器和全部物理成员的当前显示几何，只对关联节点写入同一拖动位移。
- 证据：`test/relationship-linked-drag.test.js` 覆盖 Project 与无关成员不动、关联节点同位移和重算稳定；`npm run check` 988/988 通过。
- 提交/版本：`e8c53e7` / `2.0.0-alpha.92`。

## GF-ASYNC-20260905-02 · 旧异步结果覆盖当前目录与白板操作

- 记录时间：2026-09-05 07:32:50 +0800。
- 状态：已完成 alpha.93 源码、打包、本机替换和推送；尚未获得用户有效性确认。
- 现象：慢目录读取在折叠/移除位置后仍重建旧树；拓扑刷新等待期间开始拖动会被结果重建打断；关闭重开后旧响应可能串入新白板。
- 根因：目录树缺少渲染修订号；白板仅在请求开始时判断拖动，未完整检查异步响应的打开周期，旧请求占用也未随关闭解除。
- 修改：`src/renderer/scripts/sidebarTreeController.js`、`src/renderer/scripts/relationshipBoardController.js` 及对应两个测试文件。
- 回归：五项新增异步回归先失败再通过；目录树 11/11、白板相关 113/113 通过。首次加载状态为 unconfigured 时也验证原间隔重试。
- 界面证据：`/Volumes/project/临时文件/gitfinder-inspection-alpha93/ui-verification.json` 与同目录两张截图，测试使用临时目录、临时 user data 和模拟拓扑。真实鼠标拖动期间模型重建为 0，下一次刷新恢复正常。
- 交付结果：干净发布工作树 988/988 与 235 个 JS 检查通过，产物门禁通过；安装版目录、键盘移动、缩放、保存与重开通过。安装版 CUA 鼠标拖动未产生位移，不计作通过；同提交隔离 Electron 鼠标拖动并发刷新通过。提交 `1d7704e` 已推送。
- 下一步：用户确认实际体验有效后，再归档支持文档修复报告。

## GF-DRAG-20260905-03 · Project 容器跟随上级整体拖动

- 时间：2026-09-05 07:52:07 +0800。
- 状态：alpha.94 已完成实现、安装版鼠标与重开验收、推送；尚未获得用户真实白板有效性确认。
- 用户要求：Project 容器应该可以跟随上级一起被拖动。
- 根因：旧 `_expandMovingIds` 仅沿主机/部署关系展开，刻意不包含关联 Project；显示几何保护也排除了已进入移动集合的 Project 容器。
- 修复：从未归档部署的 runs_on/hosts 与 groupId 派生主机到容器的移动依赖，复用容器成员递归；`_displayGeometryMap` 同时保护进入联动集合的 Project，避免自动装箱再次变更尺寸和位置。实际来源关系、groupId 不变。
- 涉及文件：`src/renderer/scripts/relationshipBoardController.js`、`test/relationship-linked-drag.test.js`、`package.json`、`package-lock.json`。
- 回归：先更新验收复现 5 项失败，再完成修复；联动专项 15/15，全量 991/991、235 个 JS 语法检查通过。覆盖嵌套不重复位移、开关、归档、共享访问点不反向拉动、资源视图、几何稳定。
- 安装版：真实安装 alpha.94 的鼠标输入使主机、Project、两个部署、独占访问点同位移 `(58.46,36.92)`，无关主机不动，Project 保持 `344 × 404`；普通重开后持久化通过。详见 CURRENT_STATE 的验收方式和证据路径。
- 交付：`b3d2e29a0587c63defe44e97abbd08c0a2889c52` / `2.0.0-alpha.94`，已推送 origin/main。用户确认后再归档全局修复报告。

## GF-ENDPOINT-20260905-04 · 复用访问点归属错误与跨来源漏报

- 记录时间：2026-09-05 09:43:13 +0800；状态：alpha.96 已构建、替换、验收并推送，待用户确认。
- 根因：归属按 Project 数而非部署数；跨 provider 同地址生成不同 endpoint ID；旧布局恢复错误 groupId；coolify-projects 分组漏用独占规则。
- 修复：投影按标准地址合并并保留来源/别名，归属只允许单一部署，星系共享访问点外置；控制器兼容旧快照、布局和检测来源，复用现有警报和红线。
- 回归先复现三项归属失败；全量首轮发现 coolify-projects 刷新位移不稳定，补齐规则后通过。工作树1037/1037，干净发布提交1032/1032及244个JS语法检查通过。
- 安装版：浮动访问点、2条红色SVG线、警报1条及部署详情；原生拖动后共享访问点不动，正常退出重开保持。提交c447cdc，证据与恢复路径见 CURRENT_STATE。测试使用隔离配置与合成关系，未修改部署配置。
