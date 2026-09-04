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
        ...(['deploy', 'sibling', 'otherdeploy', 'nested'].includes(name) ? { groupId: id('project') } : {}),
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
    new Set(['host', 'deploy', 'sibling', 'exclusiveEndpoint'].map(id)));
  c._toggleLinkedMovement(id('otherhost'));
  assert.deepEqual(new Set(c._movingEntityIds(id('otherhost'))), new Set(['otherhost', 'otherdeploy'].map(id)));
});

test('Project 容器自身拖动仍带走它的所有物理成员', () => {
  const c = fixture(), id = c.id;

  assert.deepEqual(new Set(c._movingEntityIds(id('project'), false)),
    new Set(['project', 'nested', 'deploy', 'sibling', 'otherdeploy'].map(id)));
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

test('开启固定下级会物化完整 Project 当前几何且不移动容器', () => {
  const c = fixture(), id = c.id;
  c.store.entities.find(entity => entity.id === id('project')).runtime = { dynamicKind: 'coolify-project-group' };
  Object.assign(c._placementForEntity(id('project')), {
    x: 420, y: 260, groupLayout: 'auto', groupWidth: 920, groupHeight: 720
  });
  const before = c._displayGeometryMap(c._combinedPlacements());

  assert.equal(c._toggleLinkedMovement(id('host')), true);

  const after = c._displayGeometryMap(c._combinedPlacements());
  for (const entityId of [id('project'), ...c._groupDescendants(id('project')).map(item => item.entityId)]) {
    if (!before.has(entityId)) continue;
    for (const field of ['x', 'y', 'width', 'height']) {
      assert.equal(after.get(entityId)[field], before.get(entityId)[field], `${entityId}.${field} 不应在开锁瞬间跳动`);
    }
  }
  assert.equal(c._placementForEntity(id('project')).groupLayout, 'auto');
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

test('主机联动部署触及静止 Project 边界时整支使用同一可行位移', () => {
  const c = fixture(), id = c.id;
  c.store.entities.find(entity => entity.id === id('project')).runtime = { dynamicKind: 'coolify-project-group' };
  c._toggleLinkedMovement(id('host'));
  const positions = {
    host: [0, 350], project: [400, 300], nested: [430, 320],
    deploy: [700, 390], sibling: [500, 450], exclusiveEndpoint: [1100, 400]
  };
  for (const [name, [x, y]] of Object.entries(positions)) Object.assign(c._placementForEntity(id(name)), { x, y });
  Object.assign(c._placementForEntity(id('project')), { groupWidth: 600, groupHeight: 400, groupShape: 'rounded' });
  const placements = c._combinedPlacements();
  const linkedIds = c._movingEntityIds(id('host'));
  const flow = Adapter.toFlowModel({
    entities: c._combinedEntities(), relationships: c._combinedRelationships(placements), placements
  }, { linkedNodeIds: { [id('host')]: linkedIds } });
  const startPositions = Object.fromEntries(flow.nodes.map(node => [node.id, { ...node.position }]));
  const requested = flow.nodes.map(node => node.id === id('host')
    ? { ...node, position: { x: node.position.x + 43, y: node.position.y + 29 } } : node);

  const moved = Adapter.constrainProjectNodes(Adapter.applyLinkedDrag(requested, {
    primaryId: id('host'), primaryPosition: startPositions[id('host')], linkedIds,
    changedIds: [id('host')], startPositions, delta: { x: 43, y: 29 }
  }));
  const before = new Map(Adapter.toPlacements(flow.nodes, placements).map(item => [item.entityId, item]));
  const after = new Map(Adapter.toPlacements(moved, placements).map(item => [item.entityId, item]));

  for (const entityId of linkedIds) {
    assert.deepEqual([
      after.get(entityId).x - before.get(entityId).x,
      after.get(entityId).y - before.get(entityId).y
    ], [8, 29], `${entityId} 应与边界内部署使用同一实际位移`);
  }
  assert.deepEqual([after.get(id('project')).x, after.get(id('project')).y], [400, 300]);
});

test('多边形 Project 内的联动分支按拖动方向等比缩短位移', () => {
  const graph = {
    entities: [
      { id: 'host', type: 'server', name: '主机', details: {} },
      { id: 'project', type: 'group', name: 'Project', details: {}, runtime: { dynamicKind: 'coolify-project-group' } },
      { id: 'deployment', type: 'deployment', name: '部署', details: {} },
      { id: 'endpoint', type: 'endpoint', name: '访问点', details: {} }
    ],
    placements: [
      { entityId: 'host', x: 0, y: 500 },
      { entityId: 'project', x: 400, y: 300, groupWidth: 600, groupHeight: 600, groupShape: 'polygon' },
      { entityId: 'deployment', x: 560, y: 528.5, groupId: 'project' },
      { entityId: 'endpoint', x: 1100, y: 500 }
    ],
    relationships: []
  };
  const flow = Adapter.toFlowModel(graph);
  const startPositions = Object.fromEntries(flow.nodes.map(node => [node.id, { ...node.position }]));
  const moved = Adapter.constrainProjectNodes(Adapter.applyLinkedDrag(flow.nodes.map(node => node.id === 'host'
    ? { ...node, position: { x: node.position.x + 200, y: node.position.y + 100 } } : node), {
    primaryId: 'host', linkedIds: ['host', 'deployment', 'endpoint'], changedIds: ['host'],
    startPositions, delta: { x: 200, y: 100 }
  }));
  const before = new Map(Adapter.toPlacements(flow.nodes, graph.placements).map(item => [item.entityId, item]));
  const after = new Map(Adapter.toPlacements(moved, graph.placements).map(item => [item.entityId, item]));
  const deltas = ['host', 'deployment', 'endpoint'].map(entityId => ({
    x: after.get(entityId).x - before.get(entityId).x,
    y: after.get(entityId).y - before.get(entityId).y
  }));

  assert.ok(deltas[0].x > 0 && deltas[0].x < 200);
  assert.ok(Math.abs(deltas[0].x / deltas[0].y - 2) < 1e-9, '边界限制不应改变拖动方向');
  for (const delta of deltas.slice(1)) {
    assert.ok(Math.abs(delta.x - deltas[0].x) < 1e-9);
    assert.ok(Math.abs(delta.y - deltas[0].y) < 1e-9);
  }
  assert.deepEqual([after.get('project').x, after.get('project').y], [400, 300]);
});

test('联动拖动写回后 Project 保持原位，自动排列不覆盖整支实际位移', () => {
  const c = fixture(), id = c.id;
  c.store.entities.find(entity => entity.id === id('project')).runtime = { dynamicKind: 'coolify-project-group' };
  const positions = {
    host: [0, 350], project: [400, 300], nested: [430, 320],
    deploy: [700, 390], sibling: [500, 450], otherdeploy: [510, 610], exclusiveEndpoint: [1100, 400]
  };
  for (const [name, [x, y]] of Object.entries(positions)) Object.assign(c._placementForEntity(id(name)), { x, y });
  Object.assign(c._placementForEntity(id('project')), {
    groupLayout: 'auto', groupWidth: 1000, groupHeight: 760, groupShape: 'rounded'
  });
  c._placementForEntity(id('host')).moveWithDescendants = true;

  const allPlacements = c._combinedPlacements();
  const linkedIds = c._movingEntityIds(id('host'));
  const beforeGeometry = c._displayGeometryMap(allPlacements);
  const placements = allPlacements.filter(placement => beforeGeometry.has(placement.entityId));
  const displayedPlacements = placements.map(placement => {
    const rect = beforeGeometry.get(placement.entityId);
    return {
      ...placement,
      x: rect.x,
      y: rect.y,
      ...(c._allEntitiesById().get(placement.entityId)?.type === 'group'
        ? { groupWidth: rect.width, groupHeight: rect.height }
        : { cardWidth: rect.width, cardHeight: rect.height })
    };
  });
  const flow = Adapter.toFlowModel({
    entities: c._combinedEntities(), relationships: c._combinedRelationships(placements), placements: displayedPlacements
  }, { linkedNodeIds: { [id('host')]: linkedIds } });
  const startPositions = Object.fromEntries(flow.nodes.map(node => [node.id, { ...node.position }]));
  const moved = Adapter.constrainProjectNodes(Adapter.applyLinkedDrag(flow.nodes.map(node => node.id === id('host')
    ? { ...node, position: { x: node.position.x + 50, y: node.position.y + 40 } } : node), {
    primaryId: id('host'), primaryPosition: startPositions[id('host')], linkedIds,
    changedIds: [id('host')], startPositions, delta: { x: 50, y: 40 }
  }));
  for (const candidate of Adapter.toPlacements(moved, placements)) {
    const placement = c._placementForEntity(candidate.entityId);
    Object.assign(placement, {
      x: candidate.x,
      y: candidate.y,
      ...(Number.isFinite(candidate.groupWidth) ? { groupWidth: candidate.groupWidth } : {}),
      ...(Number.isFinite(candidate.groupHeight) ? { groupHeight: candidate.groupHeight } : {})
    });
  }

  const afterGeometry = c._displayGeometryMap(c._combinedPlacements());
  const hostDelta = {
    x: afterGeometry.get(id('host')).x - beforeGeometry.get(id('host')).x,
    y: afterGeometry.get(id('host')).y - beforeGeometry.get(id('host')).y
  };
  assert.ok(hostDelta.x || hostDelta.y, '主机应产生实际位移');
  for (const entityId of linkedIds) {
    assert.deepEqual({
      x: afterGeometry.get(entityId).x - beforeGeometry.get(entityId).x,
      y: afterGeometry.get(entityId).y - beforeGeometry.get(entityId).y
    }, hostDelta, `${entityId} 的显示位移应与主机一致`);
  }
  for (const entityId of [id('nested'), id('otherdeploy')]) {
    assert.deepEqual({
      x: afterGeometry.get(entityId).x - beforeGeometry.get(entityId).x,
      y: afterGeometry.get(entityId).y - beforeGeometry.get(entityId).y
    }, { x: 0, y: 0 }, `${entityId} 不属于联动分支，不应被带走`);
  }
  assert.deepEqual(afterGeometry.get(id('project')), beforeGeometry.get(id('project')),
    'Project 容器的位置和尺寸都应保持不变');
  assert.equal(c._placementForEntity(id('project')).groupLayout, 'auto');
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
