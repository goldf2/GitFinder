const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const { Controller, normalizeDynamicLayoutStore } = require('../src/renderer/scripts/relationshipBoardController');

function fixture(layout) {
  const c = new Controller({ bridge: {} });
  const view = { ...globalThis.RelationshipGraphModel.defaultBoardView(), layout: 'compact', cardWidth: 280, horizontalSpacing: 64, verticalSpacing: 40 };
  c.store = { activeBoardId: 'board_test001', entities: [
    { id: 'group', type: 'group', name: '项目', details: {} },
    ...['a', 'b', 'c', 'd'].map(id => ({ id, type: 'deployment', name: id, details: {} }))
  ], relationships: [], boards: [{ id: 'board_test001', view, viewport: { x: 0, y: 0, zoom: 1 }, placements: [
    { entityId: 'group', x: -28, y: -54, ...(layout ? { groupLayout: layout, groupWidth: 680, groupHeight: 522 } : {}) },
    ...['a', 'b', 'c', 'd'].map((entityId, i) => ({ entityId, groupId: 'group', x: (i % 2) * 344, y: Math.floor(i / 2) * 240 }))
  ] }] };
  c._persistSoon = c._persistDynamicLayoutsSoon = () => {};
  return c;
}

for (const layout of [undefined, 'manual', 'auto']) {
  test(`卡片调宽和调间距同步重排两列并扩展${layout || '旧'}群组，缩回没有漂移`, () => {
    const c = fixture(layout);
    const before = c._captureDisplayLayout();
    const original = c._displayGeometryMap(c._combinedPlacements());
    Object.assign(c.store.boards[0].view, { cardWidth: 600, cardHeight: 300, horizontalSpacing: 100, verticalSpacing: 80 });
    c._reflowDisplayLayout(before);
    const geometry = c._displayGeometryMap(c._combinedPlacements());
    assert.equal(geometry.get('b').x - geometry.get('a').x - geometry.get('a').width, 100);
    assert.equal(geometry.get('c').y - geometry.get('a').y - geometry.get('a').height, 80);
    assert.equal(geometry.get('a').y, geometry.get('b').y);
    assert.ok(geometry.get('group').width >= 1356);
    assert.ok(geometry.get('group').height >= 762);
    assert.ok(c._combinedPlacements().filter(p => p.entityId !== 'group').every(p => p.groupId === 'group'));
    Object.assign(c.store.boards[0].view, before.display);
    c._reflowDisplayLayout(before);
    const restored = c._displayGeometryMap(c._combinedPlacements());
    assert.equal(restored.get('b').x - restored.get('a').x - restored.get('a').width, before.display.horizontalSpacing);
    assert.equal(restored.get('c').y - restored.get('a').y - restored.get('a').height, before.display.verticalSpacing);
    for (const id of ['a', 'b', 'c', 'd']) {
      assert.equal(restored.get(id).width, original.get(id).width, `${id}.width`);
      assert.equal(restored.get(id).height, original.get(id).height, `${id}.height`);
    }
  });
}

test('嵌套群组和外侧群组随卡片宽度让位，动态位置可保存重载，锁定节点不移动', () => {
  const c = fixture('manual');
  c.store.entities.push({ id: 'outer', type: 'group', details: {} }, { id: 'entity_peer001', type: 'deployment', details: {} });
  c.store.boards[0].placements[0].groupId = 'outer';
  c.store.boards[0].placements.push({ entityId: 'outer', x: -56, y: -108 });
  c.panelProjection = { entities: [], relationships: [], placements: [{ entityId: 'entity_peer001', x: 800, y: 0, dynamic: true }] };
  const before = c._captureDisplayLayout();
  c.store.boards[0].view.cardWidth = 600;
  c._reflowDisplayLayout(before);
  const geometry = c._displayGeometryMap(c._combinedPlacements());
  assert.ok(geometry.get('outer').width > 1300);
  assert.ok(geometry.get('entity_peer001').x >= geometry.get('outer').x + geometry.get('outer').width + 64);
  c.dynamicLayoutStore = normalizeDynamicLayoutStore(c.dynamicLayoutStore);
  const savedPeer = structuredClone(c.panelProjection.placements[0]);
  c.panelProjection.placements[0].x = 0;
  c._applyDynamicLayoutOverrides();
  assert.deepEqual(c.panelProjection.placements[0], savedPeer);
  assert.equal(c._placementForEntity('group').groupId, 'outer');
  const locked = c._placementForEntity('b');
  locked.locked = true;
  const position = { x: locked.x, y: locked.y };
  const again = c._captureDisplayLayout();
  c.store.boards[0].view.horizontalSpacing = 150;
  c._reflowDisplayLayout(again);
  assert.deepEqual({ x: locked.x, y: locked.y }, position);
});

test('显示尺寸滑块连续输入仅记一次撤销，外观修改不改变位置', t => {
  const c = fixture('manual');
  c._applyViewMode = c._syncDisplayForm = c._updateSummary = c._refreshHistoryButtons = () => {};
  c._renderGraph = before => { if (before) c._reflowDisplayLayout(before); };
  const previous = globalThis.FormData;
  globalThis.FormData = class { constructor(form) { this.form = form; } get(key) { return this.form.values[key] ?? null; } };
  t.after(() => { globalThis.FormData = previous; });
  const form = { values: { ...c._displayViewSettings() }, elements: { namedItem: key => ({ checked: form.values[key] }) } };
  const original = JSON.parse(c._historySnapshot());
  form.values.groupTitleFontSize = 30;
  c._updateBoardDisplayFromForm(form);
  assert.equal(c.store.boards[0].view.groupTitleFontSize, 30);
  for (const width of [400, 500, 600]) { form.values.cardWidth = width; c._updateBoardDisplayFromForm(form); }
  assert.equal(c.undoStack.length, 1);
  const moved = structuredClone(c.store.boards[0].placements);
  c.displayLayoutEdit = null;
  form.values.statusTintOpacity = 0.15;
  c._updateBoardDisplayFromForm(form);
  assert.deepEqual(c.store.boards[0].placements, moved);
  c.undo();
  assert.deepEqual(c.store, original.store);
  assert.deepEqual(normalizeDynamicLayoutStore(c.dynamicLayoutStore), normalizeDynamicLayoutStore(original.dynamicLayouts));
});

test('下方群组变宽不会把上方互不相交的文字与卡片推到远处', () => {
  const c = fixture('manual');
  c.store.entities.push({ id: 'note', type: 'text', details: { width: 340, height: 160 } }, { id: 'repo', type: 'repository', details: {} });
  c.store.boards[0].placements.push({ entityId: 'note', x: 0, y: -500 }, { entityId: 'repo', x: 450, y: -500 });
  const before = c._captureDisplayLayout();
  c.store.boards[0].view.cardWidth = 600;
  c._reflowDisplayLayout(before);
  assert.equal(c._placementForEntity('repo').x, 450);
});
