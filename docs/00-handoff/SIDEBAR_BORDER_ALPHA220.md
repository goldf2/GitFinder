# alpha.220 独立仓库条目样式

基线 alpha.219 / 2056745；原有未提交内容保留。用户截图两个独立仓库出现粗黑框。独立仓库按钮缺少 sidebar-shortcut-open 样式类，导致浏览器默认按钮边框显示。已完成本机交付，用户验收pending。

## 源码验证

- 旧版隔离真实窗口复现默认黑边框，before-ui.log记录失败。补齐sidebar-shortcut-open样式、选中状态、按钮类型和路径提示；保留浏览器键盘焦点。
- 窗口专项27项通过，包含无边框、悬停、Tab焦点、选中与Git主视图；已目测截图。证据dist/sidebar-border-alpha220/source-ui-final.log及对应workspace-ui目录。
- 首次窗口检查旧刷新延迟场景遇到Promise was collected，重跑通过；保留source-ui.log。
- 默认临时目录的/var别名导致既有台账路径比较用例失败；单独复现，改用规范路径TMPDIR=/private/tmp后11项通过，未改动台账实现。完整检查以source-check-final.log为准。
- 完整源码与干净构建均1439/1439测试、302JS检查通过。

## 安装与交付

- 源码1fbfc525ad6ffac41acc074c8703a37982ed3f31已推送origin/main。
- 构建目录：/Volumes/project/临时文件/gitfinder-sidebar-border-alpha220。
  DMG/ZIP开发门禁通过，仅本机ad-hoc包，未公开发行。
- /Applications/GitFinder 2.app版本2.0.0-alpha.220，codesign通过，安装ASAR与产物一致。
- 旧版备份：/Volumes/project/制品与备份/GitFinder应用备份/2026-10-01-alpha219-before220/GitFinder 2.app。
- 安装27项界面检查通过，日志dist/sidebar-border-alpha220/installed-ui.log，截图dist/workspace-ui-7F8ltp/。
- 真实claude_ruler和server_docs的四边均0px，已目测real-sidebar.png。
  首次截图时仍加载；最终在86个本地项目加载完整后核验。恢复正常无调试参数启动。
- 首次跨卷克隆失败，改用ditto完整复制、校验签名后才替换，旧App有完整备份。
- 原9个无关文件字节保持，共享交接文档只提交本轮有效块及追加内容。
- 未更改分类或移动仓库。用户验收pending，确认后归档修复报告。
