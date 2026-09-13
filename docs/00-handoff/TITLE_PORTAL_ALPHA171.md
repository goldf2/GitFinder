# alpha.171 标题定位回归

- 日期：2026-09-14 +0800。
- 根因：alpha.170 用 !important 覆盖 NodeToolbar portal 的 transform/top/left，使标题集中到画布左上角。
- 修复：仅撤销坐标覆盖，新增防止该覆盖复发的测试；不改变资源事实与保存布局。
- 源码提交：f81520c；检查 1171/1171、270 个 JavaScript 文件。
- 制品：dist/GitFinder-2-2.0.0-alpha.171-arm64-mac.zip；开发 ad-hoc 签名，非正式分发包。
- 安装：/Applications/GitFinder 2 Alpha.app；原 alpha.170 在 /Applications/GitFinder 2 Alpha.archive/GitFinder-2-alpha.170-before-171.app。
- 验收：隔离浏览器原尺寸及连续缩小后标题跟随各容器；安装版版本 alpha.171、全图各 Project 标题恢复，测试项目更多菜单成功展开。
- 遗留：全图下主机和首个 Project 标题仍有局部重叠，需要独立处理间距，不覆盖 portal 坐标。尚未收到用户对本次修复有效的确认。
