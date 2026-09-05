# GitFinder 2 研发会话记录

## 2026-09-05 18:58:00 +0800 · 横向登录 Logo 图标缺失修复

- 现象：横向 Logo 导出后只剩“GitFinder 2”文字，图标消失。
- 根因：SVG 通过外部 HTTPS 图片地址引用图标，导出工具不加载该资源，导致图标变成空白。
- 修复：将 `public/icon-master.png` 以 data URI 内嵌到 `public/branding/gitfinder-2-logo-horizontal.svg`，重新渲染 `public/branding/gitfinder-2-logo-horizontal.png`。
- 验证：`xmllint` 通过；PNG 为 1600×400 RGBA，用图像查看确认图标与文字同时存在。

## 2026-09-05 17:21:05 +0800 · GitFinder 邮箱验证码报错复现

- 注册页点击获取邮箱验证码后，Casdoor 显示：“请添加一个 Email 提供商到应用 `gitfinder-desktop` 的提供商列表”。
- 结论：注册字段可见、创建全局提供商、将提供商绑定到应用是三个独立配置层；当前确定缺少第三层。全局 Email Provider 的保存和 SMTP 可用性仍待复核。
- 注册页同时仍将 Phone 和手机验证码显示为必填流程；如无 SMS Provider，即使邮件发送修复，注册仍可能被手机验证阻塞。
- 本次仅记录实际报错与根因，未修改认证配置，未提交凭据或用户注册数据。

## 2026-09-05 13:38:45 +0800 · GitFinder 邮箱注册能力核查

- 用户提出“需要添加邮箱”。Casdoor 管理页只读复核确认：`gitfinder-desktop` 的 Email 注册项已经可见且必填，Phone 同样可见且必填；`gitfinder` 组织“邮箱作为用户名”仍关闭。
- 全部提供商列表当前仅有 Captcha、Balance、Dummy Payment，没有 Email Provider；应用提供商页只绑定 Captcha。注册页面已有邮箱验证码界面，但缺少实际邮件发送通道。
- 未创建或保存邮件提供商，未填写 SMTP/API 凭据，未修改组织或应用认证策略。下一步由用户确定邮件服务；敏感凭据由用户输入，完成连接测试后再绑定应用并做真实验证码/注册验收。
- 本轮没有修改产品源码、版本、构建或发布状态。

## GF-DRAG-20260905-05 · 解锁后交付续接

- 时间：2026-09-05 12:18:08 +0800。沿用已完成的 alpha.97 / ff5772a 构建，没有重复提交或打包。
- 完成可恢复备份、安装签名/ASAR/版本复核、隔离实例键盘联动(8,8)/外部分支零位移与重开保存验收；鼠标自动化未产生位移，不计通过。原配置已恢复，无调试参数运行。
- 已推送 ff5772a；源码和产物门禁证据沿用上轮。既有无关改动保留。
- 用户追加账户设置截图：代码确认 `gitfinder-desktop` 是 placeholder，默认公开 Client ID 为空，登录因此禁用；需实际 Casdoor 公共客户端配置，不把示例名当成真实 ID，未更改认证服务器。
- 只读实时核验：`curl --max-time 12 --silent --show-error --output /dev/null --write-out 'OIDC discovery HTTP %{http_code}' https://auth.oaktechz.com/.well-known/openid-configuration` 返回 HTTP503；当前登录不能用并非单纯临时 profile 缺配置。
- 下一步：用户现场确认鼠标拖动；认证按单独服务配置继续，不在本轮擅自创建客户端或填写凭据。

## GF-DRAG-20260905-05 · 跨主机拖动回归

- 时间：2026-09-05 10:04:49 +0800。
- 目标：定位用户 09:44 录屏中的异主机卡片联动，保留自身 Project 整体拖动。
- 已完成：视频帧核对、只读缓存/仓库目录复现、隐藏仓库传播边界修复；没有改动部署配置或来源连线。
- 证据：旧移动集合含 3 张异主机部署，新集合不包含；工作树检查 1038/1038 与 245 个 JS 通过。子代理独立复现与测试，主代理实现控制器修改。
- 10:48:36 +0800 续记：专项18/18，旧控制器2项预期失败；alpha.97 本地提交ff5772a、干净检查1035/1035/244JS及macOS打包通过。因 Mac 锁屏，未替换/安装验收/推送，已请求用户解锁。下一步从现有产物继续安装验收，无需重新提交构建。

## UI-20260905-01 · Apple/macOS 风格前端垂直切片

- 时间：2026-09-05 00:34:04 +0800
- 目标：统一应用外壳、侧边栏、设置页和通用工具条的 Apple 风格视觉与交互状态，同时保持业务行为不变。
- 实际完成：新增单入口、三模块的界面基础层并接入正式 renderer；覆盖浅/深色材质、系统排版、圆角层级、焦点/按压/禁用反馈和辅助功能回退；从四份旧功能 CSS 中移除已被接管的视觉声明；新增静态回归测试。
- 改动文件：
  - `src/renderer/index.html`
  - `src/renderer/styles/apple-ui.css`
  - `src/renderer/styles/apple-ui/tokens.css`
  - `src/renderer/styles/apple-ui/app-shell.css`
  - `src/renderer/styles/apple-ui/settings-board.css`
  - `src/renderer/styles/main.css`
  - `src/renderer/styles/sidebar.css`
  - `src/renderer/styles/content.css`
  - `src/renderer/styles/relationships.css`
  - `test/apple-interface-foundation.test.js`
  - `test/settings-navigation.test.js`
  - `test/relationship-css-reuse.test.js`
  - `docs/00-handoff/CURRENT_STATE.md`
  - `docs/00-handoff/SESSION_LOG.md`
  - `docs/00-handoff/DECISIONS.md`
- CSS 复用：一组交互规则服务 10 类常用控件；一套层级材质服务应用外壳、设置、7 类菜单/弹层和 3 类白板浮动工具条。初版 711 行覆盖层收缩为 496 行模块源码，另删除旧 CSS 202 行重复声明，CSS 净新增 295 行。
- 验证：`npm run check` 通过（986/986）；隔离 Electron 浅色外壳与设置页、深色设置页、键盘焦点环及含临时节点的关系白板浮动工具栏目视通过；`git diff --check` 通过。
- 边界：未改白板业务、拖拽、连线、更新、认证、文件系统和发布流程；未碰本轮开始前及并行产生的更新、CI、README、Windows、原型和既有测试改动；未提交、未推送。
- 遗留：安装版/Windows、系统辅助功能开关、白板画布内容和其余业务页面仍需后续视觉验收；其余旧 CSS 的迁移应继续按视图小步进行。
- 下一步：在不混入发布改动的独立切片中，优先检查仪表盘和开发任务页面，并在系统“减少动态效果/减少透明度/增强对比度”条件下完成截图验收。

## QA-20260905-02 · “文件浏览”视图切换安装版复测

- 时间：2026-09-05 05:50:21 +0800
- 用户现象：录屏中从“关系白板”菜单选择“文件浏览”时，被一个 `127.0.0.1:4319` 启动失败弹窗打断。
- 核对结果：弹窗属于独立的“视频提示词工作台”，不是 GitFinder 的文件浏览服务。
- 安装版验证：`/Applications/GitFinder 2 Alpha87.app` 版本 `2.0.0-alpha.91`；在关系白板中打开视图菜单并选择“文件浏览”，一次切换成功，左侧目录树和 `/Volumes/project/项目` 内容列表正常显示；`node --test test/finder-toolbar.test.js` 14/14 通过。
- 代码处理：未复现 GitFinder 缺陷，未改动源码、版本号或发布产物。
- 状态：已验证；如后续在无其他系统弹窗时仍发生，需使用当时安装版再录屏并记录版本标识。

## BUG-20260905-03 · 主机固定下级时 Project 几何回弹

- 时间：2026-09-05 06:41:29 +0800
- 用户现象：开启“固定下级”后拖动主机，Project 容器表现为被固定/牵扯，关联分支不能保持拖动结果。
- 根因：联动拖动写回后，`_displayGeometryMap()` 立即对所属 Project 重新执行自动排列，把移动成员拉回，并连带改写容器几何。
- 修改：部分联动时冻结 Project 当前显示框与所有成员几何，跳过该 Project 的自动装箱与服务器树位移；开关切换前物化受影响几何；补充“解除固定”可见状态。
- 测试：`npm run check` 988/988 通过，236 个 JavaScript 语法检查通过；联动拖动专项 12/12 通过，覆盖完整显示几何 → React Flow 拖动 → 写回 → 再显示链路。
- 发布：版本 `2.0.0-alpha.92`，提交 `e8c53e7`，已推送 `origin/main`；已从该提交隔离构建、备份旧版、替换并启动本机安装版。
- 安装版验收：已确认版本与白板加载；后台访问点检测持续刷新辅助功能树，本轮 UI 自动化未能稳定抓取卡片执行拖动，待用户现场确认后再归档全局修复报告。

## 2026-09-05 07:32:50 +0800 · 检查并优化 GitFinder

- 目标：按可复现问题做小范围优化，保护工作树已有 Apple 界面、更新与 CI 改动。
- 实际完成：定位并修复目录树和白板异步刷新竞态，新增五项回归，隔离 Electron 鼠标交互验证通过，版本递增至 alpha.93。
- 文件与证据：见 GF-ASYNC-20260905-02；已有未提交变更继续原样保留。
- 交付：从 `1d7704e` 干净工作树全量检查、macOS 打包与门禁均通过；本机可恢复替换完成，隔离安装版目录、键盘移动、缩放、保存重开通过。已推送 `main`。证据与原生鼠标自动化限制见 CURRENT_STATE。
- 接续：用户大白板体验确认；已有未提交 Apple 界面与更新/CI 变更保留给各自后续任务。

## 2026-09-05 07:52:07 +0800 · Project 跟随上级拖动

- 目标：按用户最新要求，让启用固定下级的上级整体带动关联 Project 容器，保持成员和几何。
- 完成：GF-DRAG-20260905-03；控制器、联动回归及 package/锁文件共四个提交文件，已有无关修改保留。
- 验证：专项 15/15，干净提交工作树全量 991/991、235 个 JS 语法检查与 renderer 构建通过；macOS 制品门禁、安装代码一致性与签名通过；安装版鼠标同位移、尺寸/成员保持和正常重开持久化通过。
- 交付：alpha.94，提交 `b3d2e29a0587c63defe44e97abbd08c0a2889c52`，已推送 origin/main；本机应用已替换，alpha.93 可恢复备份与制品路径见 CURRENT_STATE。
- 边界：隔离测试配置与模拟关系，未修改用户原配置；已退出测试实例；本轮未公开发布或构建 Windows。
- 接续：等待用户真实白板体验反馈；确认有效后归档 GF-DRAG-20260905-03 修复报告。

## 2026-09-05 08:20:37 +0800 · 可选 Casdoor 登录与连线粗细

- 目标：添加可选 Casdoor 登录，并响应本轮新增的连线粗细设置；不实现云同步，不强制账户共用，不混入原有未提交 Apple/CI/更新工作。
- 完成：主进程 OIDC 适配、loopback 生命周期、系统加密会话与安全 IPC；账户设置入口；当前白板线宽持久化和所有连线样式复用。公共配置、协议与存储边界见 `docs/casdoor-desktop-login.md`。
- 验证：账户 30/30、白板 79/79、干净提交全量 1022/1022、242 个 JS 语法检查。第一次干净检查因 Electron 懒初始化在并发测试中争抢解压路径失败；运行时安装完成后复测通过，不修改业务代码绕过。表单样式经安装截图反馈补齐复用，设置专项 16/16 和最终包通过。
- 安装版验证：真实 SVG 1.7px→3.2px，退出重开仍3.2px；账户未配置禁用、可见回调/表单、默认本地使用通过。测试用隔离配置与合成白板，结束后恢复普通启动。证据见 CURRENT_STATE 指向的目录。
- 发布：alpha.95，`7b86880` + `4d27997`，已推送 origin/main；macOS 本机已替换且旧 alpha.94 可恢复，未发布商店/Windows。
- 阻塞：auth.oaktechz.com 根路径和 discovery 为503，无真实 GitFinder Client ID；生产登录/注册未验收，等待用户确认现有服务地址及管理员配置。下一步只推进该服务/客户端配置，不自动创建另一套认证平台。

## 2026-09-05 09:43:13 +0800 · 复用访问点显示规则

- 目标：域名绑定两个部署时，访问点浮动、连线变红、左上角显示警报。
- 完成：GF-ENDPOINT-20260905-04；子代理负责跨来源投影，主代理负责归属、控制器、集成与安装验收。保留既有下级联动、布局维度独立和警报样式，不改部署配置。
- 验证：工作树1037/1037；干净发布提交1032/1032、244个JS语法检查与打包门禁；安装版警报展开、容器拖动、退出重开通过。证据见 CURRENT_STATE。
- 交付：alpha.96 / c447cdc，已打包替换本机并推送，旧alpha.95可恢复。用户原工作区已普通启动恢复；未进行Windows构建或商店公开发布。
- 下一步：等待用户现场确认，再归档支持文档修复报告。

## 2026-09-05 12:43:43 +0800 · Casdoor 独立应用配置准备

- 用户要求代为创建 GitFinder 登录应用，并明确账户独立管理，见 GF-AUTH-20260905-01。
- 浏览器草稿：现有 Add application 页面 `applications/built-in/application_7zl095#oidc-oauth`，名称已填 `gitfinder-desktop`、显示名 `GitFinder 2`、类型 Native；回调已通过辅助功能 setValue 精确填入 `http://127.0.0.1:43821/oauth/callback` 并读回确认。仅为未保存草稿，URL 的 built-in 不是最终组织选择。
- 未完成：独立组织创建/绑定、授权类型缩减为 authorization_code 与 refresh_token、保存后获取公开 Client ID、本机 App 配置、真实注册/登录/刷新验收；没有保存应用，没有复制 Secret，没有修改其他认证应用。
- 核对：可用 Casdoor 根 issuer 为当前 UI 所在 `https://qtkqgiprku5ccvlzemjhz57j.xiangshu.me`；此前正式域名 auth.oaktechz.com 为 503。只读子代理已确认公开 discovery 的 S256、Code/Refresh、所需 scope 与 RS256；正式域名未修复。
- 操作限制：Chrome 标签页持续被其他操作切换，最后停在 Chrome 原生菜单；专用标签控制连续超时。为避免写错目标暂停 UI 操作，保留原草稿，不绕过浏览器控制读取 Cookie 或生产凭证。
- 下一步：用户暂停并行 Chrome 操作后继续原草稿，按独立组织配置；启用新登录访问权限时请求一次明确确认。输入新账户密码/验证码等由用户完成。此轮仅保存交接记录，未完成配置，未触发版本、打包或发布流程。

## 2026-09-05 13:20:31 +0800 · Casdoor 独立应用与本机入口完成

- 用户在创建持久 OAuth 访问前明确回复“确认”。在现有 Casdoor 创建并验证独立组织 `gitfinder`，随后保存 Native 应用 `gitfinder-desktop`（显示名 `GitFinder 2`）。
- 保存前核对组织、名称、显示名、Native 类型和唯一回调；OAuth 授权类型收紧为 `authorization_code`、`refresh_token`，Access Token 使用 JWT/RS256。Casdoor 自动生成公开 Client ID；Client Secret 未复制或写入桌面端。
- 在本机 `/Applications/GitFinder 2 Alpha87.app`（界面版本 `2.0.0-alpha.97`）的账户设置中配置当前可用 issuer 与公开 Client ID，界面显示“配置已生效；旧本机会话已清除”，登录按钮从禁用变为可用。
- 安装版点击“登录 / 注册”后成功打开 `GitFinder 2` Casdoor 页面；请求包含 S256 PKCE、`openid profile offline_access`、正确公开 Client ID 和 `http://127.0.0.1:43821/oauth/callback`，未出现无效客户端或回调错误。
- 边界：正式 issuer `auth.oaktechz.com` 仍未恢复，本机暂用当前可用 Casdoor 地址；真实注册/登录、回调令牌、刷新和退出需用户输入账号/密码/验证码后继续。此轮只改 Casdoor 运行配置、本机偏好与交接文档，没有改产品源代码、版本、构建或发布。

## 2026-09-05 18:02:00 +0800 · 目录工具右键与设为项目入口修复

- 目标：修复目录内容条目不能打开右键快捷菜单、右侧详情“设为项目”按钮无效的问题。
- 完成：`file-context-menu` 改为绑定内容区并覆盖带路径的图标/列表/分栏/虚拟条目；动态详情按钮增加直接路径回调；新增详情按钮回归测试。
- 验证：`npm run check` 通过（1041/1041 测试、245 个 JavaScript 文件语法检查、renderer 构建）。
- 版本：`2.0.0-alpha.98`；已完成 macOS development 打包、本机替换和安装版交互验收。选中目录后右侧“设为项目…”可打开项目设置，右键菜单正常出现并包含该动作；提交 `e401c41cf717de7bf6c4d03bd5f73de6168bcb20` 已推送 `origin/main`。
- 遗留：用户原工作树中既有 Apple UI、更新、CI、Casdoor 和发布文档修改继续保留，未混入本次修复范围。

## 2026-09-05 20:58:00 +0800 · 左侧位置树右键与设为项目入口修复

- 目标：修复用户截图中左侧“位置”目录树节点右键无响应、无法从该处设为项目的问题。
- 完成：目录树节点增加 `data-type="directory"`；右键菜单同时绑定中间内容区与左侧 `#sidebar-tree`，项目动作直接使用树节点的真实路径。
- 验证：`npm run check` 通过 1041/1041 测试、245 个 JavaScript 文件语法检查和 renderer 构建；安装版 alpha.99 实际右键 `output` 节点可打开“设为项目”窗口。
- 交付：提交 `79ce5778980d3c9a56d8e9414d6971ad84c148f8` 已推送 `origin/main`；本机 `/Applications/GitFinder 2 Alpha87.app` 已替换为 alpha.99。

## 2026-09-06 03:38:00 +0800 · 资源库摘要预览与项目颜色

- 目标：点击左侧资源库的白板文件、项目或 Git 仓库时，让右侧摘要面板显示对应内容；仓库列表中的项目目录使用项目颜色。
- 完成：资源库条目增加统一选择路由和摘要预览；白板文件可直接打开，项目/仓库可添加到当前白板；已放置资源仍可定位到白板节点。Archify 架构节点使用只读详情面板。仓库路径与本地项目精确匹配后附加项目元数据并触发重新渲染。
- 验证：`npm run check` 通过（1049/1049 测试、250 个 JavaScript 文件语法检查、renderer 构建）；资源路由、架构投影和项目颜色均有回归覆盖；`git diff --check` 通过。
- 交付：版本升至 `2.0.0-alpha.102`，macOS arm64 development 包已构建并替换 `/Applications/GitFinder 2 Alpha87.app`，启动界面显示 alpha.102。待用户实际点击确认后归档修复报告。

## 2026-09-06 04:20:00 +0800 · 运行拓扑与代码架构独立范围

- 目标：解决代码架构与运行拓扑被合并为单一视图、全部项目同时显示的问题。
- 完成：`BOARD_LAYERS` 仅保留 `runtime` 与 `architecture`；旧 `merged` 读取时迁移为 `runtime`。新增当前白板 / 全部资源 / 主机 / Project / 部署 / 仓库范围，以及架构快照 / 边界 / 组件邻接范围，均保存于当前白板视图。
- UI：新增“范围”菜单；运行拓扑默认当前白板，架构默认当前 Archify 快照，架构边界可单独隐藏；共享主机和访问点不会因范围选择递归展开全部项目。
- 验证：`npm run check` 通过 1053/1053，251 个 JavaScript 文件语法检查和 renderer 构建通过；新增范围模型、投影与菜单回归测试。
- 接续：版本 alpha.103 打包、本机安装替换、版本核对后提交并推送；用户确认实际白板范围选择有效后，再归档修复报告。

## 2026-09-06 04:32:00 +0800 · alpha.103 构建与代码架构数据源核对

- 目标：把独立范围功能安装到本机，并核对“代码架构没有”的原因。
- 完成：`npm run pack` 成功；版本 `2.0.0-alpha.103`；制品已复制到 `/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.103/`；原 alpha.102 已可恢复备份；安装版已替换并启动。
- 证据：安装版 `CFBundleShortVersionString=2.0.0-alpha.103`；ZIP SHA-256 为 `90d7deb7f14a087c0862fa286ab2a1f7ebbedf11babd7c5a344a4aff6a7ba11d`；`relationship-boards.json` 当前白板为 architecture 层但 `architectureSnapshotId` 为空；本机仓库未发现 `.gitfinder/architecture/` 快照目录。
- 结论：代码架构入口已经在 alpha.103；当前为空是因为没有导入 Archify 快照，不是代码架构层被移除。仓库详情的“导入架构”会把 JSON 保存到仓库的 `.gitfinder/architecture/`，导入后再从白板“结构 → 代码架构”选择范围。
- 遗留：用户需要实际导入一个 Archify JSON 并确认快照、边界、组件邻接三种范围；确认有效后按规则归档修复报告。
