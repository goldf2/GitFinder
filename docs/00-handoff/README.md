# GitFinder 开发与接续入口

本目录是开发人员和 AI 接手 GitFinder 2 的统一入口。当前状态以 [CURRENT_STATE.md](CURRENT_STATE.md) 顶部有效快照为准；任务状态只在 [development-tasks.json](../../management/development-tasks.json) 维护。[PROGRESS.md](PROGRESS.md) 是自动生成的阅读视图，不是另一份任务源。

## 十分钟恢复顺序

1. 阅读根目录 [AGENTS.md](../../AGENTS.md) 与 [CONTEXT.md](../../CONTEXT.md)，确认本地优先、Coolify 只读、结构/布局分离和默认交付要求。
2. 阅读 [当前状态](CURRENT_STATE.md)、[下一步](NEXT_ACTIONS.md)，运行 `git status -sb`、`git log -5 --oneline`、`npm run handoff:status`，核对当前版本、工作树与正在进行的任务。
3. 在 [进度看板](PROGRESS.md) 找到唯一接续任务及其证据；根据任务编号阅读 [详细开发方案](DEVELOPMENT_PLAN.md) 的对应工作包。
4. 按 [运行手册](RUNBOOK.md) 准备隔离测试，按 [接续与进度协议](HANDOFF_PROTOCOL.md) 认领任务、记录修改范围。只有存在需要用户决定的范围/授权问题时才询问。
5. 开始实现前先保留失败用例；结束前更新任务源、当前摘要、下一步与 [SESSION_LOG.md](SESSION_LOG.md)，生成看板并运行 `npm run check:handoff`。

## 文件职责

| 文件 | 唯一职责 | 何时更新 |
| --- | --- | --- |
| `management/development-tasks.json` | 任务编号、状态、负责人、依赖、验收、证据、下一动作 | 认领、阻塞、验证、安装、推送或用户反馈时 |
| `PROGRESS.md` | 上述任务源的生成看板与任务卡 | `npm run handoff:update`，禁止手改 |
| `CURRENT_STATE.md` | 当前版本/安装/推送、最近验证、风险及接续摘要 | 每次实质工作结束前，替换顶部有效块 |
| `NEXT_ACTIONS.md` | 唯一建议下一任务及其开始条件 | 下一任务变化时，替换顶部有效块 |
| `DEVELOPMENT_PLAN.md` | 目标架构、工作包、阶段出口、依赖与范围 | 经确认的方向或任务设计变化时 |
| `RUNBOOK.md` | 可执行检查、构建、安装、回退、隔离验收命令 | 工具或运行方式变化时 |
| `HANDOFF_PROTOCOL.md` | 状态语义、更新时点、协作/中断恢复、完成门槛 | 协作机制变化时 |
| `SESSION_LOG.md` / `DEBUG_LOG.md` | 历史会话与稳定问题编号的证据链 | 追加事实，不覆盖失败记录 |
| `DECISIONS.md` / `docs/adr/` | 已确认的长期决定 | 决策采纳、替代或废弃时 |
| `RELEASE_LOG.md` / 单版本验收记录 | 源码、制品、安装、推送和恢复证据 | 每次交付尝试，包括失败 |

## 旧资料如何使用

本机 `docs/ai-handoff/` 是历史对话索引与旧需求资料，目前被 `.git/info/exclude` 排除，干净克隆不能依赖；本轮不强制上传这些历史资料。它不再维护第二套“当前状态/下一步”。旧 README、早期 Panel 方案及旧验收数量只能作为历史证据。`CURRENT_STATE.md` 与 `NEXT_ACTIONS.md` 的历史兼容区不覆盖顶部有效块。

本机 `dist/` 中的日志和截图不随 Git 自动分发。任务证据首先引用已提交的验收文档，再由文档指向原始日志；换机找不到原始日志时保留“历史验证”表述并重新验证，不能凭路径存在就宣称通过。

## 三条常用命令

```bash
npm run handoff:status   # 只读：核验并列出当前任务状态
npm run handoff:update   # 只更新生成看板，不改任务状态
npm run check:handoff    # 校验任务字段/依赖/本地链接/看板是否过期
```

这是仓库内的事件驱动更新机制，不是后台常驻监控器；脚本不会执行开发、自动完成任务或替人员作验收判断。
