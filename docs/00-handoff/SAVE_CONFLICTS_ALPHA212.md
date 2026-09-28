# alpha.212 白板保存冲突保护

任务：GF-SAVE-212。执行者：AgentDock-ChatGPT。基线：alpha.211 / 5282879。

## 范围与实现

仅优化独立白板文件和白板项目的保存安全，不改账户、更新渠道、布局、数据库或真实用户白板。原主工作树12项未提交路径已记录哈希，使用独立worktree开发。

- 版本标记改为实际文件字节的SHA-256，不再仅依赖修改时间与大小。相同时间/大小的外部编辑可被识别；只touch而不改内容不再误报冲突。
- 临时文件写入、同步完成后，在替换目标前再次验证原版本；保存准备阶段的外部修改/删除会拒绝覆盖并清理临时文件。
- 打开返回解析快照的版本；保存/创建项目返回写入快照的版本，避免登记资源库期间发生外部修改后，把新版本标记错配给旧编辑内容。
- 冲突保留当前编辑；控制器+真实临时磁盘回归验证另存为可以保留本地和外部两份内容。

产品文件：`src/main/services/whiteboardDocumentService.js`、`src/main/services/relationshipBoardExportService.js`。新增回归：`test/whiteboard-save-conflicts.test.js`。没有更改白板JSON格式，也不需要数据迁移；revision仅为打开文件的运行时校验标记。

## 源码验证

环境：macOS ARM64，Node v26.9.0；复用本机锁定依赖，已比较源/隔离worktree锁文件，除版本号外完全一致，未升级依赖。

新增10项回归在alpha.211原实现上3通过/7失败，日志：`dist/agentdock-save-conflicts-20260928/baseline-conflicts.log`。修复后保存/媒体/文档专项53/53通过：`focused-tests.log`。

首次全量1425通过/1失败，原因是复制隔离依赖时中断，缺少@electron/packager；保留`full-check.log`。通过rsync补齐后重跑`npm run check`：1426/1426通过，299个JavaScript文件检查通过，42项任务交接门禁通过。最终日志：`full-check-retry.log`。

磁盘满/权限错误用例是受控ENOSPC/EACCES注入，不冒充真实磁盘耗尽、断电或系统崩溃。打开/保存登记间隙的修改也是可重复的受控时序注入。

## 打包、安装与推送

构建源码：`9b14b62284257674b67e039c3a7cff9639434e3d`。`npm run pack`成功，development源码与产物门禁通过；ARM64 DMG/ZIP已生成，报告`work/dist/release-verification.json`的issues为空。仅ad-hoc签名，未公证，不具备正式分发资格。

已将alpha.212安装到`/Applications/GitFinder 2.app`，版本、codesign及ASAR与产物一致，ASAR SHA-256为`75e6f2c52b9eba4795499eda98110df67285e90ddf65b8f7f9161975eb6ed62d`。旧alpha.211可恢复备份：`~/Library/Application Support/GitFinder App Backups/alpha211-before-alpha212-20260928/GitFinder 2.app`。

### 实际安装版验收

在独立profile `work/dist/panel-resize-test-profile`、仅回环CDP9448，以正常`open -n`启动已安装App（未使用disable-gpu）。

- 原保存生命周期脚本14/14通过，实际IPC写入、保存中编辑、取消/失败受控注入均有日志，`installed-lifecycle.log`。
- 新冲突专项12/12通过：实际点击保存按钮，模拟同大小同时间的外部文件写入，界面显示保存失败、未保存内容保留、外部字节未覆盖、阻止冲突时切换文档。将隔离fixture的外部改动人工恢复后，实际点击保存可重试落盘；不把此受控fixture恢复称为产品自动合并。`installed-conflicts.log`与`work/dist/installed-conflict-results/`保留JSON和截图。
- 正常退出测试App，确认调试端口关闭，再启动同一已安装App和同一profile；生命周期重开3/3、新冲突重开5/5通过。不是仅刷新页面。日志`installed-lifecycle-reopen.log`、`installed-conflicts-reopen.log`。各组未捕获renderer异常均为0。
- 冲突截图已实际查看，显示alpha.212、“保存失败”、仍保留的编辑文字及外部修改提示。

安装后已退出隔离实例并用原用户配置正常启动（无调试或profile参数），桌面截图可见主界面和alpha.212；macOS弹出“文稿”文件夹访问请求，未代用户授权，原配置下受该权限影响的操作未进一步验收。桌面核验artifact `d1d23ef11a1dc94dc7ee2027c5c50dd0`（2026-09-28，临时截图）。

原12项工作区修改哈希在合入前全部未变；5个真实白板与索引文件在正常启动后仍与基线字节哈希一致。证据`installation.json`、`data-protection-after.json`、`user-whiteboards-before.json`仅留本机，不含账户凭据。

当前源码仍在独立分支，main集成和推送待执行，用户验收仍pending。

## 保留边界

最终版本检查与文件替换之间仍不是跨多个非协作写进程的严格原子比较操作；不声称消除所有竞态。断电/进程中断恢复、资源库登记写入失败的更广泛矩阵仍属于GF-DATA-001未完成部分。本切片不发布Windows包、不上传商店、不做Developer ID公证或公开版本发行。真实账号验收GF-AUTH-001仍待用户自行操作。
