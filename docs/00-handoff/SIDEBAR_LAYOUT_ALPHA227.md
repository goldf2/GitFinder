# alpha.227 侧栏布局

用户要求左侧 Git 仓库、属性标签等区域可以调整顺序和高度；标签分维度后省略重复前缀；保留分类用于客户、专题等自定义组织。

## 范围

- 标题左侧常驻拖动手柄，支持拖动排序和上下方向键移动；沿用原顺序配置。
- 展开区域间增加可拖动分隔线，方向键微调、双击恢复默认比例，保存高度比例；折叠和切换视图时保留偏好。
- 标签分组下短名称沿用alpha226；“分类”标题说明为“自定义分类”，不改用户已有分组或标签数据。

基线alpha226 / e38d013。原有12项无关工作树修改已快照，单独暂存本轮增量。

## 早期验证记录

全量初检1460测试、311JS通过。首次短窗口验收发现标签内容空间不足，已提高最小可用高度；拖动专项与最终安装尚待完成。仅本机macOS开发包，用户验收pending。

## 源码验证记录

最终源码检查1460/1460、311JS通过；25项交互通过，含真实拖动排序、高度调整、键盘焦点、折叠后余下区域填满、文件浏览切换及重启记忆。证据`dist/sidebar-layout-alpha227/source-check-final.log`、`source-ui-pass.log`；截图`dist/sidebar225-ui-58UDfv`。

验证期间修复标签区域最小空间与分隔线焦点；保存比例采用大于等于1的flex权重，避免只剩一个区域时留白。拖动测试补齐鼠标按钮状态，重启断言改为按键比较比例，避免JSON键顺序造成假失败。安装与推送待完成。

## 最终交付

运行源码`831a43c7a9e28ed6874942237a2f5e1df8778e87`已推送并核对origin/main。干净源码再次通过1460/1460测试、311JS检查，macOS arm64 DMG/ZIP与开发包门禁通过。安装`/Applications/GitFinder 2.app`版本alpha.227，隔离配置25项交互及重启检查通过；原用户界面实际拖动高度与双击恢复正常，已恢复原顺序和默认高度。58仓库原有及新增标签关联重启核对保持，用户同时新增的标签保留。

证据：`dist/sidebar-layout-alpha227/clean-check.log`、`build.log`、`installed-ui.log`、`tag-persistence.json`；安装截图`dist/sidebar225-ui-pbn5uE`。构建产物及门禁报告位于`/Volumes/project/临时文件/gitfinder-sidebar-layout-alpha227/dist`。旧alpha226可恢复备份：`/Volumes/project/制品与备份/GitFinder/2026-10-02-alpha226-before-layout227/GitFinder 2.app`。

原9个无关文件逐字节保持，共享3个交接文档只提交本轮块/追加。仅本机ad-hoc开发包，无Windows运行验收或公开发行。用户验收pending，GF-DATA-001不自动启动。
