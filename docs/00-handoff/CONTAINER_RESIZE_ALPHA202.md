# alpha.202 · 容器边角缩放与自适应排列

任务：GF-CONTAINER-RESIZE-001。基线：alpha.201 / `7d1476c1dad146094c12d2ba4030b378e5648782`。

## 当前状态

源码已完成；18项专项和1399项完整检查通过。三类容器共24个方向已用实际Electron指针输入操作并逐次检查撤销/重做；额外14项包含便携文件与动态配置冷启动已通过。尚未完成最终安装、正常用户启动与推送；下节随真实交付更新，不能把源码结果当成已安装。

## 使用与行为

将鼠标移到主机、Project或手工群组的四边/四角，出现尺寸光标后拖动。拉宽可容纳更多列，收窄按原成员顺序换行；不缩放部件、卡片或文字，不改变资源归属和关系。拖动上下边界调整高度，但不能小于容纳内容所需高度。

主机中的Project作为完整组件移动，调整Project才排列其直接成员。空主机也可调大小，多边形用内边距保留切角空间。较大字号沿用alpha201的标题空间。

一个手势对应一个撤销步骤；预览不写入白板，松开才提交原保存流程。Esc、失焦、来源刷新或文档切换取消未完成的操作。容器、自身上级或后代锁定时不允许重排，包括被隐藏的锁定成员。

有成员的容器可用自身“自动排列”恢复内容适配；全局布局与自定义尺寸不应理解为新的结构归属。没有自动整理或放大用户已有白板。

## 设计与源码入口

| 层 | 实现与约束 |
| --- | --- |
| `src/shared/responsiveContainerLayout.js` | 基于手势开始快照的纯布局函数；八个方向、固定对边、最小尺寸、按宽度换行、嵌套整体移动和锁定检查。 |
| `src/renderer/relationship-canvas/ContainerResizer.jsx` | 屏幕尺寸命中区、pointer capture、按帧预览、结束/取消清理；无持久化代码。 |
| `src/renderer/relationship-canvas/index.jsx` | 主机和群组共用组件；来源重建取消旧预览；结束后重算连线。普通群组标题移离边角命中区。 |
| `src/renderer/scripts/relationshipBoardController.js` | 检查当前文档/白板与锁定状态，仅写入相对起始模型确实改变的节点；历史、原保存队列、动态配置沿用现有实现。 |
| `src/shared/relationshipFlowAdapter.js` | 显式主机框不再被自动内容边界/碰撞整理覆盖；稳定读回尺寸与绝对位置。 |
| `src/shared/relationshipGraphModel.js` | 可选`containerLayout: "wrap"`，仅group/server使用且需有效宽高；复用groupWidth/groupHeight；旧文件默认不增加字段。 |

## 可重跑验证

```bash
node --test test/responsive-container-layout.test.js
npm run check
node scripts/verify-responsive-containers.js
node scripts/verify-responsive-containers.js --app '/Applications/GitFinder 2.app/Contents/MacOS/GitFinder 2 Alpha'
```

最后一条必须使用已验收的测试制品；脚本始终创建自己的profile和合成资源，不接触正常用户白板。`--extras-only`只运行14项额外检查，不等于完整38项。输入使用Chromium CDP真实指针，不冒充系统辅助功能或Windows原生输入验收。成功保存与重开走实际IPC、文件服务及磁盘读回。

18项专项覆盖几何、来源刷新、稳定尺寸、锁定、非法字段、旧值、取消/切换、文件往返和主机重复读回。完整源码检查1399/1399、297个JS；JSX由renderer构建覆盖。

## 过程记录与已修正问题

- 初始任务在写入阶段多次受上游安全状态检查阻塞；恢复后确认手柄样式已经写入。测试ID需满足前缀后的8字符规则，修正后最初8/8通过，未放宽产品验证规则。
- 新回归复现并修正：服务器树自动整理覆盖自定义主机位置；模型接受缺尺寸的wrap；旧卡片几何把显式主机框再次按共享群组定位。
- 部分实时Project分支会删除旧宽高/强制auto，现对显式wrap保留。free场景最初就通过，不把它记作失败复现；另增加纵列与server-tree检查。
- 普通群组浮动标题遮住左上角，实际输入发现后调整标题间距。第一轮完整检查唯一失败为旧“多边形强制等比”契约，本需求改为独立边角+内边距，更新契约而不是隐藏失败。
- 验证脚本修正：等待画布就绪、分开放置重叠的合成主机、将目标平移到小地图之外后操作；没有移除真实控件或改用内部调用代替拖拽。重开后的JSON仅属性顺序不同，经解析逐项相同，改为深比较。
- 一次手势未产生提交的原因未完整捕获，保留失败日志并加入动作轨迹；后续完整方向检查通过，不宣称所有取消路径已经穷举。一次误并行启动的额外UI任务被主动终止，不计验收通过。

原始证据：`dist/agentdock-responsive-containers-20260919/`，包括baseline/original.patch、各regression日志、source-ui日志和工作区内`dist/container-resize-ui-*/`。更早草稿记录备份为该证据目录下`development-history.md`，不作为当前状态。

## 兼容与非目标

只在明确操作后保存新字段；未迁移数据库、复制凭据或写入Coolify配置。旧严格解析版本可能不识别wrap，因此包含新尺寸的新文件应使用alpha202及后续兼容版本；恢复旧应用不保证新文件能降级打开。原未修改文件不受影响。

本轮不声称新来源增加成员后的所有布局组合、超大规模、所有字号/嵌套、Windows原生输入或正式分发均通过。仅macOS本机开发签名；AI调用、生产发布和默认开放实验进度均不在范围。用户实际验收单独记录。
