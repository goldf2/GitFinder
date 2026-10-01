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

待干净构建、安装及实际用户界面验收；用户验收pending。
