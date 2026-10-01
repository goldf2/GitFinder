# alpha.231 标题栏与工具条

基线10dbdcf，保留原12项未提交路径。

标题栏保留应用名称和当前位置，下方独立工具条放置导航、视图、搜索、显示控制和设置；浏览标签页位于工具条下方。

源码1460测试、311JS通过；scripts/verify-titlebar-toolbar.js在1280/800px窗口验证标题/工具条层次、控件不重叠、显示菜单不溢出、搜索、进入仓库/返回及工作区菜单，共10项通过。证据dist/toolbar-alpha231/source-check.log、source-ui.log；截图dist/workspace-ui-IY0Nx2。

待干净构建和安装验收，用户验收pending。
