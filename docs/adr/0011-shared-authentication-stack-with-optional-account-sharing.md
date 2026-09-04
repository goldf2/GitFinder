# ADR-0011：统一认证技术栈，账号共享按产品选择

- 状态：已接受
- 日期：2026-09-04

## 背景

多个网站、桌面 App、移动端和浏览器插件都需要登录能力。重复实现注册、密码、验证码、令牌刷新和退出会增加工期与安全风险，但所有产品强制共用一个账号也会造成不必要的数据和业务耦合。

## 决策

统一采用 Casdoor + 标准 OIDC/OAuth 2.0 作为认证技术栈，复用配置模板、客户端适配器、安全规则和测试，但不默认共享用户域。

- 一个需要独立账号体系的产品使用独立 Organization 和 Application。
- 只有明确需要跨产品 SSO 的产品才放入同一用户域，或增加经过用户确认的账号关联。
- 网站使用 Authorization Code，并由服务端/BFF 保存会话；浏览器不保存客户端密钥。
- Electron、移动端和浏览器插件均视为公开客户端，使用系统浏览器、Authorization Code + PKCE，不内置客户端密钥。
- 每个后端严格校验自己的 issuer、audience、organization/tenant 和 scopes。
- 业务角色、套餐、许可证、团队和文件配额属于产品数据库，不写入认证系统作为业务事实源。
- 软件商店管理员使用独立内部 Organization；发布自动化使用独立机器身份与最小发布 scope，不复用普通用户令牌。

## 可复用组件

后续建立同仓库或独立包的适配层：

- `auth-core`：OIDC discovery、PKCE、令牌模型和错误规范。
- `auth-web`：网站服务端回调与 HttpOnly 会话。
- `auth-electron`：系统浏览器回调、系统钥匙串和离线降级。
- `auth-extension`：浏览器扩展回调与最小令牌存储。
- `auth-mobile`：Universal Link/App Link 回调。

这些包共享协议实现，不共享产品的 Client ID、用户表、cookie 或业务权限。

## 结果

新增产品不再重写登录流程；账号是否互通成为显式产品决策。GitFinder 未登录时仍可完全离线运行，登录只是同步和协作能力的入口。
