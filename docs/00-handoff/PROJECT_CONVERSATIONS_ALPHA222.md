# alpha.222 项目任务与会话协作入口

本切片沿用 alpha.221 的 App/Web 项目分类、仓库概览和现有项目/仓库台账。基线为 `f2bb6090c6e2ba46ceace29cd852120f030d233f`，保护原工作树修改后快进合并。

## 已验证行为

- Codex 与 ChatGPT 分组，各来源分别保留主会话、历史和关联会话。编辑及合并导入只写本机配置；可信登记链接可打开原会话，归档会话仍可保留索引。
- 同一项目的既有台账任务、GitHub 仓库和 Issue/PR 可与会话双向关联打开。任务内容仍由原台账维护，不复制第二份进度状态。
- GitHub 列表只在用户点击刷新时，通过已有 `gh` CLI 读取每仓库最多 50 个开放 Issue 与 50 个开放 PR 的标题、URL、状态和更新时间。未安装/未授权、仓库迁移或读取失败会显示提示；不创建任务或更新远程状态。
- 项目接续入口打开本地 `docs/ai-context/INDEX.md`。默认只读短索引与当前状态相关段落，长日志和会话正文按任务检索。私人原文、会话索引及本机路径留在本地，不进入提交或安装包。

## 源码和真实窗口证据

- 完整测试 1457/1457、JavaScript 语法检查 310/310、renderer 构建通过。完整日志：`dist/project-conversations-tests.log`。测试临时目录位于仓库外的真实路径，避免 macOS `/var` 别名影响已有路径测试。
- `scripts/verify-project-conversations.js` 在隔离 profile 的实际 Electron 窗口执行 14 项交互检查并退出重开：来源独立主会话、合并导入、编辑保存、非法链接阻止保存、任务→会话、会话→原任务、真实只读 GitHub 列表、GitHub 关联打开、原项目 manifest/台账不变、保存恢复。结果与截图：`dist/project-conversations-ui-YUIL2F/results.json`、`source-groups.png`、`reopened.png`。
- GitHub 列表专项使用当前 `react/react` 的真实只读开放项；本项目 `goldf2/GitFinder` 的开放 Issue/PR 查询均为空，没有为验收创建远程任务。真实 Codex 本地协议跳转已验证。
- 此记录形成时安装版仍为 alpha.221；alpha.222 安装、真实清单导入与安装重启由集成人随后完成，不能用源码窗口结果替代安装验收。

## 剩余交付

从本任务提交生成 macOS ARM64 本地开发 App/DMG/ZIP，按 RELEASE_CHECKLIST 检查；集成人正常退出旧 App、保留恢复备份、安装并正常启动。通过 renderer 的 `gitFinder.projectConversations.import(mapping)` 合并导入，先用 `list()` 保存关联配置备份，禁止运行中离线覆盖整个 config。验证两个来源与任务关联、退出重开后再推送。

仅本机 ad-hoc 开发签名，不宣称 Developer ID 公证、Windows 或公开发布完成。

## 本地打包收据

- 源码与构建提交：`cb6c7644219375a9a46a3b5eddef946796f332b9`。
- `npm run pack` 完成 App、ARM64 DMG/ZIP，development 源码与产物门禁通过；收据 `dist/release-verification.json`，日志 `dist/project-conversations-pack.log`。
- 包内三项功能服务/IPC/controller 与提交源码一致；未包含 `docs/ai-context`、会话全文或 `CONVERSATIONS.json`。
- ASAR SHA-256：`050b08133f76f6e918ce8cdbc3da789c2733a44e0c69712f7d8933673eb793b7`，codesign 检查通过，仅 ad-hoc 本地开发签名。
- 安装与真实配置验收由集成人进行，当前暂未推送。

## 安装与真实配置验收

- 集成人正常退出旧 App 后，安装 alpha.222 至 `/Applications/GitFinder 2.app`。旧 alpha.221 已通过 `ditto` 可恢复备份，安装 ASAR 与构建收据一致。
- 正常 renderer IPC 先备份原会话键，再合并导入 26 项目、52 条会话关联；保留其他用户配置。GitFinder 项目 8 条关联、Codex/ChatGPT 各自主会话及既有 `GF-CHAT-001` 台账关联读取正确。
- 已安装实际窗口 5/5 通过：版本、完整清单、双来源主会话/任务关联、详情来源分组、会话→真实台账任务并显示任务→原会话入口。正常退出重开后再次 5/5 通过；截图已检查。证据与私人清单留在集成人本地交付目录，未纳入远程提交。
- 最后再次正常退出，再用 `open -a` 普通启动，无调试参数；核对进程、可见窗口，验收调试端口关闭。
- 本轮未执行 GitHub 任务写入、Windows 打包或公开 Release。源码与本交接记录按默认流程普通推送，远端提交核对由最终交付收据记录。
