# alpha.144 面板侧栏布局

2026-09-12 +08:00。

- 用户要求优化面板顶部堆叠信息与大幅横向留白。
- 主机、Coolify 项目、资源类型多选移入左侧可收起栏；同步时间、远端读取与连接设置放到侧栏下方；技术说明默认折叠。
- 顶部只保留搜索、部署计数、布局切换、同步和侧栏开关。侧栏显隐偏好保存；部署按 providerId + resourceUuid 去重，访问点数在统计提示内显示。
- 表格固定缩略图、主机、项目、状态与操作列宽，名称/网址负责弹性空间；窄窗口横向滚动，不挤压状态灯。
- 保留主题变量、缩略图与独立状态来源；数据读取逻辑不变。
- npm run check：1136 项测试通过，265 个 JS 语法检查通过。
- 源码 07ecd18 从独立 worktree /tmp/gitfinder-layout-build.fQ1Lo9 打包，已安装 /Applications/GitFinder 2 Alpha144.app；Alpha143 原路径保留。
- 安装版实际选择 AL03，显示 6 / 35 个去重部署；侧栏收起/展开通过并截图确认表格随之扩展。缩略图、三灯与顶部单行工具栏正常；已清除筛选恢复 35 / 35 个部署。未触发实际服务器刷新或探测。
- codesign 验证通过，安装/构建 ASAR SHA256 相同：7392e8ec0aa035cbfb989ae4ee1073c1a77c43d6968a1b8cbb8a943a304f2b8f。
- 制品 /Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.144/GitFinder-2-2.0.0-alpha.144-arm64-mac.zip，SHA256 fd5c5c67d18500402220e3cfb73c195605c108cb44912c38da02953eb0a92e64；同目录包含 release-verification.json。ad-hoc 开发签名。
