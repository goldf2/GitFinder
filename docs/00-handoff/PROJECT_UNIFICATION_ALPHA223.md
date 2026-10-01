# alpha.223 统一项目入口

用户确认以“一个 Git 仓库就是一个项目”简化日常工作。所有项目入口包含已登记项目、自动发现的 Git 仓库和普通目录项目；原“大项目”展示为分组，不改变分组成员或磁盘位置。

## 行为与数据

- 已有 `.gitfinder/project.json` 和 projectId 优先，原有会话、分组及任务关联继续沿用。未登记 Git 仓库使用本机 `repositoryProjects` 保存身份和设置；扫描、修改设置不会给源码目录新增文件。
- 项目内统一提供概览、代码、文件、任务、会话、发布、记录。未使用 Git 的普通项目不显示代码标签，仍可管理任务与会话。
- 任务复用项目原台账，Codex 与 ChatGPT 分区。GitHub 发布页和 Actions 入口只打开登记仓库；记录页只展示项目内实际存在的接续文档。
- 移除并列“所有 Git 仓库”、内部根仓库重复信息及“所属项目”中转；文件浏览和 Git 操作仍保留。

## 验证

- 全量测试 1458/1458，JavaScript 检查 310 项；后续文案/CSS精简相关23项通过。临时目录位于仓库外，避免Git向上查找父仓库影响已有架构快照测试。日志 `dist/project223-tests.log`、`dist/project223-navigation-tests.log`。
- 实际隔离 Electron 窗口13项：3种项目统一发现、单一入口、项目导航、任务/会话保存与双向打开、GitHub发布入口、真实记录文件、文件浏览、普通项目、退出重开保留身份与关联、原清单和仓库文件未改写。运行脚本 `scripts/verify-project-unification.js`，日志 `dist/project223-ui-final.log`。
- 已安装至 `/Applications/GitFinder 2.app`，安装版9项与正常退出重开9项通过；原26项目52条会话及原分组逐项相同。已恢复无调试参数的普通启动。安装截图与结果见本机交付收据。

仅macOS本机开发包；GitHub/商店公开发行不是本次入口简化步骤。

## 交付

构建/源码提交 `882268b5c2583a3ed9706354a7305a4e3254885c` 已推送 origin/main；development App/DMG/ZIP及签名门禁通过。原alpha222备份：`/Volumes/project/制品与备份/GitFinder/2026-10-01-alpha222-before-unified223/GitFinder 2.app`。本机测试结果位于 `fe/work/project-unification/installed-first.json` 与 `installed-reopened.json`。私有会话仍只在本机，原12项未提交修改保留。

一次退出后立即启动遇到LaunchServices -600，稍后普通open重试成功，随后9项重开检查通过；未修改应用代码规避启动流程。
