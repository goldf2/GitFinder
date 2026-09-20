# alpha.209 公开发布记录

2026-09-21T04:02:02+08:00 · GF-UPDATE-002 · Codex

用户明确要求发布最新版并提供自动更新。范围为 GitFinder alpha.209 的现有制品与更新入口，不更改签名校验或用户数据。既有未提交文件保留；本轮不重新构建、不混入未提交源码。

- 构建提交：bf4f25b3380c89eac91cb433c30e1ebdce1a339a。
- 制品目录：`/Volumes/project/临时文件/gitfinder-builder-alpha209/dist`。
- ZIP 131702919 字节，SHA-256 `82d6e033c0539e5d4cf947e10f362604422c8c85e6e191672498e42af045df03`。
- DMG 133428986 字节，SHA-256 `db0232eca891182f642b1b0b6c176136fb982d2026c726011ab70cdaaf610325`。
- 两个包均与 builder 生成的 latest-mac.yml 大小、SHA-512 匹配。
- GitHub MCP 可读 Release，未提供 Release 写入/二进制上传工具；使用 gh 创建草稿、上传完整包后上传清单，最终公开为预发布。MCP回读 `draft=false`、`prerelease=true`，五项资产均存在，主包服务端SHA-256与本机相同。地址：https://github.com/goldf2/GitFinder/releases/tag/v2.0.0-alpha.209 。
- 官网管理页浏览器控制调用返回 `nodeRepl.fetch request failed`；当前环境未配置 OAKTECH_RELEASE_WRITE_TOKEN。未修改官网，不能声称双端同步。
- 本机有效代码签名身份为 0。制品 ad-hoc、未公证。更新元数据可提供给兼容客户端检查，但自动安装尚未通过，不能用关闭原生校验替代验收。
- alpha.205/207 为旧更新协议，仍需首次手动迁移；本次仅 macOS arm64，不虚构 Windows 209 包。

原生检查结果：以 electron-updater 6.8.9 的 GitHubProvider、NodeHttpExecutor、darwin平台、alpha.208当前版本、allowPrerelease=true 读取公开源，失败 `read ETIMEDOUT`。没有执行自动下载或安装，不能将MCP元数据回读代替客户端升级验收。`npm run handoff:update`、`npm run check:handoff`与`git diff --check`通过；本轮记录留在本地，未提交无关dirty内容。

下一步：恢复官网管理连接同步同一制品，并排查客户端访问GitHub超时；正式自动安装仍需 Developer ID 签名与公证。已公开的alpha209不覆盖重发，签名后以新版本发行。
