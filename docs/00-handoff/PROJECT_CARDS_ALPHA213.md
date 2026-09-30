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
- 源码/构建 `6d14ac1ba6a90adaef6a3147dfb918aa4223855d`；独立克隆 `/Volumes/project/临时文件/gitfinder-project-cards-alpha213` 的全量1426/1426、299JS及 `npm run pack` 通过。DMG/ZIP与原生更新元数据通过 development 门禁。
- 安装 `/Applications/GitFinder 2.app`，版本2.0.0-alpha.213；codesign deep/strict通过，安装ASAR与构建一致。安装版隔离配置17/17项回归通过，证据 `dist/project-cards-ui-O9GHhh`、`dist/project-cards-alpha213/installed-ui213.log`。
- 原用户配置实际7张交易卡片在中档均为280.148px；同排操作栏对齐，右键类型入口存在。见 installed-real-medium.json/png；小档7张均为157.094px。测试后恢复用户小档偏好，已退出调试启动并以普通open启动，新进程无额外参数。
- 源码已推送origin/main，git ls-remote返回完整构建commit。用户验收仍pending，仅macOS本机ad-hoc开发包。
- alpha.212可恢复备份 `/Volumes/project/制品与备份/GitFinder应用备份/2026-09-30-alpha212-before213/GitFinder 2.app`，额外同盘备份 `/Applications/.GitFinder-2-alpha212-backup.app`。初次跨卷rename因EXDEV失败，旧App未变；误启动旧包的fixture失败记录保留，改为同盘替换后完整新版回归通过。普通open首次紧接quit因旧进程未完全退出返回-600，随后正常打开通过。
- 原有12项未提交内容备份至dist/project-cards-alpha213/baseline；9无关文件字节不变，3共享文档仅提交本轮有效块/追加。项目类型成员、标签定义与分配集合、已存白板和交易项目manifest保持；启动自动重绑定使repoTags键变化，窗口/浏览位置及根展开状态随用户操作变化，未宣称整个config/tags字节不变。
