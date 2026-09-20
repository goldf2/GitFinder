# alpha.210 更新渠道和统一设置界面

2026-09-21 · GF-UPDATE-003 · Codex

用户确认三个应用同时改造：默认接收正式与测试版，默认手动安装，自动下载退出安装必须独立开启；使用 GitFinder 软件更新设置作为通用界面基准。新增固定 GitHub 公开反馈入口。签名和完整性校验保持。

本地源码 alpha.210；更新服务/控制器专项16项通过，renderer构建、298JS语法检查通过。全套初次1414/1415：目录符号链接测试因 macOS /var 与 /private/var 临时目录别名断言失败，相关源码与测试未修改。TMPDIR指向同一目录的realpath后1415/1415通过，不改业务实现绕过测试。

涉及 main.js、preload.js、src/main/services/updateService.js、src/renderer/scripts/updateController.js、两个更新测试和版本声明。渠道切换清旧候选并阻止任务中切换，不降级；自动安装仅在显式开启且平台条件满足后启用，不强制重启。

干净工作树 /Volumes/project/临时文件/gitfinder-builder-alpha210 在 a6b64fd 完成 DMG/ZIP 构建，development artifact gate通过（ad-hoc，不代表正式签名）。安装/发布待后续证据补充。官网连接与正式签名阻塞仍归GF-UPDATE-002，不因设置实现完成而标记正式升级成功。

通用界面规范：/Volumes/project/支持文档/部署与运维/APP设置与软件更新界面规范.md。

2026-09-21 05:46 +08:00：/Applications/GitFinder 2.app已替换alpha210，原209保存在dist/GitFinder-2-alpha209-before-unified-ui.app。codesign --verify --deep --strict通过。CUA实际进入“应用设置 → 软件更新”，版本210、五项行、默认检查/测试版开启、自动安装关闭及开发签名说明均显示正确，浅色布局无裁切。未触发下载安装、提交反馈或操作业务数据。源码推送/公开发布另记。
