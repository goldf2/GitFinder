# 应用面板Coolify管理入口 · alpha205

2026-09-20 +08:00，GF-PANEL-MANAGE-001；基线alpha204/95a5408，原10项dirty保留。

用户明确需要Coolify部署管理页而不是应用后台。卡片/表格共用操作区新增“Coolify 管理”，“打开”改为“访问应用”。复用coolifyManagementLinks，从provider.baseUrl与资源Project/环境/资源UUID和类型生成地址，不用公开域名猜测、不信任资源自带任意URL。无域名数据库仍可管理；身份不全禁用并提示，同一部署多域名共享管理地址；打开失败提供错误信息。

回归先失败后通过：native-panel-model与coolify-card-links共20/20。隔离Electron verify-native-panel.js通过表格/卡片各2个管理入口、无域名、禁用、失败提示和4次精确地址捕获；原筛选/检测/布局及14主题/4提醒配色回归通过。CUA查看卡片截图确认按钮未溢出。外链使用mock捕获，不宣称已登录真实Coolify或执行管理操作。全量、打包与安装继续执行。

源码门禁：alpha205 `TMPDIR=/private/tmp npm run check` 1414测试/298JS通过。另补主进程白名单回归，确保NativePanelModel生成的管理URL可被CoolifyProviderService.resolveExternalUrl接受。
