# alpha.217 左侧项目列表

恢复左侧独立的“项目列表”，类型收起后仍可直接进入项目；大项目和子项目按层级展开，成员项目可进入真实目录，仓库继续沿用已有入口。最近、类型入口保留。

列表使用与主区相同的筛选结果，进入子项目时保留父级导航。使用分区实例标识区分树节点的ARIA引用，避免类别树与独立列表的子节点ID重复。

- `env TMPDIR=/private/tmp npm run check`：1439测试、301JS检查通过。
- `node scripts/verify-project-collections.js`：37项真实窗口检查通过，新增类型收起后列表导航、子项目点击、真实目录进入及共享搜索空结果。
- 最初未设TMPDIR时原有台账符号链接用例失败；恢复仓库既有/private/tmp运行方式后通过，未改无关台账代码。
- 源码截图已查看：dist/project-collections-ui-FBJgdd/independent-project-list.png。日志dist/sidebar-list-alpha217/{source-check,source-ui}.log。
- 已干净打包、安装并推送；用户现有四类与项目归属核对不变。用户验收pending。

## 安装交付

- 源码：3d3815ef8067d410c3b48c1a6e12ba63a0975b7c；已推送origin/main。干净构建目录`/Volumes/project/临时文件/gitfinder-sidebar-list-alpha217`，1439测试/301JS和arm64 DMG/ZIP开发门禁通过。
- 安装路径`/Applications/GitFinder 2.app`，版本2.0.0-alpha.217，签名验证通过，ASAR与产物一致：21b276fa5036c9357cbd82a700120474f9a837c885e272d7dff8b87f518c8b3b。普通启动无调试参数。
- 安装版37项交互通过；目视截图`dist/project-collections-ui-plPUIE/independent-project-list.png`。真实59个根项目、类型收起后商城子项目进入2成员通过，截图`dist/sidebar-list-alpha217/real-list.png`与real-list.json。
- 备份`/Volumes/project/制品与备份/GitFinder应用备份/2026-09-30-alpha216-before217/GitFinder 2.app`及`/Applications/.GitFinder-2-alpha216-backup.app`。
- 归属配置与安装前快照一致，9原无关文件字节保留，3交接文档仅本轮块/追加。未执行Windows/公开发布。
- 用户新提出仓库选中后同时呈现项目与目录；已说明联动布局建议，尚未实现，不属于本轮已交付能力。
