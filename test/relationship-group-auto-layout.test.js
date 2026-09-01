const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');
const Model = globalThis.RelationshipGraphModel;

function fixture() {
  const c = new Controller({ bridge: {} });
  c.store = { schemaVersion: 1, activeBoardId: 'board_autogroups', relationships: [],
    entities: ['group_one', 'group_two', 'group_outer'].map(id => ({ id, type: 'group', name: id, details: {} }))
      .concat(['card_one', 'card_two', 'card_three'].map(id => ({ id, type: 'deployment', name: id, details: {} }))),
    boards: [{ id: 'board_autogroups', name: '自动排列', view: { ...Model.defaultBoardView(), layout: 'compact', horizontalSpacing: 60, verticalSpacing: 40 },
      viewport: { x: 0, y: 0, zoom: 1 }, placements: [
        { entityId: 'group_one', x: 0, y: 0, groupId: 'group_outer', groupLayout: 'manual', groupWidth: 800, groupHeight: 3000 },
        { entityId: 'group_two', x: 1600, y: 0, groupLayout: 'auto', groupWidth: 800, groupHeight: 2800 },
        { entityId: 'group_outer', x: -28, y: -54, groupLayout: 'manual', groupWidth: 1400, groupHeight: 4000 },
        { entityId: 'card_one', x: 100, y: 600, groupId: 'group_one', note: '保留备注' },
        { entityId: 'card_two', x: 300, y: 2500, groupId: 'group_one' },
        { entityId: 'card_three', x: 1800, y: 2000, groupId: 'group_two' }
      ] }, { id: 'board_other', name: '其他白板', placements: [] }] };
  c._persistSoon = c._persistDynamicLayoutsSoon = c._renderGraph = c.render = c._refreshHistoryButtons = c._updateSummary = c.fitContent = () => {};
  return c;
}

test('自动群组收紧宽高，手动尺寸保留，嵌套边界跟随内容', () => {
  const c = fixture();
  let geometry = c._displayGeometryMap(c._combinedPlacements());
  assert.equal(geometry.get('group_one').height, 3000);
  assert.equal(geometry.get('group_two').width, 336);
  assert.equal(geometry.get('group_two').height, 225);
  c._toggleGroupLayout('group_one');
  c._toggleGroupLayout('group_outer');
  geometry = c._displayGeometryMap(c._combinedPlacements());
  assert.equal(geometry.get('group_one').width, 676);
  assert.equal(geometry.get('group_one').height, 225);
  assert.equal(geometry.get('group_outer').height, 307);
  assert.equal(geometry.get('card_two').x - geometry.get('card_one').x - 280, 60);
});

test('全部自动排列处理混合状态与隐藏群组，一次撤销，不改变结构和其他白板', () => {
  const c = fixture();
  c.store.boards[0].view.entityTypes = ['deployment'];
  const before = c._historySnapshot();
  const groups = c._autoLayoutGroups();
  assert.equal(groups.length, 3);
  c._toggleAllGroupLayouts();
  assert.ok(groups.every(group => group.groupLayout === 'auto'));
  assert.equal(c.undoStack.length, 1);
  const original = JSON.parse(before).store;
  assert.deepEqual(c.store.boards[0].view, original.boards[0].view);
  assert.deepEqual(c.store.boards[1], original.boards[1]);
  assert.deepEqual(c.store.boards[0].placements.map(p => [p.entityId, p.groupId, p.note]), original.boards[0].placements.map(p => [p.entityId, p.groupId, p.note]));
  c.undo();
  assert.deepEqual(c.store, original);
});

test('一键关闭自动排列固定屏幕位置与尺寸，保存重开不跳回旧坐标', () => {
  const c = fixture();
  c._toggleAllGroupLayouts();
  const before = c._displayGeometryMap(c._combinedPlacements());
  c._toggleAllGroupLayouts();
  assert.ok(c._autoLayoutGroups().every(group => group.groupLayout === 'manual'));
  c.store = structuredClone(c.store);
  const after = c._displayGeometryMap(c._combinedPlacements());
  for (const [id, rect] of before) for (const key of ['x', 'y', 'width', 'height']) assert.equal(after.get(id)[key], rect[key], `${id}.${key}`);
  assert.equal(c.undoStack.length, 2);
});

test('全局按钮跳过锁定群组、锁定后代和锁定祖先，空白板不写历史', () => {
  const c = fixture();
  c._placementForEntity('group_outer').locked = true;
  const before = structuredClone(c.store.boards[0].placements.filter(p => p.entityId !== 'group_two' && p.entityId !== 'card_three'));
  assert.deepEqual(c._autoLayoutGroups().map(p => p.entityId), ['group_two']);
  c._toggleAllGroupLayouts();
  assert.deepEqual(c.store.boards[0].placements.filter(p => p.entityId !== 'group_two' && p.entityId !== 'card_three'), before);
  c._placementForEntity('card_three').locked = true;
  const count = c.undoStack.length;
  c._toggleAllGroupLayouts();
  assert.equal(c.undoStack.length, count);
});

test('动态群组批量保存紧凑尺寸和模式，刷新后恢复', () => {
  const c = fixture();
  c.panelProjection = { entities: [{ id: 'entity_livegroup', type: 'group', name: '动态群组', details: {} },
    { id: 'entity_livecard', type: 'deployment', name: '动态卡片', details: {} }], relationships: [], placements: [
    { entityId: 'entity_livegroup', dynamic: true, x: 3200, y: 0, groupLayout: 'manual', groupWidth: 900, groupHeight: 5000 },
    { entityId: 'entity_livecard', dynamic: true, x: 3500, y: 4500, groupId: 'entity_livegroup' }
  ] };
  c._toggleAllGroupLayouts();
  const saved = structuredClone(c.panelProjection.placements);
  assert.equal(saved[0].groupHeight, 225);
  c.panelProjection.placements[0].groupLayout = 'manual';
  c.panelProjection.placements[0].groupHeight = 5000;
  c.panelProjection.placements[1].y = 4500;
  c._applyDynamicLayoutOverrides();
  assert.deepEqual(c.panelProjection.placements, saved);
});

test('全局按钮状态同步为全部、混合与无可排列群组', () => {
  const c = fixture();
  const button = { setAttribute(name, value) { this[name] = value; }, classList: { toggle() {} } };
  c.root = { querySelector: () => button };
  c._updateAllGroupLayoutButton();
  assert.equal(button['aria-pressed'], 'false');
  assert.equal(button.disabled, false);
  c._toggleAllGroupLayouts();
  c._updateAllGroupLayoutButton();
  assert.equal(button['aria-pressed'], 'true');
  c._toggleGroupLayout('group_one');
  c._updateAllGroupLayoutButton();
  assert.equal(button['aria-pressed'], 'false');
  c.store.activeBoardId = 'board_other';
  c._updateAllGroupLayoutButton();
  assert.equal(button.disabled, true);
});

test('树状结构的不同布局均收紧嵌套群组，反复测量不移动或放大容器', () => {
  for (const layout of ['right', 'down', 'bilateral', 'radial', 'lanes', 'compact']) {
    const c = fixture();
    Object.assign(c.store.boards[0].view, { structure: 'server-tree', layout });
    c._toggleAllGroupLayouts();
    const geometry = c._displayGeometryMap(c._combinedPlacements());
    for (const id of ['group_one', 'group_two', 'group_outer']) {
      const rect = geometry.get(id);
      assert.ok(rect.height < 1000, `${layout}:${id} 收紧容器`);
      const children = c._combinedPlacements().filter(p => p.groupId === id).map(p => geometry.get(p.entityId));
      assert.ok(children.every(child => child.x >= rect.x && child.y >= rect.y && child.x + child.width <= rect.x + rect.width && child.y + child.height <= rect.y + rect.height), `${layout}:${id} 包含成员`);
    }
    assert.deepEqual(c._displayGeometryMap(c._combinedPlacements()), geometry);
  }
});

test('组内按宽度实时换行，不受全板布局方向影响，不缩放成员', () => {
  for (const layout of ['right', 'down', 'bilateral', 'radial', 'lanes', 'compact']) {
    const c = fixture();
    c.store.boards[0].view.layout = layout;
    const group = c._placementForEntity('group_one');
    group.groupLayout = 'auto';
    group.groupWidth = 700;
    let geometry = c._displayGeometryMap(c._combinedPlacements());
    assert.equal(geometry.get('card_two').y, geometry.get('card_one').y, layout);
    group.groupWidth = 400;
    geometry = c._displayGeometryMap(c._combinedPlacements());
    assert.equal(geometry.get('card_two').y - geometry.get('card_one').y, 183, layout);
    assert.equal(geometry.get('card_one').width, 280);
    assert.equal(geometry.get('card_one').height, 143);
  }
});

test('切换全板布局只移动群组整体，不重置自适应换行宽度和组内偏移', () => {
  const c = fixture();
  c._toggleAllGroupLayouts();
  c.fitContent = () => {};
  const groupId = 'group_one';
  const offsets = () => {
    const geometry = c._displayGeometryMap(c._combinedPlacements());
    const group = geometry.get(groupId);
    return ['card_one', 'card_two'].map(id => {
      const rect = geometry.get(id); return [rect.x - group.x, rect.y - group.y, rect.width, rect.height];
    });
  };
  const original = offsets();
  for (const layout of ['down', 'radial', 'lanes', 'right']) {
    c._setLayout(layout);
    assert.deepEqual(offsets(), original, layout);
  }
});
