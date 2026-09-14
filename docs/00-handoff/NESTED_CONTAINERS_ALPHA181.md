# 三层显示重建 · alpha.181

2026-09-15（Asia/Shanghai）

- 用户否定 alpha.180 的完成结论。本机安装包核对仍为 alpha.179，不能把源码打包等同于实际修复。
- 已复现：Project 相对坐标移动 80/40 后，主机边界刷新再次累加 80/40。新增回归先失败，再修复父边界变化时的子坐标补偿；连续刷新及保存重开保持幂等。
- 物理主机树按可见子内容重新计算 Project 尺寸；旧窄框、越界子节点、空 Project 和过大列间距修复只发生于显示投影，不更改采样事实。
- 主机/Project 标题改为容器内部标题带，随容器缩放，自适应补偿有上限；避免固定屏幕标题遮住微小卡片。主机扩展后的重叠边界横向避让。
- 验证：1176 个测试、270 个 JS 语法检查通过。浏览器隔离样例验证主机菜单、缩放、访问点内嵌、三台主机/九个 Project（包含空 Project、仅访问点、双部署）及整台主机拖动。多主机样例需要点击 Fit View 才完成全图定位，首次更新后的自动适合视图仍待单独确认。
- 原生安装版读取连续超时；隔离网页结果不是实际用户白板验收。尚不推送，安装版验证仍待完成。
- 修改：relationshipFlowAdapter.js、relationship-canvas/index.jsx、relationshipCanvas.css、relationship-flow-adapter.test.js、visual-fixtures/relationship-flow-engine.*。
- 发布结果：源码提交 `dbdc3cc`；alpha.181 开发包门禁通过（ad-hoc 签名）。已替换 `/Applications/GitFinder 2.app`，Bundle 版本核对为 `2.0.0-alpha.181`，codesign --verify --deep --strict 通过。旧 alpha.179 保存在 `/Volumes/project/制品与备份/GitFinder-2-alpha179-before181.app.disabled`，可恢复。
- 安装后尝试正常启动验收时，桌面工具明确返回 Mac 已锁定且无法自动解锁；不能声称安装版启动或用户白板可见验收完成。未推送。
- 下一步：用户解锁 Mac 后，继续实际白板启动、版本、菜单和三层布局验收。未获得用户确认，不归档“已确认修复”报告。
