const test = require('node:test');
const assert = require('node:assert/strict');
const Adapter = require('../src/shared/relationshipFlowAdapter');
const ProjectGalaxyLayout = require('../src/shared/relationshipProjectGalaxyLayout');

function fixture() {
  return {
    entities: [
      { id: 'project', type: 'group', name: '订单系统', details: {}, runtime: { dynamicKind: 'coolify-project-group' } },
      { id: 'deployment', type: 'deployment', name: '生产部署', details: { status: 'running:healthy' } },
      { id: 'endpoint', type: 'endpoint', name: 'orders.example.com', details: { healthState: 'healthy' } },
      { id: 'archived', type: 'deployment', name: '旧部署', details: {} }
    ],
    placements: [
      { entityId: 'project', x: 400, y: 300, groupWidth: 720, groupHeight: 440, groupShape: 'rounded' },
      { entityId: 'deployment', x: 460, y: 390, groupId: 'project' },
      { entityId: 'endpoint', x: 1160, y: 410 },
      { entityId: 'archived', x: 0, y: 0, archived: true }
    ],
    relationships: [
      { id: 'exposes', sourceId: 'deployment', targetId: 'endpoint', type: 'exposes' },
      { id: 'hidden-edge', sourceId: 'archived', targetId: 'endpoint', type: 'exposes' }
    ]
  };
}

test('转换为 React Flow 模型时父容器在子节点之前，子节点使用相对坐标', () => {
  const graph = fixture();
  const before = structuredClone(graph);
  const result = Adapter.toFlowModel(graph, { cardWidth: 280, cardHeight: 143 });
  const projectIndex = result.nodes.findIndex(item => item.id === 'project');
  const deploymentIndex = result.nodes.findIndex(item => item.id === 'deployment');
  const project = result.nodes[projectIndex];
  const deployment = result.nodes[deploymentIndex];

  assert.ok(projectIndex < deploymentIndex);
  assert.equal(project.type, 'relationshipGroup');
  assert.deepEqual(project.style, { width: 720, height: 440 });
  assert.equal(deployment.parentId, 'project');
  assert.equal(deployment.extent, 'parent');
  assert.deepEqual(deployment.position, { x: 60, y: 90 });
  assert.deepEqual(graph, before, '适配不得修改白板数据');
});

test('运行状态显示继承白板设置并允许单卡覆盖', () => {
  const graph = fixture();
  const placement = graph.placements.find(item => item.entityId === 'deployment');

  let node = Adapter.toFlowModel(graph, { showRuntimeStatus: false }).nodes.find(item => item.id === 'deployment');
  assert.equal(node.data.showRuntimeStatus, false);
  placement.statusVisibility = 'show';
  node = Adapter.toFlowModel(graph, { showRuntimeStatus: false }).nodes.find(item => item.id === 'deployment');
  assert.equal(node.data.showRuntimeStatus, true);
  placement.statusVisibility = 'hide';
  node = Adapter.toFlowModel(graph, { showRuntimeStatus: true }).nodes.find(item => item.id === 'deployment');
  assert.equal(node.data.showRuntimeStatus, false);
});

test('Project 内部署拖动时吸附到同级对齐线并保持显示设置间距', () => {
  const graph = fixture();
  graph.entities.push({ id: 'deployment-b', type: 'deployment', name: '预览部署', details: {} });
  graph.placements.push({ entityId: 'deployment-b', x: 812, y: 395, groupId: 'project' });
  const flow = Adapter.toFlowModel(graph, { cardWidth: 280, cardHeight: 143 });

  const snapped = Adapter.snapProjectDeployment(flow.nodes, 'deployment-b', {
    snapMode: 'smart', horizontalSpacing: 64, verticalSpacing: 36, zoom: 1
  });
  const deployment = snapped.find(node => node.id === 'deployment-b');

  assert.deepEqual(deployment.position, { x: 404, y: 90 });
  assert.equal(deployment.data.snapState.horizontal, 'spacing');
  assert.equal(deployment.data.snapState.vertical, 'edge');
});

test('Project 吸附可关闭或用 Option 临时绕过', () => {
  const graph = fixture();
  graph.entities.push({ id: 'deployment-b', type: 'deployment', name: '预览部署', details: {} });
  graph.placements.push({ entityId: 'deployment-b', x: 812, y: 395, groupId: 'project' });
  const flow = Adapter.toFlowModel(graph, { cardWidth: 280, cardHeight: 143 });
  const original = flow.nodes.find(node => node.id === 'deployment-b').position;

  for (const options of [{ snapMode: 'off' }, { snapMode: 'smart', disabled: true }]) {
    const result = Adapter.snapProjectDeployment(flow.nodes, 'deployment-b', {
      ...options, horizontalSpacing: 64, verticalSpacing: 36
    });
    assert.deepEqual(result.find(node => node.id === 'deployment-b').position, original);
  }
});

test('React Flow 连线复用避障路由并绕开中间卡片', () => {
  const graph = {
    entities: [
      { id: 'source', type: 'server', name: '主机', details: {} },
      { id: 'obstacle', type: 'deployment', name: '中间卡片', details: {} },
      { id: 'target', type: 'endpoint', name: '访问点', details: {} }
    ],
    placements: [
      { entityId: 'source', x: 0, y: 0 },
      { entityId: 'obstacle', x: 400, y: 0 },
      { entityId: 'target', x: 800, y: 0 }
    ],
    relationships: [{ id: 'edge', sourceId: 'source', targetId: 'target', type: 'exposes' }]
  };

  const flow = Adapter.toFlowModel(graph, { cardWidth: 280, cardHeight: 143, zoom: 1 });
  const edge = flow.edges[0];
  const obstacle = { x: 400, y: 0, width: 280, height: 143 };
  const inside = point => point.x > obstacle.x && point.x < obstacle.x + obstacle.width
    && point.y > obstacle.y && point.y < obstacle.y + obstacle.height;

  assert.equal(edge.type, 'relationshipEdge');
  assert.match(edge.data.routedPath, /^M /);
  assert.ok(edge.data.routePoints.length > 2);
  assert.equal(edge.data.routePoints.some(inside), false, '连线路径采样点不能穿过中间卡片');
});

test('拓扑配置警报关系使用红色连线并保留警报身份', () => {
  const graph = fixture();
  graph.relationships[0].diagnostic = {
    alertId: 'topology_alert_endpoint_reuse_endpoint',
    code: 'endpoint_reuse_conflict',
    severity: 'error'
  };

  const edge = Adapter.toFlowModel(graph, { cardWidth: 280, cardHeight: 143 }).edges[0];

  assert.equal(edge.className, 'is-topology-alert');
  assert.equal(edge.style.stroke, '#d9485f');
  assert.equal(edge.data.diagnostic.alertId, 'topology_alert_endpoint_reuse_endpoint');
});

test('缩小视图不会把避障安全距放大到堵死 Project 内部通道', () => {
  const nodes = [
    { id: 'group', type: 'relationshipGroup', position: { x: 500, y: 100 }, style: { width: 500, height: 1200 }, data: { entity: { name: '项目' } } },
    ...['source', 'middle-a', 'middle-b', 'middle-c', 'target'].map((id, index) => ({
      id, type: 'relationshipCard', parentId: 'group', position: { x: 100, y: 100 + index * 179 },
      width: 280, height: 143, data: { entity: { name: id } }
    }))
  ];
  const result = Adapter.rerouteFlowConnections(nodes, [{ id: 'dense', source: 'source', target: 'target' }], { zoom: 0.15 });
  const edge = result.edges[0];

  assert.equal(edge.data.obstructed, false);
  assert.ok(edge.data.routePoints.some(point => point.x < 600 || point.x > 880), '路径应从密集卡片列的侧面绕行');
});

test('Project 容器标记会传给全部嵌套成员，越界位置会被约束回容器', () => {
  const graph = fixture();
  graph.entities.push({ id: 'nested', type: 'group', name: '子容器', details: {} });
  graph.placements.push({ entityId: 'nested', x: 1040, y: 650, groupId: 'project', groupWidth: 320, groupHeight: 220 });
  graph.placements.find(item => item.entityId === 'deployment').groupId = 'nested';
  graph.placements.find(item => item.entityId === 'deployment').x = 1280;
  graph.placements.find(item => item.entityId === 'deployment').y = 800;

  const result = Adapter.toFlowModel(graph, { cardWidth: 280, cardHeight: 143 });
  const project = result.nodes.find(item => item.id === 'project');
  const nested = result.nodes.find(item => item.id === 'nested');
  const deployment = result.nodes.find(item => item.id === 'deployment');
  const written = new Map(Adapter.toPlacements(result.nodes, graph.placements).map(item => [item.entityId, item]));

  assert.equal(project.data.isProjectContainer, true);
  assert.equal(nested.data.projectAncestorId, 'project');
  assert.equal(deployment.data.projectAncestorId, 'project');
  assert.ok(written.get('nested').x + written.get('nested').groupWidth <= written.get('project').x + written.get('project').groupWidth);
  assert.ok(written.get('nested').y + written.get('nested').groupHeight <= written.get('project').y + written.get('project').groupHeight);
});

test('多边形 Project 边界约束不压缩自动排列产生的卡片间距', () => {
  const groupId = 'entity_panel_projectgroup_flow_spacing';
  const deploymentIds = ['entity_flow_spacing_a', 'entity_flow_spacing_b', 'entity_flow_spacing_c'];
  const graph = {
    entities: [
      { id: groupId, type: 'group', name: 'Project', details: {} },
      ...deploymentIds.map(id => ({ id, type: 'deployment', name: id, details: {} }))
    ],
    placements: [
      { entityId: groupId, x: 0, y: 0, groupWidth: 420, groupHeight: 420, groupShape: 'polygon' },
      ...deploymentIds.map(id => ({ entityId: id, x: 0, y: 0, groupId }))
    ],
    relationships: []
  };
  const group = graph.placements[0];
  const members = graph.placements.slice(1);
  ProjectGalaxyLayout.arrangeInterior(group, members, {
    width: 236,
    height: 94,
    horizontalSpacing: 16,
    verticalSpacing: 16,
    projectGroupShape: 'polygon'
  });
  const flow = Adapter.toFlowModel(graph, { cardWidth: 236, cardHeight: 94 });
  const written = new Map(Adapter.toPlacements(flow.nodes, graph.placements).map(item => [item.entityId, item]));
  for (let left = 0; left < deploymentIds.length; left++) for (let right = left + 1; right < deploymentIds.length; right++) {
    const a = written.get(deploymentIds[left]), b = written.get(deploymentIds[right]);
    const horizontalGap = Math.max(a.x, b.x) - Math.min(a.x + 236, b.x + 236);
    const verticalGap = Math.max(a.y, b.y) - Math.min(a.y + 94, b.y + 94);
    assert.ok(horizontalGap >= 16 || verticalGap >= 16,
      `${deploymentIds[left]} 与 ${deploymentIds[right]} 不应被边界约束压成堆叠`);
  }
});

test('联动拖动只平移没有联动祖先的根节点，避免容器和成员重复位移', () => {
  const flow = Adapter.toFlowModel(fixture(), { linkedNodeIds: { project: ['project', 'deployment', 'endpoint'] } });
  const startPositions = Object.fromEntries(flow.nodes.map(node => [node.id, { ...node.position }]));
  const shifted = Adapter.applyLinkedDrag(flow.nodes, {
    primaryId: 'project',
    linkedIds: ['project', 'deployment', 'endpoint'],
    startPositions,
    delta: { x: 40, y: 25 },
    changedIds: ['project']
  });
  const byId = new Map(shifted.map(node => [node.id, node]));

  assert.deepEqual(byId.get('deployment').position, startPositions.deployment, '成员跟随父容器，不能再加一次位移');
  assert.deepEqual(byId.get('endpoint').position, { x: startPositions.endpoint.x + 40, y: startPositions.endpoint.y + 25 });
  assert.deepEqual(byId.get('project').data.linkedNodeIds, ['project', 'deployment', 'endpoint']);
});

test('适配器过滤归档节点和悬空关系，并按几何方向选择连接点', () => {
  const result = Adapter.toFlowModel(fixture(), { cardWidth: 280, cardHeight: 143 });
  assert.deepEqual(new Set(result.nodes.map(item => item.id)), new Set(['project', 'deployment', 'endpoint']));
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].sourceSide, 'right');
  assert.equal(result.edges[0].targetSide, 'left');
  assert.equal(result.edges[0].type, 'relationshipEdge');
});

test('斜向关系比较全部边缘锚点并选择实际最短组合', () => {
  const graph = fixture();
  const endpoint = graph.placements.find(item => item.entityId === 'endpoint');
  endpoint.x = 760;
  endpoint.y = 620;
  const result = Adapter.toFlowModel(graph, { cardWidth: 280, cardHeight: 143 });
  assert.equal(result.edges[0].sourceSide, 'right');
  assert.equal(result.edges[0].targetSide, 'top');
});

test('同一节点同侧的多条关系复用一个中心连接点', () => {
  const graph = {
    entities: [
      { id: 'host', type: 'server', name: '主机', details: {} },
      ...['a', 'b', 'c', 'd'].map(id => ({ id, type: 'group', name: id, details: {} }))
    ],
    placements: [
      { entityId: 'host', x: 0, y: 360 },
      { entityId: 'a', x: 700, y: 0, groupWidth: 320, groupHeight: 180 },
      { entityId: 'b', x: 700, y: 240, groupWidth: 320, groupHeight: 180 },
      { entityId: 'c', x: 700, y: 480, groupWidth: 320, groupHeight: 180 },
      { entityId: 'd', x: 700, y: 720, groupWidth: 320, groupHeight: 180 }
    ],
    relationships: ['a', 'b', 'c', 'd'].map(id => ({
      id: `host-${id}`, sourceId: 'host', targetId: id, type: 'contains'
    }))
  };

  const result = Adapter.toFlowModel(graph);
  const sourceHandles = result.edges.map(edge => edge.sourceHandle);
  const hostHandles = result.nodes.find(node => node.id === 'host').data.connectionHandles;

  assert.deepEqual([...new Set(sourceHandles)], ['source-right']);
  assert.ok(result.edges.every(edge => edge.sourceSide === 'right'));
  assert.deepEqual(hostHandles, [{ id: 'source-right', side: 'right', type: 'source', offset: 50 }]);
  assert.ok(result.edges.every(edge => edge.sourceOffset === 50));
});

test('节点移动到另一侧后可复用路由器重新选择最短连接边', () => {
  const initial = Adapter.toFlowModel(fixture());
  const initialEdge = initial.edges.find(item => item.id === 'exposes');
  const endpoint = initial.nodes.find(node => node.id === 'endpoint');
  endpoint.position = { x: 0, y: 410 };

  const rerouted = Adapter.rerouteFlowConnections(initial.nodes, initial.edges);
  const edge = rerouted.edges.find(item => item.id === 'exposes');

  assert.equal(edge.sourceSide, 'left');
  assert.equal(edge.targetSide, 'right');
  assert.equal(edge.sourceHandle, 'source-left');
  assert.equal(edge.targetHandle, 'target-right');
  assert.notEqual(edge.sourceHandle, initialEdge.sourceHandle, '连接点身份应随最短侧边一起更新');
  assert.notEqual(edge.targetHandle, initialEdge.targetHandle, '子节点连接点也应随最短侧边一起更新');
});

test('React Flow 相对坐标和容器尺寸可写回原格式而不改变成员关系', () => {
  const graph = fixture();
  const flow = Adapter.toFlowModel(graph, { cardWidth: 280, cardHeight: 143 });
  const project = flow.nodes.find(item => item.id === 'project');
  const deployment = flow.nodes.find(item => item.id === 'deployment');
  project.position = { x: 500, y: 200 };
  project.measured = { width: 800, height: 500 };
  deployment.position = { x: 80, y: 120 };

  const placements = Adapter.toPlacements(flow.nodes, graph.placements);
  const byId = new Map(placements.map(item => [item.entityId, item]));
  assert.deepEqual([byId.get('project').x, byId.get('project').y], [500, 200]);
  assert.deepEqual([byId.get('project').groupWidth, byId.get('project').groupHeight], [800, 500]);
  assert.deepEqual([byId.get('deployment').x, byId.get('deployment').y], [580, 320]);
  assert.equal(byId.get('deployment').groupId, 'project');
  assert.equal(byId.get('archived').archived, true);
});

test('嵌套容器写回时递归还原绝对坐标', () => {
  const graph = fixture();
  graph.entities.push({ id: 'nested', type: 'group', name: '子组', details: {} });
  graph.placements.push({ entityId: 'nested', x: 700, y: 500, groupId: 'project', groupWidth: 320, groupHeight: 220 });
  graph.placements.find(item => item.entityId === 'deployment').groupId = 'nested';
  graph.placements.find(item => item.entityId === 'deployment').x = 740;
  graph.placements.find(item => item.entityId === 'deployment').y = 560;
  const flow = Adapter.toFlowModel(graph);
  const nested = flow.nodes.find(item => item.id === 'nested');
  const deployment = flow.nodes.find(item => item.id === 'deployment');
  assert.deepEqual(nested.position, { x: 300, y: 200 });
  assert.deepEqual(deployment.position, { x: 40, y: 60 });
  assert.deepEqual(Adapter.toPlacements(flow.nodes, graph.placements)
    .find(item => item.entityId === 'deployment'), graph.placements.find(item => item.entityId === 'deployment'));
});

test('新引擎可将锁定分支根节点标记为不可拖动', () => {
  const graph = fixture();
  const model = Adapter.toFlowModel(graph, { undraggableIds: ['endpoint'] });
  assert.equal(model.nodes.find(node => node.id === 'endpoint').draggable, false);
  assert.equal(model.nodes.find(node => node.id === 'deployment').draggable, true);
});
