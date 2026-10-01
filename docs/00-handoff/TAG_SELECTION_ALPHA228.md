# alpha.228 标签显示与分类展开

用户要求标签热力图可以关闭，选中边框颜色可选择，并且点击自定义分类名称只筛选，小三角独立控制展开。

## 实现

- 顶部显示控制新增标签热力图开关及橙、紫、红、绿、蓝五种选中边框色。本机保存偏好并在重启后恢复；默认保留热力图并使用橙色边框。
- 选中标签显示勾选、加粗文字及粗边框，背景保持中性，不只依赖色差。关闭热力图后保留仓库计数、筛选及选中状态。
- 分类初始收起。点分类名称只选中并筛选主视图；点小三角只展开或收起，保持当前筛选和选中状态。原标签和分类数据不变。

## 验证

在已安装alpha227复现点击分类名称自动展开，记录`dist/tag-selection-alpha228/category-before-installed.log`。修正测试选择器以针对可见仓库侧栏，避免命中隐藏旧项目栏。

源码1460/1460测试及311JS检查通过；36项界面检查通过，覆盖多选、热力开关、颜色选择、浅深色主题、分类交互、原侧栏布局与重启恢复。截图已检查。证据`dist/tag-selection-alpha228/source-check-final.log`、`source-ui-final.log`，截图`dist/sidebar225-ui-JZHswA`。

原筛选单元测试显式展开未分类后再验证成员，适配新的默认收起交互。原12项工作树修改已快照，9个非共享文件保持，3个共享交接文档仅暂存本轮块和追加。

## 交付状态

源码验证通过；安装与推送待完成。仅本机macOS开发包，用户验收pending，不自动启动GF-DATA-001。

## 最终交付

运行源码`644f6ede62f1da1df8a07a7c3e6926ff2d25c935`已推送并核对origin/main。干净构建1460/1460测试、311JS检查及macOS开发包门禁通过；`/Applications/GitFinder 2.app`已安装alpha.228，36项安装交互和重启检查通过。原用户界面实测APP标签的橙/紫选中、关闭热力保留计数、分类名称只筛选和三角独立展开收起。验收后恢复所有仓库，无标签筛选，默认热力开启和橙色边框；用户原侧栏顺序与高度保持。

115条注册仓库（当前受管位置显示58个）的原标签关联按路径核对无丢失，用户新增标签1保留。原9个非共享文件字节不变，共享3个交接文档仅提交本轮块/追加。用户验收pending，未扩大其他任务。

证据：`dist/tag-selection-alpha228/clean-check.log`、`build.log`、`installed-ui.log`、`tag-persistence.json`；安装截图`dist/sidebar225-ui-wHh7V6`。构建及门禁报告位于`/Volumes/project/临时文件/gitfinder-tag-selection-alpha228/dist`。旧alpha227备份：`/Volumes/project/制品与备份/GitFinder/2026-10-02-alpha227-before-tags228/GitFinder 2.app`。仅macOS arm64本机ad-hoc开发包，不代表公开发行或Windows验收。
