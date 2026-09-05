const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
const Projection = require('../src/shared/panelTopologyProjection');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function fixture() {
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_separate01', relationships: [],
    entities: [
      { id: 'entity_manual_outer', type: 'group', name: '手动外组', details: {} },
      { id: 'entity_manual_inner', type: 'group', name: '手动内组', details: {} },
      { id: 'entity_manual_text1', type: 'text', name: '说明', details: { content: '保留' } }
    ], boards: [{ id: 'board_separate01', name: '独立结构与布局', viewport: { x: 0, y: 0, zoom: 1 },
      view: { structure: 'resources', layout: 'right' }, placements: [
        { entityId: 'entity_manual_outer', x: 0, y: 0, groupLayout: 'manual', groupWidth: 500, groupHeight: 500 },
        { entityId: 'entity_manual_inner', x: 40, y: 70, groupId: 'entity_manual_outer', groupLayout: 'manual', groupWidth: 400, groupHeight: 350 },
        { entityId: 'entity_manual_text1', x: 80, y: 140, groupId: 'entity_manual_inner', note: '手工备注' }
      ] }] });
  for (const name of ['render', '_renderGraph', '_refreshHistoryButtons', '_persistSoon', '_persistDynamicLayoutsSoon', 'fitContent', '_updateSummary']) c[name] = () => {};
  const topology = { state: 'ready', provider: { providerId: 'coolify_test' }, topology: {
    servers: [{ nodeId: 'host1', name: 'Host' }],
    deployments: Array.from({ length: 12 }, (_, i) => ({ resourceUuid: `app${i}`, nodeId: 'host1', name: `App ${i}`,
      projectUuid: `project${Math.floor(i / 3)}`, projectName: `Project ${Math.floor(i / 3)}`,
      domains: [`https://site${i}.example.com`, ...(i < 2 ? ['https://shared.example.com'] : [])] }))
  } };
  c._setPanelTopology(topology);
  return { c, topology };
}
const positions = c => Object.fromEntries(c._combinedPlacements().map(p => [p.entityId, [p.x, p.y]]));
const membership = c => Object.fromEntries(c._combinedPlacements().map(p => [p.entityId, p.groupId || '']));

test('旧版混合设置迁移为两个轴，保留坐标且新格式不再写回旧字段', () => {
  const { c } = fixture();
  for (const [legacy, structure, layout] of [
    ['lanes', 'resources', 'lanes'], ['coolify-projects', 'coolify-projects', 'compact'],
    ['server-centered', 'resources', 'radial'], ['selection-centered', 'resources', 'radial'],
    ['server-tree', 'server-tree', 'down']
  ]) {
    const raw = structuredClone(c.store);
    raw.boards[0].view = { topologyLayout: legacy, treeLayout: 'down' };
    const normalized = Model.assertValidStore(raw);
    assert.equal(normalized.boards[0].view.structure, structure);
    assert.equal(normalized.boards[0].view.layout, layout);
    assert.equal(normalized.boards[0].view.topologyLayout, undefined);
    assert.equal(normalized.boards[0].view.treeLayout, undefined);
    assert.deepEqual(normalized.boards[0].placements, raw.boards[0].placements);
  }
  assert.throws(() => Model.assertValidStore({ ...c.store, boards: [{ ...c.store.boards[0], view: { layout: 'invalid' } }] }), /layout/);
});

for (const structure of Model.BOARD_STRUCTURES) test(`${structure} 与所有布局正交：同一白板、相同成员和事实，刷新与重开保持`, () => {
  const { c, topology } = fixture();
  c._setStructure(structure);
  assert.equal(c._boardView().layout, 'right');
  const app = c.panelProjection.placements.find(p => c._allEntitiesById().get(p.entityId).type === 'deployment');
  app.note = '备注不丢失'; app.titleMode = 'replace'; app.titleText = '我的部署';
  app.todos = [{ id: 'todo_structure01', title: '检查上线', completed: false }];
  c._saveDynamicPlacementOverrides([app.entityId]);
  const groups = membership(c), facts = structuredClone(c._combinedRelationships(c._combinedPlacements()));
  for (const style of Model.BOARD_LAYOUTS) {
    const before = positions(c);
    c._setLayout(style);
    assert.equal(c.store.boards.length, 1);
    assert.equal(c.store.activeBoardId, 'board_separate01');
    assert.equal(c._boardView().structure, structure);
    assert.equal(c._boardView().layout, style);
    assert.deepEqual(membership(c), groups);
    assert.deepEqual(c._combinedRelationships(c._combinedPlacements()), facts);
    if (style === 'free') assert.deepEqual(positions(c), before);
    const placed = c._placementForEntity(app.entityId);
    assert.equal(placed.note, '备注不丢失'); assert.equal(placed.todos.length, 1); assert.equal(placed.titleText, '我的部署');
    const moved = positions(c);
    c._setPanelTopology(topology);
    assert.deepEqual(positions(c), moved, '后台刷新不重排');
    assert.deepEqual(membership(c), groups);
    const portable = c._buildActiveBoardExportStore();
    const reopened = Model.assertValidStore(JSON.parse(JSON.stringify(portable)));
    assert.equal(reopened.boards[0].view.structure, structure);
    assert.equal(reopened.boards[0].view.layout, style);
  }
});

test('结构切换和布局切换分别撤销，不重建白板、不丢手工嵌套组', () => {
  const { c } = fixture();
  c._setStructure('server-tree');
  const before = c._historySnapshot();
  c._setLayout('bilateral');
  c.undo();
  assert.equal(c._boardView().layout, 'right');
  assert.equal(c._boardView().structure, 'server-tree');
  assert.deepEqual(c.store.boards[0].placements, JSON.parse(before).store.boards[0].placements);
  c.redo();
  assert.equal(c._boardView().layout, 'bilateral');
  c._setStructure('coolify-projects');
  assert.equal(c._boardView().layout, 'bilateral');
  c.undo();
  assert.equal(c._boardView().structure, 'server-tree');
  assert.equal(c._boardView().layout, 'bilateral');
  assert.equal(c._placementForEntity('entity_manual_inner').groupId, 'entity_manual_outer');
});

test('自由摆放切换结构保留实际渲染坐标，包括从树中重新显现的共享资源组', () => {
  const { c } = fixture();
  c._setStructure('server-tree');
  c._setLayout('bilateral');
  c._setLayout('free');
  for (const structure of ['coolify-projects', 'resources', 'server-tree']) {
    const before = c._displayGeometryMap(c._combinedPlacements());
    c._setStructure(structure);
    const after = c._displayGeometryMap(c._combinedPlacements());
    for (const [id, rect] of before) {
      if (c._allEntitiesById().get(id)?.type === 'group' || !after.has(id)) continue;
      assert.equal(after.get(id).x, rect.x, `${structure}: ${id}.x`);
      assert.equal(after.get(id).y, rect.y, `${structure}: ${id}.y`);
    }
  }
});

test('自由摆放时项目包含访问点只改变归属，归档与独立文档布局保持', () => {
  const { c } = fixture();
  c._setStructure('server-tree'); c._setLayout('down');
  c._setLayout('free');
  const before = positions(c);
  c._setProjectEndpoints(false);
  assert.deepEqual(positions(c), before);
  assert.equal(c._boardView().layout, 'free');
  c._setProjectEndpoints(true);
  assert.deepEqual(positions(c), before);
  const app = c._combinedEntities().find(e => e.type === 'deployment');
  c._setDeploymentArchived(app.id, true);
  c._setLayout('compact');
  assert.equal(c._placementForEntity(app.id).archived, true);
  assert.ok(!c._unarchivedPlacements().some(p => p.entityId === app.id));
  c.store = c._buildActiveBoardExportStore();
  c.documentRecord = { path: '/synthetic/board.json' };
  const groups = membership(c);
  c._setLayout('radial');
  assert.deepEqual(membership(c), groups);
  assert.equal(c.store.boards.length, 1);
  assert.ok(c.store.boards[0].placements.some(p => p.archived));
});

test('菜单入口明确分离，布局选项不包含分组命令和自动副本', () => {
  const { c } = fixture();
  const html = c._layoutMenuHtml();
  assert.match(html, /aria-label="运行拓扑"/); assert.match(html, /aria-label="代码架构"/); assert.match(html, /aria-label="布局"/);
  assert.match(html, /data-board-structure="coolify-projects"/);
  const layout = html.slice(html.indexOf('data-layout-panel="layout"'));
  assert.doesNotMatch(layout, /data-board-structure|初始化|服务器为中心|围绕选中/);
  assert.doesNotMatch(html, /首次选择会创建副本/);
});

test('纯布局函数尊重手工群组相对位置与锁定点，不改 groupId 和注释', () => {
  for (const style of Model.BOARD_LAYOUTS) {
    const graph = { entities: [{ id: 'g', type: 'group' }, { id: 'a', type: 'deployment' }, { id: 'b', type: 'endpoint' }, { id: 'locked', type: 'server' }],
      relationships: [{ sourceId: 'a', targetId: 'b', type: 'exposes' }], placements: [
        { entityId: 'g', x: 0, y: 0, groupLayout: 'manual', groupWidth: 900, groupHeight: 600 },
        { entityId: 'a', x: 40, y: 80, groupId: 'g', note: 'keep' },
        { entityId: 'b', x: 450, y: 300, groupId: 'g' },
        { entityId: 'locked', x: -800, y: -500, locked: true }
      ] };
    Projection.arrangeBoardLayout(graph, { style });
    const [g, a, b, locked] = graph.placements;
    assert.equal(b.x - a.x, 410); assert.equal(b.y - a.y, 220);
    assert.equal(a.groupId, 'g'); assert.equal(a.note, 'keep'); assert.equal(b.groupId, 'g');
    assert.equal(g.groupWidth, 900); assert.equal(g.groupHeight, 600);
    assert.equal(locked.x, -800); assert.equal(locked.y, -500);
  }
});
