# alpha.142 本地象数面板

2026-09-12 17:00 +08:00（发布验收进行中，以下仅记录已验证事实）。

## 目标与边界

用户确认将本机 coolify-dashboard 的实现接入 GitFinder；不继续以 iframe 嵌入网站。独立视图与关系白板并列，共用 GitFinder Coolify 资源/连接，不增加数据库或第二套凭据管理。

- 复用网站 0.8.16 的筛选、布局、列排序模块，来源见 src/renderer/scripts/vendor/README.md。
- 本轮交付本地表格/卡片、搜索、主机/项目/类型多选、资源缓存及显式同步。首开只读缓存，不自动发起 Coolify 全量同步或本机探测。
- 用户追加要求主题覆盖新面板：背景/表格/卡片/弹层/输入框使用 App 主题变量，状态灯使用现有提醒色变量（含色盲友好方案），不硬编码网站颜色。隔离 Electron 实测 14 组明暗 × 配色方案及 4 组提醒色联动通过。
- 每条资源分开显示部署、本机、远端状态；主界面原有同步灯仍独立，不受部署失败历史污染。
- 远端仅固定 GET panel.xiangshu.me/api/overview，读取已有批次，不强制扫描或访问配置；按节点地址 + UUID + URL 精确匹配。不会因远端 API 失败而把目标端点标红。
- 记录超过 5 分钟、旧缓存或失败节点显示黄色；未知/未匹配灰色。HTTP 401/403 黄色标为需授权，404/5xx 红色，不照搬网站的“低于 500 即在线”判定。网页可访问不等于业务健康。
- 远端时间是批次时间，不是逐项探测时间。网站自定义字段、备注编辑、Chromium 缩略图未迁移，白板投影未改动。

## 改动

模型：src/shared/nativePanelModel.js；远端服务：src/main/services/remotePanelObservationService.js；IPC/preload；本地控制器 nativePanelController.js、index.html、content.css、app.js。移除 alpha.141 iframe 与特定来源弹窗转发。

## 已验证

- 模型测试先失败（模块尚未实现），实现后通过；状态、新旧时间、401/403、404、节点匹配歧义、无 URL 资源覆盖。
- 远端服务测试覆盖字段白名单、固定只读请求、缓存、API 失败保留旧结果、超大与无效响应。
- npm run check：最终 1133 项测试通过；265 个 JavaScript 文件语法检查通过。
- scripts/verify-native-panel.js：独立 Electron 用户目录 /tmp/gitfinder-native-panel-qa.HzSvvH，使用 fixture API，无真实节点探测。验证三灯分别绿/黄/红、无网址灰灯、多选、搜索、表格/卡片、手动检测和关闭重开保留搜索。实际 renderer 截图 /tmp/gitfinder-native-panel-fixture.png 已查看。
- 只读本机 coolify-topology-cache.json：35 个部署展开为 38 条记录，33 条有访问点。远端固定 GET 返回 29 条探测，24 条与本机精确匹配。未执行实际 Coolify 同步或 AL02 直连；未读取网站凭据。

## 发布

- 目标版本：2.0.0-alpha.142；待提交、打包、安装验收与推送。现有非本任务未提交文档和项目元数据保留。
- 唯一下一步：从已提交源码打包并验收安装版本，随后记录结果和推送。
