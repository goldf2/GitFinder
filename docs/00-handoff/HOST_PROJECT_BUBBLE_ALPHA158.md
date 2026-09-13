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
- alpha.158 安装版与可见白板专项验收待打包后进行。
