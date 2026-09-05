# GitFinder 2 发布记录

## 2026-09-05 12:18:08 +0800 · alpha.97 本机替换与推送

- 已备份 alpha.96：`/Volumes/project/制品与备份/gitfinder-2/installed-backups/alpha96-before-alpha97-20260905/GitFinder 2 Alpha87.app`；安装路径保持 `/Applications/GitFinder 2 Alpha87.app`，包内版本 alpha.97。
- codesign 验证通过；安装 ASAR SHA256 `d58a2042ca287b5a40a41cf14212f22278cd825ce87028ff289cc53fc129f4d6` 与构建报告一致。
- 本机可见验收：原生鼠标自动化未产生位移；改用原生 Option+方向键验证本分支统一(8,8)、外部分支(0,0)，容器尺寸/关系/成员不变，正常重开持久化通过。鼠标验收尚未完成，不宣称通过。
- 隔离配置已退出，无调试参数启动用户原配置，原目录、标签页与部署关系白板正常显示。ff5772a 已推送 origin/main。
- 证据：`/Volumes/project/临时文件/gitfinder-hidden-repo-drag-alpha97.ghPrjB/`，README 明确区分失败鼠标尝试与成功键盘验收。没有新增构建、Windows、商店上传或公开版本切换。

## 2026-09-05 10:48:36 +0800 · alpha.97 已构建，等待解锁验收

- 本地提交：`ff5772a6be70f25764ebbf700d8783cd5c22bd79`；仅包含隐藏仓库拖动边界、3 项回归、规则文档和 package/lock 版本。
- 源码：干净提交检查 1035/1035、244 个 JavaScript 检查；联动专项 18/18。旧控制器运行新回归出现 2 项预期失败。
- macOS：`npm run pack`、development 产物门禁通过，ad-hoc 开发包；App、ZIP、latest-mac.yml、release-verification.json 已生成。
- 制品保存：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.97/`；构建工作树及日志：`/Volumes/project/临时文件/gitfinder-drag-scope-alpha97.Fc22j5/`。
- 阻塞：Mac 已锁屏，CUA 无法自动解锁，已请求用户解锁。未替换、未完成安装版交互验收、未推送；已安装版本复核仍为 alpha.96。
- 不涉及 Windows 构建、商店上传或公开 current 切换。解锁后从本次产物继续验收，禁止重复交接。

## 2026-09-05 07:48:11 +0800 · alpha.93 双平台商店发布推进

- 用户现象：oaktechz.com 产品页仍显示 alpha.86；公网 latest.yml/latest-mac.yml 复核一致，未发现旧缓存。
- 使用提交 `1d7704e408beecab193b3769dcb68442bcc3ec21` 触发现有 release.yml；[Actions 33930396752](https://github.com/goldf2/GitFinder/actions/runs/33930396752) 成功，双平台构建和 Windows 安装/启动/卸载通过，四个制品上传商店草稿成功。
- CI 下载制品保存在 `制品与备份/gitfinder-2/2.0.0-alpha.93/github-actions-33930396752/`；分别核验包内 alpha.93、报告提交、SHA-512/SHA-256 一致。
- 本地 mac 包与 CI mac 包为同源码不同构建，字节不同；商店发布使用该 run 的四个制品，以 `descriptor/store-release.json` 为准，不能混用本机 ZIP 哈希。
- 当前状态：待管理员登录执行公开发布；后台 Chrome「📦 GitFinder 发布」停留登录页，已异步请求用户登录。公开版本仍为 alpha.86，未宣称已上线。
- 本轮未修改源码/版本号/本机安装版，既有并行修改保留。下一步是发布后检查页面、两份清单与全量下载，证据由 OakTech `docs/00-handoff/RELEASE_LOG.md` 持续记录。

## 2026-09-05 07:32:50 +0800 · 2.0.0-alpha.93

- 提交：`1d7704e408beecab193b3769dcb68442bcc3ec21`，已推送 `origin/main`。
- 内容：目录与白板异步刷新竞态修复，五项新回归。
- 来源：从该提交创建干净工作树；检查 988/988、235 个 JS 文件通过。
- 平台：macOS arm64；`npm run pack` 与 development 制品门禁通过，ad-hoc 签名。
- 产物及完整报告：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.93/`。
- 安装：已替换 `/Applications/GitFinder 2 Alpha87.app`；ASAR 与报告一致；正常启动和隔离安装版基础交互、位置/缩放保存重开通过。
- 专项并发拖动：同提交隔离 Electron 鼠标验收通过；安装版 CUA 鼠标拖动未产生位置变化，不计作成功，现场体验待用户确认。
- 回滚：先退出应用，再从 `/Volumes/project/制品与备份/gitfinder-2/installed-backups/alpha92-20260905-072856` 恢复 alpha.92；用户原有配置未修改。
- 公开发布：未上传商店或切换 current；Windows 本轮未构建。

## 2026-09-05 07:52:07 +0800 · 2.0.0-alpha.94

- 提交：`b3d2e29a0587c63defe44e97abbd08c0a2889c52`，已推送 origin/main。
- 内容：GF-DRAG-20260905-03，开启固定下级的上级主机带动 Project 及其全部物理成员，保持尺寸和相对位置。
- 来源：该提交的干净工作树 `/Volumes/project/临时文件/gitfinder-project-drag-alpha94/build`；检查 991/991、235 个 JS 语法检查和 renderer 构建通过，macOS `npm run pack` 与 development 制品门禁通过。
- 制品：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.94/`，含 macOS arm64 ZIP、latest-mac.yml 与绑定该提交的 release-verification.json；ad-hoc 开发签名。
- 安装：`/Applications/GitFinder 2 Alpha87.app` 已更新；安装 ASAR 与报告一致，签名检查通过。普通启动确认版本和主界面，安装版鼠标拖动同位移、Project 尺寸和成员保持，普通退出重开持久化通过。
- 证据：`/Volumes/project/临时文件/gitfinder-project-drag-alpha94/installed-drag-verification.json` 与同目录 screenshot/log/check 记录；使用隔离 user data，已退出测试实例，用户配置未修改。
- 回滚：退出应用后从 `/Volumes/project/制品与备份/gitfinder-2/installed-backups/alpha93-20260905-074213/GitFinder 2 Alpha87.app` 恢复前一安装版。
- 发布范围：alpha.94 未上传商店或切换 current，Windows 本轮未构建。

## 2026-09-05 08:20:37 +0800 · 2.0.0-alpha.95

- 最终提交：`4d279977d39c4dcf35bf4a977684344469cfd6b2`，包含功能提交 `7b86880`，已推送 origin/main。
- 内容：可选 Casdoor 桌面客户端 + 当前白板连线粗细设置；生产认证服务尚未配置就绪，不标为生产登录完成。
- 来源：干净 detached worktree `/Volumes/project/临时文件/gitfinder-account-width-alpha95.0nIalV/build`。全量检查1022/1022、242个JS与renderer构建通过；最终样式收尾设置专项16/16通过。
- 构建尝试：首次干净测试遇 Electron 懒初始化并发解压冲突；运行时安装完成后通过。初包目视发现账户输入框未复用样式，提交4d27997后重新完整打包，最终development门禁通过。
- 制品：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.95/`，macOS arm64 ZIP/latest-mac.yml/release-verification.json；ad-hoc开发签名，未进行正式签名分发。
- 安装：`/Applications/GitFinder 2 Alpha87.app`；安装ASAR与最终包一致，SHA256 `82f604f688c16cc61d79a4553eec9a1afd98f2662a317cd0c3bcac07a971e585`，codesign验证通过。
- 验收：真实安装版线宽实时调节1.7→3.2px；正常退出重开仍3.2px；账户入口与未配置离线状态、回调、表单可见；最后无调试参数正常启动并显示alpha.95及原用户工作区。
- 回滚：正常退出后，从 `/Volumes/project/制品与备份/gitfinder-2/installed-backups/alpha94-before-alpha95-20260905/GitFinder 2 Alpha87.app` 恢复。用户实际配置未被测试修改。
- 未完成：Casdoor服务503及真实Client ID待配置，生产端到端登录待验收。本轮无Windows构建、商店上传或current切换。

## 2026-09-05 09:43:13 +0800 · 2.0.0-alpha.96

- 提交：c447cdc6c9e1f17504059766aa6040bb75548eaa，origin/main一致；复用域名访问点识别、浮动归属、红线警报与旧缓存兼容。
- 门禁：干净提交1032/1032、244个JS语法检查、renderer与macOS artifact验证通过。
- 制品：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.96/`；ad-hoc开发包；未构建Windows或切换商店current。
- 安装：`/Applications/GitFinder 2 Alpha87.app`，签名验证通过；安装与构建ASAR SHA256均为 `34a88008bb5ed05c1dca07507a891c38f625e1e40b66c2d7fd4302ec21feb5bc`。
- 验收：隔离白板1个浮动访问点、2条红线、警报1条与详情，原生拖动及重开通过；随后无调试参数启动原白板。证据在 `/Volumes/project/临时文件/gitfinder-shared-endpoint-alpha96.Llx2lL/`。
- 回滚：正常退出后可恢复 `/Volumes/project/制品与备份/gitfinder-2/installed-backups/alpha95-before-alpha96-20260905/GitFinder 2 Alpha87.app`。

## 2026-09-06 03:38:00 +0800 · 2.0.0-alpha.102

- 内容：资源库点击摘要预览（白板文件 / 项目 / Git 仓库）、项目颜色装饰；Archify 快照只读架构层与资源刷新集成。
- 门禁：`npm run check` 通过（1049/1049 测试、250 个 JavaScript 文件语法检查、renderer 构建）；`git diff --check` 通过。
- macOS：`npm run pack` 成功，development/ad-hoc 制品门禁通过；构建提示缺少既有 `public/icon.icns`，不影响本次产物生成。
- 制品：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.102/`，ZIP SHA-256 `ea2dca94e4a7a6fc2a841ed3d70eedd44aa81c8d4a73029e48188d5abad5023c`。
- 安装：已替换 `/Applications/GitFinder 2 Alpha87.app` 并启动；Info.plist 与运行界面均为 `2.0.0-alpha.102`，安装 ASAR 与构建产物一致。
- 范围：本轮未构建 Windows、未上传商店或切换公开 current；用户原配置保持在原安装路径，待用户确认资源库实际点击体验后归档修复报告。
