# alpha.214 工作区入口、同步筛选与目录预览

GF-UI-214。保留项目（聚合零/一/多仓库）、Git仓库与普通目录三种入口。

## 用户可见变化

- 位置悬停显示“编辑”，右键也可修改显示名称、恢复默认；添加位置后进入名称编辑。只保存treeRoots.name，目录路径不改名。
- 仓库详情和目录右键有“仓库工具”：本地分支切换、远程地址新增/编辑/移除、最近100条提交、勾选识别技术标签。操作失败显示Git返回错误，取消不写入；远程只改本地配置。
- 设置 → 仓库维护：活跃/归档登记、恢复登记、清除归档记录、重算稳定标识；清除登记不删除磁盘文件。原有目录仓库分组支持选择位置、预览和应用，不改变项目类型。
- 项目标题/数量、卡片大小和“设为项目…”压缩到紧凑工具栏。项目卡片新增访达按钮，目录右键也能“在访达中显示”。
- 左侧项目目录保留，复用右侧项目筛选；Git仓库列表复用同一仓库筛选。最近/已固定仍作为访问历史入口。
- 默认递归扫描跳过用途目录“临时文件”“制品与备份”，避免把构建副本列成普通项目；用户明确添加该目录作为位置时仍可扫描。文件不删除。
- 目录卡片直接展示本层最多4张真实图片缩略图、文件/文件夹/符号链接数量；没有图片时展示文件名称样本。图库同时提供缩略图和目录概览。统计遵循隐藏项目开关，不递归计数、不跟随内容符号链接；可见区域按需加载、最多4个并发，切换目录丢弃过期结果。复用既有受管路径校验及缩略图服务。
- Trading旧目录符号链接仅保持旧脚本/虚拟环境/任务路径兼容，本轮没有删除或新增链接；不作为项目分类入口。

## 后端入口审计

| 已存在接口 | 界面处理 |
| --- | --- |
| config.updateTreeRoot | 位置名称编辑 |
| git.getBranches/checkoutBranch | 仓库工具 → 分支 |
| git.getRemotes/addRemote/setRemoteUrl/removeRemote | 仓库工具 → 远程仓库 |
| git.getLog | 仓库工具 → 提交历史 |
| fs.autoDetectTags | 仓库工具 → 技术标签 |
| repos.listActive/listArchived/restore/purge/regenerateId | 设置 → 仓库维护 |
| groups.autoDetect | 仓库维护 → 目录分组，先预览再应用 |
| fs.getDirSize | 已有可取消的calculateDirectorySize界面，保留兼容方法 |
| git.getDiff/getStagedDiff | 已有提交/文件差异界面，不重复入口 |
| git.getBatchStatusProgress | 已通过事件展示扫描进度 |
| repos.getIdByPath/getPathById、config.getConfig | 内部身份/完整配置读取，操作界面已经消费所需字段 |
| panel.getConnection | 单连接兼容接口，现有多数据源设置覆盖 |

仪表盘和开发进度仍为用户主动开启的测试功能；其他审计项没有新增服务器写操作。

## 验证

- 最终源码：1430/1430测试、301JS语法检查通过；`dist/frontend-tools-alpha214/source-check-final.log`。
- 项目卡片：17/17隔离应用交互通过；`source-cards-final.log`。
- 工作区工具：30/30隔离应用交互通过；`source-tools-ui-final.log`，包含窄窗口、左右筛选、位置名称、分支/远程/标签、登记恢复/清除、目录缩略图和图库。
- 后端目录测试验证本层计数、隐藏开关、图片失败继续、最多4张、不读取外部链接。隔离UI的确认/取消由受控confirm返回值覆盖，不修改用户真实仓库。
- 首次安装产物通过17项项目卡片和29项工具检查，但截图发现图库名称受新增数量行挤压；数量并入原有元信息行，缩略图网格限制在原视觉区域，增加名称/图片可见断言后源码30/30通过。最终重新构建安装及推送待验。

## 最终交付 · 2026-09-30T17:18:44+08:00

- 运行源码 `58a337c5c9b7fbcf477d21b6d9b94b029a8254b5`；干净克隆 `/Volumes/project/临时文件/gitfinder-workspace-alpha214` 最终1430/1430、301JS通过，日志 `clean-check-final.log`。
- macOS arm64 DMG/ZIP、签名和产物门禁通过；可追溯报告 `dist/release-verification.json` 在干净构建目录。ASAR与安装包内容一致。本机开发/ad-hoc产物，无正式分发资格。
- `/Applications/GitFinder 2.app` 已安装最终alpha.214；安装版项目17/17、工具30/30通过，`installed-cards-final.log` / `installed-tools-final.log`。截图 `dist/workspace-tools-ui-To163E/`，图库名称可见修正已实测。
- 真实用户配置：86个项目，交易类型左右各8项且ID集合一致；GitFinder仓库名称搜索左右各1项，仓库默认全量58项，临时/备份副本0项。项目头部36px。日志 `actual-projects-final.json` / `actual-repositories.json`。
- 项目访达按钮实际定位 `/Volumes/Trading/聪明钱追踪系统-多维资金对比/`，`finder-selection.txt`。实际GitFinder public目录显示5文件/1文件夹和2张已加载图片，`actual-directory.json/png`。
- 最终正常退出并无调试参数启动，留在所有项目视图。原2套白板JSON哈希与本轮安装前备份一致，原9项无关dirty字节不变；Trading旧路径链接保持。
- 旧alpha.213备份 `/Volumes/project/制品与备份/GitFinder应用备份/2026-09-30-alpha213-before214/GitFinder 2.app`，同卷备用 `/Applications/.GitFinder-2-alpha213-backup.app`；首次alpha.214包保留 `/Applications/.GitFinder-2-alpha214-before-gallery-fix.app`。本机业务元数据备份留在同一备份目录，未提交运行配置。
- 源码推送origin/main并核对远端 `58a337c5c9b7fbcf477d21b6d9b94b029a8254b5`。用户确认仍pending。
