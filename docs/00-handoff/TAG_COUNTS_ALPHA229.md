# alpha.229 标签计数同步

## 复现与原因

用户指出标签数字和实际结果不匹配。alpha228原用户界面实测：所有仓库58，Web应用标签36，单选后实际26个仓库。原实现遍历整个`repoTags`存储统计关联，包含当前列表之外及普通目录的关联，也不随分类、多选、搜索变化。

隔离回归增加受管范围外的带标签仓库，旧安装版在“不混入仓库计数”断言失败。最初普通目录夹具因处于本仓库内部而继承相同Git身份，未形成独立的额外关联；改为独立Git目录后准确复现，未改写用户数据或身份规则。证据`dist/tag-counts-alpha229/before-installed-scope.log`。

## 实现

- 标签数字从主区实际筛选后的仓库及其标签计算，范围包含当前分类、搜索、状态、多标签交集；无结果时归零，清除后恢复受管范围内总数。
- 数字与热力深浅原位更新，不随点击重新排序、改变焦点或滚动位置；悬浮提示明确“当前筛选结果中”。
- 读取仓库标签完成后更新统计。详情赋值/移除、新建标签赋值和技术标签加入同步仓库缓存，使数字与主区立即一致。
- 保留现有标签、目录关联及所有仓库数据。数字并不表示磁盘文件数、普通目录数或所有历史关联数。

## 源码验证

1460/1460测试、311JS检查通过；46项真实界面检查通过，覆盖范围外关联、分类、搜索、状态、多选、零交集、清除、赋值/移除、布局与重启设置。证据`dist/tag-counts-alpha229/source-check.log`、`source-ui-final.log`，截图`dist/sidebar225-ui-lwBHzb`。

当前准备可恢复安装和原用户界面核对；仅本机macOS开发包，用户验收pending，GF-DATA-001不启动。原12项工作树修改已快照并按hunk保护。

## 最终交付

运行源码`be510ef9fd3767b8b8931767728d07cb4d51d445`已推送并核对origin/main。干净构建1460/1460测试、311JS，macOS开发包门禁通过；`/Applications/GitFinder 2.app`已安装alpha.229，46项安装交互及重启检查通过。首次原生启动辅助功能读取超时，随后读取正常，版本核对通过。

原用户界面直接点击验收：全范围Web应用26，单选后实际26；再选macOS后Web应用和macOS都显示2，实际2；清除后全部58个仓库，Web应用26、macOS6。热力颜色与其它标签数量同时联动。原115条注册仓库标签关联核对无丢失，未删除普通目录的标签。

证据：`dist/tag-counts-alpha229/clean-check.log`、`build.log`、`installed-ui.log`、`tag-persistence.json`、`native-counts.json`；安装截图`dist/sidebar225-ui-c4SQRW`。产物及门禁报告位于`/Volumes/project/临时文件/gitfinder-tag-counts-alpha229/dist`。旧alpha228备份：`/Volumes/project/制品与备份/GitFinder/2026-10-02-alpha228-before-counts229/GitFinder 2.app`。

原9个非共享文件逐字节保持，共享3个交接文档只提交本轮块/追加。仅macOS arm64本机ad-hoc开发包；用户验收pending，不代表正式发行。GF-DATA-001不自动启动。
