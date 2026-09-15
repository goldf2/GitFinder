# alpha185 筛选后访问点归属

## 2026-09-15 Asia/Shanghai

- 现象：所属部署被筛选隐藏后，正常访问点以独立节点恢复旧坐标，压住 Project 标题。
- 修复：服务器树且访问点内嵌模式下，从完整源拓扑读取隐藏部署的 Project 归属，将独立访问点置于所属 Project 内容区；多访问点逐行排放。名称上方提示所属部署，悬浮说明该部署当前隐藏。
- 只改变渲染输入，不修改源拓扑、部署或原始存储坐标；无可见归属 Project 的真实孤立访问点保留原逻辑。
- `npm run check` 1180 测试、270 JS 语法检查通过。覆盖双访问点归属、避开标题和卡片以及源数据不变。
- macOS 开发/ad-hoc 包与签名检查通过，已替换 `/Applications/GitFinder 2.app`，正常启动显示 alpha.185；旧 alpha.184 已保留在 `/Volumes/project/制品与备份/GitFinder-2-alpha184-before185.app.disabled`。
- 实际白板验证：AL02 的 demo.szxiangshu.com 已进入 My first project 内容区，不再压标题，显示 mes-lite 所属部署提示。随后补充独立访问点排序靠后及长提示省略，1180 测试、270 JS 检查再次通过并重新打包安装；最终安装版启动通过。最终复查期间筛选状态发生变化，最终包隐藏筛选场景未再次完整目测，排序依赖回归验证，不宣称全白板验收。
- 提交 `77400f7`、`eedb199`；产物 `dist/GitFinder-2-2.0.0-alpha.185-arm64-mac.zip`。用户确认待收集。
