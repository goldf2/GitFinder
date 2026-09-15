# alpha187 全屏点击修复

## 2026-09-15 Asia/Shanghai

- 实际 alpha186 全屏中点击筛选按钮无响应；CSS 外部工具栏与标签栏仍声明 Electron drag 区域。全屏时显式取消这些区域和白板子元素的窗口拖拽命中。
- 白板对话框原来挂载到 body，在 fullscreen 元素外不可见；改为优先挂载到 fullscreenElement，无全屏时仍使用 body。
- 不改动白板数据、布局、显示偏好。
- 安装版专项验收待完成。
