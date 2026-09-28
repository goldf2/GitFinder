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

待执行。源码通过不等于安装、用户确认或公开发行。计划从本轮提交生成macOS ARM64 development/ad-hoc包，备份alpha.211后验收安装版，成功再推送。

## 保留边界

最终版本检查与文件替换之间仍不是跨多个非协作写进程的严格原子比较操作；不声称消除所有竞态。断电/进程中断恢复、资源库登记写入失败的更广泛矩阵仍属于GF-DATA-001未完成部分。本切片不发布Windows包、不上传商店、不做Developer ID公证或公开版本发行。真实账号验收GF-AUTH-001仍待用户自行操作。
