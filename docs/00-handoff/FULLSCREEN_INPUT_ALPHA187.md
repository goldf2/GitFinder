# alpha187 全屏点击修复

## 2026-09-15 Asia/Shanghai

- 实际 alpha186 全屏中点击筛选按钮无响应；CSS 外部工具栏与标签栏仍声明 Electron drag 区域。全屏时显式取消这些区域和白板子元素的窗口拖拽命中。
- 白板对话框原来挂载到 body，在 fullscreen 元素外不可见；改为优先挂载到 fullscreenElement，无全屏时仍使用 body。
- 不改动白板数据、布局、显示偏好。
- `npm run check`：1182 测试、270 JS 检查通过；macOS 开发/ad-hoc 包和签名验证通过，安装 `/Applications/GitFinder 2.app`，可见 alpha.187。
- 实际全屏专项验收：筛选弹窗、显示设置弹窗、添加原生菜单均正常打开；“文字”对话框位于全屏内，可点击取消；退出全屏按钮恢复普通界面。未保存测试文字、未新增节点。
- 旧版可恢复备份 `/Volumes/project/制品与备份/GitFinder-2-alpha186-before187.app.disabled`。实现提交 `656df3a`；产物 `dist/GitFinder-2-2.0.0-alpha.187-arm64-mac.zip`。
- 启动初次载入期间全量重绘仍可能退出全屏（观察到，未在本次改动扩大处理）；加载后上述按钮验收通过。用户确认待收集。
