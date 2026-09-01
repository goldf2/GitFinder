const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
const Adapter = require('../src/shared/relationshipFlowAdapter');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function fixture(structure = 'server-tree') {
  const c = new Controller({ bridge: {} });
  const types = { host: 'server', otherhost: 'server', project: 'group', nested: 'group',
    deploy: 'deployment', sibling: 'deployment', otherdeploy: 'deployment', endpoint: 'endpoint',
    exclusiveEndpoint: 'endpoint', repository: 'repository' };
  const id = name => `entity_link_${name}`;
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_linked_drag',
    entities: Object.entries(types).map(([name, type]) => ({ id: id(name), name, type,
      ...(type === 'repository' ? { refId: 'repository_linked' } : {}), details: {} })),
    relationships: [['runs_on', 'deploy', 'host'], ['hosts', 'otherhost', 'otherdeploy'],
      ['runs_on', 'sibling', 'host'], ['exposes', 'deploy', 'endpoint'], ['exposed_by', 'endpoint', 'otherdeploy'],
      ['exposes', 'deploy', 'exclusiveEndpoint'],
      ['source_of', 'repository', 'deploy'], ['deployed_from', 'otherdeploy', 'repository']]
      .map(([type, source, target], i) => ({ id: `relationship_link_000${i}`, type, sourceId: id(source), targetId: id(target), source: 'manual' })),
    boards: [{ id: 'board_linked_drag', name: '联动测试', view: { structure, layout: 'free', snapMode: 'off' },
      viewport: { x: 0, y: 0, zoom: 1 }, placements: Object.keys(types).map((name, i) => ({
        entityId: id(name), x: i * 450, y: i * 260,
        ...(['deploy', 'sibling', 'nested'].includes(name) ? { groupId: id('project') } : {}),
        ...(name === 'project' || name === 'nested' ? { groupLayout: 'auto', groupWidth: 1000, groupHeight: 2000 } : {})
      })) }] });
  c.messages = [];
  c.notify = message => c.messages.push(message);
  c._persistSoon = c._persistDynamicLayoutsSoon = c._renderGraph = c._refreshHistoryButtons = () => {};
  c._setCanvasAnnouncement = () => {};
  c.id = id;
  return c;
}

test('主机固定下级只带走独占访问点，不带走被其它主机部署共享的访问点', () => {
  const c = fixture(), id = c.id;
  assert.deepEqual(c._movingEntityIds(id('host')), [id('host')]);
  c._toggleLinkedMovement(id('host'));
  assert.deepEqual(new Set(c._movingEntityIds(id('host'))),
    new Set(['host', 'project', 'nested', 'deploy', 'sibling', 'exclusiveEndpoint'].map(id)));
  c._toggleLinkedMovement(id('otherhost'));
  assert.deepEqual(new Set(c._movingEntityIds(id('otherhost'))), new Set(['otherhost', 'otherdeploy'].map(id)));
});

test('资源结构同时覆盖共享访问点的全部部署时可以将其移动一次', () => {
  const c = fixture('resources'), id = c.id;
  c._toggleLinkedMovement(id('repository'));
  c.store.relationships.push({ id: 'relationship_cycle001', type: 'connects_to', sourceId: id('endpoint'), targetId: id('deploy') });
  c.store.relationships.push({ id: 'relationship_related01', type: 'related_to', sourceId: id('endpoint'), targetId: id('host') });
  assert.deepEqual(new Set(c._movingEntityIds(id('repository'))),
    new Set(['repository', 'deploy', 'otherdeploy', 'endpoint', 'exclusiveEndpoint'].map(id)));
});

test('锁定下级可撤销、导出和重开，关闭也能覆盖动态投影中的旧值', () => {
  const c = fixture(), id = c.id;
  c._toggleLinkedMovement(id('host'));
  assert.equal(Model.assertValidStore(c._buildActiveBoardExportStore()).boards[0].placements.find(p => p.entityId === id('host')).moveWithDescendants, true);
  c.undo(); assert.notEqual(c._placementForEntity(id('host')).moveWithDescendants, true);
  c.redo(); assert.equal(c._placementForEntity(id('host')).moveWithDescendants, true);
  const p = c.store.boards[0].placements.find(p => p.entityId === id('host'));
  c.store.boards[0].placements = c.store.boards[0].placements.filter(item => item !== p);
  c.panelProjection = { entities: [], relationships: [], placements: [{ ...p, dynamic: true }] };
  c._toggleLinkedMovement(id('host'));
  c.panelProjection.placements[0].moveWithDescendants = true;
  c._applyDynamicLayoutOverrides();
  assert.equal(c._placementForEntity(id('host')).moveWithDescendants, false);
});

test('React Flow 拖动使所有联动根节点保持相同位移，嵌套成员不重复位移', () => {
  const c = fixture(), id = c.id;
  c._toggleLinkedMovement(id('host'));
  const placements = c._combinedPlacements();
  const linkedIds = c._movingEntityIds(id('host'));
  const graph = { entities: c._combinedEntities(), relationships: c._combinedRelationships(placements), placements };
  const model = Adapter.toFlowModel(graph, { linkedNodeIds: { [id('host')]: linkedIds } });
  const primary = model.nodes.find(node => node.id === id('host'));
  const moved = Adapter.applyLinkedDrag(model.nodes.map(node => node.id === primary.id
    ? { ...node, position: { x: node.position.x + 43, y: node.position.y + 29 } } : node), {
    primaryId: primary.id, primaryPosition: primary.position, linkedIds, changedIds: [primary.id],
    startPositions: Object.fromEntries(model.nodes.map(node => [node.id, node.position])), delta: { x: 43, y: 29 }
  });
  const written = Adapter.toPlacements(moved, placements);
  for (const before of placements) {
    const after = written.find(item => item.entityId === before.entityId);
    assert.equal(after.x - before.x, linkedIds.includes(before.entityId) ? 43 : 0, `${before.entityId}.x`);
    assert.equal(after.y - before.y, linkedIds.includes(before.entityId) ? 29 : 0, `${before.entityId}.y`);
  }
});

test('拖动 Project 成员不会把固定布局容器切换为手动排列', () => {
  const c = fixture(), id = c.id;
  c.store.entities.find(entity => entity.id === id('project')).runtime = { dynamicKind: 'coolify-project-group' };
  const project = c._placementForEntity(id('project'));

  c._prepareLinkedMove([id('deploy')], c._displayGeometryMap(c._combinedPlacements()));

  assert.equal(project.groupLayout, 'auto');
  assert.equal(c.messages.length, 0);
});

test('联动分支或上级容器有位置锁时阻止整支移动', () => {
  const c = fixture(), id = c.id;
  c._toggleLinkedMovement(id('host'));
  const ids = c._movingEntityIds(id('host'));
  c._placementForEntity(id('exclusiveEndpoint')).locked = true;
  assert.equal(c._linkedMoveBlocked(new Set(ids)), true);
  assert.match(c.messages.at(-1), /锁定/);
  c._placementForEntity(id('exclusiveEndpoint')).locked = false;
  c._placementForEntity(id('project')).locked = true;
  assert.equal(c._linkedMoveBlocked(new Set([id('deploy')])), true);
});

test('下级锁定字段必须为布尔值，旧文件未设置时保持关闭', () => {
  const c = fixture();
  assert.equal(c.store.boards[0].placements[0].moveWithDescendants, undefined);
  c.store.boards[0].placements[0].moveWithDescendants = 'yes';
  assert.throws(() => Model.assertValidStore(c.store), /moveWithDescendants/);
});
