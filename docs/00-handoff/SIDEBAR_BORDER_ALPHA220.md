# alpha.220 独立仓库条目样式

基线 alpha.219 / 2056745；原有未提交内容保留。用户截图两个独立仓库出现粗黑框。独立仓库按钮缺少 sidebar-shortcut-open 样式类，导致浏览器默认按钮边框显示。正在进行窗口复现与修复。

## 源码验证

- 旧版隔离真实窗口复现默认黑边框，before-ui.log记录失败。补齐sidebar-shortcut-open样式、选中状态、按钮类型和路径提示；保留浏览器键盘焦点。
- 窗口专项27项通过，包含无边框、悬停、Tab焦点、选中与Git主视图；已目测截图。证据dist/sidebar-border-alpha220/source-ui-final.log及对应workspace-ui目录。
- 首次窗口检查旧刷新延迟场景遇到Promise was collected，重跑通过；保留source-ui.log。
- 默认临时目录的/var别名导致既有台账路径比较用例失败；单独复现，改用规范路径TMPDIR=/private/tmp后11项通过，未改动台账实现。完整检查以source-check-final.log为准。
- 安装、构建、推送待完成，用户验收pending。
