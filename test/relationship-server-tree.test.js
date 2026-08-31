const test = require('node:test');
const assert = require('node:assert/strict');
const { serverTreeGraph, arrangeServerTree } = require('../src/shared/panelTopologyProjection');
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
  assert.ok(edges.includes('entity_tree_group1:entity_tree_app1'));
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
    if (a === b) continue;
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
  assert.equal(saved.boards[0].view.topologyLayout, 'server-tree');
  assert.equal(Model.defaultBoardView().showRepositoryRelations, false);
});
