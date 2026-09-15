# alpha.189 · 关系白板右侧面板调宽

编号：GF-PANEL-WIDTH-20260915-01。日期：2026-09-15 +08:00。

## 范围与实现

用户要求右侧面板可以调节宽度。普通文件浏览器已有 `detailPanelWidth` 调节；关系白板隐藏该文件详情栏并使用固定宽度的独立停靠区，本轮只补关系白板的缺口。

- `relationshipPanelResize.js` 管理 PointerEvents、指针捕获、键盘、可用空间、保存串行队列与生命周期清理；Board Controller 负责加载、挂载和停靠变化通知。
- 右栏左边缘增加 6px 分隔线。默认 264px，常规范围 220–640px；可用空间不足时临时约束显示宽度，优先保留画布，不将系统自动收窄写成新偏好。
- 向左拖加宽、向右拖缩窄；左右键每次 8px，Shift 每次 32px；Home/End 到边界，双击恢复默认。Escape/pointercancel 取消拖拽，失焦或重绘结束拖拽并清理监听。
- 宽度以 `relationshipRightPanelWidth` 单独写入本机配置。收起或移出面板不会清空宽度，普通文件详情栏与白板数据不改变。
- 分隔线不放进停靠区，避免被当作资源组件移动，也不随面板内容滚动；空右栏自动隐藏分隔线。键盘事件不误触白板删除/移动操作。

## 当前验证

- 新增 Node 回归 15 项通过，涉及非法宽度、窄窗口、拖拽/取消、错误保存、串行保存、重复挂载清理及真实配置文件重开。
- `node --test test/*.test.js` 当前源码 1202/1202；语法检查 273 个 JS。第一次根目录 `npm run check` 2389 项包含旧 dist worktree 的重复测试，已通过限定目录复核当前数量。
- 实际 Electron、真实配置 IPC、独立 `panel-resize-test-profile` 中完成 15 项交互：264→424px 拖动、432px 键盘、400px Shift、双击默认、重绘、移出/移回、窄屏恢复、全屏拖至 504px、退出全屏、切换视图及白板数据不变。
- 交互脚本：`node scripts/verify-relationship-panel-resize.js PORT PROFILE OUTPUT [--reopen]`，严格验证调试端口所属进程与独立 profile 路径，禁止连接正常用户配置。它使用 Chromium 指针/键盘事件，不等同 macOS 系统级鼠标点按。
- 干净提交 worktree 完整 `npm run check` 再次通过 1202/1202 和 273 JS，日志 `release-check.log`。旧全屏重绘 fixture 18/18 通过，无脚本错误。
- 同一组 15 项交互在已安装 `/Applications/GitFinder 2.app` 的实际 ASAR renderer、独立配置中再次通过；结束安装版测试进程后重新启动同一安装程序，`--reopen` 确认实际宽度与配置均为 504px。证据 `installed-ui/result.json`、`installed-restart/reopen-result.json` 及相邻截图。
- 原用户配置经正常系统路径启动，截图 `normal-installed-alpha189.png` 显示 alpha.189、原白板和新分隔线。macOS Accessibility 返回 -25211；未把 Chromium 指针验收描述为系统级鼠标验收。
- 数据边界：源码测试期间实际白板字节一致；正常应用退出重启后，精确 JSON diff 只含 `/boards/0/viewport/{x,y,zoom}`。节点、关系、placement 与 view 设置均一致，未覆盖用户文件。差异记录 `user-data-verification.json`，不声称整个 JSON 不变。此前 alpha.188 历史哈希差异仍无原文对照。
- 证据均在 `dist/agentdock-panel-width-20260915/`；测试实例已退出，9440 调试端口关闭，原用户正常实例保留。

## 交付状态

- 版本：`2.0.0-alpha.189`；源码提交 `c824659c13d6e6aeb71e0225ac41d43d2c8d5070`。该源码已推送 `origin/main` 并通过 `git ls-remote` 核对。
- 从该提交的独立干净 worktree 打包，development 产物门禁无 issues、codesign deep/strict 通过。仅 ad-hoc 开发包，不具备 Developer ID 公证的正式分发资格；未上传商店或发布 Windows 版本。
- 安装路径 `/Applications/GitFinder 2.app`；旧版备份 `/Volumes/project/制品与备份/GitFinder-2-alpha188-before189.app.disabled`。
- ZIP：`dist/GitFinder-2-2.0.0-alpha.189-arm64-mac.zip`；SHA-256 `ede9b42d91f5eaf0b610a89503db5f8b3132d987166a9f6d71221e1d139c5c87`。
- 安装 ASAR SHA-256：`0698f02d8176b2dda280eb71d180bde8fdb0d8d15fe2124665692acf13fa3c56`，与发布验证报告一致。
- 原有 README、项目身份与存储文档等未提交修改保留；交接文件只暂存本轮新增条目，不带入既有未提交内容。

唯一下一步：收集用户实际拖动体验，确认有效后按项目规则归档修复报告。
