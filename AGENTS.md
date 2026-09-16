# GitFinder 2 项目协作规则

## 开始工作前的统一入口

先读 [开发接续入口](docs/00-handoff/README.md)、[CONTEXT.md](CONTEXT.md)、[当前状态](docs/00-handoff/CURRENT_STATE.md) 和 [下一步](docs/00-handoff/NEXT_ACTIONS.md)，再运行 `git status -sb`、`npm run handoff:status`。当前快照优先于历史兼容区；`docs/ai-handoff/`只用于回查历史。

## 进度记录必须与工作同步

- 开发任务只在 `management/development-tasks.json` 维护。执行前认领任务、记录基线和scope；每次实现、验证、失败、阻塞、安装、推送、用户反馈和换人/换AI时更新任务状态、证据与下一动作。
- `docs/00-handoff/PROGRESS.md`为生成文件，不能手改。任务源变更后运行 `npm run handoff:update`；结束答复/提交前运行 `npm run check:handoff`，并更新CURRENT_STATE/NEXT_ACTIONS顶部有效块及SESSION_LOG。
- 状态不得凭“代码看起来完成”升级。已验证、已安装、已推送、用户确认和正式发行分别记录；范围、状态语义、验收与交接模板见 [HANDOFF_PROTOCOL.md](docs/00-handoff/HANDOFF_PROTOCOL.md)。
- 多AI先检查任务owner和工作树；只提交本轮路径/hunk，保护原有未提交内容。版本与安装由一名集成人串行处理，不并行替换用户App。
- CURRENT_STATE与NEXT_ACTIONS的历史兼容区停止作为当前状态维护；今后只替换顶部带BEGIN/END标记的有效块，历史追加到SESSION_LOG或版本验收记录。
- 本台账不自动接入应用内Local Project Manager投影，不创建定时开发或后台监控；未来需要接入只能生成只读导出，不维护第二份任务事实。

本文件补充 `/Volumes/project/AGENTS.md`，仅适用于本仓库。

## 修改完成后的默认交付流程

用户要求修改 GitFinder 代码、配置或项目文档后，除非用户明确要求只分析、只修改源码、暂不打包或暂不推送，否则完成实现后默认连续执行：

1. 递增 `package.json` 与锁文件中的 prerelease 版本号。
2. 运行源码检查和与变更相关的回归测试。
3. 只暂存本次任务和版本变更，创建本地提交；不得混入用户已有的无关修改。
4. 从该提交在当前 macOS 主机生成可追溯的安装产物，并按 `docs/00-handoff/RELEASE_CHECKLIST.md` 验证产物。
5. 可恢复地备份现有 `/Applications/GitFinder 2 Alpha*.app`，用新版本替换并正常启动。
6. 验证已安装应用的版本、主界面和本次修改涉及的可见交互；通过后推送当前跟踪分支。若验收失败，继续修复、提交并重新打包，不推送失败版本。

Windows 安装包、商店草稿上传和公开发布不属于每次本机修改的默认步骤；只有用户明确要求，或本次修改直接涉及对应平台/发布链路时才执行，并分别报告验证状态。
