const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
const Projection = require('../src/shared/panelTopologyProjection');
const Adapter = require('../src/shared/relationshipFlowAdapter');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function fixture() {
  const groupId = 'entity_panel_projectgroup_shared_test';
  const entities = [['host', 'server'], ['app1', 'deployment'], ['app2', 'deployment'], ['endpoint', 'endpoint']]
    .map(([id, type]) => ({ id: `entity_shared_${id}`, type, name: id, details: {} }));
  entities.push({ id: groupId, type: 'group', name: 'Project', details: {} });
  const relationships = [1, 2].flatMap(i => [
    { id: `relationship_shared_host${i}`, type: 'runs_on', sourceId: `entity_shared_app${i}`, targetId: 'entity_shared_host' },
    { id: `relationship_shared_expose${i}`, type: 'exposes', sourceId: `entity_shared_app${i}`, targetId: 'entity_shared_endpoint' }
  ]);
  const placements = entities.map((entity, i) => ({ entityId: entity.id, x: 100 + i * 30, y: 100 + i * 40,
    ...(['deployment', 'endpoint'].includes(entity.type) ? { groupId } : {}),
    ...(entity.type === 'group' ? { x: 100, y: 100, groupWidth: 800, groupHeight: 800, groupLayout: 'auto' } : {}) }));
  return { entities, relationships, placements };
}

test('同一个 Project 的两个部署共用访问点时，不允许容器认领该访问点', () => {
  const graph = fixture();
  Projection.applyProjectEndpointMembership(graph, true);
  assert.equal(graph.placements.find(p => p.entityId === 'entity_shared_endpoint').groupId, undefined);
  assert.equal(Projection.endpointReuseAlerts(graph).length, 1);
});

test('同项目复用访问点在星系自动排列中也保持在容器外', () => {
  const graph = fixture();
  Projection.applyProjectEndpointMembership(graph, true);
  Projection.arrangeProjectGalaxies(graph, { width: 280, height: 143, projectGroupIncludesEndpoints: true });
  const group = graph.placements.find(p => p.groupWidth), endpoint = graph.placements.find(p => p.entityId === 'entity_shared_endpoint');
  assert.equal(endpoint.groupId, undefined);
  assert.equal(endpoint.x < group.x + group.groupWidth && endpoint.x + 280 > group.x
    && endpoint.y < group.y + group.groupHeight && endpoint.y + 143 > group.y, false);
});

test('旧白板中的共享访问点自动脱离容器，保留红线与警报，拖动容器不强带访问点', () => {
  const graph = fixture(), c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_shared_endpoint',
    entities: graph.entities, relationships: graph.relationships,
    boards: [{ id: 'board_shared_endpoint', name: '共享访问点', placements: graph.placements,
      viewport: { x: 0, y: 0, zoom: 1 }, view: { structure: 'server-tree', layout: 'free' } }] });
  const placements = c._combinedPlacements(), endpoint = placements.find(p => p.entityId === 'entity_shared_endpoint');
  const group = placements.find(p => p.groupWidth);
  assert.equal(endpoint.groupId, undefined);
  assert.ok(endpoint.x >= group.x + group.groupWidth || endpoint.y >= group.y + group.groupHeight);
  assert.equal(c._movingEntityIds(group.entityId, false).includes(endpoint.entityId), false);
  const alerts = c._topologyAlerts();
  const flow = Adapter.toFlowModel(c._flowGraphInput({ placements, relationships: graph.relationships }, alerts));
  assert.equal(flow.nodes.find(n => n.id === endpoint.entityId).parentId, undefined);
  assert.equal(alerts.length, 1);
  assert.equal(flow.edges.filter(e => e.style?.stroke === '#d9485f').length, 2);
  const before = JSON.stringify(placements);
  c._combinedPlacements();
  assert.equal(JSON.stringify(placements), before, '重复读取不继续改变浮动卡片位置');
});

test('实时合并跨来源域名时，旧快照别名不重现为重复卡片或丢失连线', () => {
  const graph = fixture(), c = new Controller({ bridge: {} });
  const endpointId = 'entity_shared_endpoint', aliasId = 'entity_shared_old_endpoint';
  graph.entities.push({ id: aliasId, type: 'endpoint', name: '同域名旧卡片', details: {} });
  graph.placements.push({ entityId: aliasId, x: 600, y: 500 });
  graph.relationships.find(e => e.id === 'relationship_shared_expose2').targetId = aliasId;
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_shared_endpoint',
    entities: graph.entities, relationships: graph.relationships,
    boards: [{ id: 'board_shared_endpoint', name: '旧快照', placements: graph.placements,
      viewport: { x: 0, y: 0, zoom: 1 }, view: { structure: 'server-tree', layout: 'free' } }] });
  c.panelProjection = { entities: [{ id: endpointId, type: 'endpoint', runtime: {
    dynamicKind: 'panel-endpoint', providerId: 'one', url: 'https://shared.example.com', endpointSources: [
      { entityId: endpointId, providerId: 'one', url: 'https://shared.example.com' },
      { entityId: aliasId, providerId: 'two', url: 'http://shared.example.com/' }
    ] } }], placements: [], relationships: [] };
  assert.equal(c._combinedEntities().filter(e => e.type === 'endpoint').length, 1);
  assert.equal(c._combinedPlacements().some(p => p.entityId === aliasId), false);
  assert.equal(c._topologyAlerts().length, 1);
  const exported = c._buildActiveBoardExportStore();
  assert.equal(exported.entities.filter(e => e.type === 'endpoint').length, 1);
  assert.equal(exported.relationships.filter(e => e.targetId === endpointId).length, 2);
  c._renderGraph = c._updateFilterSummary = c._updateSummary = () => {};
  c._applyEndpointChecks([
    { providerId: 'one', url: 'https://shared.example.com', checkedAt: '2026-09-05T00:00:00Z', status: 'reachable' },
    { providerId: 'two', url: 'http://shared.example.com/', checkedAt: '2026-09-05T01:00:00Z', status: 'unreachable' }
  ]);
  assert.equal(c._combinedEntities().find(e => e.id === endpointId).runtime.status, 'unreachable');
});
