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

源码验证完成，干净克隆构建、安装验收和推送待完成。alpha.214仍为当前已安装版本。未执行Windows或公开发行。
