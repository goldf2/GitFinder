# alpha.226 多维属性标签

基线alpha.225 / 4379b9c。原有标签已经支持AND筛选，主区与分类成员共享结果；补维度展示、清除入口、最近列表过滤及从仓库详情进入筛选。用户要求补APP及平台标签，按源码证据追加，不删除原分类和标签。

## 交付结果

运行源码 `c23016d492e54045f21d2af035779ee2c8fa6316`，已推送并核对 origin/main。本机安装 `/Applications/GitFinder 2.app`，版本2.0.0-alpha.226。标签按名称前缀分维度，分组下仅显示简短名称；多选同时满足并可清除，详情标签入口保持可见，最近与分类成员同步筛选。

- 干净源码1460/1460测试、310JS通过，macOS arm64开发包门禁与签名验证通过。
- 安装版17项真实指针交互通过，含多标签AND、最近/分类联动、清除、详情跳转、标签维度、短窗口滚动及重开。
- 正常用户配置实际点击APP得到7个仓库，再点macOS得到6个；简短标签及选中状态已目测。
- 正常重启后按路径核对58个仓库，原标签定义、原关联及新增关联全部保持。

证据：`dist/tag-filter-alpha226/clean-check-delivery.log`、`build-delivery.log`、`installed-delivery.log`、`persistence-delivery.json`；安装测试截图：`dist/sidebar225-ui-3PoLex`。制品和门禁报告：`/Volumes/project/临时文件/gitfinder-tag-filter-alpha226/dist`。旧alpha225可恢复备份：`/Volumes/project/制品与备份/GitFinder/2026-10-02-alpha225-before-tags226/GitFinder 2.app`。

## 本机标签整理与边界

通过现有ConfigService追加，43→51个标签，新增102条关联，7个APP。平台标签依据构建配置或README声明，不代表所有平台运行验收或原型已发布。原标签与注册表备份`dist/tag-filter-alpha226/user-tag-backup`，逐仓库依据见本任务`outputs/GitFinder-标签整理.json`，结果见`GitFinder-标签整理完成.json`；原始用户数据不提交。

早期测试的标题、维度静态期望已同步；实际指针验收发现详情页入口隐藏后已修复并重打包。内部注册表读取会为无稳定Git身份项更换ID，最初按旧ID断言停止，改用路径核对后确认关联保持；未扩大注册表实现。全量检查使用`TMPDIR=/private/tmp`避开既有`/var`与`/private/var`路径别名断言问题。

仅本机ad-hoc开发包，未公开发行或验证Windows运行；用户验收pending。后续布局调整另记任务，GF-DATA-001不自动启动。
