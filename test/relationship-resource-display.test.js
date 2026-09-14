const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function fixture() {
  const c = new Controller({ bridge: {}, notify() {} });
  const entities = ['a', 'b'].flatMap(key => [
    { id: `entity_hostxx_${key}`, type: 'server', name: key, details: {}, transient: true },
    { id: `entity_groupxx_${key}`, type: 'group', name: `Project ${key}`, details: {}, transient: true, runtime: { dynamicKind: 'coolify-project-group' } },
    { id: `entity_deployxx_${key}`, type: 'deployment', name: `部署 ${key}`, details: {}, transient: true },
    { id: `entity_endpointxx_${key}`, type: 'endpoint', name: `访问点 ${key}`, details: {}, transient: true }
  ]);
  c.store = { schemaVersion: 1, activeBoardId: 'board_display01', entities: [], relationships: [], boards: [{
    id: 'board_display01', name: '显示内容', viewport: { x: 0, y: 0, zoom: 1 }, view: Model.defaultBoardView(),
    placements: ['a', 'b'].map(key => ({ entityId: `entity_hostxx_${key}`, x: 0, y: 0, resourceDisplayLevels: ['host'] }))
  }] };
  c.localWorkspaceMode = true;
  c.panelProjection = { entities, metadata: {},
    placements: entities.map((e, i) => ({ entityId: e.id, x: i * 100, y: 0, dynamic: true,
      ...(e.type === 'group' ? { groupLayout: 'auto' } : {}),
      ...(e.type === 'deployment' ? { groupId: e.id.replace('deployxx', 'groupxx') } : {}) })),
    relationships: ['a', 'b'].flatMap(key => [
      { id: `runs_${key}`, type: 'runs_on', sourceId: `entity_deployxx_${key}`, targetId: `entity_hostxx_${key}` },
      { id: `exposes_${key}`, type: 'exposes', sourceId: `entity_deployxx_${key}`, targetId: `entity_endpointxx_${key}` }
    ]) };
  c._persistSoon = c._persistDynamicLayoutsSoon = c._recordMutation = c._renderGraph = c._renderResources = c._refreshHistoryButtons = c._updateSummary = () => {};
  c.selectedEntityIds = new Set(['entity_hostxx_a']);
  return c;
}
const ids = c => c._filteredGraph().placements.map(p => p.entityId).sort();

test('主机只控制 Project 范围，部署和访问点由 Project 控制', () => {
  const c = fixture();
  assert.deepEqual(c._contextMenuItems('resource-settings').filter(item => item?.role === 'menuitemcheckbox').map(item => item.label), ['✓ 主机（当前卡片）', '○ Project 容器', '○ 部署', '○ 访问点']);
  c.selectedEntityIds = new Set(['entity_groupxx_a']);
  assert.deepEqual(c._contextMenuItems('resource-settings').filter(item => item?.role === 'menuitemcheckbox').map(item => item.label), ['✓ Project（当前卡片）', '○ 部署', '○ 访问点']);
});

test('只显示 Project 时服务器树仍显示容器，容器有自己的下级显示设置', () => {
  const c = fixture();
  c.store.boards[0].view.structure = 'server-tree';
  c._toggleResourceDisplayLevel('project');
  assert.ok(ids(c).includes('entity_groupxx_a'));
  assert.ok(ids(c).includes('entity_deployxx_a'));
  c.selectedEntityIds = new Set(['entity_groupxx_a']);
  c._toggleResourceDisplayLevel('deployment');
  assert.ok(ids(c).includes('entity_deployxx_a'));
  assert.ok(ids(c).includes('entity_deployxx_b'));
});

test('本机已有部署恢复实时 Project 归属，旧容器不继续占据画布', () => {
  const c = fixture();
  c.store.entities.push({ id: 'entity_old_group', type: 'group', name: '旧容器', details: {}, transient: true, runtime: { dynamicKind: 'coolify-project-group' } });
  c.store.boards[0].placements.push({ entityId: 'entity_old_group', x: 0, y: 0 }, { entityId: 'entity_deployxx_a', x: 90000, y: 90000, groupId: 'entity_old_group', note: '保留' });
  c._toggleResourceDisplayLevel('deployment');
  const placements = c._filteredGraph().placements;
  assert.ok(!ids(c).includes('entity_old_group'));
  const deploy = placements.find(p => p.entityId === 'entity_deployxx_a');
  assert.equal(deploy.groupId, 'entity_groupxx_a');
  assert.equal(deploy.note, '保留');
  assert.ok(deploy.x < 90000);
});

test('Project 的独立显示偏好优先于主机的默认层级', () => {
  const c = fixture();
  c._toggleResourceDisplayLevel('deployment');
  c.selectedEntityIds = new Set(['entity_groupxx_a']);
  c._setResourceDisplayLevels(['project', 'endpoint']);
  assert.ok(!ids(c).includes('entity_deployxx_a'));
  assert.ok(ids(c).includes('entity_endpointxx_a'));
  assert.ok(ids(c).includes('entity_groupxx_a'));
});

test('多选保存重载保留数组、空数组和旧版层级兼容', () => {
  const c = fixture();
  c.store.entities = c.panelProjection.entities.map(({ id, type, name, details }) => ({ id, type, name, details }));
  c._toggleResourceDisplayLevel('project');
  const saved = Model.assertValidStore(c.store);
  assert.deepEqual(saved.boards[0].placements[0].resourceDisplayLevels, ['host', 'project']);
  c.store = JSON.parse(JSON.stringify(saved));
  assert.ok(ids(c).includes('entity_groupxx_a'));
  assert.ok(ids(c).includes('entity_deployxx_a'));
  delete c.store.boards[0].placements[0].resourceDisplayLevels;
  c.store.boards[0].placements[0].resourceDisplayLevel = 'deployment';
  assert.ok(ids(c).includes('entity_deployxx_a'));
  c.store.boards[0].placements[0].resourceDisplayLevels = [];
  assert.deepEqual(Model.assertValidStore(c.store).boards[0].placements[0].resourceDisplayLevels, []);
});

test('复选菜单状态真实，当前卡片保留，部署选中时明确说明容器必需', () => {
  const c = fixture();
  c._toggleResourceDisplayLevel('project');
  const items = c._contextMenuItems('resource-settings').filter(item => item?.role === 'menuitemcheckbox');
  assert.equal(items.length, 4);
  assert.equal(items[0].disabled, true);
  assert.equal(items[1].checked, true);
  assert.equal(items[1].disabled, false);
});

test('不可选中的主机容器打开菜单后仍能应用显示设置', () => {
  const c = fixture();
  c.selectedEntityIds = new Set();
  c.selectedEntityId = '';
  c.contextMenuEntityId = 'entity_hostxx_a';
  const opened = [];
  c._openResourceSettingsMenu = entity => { opened.push(entity.id); return true; };
  assert.equal(c._runContextAction('resource-settings'), true);
  assert.deepEqual(opened, ['entity_hostxx_a']);
  c.contextMenuEntityId = 'entity_hostxx_a';
  assert.equal(c._runContextAction('resource-display-toggle:project'), true);
  assert.ok(ids(c).includes('entity_groupxx_a'));
  assert.equal(c._contextMenuItems('resource-settings').filter(item => item?.role === 'menuitemcheckbox').length, 0);
});

test('菜单目标优先于残留选择，主机与 Project 显示设置不会串改', () => {
  const c = fixture();
  c.selectedEntityIds = new Set(['entity_groupxx_a']);
  c.selectedEntityId = 'entity_groupxx_a';
  c.contextMenuEntityId = 'entity_hostxx_a';
  assert.equal(c._runContextAction('resource-display-toggle:project'), true);
  const host = c._placementForEntity('entity_hostxx_a');
  const project = c._placementForEntity('entity_groupxx_a');
  assert.deepEqual(host.resourceDisplayLevels, ['host', 'project']);
  assert.equal(project.resourceDisplayLevels, undefined);
});

test('主机自动排列只移动本主机 Project，保持其他主机与组内相对位置', () => {
  const c = fixture();
  c.panelProjection.entities.push(
    { id: 'entity_groupxx_c', type: 'group', name: 'Project 0', details: {}, transient: true, runtime: { dynamicKind: 'coolify-project-group' } },
    { id: 'entity_deployxx_c', type: 'deployment', name: '部署 c', details: {}, transient: true }
  );
  c.panelProjection.placements.push(
    { entityId: 'entity_groupxx_c', x: 800, y: 900, dynamic: true, groupLayout: 'auto' },
    { entityId: 'entity_deployxx_c', x: 830, y: 960, dynamic: true, groupId: 'entity_groupxx_c' }
  );
  c.panelProjection.relationships.push({ id: 'runs_c', type: 'runs_on', sourceId: 'entity_deployxx_c', targetId: 'entity_hostxx_a' });
  c._saveDynamicPlacementOverrides = c._finishBoardMutation = c._setCanvasAnnouncement = () => {};
  const before = new Map(c.panelProjection.placements.map(item => [item.entityId, { x: item.x, y: item.y }]));
  assert.equal(c._arrangeHost('entity_hostxx_a'), true);
  const after = new Map(c.panelProjection.placements.map(item => [item.entityId, { x: item.x, y: item.y }]));
  assert.deepEqual(after.get('entity_groupxx_b'), before.get('entity_groupxx_b'));
  assert.deepEqual(after.get('entity_deployxx_b'), before.get('entity_deployxx_b'));
  assert.equal(after.get('entity_deployxx_c').x - after.get('entity_groupxx_c').x,
    before.get('entity_deployxx_c').x - before.get('entity_groupxx_c').x);
});
