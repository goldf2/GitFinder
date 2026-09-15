# alpha184 筛选不影响结构容器

## 2026-09-15 Asia/Shanghai

- 用户指出未命中筛选会淡化或隐藏 Project 容器。旧适配器明确实现了“无命中子项时淡化容器”，隐藏投影直接移除未命中容器。
- 改为主机和物理 Project 容器始终保留，不计入命中/弱化数量；只筛选内容卡片。手工隐藏资源仍按原逻辑执行，普通手工分组和本地项目卡片不在此豁免范围。
- 增加全未命中 dim/hide 回归，修复前两个断言失败。删除旧容器命中子项推导，不更改布局算法。
- 全量 `npm run check`：1179 测试、270 JS 语法检查通过（旧筛选测试的主机弱化/隐藏预期已同步新规则）。
- `npm run pack` 开发/ad-hoc 产物验证通过；安装 `/Applications/GitFinder 2.app` 后可见版本为 alpha.184，签名校验通过。alpha.183 可恢复备份位于 `/Volumes/project/制品与备份/GitFinder-2-alpha183-before184.app.disabled`。
- 实际白板保留“正常”状态筛选，验证隐藏模式仍显示三个主机及 Project，包括未命中内容的空 Project；切换低可视保留，仅内容卡片变淡，Project 标题和边界保持。此次不修改原始资源和布局。
- 实现提交 `4ce0c75`，测试提交 `c4027d8`；安装包 `dist/GitFinder-2-2.0.0-alpha.184-arm64-mac.zip`。验证记录提交后推送，用户最终确认待收集。
