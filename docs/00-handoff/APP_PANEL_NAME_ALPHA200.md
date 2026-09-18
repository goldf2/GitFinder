# alpha.200 · 应用面板统一命名

任务：GF-PANEL-NAME-001。基线 `23c39fe` / alpha.199。用户确认将“象数面板”更名为“应用面板”。

## 范围

统一功能菜单、面包屑、标签页、原生页面标题、状态栏及分离窗口标题。页面说明为“查看已部署应用与服务，检查状态并快速访问。”。

`panel` 模式、既有 DOM/CSS 标识、`gitfinder.native-panel.v1`、工作区会话键和接口路径保持不变；来源网站、Provider 协议标识和 vendor 出处不改名；历史版本报告不回写新名称。仪表盘和开发进度仍属于默认关闭的测试功能。

工作分支 `fix/app-panel-name-200`，独立工作树 `dist/agentdock-app-panel-20260919/work`。原10项未提交内容已保存字节及Git补丁。字号调节范围、AI进度和并行双源更新不包含在本轮。

## 验证和交付

名称变更与相关检查已完成；构建、安装和推送尚待执行，不以用户对名称的认可代替实现验收。

- 新增7项回归在旧源码上2通过、5失败，更名后7/7；连同旧面板测试13/13。分离窗口标题从实际主进程源码表达式在隔离VM运行，确认旧panel标题改为新名称、其它窗口标题不变；未声称原生分离窗口鼠标验收。
- 首轮完整检查1368/1368、294个JS通过；随后补齐标签可访问提示内的来源域名残留，最终提交还须重跑精确全量。
- `scripts/verify-app-panel-name.js`源码版7项通过：界面命名、功能说明、原表格数据、搜索与卡片切换、关闭/恢复标签、窄窗、独立进程重启与原偏好、实验开关。该脚本对导航使用应用方法，对搜索和布局使用CDP输入；API使用隔离合成数据，不读取或修改真实用户配置。
- UI首轮查询“示例”同时匹配两个资源的项目名，改为唯一查询“API”；脚本编辑中一次字符串引号错误已在语法检查发现并改正。一次直接CDP点击旧标签没有激活，原因未在本轮诊断，后续按既有导航方法验证模式恢复，不将其记为已修复的产品问题。原失败日志保留。
- 原始证据：`dist/agentdock-app-panel-20260919/`；`naming-before.log`、`naming-final.log`、`full-check.log`、`ui-source4.log`及其实际截图。

复跑：`node --test test/app-panel-name.test.js test/xiangshu-panel-view.test.js`；`node scripts/verify-app-panel-name.js`；安装版追加 `--app '/Applications/GitFinder 2.app/Contents/MacOS/GitFinder 2 Alpha'`。
