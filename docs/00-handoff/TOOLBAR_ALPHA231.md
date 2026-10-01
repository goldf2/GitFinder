# alpha.231 标题栏与工具条

基线10dbdcf，保留原12项未提交路径。

标题栏保留应用名称和当前位置，下方独立工具条放置导航、视图、搜索、显示控制和设置；浏览标签页位于工具条下方。

源码1460测试、311JS通过；scripts/verify-titlebar-toolbar.js在1280/800px窗口验证标题/工具条层次、控件不重叠、显示菜单不溢出、搜索、进入仓库/返回及工作区菜单，共10项通过。证据dist/toolbar-alpha231/source-check.log、source-ui.log；截图dist/workspace-ui-IY0Nx2。

待干净构建和安装验收，用户验收pending。


## 构建验证与安装接续

干净构建1460测试、311JS通过，development产物门禁issues=[]，源码64b2ad4。打包版宽窄窗口10项通过；日志dist/toolbar-alpha231/{clean-check.log,build.log,packaged-ui.log}。新包已暂存/Applications/GitFinder 2 alpha231 staged.app并验签。

CUA连续报告用户操作中断，无法正常退出旧版；未强制停止。已请用户退出或选择稍后安装，当前alpha230仍运行，暂未推送alpha231。交接校验曾因快照未提及GF-DATA-001拒绝，补充后通过；未构建失败快照。
