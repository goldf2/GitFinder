# 白板显示内容优化 · alpha.135

目标：按卡片多选显示内容，主机与 Project 独立控制，Project 包裹部署，保存重开保持设置。

## 2026-09-10 07:38 +0800 · 实现和浏览器验证

- `resourceDisplayLevels` 保存多选数组；兼容旧 `resourceDisplayLevel` 连续层级。当前卡片作为设置锚点保留，部署显示时 Project 容器必需，菜单明确标注。
- Coolify Project 容器参与下级资源层级计算并提供显示设置；Project/部署的局部偏好优先于主机默认配置。
- 本机白板启用卡片显示偏好时更新实时 Project 归属，移除过期容器并恢复部署位置，保留卡片注释。
- 勾选更新画布数据并重开菜单，避免每次销毁整个画布；只显示 Project 时树状图保留容器。
- 浏览器正式控制器隔离验证：2 台主机，第一台显示 5 个 Project、15 个部署，另一台保持仅主机；18 个访问点可独立开关；几何断言确认部署完整位于容器内；保存重开保持偏好和可见节点。无页面脚本异常。
- 证据：`/Volumes/project/临时文件/gitfinder-whiteboard-alpha135.Vr2fF0/browser-result.json`、`browser-whiteboard.png`、`verify.cjs`。
- 当前工作树最终全量检查 1112/1112 通过；从发布提交独立检出后检查 1110/1110 通过、257 个 JavaScript 文件语法检查通过。数量差异来自未纳入本次发布的项目侧栏草稿测试；新增白板专项 6/6 通过。
- 左侧目录详情问题仍待单独完成，本次未包含项目组侧栏等其他未提交修改。
- 用户尚未确认实际使用效果，支持文档修复报告待确认后归档。

## 2026-09-10 07:49 +0800 · macOS 安装验收

- 发布版本：`2.0.0-alpha.135`；打包源码提交：`5907030`。从独立、干净工作副本运行 `npm run check`、`npm run pack`，开发签名发布门槛通过。
- 安装位置：`/Applications/GitFinder 2 Alpha135.app`。旧版 Alpha134 保留，未删除用户配置或数据。安装包与已安装应用 ASAR 一致，`codesign --verify --deep --strict` 通过。
- 安装版隔离配置实际点击显示设置：主机 A 同时选择部署、访问点，Project 容器自动包裹两项部署；主机 B 保持仅主机，互不影响。正常退出重开后，7 个节点及两台主机的多选偏好保持一致。
- 安装验收证据：`/Volumes/project/临时文件/gitfinder-whiteboard-alpha135.Vr2fF0/installed-before-reopen.json`、`installed-after-reopen.json`、`read-installed.cjs`。隔离测试只用合成缓存与 localhost，不代表真实 Coolify 在线同步验收。
- 已关闭隔离实例，以原用户配置普通启动 Alpha135；可见版本正确、项目列表和三个项目组加载成功。未改动真实白板布局。
- 最终制品：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.135/GitFinder-2-2.0.0-alpha.135-arm64-mac.zip`；同目录保存 `release-verification.json`。
- ZIP SHA256：`75cd5f6e545b163d1dde1d5bfc288ecd54206c9e03b010461dfeeefda07b17a0`。
- 安装后清理本次临时发布工作副本，避免它被项目扫描识别成额外项目；源码可从提交恢复，制品和外部验证记录保留。
- 发布推送状态：验收通过，源码提交 `5907030` 已成功推送至 `origin/main`，本记录随后随同发布文档提交推送。Windows 与商店公开发布不在本次范围。
