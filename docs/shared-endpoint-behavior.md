# 复用访问点的显示规则

适用版本：2.0.0-alpha.96。

- 一个访问地址绑定两个及以上部署，即使这些部署属于同一主机、同一 Project，也派生一条配置警报。保留全部真实部署关系。
- 复用访问点不作为任一 Project 的成员，呈现为独立浮动卡片。普通拖动容器不会强制带走它；“固定下级”仍沿用只有所有部署来源同时移动才允许共享访问点跟随的规则。
- 部署与该访问点的连线为红色；左上角显示警报数量，点击可查看涉及部署、主机和定位访问点。
- 跨 Coolify 数据源的相同地址合并显示。HTTP/HTTPS 默认端口根地址视为同一域名；不同路径、查询参数或非默认端口不盲目合并。
- 单来源沿用原访问点 ID；合并时优先保留已保存的来源 ID。旧别名在显示和导出时映射到代表节点，原始快照不被删除。实时检测使用各来源中最新的检测结果。
- 旧布局里错误保存的共享成员归属会解除，并把卡片移到容器外；普通筛选不改变配置关系。归档显示策略沿用既有行为。

实现分工：`panelTopologyProjection.js` 负责跨来源识别、检测聚合；`relationshipProjectStructure.js` 负责归属与警报；`relationshipProjectGalaxyLayout.js` 负责布局；控制器负责旧布局兼容和现有警报界面。没有新增第二套警报或连线样式。

回归入口：`test/panel-shared-endpoint.test.js`、`test/relationship-shared-endpoint.test.js`，以及既有 linked-drag、server-tree、project-galaxy、board-ui 测试。
