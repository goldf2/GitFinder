# 软件构建、商店发布与客户端更新协议

## 目标

让“网站显示的当前版本”和“App 检查到的当前版本”来自同一次发布事务，同时保证二进制不可变、发布可审计、失败不产生半发布版本。

## 事实源

系统不做脆弱的双向同步，而是给不同阶段指定唯一事实源：

| 阶段 | 事实源 | 说明 |
| --- | --- | --- |
| 开发与构建 | GitFinder `package.json` | 构建输入版本，锁文件必须一致 |
| 待发布 | 商店 Release Draft | 接收构建版本、说明、平台和制品哈希 |
| 已发布 | 商店 Published Release | 网站当前版本、历史版本和更新清单共同读取 |
| 客户端更新 | 商店公开 `latest*.yml` | 由 Published Release 生成，客户端不读取后台 API |
| 安装包字节 | 持久卷或 OSS | 版本化不可变路径，不写入 Git 仓库 |

因此“同步”发生在发布事务中：构建版本导入草稿，服务端核验制品，发布后同时切换网站版本与更新清单。客户端本身不回写商店版本。

## 发布状态机

```text
build verified
  -> draft created
  -> artifacts uploaded to temporary area
  -> server hashes/signatures verified
  -> artifacts promoted to immutable version path
  -> release published atomically
  -> website current version + latest.yml + latest-mac.yml become visible
```

任一步失败都保留旧的 Published Release。`latest*.yml` 最后切换，不能先于安装包公开。

## 发布包描述

CI 或构建机应生成一个 `store-release.json`，只描述事实，不包含密钥：

```json
{
  "schemaVersion": 1,
  "productSlug": "gitfinder-2",
  "version": "2.0.0-alpha.88",
  "channel": "alpha",
  "sourceCommit": "<git commit>",
  "artifacts": [
    {
      "platform": "mac",
      "architecture": "arm64",
      "packageKind": "zip",
      "fileName": "GitFinder-2-2.0.0-alpha.88-arm64-mac.zip",
      "sizeBytes": 0,
      "sha512": "<hex>"
    }
  ]
}
```

商店必须验证：

- 描述版本与 Release Draft 完全一致。
- 文件名、包内应用版本、签名身份和声明版本一致。
- 服务端自行计算的大小与 SHA-512 等于描述值。
- macOS 公证/签名和 Windows 签名通过对应发布门禁。
- 同一产品、渠道、版本和制品槽位不可重复；重试使用幂等键。

## 管理与自动化接口

推荐的最小发布 API：

- `POST /api/admin/releases/import`：导入描述并创建或返回同一草稿。
- `PUT /api/admin/releases/{id}/artifacts/{slot}`：分片上传制品。
- `POST /api/admin/releases/{id}/verify`：服务端重新计算哈希并执行签名/版本门禁。
- `POST /api/admin/releases/{id}/publish`：管理员确认后原子发布。
- `GET /api/public/products/{slug}/releases`：网站历史版本。
- `GET /releases/{slug}/{channel}/latest.yml`
- `GET /releases/{slug}/{channel}/latest-mac.yml`

发布 CLI 只能导入草稿和上传制品；最终发布由后台管理员人工确认。当前 MVP 使用 GitHub Environment 保存的独立发布令牌，服务端只保存对应运行时密钥。Casdoor 部署完成后改用机器身份和 `store:release:write` scope，API 契约保持不变。机器令牌不写入仓库、制品或客户端。

## 当前实现与下一步

OakTech 商店当前已经具备产品/版本/制品草稿、描述导入、可重试的分片上传、服务端 SHA-512、持久卷和 `latest*.yml` 生成。GitHub Actions 可在两个原生 runner 上完成构建并推送草稿。下一步应补齐包内版本与签名门禁、Casdoor 机器身份，并完成真实旧版本升级验收，而不是再维护环境变量形式的下载链接。

GitFinder 当前已具备稳定公开更新地址、语义版本比较、用户控制的启动检查、人工下载确认和人工安装确认。正式发布仍需在已安装旧版上完成真实升级验收。
