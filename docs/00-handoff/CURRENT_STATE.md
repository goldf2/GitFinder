# GitFinder 2 当前状态

更新时间：2026-09-06 07:47:51 +0800

> 本文件是标准交接入口，记录当前工作树中已复核的最新事实。较早的项目过程与领域背景继续保留在 `docs/ai-handoff/`，不在这里重复复制。

## 当前交付：单白板双元素来源与 Coolify 同步稳态（alpha.105）

- 白板模型：白板本身是唯一画布 / 数据容器；运行拓扑与代码架构是可以同时放入白板的两类独立元素来源，不再作为互斥“数据层”切换。
- 菜单：移除“数据层 / 合并视图”，改为“运行拓扑”“代码架构”“布局”三个入口。运行拓扑入口承载资源结构、Project 分组、服务器树和拓扑范围；代码架构入口承载 Archify 快照、边界 / 组件范围和边界显示开关。
- 范围：运行拓扑默认当前白板，可显式选择全部资源、主机、Project、部署或仓库；代码架构默认当前快照，可显式选择边界或组件邻接。两类范围独立过滤，手工白板元素和两类元素可以共存。
- 兼容：旧 `view.layer` 与 `merged` 只用于读取迁移；旧白板不会因升级丢失，新增运行资源不再隐藏已有代码架构元素。
- Coolify：继续采用线上 Coolify 作为新鲜数据源；单实例失败合并该实例上一份无凭据缓存，全部失败时优先使用兼容缓存，不清空当前拓扑，并在状态中区分后台刷新与首次同步。
- 验证：`npm run check` 通过（1057/1057 测试、251 个 JavaScript 文件语法检查、renderer 构建）。新增同一白板双来源、菜单控件和范围过滤回归。
- 构建：版本 `2.0.0-alpha.105`；macOS arm64 development 包已构建并替换 `/Applications/GitFinder 2 Alpha87.app`。制品 ZIP SHA-256：`63100d51ddf0443885c5e59adcf5a2e78dffec729b72507fabd797d0aaa5a4af`；提交 `228b26160fecc052d1f4f8a90955edb7d924ef2d` 已完成本地提交。Mac 当前锁屏，安装版视觉 / 手势验收需用户解锁后进行；推送在文档收口后完成。

## 当前修复：资源添加与 Coolify 本地缓存同步（alpha.104）

- 资源添加：当当前白板处于“代码架构”层时，从资源库或仓库详情添加项目 / Git 仓库会先切换到“运行拓扑”层，避免资源已经写入却被架构投影过滤，看起来像添加无效。
- Coolify 同步：单个实例超时或失败时保留该实例上一次成功快照，同时继续展示其它实例的新数据；所有实例暂时失败但有本地快照时也返回可用的缓存拓扑，不清空白板。状态栏区分“后台同步中”和“首次同步中”。
- 本地 / 线上边界：线上 Coolify 是新鲜数据源，本地 `coolify-topology-cache.json` 是无凭据的可恢复快照；成功刷新才替换快照，失败不覆盖最后成功数据。缓存不等于线上已确认，节点保留陈旧标记与同步错误。
- 验证：`npm run check` 通过（1056/1056 测试、251 个 JavaScript 文件语法检查、renderer 构建）；新增运行资源添加回归和部分 Coolify 实例失败缓存回归。
- 构建：版本 `2.0.0-alpha.104`；macOS arm64 development 包已构建并替换本机安装版 `/Applications/GitFinder 2 Alpha87.app`。制品 ZIP SHA-256：`057a0f2a44946d51ae8d4b00fc1ff189962f19afdf50272c824c421d3ae1954e`。旧安装版已备份到 `/Volumes/project/制品与备份/gitfinder-2/installed-backups/alpha103-before-alpha104-20260906/`；构建为 ad-hoc 签名，仅用于本机验收。

## 当前交付：运行拓扑与代码架构独立范围（alpha.103）

- 产品调整：移除白板菜单中的“合并视图”。运行拓扑与代码架构是两套独立数据层；旧白板里的 `merged` 仅迁移为运行拓扑，不再写回或显示。
- 运行拓扑范围：默认当前白板；用户可显式选择全部运行资源、单台主机、单个 Coolify Project、单个部署或单个 Git 仓库。对象范围为根节点一跳关系，Project 容器继续包含其成员，避免共享主机/访问点把所有项目扩展开。
- 代码架构范围：默认当前 Archify 快照；可选单个目录/模块边界、单个组件及直接邻接组件，并提供“显示目录 / 模块边界”开关。架构卡片仍为只读。
- 交互：新增“范围”菜单，选择与快照/对象均持久化到当前白板；切换范围会清除不可见选择，但不修改运行事实、架构快照或资源库总览。
- 验证：`npm run check` 通过（1053/1053 测试、251 个 JavaScript 文件语法检查、renderer 构建）；新增 `test/relationship-board-scope.test.js` 覆盖迁移、拓扑范围和架构范围。
- 构建：版本 `2.0.0-alpha.103`；macOS arm64 development 包已构建并替换本机安装版 `/Applications/GitFinder 2 Alpha87.app`。制品 ZIP SHA-256：`90d7deb7f14a087c0862fa286ab2a1f7ebbedf11babd7c5a344a4aff6a7ba11d`。构建为 ad-hoc 签名，仅用于本机验收，不具备正式分发资格。
- 代码架构数据源：当前本机仓库尚未导入任何 `.gitfinder/architecture/` Archify 快照，因此切换到“代码架构”后会显示空画布；需在仓库详情点击“导入架构”，选择 Archify 生成的 JSON 后，才会出现快照、边界和组件范围。入口与范围控制已随 alpha.103 安装版生效。

## 当前交付：资源库摘要预览与项目颜色（alpha.102）

- 用户现象：在关系白板左侧资源库点击白板文件、项目或 Git 仓库时，右侧摘要面板没有对应内容；Git 仓库列表中的项目目录也没有显示项目颜色。
- 修改：资源库条目统一支持点击预览；白板文件摘要提供“打开白板”，项目/仓库摘要提供“添加到白板”，已在白板中的资源继续直接选中节点。架构快照节点使用只读摘要，不进入可编辑事实表单。
- 修改：仓库列表在本地项目路径精确匹配后附加项目元数据，沿用项目颜色标记；项目设置刷新后会重新装饰仓库列表。
- Archify：新增代码架构投影与只读数据层（运行拓扑 / 代码架构 / 合并视图），从仓库本地快照读取，不覆盖 Coolify 或本地扫描事实。
- 验证：`npm run check` 通过（1049/1049 测试、250 个 JavaScript 文件语法检查、renderer 构建）；`git diff --check` 通过。资源库点击路由和架构投影均有回归测试。
- 构建：版本 `2.0.0-alpha.102`；`npm run pack` 成功，macOS arm64 development 制品门禁通过。ZIP、清单和报告位于 `/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.102/`。
- 本机：`/Applications/GitFinder 2 Alpha87.app` 已替换并启动，界面显示 `v2.0.0-alpha.102`；安装 ASAR 与构建产物一致。当前为 ad-hoc 开发签名，未宣称可分发公证包。
- 待用户确认：请在已打开的关系白板中点击左侧“白板文件 / 项目 / 仓库”条目，确认右侧摘要内容和按钮行为；确认有效后再按规则归档修复报告。

## 当前修复：目录工具的右键菜单与“设为项目”入口（alpha.99，已交付）

- 用户现象：目录内容条目右键不出现 Finder 快捷菜单；选中目录后的右侧详情操作不可见或点击无效；“设为项目”无法打开项目配置。
- 根因：右键处理只在文档级监听具体卡片类名，虚拟列表/分栏等目录条目可能未命中；右侧详情按钮是动态插入的，但原来的 `[data-app-action]` 监听只挂在中间内容区，详情面板不在该区域内。
- 修改：右键监听改为绑定 `#content-area`，统一识别带 `data-path`/`data-type` 的目录条目并同步选中状态；详情动态按钮直接把目录路径交给 `openLocalProjectDialog()`。
- 回归：新增详情按钮点击测试；本次 `npm run check` 通过 1041/1041 测试、245 个 JavaScript 语法检查和 renderer 构建。
- 版本：`2.0.0-alpha.99` 已完成 macOS development 打包、本机替换和真实目录工具交互验收；提交 `79ce5778980d3c9a56d8e9414d6971ad84c148f8` 已推送 `origin/main`。
- 安装版验收：中间目录卡片和左侧“位置”目录树右键菜单均正常出现，并包含“设为项目…”；从左侧树节点执行该动作可打开对应路径的项目设置。

- 新增横向登录 Logo 资源：`public/branding/gitfinder-2-logo-horizontal.svg` 与 `.png`，文字为“GitFinder 2”，图标已内嵌到 SVG，PNG 为 RGBA 透明背景。之前只显示文字是因外部图标 URL 在导出时未加载，已修复为自包含图标。

## 当前配置：GitFinder 独立 Casdoor 登录入口

- 已在现有 Casdoor 创建独立组织 `gitfinder` 和 Native 应用 `gitfinder-desktop`（显示名 `GitFinder 2`），未复用 `oaktech-store` 用户池。
- 应用仅启用 `authorization_code` 与 `refresh_token`；回调精确登记为 `http://127.0.0.1:43821/oauth/callback`，Access Token 格式为 JWT、签名算法为 RS256。
- Casdoor 生成的公开 Client ID 已写入本机 alpha.97 的账户设置；未把 Client Secret 写入桌面端。当前使用可用 issuer `https://qtkqgiprku5ccvlzemjhz57j.xiangshu.me`，正式域名 `https://auth.oaktechz.com` 此前仍为 HTTP 503，待单独修复后再切换。
- 安装版已显示“配置已生效”，登录按钮可用；点击后成功打开 `GitFinder 2` 独立登录页，请求包含 S256 PKCE、`openid profile offline_access`、正确 Client ID 与本机回调，未出现 invalid client/redirect 错误。
- 邮箱现状已在 Casdoor 管理页复核：`gitfinder-desktop` 注册项中的 Email 已“可见 + 必填”，Phone 也仍为“可见 + 必填”；`gitfinder` 组织的“邮箱作为用户名”开关仍关闭。
- 17:21 注册页实际点击获取邮箱验证码后，Casdoor 明确报错“请添加一个 Email 提供商到应用 `gitfinder-desktop` 的提供商列表”。这证明应用级 Email Provider 绑定尚未生效；全局邮件提供商是否已保存、SMTP 凭据是否可用仍待管理页复核。
- 真实注册、账号密码登录、回调换取令牌、刷新与退出尚未执行；登录页已留给用户，账号、密码、验证码由用户本人输入。

## 当前修复：主机拖动通过隐藏仓库误带走其他主机部署

- GF-DRAG-20260905-05：09:44 录屏中 con01 拖动使另一主机 Project 内的部分部署移动、外框不动。用本机只读拓扑缓存加 repoRegistry 重建后，准确复现 3 张跨主机部署误入移动集合；没有连接远程服务器。
- 根因是物理成员中的隐藏仓库继承主机下级锁定，再沿 source_of/deployed_from 把另一主机同源部署带走。纯拓扑、不加载仓库目录的旧复现遗漏该路径。
- 已限制：仓库可以随容器移动，但只有从仓库本身发起的联动才继续沿仓库关系展开。主机/Project 的来源连线、实际部署关系和成员归属不变。
- 本机快照复测跨主机部署误移动数 3→0；新增主机/Project 两项回归在旧控制器准确失败，新控制器含直接仓库兼容回归 18/18 通过。干净发布提交检查 1035/1035、244 个 JS 检查与 renderer 构建通过。
- alpha.97 已本地提交 `ff5772a6be70f25764ebbf700d8783cd5c22bd79` 并从该提交完成 macOS development 打包，产物门禁通过；制品在 `/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.97/`。构建/日志在 `/Volumes/project/临时文件/gitfinder-drag-scope-alpha97.Fc22j5/`。
- 用户解锁后已可恢复备份 alpha.96、替换并普通启动 alpha.97，ASAR 与构建报告一致。隔离安装版键盘联动：本分支统一位移 `(8,8)`，异主机整条分支 raw/显示位移均为0，容器尺寸及归属不变；正常退出重开保持。原生鼠标自动化三次只选中、无位移，不计为鼠标验收通过，真实鼠标反馈待用户确认。
- `ff5772a` 已推送 origin/main；隔离实例已退出，无调试参数启动用户原配置，原目录/标签页/“部署关系”白板可见。证据：`/Volumes/project/临时文件/gitfinder-hidden-repo-drag-alpha97.ghPrjB/installed-before.json`、`installed-after.json`（键盘）、`installed-reopen.json`；README 标明实际验收方式。用户原白板未用于测试。
- 12:18 +0800 用户追加账户配置截图：源码确认 `gitfinder-desktop` 是 placeholder，不是实际保存的 Client ID；只读 GET `https://auth.oaktechz.com/.well-known/openid-configuration` 当前返回 HTTP503。认证服务仍未就绪，未改服务端或客户端配置。

## 最近交付：复用访问点浮动与警报（alpha.96）

- GF-ENDPOINT-20260905-04：已复现同 Project 多部署共用访问点仍被容器认领，以及跨 Coolify 来源按 providerId 拆分域名导致警报缺失。
- 已实现地址跨来源合并、独占部署才可归属 Project、星系布局共享访问点外置、旧快照/布局别名兼容、最新检测来源聚合；复用现有红线与左上角警报界面。
- 新增归属/旧白板三项回归先失败后通过；当前投影/警报/共享访问点专项 110/110 通过，linked-drag/server-tree/galaxy 等专项 44/44 通过。
- 工作树全量 1037/1037；发布提交的干净工作树 1032/1032、244 个 JavaScript 语法检查和 renderer 构建通过。macOS 打包、本机替换、正常启动和 origin/main 推送完成。规则见 `docs/shared-endpoint-behavior.md`。
- 安装版隔离白板：1 个浮动访问点、2 条实际 SVG 红线 rgb(217,72,95)、左上角警报 1 条可展开部署 A/B 详情。原生 CUA 拖动使容器 x=350→358、访问点保持 (774,490)；正常退出重开后坐标、红线、警报均保持。证据目录 `/Volumes/project/临时文件/gitfinder-shared-endpoint-alpha96.Llx2lL/`，含只读 CDP 记录 installed-before/after/reopen.json。
- 隔离验收已结束，无调试参数普通启动 alpha.96 并恢复用户原白板；用户实际冲突配置反馈尚待确认。原快照未被删除，测试未修改部署配置。

## 上次交付：连线粗细与可选 Casdoor 客户端（alpha.95）

- 白板“显示设置 → 画布与关系 → 连线粗细”支持 0.8–5 px 实时调节，默认 1.7 px，保存到当前白板 `view.edgeWidth`。选中/告警保持加粗层级，摘要线保持更细；未改变关系事实。
- 设置第一项“账户”提供可选登录/注册、取消、会话刷新、重新登录、退出本机与独立公开客户端配置。采用系统浏览器 Code + S256 PKCE，主进程内 OIDC 校验/验签，令牌由 OS safeStorage 加密且不暴露给 renderer；启动只读本地，离线功能不受登录影响。
- **登录入口已配置，完整会话链路待验收**：独立组织和公共客户端已创建并写入本机 alpha.97，浏览器登录页已成功打开；账号注册/登录、回调换取令牌、刷新与退出仍需用户完成凭据输入后验证。配置步骤见 [Casdoor 桌面登录](../casdoor-desktop-login.md)。
- 验证：账户专项 30/30，白板专项 79/79；干净提交检查 1022/1022、242 个 JS 语法检查与 renderer 构建通过；表单样式收尾后设置专项 16/16 和最终打包门禁通过。
- 安装版实际操作验证：滑块键盘交互使真实 SVG stroke-width 从 1.7px 变成 3.2px；正常退出并重开后仍为 3.2px。账户入口、未配置禁用状态、配置字段和回调地址可见，表单复用既有设置样式。隔离 user data/模拟关系未修改用户白板或认证配置。
- 已关闭隔离验证实例，随后无调试参数启动正常用户配置；原工作区及白板正常显示，版本 alpha.95。证据目录 `/Volumes/project/临时文件/gitfinder-account-width-alpha95.0nIalV/`。

## 上一轮交付：Project 跟随上级（alpha.94）

- 用户最新要求 GF-DRAG-20260905-03 已完成：上级主机开启“固定下级”后，关联 Project 容器、全部物理成员及满足条件的外部访问点同位移；容器尺寸和成员相对位置保持不变。该要求替代 alpha.92 的容器原位语义。
- 移动依赖由未归档部署的实际主机关系与 groupId 派生，不修改来源事实或成员归属。共享容器随任一开启固定下级的关联主机移动，不反向带动另一主机；仍有静止部署的外部共享访问点保持原位。
- 回归先复现 5 项旧行为不符，再完成修复；联动拖动专项 15/15、发布提交干净工作树检查 991/991、235 个 JavaScript 语法检查和 renderer 构建通过。检查使用现有 GITFINDER_AUTHORITY_SOURCE 指向迁移后的本机适配器，不包含已有测试路径修改。
- 安装版鼠标拖动通过：主机、Project、两个部署和独占访问点位移均为 `(58.46, 36.92)`，无关主机位移为 0；Project 尺寸保持 `344 × 404`，成员归属不变。键盘联动及正常退出重开后的持久化同样通过。
- 验收对象为 `/Applications/GitFinder 2 Alpha87.app` 内的 alpha.94 实际安装代码；鼠标由 Playwright 连接临时本机调试端口驱动。该实例已退出，随后无调试参数普通启动确认保存结果，再退出隔离实例。CUA 拖动未产生坐标变化，不计作成功证据。
- 证据目录：`/Volumes/project/临时文件/gitfinder-project-drag-alpha94/`，包含 `installed-drag-verification.json`、`installed-drag.png`、`after-drag.json`、`check.log`。全部验收使用隔离 user data 和模拟关系，用户原有配置未修改。
- 工程交付完成，用户真实白板使用反馈尚未获得；用户确认有效后再归档支持文档修复报告。

## 历史工作树与交付（截至 alpha.99）

- alpha.99 时的提交为 `79ce5778980d3c9a56d8e9414d6971ad84c148f8`；当前 HEAD 与 origin/main 已由顶部 alpha.102 交付记录覆盖。
- alpha.99 时的源码、macOS 产物与本机安装版均为 alpha.99；当前安装版事实以顶部 alpha.102 记录为准。
- 本次仅提交隐藏仓库联动边界、回归、版本和规则文档；既有 Apple 界面、更新、CI、发布文档及测试等未提交工作原样保留。
- 制品：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.97/`；旧版备份：`/Volumes/project/制品与备份/gitfinder-2/installed-backups/alpha96-before-alpha97-20260905/GitFinder 2 Alpha87.app`。
- ad-hoc 开发包；安装 ASAR 与构建产物一致，签名验证通过。alpha.97 本轮未构建 Windows、上传商店或切换公开 current。
- 独立商店任务的最近记录：2026-09-05 07:48 alpha.93 的 GitHub 双平台构建与草稿上传已完成（Actions `33930396752`），当时公开 current 未切换，等待现有管理员登录；后续状态由该任务记录，不能视为 alpha.94 已公开发布。

## 上一轮检查与优化（alpha.93，历史验证）

- 目录树：使用渲染修订号忽略旧结果，并停止旧任务继续读取下级。慢读取中折叠目录/移除全部位置，不再被旧结果重新显示。
- 白板：刷新与缓存读取在等待后核对打开周期和拖动状态；关闭后旧响应不覆盖重开的白板，也不解除新请求占用；首次加载被拖动打断仍按原有 30 秒间隔重试。
- 五项新增异步回归均先复现失败、修复后通过。发布提交的干净工作树 `npm run check` 通过 988/988、235 个 JS 语法检查；使用既有 `GITFINDER_AUTHORITY_SOURCE` 指向迁移后的本机适配器，让权限测试实际执行且不提交已有路径修改。
- 同一提交的隔离 Electron 鼠标验证通过：快速展开/折叠保持折叠、过期任务无下级读取；拖动中完成模拟拓扑响应，模型重建次数为 0，拖动结束后下一次刷新正常应用。
- 安装版普通启动已确认版本、目录展开/折叠、白板显示、键盘移动、缩放、保存与重开；保存位置由 `(185,162)` 变为 `(193,170)`，缩放 `1.2`，退出重开后保留。安装 ASAR 与构建报告一致，签名验证通过。
- 安装版 CUA 鼠标拖动未产生坐标变化，因此该手势自动化结果不计作通过；真实鼠标与刷新并发验收来自同一发布提交的 Electron 开发实例。用户实际大白板体验仍待确认。
- 所有 UI 验收使用临时 user data、临时目录与模拟拓扑，未连接真实服务器或读取连接凭据；隔离验收实例已退出，用户原有配置未修改。
- 证据目录：`/Volumes/project/临时文件/gitfinder-inspection-alpha93/`；下一步见 [NEXT_ACTIONS.md](NEXT_ACTIONS.md)。

## 上一轮 Project 固定与下级联动修复（拖动范围已被新要求替代）

历史验证：

- alpha.92 当时让主机联动只移动部署与访问点、容器本身不动；2026-09-05 用户已明确要求 Project 跟随上级，该旧行为不再作为验收目标。
- 局部联动 Project 使用当前显示几何，不再被 Project 自动排列或服务器树避让二次改写，消除“容器像被锁死/分支回弹”现象。
- 开关启用后按钮文案为“解除固定”；直接拖动 Project 容器的原有行为不变。
- `npm run check` 通过：988/988 项测试、236 个 JavaScript 语法检查；关联拖动专项测试 12/12 通过。
- 安装版可见验证已确认 `v2.0.0-alpha.92` 和关系白板正常加载；由于后台访问点检测持续刷新辅助功能节点，自动化无法稳定抓取卡片完成安装版手势拖动，该部分仍待用户现场确认。
- 发布制品保存于 `/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.92/`；旧安装版备份保存于 `/Volumes/project/制品与备份/gitfinder-2/installed-backups/alpha91.VTp4Va/`。

## Apple 风格界面切片（已有未提交工作）

已验证：

- `src/renderer/index.html` 在既有 `theme.css` 后加载 4 行的 `styles/apple-ui.css` 单入口；入口按顺序导入 `tokens.css`、`app-shell.css` 和 `settings-board.css` 三个职责模块，单个模块不超过 212 行。
- `tokens.css` 提供系统字体、层级材质、圆角、阴影、焦点、按压、禁用、深色，以及减少动态、减少透明度和增强对比度回退；另外两个模块分别只负责外壳/侧栏与设置/白板 chrome。
- 应用顶部栏、标签栏、状态栏、侧边栏、关系白板顶部工具栏、设置导航/内容/表单/开关，以及常用浮动菜单和节点工具条共用上述基础。
- 已从 `main.css`、`sidebar.css`、`content.css` 和 `relationships.css` 删除 202 行被新模块接管的重复视觉声明，只保留布局和业务相关样式。新模块共 496 行，计入旧样式删减后 CSS 净新增 295 行。
- 没有修改白板数据模型、拖拽、连线、更新、认证、文件系统或发布逻辑。

## 验证证据

- `npm run check`：通过；构建 renderer、986/986 测试和 236 个 JavaScript 文件语法检查均成功。
- 隔离 Electron 实例：使用临时 user data 并关闭在线更新；目视通过浅色应用外壳与设置页、深色设置页、键盘焦点环，以及含临时文字节点与节点浮动工具条的深色关系白板。
- Apple 界面隔离实例已停止；该批未提交样式不在当前安装的 `alpha.95` 中。
- `git diff --check`：通过。

## 仍待覆盖

- Apple 界面切片尚未生成安装包，因此尚未做该界面切片的安装版和 Windows 实机视觉验收。
- `prefers-reduced-motion`、`prefers-reduced-transparency` 与 `prefers-contrast` 目前由静态回归测试覆盖，尚未在对应系统辅助功能设置下逐项截图。
- 仪表盘、开发任务、全部弹窗和大数据量白板未逐页目视检查。
- 白板画布内容本身、复杂节点卡片和领域可视化未重写；本轮仅统一外围 chrome 与通用交互态。
