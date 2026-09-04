# GitFinder 2 在线更新发布说明

GitFinder 2 打包版默认从以下 Alpha 发布目录检查更新：

```text
https://oaktechz.com/releases/gitfinder-2/alpha/
```

用户可在 [GitFinder 2 发布页](https://oaktechz.com/products/gitfinder-2) 查看产品与完整发布说明。发布页与更新文件目录分离：前者可改版，后者必须保持稳定路径和机器可读响应。桌面客户端只读取 `latest.yml` 或 `latest-mac.yml`，不访问管理 API，也不解析产品页。

OakTech 后台的发布记录是版本、平台、下载 URL、发布时间和更新说明的控制面。二进制应保存在服务器对象存储或 CDN 上，不写入 Git 仓库。后台在发布记录生效时生成两份 manifest，并在产物全部可读后原子替换。

## 发布目录

一个可同时支持 macOS arm64 和 Windows x64 的版本目录至少包含：

```text
alpha/
├─ latest-mac.yml
├─ GitFinder-2-<version>-arm64-mac.zip
├─ latest.yml
├─ GitFinder-2-<version>-x64-win-setup.exe
└─ GitFinder-2-<version>-x64-win-setup.exe.blockmap
```

Windows 免安装 ZIP、SHA256 清单和发布说明可与上述文件放在同一目录，供软件商店手动下载；客户端自动更新不依赖它们。

## 构建与上传

推荐通过 [build-publish-workflow.md](./build-publish-workflow.md) 中的 GitHub Actions 工作流构建并推送 OakTech 草稿。以下步骤仍是工作流背后的发布契约，也可用于故障恢复：

1. 同步增加 `package.json` 和 `package-lock.json` 的版本号。
2. 在 macOS 执行 `npm run check && npm run pack`，取得 macOS ZIP 和构建阶段的 `latest-mac.yml`。
3. 在真实 Windows x64 环境执行 `npm run check && npm run pack:win`，取得 NSIS、blockmap 和构建阶段的 `latest.yml`。
4. 在 OakTech 后台新建草稿发布记录，填写版本、平台、发布时间、更新说明和最终下载 URL。
5. 将二进制上传到服务器存储的临时位置，核对文件大小、SHA-512 和签名；Windows blockmap 必须与 EXE 同名并以 `.blockmap` 结尾。
6. 后台根据发布记录重新生成 manifest，先发布产物与 blockmap，最后原子替换两份 `latest*.yml`。构建机生成的 manifest 是校验输入，不代替后台发布记录。

`scripts/generate-update-manifest.js` 支持 `--artifact-url`、`--release-date` 和 `--release-notes-file`，便于在发布前生成与后台记录一致的校验样本。

建议缓存策略：

- `latest.yml` 和 `latest-mac.yml`：`Cache-Control: no-cache, no-store, must-revalidate`。
- 带版本号的 ZIP、EXE 和 blockmap：`Cache-Control: public, max-age=31536000, immutable`。

## 客户端行为

- 打包应用默认在启动后延迟 10 秒检查；用户可以在设置页关闭“启动时自动检查”。
- 关闭自动检查后不会发生启动联网请求，菜单和设置页中的手动检查仍可使用。
- 检查不会自动下载；发现新版本后，用户点击更新按钮并通过系统确认框才会开始下载。
- 下载完成后可立即重启，或稍后从设置页明确触发安装；退出应用不会静默安装。
- Alpha 预发布版本使用完整语义版本比较，例如 `alpha.86` 高于 `alpha.85`。
- 正常发布不通过 Coolify 环境变量下发版本或下载地址；客户端的稳定入口由包内 `app-update.yml` 和程序默认值双重固定。
- `GITFINDER_2_UPDATE_URL` 只用于本地协议验证或已授权的诊断，不是生产配置入口；`GITFINDER_2_UPDATE_ENABLED=0` 可临时关闭检查。
- 只有同时设置 `GITFINDER_2_UPDATE_ALLOW_INSECURE_LOCAL=1` 时，打包测试版才允许连接 `http://localhost`。

网站版本、历史版本与客户端更新清单的同步协议见 [release-control-plane.md](./release-control-plane.md)。

## 发布门禁

每次对外发布都应在已安装旧版上完成一次真实升级，验证：

- 可发现正确的新版本和发布说明。
- 取消、断网或下载失败后，旧版仍能使用。
- 下载的文件通过 electron-updater 的 SHA-512 验证。
- 重启后版本号正确，本地目录、白板和配置保留。
- macOS 使用一致的 Developer ID 签名并完成公证；Windows 使用可验证的代码签名。当前 ad-hoc/未签名 Alpha 包只用于内部测试，不应标记为稳定正式版。
