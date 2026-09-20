# 应用面板Coolify管理入口 · alpha205

2026-09-20 +08:00，GF-PANEL-MANAGE-001；基线alpha204/95a5408，原10项dirty保留。

用户明确需要Coolify部署管理页而不是应用后台。卡片/表格共用操作区新增“Coolify 管理”，“打开”改为“访问应用”。复用coolifyManagementLinks，从provider.baseUrl与资源Project/环境/资源UUID和类型生成地址，不用公开域名猜测、不信任资源自带任意URL。无域名数据库仍可管理；身份不全禁用并提示，同一部署多域名共享管理地址；打开失败提供错误信息。

回归先失败后通过：native-panel-model与coolify-card-links共20/20。隔离Electron verify-native-panel.js通过表格/卡片各2个管理入口、无域名、禁用、失败提示和4次精确地址捕获；原筛选/检测/布局及14主题/4提醒配色回归通过。CUA查看卡片截图确认按钮未溢出。外链使用mock捕获，不宣称已登录真实Coolify或执行管理操作。全量、打包与安装继续执行。

源码门禁：alpha205 `TMPDIR=/private/tmp npm run check` 1414测试/298JS通过。另补主进程白名单回归，确保NativePanelModel生成的管理URL可被CoolifyProviderService.resolveExternalUrl接受。

打包安装：源码24e517dbab2567fbf5a38afbc352b702ea211a7b，macOS arm64开发包门禁通过；旧alpha204正常退出并移到`/Volumes/project/制品与备份/GitFinder-2-alpha204-before205.app.disabled`，新包安装`/Applications/GitFinder 2.app`。签名核验和Info.plist alpha205通过。独立profile安装测试开始；暂未推送。本次未改更新模块，无Windows或正式公证发布。

安装专项：独立profile `/private/tmp/gf-panel205-Jn9sqo`，`node scripts/verify-native-panel.js 9337`通过；管理入口、地址捕获、禁用、错误提示、原交互和14主题/4提醒配色均通过，日志`/tmp/gf-panel205-installed.log`。隔离进程已退出，正在正常启动原配置核对。

原配置验收：正常启动显示alpha205，应用面板保留原筛选4/35部署；eastfolk、payment-hub等5行出现精确管理地址，两个无公开域名的部署管理按钮可用。启动曾出现空白，之后加载完成，未改配置或证明启动延迟根因。点击eastfolk管理按钮后，浏览器库存回读工具超时，故真实外部页面落地/登录未验证；隔离测试的URL捕获及主进程白名单验收已通过。未触发同步/探测或部署写操作；原有自动远端观测由App继续读取。

源码24e517dbab2567fbf5a38afbc352b702ea211a7b已推送origin/main。用户确认pending；未归档用户确认后的修复报告。
