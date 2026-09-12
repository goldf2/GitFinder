# alpha.141 象数面板独立视图

2026-09-12 +08:00。

## 已确认范围

用户要求把 `https://panel.xiangshu.me/` 作为 GitFinder 中与关系白板并列的独立视图。本次放开旧的“不嵌入 Panel 页面”限制，但不复制网站实现、不代理或改写网站响应、不读取网站凭据，也不改变原有只读 Coolify 数据链路。

## 实现

- 工作区视图菜单新增“象数面板”，支持标签模式保存与恢复。
- 页面在主区域显示，两侧辅助栏临时隐藏，返回其他视图恢复既有布局；目录导航在此模式禁用。
- 首次进入才加载 sandbox iframe；切换视图不销毁页面。提供重新加载和浏览器打开按钮。
- 远程 iframe 不获得应用 preload 权限；不允许顶层导航。来自面板的受支持弹出网页交给系统浏览器，不创建带本地权限的窗口。
- 页面本身的数据、身份验证和状态由网站负责；iframe load 不被表述为同步成功。

## 验证

- 公开页面 GET/HEAD 正常，未观察到阻止 iframe 的响应头。
- 开发版隔离目录 `/tmp/gitfinder-panel-qa.GqsHBs`：实际显示面板 35 条资源；搜索 casdoor 得到 1 条；切到关系白板再返回，搜索条件及结果保留。现场未出现登录要求，未进行账户登录或服务器管理操作。
- `npm run check`：1127/1127 测试通过，259 个 JavaScript 文件语法检查通过。
- 第一候选安装版发现状态栏仍显示白板统计，已修复并重新打包；最终源码提交为 `364c1b5`（入口提交 `6a3ab9f`）。
- 最终安装 `/Applications/GitFinder 2 Alpha141.app`，正常重开后恢复象数面板标签；实际显示 35 / 35 个资源、版本 alpha.141、独立状态栏。第一候选安装版还完成站内搜索与实际截图确认；跨视图保留搜索已在开发版验证。
- `codesign --verify --deep --strict` 通过；安装与最终构建 ASAR 的 SHA256 相同：`2830398c164fe8236713ba75dc37d5e39f802f343d8f53e7c3d1ce3a056f9220`。
- 最终开发包：`/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.141/GitFinder-2-2.0.0-alpha.141-arm64-mac.zip`，SHA256 `fdd8e04fa2bcb2256f5c47f0dd23cbf29de507df9f508d9f62457a5b991ce51f`；同目录包含 release-verification.json，门禁无问题。ad-hoc 签名，不是商店公开发布。
- alpha.140 保留在原 Applications 路径；第一候选 alpha.141 备份到 `/tmp/gitfinder-panel-build.Nf7C4l/first-candidate.app`。未删除用户白板、项目或配置。
- 尚未验证需要身份认证的站点登录流程；本次页面未要求登录。未执行服务器管理、分类或备注修改。

## 主要文件

`src/renderer/index.html`、`src/renderer/scripts/app.js`、`src/renderer/scripts/workspaceTabs.js`、`src/renderer/scripts/directoryNavigationController.js`、`src/renderer/styles/content.css`、`main.js`、`test/xiangshu-panel-view.test.js`。
