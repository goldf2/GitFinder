# 本地象数面板复用来源

`../dashboardViewUtils.js` 复用本机 `coolify-dashboard` 0.8.16（MIT），源提交 `1d198ad5db234b98458bbafea9567b8fb970ed45`：

- `public/filter-state.js`
- `public/layout-mode.js`
- `public/column-sort.js`

仅移除 ES module export 并包装为浏览器/CommonJS 共用模块。GitFinder 的表格、卡片和 IPC 适配另行实现；未复制远端节点凭据、运行数据库或 Chromium 缩略图服务。
