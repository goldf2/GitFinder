# alpha.216 嵌套项目与粗分类

项目按业务用途组织，可跨真实目录组合、继续包含子项目；Git仓库仍保留真实身份。项目类型采用粗粒度，不要求对目录全覆盖。

## 实现

- 复用本地projectGroups持久化集合关系；支持新增大项目、名称/简介/成员/类别编辑、解除合并。全部可从前端处理。
- 首页只显示顶层项目；点击项目进入直接子项目；左侧树展开同一层次。查看仓库汇总全部后代并去重。
- 子项目继承父项目类别，仓库按所属顶层项目类别筛选。拒绝自身/祖先循环；拆分嵌套项目时成员回到父级，删除根集合后成员恢复独立。
- 逻辑项目没有虚构磁盘路径，不创建快捷方式、不迁移文件或修改Git；暂时不可用的成员引用保留。

## 已应用的选择性归并

粗类别：业务系统、内容创作、研发工具、投资研究。

9个顶层项目：在线商城、制造管理、现场作业、AI内容生产、何晴纪念与资料、股票研究、数字资产研究、GitFinder系列、空间桌面。

其中在线商城→OakTech商城与交付；制造管理→制造执行MES/ERP与物料管理；何晴纪念与资料→何晴纪念馆/何晴资料站。36个现有项目合并显示，50个先保持独立，首页59项；不建立其它兜底。只写本机集合配置，86个项目身份和物理目录保持。

## 验证与交付状态

- 源码：1439测试、301JS检查通过；33项隔离界面检查通过，覆盖标题、导航、嵌套创建/编辑/循环拒绝/取消/拆分/仓库汇总。
- 隔离截图已查看，左侧层级、图标和主区一致。证据dist/project-collections-alpha216/source-check.log、source-ui.log及dist/project-collections-ui-pgf5lj。
- 应用前已核对原分类与备份一致；分类通过应用自身配置接口保存，36个成员清单字节未变。
- 源码、干净构建、安装界面、真实配置应用与推送完成。用户验收pending。未启动Windows/商店正式发布。

## 最终安装与真实数据

- 源码提交：`0d16d2136c90dc2f22514681374c0a2b527bbdd6`；已推送origin/main。
- 干净构建目录：`/Volumes/project/临时文件/gitfinder-project-collections-alpha216`。1439测试/301JS、arm64 DMG/ZIP开发产物门禁通过。
- `/Applications/GitFinder 2.app`版本2.0.0-alpha.216，codesign验证通过，ASAR与干净产物一致：`0eb52ce990c2768533a712c3e869f3928aa83eac629760b4b4b016e3c4923644`。
- 安装版33项实际窗口检查通过；17项卡片/分类回归通过。隔离界面截图已查看：`dist/project-collections-ui-MUXVeO/nested-projects.png`。
- 实际用户数据86个原项目；顶层59项，其中9个大项目，另有5个嵌套集合；类别为业务系统24、内容创作10、研发工具23、投资研究2。未强制归并50个独立项目。
- 真实商城→OakTech商城与交付→2个成员层级可见，汇总仓库为saas_oaktech和recharge-platform；全局仍58仓库，投资研究左右筛选4/4一致。
- 重启后4类别/59卡片/9顶层集合保持。最终已恢复普通启动，无远程调试参数。
- 证据：`dist/project-collections-alpha216/{clean-check,build,installed-ui,source-cards}.log`、`{applied-real-data,real-ui,real-repositories,reopen-proof,install-proof}.json`，目视截图`real-nested.png`。

## 恢复与边界

- alpha.215应用备份：`/Volumes/project/制品与备份/GitFinder应用备份/2026-09-30-alpha215-before216/GitFinder 2.app`；同卷保留`/Applications/.GitFinder-2-alpha215-backup.app`。
- 分类备份：`/Volumes/project/制品与备份/GitFinder配置备份/2026-09-30-alpha216-project-hierarchy/`，含before/after、成员清单与36个原项目配置。恢复归属应通过配置接口只写projectGroups，避免覆盖账户等无关设置。
- 本轮只修改GitFinder的逻辑归属，未移动项目目录、新增物理快捷方式或改写成员Git历史。原9个无关dirty文件字节保持，3个共享交接文件仅提交本轮有效块/日志追加。
- 剩余50项暂保持原样；用户验收pending，后续分类调整从前端项目设置完成。
