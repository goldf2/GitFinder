# alpha183 容器菜单遮挡修复

## 2026-09-15（Asia/Shanghai）

- 录屏复现：Project 标题快捷菜单被下方部署卡片盖住。
- 根因：内嵌标题的菜单属于低 z-index 容器节点，内部提高层级不能跨越节点的叠放上下文。
- 修复：标题仍留在容器内，仅快捷操作移入 NodeToolbar 画布浮层；外部点击关闭逻辑识别该浮层，避免按钮在执行前被关闭。
- 不修改拓扑、布局或显示偏好。
- 回归：新增菜单 portal/关闭边界检查，修复前失败；修复后 `npm run check` 1178 项测试及 270 个 JS 语法检查通过。
- macOS：`npm run pack` 开发/ad-hoc 制品验证通过；安装至 `/Applications/GitFinder 2.app`，签名检查及可见版本 `2.0.0-alpha.183` 通过。旧版可恢复备份位于 `/Volumes/project/制品与备份/GitFinder-2-alpha182-before183.app.disabled`。
- 安装版交互（11:16 +0800）：Casdoor Project 菜单完整显示在部署卡片上方，点击“属性”打开“群组外观与嵌套”；AL03 主机菜单同样完整显示，点击“显示设置”打开原生层级菜单，Escape 关闭。未修改显示偏好、部署或拓扑。
- 源码提交：`2dacd15`；产物：`dist/GitFinder-2-2.0.0-alpha.183-arm64-mac.zip`。本记录提交后推送；用户最终确认仍待收集，不声称白板全部问题已经解决。
