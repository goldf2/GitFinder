# GitFinder 自身的工程管理

`development-tasks.json` 是本仓库开发任务的唯一事实源，字段与状态语义见 [接续协议](../docs/00-handoff/HANDOFF_PROTOCOL.md)。可读看板由 `npm run handoff:update` 生成在 [PROGRESS.md](../docs/00-handoff/PROGRESS.md)。

这里不保存用户白板、凭据或应用运行数据，也不是新的项目任务后端。应用内项目任务仍使用 Local Project Manager 连接器的既有投影契约；本文件尚未接入该界面。未来需要接入时做只读派生导出，不另建第二份同义任务事实。

记录修改后执行 `npm run check:handoff`。只读校验不会自动创建任务、升状态或证明功能通过。
