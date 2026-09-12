# alpha.155 · 纵向列表紧凑与可读视口

2026-09-12（Asia/Shanghai），用户明确要求实施 alpha.154 的诊断修复。

## 改动

- Project 纵向列表启用 shrinkAutoProjectGroups：仅对自动、未锁定且无锁定成员的采样 Project 收紧内部排列及边界。普通手工组和锁定分支保持；不变更关系或归属。
- Project 列内左对齐，主机仍位于列顶部居中。
- 纵向列表整理后从顶部按至少 32% 的阅读比例展示，长内容通过平移浏览；单独“适合内容”仍可缩至全图。
- 去掉该布局中按全图缩放反算标题留白的反馈；修复 fitContent 显式最小缩放参数被固定 3% 截断的问题。

## 初步验证

- 单元回归覆盖历史大框、紧凑多行多列、不同宽度左对齐、手工/锁定保护、重复稳定及可读视口。
- 本机缓存只读模拟：最后一个 con01 Project 的 y 从 16703 收至 5640，同一主机所有 Project x 均为 3216；AL02 容器从 1056×1071 收至 920×799。没有写入用户数据。
- 1158 项测试、270 个 JavaScript 语法检查通过，449eee9 隔离打包与签名完整性检查通过；开发 ad-hoc 包，不是正式分发签名。
- 安装 `/Applications/GitFinder 2 Alpha155.app` 后可见自动重排生效，布局保存为 project-columns、缩放 0.32。但重开后 AL02 框边界由约 920×799 回弹至 1056×1071，成员坐标保持。alpha.155 未通过冷启动验收，暂不推送。

## alpha.156 冷启动边界修复

- 2026-09-12 +08:00：安装验收发现 `_applyDynamicLayoutOverrides` 忽略已存自动容器尺寸，却留下新投影的默认大框。纵向列表已有明确保存位置时，清除新投影默认框，按已保存成员坐标重算包裹边界；不改变归属、成员坐标或其他布局。
- 新增序列化 store + dynamicLayoutStore 后创建全新 Controller 的回归。修复前 all 范围稳定失败：1368×639→1404×711，336×432→680×225，680×432→680×468；修复后 board/all 均通过。
- 2026-09-12 22:22 +08:00：1159 项测试、270 个 JavaScript 语法检查与 `git diff --check` 通过。源码提交 `68b1e21`，隔离构建 `/tmp/gitfinder-alpha156-build`，开发产物门禁无错误，签名为 ad-hoc。
- 已安装 `/Applications/GitFinder 2 Alpha156.app`，Info.plist 为 2.0.0-alpha.156，`codesign --verify --deep --strict` 通过；旧 Alpha154/155 应用保留。升级包已保存至本仓库 `dist/GitFinder-2-2.0.0-alpha.156-arm64-mac.zip`，验证报告 `dist/release-verification-alpha.156.json`（忽略目录，不提交制品）。
- 原白板/config 操作前备份 `/tmp/gitfinder-before155.DgJifK/`，只留本机，不提交配置。Alpha155 的实际重排和普通重开已执行；最终截图可见 80 节点 / 30 关系、纵向列表及 0.32 视口恢复，但容器默认边界回弹，因此不能视为最终通过。
- alpha.156 可见验收被 Mac 锁屏阻塞：CUA 明确返回 `The Mac is locked and automatic unlock could not unlock it`。此后未尝试解锁或操作 GUI，alpha.156 尚未启动验收，未推送。
- 唯一下一步：用户解锁后普通启动 Alpha156，点击全部自动排列、检查三列容器对齐和全图按钮，再退出重开确认容器不回弹；通过后推送当前 main。尚未得到用户有效确认，不归档“修复已确认”报告。
