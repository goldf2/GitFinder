const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Model = require('../src/shared/relationshipGraphModel');
const Projection = require('../src/shared/panelTopologyProjection');
const FlowAdapter = require('../src/shared/relationshipFlowAdapter');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function fixture() {
  const entities = [{ id: 'entity_galaxy_host', type: 'server', name: '主机', details: {} }];
  const placements = [{ entityId: 'entity_galaxy_host', x: 0, y: 0 }];
  const relationships = [];
  for (let project = 0; project < 2; project++) {
    const groupId = `entity_panel_projectgroup_galaxy${project}`;
    entities.push({ id: groupId, type: 'group', name: `Project ${project}`, details: {} });
    placements.push({ entityId: groupId, x: project * 1200, y: 0, groupLayout: 'auto' });
    for (let app = 0; app < 4; app++) {
      const appId = `entity_galaxy_app${project}_${app}`, endpointId = `entity_galaxy_end${project}_${app}`;
      entities.push({ id: appId, type: 'deployment', name: `App ${project}-${app}`, details: {} },
        { id: endpointId, type: 'endpoint', name: `site${project}${app}.example.com`, details: {} });
      placements.push({ entityId: appId, x: project * 1200 + app * 30, y: app * 30, groupId },
        { entityId: endpointId, x: project * 1200, y: 800 + app * 40, groupId });
      relationships.push({ id: `relationship_galaxy_run${project}_${app}`, sourceId: appId, targetId: 'entity_galaxy_host', type: 'runs_on' },
        { id: `relationship_galaxy_expose${project}_${app}`, sourceId: appId, targetId: endpointId, type: 'exposes' });
    }
  }
  entities.push({ id: 'entity_galaxy_shared', type: 'endpoint', name: 'shared.example.com', details: {} });
  placements.push({ entityId: 'entity_galaxy_shared', x: 1000, y: 600 });
  relationships.push({ id: 'relationship_galaxy_shared0', sourceId: 'entity_galaxy_app0_0', targetId: 'entity_galaxy_shared', type: 'exposes' },
    { id: 'relationship_galaxy_shared1', sourceId: 'entity_galaxy_app1_0', targetId: 'entity_galaxy_shared', type: 'exposes' });
  return { entities, placements, relationships };
}

function singleProjectFixture() {
  const groupId = 'entity_panel_projectgroup_single';
  const deploymentId = 'entity_galaxy_single_app';
  const endpointId = 'entity_galaxy_single_endpoint';
  return {
    entities: [
      { id: groupId, type: 'group', name: 'Single Project', details: {} },
      { id: deploymentId, type: 'deployment', name: 'Single App', details: {} },
      { id: endpointId, type: 'endpoint', name: 'single.example.com', details: {} }
    ],
    placements: [
      { entityId: groupId, x: 0, y: 0, groupLayout: 'auto' },
      { entityId: deploymentId, x: 0, y: 0, groupId },
      { entityId: endpointId, x: 0, y: 0, groupId }
    ],
    relationships: [
      { id: 'relationship_galaxy_single_expose', sourceId: deploymentId, targetId: endpointId, type: 'exposes' }
    ]
  };
}

test('项目星系将部署置于 Project 内、访问点置于外围，共享访问点保持唯一', () => {
  const graph = fixture(), beforeMembership = graph.placements.map(p => [p.entityId, p.groupId || '']);
  const facts = structuredClone(graph.relationships);
  Projection.arrangeProjectGalaxies(graph, { width: 280, height: 143, horizontalSpacing: 64, verticalSpacing: 36,
    viewportAspectRatio: 1.6, projectGroupShape: 'rounded' });
  const byId = new Map(graph.placements.map(p => [p.entityId, p]));
  for (let project = 0; project < 2; project++) {
    const group = byId.get(`entity_panel_projectgroup_galaxy${project}`);
    for (let app = 0; app < 4; app++) {
      const deployment = byId.get(`entity_galaxy_app${project}_${app}`), endpoint = byId.get(`entity_galaxy_end${project}_${app}`);
      const inside = item => item.x >= group.x && item.y >= group.y
        && item.x + 280 <= group.x + group.groupWidth && item.y + 143 <= group.y + group.groupHeight;
      assert.equal(inside(deployment), true, '部署卡片完整位于 Project 内部');
      assert.equal(inside(endpoint), false, '访问点位于 Project 外围');
      assert.equal(endpoint.groupId, group.entityId, '布局不改变访问点的逻辑归属');
    }
  }
  const shared = graph.placements.filter(p => p.entityId === 'entity_galaxy_shared');
  assert.equal(shared.length, 1); assert.equal(shared[0].groupId, undefined);
  const sharedRect = { ...shared[0], width: 280, height: 143 };
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const item of graph.placements.filter(p => p.entityId !== shared[0].entityId)) {
    const rect = item.groupWidth ? { ...item, width: item.groupWidth, height: item.groupHeight }
      : { ...item, width: 280, height: 143 };
    assert.equal(overlaps(sharedRect, rect), false, `共享访问点不遮挡 ${item.entityId}`);
  }
  assert.deepEqual(graph.placements.map(p => [p.entityId, p.groupId || '']), beforeMembership);
  assert.deepEqual(graph.relationships, facts);
  const first = structuredClone(graph.placements);
  Projection.arrangeProjectGalaxies(graph, { width: 280, height: 143, horizontalSpacing: 64, verticalSpacing: 36,
    viewportAspectRatio: 1.6, projectGroupShape: 'rounded' });
  assert.deepEqual(graph.placements, first, '重复整理结果稳定');
});

test('项目星系的矩形容器按内部部署收紧，外围访问点不撑大容器', () => {
  const graph = singleProjectFixture();
  const membership = graph.placements.map(item => [item.entityId, item.groupId || '']);
  Projection.arrangeProjectGalaxies(graph, { width: 280, height: 143, horizontalSpacing: 64, verticalSpacing: 36,
    projectGroupShape: 'rounded' });
  const byId = new Map(graph.placements.map(item => [item.entityId, item]));
  const group = byId.get('entity_panel_projectgroup_single');
  const deployment = byId.get('entity_galaxy_single_app');
  const endpoint = byId.get('entity_galaxy_single_endpoint');
  assert.ok(group.groupWidth < 560, '单卡 Project 不应保留旧的超大圆直径');
  assert.ok(group.groupHeight < 286, '容器高度只由内部部署与内边距决定');
  assert.ok(deployment.x >= group.x && deployment.x + 280 <= group.x + group.groupWidth);
  assert.ok(deployment.y >= group.y && deployment.y + 143 <= group.y + group.groupHeight);
  assert.ok(endpoint.x + 280 <= group.x || endpoint.x >= group.x + group.groupWidth
    || endpoint.y + 143 <= group.y || endpoint.y >= group.y + group.groupHeight);
  assert.deepEqual(graph.placements.map(item => [item.entityId, item.groupId || '']), membership);
});

test('项目星系外围访问点避开固定大小的 Project 标题区域', () => {
  const graph = singleProjectFixture();
  Projection.applyProjectEndpointMembership(graph, false);
  Projection.arrangeProjectGalaxies(graph, {
    width: 280,
    height: 143,
    horizontalSpacing: 64,
    verticalSpacing: 36,
    projectGroupShape: 'rounded',
    projectGroupIncludesEndpoints: false,
    groupTitleSpace: 200
  });
  const byId = new Map(graph.placements.map(item => [item.entityId, item]));
  const group = byId.get('entity_panel_projectgroup_single');
  const endpoint = byId.get('entity_galaxy_single_endpoint');
  const title = {
    x: group.x - 500,
    y: group.y - 200,
    width: group.groupWidth + 1000,
    height: 200
  };
  const overlaps = (left, right) => left.x < right.x + right.width && left.x + left.width > right.x
    && left.y < right.y + right.height && left.y + left.height > right.y;

  assert.equal(overlaps({ ...endpoint, width: 280, height: 143 }, title), false,
    '外围卡片不能占用 Project 标题所在的顶部通道');
});

test('项目星系服从“项目组包含访问点”，开启时放入容器、关闭时才环绕外围', () => {
  const contains = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y
    && inner.x + 280 <= outer.x + outer.groupWidth
    && inner.y + 143 <= outer.y + outer.groupHeight;
  for (const include of [true, false]) {
    const graph = singleProjectFixture();
    Projection.applyProjectEndpointMembership(graph, include);
    Projection.arrangeProjectGalaxies(graph, { width: 280, height: 143, horizontalSpacing: 64, verticalSpacing: 36,
      projectGroupShape: 'rounded', projectGroupIncludesEndpoints: include });
    const byId = new Map(graph.placements.map(item => [item.entityId, item]));
    const group = byId.get('entity_panel_projectgroup_single');
    const endpoint = byId.get('entity_galaxy_single_endpoint');
    assert.equal(endpoint.groupId, include ? group.entityId : undefined);
    assert.equal(contains(group, endpoint), include);
  }
});

test('同一星系布局可独立预置矩形和多边形容器', () => {
  const dimensions = new Map();
  for (const shape of ['rounded', 'polygon']) {
    const graph = singleProjectFixture();
    Projection.arrangeProjectGalaxies(graph, { width: 280, height: 143, horizontalSpacing: 64, verticalSpacing: 36,
      projectGroupShape: shape });
    const group = graph.placements.find(item => item.entityId === 'entity_panel_projectgroup_single');
    dimensions.set(shape, [group.groupWidth, group.groupHeight]);
  }
  assert.notEqual(dimensions.get('rounded')[0], dimensions.get('rounded')[1]);
  assert.equal(dimensions.get('polygon')[0], dimensions.get('polygon')[1]);
});

test('非星系视图中的 Project 自动排列保持开启并恢复成员间距', () => {
  const groupId = 'entity_panel_projectgroup_spacing';
  const deployments = ['entity_deploy_a', 'entity_deploy_b', 'entity_deploy_c'];
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({
    schemaVersion: 1,
    activeBoardId: 'board_project_spacing',
    entities: [
      { id: groupId, type: 'group', name: 'Spacing Project', details: {} },
      ...deployments.map(id => ({ id, type: 'deployment', name: id, details: {} }))
    ],
    relationships: [],
    boards: [{
      id: 'board_project_spacing',
      name: 'Project spacing',
      placements: [
        { entityId: groupId, x: 500, y: 300, groupWidth: 420, groupHeight: 420, groupShape: 'polygon', groupLayout: 'auto' },
        ...deployments.map(id => ({ entityId: id, x: 590, y: 440, groupId }))
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { structure: 'server-tree', layout: 'right', projectGroupShape: 'polygon', horizontalSpacing: 64, verticalSpacing: 36 }
    }]
  });
  for (const name of ['_renderGraph', '_refreshHistoryButtons', '_persistSoon', '_persistDynamicLayoutsSoon', '_updateSummary']) c[name] = () => {};

  c._toggleGroupLayout(groupId);

  const group = c._placementForEntity(groupId);
  const members = deployments.map(id => c._placementForEntity(id));
  assert.equal(group.groupLayout, 'auto', 'Project 的自动排列按钮应执行重排，不应把已经开启的状态关闭');
  assert.equal(group.groupWidth, group.groupHeight, '多边形只是显示形状，但重排后仍保持等比容器');
  assert.deepEqual([group.x + group.groupWidth / 2, group.y + group.groupHeight / 2], [710, 510],
    '单个 Project 重排只调整内部尺寸和位置，不应让整个容器跳走');
  for (let left = 0; left < members.length; left++) for (let right = left + 1; right < members.length; right++) {
    const a = members[left], b = members[right];
    const horizontalGap = Math.max(a.x, b.x) - Math.min(a.x + 280, b.x + 280);
    const verticalGap = Math.max(a.y, b.y) - Math.min(a.y + 143, b.y + 143);
    assert.ok(horizontalGap >= 64 || verticalGap >= 36,
      `${a.entityId} 与 ${b.entityId} 应遵循显示设置中的卡片间距`);
  }
});

test('非星系全局整理会重算 Project 边界，不把成员留在旧容器中堆叠', () => {
  const groupId = 'entity_panel_projectgroup_global_stack';
  const deploymentIds = Array.from({ length: 8 }, (_, index) => `entity_global_stack_${index}`);
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({
    schemaVersion: 1,
    activeBoardId: 'board_global_stack',
    entities: [
      { id: groupId, type: 'group', name: 'Global Circle Project', details: {} },
      ...deploymentIds.map(id => ({ id, type: 'deployment', name: id, details: {} }))
    ],
    relationships: [],
    boards: [{
      id: 'board_global_stack',
      name: 'Global Stack',
      placements: [
        { entityId: groupId, x: 100, y: 100, groupWidth: 1800, groupHeight: 520, groupShape: 'rounded', groupLayout: 'auto' },
        ...deploymentIds.map((id, index) => ({ entityId: id, x: 180 + index * 12, y: 240 + index * 8, groupId }))
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { structure: 'coolify-projects', layout: 'compact', projectGroupShape: 'rounded', horizontalSpacing: 64, verticalSpacing: 36 }
    }]
  });
  for (const name of ['_persistSoon', '_persistDynamicLayoutsSoon']) c[name] = () => {};

  c._arrangeCurrentLayout();
  const placements = c._unarchivedPlacements();
  const input = c._flowGraphInput({ placements, relationships: [], summaryRelationships: [] }, []);
  const flow = FlowAdapter.toFlowModel(input, { ...c._nodeDimensions(), groupTitleFontSize: 20 });
  const nodes = new Map(flow.nodes.map(node => [node.id, node]));
  const group = nodes.get(groupId);
  const absolute = id => {
    const node = nodes.get(id);
    return { x: group.position.x + node.position.x, y: group.position.y + node.position.y,
      width: Number(node.style.width), height: Number(node.style.height) };
  };
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;

  assert.ok(group.style.width < 1800, '自动整理后应收紧旧容器宽度');
  const cards = deploymentIds.map(absolute);
  assert.ok(new Set(cards.map(card => Math.round(card.x))).size >= 2,
    '多卡 Project 应自适应为多列，而不是把容器无限拉高');
  for (let left = 0; left < cards.length; left++) for (let right = left + 1; right < cards.length; right++) {
    assert.equal(overlaps(cards[left], cards[right]), false, `${deploymentIds[left]} 与 ${deploymentIds[right]} 不得堆叠`);
  }
  const first = c._combinedPlacements().map(item => [item.entityId, item.x, item.y, item.groupWidth, item.groupHeight]);
  c._arrangeCurrentLayout();
  assert.deepEqual(c._combinedPlacements().map(item => [item.entityId, item.x, item.y, item.groupWidth, item.groupHeight]), first,
    '重复整理必须稳定');
});

test('拖动 Project 内部署后按新位置重排，并持续保持显示间距', () => {
  const groupId = 'entity_panel_projectgroup_settle';
  const deploymentIds = ['entity_settle_a', 'entity_settle_b', 'entity_settle_c'];
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({
    schemaVersion: 1,
    activeBoardId: 'board_project_settle',
    entities: [
      { id: groupId, type: 'group', name: 'Settle Project', details: {} },
      ...deploymentIds.map(id => ({ id, type: 'deployment', name: id, details: {} }))
    ],
    relationships: [],
    boards: [{
      id: 'board_project_settle',
      name: 'Project settle',
      placements: [
        { entityId: groupId, x: 500, y: 300, groupWidth: 420, groupHeight: 420, groupShape: 'rounded', groupLayout: 'auto' },
        { entityId: deploymentIds[0], x: 590, y: 520, groupId },
        { entityId: deploymentIds[1], x: 590, y: 720, groupId },
        { entityId: deploymentIds[2], x: 590, y: 340, groupId }
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { structure: 'server-tree', layout: 'right', projectGroupShape: 'rounded', horizontalSpacing: 64, verticalSpacing: 36 }
    }]
  });
  for (const name of ['_renderGraph', '_persistSoon', '_updateSummary', '_setCanvasAnnouncement']) c[name] = () => {};

  assert.equal(c._settleProjectDeployment(deploymentIds[2]), true);

  const members = deploymentIds.map(id => c._placementForEntity(id));
  const ordered = [...members].sort((a, b) => a.y - b.y || a.x - b.x);
  assert.equal(ordered[0].entityId, deploymentIds[2], '拖到前方的部署应成为自动排列的第一项');
  for (let left = 0; left < ordered.length; left++) for (let right = left + 1; right < ordered.length; right++) {
    const a = ordered[left], b = ordered[right];
    const horizontalGap = Math.max(a.x, b.x) - Math.min(a.x + 280, b.x + 280);
    const verticalGap = Math.max(a.y, b.y) - Math.min(a.y + 143, b.y + 143);
    assert.ok(horizontalGap >= 64 || verticalGap >= 36, '自适应网格应持续跟随显示设置中的间距');
  }
});

test('星系布局保留非 Project 群组的成员关系和相对位置', () => {
  const graph = singleProjectFixture();
  graph.entities.push(
    { id: 'entity_manual_group', type: 'group', name: '手动群组', details: {} },
    { id: 'entity_manual_server', type: 'server', name: '群组内主机', details: {} },
    { id: 'entity_manual_nested', type: 'group', name: '嵌套群组', details: {} },
    { id: 'entity_manual_repository', type: 'repository', name: '嵌套仓库', details: {} }
  );
  graph.placements.push(
    { entityId: 'entity_manual_group', x: 900, y: 240, groupWidth: 520, groupHeight: 360 },
    { entityId: 'entity_manual_server', x: 960, y: 330, groupId: 'entity_manual_group' },
    { entityId: 'entity_manual_nested', x: 1110, y: 480, groupId: 'entity_manual_group', groupWidth: 240, groupHeight: 180 },
    { entityId: 'entity_manual_repository', x: 1150, y: 520, groupId: 'entity_manual_nested' }
  );
  const before = new Map(graph.placements.map(item => [item.entityId, { x: item.x, y: item.y, groupId: item.groupId }]));
  Projection.arrangeProjectGalaxies(graph, { width: 280, height: 143, horizontalSpacing: 64, verticalSpacing: 36,
    projectGroupShape: 'polygon' });
  const after = new Map(graph.placements.map(item => [item.entityId, item]));
  const rootBefore = before.get('entity_manual_group'), rootAfter = after.get('entity_manual_group');
  for (const id of ['entity_manual_server', 'entity_manual_nested', 'entity_manual_repository']) {
    assert.equal(after.get(id).x - rootAfter.x, before.get(id).x - rootBefore.x, `${id} 横向相对位置不变`);
    assert.equal(after.get(id).y - rootAfter.y, before.get(id).y - rootBefore.y, `${id} 纵向相对位置不变`);
    assert.equal(after.get(id).groupId, before.get(id).groupId, `${id} 逻辑归属不变`);
  }
});

test('正式控制器保存项目星系布局，外围访问点不撑大 Project 容器', () => {
  const graph = fixture();
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_galaxy_demo', entities: graph.entities,
    relationships: graph.relationships, boards: [{ id: 'board_galaxy_demo', name: '项目星系', placements: graph.placements,
      viewport: { x: 0, y: 0, zoom: 1 }, view: { structure: 'server-tree', layout: 'galaxy', projectGroupIncludesEndpoints: false } }] });
  for (const name of ['render', '_renderGraph', '_refreshHistoryButtons', '_persistSoon', '_persistDynamicLayoutsSoon', 'fitContent', '_updateSummary']) c[name] = () => {};
  c._arrangeCurrentLayout();
  const geometry = c._displayGeometryMap(c._unarchivedPlacements());
  const group = geometry.get('entity_panel_projectgroup_galaxy0'), endpoint = geometry.get('entity_galaxy_end0_0');
  assert.ok(group.width > 0 && group.height > 0);
  assert.ok(endpoint.x + endpoint.width < group.x || endpoint.x > group.x + group.width
    || endpoint.y + endpoint.height < group.y || endpoint.y > group.y + group.height, '外围访问点不被容器重新吞入');
  assert.match(c._layoutMenuHtml(), /data-board-layout="galaxy"/);
});

test('正式控制器切换“项目组包含访问点”后立即更新归属和星系位置', () => {
  const graph = singleProjectFixture();
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_galaxy_membership', entities: graph.entities,
    relationships: graph.relationships, boards: [{ id: 'board_galaxy_membership', name: '项目星系', placements: graph.placements,
      viewport: { x: 0, y: 0, zoom: 1 }, view: { structure: 'server-tree', layout: 'galaxy', projectGroupIncludesEndpoints: false } }] });
  for (const name of ['render', '_renderGraph', '_refreshHistoryButtons', '_persistSoon', '_persistDynamicLayoutsSoon', 'fitContent', '_updateSummary']) c[name] = () => {};
  const inside = () => {
    const geometry = c._displayGeometryMap(c._unarchivedPlacements());
    const group = geometry.get('entity_panel_projectgroup_single');
    const endpoint = geometry.get('entity_galaxy_single_endpoint');
    return endpoint.x >= group.x && endpoint.y >= group.y
      && endpoint.x + endpoint.width <= group.x + group.width
      && endpoint.y + endpoint.height <= group.y + group.height;
  };
  c._setProjectEndpoints(true);
  assert.equal(c._placementForEntity('entity_galaxy_single_endpoint').groupId, 'entity_panel_projectgroup_single');
  assert.equal(inside(), true);
  c._setProjectEndpoints(false);
  assert.equal(c._placementForEntity('entity_galaxy_single_endpoint').groupId, undefined);
  assert.equal(inside(), false);
});

test('项目星系根样式状态不复用布局菜单的事件属性', () => {
  const controllerSource = fs.readFileSync(require.resolve('../src/renderer/scripts/relationshipBoardController'), 'utf8');
  const css = fs.readFileSync(require.resolve('../src/renderer/relationship-canvas/relationshipCanvas.css'), 'utf8');
  assert.match(controllerSource, /dataset\.activeBoardLayout\s*=\s*this\._boardView\(\)\.layout/);
  assert.doesNotMatch(controllerSource, /this\.root\.dataset\.boardLayout\s*=/);
  assert.doesNotMatch(css, /\.gf-flow-group\.is-circle/);
});

test('Project 容器形状由显示设置控制，圆形选项已移除', () => {
  const css = fs.readFileSync(require.resolve('../src/renderer/relationship-canvas/relationshipCanvas.css'), 'utf8');
  const source = fs.readFileSync(require.resolve('../src/renderer/scripts/relationshipBoardController'), 'utf8');
  assert.match(source, /name="projectGroupShape"/);
  assert.match(source, /data\.get\('projectGroupShape'\)/);
  assert.doesNotMatch(source, /option value="circle"/);
  assert.doesNotMatch(css, /\.gf-flow-group\.is-circle/);
  assert.match(css, /\.gf-flow-group\.is-polygon/);
  assert.doesNotMatch(css, /data-active-board-layout="galaxy"/);
});

test('星系中的全局自动排列执行重排而不是关闭 Project 内部逻辑', () => {
  const graph = fixture();
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_galaxy_auto', entities: graph.entities,
    relationships: graph.relationships, boards: [{ id: 'board_galaxy_auto', name: '项目星系', placements: graph.placements,
      viewport: { x: 0, y: 0, zoom: 1 }, view: { structure: 'server-tree', layout: 'galaxy' } }] });
  let arranged = 0;
  c._recordMutation = () => {}; c._arrangeCurrentLayout = () => { arranged++; };
  for (const name of ['_renderGraph', 'fitContent', '_refreshHistoryButtons', '_updateSummary', '_setCanvasAnnouncement']) c[name] = () => {};
  c._toggleAllGroupLayouts();
  assert.equal(arranged, 1);
  assert.ok(c._autoLayoutGroups().filter(group => c._isProjectGroup(group.entityId)).every(group => group.groupLayout === 'auto'));
});
