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

## 验证结果（源码已验证，安装交付待完成）

- 新增15项专项；与provider、projection、资源组合相关90项通过；完整 `npm run check` 1344/1344，292个JS语法检查。新增UI脚本另执行语法检查。
- 源码实际Electron12项：三个直接可见入口、真实指针正确目标、无布局/选择/历史副作用、同名双实例、窄窗、管理字段不持久化、离线退出重启、来源恢复、键盘Enter、错误提示、默认实验开关保护。
- UI测试采用自建profile和合成来源，指针/键盘使用真实renderer事件；外链调用在renderer bridge边界记录而不打开用户系统浏览器。主进程允许/拒绝逻辑单独由真实service单测验证。未代用户登录真实Coolify或执行部署操作。
- 原始日志/截图位于 `dist/agentdock-coolify-links-20260918/`；复跑：`node scripts/verify-coolify-card-links.js`，安装版追加 `--app '/Applications/GitFinder 2.app/Contents/MacOS/GitFinder 2 Alpha'`。

## 失败记录与边界

初始9项测试1通过8失败，后续纠正了夹具中的网站末尾斜杠、过短模拟token及选择共享资源组而非物理Project的断言，不将夹具错误计为产品缺陷。新代码一度让纯渲染辅助方法必须有store，导致两个既有测试失败；已恢复无store的输入图行为，全量复验通过。

UI首轮键盘Enter未产生按钮默认点击；补CDP回车文本后同一产品源码通过，不宣称修复了产品键盘问题。保留`ui-source.log`和`ui-source2.log`。工具偶发“无法确定请求安全状态”，正常同请求重试或继续独立步骤，没有更改安全设置或绕过被拒绝动作。

## 交付状态

源码已验证。等待提交后精确重跑、可追溯开发包、可恢复安装与可见验收；完成前不标记已交付。本轮不做Windows、公证或公开Release。
