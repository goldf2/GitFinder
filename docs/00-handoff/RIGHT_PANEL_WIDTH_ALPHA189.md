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
- 证据在 `dist/agentdock-panel-width-20260915/`；用户实际白板操作前后字节一致。此前 alpha.188 的历史哈希差异尚无原文对照，不伪称已修复。

## 交付状态

目标 `2.0.0-alpha.189`。源码提交、隔离构建、macOS 安装包、安装版正常启动及重启验证待补。仅本机 development/ad-hoc 包，不进行 Windows 或商店公开发布。旧安装可恢复备份后才替换；原有未提交文档和项目身份修改保留。

唯一下一步：完成隔离打包和安装重启验收，通过后再推送。用户确认有效后按项目规则归档修复报告。
