# alpha.198 · 白板 Coolify 管理入口

任务：GF-COOLIFY-LINK-001。基线 `3b34d98` / alpha.197；独立分支 `fix/coolify-card-links-198`。用户指出卡片遗失管理后台入口，本轮不处理尚待复现的容器删除/分组生命周期问题，也不合入并行双源更新。

## 问题与实现

- 部署卡片底部和主机、云Project容器标题区增加直接可见的 **Coolify ↗**，不必先打开详情或更多菜单。网站“访问”保持独立。
- 所有按钮使用既有ToolbarButton的pointer/mouse/click传播隔离和`panel.openExternal`通道；点击时按当前实体重新取管理地址，不信任旧按钮捕获的URL，不改变节点选择、布局和撤销历史。
- 主机原来仅提供Coolify首页，现在使用配置实例和来源主机ID生成对应详情地址。Project使用来源Project UUID构造详情页，应用/服务/数据库保持独立资源类型；身份缺失、未知占位ID或地址不可靠时不回退首页、不按名称猜测。
- `coolifyManagementLinks.js`提供共享路径构造与展示检查；拒绝非HTTP(S)、URL用户密码、查询参数、片段及非法身份。主进程仍只允许精确已知URL，不放开整站任意路径。
- Project分组传递只读管理URL，同名/同UUID跨实例不混合；来源地址冲突不选择任意一个。旧缓存重新激活时基于当前实例和缓存来源身份重建链接并加入精确白名单，无需改白板文件。
- 管理URL仅在来源运行数据和显示对象上存在；便携白板不保存后台地址或凭据。完全没有来源的离线文档中按钮禁用并说明原因；加载对应来源后自动恢复，缓存可用不等于远端当前一定可访问。
- 正式页面及独立HTML夹具装载同一辅助模块，未修改数据库、服务器配置或默认关闭的实验进度开关。

## 路由核对

2026-09-18核对Coolify官方v4.x `routes/web.php`：主机`/server/{server_uuid}`、项目`/project/{project_uuid}`、部署`/project/{project_uuid}/environment/{environment_uuid}/{application|service|database}/{resource_uuid}`。参考源：
`https://raw.githubusercontent.com/coollabsio/coolify/v4.x/routes/web.php`

仅核对官方代码中的路由约定，不将其等同于用户实例登录、权限或网络可达性的验证。

## 验证结果

- 新增15项专项；与provider、projection、资源组合相关90项通过；完整 `npm run check` 1344/1344，292个JS语法检查。新增UI脚本另执行语法检查。
- 源码实际Electron12项：三个直接可见入口、真实指针正确目标、无布局/选择/历史副作用、同名双实例、窄窗、管理字段不持久化、离线退出重启、来源恢复、键盘Enter、错误提示、默认实验开关保护。
- UI测试采用自建profile和合成来源，指针/键盘使用真实renderer事件；外链调用在renderer bridge边界记录而不打开用户系统浏览器。主进程允许/拒绝逻辑单独由真实service单测验证。未代用户登录真实Coolify或执行部署操作。
- 原始日志/截图位于 `dist/agentdock-coolify-links-20260918/`；复跑：`node scripts/verify-coolify-card-links.js`，安装版追加 `--app '/Applications/GitFinder 2.app/Contents/MacOS/GitFinder 2 Alpha'`。

## 失败记录与边界

初始9项测试1通过8失败，后续纠正了夹具中的网站末尾斜杠、过短模拟token及选择共享资源组而非物理Project的断言，不将夹具错误计为产品缺陷。新代码一度让纯渲染辅助方法必须有store，导致两个既有测试失败；已恢复无store的输入图行为，全量复验通过。

UI首轮键盘Enter未产生按钮默认点击；补CDP回车文本后同一产品源码通过，不宣称修复了产品键盘问题。保留`ui-source.log`和`ui-source2.log`。工具偶发“无法确定请求安全状态”，正常同请求重试或继续独立步骤，没有更改安全设置或绕过被拒绝动作。

## 系统默认浏览器策略（用户确认）

用户于2026-09-18明确：Coolify管理入口应在系统默认浏览器打开。调用链为卡片/容器 → 控制器按当前实体取URL → `panel.openExternal` → 主进程校验最近来源白名单 → `shell.openExternal(url)`。不指定Chrome/Safari，不创建内嵌管理页面，不修改系统默认浏览器设置，不把API Token或白板数据放到链接中。

补充`test/coolify-default-browser.test.js`，验证主进程只把已校验URL交给系统、不增加浏览器覆盖参数，拒绝地址时不启动，系统启动失败可回传。16项链接专项通过。另对实际安装ASAR中的`src/main/ipc/panel.js`逐字核对并执行同类隔离VM验证，证据`installed-default-browser.json`；shell边界模拟，不冒称已自动操作用户浏览器或登录真实后台。Electron官方文档：`https://www.electronjs.org/docs/latest/api/shell`。

## 最终交付 · 2026-09-18T09:43:56+08:00

- 当前版本`2.0.0-alpha.198`，运行源码`e9097dce888cf2511d68bfcccc3b432290d1cdf8`；后续`ba0f6c5abbacd7a318c69b43273e06ffd2f72b84`仅增加默认浏览器测试，不改运行源码。两者均已在安装验收后推送，后续文档收口不改变安装制品源。
- 运行源码提交完整检查1344/1344、292JS；补充默认浏览器回归后的干净QA提交完整1345/1345、293JS通过。新版直接入口源码及安装版各12项通过；安装版另通过21项资源容器与18项测试开关保护，总计51项安装流程，含退出重启、离线/恢复和跨窗口。
- macOS development制品门禁`issues=[]`，安装ASAR摘要与报告一致，`codesign --verify --deep --strict`通过。ASAR SHA-256：`400fbce6050c6916e2b6b5260fc92795ef50c759cc62d6ae21d7b8703cea28f1`；ZIP SHA-256：`dcb47c840f0d7f4f21fa264cd837fbd5a18f8507a1aeee230c8d8400cc9aedd6`。
- 已安装`/Applications/GitFinder 2.app`，旧197备份：`/Volumes/project/制品与备份/GitFinder-2-alpha197-before198.app.disabled`。升级ZIP：`dist/agentdock-coolify-links-20260918/work/dist/GitFinder-2-2.0.0-alpha.198-arm64-mac.zip`。
- 正常用户配置已启动，`normal-ready-alpha198.png`确认alpha198、原81个项目和实际卡片上的Coolify入口。首次`normal-installed-alpha198.png`捕获到初始化阶段，不计为内容验收；等待后重新截图，没有为截图改动用户布局。
- 原主目录10项未提交内容按基线保护，集成时保留原增量，不混入本轮提交。
- **白板校验限定**：旧合集和独立con01文件与09:32基线字节一致；当前本机工作区文件摘要不同，实际最后写入09:33:37早于09:36:12制品生成和安装，后续正常启动未观察到再次写入。没有保留该次变化前全文，因此不声称只是视口变化，也不声称3文件全部字节一致；未覆盖该文件。详见`delivery-verification.json`。
- 仅ad-hoc本机开发包，没有执行Windows、正式公证或公开Release。UI外链在renderer bridge边界记录；主进程真实来源/白名单和系统委托单独验证，不代用户登录后台、不执行服务器写操作。

唯一下一开发任务仍为GF-AI-PROGRESS-001（仅设计、未认领）。已记录的容器删除/分组生命周期疑点不是本次链接修复内容，不能据此标为解决。用户可直接点击卡片/主机/Project上的Coolify按钮验证自身默认浏览器与登录权限；实际反馈仍pending。
