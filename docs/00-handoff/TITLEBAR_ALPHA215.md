# alpha.215 标题栏、导航与类型侧栏

- 顶部标题栏显示当前项目类型及结果数量；显示控制菜单设置卡片大小，移除主区独立标题行和设为项目按钮，保留右键项目设置。
- 项目/Git仓库/目录导航同步主显示区。最近位于类型前，类型可展开成员；Git仓库使用所属项目类型，未归属仓库进入未分类。原平铺项目目录合并到类型树。
- 最近仓库仅保存本机路径；新增受限配置键。仓库空筛选同步清除 visibleItems，避免残留上次选择状态。
- 保留真实目录层级、项目内多个仓库、Finder入口和目录预览，不修改项目文件位置。

## 源码与隔离应用验证

- `env TMPDIR=/private/tmp npm run check`：1433/1433测试、301个JS语法检查通过。
- `node scripts/verify-titlebar-sidebar.js`：21项实际窗口检查通过，覆盖3档窗口宽度、卡片大小保存、导航同步、类型展开/折叠、仓库空结果及最近记录。
- `node scripts/verify-project-cards.js`：17项通过；`node scripts/verify-workspace-tools.js`：30项通过。
- 日志：`dist/titlebar-alpha215/{source-check,source-ui,cards-ui,workspace-ui}.log`；已目视检查 `dist/titlebar-sidebar-ui-WMMXhl/{projects-titlebar,repositories-types}.png`。
- 初次检查修正了旧UI断言、目录导航使用错误入口、最近仓库配置键缺失，以及空筛选遗留上次可见列表。修正后上述检查通过。

## 交付

- 干净构建：`/Volumes/project/临时文件/gitfinder-titlebar-alpha215`，check 1433测试/301JS通过，arm64 DMG/ZIP开发产物门禁通过。
- 首次源码提交 `b9d828745755584475fd871c9c27533bdbaaa86b` 已推送，安装alpha.215并通过21项实际窗口验收，截图目录 `dist/titlebar-sidebar-ui-F1icy6`。
- 实际用户配置：86项目/58仓库；交易研究8项目，左右8/8；所属仓库左右4/4；顶部标题、3档卡片尺寸菜单、移除原头部均通过。记录 `dist/titlebar-alpha215/live-ui.json`，截图 `live-trading.png`。
- 目视检查发现最近标题默认边框，补充 `df2da8b` CSS修正并重新干净构建/安装，最终21项交互通过且目视确认边框已消除。源码已推送origin/main。
- alpha.214备份：`/Volumes/project/制品与备份/GitFinder应用备份/2026-09-30-alpha214-before215/GitFinder 2.app`；另保留 `/Applications/.GitFinder-2-alpha214-backup.app`。
- 9项无关文件逐字节不变，3项共享交接文档仅暂存本轮块/追加。未执行Windows或公开发行。

## 最终安装证据

- 最终源码：`df2da8b7f92337d71e91f4c309b62f6098d497e3`，版本2.0.0-alpha.215。干净克隆开发产物门禁通过，macOS arm64 DMG/ZIP已生成。
- `/Applications/GitFinder 2.app`代码签名校验通过，ASAR与构建包逐字节一致（SHA256 `aaebf2f1ed1553958b9f81672ebe88ec757a155deb97cea00a3e9320502d80af`）。记录 `dist/titlebar-alpha215/install-proof.json`。
- 最终安装版21项专项检查通过，日志 `dist/titlebar-alpha215/installed-final-ui.log`；目视截图 `dist/titlebar-sidebar-ui-tqq2hU/projects-titlebar.png`。已恢复普通启动，无调试参数。
- 源码及UI已验证、已安装、已推送；用户验收pending，非正式发行。唯一后续建议GF-DATA-001仍需按既有优先级接续，本轮不自动扩展。
