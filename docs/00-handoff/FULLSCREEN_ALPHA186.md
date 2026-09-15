# alpha186 白板全屏

## 2026-09-15 Asia/Shanghai

- 工具栏在“适合内容”后新增“全屏”按钮，使用当前白板工作区的 Fullscreen API；保留白板工具栏，隐藏外部应用导航。
- 全屏状态同步按钮文字及 aria-pressed，可通过按钮或 Esc 退出；不改变画布数据、缩放和布局。请求失败显示提示。
- `npm run check`：1181 测试、270 JS 语法检查通过，覆盖请求目标、退出、失败提示和状态监听。
- macOS 开发/ad-hoc 打包、签名校验通过；已安装 `/Applications/GitFinder 2.app`，界面版本 alpha.186。旧 alpha.185 可恢复备份位于 `/Volumes/project/制品与备份/GitFinder-2-alpha185-before186.app.disabled`。
- 安装版实际点击全屏：白板铺满屏幕，外部导航消失，按钮变为“退出白板全屏”且 pressed=true；Esc 返回普通界面，按钮恢复“白板全屏”且 pressed=false。
- 实现提交 `41607e9`，产物 `dist/GitFinder-2-2.0.0-alpha.186-arm64-mac.zip`。验证记录提交后推送。
