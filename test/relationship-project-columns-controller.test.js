const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

for (const layout of ['project-columns', 'lanes']) for (const topologyScopeMode of ['board', 'all']) test(`真实画布尺寸下主机分列收紧历史 Project，刷新与冷启动不重新扩框：${layout}/${topologyScopeMode}`, () => {
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_columns_display', entities: [], relationships: [],
    boards: [{ id: 'board_columns_display', name: '纵向列表显示回归', placements: [], viewport: { x: 0, y: 0, zoom: 1 },
      view: { structure: 'server-tree', layout: 'free', topologyScopeMode } }] });
  const canvas = { clientWidth: 1080, clientHeight: 600, getBoundingClientRect: () => ({ width: 1080, height: 600 }) };
  c.root = { querySelector: selector => selector === '.relationship-canvas' ? canvas : null };
  for (const name of ['render', '_renderGraph', '_refreshHistoryButtons', '_persistSoon', '_persistDynamicLayoutsSoon', '_updateSummary']) c[name] = () => {};
  const viewports = [];
  c.flowCanvas = { setViewport: viewport => { viewports.push(viewport); } };
  const topology = { state: 'ready', provider: { providerId: 'coolify_columns_display' }, topology: {
    servers: [{ nodeId: 'host1', name: 'Host 1' }, { nodeId: 'host2', name: 'Host 2' }],
    deployments: [1, 6, 2].flatMap((count, project) => Array.from({ length: count }, (_, app) => ({
      resourceUuid: `app${project}_${app}`, name: `App ${project}-${app}`, nodeId: project < 2 ? 'host1' : 'host2',
      projectUuid: `project${project}`, projectName: `Project ${String.fromCharCode(65 + project)}`,
      domains: [`https://site${project}-${app}.example.com`]
    })))
  } };
  c._setPanelTopology(topology);
  const entities = c._allEntitiesById();
  const groups = c.panelProjection.placements.filter(item => entities.get(item.entityId)?.runtime?.dynamicKind === 'coolify-project-group');
  assert.equal(groups.length, 3, '夹具需要三个真实投影 Project');
  for (const host of c.panelProjection.placements.filter(item => entities.get(item.entityId)?.type === 'server')) host.moveWithDescendants = true;
  for (const [index, group] of groups.entries()) {
    Object.assign(group, { groupLayout: 'auto', groupWidth: 4800, groupHeight: 7200, x: index * 5400, y: 400 });
    c.panelProjection.placements.filter(item => item.groupId === group.entityId).forEach((item, member) => {
      item.x = group.x + 40 + member * 500;
      item.y = group.y + 70 + member * 700;
    });
  }
  c._saveDynamicPlacementOverrides(c.panelProjection.placements.map(item => item.entityId));
  const initial = c._displayGeometryMap(c._unarchivedPlacements());
  for (const group of groups) assert.ok(initial.get(group.entityId).height >= 7200, '主机联动使历史超大容器进入真实显示路径');
  const membership = c._combinedPlacements().map(item => [item.entityId, item.groupId]);
  const relationships = structuredClone(c._combinedRelationships(c._combinedPlacements()));

  c._setLayout(layout);
  const visible = c._displayGeometryMap(c._unarchivedPlacements());
  for (const group of groups) {
    const rect = visible.get(group.entityId);
    assert.ok(rect.width < 2000 && rect.height < 2000, `${entities.get(group.entityId).name} 的显示边界须收紧`);
    for (const member of c._combinedPlacements().filter(item => item.groupId === group.entityId)) {
      const child = visible.get(member.entityId);
      if (!child) continue;
      assert.ok(child.x >= rect.x && child.y >= rect.y
        && child.x + child.width <= rect.x + rect.width
        && child.y + child.height <= rect.y + rect.height, '显示成员不能落在收紧后的容器外');
    }
  }
  const groupA = groups.find(item => entities.get(item.entityId).runtime.projectUuid === 'project0');
  const groupB = groups.find(item => entities.get(item.entityId).runtime.projectUuid === 'project1');
  const a = visible.get(groupA.entityId), b = visible.get(groupB.entityId);
  assert.notEqual(a.width, b.width, '单部署与六部署 Project 应有不同的内容宽度');
  assert.equal(a.x, b.x, '真实显示层仍保持同主机 Project 左对齐');
  assert.ok(a.y + a.height < b.y, '真实显示层保留名称顺序及组间留白');
  assert.ok(visible.size > 0, '排列产出可见几何');

  const geometry = (controller = c) => [...controller._displayGeometryMap(controller._unarchivedPlacements())]
    .map(([id, rect]) => [id, ...['x', 'y', 'width', 'height'].map(key => Math.round(rect[key]))])
    .sort((left, right) => left[0].localeCompare(right[0]));
  const first = geometry();
  const serialized = JSON.stringify({ store: c.store, dynamicLayoutStore: c.dynamicLayoutStore });
  const saved = JSON.parse(serialized);
  const reopened = new Controller({ bridge: {} });
  reopened.store = Model.assertValidStore(saved.store);
  reopened.dynamicLayoutStore = saved.dynamicLayoutStore;
  reopened.root = { querySelector: selector => selector === '.relationship-canvas' ? canvas : null };
  for (const name of ['render', '_renderGraph', '_refreshHistoryButtons', '_persistSoon', '_persistDynamicLayoutsSoon', '_updateSummary']) reopened[name] = () => {};
  reopened._setPanelTopology(structuredClone(topology));
  assert.deepEqual(geometry(reopened).map(([id, x, y]) => [id, x, y]), first.map(([id, x, y]) => [id, x, y]),
    '冷启动恢复已保存节点坐标');
  assert.deepEqual(geometry(reopened), first, '序列化后全新控制器冷启动须恢复已收紧的显示边界');
  c._setLayout(layout);
  assert.deepEqual(geometry(), first, '重复切换不重新扩框或改变显示坐标');
  c._setPanelTopology(topology);
  assert.deepEqual(geometry(), first, '后台重新投影保留刚收紧的显示几何');
  assert.deepEqual(c._combinedPlacements().map(item => [item.entityId, item.groupId]), membership);
  assert.deepEqual(c._combinedRelationships(c._combinedPlacements()), relationships);
});
