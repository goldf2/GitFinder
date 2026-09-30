# alpha.219 类别展开内容保留

问题：统一树的成员列表套用当前projectType，选中别的类型/集合时非选中类别成员被过滤。修复仅让左树忽略当前类型/集合选择；右侧类别结果与左侧搜索/属性过滤保留。

源码与安装验收已完成，用户验收pending。

## 源码验证

旧代码隔离窗口失败于“右侧类别过滤不清空其他类别的导航成员”（before-ui.log）。修复后1439测试/302JS与22项窗口检查通过，覆盖切换类别、手动折叠、嵌套集合及搜索过滤；证据dist/sidebar-category-alpha219/{source-check,source-ui}.log。安装验证见下。

## 实际配置补充修复

首次安装22项通过，真实启动项目页连续刷新时，旧请求被代次检查丢弃，而新请求因localProjectsLoading跳过，留下加载提示。已在旧请求结束且当前仍为项目聚合时重绘最新视图；Git/文件页面不触发。新增可控延迟窗口回归通过，最终1439测试/302JS与23项交互通过。最终重新打包安装通过。

## 最终安装验收

- 源码542297961aaa482a2f7102a40a7ba9b35d40727d，已推送origin/main。干净构建`/Volumes/project/临时文件/gitfinder-sidebar-category-alpha219`，arm64 DMG/ZIP开发门禁通过。
- 安装`/Applications/GitFinder 2.app`版本2.0.0-alpha.219，codesign验证通过；ASAR与构建产物一致：9326e45a50b61240925dc21a7fc1a57cd3e5d19732725afbcbfc2e46293705ef。恢复正常无调试参数启动。
- 1439测试、302JS检查及最终23项安装交互通过。安装截图`dist/workspace-ui-Jsku9I/`；日志`dist/sidebar-category-alpha219/{source-check,source-ui,installed-ui,build-final}.log`。
- 真实86个项目配置：选中投资研究后研发工具的23个导航成员保持可见；手动折叠后选择类别不会强制展开。已查看`dist/sidebar-category-alpha219/real-category.png`，结果real-category.json。
- 旧alpha.218备份`/Volumes/project/制品与备份/GitFinder应用备份/2026-09-30-alpha218-before219/GitFinder 2.app`。projectGroups与前快照一致；9个无关文件字节未改，3份交接文档仅提交本轮块/追加。
- 用户验收pending，确认有效后归档支持修复报告；本轮未移动目录、更改分类或执行公开发布。
