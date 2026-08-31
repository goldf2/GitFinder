const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const Model = globalThis.RelationshipGraphModel;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function fixture(dynamic = false) {
  const controller = new Controller({ bridge: {} });
  const entities = ['one', 'two'].map(id => ({ id: `entity_00000${id}`, name: id, type: 'deployment', details: { branch: 'main', repositoryKey: 'github.com/example/source', status: 'exited' } }));
  entities.push(...['own', 'shared'].map(id => ({ id: `entity_00000${id}`, name: id, type: 'endpoint', details: {} })));
  const placements = entities.map((entity, index) => ({ entityId: entity.id, x: index * 400, y: 80,
    ...(index === 0 ? { note: '保留备注', titleMode: 'replace', titleText: '已停用服务', todos: [{ id: 'todo_check0000', title: '检查数据迁移', completed: false }] } : {}) }));
  const relationships = [['one', 'own'], ['one', 'shared'], ['two', 'shared']].map(([from, to], index) => ({ id: `relationship_link0000${index}`, type: 'exposes', sourceId: `entity_00000${from}`, targetId: `entity_00000${to}` }));
  controller.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_archive0000', entities: dynamic ? [] : entities, relationships: dynamic ? [] : relationships,
    boards: [{ id: 'board_archive0000', name: '归档测试', viewport: { x: 0, y: 0, zoom: 1 }, placements: dynamic ? [] : placements }] });
  if (dynamic) controller.panelProjection = { entities: entities.map(entity => ({ ...entity, transient: true, runtime: { token: 'must-not-be-saved' } })), placements: placements.map(item => ({ ...item, dynamic: true })), relationships };
  controller._persistSoon = controller._persistDynamicLayoutsSoon = controller.render = () => {};
  return controller;
}

test('归档只隐藏当前部署与独占访问点，共享访问点和事实关系保留', () => {
  const controller = fixture(), original = structuredClone(controller.store);
  assert.equal(controller._setDeploymentArchived('entity_00000one', true), true);
  assert.deepEqual(controller._filteredGraph().placements.map(item => item.entityId), ['entity_00000two', 'entity_00000shared']);
  assert.deepEqual(controller.store.relationships, original.relationships);
  const saved = controller._buildActiveBoardExportStore();
  assert.equal(saved.boards[0].placements[0].archived, true);
  assert.deepEqual(saved.boards[0].placements[0].todos, original.boards[0].placements[0].todos);
  controller.store = Model.assertValidStore(JSON.parse(JSON.stringify(saved)));
  assert.equal(controller._setDeploymentArchived('entity_00000one', false), true);
  assert.equal(controller._filteredGraph().placements.length, 4);
  assert.deepEqual(controller.store.boards[0].placements, original.boards[0].placements);
  assert.match(controller._layoutMenuHtml(), /归档的部署（0）/);
});

test('动态部署归档保留离线快照、标题与待办，但不持久化会话或运行时', () => {
  const controller = fixture(true);
  controller._setDeploymentArchived('entity_00000one', true);
  const saved = Model.assertValidStore(controller.store);
  assert.equal(saved.entities[0].details.repositoryKey, 'github.com/example/source');
  assert.doesNotMatch(JSON.stringify(saved), /token|must-not-be-saved|"runtime":/);
  controller.panelProjection = null;
  controller.store = JSON.parse(JSON.stringify(saved));
  assert.equal(controller._combinedPlacements()[0].archived, true);
  assert.equal(controller._combinedEntities()[0].name, 'one');
  assert.equal(controller._filteredGraph().placements.length, 0);
  controller._setDeploymentArchived('entity_00000one', false);
  assert.equal(controller._filteredGraph().placements.length, 1);
});

test('在线还原动态部署保留坐标与备注，撤销恢复归档，其他白板不受影响', () => {
  const controller = fixture(true);
  controller.store.boards.push({ id: 'board_other0000', name: '另一个白板', viewport: { x: 0, y: 0, zoom: 1 }, placements: [] });
  controller._setDeploymentArchived('entity_00000one', true);
  const archived = controller._historySnapshot();
  controller.store.activeBoardId = 'board_other0000';
  assert.equal(controller._filteredGraph().placements.length, 4);
  controller.store.activeBoardId = 'board_archive0000';
  controller._setDeploymentArchived('entity_00000one', false);
  assert.equal(controller._filteredGraph().placements.length, 4);
  assert.equal(controller._placementForEntity('entity_00000one').note, '保留备注');
  assert.equal(controller._placementForEntity('entity_00000one').x, 0);
  controller._restoreHistorySnapshot(archived);
  assert.equal(controller._filteredGraph().placements.length, 2);
  assert.equal(controller._setDeploymentArchived('entity_00000shared', true), false);
});

test('白板校验拒绝对访问点设置部署归档字段', () => {
  const controller = fixture();
  controller.store.boards[0].placements[2].archived = true;
  assert.throws(() => Model.assertValidStore(controller.store), /仅适用于部署/);
});
