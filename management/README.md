# GitFinder 自身的工程管理

`development-tasks.json` 是本仓库开发任务的唯一事实源，字段与状态语义见 [接续协议](../docs/00-handoff/HANDOFF_PROTOCOL.md)。可读看板由 `npm run handoff:update` 生成在 [PROGRESS.md](../docs/00-handoff/PROGRESS.md)。

这里不保存用户白板、凭据或应用运行数据。alpha.195已支持App直接读取仓库台账；当前按GF-LABS-001策略将仪表盘和开发进度默认关闭，只有在设置测试区显式开启后才读取展示。台账仍是唯一事实源，兼容项目保留Local Project Manager，不维护第二份同义任务。参见[测试功能说明](../docs/00-handoff/EXPERIMENTAL_FEATURES_ALPHA196.md)。
