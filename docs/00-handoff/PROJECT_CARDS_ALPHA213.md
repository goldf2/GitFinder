# alpha.213 项目卡片与类型入口

任务：GF-PROJECT-213。项目列表的长简介、不同仓库数量造成卡片和操作栏错位，文件夹右键缺少直接分类入口。

## 实现

- 卡片简介按小/中/大档展示2/3/4行，完整内容保存在项目中并可悬停查看。仓库预览固定区域，最多2项并保留总数及剩余数量。卡片与三枚底部按钮对齐。
- 文件夹右键新增“项目类型…”，项目设置提供类型勾选。普通文件夹在保存时建立项目身份；分类更新仅调整当前项目ID，保留其他项目成员，取消不写入。

## 验证与当前边界

- 修改前已安装版的7张交易卡片高度157–208px，右键类型入口不存在；见本机dist/project-cards-alpha213/baseline-ui.json。
- 源码17项Electron UI检查通过：1560/900/620px × 三档尺寸，按钮无裁切；简介全文、仓库计数、右键入口、分类保存/重开/取消、普通文件夹创建，以及不执行Git初始化、不移动目录。
- 全量1426/1426测试、299JS语法及handoff检查通过。首次检查的台账符号链接断言因macOS临时目录/var与/private/var别名失败；设置TMPDIR=/private/tmp后该专项11/11及全量通过，未修改无关实现。
- 本机证据：dist/project-cards-alpha213/check-realpath.log、source-ui.log及dist/project-cards-ui-MpkSRK。
- 构建、安装及推送待完成。原有12项未提交内容备份至dist/project-cards-alpha213/baseline。
