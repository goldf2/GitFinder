# alpha.190 · 保存状态与右栏稳定性优化

编号：GF-OPTIMIZE-20260916-01。日期：2026-09-16 +08:00。

## 范围和审查结论

通过 AgentDock Cloudflare 接入 macOS arm64，基于 alpha.189 / `0bc5dac`。只处理可复现的白板交互、保存提示和测试发现问题，不更改存储格式、引入数据库、改写用户布局或执行服务器写操作。

现有 `app.js` 约 7,961 行、`relationshipBoardController.js` 约 7,207 行，职责集中，后续宜按保存生命周期/面板生命周期逐步拆分；本轮不进行缺乏验收范围的大规模重写。

## 复现及修复

1. **保存提示竞态**：旧保存成功会在新快照排队或防抖等待时提前显示“已保存”；旧失败也会覆盖更新请求的状态。用请求代次隔离完成状态，防抖编辑及快照验证失败同样使旧回调失效。保留串行写入和失败通知；这是状态准确性修复，不宣称发现或修复了数据丢失。
2. **右栏宽度记忆**：窄窗口可见 265px、原偏好 600px 时，零位移事件、继续向边界外拖动或按边界方向键会将偏好覆盖为 265px。现在无有效宽度变化不覆盖偏好。
3. **高频拖动与无效写入**：拖动按动画帧合并，仅处理最后坐标；松开/失焦/卸载立即提交最后坐标，取消丢弃排队帧。边界处无效按键和重复恢复默认不写配置。受控单元场景中，同帧 100 次移动由 100 次 resize 回调降至 1 次；一次 End 后 100 次无效加宽由 101 次保存降至 1 次，不等于整机帧率/性能提升百分比。
4. **测试发现范围**：`node --test` 会进入 `dist` 中旧 worktree，重复执行过期测试。改为 `node --test "test/*.test.js"`，以实际本机和 CI 的 Node 24 为基准；新增独立子进程测试，用旧构建失败哨兵验证它不会被执行。

## 验证记录

- 原版本专项 24 项中 17 通过、7 失败；测试发现哨兵单独 0/1 失败，确认旧 `dist` 用例被执行。
- 修复后专项 25/25 通过，其中新回归 10 项；覆盖保存排队、防抖等待、旧失败、快照验证失败、帧合并、松开与卸载、取消、窄屏边界和重复键盘。
- 当前 checkout 完整 `npm run check`：1,212/1,212 测试，275 个 JS 语法检查；未将旧 dist 测试计入通过数量。
- 安装验收脚本增加窄屏零位移/向外拖动，以及实际 renderer 保存提示的受控延迟场景。宽度采用真实配置 IPC；保存提示竞态注入延迟替身，不能描述为慢磁盘或真实文件写入性能测试。
- 证据：`dist/agentdock-optimization-20260916/`，包括 baseline、regression-before/after、discovery-before 和 full-check 日志。
- 开始前原有 10 项未提交路径的状态与 SHA-256 已记录。仅提交本轮源码、测试、版本与交接记录；不混入原有 README、身份和存储文档修改。

## 交付状态（2026-09-16）

- 版本：`2.0.0-alpha.190`。运行代码提交 `4777405608a3cad3589e0fd645d978c084b175e8` 已在安装验收后推送 `origin/main`；后续仅提交验收脚本和交接记录，安装制品仍绑定该运行代码提交。
- 同一源码提交的干净 worktree 再次运行完整门禁：1,212/1,212 测试和 275 个 JS 语法检查通过；`scripts/verify-relationship-panel-resize.js` 单独语法检查通过。
- macOS development 包门禁 `issues=[]`，安装 ASAR 与报告 SHA-256 一致，`codesign --verify --deep --strict` 通过。仅 ad-hoc 开发签名，未经 Developer ID 签名、公证或 Gatekeeper 正式分发验收；未发布 Windows、商店或 GitHub Release。
- 安装路径：`/Applications/GitFinder 2.app`。旧版完整备份：`/Volumes/project/制品与备份/GitFinder-2-alpha189-before190.app.disabled`。
- ZIP：`dist/agentdock-optimization-20260916/build/dist/GitFinder-2-2.0.0-alpha.190-arm64-mac.zip`。SHA-256：`9396cfab33e40d22727464df43b307c4c09ce7bdb8e652f99d053400c5745689`。
- 安装 ASAR SHA-256：`36df94d53db2e5df7b2c83760b159c3e2624cfb4eb548162e6557c7009aaeccc`。
- 源码 Electron 与安装 ASAR 各通过 19/19 项交互，包含新窄屏边界、全屏拖动、切换视图及保存提示。安装版正常退出并重启后，1/1 验证宽度和保存偏好均为 504px。宽度保存走真实配置 IPC；保存状态竞态采用受控延迟，不代表真实磁盘压力测试。
- 原用户配置经 `open /Applications/GitFinder 2.app` 正常启动；CoreGraphics 系统窗口截图 `normal-installed-alpha190.png` 确认版本 alpha.190、原象数面板及筛选界面。未为截图改写实际白板或项目配置。
- 两套原有白板文件在安装退出重启后的验收时均与基线字节 SHA-256 一致，视口也未变化，证据 `delivery-verification.json`。原 10 项未提交路径的内容逐项核对保留；后续交接文件只提交本轮增量，不混入原有未提交内容。
- 隔离测试实例已关闭，9441 调试端口关闭，正常用户实例保留。安装及重启证据见 `installed-ui/result.json`、`installed-restart/reopen-result.json` 与截图；源代码推送日志见 `source-push.log`。

## 验收过程中的边界与未证实事项

- 第一轮源码 UI 测试过早访问 `App` 导致失败；增加就绪等待后解决，保留 `source-ui-startup-before.log`，不是产品源码修复。
- 第二轮源码 UI 全屏拖动一次得到 448px 而非预期 504px，发生时未记录完整指针轨迹，根因未确认，不能直接归因为系统动画或外部鼠标。未改变运行代码；补充指针追踪后，源码与安装版均完整通过 19/19，`fullscreen-pointer-trace.json` 记录完整事件。保留失败日志 `source-ui-fullscreen-before.log`，如实际使用复现应沿此证据继续排查，不宣称所有全屏场景已覆盖。
- 自动化测试最初手写隔离配置的 `treeRoots` 格式不符，导致本地项目列表错误；安装测试前改为空受管根列表。未更改实际用户配置，此项不计为产品已修复缺陷。
- 系统辅助功能返回 `ACCESSIBILITY_NOT_TRUSTED / -25211`，没有完成系统级鼠标自动点击验收；本轮为安装版 Chromium 指针/键盘输入加真实系统截图，不冒充原生鼠标验收。

唯一下一步：收集用户实际拖动右栏、窄窗口恢复及连续编辑保存提示的反馈。确认有效后按项目规则归档支持文档修复报告；暂不进行数据库迁移或大规模控制器重写。
