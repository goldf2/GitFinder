const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function fixture() {
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_layoutaudit', entities: [], relationships: [],
    boards: [{ id: 'board_layoutaudit', name: '布局控件回归', placements: [], viewport: { x: 0, y: 0, zoom: 1 },
      view: { structure: 'server-tree', layout: 'bilateral' } }] });
  for (const name of ['render', '_renderGraph', '_refreshHistoryButtons', '_persistSoon', '_persistDynamicLayoutsSoon', 'fitContent', '_updateSummary']) c[name] = () => {};
  c.panelRepositories = Array.from({ length: 7 }, (_, i) => ({ id: `repo_audit${i}`, name: `Source ${i}`,
    path: `/synthetic/source${i}`, originUrl: `https://github.com/example/source${i}.git` }));
  const topology = { state: 'ready', provider: { providerId: 'coolify_audit' }, topology: {
    servers: [{ nodeId: 'host1', name: 'Host 1' }, { nodeId: 'host2', name: 'Host 2' }],
    deployments: Array.from({ length: 21 }, (_, i) => ({ resourceUuid: `app${i}`, nodeId: i < 15 ? 'host1' : 'host2', name: `App ${i}`,
      projectUuid: `project${Math.floor(i / 3)}`, projectName: `Project ${Math.floor(i / 3)}`,
      repositoryUrl: c.panelRepositories[Math.floor(i / 3)].originUrl,
      domains: [`https://site${i}.example.com`, ...(i % 5 === 0 ? [`https://api${i}.example.com`] : [])] }))
  } };
  c._setPanelTopology(topology);
  c._setLayout('bilateral');
  return { c, topology };
}

function geometry(c) {
  return [...c._displayGeometryMap(c._unarchivedPlacements())].map(([id, r]) => [id, ...['x', 'y', 'width', 'height'].map(k => Math.round(r[k]))]).sort((a, b) => a[0].localeCompare(b[0]));
}

function assertSeparated(c, label) {
  const all = c._unarchivedPlacements(), bounds = c._displayGeometryMap(all);
  const isAncestor = (a, b) => c._groupDescendants(a, all).some(p => p.entityId === b);
  const rects = [...bounds];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [a, r] = rects[i], [b, s] = rects[j];
    if (isAncestor(a, b) || isAncestor(b, a)) continue;
    assert.ok(!(r.x < s.x + s.width - 1 && r.x + r.width > s.x + 1 && r.y < s.y + s.height - 1 && r.y + r.height > s.y + 1), `${label}: ${a} overlaps ${b}`);
  }
}

for (const structure of Model.BOARD_STRUCTURES) for (const layout of Model.BOARD_LAYOUTS.filter(s => s !== 'free')) {
  test(`${structure}/${layout}：不同卡高、双主机、多访问点，排列无交叠且重复点击稳定`, () => {
    const { c, topology } = fixture();
    c._setStructure(structure);
    const membership = c._combinedPlacements().map(p => [p.entityId, p.groupId]);
    c._setLayout(layout);
    assertSeparated(c, layout);
    const first = geometry(c);
    c._setLayout(layout);
    assert.deepEqual(geometry(c), first, '重复点击不翻转分支或增长边界');
    assert.deepEqual(c._combinedPlacements().map(p => [p.entityId, p.groupId]), membership);
    c._setPanelTopology(topology);
    assert.deepEqual(geometry(c), first, '后台同步不改变刚排列的画面');
  });
}

test('切换结构重用所选布局，新容器不包裹散落的旧坐标，自由摆放例外', () => {
  const { c } = fixture();
  for (const structure of ['resources', 'coolify-projects', 'server-tree', 'coolify-projects']) {
    c._setStructure(structure);
    assert.equal(c._boardView().layout, 'bilateral');
    assertSeparated(c, structure);
    assert.ok([...c._displayGeometryMap(c._combinedPlacements()).values()].every(r => r.height < 3000), '不产生无限长容器');
  }
  c._setLayout('free');
  const before = new Map(geometry(c).map(([id, ...rect]) => [id, rect]));
  c._setStructure('resources');
  for (const [id, x, y] of geometry(c)) if (before.has(id)) assert.deepEqual([x, y], before.get(id).slice(0, 2));
});

test('全部自动排列同时整理顶层容器，收紧后不重叠，一次撤销', () => {
  const { c } = fixture();
  for (const group of c._autoLayoutGroups()) Object.assign(group, { groupLayout: 'manual', groupWidth: 5000, groupHeight: 6000, x: 0, y: 0 });
  const before = c._historySnapshot();
  c._toggleAllGroupLayouts();
  assertSeparated(c, '全部自动排列');
  const visible = c._displayGeometryMap(c._combinedPlacements());
  for (const group of c._autoLayoutGroups()) {
    const rect = visible.get(group.entityId);
    if (rect) assert.ok(rect.width < 2000 && rect.height < 2000, `${group.entityId}: 批量整理不沿用旧的超宽/超高容器`);
  }
  c.undo();
  assert.deepEqual(c.store, JSON.parse(before).store);
  assert.deepEqual(c.panelProjection.placements, JSON.parse(before).dynamicPlacements);
});
