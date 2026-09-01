const test = require('node:test');
const assert = require('node:assert/strict');
const { serverTreeGraph, arrangeServerTree, applyProjectEndpointMembership, endpointHostConflicts } = require('../src/shared/panelTopologyProjection');
const Model = require('../src/shared/relationshipGraphModel');

function fixture() {
  const entities = [
    ['server', 'host1'], ['server', 'host2'], ['group', 'group1'], ['group', 'group2'],
    ['deployment', 'app1'], ['deployment', 'app2'], ['deployment', 'app3'],
    ['endpoint', 'end1'], ['endpoint', 'end2'], ['repository', 'repo1']
  ].map(([type, name]) => ({ id: `entity_tree_${name}`, type, name, details: {},
    ...(type === 'repository' ? { refId: 'repo_local_001' } : {}) }));
  const id = name => `entity_tree_${name}`;
  const relationships = [['app1', 'host1', 'runs_on'], ['app1', 'host2', 'runs_on'],
    ['app2', 'host1', 'runs_on'], ['host2', 'app3', 'hosts'], ['app1', 'end1', 'exposes'],
    ['end2', 'app1', 'exposed_by'], ['app3', 'end2', 'exposes'],
    ['repo1', 'app1', 'source_of'], ['repo1', 'app2', 'source_of'], ['app3', 'repo1', 'deployed_from']]
    .map(([from, to, type], i) => ({ id: `relationship_treelink_${i}`, sourceId: id(from), targetId: id(to), type }));
  const placements = entities.map((entity, i) => ({ entityId: entity.id, x: i * 40, y: i * 30,
    ...(entity.type === 'group' ? { groupLayout: 'auto' } : {}),
    ...(['app1', 'app2'].includes(entity.name) ? { groupId: id('group1') } : entity.name === 'app3' ? { groupId: id('group2') } : {}) }));
  return { entities, relationships, placements };
}

test('服务器树状投影保留多主机与多访问点，仓库作为属性而非节点', () => {
  const graph = fixture(), before = JSON.stringify(graph);
  const tree = serverTreeGraph(graph);
  assert.ok(!tree.placements.some(p => p.entityId === 'entity_tree_repo1'));
  assert.equal(tree.repositoryNames.get('entity_tree_app1'), 'repo1');
  const edges = tree.summaryRelationships.map(e => `${e.sourceId}:${e.targetId}`);
  assert.ok(edges.includes('entity_tree_host1:entity_tree_group1'));
  assert.ok(edges.includes('entity_tree_host2:entity_tree_group1'));
  assert.ok(!edges.includes('entity_tree_group1:entity_tree_app1'), '包含关系由容器表达，不从容器边框连向内部卡片');
  assert.equal(tree.relationships.filter(e => ['exposes', 'exposed_by'].includes(e.type)).length, 3);
  assert.ok(!tree.relationships.some(e => ['runs_on', 'hosts'].includes(e.type)));
  assert.ok(!tree.summaryRelationships.some(e => e.type === 'repository_correlation'));
  assert.equal(JSON.stringify(graph), before);
});

test('仓库相关性采用确定身份，跨分支只画 n-1 条无向关系', () => {
  const graph = fixture();
  const tree = serverTreeGraph(graph, true);
  assert.equal(tree.summaryRelationships.filter(e => e.type === 'repository_correlation').length, 2);
  graph.relationships = graph.relationships.filter(e => !['source_of', 'deployed_from'].includes(e.type));
  const apps = graph.entities.filter(e => e.type === 'deployment');
  apps[0].runtime = { repositoryUrl: 'git@github.com:team/source.git' };
  apps[1].runtime = { repositoryUrl: 'https://github.com/team/source' };
  apps[2].runtime = { repositoryUrl: 'team/source' };
  assert.equal(serverTreeGraph(graph, true).summaryRelationships.filter(e => e.type === 'repository_correlation').length, 1);
  apps[1].runtime.repositoryUrl = 'https://gitlab.com/team/source';
  assert.equal(serverTreeGraph(graph, true).summaryRelationships.filter(e => e.type === 'repository_correlation').length, 0);
});

test('树状排列按分支高度留空间，四个层级独立且所有节点保持唯一', () => {
  const graph = fixture(), facts = JSON.stringify(graph.relationships);
  const tree = arrangeServerTree(graph, { width: 280, height: 180, horizontalSpacing: 100, verticalSpacing: 40 });
  const at = name => graph.placements.find(p => p.entityId === `entity_tree_${name}`);
  assert.ok(at('host1').x < at('group1').x && at('group1').x < at('app1').x && at('app1').x < at('end1').x);
  for (const a of tree.placements) for (const b of tree.placements) {
    if (a === b || graph.entities.find(e => e.id === a.entityId).type === 'group' || graph.entities.find(e => e.id === b.entityId).type === 'group') continue;
    assert.ok(!(a.x < b.x + 280 && a.x + 280 > b.x && a.y < b.y + 180 && a.y + 180 > b.y), `${a.entityId} 与 ${b.entityId} 重叠`);
  }
  assert.equal(new Set(graph.placements.map(p => p.entityId)).size, graph.placements.length);
  assert.equal(JSON.stringify(graph.relationships), facts);
});

test('树状显示与仓库相关性开关保存重开，不影响旧白板默认值', () => {
  const graph = fixture();
  const raw = { schemaVersion: 1, activeBoardId: 'board_tree_test', entities: graph.entities,
    relationships: graph.relationships, boards: [{ id: 'board_tree_test', name: 'tree', placements: graph.placements,
      viewport: { x: 0, y: 0, zoom: 0.05 }, view: { topologyLayout: 'server-tree', showRepositoryRelations: true } }] };
  const saved = Model.assertValidStore(JSON.parse(JSON.stringify(raw)));
  assert.equal(saved.boards[0].view.showRepositoryRelations, true);
  assert.equal(saved.boards[0].view.structure, 'server-tree');
  assert.equal(Model.defaultBoardView().showRepositoryRelations, false);
});

test('项目容器包裹部署，可选择包含独占访问点，共享访问点保持外部唯一节点', () => {
  for (const include of [true, false]) {
    const graph = fixture();
    applyProjectEndpointMembership(graph, include);
    arrangeServerTree(graph, { width: 280, height: 180, projectGroupIncludesEndpoints: include });
    const at = name => graph.placements.find(p => p.entityId === `entity_tree_${name}`);
    const group = at('group1'), app = at('app1'), end = at('end1');
    assert.ok(group.x < app.x && group.y < app.y);
    assert.ok(group.x + group.groupWidth >= app.x + 280 && group.y + group.groupHeight >= app.y + 180);
    assert.equal(end.groupId, include ? group.entityId : undefined);
    assert.equal(at('end2').groupId, undefined, '跨项目访问点不被任一项目容器认领');
    assert.equal(group.x + group.groupWidth > end.x, include);
  }
});

test('同一访问点跨主机复用会派生配置警报，并定位全部部署关系', () => {
  const graph = fixture();
  graph.relationships = graph.relationships.filter(edge => edge.id !== 'relationship_treelink_1');
  const alerts = endpointHostConflicts(graph);
  const alert = alerts.find(item => item.endpointId === 'entity_tree_end2');

  assert.equal(alert?.severity, 'error');
  assert.deepEqual(alert.hostIds, ['entity_tree_host1', 'entity_tree_host2']);
  assert.deepEqual(alert.deploymentIds, ['entity_tree_app1', 'entity_tree_app3']);
  assert.deepEqual(alert.relationshipIds, ['relationship_treelink_5', 'relationship_treelink_6']);
  assert.equal(alerts.some(item => item.endpointId === 'entity_tree_end1'), false, '单主机访问点不应警报');
  assert.match(alert.message, /不同主机/);
});

function branchingFixture() {
  const graph = { entities: [{ id: 'host', type: 'server' }], relationships: [], placements: [{ entityId: 'host', x: 0, y: 0, width: 320, height: 180 }] };
  for (let i = 0; i < 4; i++) {
    for (const [suffix, type] of [['group', 'group'], ['app', 'deployment'], ['end', 'endpoint']]) {
      const id = `${suffix}${i}`;
      graph.entities.push({ id, type, name: id });
      graph.placements.push({ entityId: id, x: i * 500, y: i * 300, width: 320, height: i === 1 ? 500 : 180, ...(type === 'group' ? { groupLayout: 'auto' } : {}), ...(type === 'deployment' ? { groupId: `group${i}` } : {}) });
    }
    graph.relationships.push({ sourceId: `app${i}`, targetId: 'host', type: 'runs_on' }, { sourceId: `app${i}`, targetId: `end${i}`, type: 'exposes' });
  }
  return graph;
}

for (const treeLayout of ['right', 'down', 'bilateral', 'radial']) test(`${treeLayout} 树状排列保留事实，项目矩形互不重叠`, () => {
  const graph = branchingFixture(), facts = JSON.stringify(graph.relationships);
  arrangeServerTree(graph, { treeLayout, width: 320, height: 180 });
  const at = id => graph.placements.find(p => p.entityId === id);
  const host = at('host'), groups = graph.entities.filter(e => e.type === 'group').map(e => at(e.id));
  for (const a of groups) for (const b of groups) if (a !== b) {
    assert.ok(!(a.x < b.x + b.groupWidth && a.x + a.groupWidth > b.x && a.y < b.y + b.groupHeight && a.y + a.groupHeight > b.y), `${a.entityId} overlaps ${b.entityId}`);
  }
  if (treeLayout === 'right') assert.ok(groups.every(g => g.x > host.x));
  if (treeLayout === 'down') assert.ok(groups.every(g => g.y > host.y));
  if (['bilateral', 'radial'].includes(treeLayout)) {
    assert.ok(groups.some(g => g.x + g.groupWidth < host.x));
    assert.ok(groups.some(g => g.x > host.x + host.width));
  }
  assert.equal(JSON.stringify(graph.relationships), facts);
  assert.equal(new Set(graph.placements.map(p => p.entityId)).size, graph.placements.length);
});

test('树状排列和项目包含访问点设置可严格保存，旧文件使用向右和包含访问点', () => {
  const graph = fixture();
  for (const treeLayout of ['right', 'down', 'bilateral', 'radial']) {
    const store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_tree_test', entities: graph.entities,
      relationships: graph.relationships, boards: [{ id: 'board_tree_test', name: 'tree', placements: graph.placements,
        viewport: { x: 0, y: 0, zoom: 1 }, view: { topologyLayout: 'server-tree', treeLayout, projectGroupIncludesEndpoints: false } }] });
    assert.equal(store.boards[0].view.layout, treeLayout);
    assert.equal(store.boards[0].view.projectGroupIncludesEndpoints, false);
  }
  assert.equal(Model.defaultBoardView().layout, 'lanes');
  assert.equal(Model.defaultBoardView().projectGroupIncludesEndpoints, true);
});
