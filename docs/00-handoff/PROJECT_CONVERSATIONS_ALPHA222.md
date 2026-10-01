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
