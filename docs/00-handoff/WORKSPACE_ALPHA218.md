# alpha.218 统一工作区与Git三视图

## 行为

- 左侧改为工作区/文件浏览双入口，旧仓库导航偏好兼容到工作区。“所有Git仓库”为快捷筛选，项目/子项目/仓库沿类别展开为同一棵树；移除重复的平铺项目列表。
- 单仓库项目在树中直接作为仓库入口，包含多个仓库的项目提供成员概览和资料目录；无Git的资料目录直接浏览。独立仓库保留单独入口，无需创建项目身份。
- 点击仓库默认进入Git主视图，显示分支、工作区变更、只读文件差异和最近提交；文件/所属项目页签围绕同一仓库联动，所属项目链可返回成员概览。
- 仓库选择展开祖先并高亮左树，同步右侧已有详情；现有审查/提交、Fetch/Pull/Push终端预填、分支远程工具仍使用原操作边界。
- 不改原项目身份、归属、目录位置或Git历史。切换文件浏览或其他标签页会清除仓库专用视图，避免串页。

## 源码验证

- `env TMPDIR=/private/tmp npm run check`：1439测试、302JS检查通过。
- `node scripts/verify-unified-workspace.js`：19项实际窗口检查通过，含双入口/嵌套/仓库与资料目录概览、Git差异、审查入口、三视图联动、独立仓库无身份写入、筛选及普通目录。
- 初次真实交互发现通用空白点击逻辑误清除仓库详情，已将工作区面板排除；Git概览隐藏文件操作栏，避免操作语义混淆。旧导航测试已按统一工作区更新。
- 截图已查看：dist/workspace-ui-PnkjmZ/{unified-workspace,repository-git-view,repository-project-context}.png。日志dist/workspace-alpha218/{source-check,source-ui}.log。
- 真实用户快速从项目聚合切换仓库时，发现迟到项目扫描覆盖Git主视图；已补渲染代次检查及19项中的专门回归。最终补丁重新打包、安装验收通过。用户验收pending。

## 最终安装交付

- 最终源码：034fe5063857b999581a22caa8b0f9e813763a0a；含迟到项目渲染保护，已推送origin/main。干净构建目录`/Volumes/project/临时文件/gitfinder-workspace-alpha218`，arm64 DMG/ZIP开发门禁通过；本机开发包，不涉及公开发布。
- 安装`/Applications/GitFinder 2.app`，2.0.0-alpha.218；签名检查通过，安装ASAR与构建产物一致：dcd1e867608215910bdb741a4b6b14d7036f2abba3639abadcc24fc666278cef。
- 最终安装版19项交互通过，证据`dist/workspace-alpha218/installed-ui.log`、`dist/workspace-ui-fHw24a/`。源码1439测试与302JS检查通过。
- 真实配置86个物理项目、59个顶层项目；实际`/Volumes/Trading/项目/stock-research-workbench`左树定位/右侧详情、Git状态、股票研究归属及21项文件浏览切换通过。已查看`dist/workspace-alpha218/real-workspace.png`，结果real-workspace.json。
- 退出调试启动并恢复普通启动；原projectGroups与安装前快照一致，9个无关dirty文件字节保留，3份共享交接文档仅本轮块/追加入提交。
- alpha.217备份`/Volumes/project/制品与备份/GitFinder应用备份/2026-09-30-alpha217-before218/GitFinder 2.app`及`/Applications/.GitFinder-2-alpha217-backup.app`。
- 用户验收pending；未执行用户仓库提交、拉取或推送，未移动目录或更改现有成员关系。
