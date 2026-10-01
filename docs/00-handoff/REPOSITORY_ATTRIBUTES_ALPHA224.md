# alpha.224 仓库主列表与文件夹项目属性

用户现行模型取代alpha.223“所有项目”：文件夹是主体，Git仓库是带Git能力的文件夹；项目仅为目录附加属性。主列表和侧栏显示Git仓库，普通目录从文件浏览进入。旧全局项目标签转为仓库列表，原分组仍作为筛选，原会话身份保持。

扫描不再生成项目属性。已有便携清单和alpha223本机属性稳定ID继续有效；首次主动添加属性写入所选目录。无属性仓库可直接浏览代码、文件，资料页提供添加属性按钮。内部projectId作为关联键保留，不做破坏性数据迁移。

源码验证：1459/1459测试、310个JS语法检查、16项隔离Electron界面检查通过（scripts/verify-repository-attributes.js）；覆盖两个Git和一个普通目录、裸仓库访问、属性添加、任务/来源分区/会话关联、重开持久性。原项目清单保持。源码证据dist/alpha224-test.log与dist/repository224-ui-6GIyVh/results.json。

本机交付完成：源码`85eb6f19d5ed754d7bc482105fd7573665674484`已推送main；macOS arm64 DMG/ZIP及开发产物门禁通过。安装至`/Applications/GitFinder 2.app`，安装10项与重开10项通过，真实58个仓库可见，原26目录52条会话、分组及旧本机属性逐项保持。正常启动窗口可见，调试端口已关闭。

旧alpha223可恢复备份：`/Volumes/project/制品与备份/GitFinder/2026-10-01-alpha223-before-attributes224/GitFinder 2.app`。最终验收凭证位于本次任务outputs/GitFinder-alpha224-交付收据.json，截图GitFinder仓库列表-reopened.png。原12项工作树内容保留；用户体验验收pending。仅ad-hoc本机开发包，没有商店或GitHub公开发行。
