# GitFinder 构建、发布与推送工作流

## 工作流目标

一次 GitHub Actions 手动触发完成以下工作：

1. 校验请求版本与 `package.json` 一致。
2. 在 macOS runner 构建并验证 arm64 ZIP。
3. 在 Windows runner 构建、安装、启动、卸载并验证 x64 NSIS、blockmap 与便携 ZIP。
4. 汇总制品，重新计算大小和 SHA-512，生成 `store-release.json`。
5. 幂等创建或复用 OakTech Release Draft，并分片上传制品。
6. 停在草稿状态，等待管理员在 OakTech 后台确认正式发布。

正式发布后，OakTech 会验证服务器上的制品，更新产品页与历史版本，并让 `latest.yml`、`latest-mac.yml` 同时指向新版本。CI 无权越过人工确认直接公开版本。

## 首次配置

GitFinder GitHub 仓库需要配置名为 `oaktech-release` 的 Environment，并添加：

- Secret `OAKTECH_RELEASE_WRITE_TOKEN`：至少 32 字符的随机机器凭据。
- Variable `OAKTECH_RELEASE_BASE_URL`：默认可填 `https://oaktechz.com`。

OakTech 服务端使用相同的 `OAKTECH_RELEASE_WRITE_TOKEN`。它只允许导入草稿和上传制品，不允许执行最终发布。凭据不能写入仓库、构建制品或客户端。

当前机器上的 `/Volumes/project/开发中/gitfinder-2` 尚未配置 Git remote；需要先确认并连接 `goldf2/GitFinder`，提交当前受保护工作区后，GitHub 才能看到和运行工作流。

## 运行方式

在 GitHub 仓库的 Actions 页面选择：

```text
GitFinder 2 - build and push store draft
```

填写：

- `expected_version`：必须和 `package.json` 完全一致。
- 中英文发布标题。
- 中英文发布说明。
- `push_to_store`：开启时把验证后的制品推送到 OakTech 草稿。

工作流失败不会改变线上当前版本。相同版本、提交和制品可以安全重试；已上传且大小、文件名、SHA-512 相同的槽位会跳过，冲突制品会停止流水线。

## OakTech 人工发布

构建和推送完成后访问：

```text
https://oaktechz.com/admin/releases
```

确认以下项目后点击 `Verify and publish`：

- macOS 和 Windows 必需制品齐全。
- 版本、提交和发布说明正确。
- macOS 签名/公证与 Windows 代码签名符合本次发布级别。
- 文件大小和 SHA-512 与工作流描述一致。

发布完成后，在一台已安装旧版本的 macOS 和 Windows 设备上分别执行一次真实升级验收。

## 本地调试

准备包含全部平台制品的目录后，可以生成描述：

```bash
RELEASE_TITLE_EN="Release title" \
RELEASE_TITLE_ZH="发布标题" \
RELEASE_NOTES_EN="Release notes" \
RELEASE_NOTES_ZH="发布说明" \
npm run release:describe -- \
  --artifacts-dir release-bundle \
  --source-commit 0123456789abcdef0123456789abcdef01234567
```

推送草稿：

```bash
OAKTECH_RELEASE_BASE_URL=https://oaktechz.com \
OAKTECH_RELEASE_WRITE_TOKEN="从安全凭据库读取" \
npm run release:push-draft -- --descriptor release-bundle/store-release.json
```

生产凭据不得放进 `.env` 示例、日志、Shell 历史或项目交接文档。Casdoor 部署完成后，机器凭据应替换为标准 OAuth 2.0 Client Credentials，发布接口与描述格式保持不变。
