# GitFinder 登录兼容修复（alpha211）

## 问题

安装版的账户存档曾保存临时 Xiangshu Issuer `qtk…xiangshu.me`。该地址的 OIDC Discovery 当前返回 HTTP 503；`accountService` 启动时会离线恢复已保存配置，因此它会覆盖源码中的当前默认 Issuer `https://casdoor.xiangshu.me`，登录界面最终只显示泛化的认证服务连接错误。

## 修复

- `accountService` 识别旧版临时 Xiangshu 域名（仅匹配 20–32 位随机子域名）。
- 旧地址创建 OIDC 客户端或生成授权 URL 失败时，使用相同公开 Client ID 重试当前默认 Issuer。
- 新授权 URL 创建成功后，把新 Issuer 写入账户配置并清除旧的本机会话；其他自定义认证服务不会被改写。
- 新增回归测试覆盖失败重试、配置迁移和持久化。

## 验证

- `node --test test/account-service.test.js test/casdoor-client.test.js test/account-controller.test.js`：31/31 通过。
- 当前 `https://casdoor.xiangshu.me/.well-known/openid-configuration`：HTTP 200，支持 S256、Authorization Code、Refresh Token。
- 使用本机已保存的公开 Client ID 做只读 smoke：旧 Issuer 503 后自动切换到 `casdoor.xiangshu.me`，生成授权 URL 并监听本机回调；未输入或保存账号密码、验证码或 Token。

## alpha211 交付验证

- `npm run pack`、源码/产物 development 门禁、`codesign --verify --deep --strict` 通过。
- alpha211 已安装到 `/Applications/GitFinder 2.app`，`CFBundleShortVersionString=2.0.0-alpha.211`；alpha210 已备份到 `/Applications/GitFinder 2 Alpha.archive/GitFinder-2-alpha210-before-alpha211-20260921-073130.app`。
- 安装包 ASAR 已回读确认包含迁移代码，进程正常启动。当前 macOS 屏幕处于不可见/锁定状态，未把截图当作可见 UI 验收证据。
- 全量 `npm test`：1415/1416 通过；唯一失败是既有 `repository-task-ledger` 测试在 macOS `/var` 与 `/private/var` 路径别名下的断言，与登录改动无关。

真实注册、登录回调、刷新、退出和 Casdoor 邮件验证码仍需要用户自行输入账号并在服务端绑定 Email Provider 后验收。
