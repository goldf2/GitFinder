# alpha.194 · 开发方案与进度接续体系

编号：GF-HANDOFF-001。日期：2026-09-16 +08:00。用户要求在项目内添加详细开发方案、持续更新进度，方便人员及其他AI接续。

## 本轮范围

基于alpha.193/`837411f`核对仓库和安装。新增分阶段开发方案、统一接续入口、任务事实源、生成看板、运行手册和协作协议；增加只读校验与看板生成工具，接入已有`npm run check`。不修改白板、文件服务、网络服务、账号、布局或生产配置。

现状问题：根README仍自称alpha.9且写“不直连Coolify”；CONTEXT仍把alpha.141网页嵌入当当前实现；旧AI入口引导维护第二套当前状态；当前状态文件包含大量未标清的历史记录。本轮修正入口与过期说明，保留历史与原未提交内容。

## 证据与交付状态（已交付）

- 已建立6阶段27任务、详细工作包、唯一JSON台账、生成PROGRESS、RUNBOOK、交接协议与可提交发布清单；README/AGENTS指向同一入口。后续状态按planned/ready/in_progress/blocked/verified/delivered/deferred记录，用户验收独立。
- 最终源码 `e142524c3de4448c7a9bd15b945b3eb3918c7c2d`，版本 `2.0.0-alpha.194`。干净worktree **1265/1265测试、280个JS**通过；工程校验回归 **15/15**，生成视图与27任务/6阶段一致。
- 初始工作树检查曾为14项工具/1264全量，后续新增目录链接回归；以最终干净结果为准，不把旧数量当当前结论。
- macOS development产物门禁issues为空，codesign deep/strict通过；安装ASAR SHA-256 `dd3a6958ca092a15f711a7c8b4d1e49fc2d27934d0aafc391f035dc9987c0f41`与报告一致，ASAR列表确认不包含management工程资料。
- ZIP：`dist/agentdock-development-plan-20260916/build/dist/GitFinder-2-2.0.0-alpha.194-arm64-mac.zip`；SHA-256 `e9688d3668e86a4f20dfc61b8d1dc87d7a38d27fd865e05b4a9d70d0dc131ea9`。
- 当前安装 `/Applications/GitFinder 2.app`；旧193完整备份 `/Volumes/project/制品与备份/GitFinder-2-alpha193-before194.app.disabled`。
- 安装布局复核16/16、右栏19/19，正常退出重启后的右栏1/1与布局2/2通过。第一轮布局检查的失败另见下方，不抹去失败记录。
- 已恢复无测试profile/调试参数的正常用户启动，CoreGraphics窗口截图 `normal-installed-alpha194.png`显示alpha194及原象数面板；正常进程30577，隔离9444端口已关闭。两套原白板字节哈希一致，原10项dirty内容保留。
- 已在安装验收后普通推送，`source-remote.txt`确认origin/main为e142524。文档状态收口另行提交，不冒充新的运行源码或重新打包。
- 证据目录 `dist/agentdock-development-plan-20260916/`：baseline、工具测试、release-check、build、delivery-verification、安装/重启JSON和截图、推送日志。跨机器以本验收摘要定位，原始dist证据不在Git时须按需复跑。

生成工具只验证记录一致性，不判断实际功能真伪，不自动升级任务状态或后台开发。应用内Local Project Manager界面未接入新台账。本轮没有应用业务源码改动；Windows、正式签名/公证、商店/GitHub Release与线上升级不在本轮验收范围。

## 文档恢复与可移植性核查

发现 `CODEX_MEMORY.md` 和 `docs/ai-handoff/` 被本机 `.git/info/exclude` 排除，不能由干净克隆取得。本轮没有强制上传历史对话；只更新这些本机入口指向新体系，正式接续文档不依赖它们。此前批量更新脚本遇到该差异时中止，已按已有备份继续处理，未重写或丢弃用户未提交内容。

新生成器尚未存在时用例曾因模块缺失失败，这是新功能TDD记录，不是旧产品缺陷。随后14项全部通过；另以失败用例证明原打包规则会纳入management，增加排除后通过。

## 干净克隆检查发现的缺口

第一次干净worktree在新进度检查处失败：原 `CODEX_RELEASE_VALIDATION.md` 同样被本机Git排除，RUNBOOK链接在本机存在却无法随源码交接。已将不含用户数据的发布清单迁入可提交的 `RELEASE_CHECKLIST.md`，并修正README、AGENTS和RUNBOOK引用。校验范围扩展到三个根入口及发布清单，保留 `release-check-first.log`；未修改本机排除规则或上传历史对话。检查失败时任务状态退回开发中，不提前宣称干净交付通过。

## 本轮安装冒烟中的未确认现象

第一次完整布局脚本在退出全屏并模拟640px窗口后，“菜单单列且未越界”检查失败；`installed-layout-first.log`和`installed-layout/layout-last-state.png`保留失败，截图中菜单为关闭状态。后续独立诊断连接时模拟尺寸已回到1920px，其单列断言不具备窄屏前提，不能据此认定CSS回归；记录见`narrow-diagnostic.json`。

未改运行代码，重新运行同一完整布局脚本后16/16通过，随后右栏19/19与正常退出重启3/3通过。首轮菜单为何关闭尚未确认，不能把再测通过说成根因修复；任务GF-UI-001已附本记录，后续采集resize/blur/fullscreen/菜单事件。该现象不影响本轮工程文档功能验证，但列为现有UI验证边界。

## 接续结论

本轮GF-HANDOFF-001标记已交付，唯一下一任务GF-QUALITY-001，状态ready未自动开始。后续人员/AI从README→AGENTS→CURRENT_STATE/NEXT_ACTIONS→PROGRESS/RUNBOOK恢复；每次认领、验证、失败、交付或中断按协议更新，不再只在聊天里记录。
