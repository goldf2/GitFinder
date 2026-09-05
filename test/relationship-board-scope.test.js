const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const Model = globalThis.RelationshipGraphModel;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function runtimeFixture() {
  const controller = new Controller({ bridge: {} });
  const entities = [
    { id: 'entity_scope_server', type: 'server', name: 'Con01', details: {} },
    { id: 'entity_scope_deploy_a', type: 'deployment', name: '部署 A', details: {} },
    { id: 'entity_scope_deploy_b', type: 'deployment', name: '部署 B', details: {} },
    { id: 'entity_scope_repo', type: 'repository', name: '仓库', details: {} },
    { id: 'entity_scope_endpoint', type: 'endpoint', name: 'app.example.com', details: {} },
    { id: 'entity_scope_project', type: 'group', name: 'Project A', details: {}, runtime: { dynamicKind: 'coolify-project-group' } }
  ];
  const relationships = [
    ['runs-a', 'runs_on', 'entity_scope_deploy_a', 'entity_scope_server'],
    ['runs-b', 'runs_on', 'entity_scope_deploy_b', 'entity_scope_server'],
    ['source-a', 'deployed_from', 'entity_scope_deploy_a', 'entity_scope_repo'],
    ['exposes-a', 'exposes', 'entity_scope_deploy_a', 'entity_scope_endpoint']
  ].map(([id, type, sourceId, targetId]) => ({ id, type, sourceId, targetId }));
  const placements = entities.map((entity, index) => ({
    entityId: entity.id, x: index * 20, y: 0,
    ...(entity.id === 'entity_scope_deploy_a' || entity.id === 'entity_scope_endpoint' ? { groupId: 'entity_scope_project' } : {})
  }));
  controller.store = {
    schemaVersion: 1, activeBoardId: 'board_scope1234', entities: [], relationships: [],
    boards: [{ id: 'board_scope1234', name: '范围', viewport: { x: 0, y: 0, zoom: 1 },
      view: { ...Model.defaultBoardView(), topologyScopeMode: 'all' }, placements: [] }]
  };
  controller.panelProjection = { entities, relationships, placements };
  return controller;
}

test('白板保留一个画布，运行拓扑和代码架构作为独立可见元素来源', () => {
  assert.deepEqual(Model.BOARD_LAYERS, ['runtime', 'architecture']);
  const legacy = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_scope1234', entities: [], relationships: [], boards: [{
    id: 'board_scope1234', name: '旧白板', viewport: { x: 0, y: 0, zoom: 1 },
    view: { layer: 'merged' }, placements: []
  }] });
  assert.equal(legacy.boards[0].view.layer, 'runtime');
  assert.equal(legacy.boards[0].view.showTopology, true);
  assert.equal(legacy.boards[0].view.showArchitecture, true);
  assert.equal(Model.defaultBoardView().showTopology, true);
  assert.equal(Model.defaultBoardView().showArchitecture, false);
  assert.equal(Model.defaultBoardView().topologyScopeMode, 'board');
  assert.equal(Model.defaultBoardView().architectureScopeMode, 'snapshot');
});

test('运行拓扑默认只显示当前白板，显式选择范围后才展开资源', () => {
  const controller = runtimeFixture();
  const board = controller.store.boards[0];
  board.view.topologyScopeMode = 'board';
  assert.deepEqual(controller._filteredGraph().placements, []);
  board.view.topologyScopeMode = 'project';
  board.view.topologyScopeId = 'entity_scope_project';
  assert.deepEqual(controller._filteredGraph().placements.map(item => item.entityId), [
    'entity_scope_deploy_a', 'entity_scope_endpoint', 'entity_scope_project'
  ]);
  board.view.topologyScopeMode = 'repository';
  board.view.topologyScopeId = 'entity_scope_repo';
  assert.deepEqual(controller._filteredGraph().placements.map(item => item.entityId), [
    'entity_scope_deploy_a', 'entity_scope_repo', 'entity_scope_endpoint', 'entity_scope_project'
  ]);
});

test('架构范围可按边界或组件邻接关系缩小，并可隐藏边界容器', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = { schemaVersion: 1, activeBoardId: 'board_archscope', entities: [], relationships: [], boards: [{
    id: 'board_archscope', name: '架构范围', viewport: { x: 0, y: 0, zoom: 1 },
    view: { ...Model.defaultBoardView(), showArchitecture: true, architectureScopeMode: 'boundary', architectureScopeId: 'entity_arch_group' }, placements: []
  }] };
  controller.architectureProjection = {
    entities: [
      { id: 'entity_arch_group', type: 'group', name: '领域边界', details: {} },
      { id: 'entity_arch_a', type: 'architecture', name: '入口', details: {} },
      { id: 'entity_arch_b', type: 'architecture', name: '服务', details: {} },
      { id: 'entity_arch_c', type: 'architecture', name: '外部', details: {} }
    ],
    relationships: [{ id: 'relationship_arch_ab', type: 'connects_to', sourceId: 'entity_arch_a', targetId: 'entity_arch_b' }, { id: 'relationship_arch_bc', type: 'connects_to', sourceId: 'entity_arch_b', targetId: 'entity_arch_c' }],
    placements: [
      { entityId: 'entity_arch_group', x: 0, y: 0 },
      { entityId: 'entity_arch_a', x: 0, y: 80, groupId: 'entity_arch_group' },
      { entityId: 'entity_arch_b', x: 0, y: 160, groupId: 'entity_arch_group' },
      { entityId: 'entity_arch_c', x: 0, y: 240 }
    ]
  };
  assert.deepEqual(controller._filteredGraph().placements.map(item => item.entityId), ['entity_arch_group', 'entity_arch_a', 'entity_arch_b']);
  controller.store.boards[0].view.architectureScopeMode = 'component';
  controller.store.boards[0].view.architectureScopeId = 'entity_arch_b';
  controller.store.boards[0].view.architectureShowBoundaries = false;
  assert.deepEqual(controller._filteredGraph().placements.map(item => item.entityId), ['entity_arch_a', 'entity_arch_b', 'entity_arch_c']);
  assert.equal(controller._filteredGraph().placements.some(item => item.groupId), false);
});

test('菜单按运行拓扑和代码架构分别提供显示与范围控件', () => {
  const controller = runtimeFixture();
  controller.store.boards[0].view.topologyScopeMode = 'project';
  controller.store.boards[0].view.topologyScopeId = 'entity_scope_project';
  const runtimeMenu = controller._layoutMenuHtml();
  assert.doesNotMatch(runtimeMenu, /数据层|合并视图|data-board-layer="merged"/);
  assert.match(runtimeMenu, /data-board-topology-visible/);
  assert.match(runtimeMenu, /data-board-architecture-visible/);
  assert.match(runtimeMenu, /data-topology-scope-mode/);
  assert.match(runtimeMenu, /data-topology-scope-id/);
  controller.store.boards[0].view.showArchitecture = true;
  controller.architectureProjection = { entities: [{ id: 'entity_arch_scope', type: 'architecture', name: '入口', details: {} }], relationships: [], placements: [{ entityId: 'entity_arch_scope', x: 0, y: 0 }], metadata: { componentCount: 1, boundaryCount: 0, connectionCount: 0 } };
  const architectureMenu = controller._layoutMenuHtml();
  assert.match(architectureMenu, /data-architecture-scope-mode/);
  assert.match(architectureMenu, /data-architecture-show-boundaries/);
});

test('添加运行资源时不会隐藏同一白板上的代码架构', () => {
  const controller = runtimeFixture();
  const board = controller.store.boards[0];
  board.view.showArchitecture = true;
  controller._persistSoon = () => {};
  const added = [];
  controller._addEntity = entity => added.push(entity);

  controller._addResource({ key: 'project:p1', kind: 'project', refId: 'p1', name: '项目 A' });

  assert.equal(board.view.showTopology, true);
  assert.equal(board.view.showArchitecture, true);
  assert.equal(added.length, 1);
  assert.equal(added[0].type, 'project');
});

test('从仓库详情进入关系白板时不会关闭代码架构元素', () => {
  const controller = runtimeFixture();
  const board = controller.store.boards[0];
  board.view.showArchitecture = true;
  controller.resourceMap.set('repository:r1', { key: 'repository:r1', kind: 'repository', refId: 'r1', name: '仓库' });
  controller._persistSoon = () => {};
  controller._recordMutation = () => {};
  controller._refreshHistoryButtons = () => {};
  controller._selectOnlyEntity = () => {};
  controller._renderAndCenterEntity = () => {};
  controller._updateFilterSummary = () => {};
  controller._updateSummary = () => {};
  controller._setCanvasAnnouncement = () => {};

  assert.equal(controller.revealResource('repository', 'r1'), true);
  assert.equal(board.view.showTopology, true);
  assert.equal(board.view.showArchitecture, true);
  assert.equal(board.placements.length, 1);
});

test('运行拓扑和代码架构可以同时进入同一白板的过滤结果', () => {
  const controller = runtimeFixture();
  const board = controller.store.boards[0];
  board.view.showArchitecture = true;
  board.view.topologyScopeMode = 'all';
  controller.architectureProjection = {
    entities: [{ id: 'entity_arch_scope', type: 'architecture', name: '入口', details: {} }],
    relationships: [],
    placements: [{ entityId: 'entity_arch_scope', x: 480, y: 0, architectureReadOnly: true }],
    metadata: { componentCount: 1, boundaryCount: 0, connectionCount: 0 }
  };
  const ids = controller._filteredGraph().placements.map(item => item.entityId);
  assert.ok(ids.includes('entity_scope_server'));
  assert.ok(ids.includes('entity_arch_scope'));
});
