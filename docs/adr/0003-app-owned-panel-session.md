# ADR-0003：Panel 应用自有会话，不使用系统钥匙串

- 状态：已接受并实现
- 日期：2026-08-29

## 背景

早期 Alpha 使用 Electron `safeStorage` 保存 Panel 只读令牌，并开启 Cookie Encryption Fuse。macOS 会因此访问 `GitFinder 2 Alpha Safe Storage` 钥匙串项；ad-hoc 签名的指定要求绑定每次构建的 CDHash，更新后会再次要求授权，并可能在创建窗口前阻塞。

产品要求 GitFinder 自己保持 Panel 登录状态，不读取系统钥匙串，也不提取或保存用户密码。

## 决策

1. GitFinder 不提供 Panel 密码输入，不读取 macOS 钥匙串，也不调用 Electron `safeStorage`。
2. 用户为每个 Panel 地址提供由对应 Panel 签发、可撤销、最小只读权限的访问令牌。当前 API 将令牌直接作为应用会话凭据；后续 Panel 可用设备授权流程换取短期 access token 和 refresh token，而无需改变项目关联模型。
3. 多个 Provider 会话保存在应用用户数据目录的 `panel-session.json`，不进入项目目录、Git、日志、白板或导出文件。Panel 根地址规范化后派生稳定 `providerId`；重复添加同一地址会更新原会话。
4. POSIX 平台会话文件以 `0600` 原子创建；读取时如果组或其他用户拥有权限则拒绝使用。Windows 依赖当前用户 Profile 的 ACL，必须在真实 Windows 环境另行验证。
5. 会话文件不是系统级加密存储。设置页必须明确这一边界，并建议只使用短期、最小权限、可随时撤销的只读令牌。
6. Electron Cookie Encryption Fuse 关闭，避免 Chromium 在启动阶段访问系统钥匙串；GitFinder 不使用 Cookie 保存 Panel 登录。
7. 旧 `panel-provider.json` 中的 `encryptedToken` 不解密。应用只读取非敏感地址、名称和 Provider ID，显示“需要重新连接”；用户验证新令牌后才写入应用会话并移除旧配置。
8. “移除 Panel”只删除该 Provider 的应用会话；旧 Provider 配置在迁移后删除，项目中的非敏感 `.gitfinder/deployments.json` 关联保留并明确显示为暂不可用。
9. alpha.4 的单 `provider` 会话在首次读取时原子迁移为 alpha.5 的 `providers[]`，无需重新输入仍有效的令牌。

## 安全边界与后果

- 同一系统账户下可读取应用数据的恶意进程也可能读取会话令牌；这是不用钥匙串的明确代价，不能描述为“加密保存”。
- Panel 生产端应支持令牌过期、撤销、轮换、最小权限与审计，并禁止将密码直接作为 API Bearer 凭据。
- 应用公开的连接状态永不包含原始令牌；便携关联仍只包含稳定资源 ID 和 `repositoryId`。
- 正式分发签名仍然必要，它负责应用完整性与来源验证，但不再作为保持 Panel 登录状态的前提。
