# alpha.145 白板缩放可读性

2026-09-12 +08:00。

- 用户截图：连线缩小后极细，分组标题/成员说明维持屏幕大尺寸遮挡卡片。
- 连线显式按 viewport zoom 反向补偿笔宽与虚线间距，屏幕最小 2px；关闭路径 non-scaling-stroke，避免重复补偿。
- 分组标题按缩放压缩字号和最大宽度，长标题省略并保留完整 title；低于 60% 时隐藏成员说明，选中后仍可见操作；概览去掉重阴影。
- 不改布局坐标、资源、关系或用户保存数据。

## 2026-09-12 17:54 +08:00 验证与发布

- 源码 `b20a83f`（含 `9fdea21`），版本 `2.0.0-alpha.145`。check 通过 1138 项测试、266 个 JavaScript 语法检查；pack 成功。
- 安装 `/Applications/GitFinder 2 Alpha145.app`，保留 Alpha144，codesign 深度严格验证通过；构建与安装 app.asar 校验一致。
- 安装版启动显示 alpha.145，原部署关系白板加载 56 个节点、6 条关系。“适合内容”后实线、虚线清晰，概览标题紧凑省略，未选中群组隐藏成员说明。仅调整视口，未自动排列或修改节点。
- ZIP：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.145/GitFinder-2-2.0.0-alpha.145-arm64-mac.zip`。
- ZIP SHA-256：`faecb431f22accf7eaec35975a4b9651ef32bf65cd4c35bc01bb5e9f6a22c81b`。
- app.asar SHA-256：`29590297822fb25dd2765d3dfd39ea834d7d242c95377a136b89defc68a2f62e`。
- macOS 开发签名包；未验证 Windows、商店发布及全部白板交互。待用户确认效果后归档修复报告。
