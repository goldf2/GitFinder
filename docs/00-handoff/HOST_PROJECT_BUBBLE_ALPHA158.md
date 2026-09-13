# alpha.158 · 主机 Project 气泡关系

## 变更

- 服务器树视图中，主机与 Project 的层级关系改为视图层主机气泡包裹。
- 移除主机到 Project 的长摘要线，减少缩放时的视觉噪声。
- Project 容器仍包裹部署，部署到访问点的关系线保留。
- 气泡是 React Flow 的只读视觉节点，不写入白板 placements，不改变 Coolify 事实或 Project 归属。
- 路由避障忽略气泡边界，避免气泡本身干扰部署与访问点连线。

## 验证

- 新增“主机气泡、不绘制主机 Project 长线、Project 仍包裹部署”的回归测试。
- 1160 项测试通过，270 个 JavaScript 文件语法检查通过，`git diff --check` 通过。
- alpha.158 macOS arm64 开发包完成，发布产物门禁无错误，签名为 ad-hoc。
- 已替换并重启 `/Applications/GitFinder 2 Alpha.app`，AX 显示版本 `2.0.0-alpha.158`。本机缓存恢复后可见 con01、AL02、AL03 三个主机气泡及“主机归属”说明；主机到 Project 的 Edge 不再出现，部署与访问点连线仍保留。
