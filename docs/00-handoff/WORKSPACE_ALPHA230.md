# alpha.230 仓库工作区

基线：997e04e；保留原12项未提交路径。

## 行为

- 返回列表及标准后退恢复进入前的查询、标签、状态、路径及滚动位置。
- 记录扫描仓库根目录、docs/00-handoff、docs/ai-context中的Markdown，默认内置读取第一篇，可切换；长文提示快速查看分页。
- 会话正文读取docs/ai-context/conversations本地Markdown存档，摘要直接显示；外部继续对话为显式操作，不自动同步云端正文。
- 任务台账和任务详情留在主区；接续记录入口转到记录页。
- 发布更名版本，展示本地发布文档和最近提交；GitHub发布/构建明确为外部入口，不宣称提供内置部署功能。
- 概览显示README、当前层文件和目录数量；仓库主区隐藏重复右栏，切回文件视图恢复用户原右栏设置。

## 源码验证

1460测试、311JS通过；scripts/verify-workspace-content.js的10项隔离界面检查通过。包括无项目属性仓库读取、记录切换、会话存档、版本、概览、文件、返回、标准后退、任务内嵌和内部接续入口。未改变fixture的Git工作区。
证据：dist/workspace-alpha230/source-check.log、source-ui.log；源码截图路径见source-ui.log。

## 交付状态

已安装alpha.230，运行源码619448c09bb65fe9daf44d905dcd14abd736ce72已推送origin/main；用户验收pending。

- 干净构建1460测试、311JS通过，产物门禁issues=[]，签名为本机development/ad-hoc。
- 源码、打包版和/Applications安装版各10项实际Electron交互通过；没有执行远端发布或仓库写操作。
- CUA原用户界面：版本alpha230；常熟厂房企业地图工具11个变更，记录可切换到CURRENT_STATE正文；会话页显示4份本地存档及明确的外部继续入口；版本页显示发布正文/最近提交/GitHub外部入口；返回列表后58个仓库恢复。
- 旧应用备份：/Volumes/project/制品与备份/GitFinder/2026-10-02-alpha229-before-workspace230/GitFinder 2.app，签名验证通过。
- 干净构建目录：/Volumes/project/临时文件/gitfinder-workspace-alpha230。
- 证据：dist/workspace-alpha230/{clean-check.log,build.log,packaged-ui.log,installed-ui.log,preservation.json}。9个非共享脏路径字节不变，共享接续文档只提交本轮顶部块和追加日志。
- 验收中测试夹具缺少台账必填字段，补齐后通过；两个隔离实例重叠造成一次读取旧fixture，退出后串行重验通过。跨卷rename备份首次失败，旧应用保持原位；改用跨卷移动并验证备份后安装。最终安装版完整专项通过。
