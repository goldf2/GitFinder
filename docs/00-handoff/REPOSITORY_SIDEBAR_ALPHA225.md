# alpha.225 仓库分类与标签热力图

仓库侧栏恢复分类新建、编辑入口；可选择未添加项目属性的仓库，保存时才绑定目录属性。当前分类修改后即时刷新筛选；仓库直接分类与旧分组继承分类并存，离线成员引用保留。

仓库和标签区域各自独立滚动，显式滚动条；标签区最多占侧栏42%，可折叠释放空间。标签按关联仓库数量排序，浅到深表达少到多，零关联保留。紧凑网格随宽度变列，支持名称搜索、数量显示、鼠标/键盘多选；原重命名、删除入口保留。

验证：1460/1460全量测试、310 JS语法通过。scripts/verify-repository-sidebar.js 使用37个仓库、80标签，11项实际Electron检查通过，覆盖新建编辑分类、即时筛选、计数/颜色、搜索/键盘、小窗口独立滚动、可见滚动条、折叠和重开。证据dist/sidebar225-ui-cPohBh/results.json、sidebar-light.png、sidebar-dark.png；全量日志dist/alpha225-test.log。早期fixture使用相同远程导致仓库身份合并，且直接IPC赋标签后未刷新enrichment缓存；已修正fixture，未据此改动产品计数逻辑。

已交付：运行源码`d8d10ca721948b044e79eaae9d83daa1dff9cf08`已推送。macOS arm64 DMG/ZIP开发门禁通过，安装11项及重开12项通过；正常启动窗口可见且调试端口关闭。43个真实标签、58仓库，仓库滚动区308px/内容1173px，标签滚动区172px/内容563px；搜索、筛选、分类弹窗、独立滚动均通过。

原52会话及分类分组逐项保持。标签定义及关联集合一致；旧注册表启动时会修复无可用Git身份条目的内部ID，因此不宣称tags.json字节一致。重开按58个真实仓库路径核对标签关联一致，本轮未修改注册表算法。

旧alpha224备份：`/Volumes/project/制品与备份/GitFinder/2026-10-01-alpha224-before-sidebar225/GitFinder 2.app`。最终凭证为本次任务outputs/GitFinder-alpha225-交付收据.json，截图GitFinder标签热力图-reopened.png。原12项未提交内容保留，用户体验验收pending；仅本机ad-hoc开发包。
