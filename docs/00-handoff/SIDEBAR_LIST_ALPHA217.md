# alpha.217 左侧项目列表

恢复左侧独立的“项目列表”，类型收起后仍可直接进入项目；大项目和子项目按层级展开，成员项目可进入真实目录，仓库继续沿用已有入口。最近、类型入口保留。

列表使用与主区相同的筛选结果，进入子项目时保留父级导航。使用分区实例标识区分树节点的ARIA引用，避免类别树与独立列表的子节点ID重复。

- `env TMPDIR=/private/tmp npm run check`：1439测试、301JS检查通过。
- `node scripts/verify-project-collections.js`：37项真实窗口检查通过，新增类型收起后列表导航、子项目点击、真实目录进入及共享搜索空结果。
- 最初未设TMPDIR时原有台账符号链接用例失败；恢复仓库既有/private/tmp运行方式后通过，未改无关台账代码。
- 源码截图已查看：dist/project-collections-ui-FBJgdd/independent-project-list.png。日志dist/sidebar-list-alpha217/{source-check,source-ui}.log。
- 打包安装推送待完成；用户现有四类与项目归属不变。用户验收pending。
