# alpha.139 目录双重身份详情

2026-09-10 +0800。

用户确认同一目录常同时为项目和 Git 仓库，右侧通过顶部选项卡切换两种详情。

实现：FileSelectionDetailController 管理共同目录上下文与项目/Git 顶部选项卡，按身份显示对应入口；RepositoryDetailController 在加载开始及身份确认后同步上下文。项目切换取消 Git 在途读取，空选择/多选隐藏身份页签，读取中不显示旧仓库内容。键盘左右/Home/End 可切换页签。

本轮按 stop-that-shit 范围约束只修改详情切换，不重构项目类型、目录结构或 Git 操作。

验证：1121/1121 测试通过，258 JS 文件语法检查通过。安装版隔离目录“示例平台”同时拥有项目清单和本地 Git 仓库，原生点击项目/Git/项目往返成功；路径不变，Git 页显示 main 分支及状态。切至纯项目“创作工具”后 Git 页签隐藏，旧仓库内容不可见。异步取消与双身份上下文回归测试通过。

发布源码 a9e54b9；安装 `/Applications/GitFinder 2 Alpha139.app`，保留 alpha.138；codesign 严格验签、安装 ASAR 与构建比对通过。

制品 `/Volumes/project/制品与备份/gitfinder-2/2.0.0-alpha.139/GitFinder-2-2.0.0-alpha.139-arm64-mac.zip`，SHA256 `68d621347be2d11a37adc76f81789ee192b61c9dcd5db243184a4092b41c24fb`；同目录 release-verification.json。开发包 ad-hoc 签名。

原配置无参数普通启动通过，78 项目保留。实际选择“大熊猫智能体平台”，顶部项目/Git 两页可见；切换 Git 页显示同一路径、main 分支、最近提交和 README，窗口截图验收通过。代码与本记录随 main 推送。
