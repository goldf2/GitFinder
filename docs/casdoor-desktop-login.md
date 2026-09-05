# GitFinder 桌面端 Casdoor 登录

## 使用入口

应用设置 → 账户 → 登录 / 注册。认证在系统浏览器完成，回调后返回 GitFinder。
不登录、认证服务断网或会话过期，都不影响本地目录、Git 和关系白板。
本轮只提供账户会话，不上传项目、Coolify 配置或本地文件，不包含云同步与协作。

## 管理员配置

1. 准备可用的 HTTPS Casdoor 服务，确认 `/.well-known/openid-configuration` 能正常返回。
2. 新建独立 Application，例如 `gitfinder-desktop`，绑定所需 Organization。
   不要复用软件商店的服务端 Client ID/Secret。相同技术栈不强制共享账户：组织与产品边界由管理员决定。
3. 启用 Authorization Code、S256 PKCE，以及需要的登录/注册方式。
4. 精确登记回调地址：`http://127.0.0.1:43821/oauth/callback`。
   Casdoor 会比较端口；本机端口被占用时应用会提示重试，不使用通配回调。
5. 需要刷新会话时启用 Refresh Token，并配置合理的刷新有效期。
6. 在 GitFinder 账户页的服务配置中填写 HTTPS issuer 和公开 Client ID，保存后登录。
   任何 Client Secret、管理员口令均不应填入桌面端。

默认候选地址是 `https://auth.oaktechz.com`，Client ID 留空，不能用示例名冒充真实配置。
2026-09-05 接入时该服务返回 503，尚无已确认的 GitFinder Client ID，因此生产登录待服务恢复后联调。

## 协议与存储边界

- 主进程通过 `openid-client` 执行 discovery、Code + PKCE、state/nonce/issuer/audience/过期检查、JWKS 验签及 userinfo 的 sub 一致性检查。
- scopes 为 `openid profile offline_access`；用于身份、昵称和刷新会话，不请求仓库或部署权限。
- 只有用户点击登录时启动本机 loopback HTTP listener；成功、取消、失败、超时、退出应用后关闭。
- renderer 通过受信任 IPC 获取账户摘要，不接收 access token 或 refresh token。
- `userData/account-session.json` 保存公开客户端配置，以及 Electron `safeStorage` 加密后的会话。加密会话绑定 issuer + client ID。
- OS 安全存储不可用或 Linux 退回 `basic_text` 时，会话仅留在内存，不明文落盘。
- 启动只读本地会话，不联网验证；过期显示需要续期，用户可刷新会话或重新登录。
- 退出本机登录清除 GitFinder 会话，不注销其它网站的 Casdoor 浏览器会话；再次登录允许切换账户。
- 修改认证地址或 Client ID 会清除原会话，防止跨服务混用令牌。

## 代码与验证

- `src/main/services/casdoorClient.js`：OIDC 协议适配。
- `src/main/services/accountService.js`：登录生命周期、回调、取消、刷新与退出。
- `src/main/services/accountStore.js`：加密存储。
- `src/renderer/scripts/accountController.js`：账户设置 UI。
- `main.js` / `preload.js`：受信任 IPC。

```sh
node --test test/account-service.test.js test/casdoor-client.test.js test/account-controller.test.js
```

协议测试运行真实 OIDC 库，使用模拟 issuer、签名 ID Token 与 JWKS，覆盖错误 state、nonce、issuer、audience、过期、伪造签名与错误 userinfo 主体。
真实 Casdoor 验收仍须完成：注册/登录 → 浏览器回调 → 昵称 → 重启本机恢复 → 刷新 → 退出 → 换账户，以及断网本地使用。

参考：[Casdoor OAuth/PKCE](https://casdoor.ai/docs/how-to-connect/oauth/)、[OIDC](https://casdoor.ai/docs/how-to-connect/oidc-client/)、[openid-client](https://github.com/panva/openid-client)。
