# alpha.143 网页缩略图恢复

2026-09-12 +08:00。

## GF-PANEL-THUMBNAIL-01

- 现象：alpha.142 本地面板没有 alpha.141 网页中的缩略图。
- 根因：本地化迁移遗漏 screenshotUrl 字段和缩略图渲染，属于功能迁移缺失，不是用户资源被删除。
- 修复：远端检测结果保留经校验的截图路径，固定解析到 panel.xiangshu.me/api/thumbnails/；表格增加缩略图列，卡片增加预览。远端异步结果到达后更新图片，使用懒加载、缺图和加载失败占位。主题背景、边框、文字沿用 App 变量。
- 不加载目标服务器的任意图片地址；不把 favicon 充当网页截图；不因截图成功改变三种状态灯。
- 范围仅恢复现有远端缓存截图，不增加本机 Chromium 截图服务或自动强制远端截图。

## 验证与交付

- 新路径测试先复现失败，实现后通过；包含固定来源、路径校验、字段传递、两种布局、异步更新及主题约束。
- npm run check：1135 项测试、265 个 JS 语法检查通过；实际 Casdoor 远端截图 GET 返回 200 image/webp、2112 字节。待已安装版实际图片验收；目标 2.0.0-alpha.143。
- 源码 f05b248 已从独立 worktree /tmp/gitfinder-thumbnail-build.L3k4ps 打包成功。已安装 /Applications/GitFinder 2 Alpha143.app，Alpha142 原路径保留。
- 安装版正常启动，版本 alpha.143 可见。搜索 heqing-memorial，表格和卡片均显示实际远端网页快照；另验证 panel.xiangshu.me 卡片显示网站截图。截图已目视检查。恢复完整 38 / 38 表格，缩略图列及无图占位可见，沿用用户当前主题。
- codesign --verify --deep --strict 通过，安装/构建 ASAR SHA256 一致：5e9c8a58653cbb268f425fb24140c5c7152f23b8f4eddc4b92447417530bc4b1。
- 制品 /Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.143/GitFinder-2-2.0.0-alpha.143-arm64-mac.zip，SHA256 58cbd2c3c7ae7e5bc64deaebcdddca68b95ebf8c604493a72336f78dc6109f3a；同目录 release-verification.json。ad-hoc 开发签名。
- 用户确认显示有效后再提交支持文档/修复报告归档。
