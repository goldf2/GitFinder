# GitFinder 2

本地优先的项目、Git仓库与部署关系中心。桌面应用将目录、Git状态、Coolify只读部署事实、关系白板和原生应用面板放在同一工作区；核心本地功能不要求登录或云服务。

## 开发与接续

**从 [开发接续入口](docs/00-handoff/README.md) 开始。** 当前版本、安装和验证状态只维护在 [CURRENT_STATE.md](docs/00-handoff/CURRENT_STATE.md)，不要依赖旧README或历史对话中的版本号。

| 要找的内容 | 入口 |
| --- | --- |
| 详细目标、架构、分阶段方案和风险 | [DEVELOPMENT_PLAN.md](docs/00-handoff/DEVELOPMENT_PLAN.md) |
| 当前任务、依赖、验收与证据 | [PROGRESS.md](docs/00-handoff/PROGRESS.md)，由[唯一任务源](management/development-tasks.json)生成 |
| 唯一下一任务 | [NEXT_ACTIONS.md](docs/00-handoff/NEXT_ACTIONS.md) |
| 检查、隔离验证、构建、安装、回退 | [RUNBOOK.md](docs/00-handoff/RUNBOOK.md) |
| 多人/AI协作与进度更新 | [HANDOFF_PROTOCOL.md](docs/00-handoff/HANDOFF_PROTOCOL.md)、[AGENTS.md](AGENTS.md) |
| 产品不变量与代码结构 | [CONTEXT.md](CONTEXT.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[ADR](docs/adr/) |

## 已有基础

本地项目与Git服务、受控文件操作、项目详情、关系白板、布局、独立白板项目与媒体、直接Coolify只读Provider、HTTP检测、原生应用面板、可选账户和桌面更新客户端已有实现。具体可用范围与每次交付证据请查看当前状态和对应版本记录。

当前应用并非所有界面都使用React：应用壳为HTML/CSS/原生JavaScript，关系画布使用React与React Flow。运行事实、最近部署结果、本机HTTP观测、远端观测和缓存新鲜度必须分开显示。兼容IPC中的`panel`名称不意味着必须通过Panel代理才可读取Coolify。

云同步、完整系统事件通知、正式签名发行和所有平台升级不能由现有客户端或设计文档推断为已完成。`server.js`是本机工具服务，不是公网多租户后端。

## 启动与检查

```bash
npm ci
npm run handoff:status
npm run check
npm run electron
```

开发与CI使用Node 24，依赖版本以锁文件为准。默认桌面启动可能使用真实用户配置，写入类验收请先按照运行手册建立独立profile。`npm start`启动本机Git工具服务，而非桌面应用。

编辑任务源后运行`npm run handoff:update`更新看板，`npm run check:handoff`验证记录一致性。工具不自动认领、完成任务或后台执行开发。

## 安全与发布边界

布局不能修改节点事实、主机归属或Project成员；只读Coolify不提供停止、删除或重新部署。凭据不得进入白板、Git、日志或导出。文档中的“计划中”不是生产部署、公开发行或用户数据上传授权。

本机开发包、代码推送、正式发行是不同阶段。默认macOS交付和可恢复安装按AGENTS执行；Windows、Developer ID公证、商店/GitHub Release需分别验证。参见 [发布验收](docs/00-handoff/RELEASE_CHECKLIST.md)、[在线更新说明](docs/online-update-publishing.md)、[构建发布工作流](docs/build-publish-workflow.md)。

历史需求与对话索引可能保留在本机 `docs/ai-handoff/`；该目录目前被本机Git排除规则忽略，干净克隆不能依赖它。本轮不上传历史对话，只提供完整的项目内接续入口。
