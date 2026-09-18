# alpha.200 · 应用面板统一命名

任务：GF-PANEL-NAME-001。基线 `23c39fe` / alpha.199。用户确认将“象数面板”更名为“应用面板”。

## 范围

统一功能菜单、面包屑、标签页、原生页面标题、状态栏及分离窗口标题。页面说明为“查看已部署应用与服务，检查状态并快速访问。”。

`panel` 模式、既有 DOM/CSS 标识、`gitfinder.native-panel.v1`、工作区会话键和接口路径保持不变；来源网站、Provider 协议标识和 vendor 出处不改名；历史版本报告不回写新名称。仪表盘和开发进度仍属于默认关闭的测试功能。

工作分支 `fix/app-panel-name-200`，独立工作树 `dist/agentdock-app-panel-20260919/work`。原10项未提交内容已保存字节及Git补丁。字号调节范围、AI进度和并行双源更新不包含在本轮。

## 验证和交付

以下为源码阶段记录；最终安装与推送状态见末尾“最终交付”，不以用户对名称的认可代替实现验收。

- 新增7项回归在旧源码上2通过、5失败，更名后7/7；连同旧面板测试13/13。分离窗口标题从实际主进程源码表达式在隔离VM运行，确认旧panel标题改为新名称、其它窗口标题不变；未声称原生分离窗口鼠标验收。
- 首轮完整检查1368/1368、294个JS通过；随后补齐标签可访问提示内的来源域名残留，最终提交还须重跑精确全量。
- `scripts/verify-app-panel-name.js`源码版7项通过：界面命名、功能说明、原表格数据、搜索与卡片切换、关闭/恢复标签、窄窗、独立进程重启与原偏好、实验开关。该脚本对导航使用应用方法，对搜索和布局使用CDP输入；API使用隔离合成数据，不读取或修改真实用户配置。
- UI首轮查询“示例”同时匹配两个资源的项目名，改为唯一查询“API”；脚本编辑中一次字符串引号错误已在语法检查发现并改正。一次直接CDP点击旧标签没有激活，原因未在本轮诊断，后续按既有导航方法验证模式恢复，不将其记为已修复的产品问题。原失败日志保留。
- 原始证据：`dist/agentdock-app-panel-20260919/`；`naming-before.log`、`naming-final.log`、`full-check.log`、`ui-source4.log`及其实际截图。

复跑：`node --test test/app-panel-name.test.js test/xiangshu-panel-view.test.js`；`node scripts/verify-app-panel-name.js`；安装版追加 `--app '/Applications/GitFinder 2.app/Contents/MacOS/GitFinder 2 Alpha'`。

## 最终交付

- 版本 `2.0.0-alpha.200`；运行源码 `311c24c0c383d7fb2542b60bffea26f29c662e49` 已在安装验收后推送。后续交接记录提交不改变安装制品源。
- 精确干净提交完整检查 **1368/1368**、**294个JavaScript文件**通过；新名称专项7/7。Node执行版本26.9.0；未额外声称Windows实机或其他Node版本的新验收。
- 源码版和最终安装版各7项界面/恢复验证通过，覆盖导航文字、旧标签、搜索、表格/卡片和偏好重启。最终安装证据 `/Volumes/project/项目/gitfinder-2/dist/agentdock-app-panel-20260919/work/dist/app-panel-name-ui-418E7C/result.json`；分离窗口标题为主进程表达式VM验证，非原生分离窗口实测。
- 正常用户启动后系统截图 `normal-installed-alpha200.png` 已确认应用面板、旧标签的新名称、原筛选及实际资源；没有为验收重写用户偏好或白板。
- 安装 `/Applications/GitFinder 2.app`，旧版备份 `/Volumes/project/制品与备份/GitFinder-2-alpha199-before200.app.disabled`。制品门禁issues为空，严格签名检查通过，仅ad-hoc本机开发包，无Developer ID公证、Windows或公开Release发布。
- 安装ASAR SHA-256：`be07f8c81d07adea79930db616c8e106f69e74b09c0747a5f85f66208edd3055`；ZIP SHA-256：`e11d5661dd49a78339d447e3fccf28f3122602dca495f1f3adf2dad5904ed9a3`。ZIP在本工作树 `dist/GitFinder-2-2.0.0-alpha.200-arm64-mac.zip`。
- 3个原白板文件在正常启动后的字节校验与本轮基线一致；主目录原10项未提交内容在集成前一致，集成时只应用本轮已提交内容并恢复原差异。最终以 `delivery-verification.json` 的集成核对为准。
- 没有重新命名Provider协议、网络端点、存储键、内部DOM/CSS/方法标识或历史版本出处。字号扩大、AI进度和双源更新均未合入本轮。
