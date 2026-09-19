# alpha.203 · 嵌套容器标题防重叠

任务：GF-CONTAINER-HEADER-001。基线：alpha.202 / `ee3583340950c71adad37d8fb38ccf0dfdcaa9a5`。

## 当前状态（2026-09-19T09:58:24+08:00）

已交付alpha.203。运行源码`3dd763907c48bd88b6598bb2940989397d0bee19`已在完整安装验收与正常用户启动后推送；文档收口提交不改变制品来源。确切源码1412/1412测试、298个JavaScript语法检查、13项标题专项通过。安装版一次串行通过28标题、38容器缩放、11字号、32资源生命周期和12Coolify入口，共121项。用户实际体验确认仍pending。

## 问题与修正

用户截图中的con01主机与内部Project顶边对齐，标题互相覆盖。alpha202对显式wrap容器跳过内容边界，子容器拖动也只遵循extent顶边，没有预留父标题区。

本轮从内到外补足必要显示外框，保留内部卡片的世界坐标、关系和锁定事实；不靠隐藏标题或层级覆盖掩盖缺陷。拖动、边角缩放的内部第一行和联动位移使用标题安全区。36px等中等字号也按补偿后的高度预留空间，默认20px行为保持。嵌套长标题改用容器自身宽度，不再额外受悬浮标题280px上限限制，超长内容仍有省略和悬停原文。

直接打开旧白板即可得到分层标题，无需删除重建容器或重新导入资源。首次显示不主动写入修正尺寸；实际修改沿用原撤销、保存队列及动态配置。不迁移数据库、写入Coolify或改变测试功能开关。

## 源码入口

| 文件 | 职责 |
| --- | --- |
| `src/shared/relationshipFlowAdapter.js` | 标题安全区、从内到外的显示外框修正、拖动限制及稳定坐标换算。 |
| `src/shared/responsiveContainerLayout.js` | 调整尺寸及向外扩展祖先框时沿用相应标题高度。 |
| `src/renderer/relationship-canvas/index.jsx` | 交互几何更新时应用安全区。 |
| `src/renderer/relationship-canvas/relationshipCanvas.css` | 标题栏对齐、行高及嵌套标题可用宽度。 |
| `src/renderer/scripts/relationshipBoardController.js` | 中等/较大字号标题留白计算。 |
| `test/container-header-spacing.test.js` | 13项回归；截图场景、嵌套、锁定、几何往返、拖动和字号。 |
| `scripts/verify-container-headers.js` | 合成截图场景的真实DOM矩形、指针和磁盘/进程重启验收。 |

## 验证范围

标题安装矩阵包括8/20/36/48/96px字号与0.15/0.5/1倍缩放、向父标题区拖动的预览与结束、Project上边缘缩放、主机收窄换行、撤销重做、真实IPC保存、磁盘读回、离线冷启动以及多次重绘不累积偏移。相邻38项缩放包含三类容器全部24个边角方向；其他回归验证字号、资源生命周期和Coolify入口。

验证仅使用自己的profile及合成资源；输入为Chromium CDP真实指针，不冒充系统辅助功能原生鼠标或Windows验收。成功保存走实际IPC/文件服务/磁盘读回，不替代真实磁盘损坏、全部数据规模或任意布局组合测试。

## 实施过程及失败记录

- 最初8项回归原版1通过/7失败，修正后8/8；随后扩为13项。旧已安装alpha202同一截图夹具在第一项标题DOM断言失败，保留`installed-alpha202-before.log`。
- 首次全量1405/1407：嵌套旧测试期待60px留白，更新为72px并继续核对卡片绝对坐标；另一个Git amend夹具并发时未得到HEAD，原样单独1/1通过，没有修改Git业务代码。最终确切提交全量1412/1412通过。
- 初次DOM字号矩阵发现36px沿用旧72px标题区不足，新增失败用例并修复。快速测量曾遇到React尺寸/CSS更新的中间状态，脚本等待稳定几何并保留当时数据。
- 上一轮网络502中断后，读取`installed-headers.log`确认它在重启CDP焦点调用超时退出，并非完整安装验收成功；本轮没有重复安装或改动业务源码，重新串行运行整套安装验证，最终121项通过。超时根因未完全确认，不宣称修复了所有环境问题。
- 正常启动第一次系统截图尚为应用外壳；激活窗口并等待后，截图`normal-ready-resume-alpha203.png`确认原项目、应用面板标签和con01实际白板，主机与Project标题分层。不将早期外壳状态记为已定位的代码故障。

## 最终交付证据

- 应用：`/Applications/GitFinder 2.app`，版本`2.0.0-alpha.203`；运行源码`3dd763907c48bd88b6598bb2940989397d0bee19`。
- 已安装ASAR SHA-256：`34e787a3537c9cdf9c0ebaa747d1b779793f2789d8a945c29fd5f3057acb93a9`，与原制品一致；`codesign --verify --deep --strict`通过。
- ZIP：`dist/agentdock-title-spacing-20260919/work/dist/GitFinder-2-2.0.0-alpha.203-arm64-mac.zip`；SHA-256：`e299e5263b161a7e2ae2ddaa550a5813c7e49169278175e175d07b9508830c3e`。
- 旧alpha202备份：`/Volumes/project/制品与备份/GitFinder-2-alpha202-before203.app.disabled`，保持可恢复。
- 原3份白板（两套合集及con01独立文件）在安装验收、正常启动后与本轮安装前基线字节一致。原10项dirty合入前按字节校验；合入时按原补丁增删内容及4个未跟踪文件字节验证，不混入本轮提交。
- 证据根目录：`dist/agentdock-title-spacing-20260919/`；精确源码检查`exact-source-check.log`，安装日志`installed-*-resume.log`，汇总`delivery-verification.json`。日志/截图不随Git自动分发，换机请用下列命令重新验证。

- 安装 headers：28项；`dist/container-headers-ui-jbEmNj/result.json`。
- 安装 responsive：38项；`dist/container-resize-ui-gOO2EM/result.json`。
- 安装 text：11项；`dist/text-ranges-ui-bVMsqH/result.json`。
- 安装 resources：32项；`dist/resource-containers-ui-SJIjnd/result.json`。
- 安装 coolify：12项；`dist/coolify-links-ui-tUXKPs/result.json`。

## 可复跑入口

```bash
node --test test/container-header-spacing.test.js
npm run check
node scripts/verify-container-headers.js --app '/Applications/GitFinder 2.app/Contents/MacOS/GitFinder 2 Alpha'
node scripts/verify-responsive-containers.js --app '/Applications/GitFinder 2.app/Contents/MacOS/GitFinder 2 Alpha'
```

## 兼容与未验证范围

仅macOS本机ad-hoc开发包，无Developer ID公证、Windows、商店或GitHub Release公开发行。仪表盘和开发进度默认关闭，Coolify沿用系统默认浏览器。alpha202新增的wrap字段兼容说明仍适用；降级旧应用前保留白板备份。未穷举任意规模、无关容器彼此重叠及全部字号/多边形/深层嵌套/锁定组合，不把本次父子标题修复扩张成全局无碰撞布局保证。下一开发仍为GF-AI-PROGRESS-001设计，用户实际验收单独记录。
