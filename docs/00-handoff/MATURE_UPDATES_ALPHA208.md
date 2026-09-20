# GF-UPDATE-002 · alpha.208 成熟更新迁移

2026-09-20，基线main alpha205；公开alpha207来自独立统一更新实验分支。本次保留main功能，版本提高到208，未合并实验分支。

## 实现

- electron-builder 26.15.3 / electron-updater 6.8.9精确固定。
- Mac由builder生成DMG、ZIP、blockmap和latest-mac.yml；Windows由builder生成NSIS及元数据，取消手写覆盖元数据。
- GitHub provider：goldf2/GitFinder，默认draft，构建使用--publish never。正常运行读取builder的app-update.yml，不用setFeedURL覆盖；显式HTTPS镜像环境配置仍可用。
- Alpha允许预发布，不允许降级，下载和重启需用户操作。不关闭原生签名验证。
- 保留appId、productName、Electron fuses、用户数据路径。图标验收从Info.plist读取实际文件名。

## 验证与边界

更新专项24/24；TMPDIR=/private/tmp npm run check：1414/1414，298个JS。首次默认TMPDIR测试失败是/var与/private/var路径比较，规范路径复验通过；不改业务逻辑掩盖失败。
Mac候选已构建，正式签名身份为0；公开发行和实际签名升级未验收。安装及后续证据追加于本文件。

## 发布操作

1. 在干净提交上npm ci、TMPDIR=/private/tmp npm run check。
2. 本机开发：npm run pack。可用CUSTOM_DMGBUILD_PATH指定经上游SHA256验证的官方dmgbuild工具。
3. 正式：配置GITFINDER_RELEASE_MODE=official、GITFINDER_EXPECTED_TAG、GITFINDER_CODESIGN_IDENTITY、APPLE_TEAM_ID、GITFINDER_NOTARY_KEYCHAIN_PROFILE，执行同命令。缺签名/公证不得标正式。
4. 输出dist/mac-arm64/GitFinder 2 Alpha.app、GitFinder-2-版本-arm64-mac.{dmg,zip}及blockmap、latest-mac.yml。GitHub预发布provider会在alpha-mac.yml不存在时读取latest-mac.yml；不要手写第二套版本清单。
5. 旧alpha205仍用官网generic源；alpha207实验版用签名updates.json。两者都不能仅靠上传builder清单自动迁移。本次默认一次手动安装208；如需无缝过渡，另经验证生成旧协议桥接，禁止伪造兼容。
6. 发布必须在草稿中先上传完整包再元数据，校验匿名读取后公开为prerelease。官网展示/镜像同一制品；旧CI中商城优先的发布流程需显式迁移，不能直接按旧publish-release工作流放行新候选。
7. 从旧版隔离副本执行检查、下载、重启，确认新版本及配置保留，才能记录真实升级通过。

统一作业指导书位于/Volumes/project/支持文档/部署与运维/三应用安装更新作业指导书.md。
