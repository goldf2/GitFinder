const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
const Projection = require('../src/shared/panelTopologyProjection');
const Primitives = require('../src/shared/relationshipLayoutPrimitives');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');
const counts = [[6], [1, 2, 3], [3, 1, 7, 4, 2, 1, 4, 1]];
const options = { preserveGroupContents: true, shrinkAutoProjectGroups: true, width: 240, height: 110,
  horizontalSpacing: 48, verticalSpacing: 32, groupTitleSpace: 60, viewportAspectRatio: 1.6 };

function graphFixture() {
  const graph = { entities: [], placements: [], relationships: [] };
  counts.forEach((projects, host) => {
    const hostId = `host${host}`;
    graph.entities.push({ id: hostId, name: ['AL02', 'AL03', 'con01'][host], type: 'server' });
    graph.placements.push({ entityId: hostId, x: 0, y: 0, width: 240, height: 110 });
    projects.forEach((count, p) => {
      const id = `project${host}_${p}`;
      graph.entities.push({ id, name: `Project ${p}`, type: 'group', runtime: { dynamicKind: 'coolify-project-group' } });
      graph.placements.push({ entityId: id, x: 0, y: 200, groupLayout: 'auto', groupWidth: 800, groupHeight: 1200 });
      for (let i = 0; i < count; i++) {
        const child = `${id}_app${i}`;
        graph.entities.push({ id: child, name: `App ${i}`, type: 'deployment' });
        graph.placements.push({ entityId: child, groupId: id, x: 30 + i * 260, y: 260 + i * 160, width: 240, height: 110 });
        graph.relationships.push({ sourceId: child, targetId: hostId, type: 'runs_on' });
      }
    });
  });
  return graph;
}
function extent(items) {
  const left = Math.min(...items.map(p => p.x)), top = Math.min(...items.map(p => p.y));
  return { width: Math.max(...items.map(p => p.x + (p.groupWidth || p.width || 240))) - left,
    height: Math.max(...items.map(p => p.y + (p.groupHeight || p.height || 110))) - top };
}
const cost = r => Math.max(r.width / 1.6, r.height);
function separated(rects) {
  rects.forEach((a, i) => rects.slice(i + 1).forEach(b => assert.ok(
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
    '布局矩形不能重叠')));
}

test('均衡总览是可持久化的新布局，旧纵向与自由布局继续保留', () => {
  assert.ok(Model.BOARD_LAYOUTS.includes('project-balanced'));
  for (const layout of ['project-balanced', 'project-columns', 'free']) {
    const store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_balanced1', entities: [], relationships: [],
      boards: [{ id: 'board_balanced1', name: '总览', placements: [], view: { layout }, viewport: { x: 0, y: 0, zoom: 1 } }] });
    assert.equal(Model.assertValidStore(JSON.parse(JSON.stringify(store))).boards[0].view.layout, layout);
  }
});

test('均衡矩形打包利用高容器旁的空白，稳定且不修改输入尺寸', () => {
  const regions = [{ width: 1200, height: 1600 }, { width: 600, height: 420 }, { width: 640, height: 630 }];
  const before = structuredClone(regions);
  const positions = Primitives.packBalancedRegions(regions, 1.6, 64);
  const rects = regions.map((r, i) => ({ ...r, ...positions[i] })); separated(rects);
  assert.ok(cost(extent(rects)) < cost(extent(regions.map((r, i) => ({ ...r, ...Primitives.packRegions(regions, 1.6, 64)[i] })))));
  assert.deepEqual(Primitives.packBalancedRegions(regions, 1.6, 64), positions);
  assert.deepEqual(regions, before);
  assert.deepEqual(Primitives.packBalancedRegions([], 1.6), []);
});

test('截图同规模三主机十二Project三十五部署：均衡总览不再挤成长单列', () => {
  const columns = graphFixture(), balanced = graphFixture();
  const facts = structuredClone({ entities: balanced.entities, relationships: balanced.relationships,
    membership: balanced.placements.map(p => [p.entityId, p.groupId]) });
  Projection.arrangeBoardLayout(columns, { ...options, style: 'project-columns' });
  Projection.arrangeBoardLayout(balanced, { ...options, style: 'project-balanced' });
  const projects = balanced.placements.filter(p => /^project2_\d$/.test(p.entityId));
  assert.ok(new Set(projects.map(p => p.x)).size > 1, '最多Project的主机必须使用多列');
  assert.ok(cost(extent(balanced.placements)) < cost(extent(columns.placements)) * 0.8, '总览需要显著降低适合画布的缩小程度');
  separated(balanced.placements.filter(p => p.entityId.startsWith('project') && !p.groupId)
    .map(p => ({ x: p.x, y: p.y, width: p.groupWidth, height: p.groupHeight })));
  assert.deepEqual({ entities: balanced.entities, relationships: balanced.relationships,
    membership: balanced.placements.map(p => [p.entityId, p.groupId]) }, facts);
  const first = structuredClone(balanced); Projection.arrangeBoardLayout(balanced, { ...options, style: 'project-balanced' });
  assert.deepEqual(balanced, first);
});

test('均衡总览保留手动组内部位置与含锁定元素的整组', () => {
  const graph = graphFixture();
  const manual = graph.placements.find(p => p.entityId === 'project0_0'); manual.groupLayout = 'manual';
  graph.placements.find(p => p.entityId === 'project1_0_app0').locked = true;
  const before = new Map(structuredClone(graph.placements).map(p => [p.entityId, p]));
  Projection.arrangeBoardLayout(graph, { ...options, style: 'project-balanced' });
  for (const p of graph.placements.filter(p => p.groupId === manual.entityId)) {
    const old = before.get(p.entityId), group = before.get(manual.entityId);
    assert.deepEqual([p.x - manual.x, p.y - manual.y], [old.x - group.x, old.y - group.y]);
  }
  for (const p of graph.placements.filter(p => p.entityId === 'project1_0' || p.groupId === 'project1_0')) assert.deepEqual(p, before.get(p.entityId));
});

function controllerFixture(width = 1280, height = 720) {
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_balanced1', entities: [], relationships: [],
    boards: [{ id: 'board_balanced1', name: '布局总览', placements: [], view: { structure: 'server-tree', layout: 'free', topologyScopeMode: 'all' }, viewport: { x: 0, y: 0, zoom: 1 } }] });
  const canvas = { clientWidth: width, clientHeight: height, getBoundingClientRect: () => ({ width, height }) };
  c.root = { querySelector: s => s === '.relationship-canvas' ? canvas : null };
  for (const name of ['render', '_renderGraph', '_refreshHistoryButtons', '_persistSoon', '_persistDynamicLayoutsSoon', '_updateSummary', 'fitContent']) c[name] = () => {};
  const topology = { state: 'ready', provider: { providerId: 'balanced-fixture' }, topology: {
    servers: counts.map((_, i) => ({ nodeId: `host${i}`, name: ['AL02', 'AL03', 'con01'][i] })),
    deployments: counts.flatMap((projects, h) => projects.flatMap((count, p) => Array.from({ length: count }, (_, d) => ({
      resourceUuid: `app${h}_${p}_${d}`, nodeId: `host${h}`, name: `App ${d}`, projectUuid: `p${h}_${p}`, projectName: `Project ${p}`, domains: []
    }))))
  } };
  c._setPanelTopology(topology); return { c, topology, canvas };
}
const geometry = c => [...c._displayGeometryMap(c._unarchivedPlacements())].map(([id, r]) => [id, r.x, r.y, r.width, r.height]).sort((a, b) => a[0].localeCompare(b[0]));

test('真实控制器均衡总览保持重复应用、后台刷新与新控制器重开一致', () => {
  const { c, topology } = controllerFixture();
  const facts = c._combinedPlacements().map(p => [p.entityId, p.groupId]);
  assert.equal(c._setLayout('project-balanced'), true);
  const first = geometry(c), saved = JSON.parse(JSON.stringify({ store: c.store, dynamic: c.dynamicLayoutStore }));
  c._setLayout('project-balanced'); assert.deepEqual(geometry(c), first);
  c._setPanelTopology(topology); assert.deepEqual(geometry(c), first);
  const { c: reopened } = controllerFixture(); reopened.store = Model.assertValidStore(saved.store); reopened.dynamicLayoutStore = saved.dynamic;
  reopened._setPanelTopology(topology); assert.deepEqual(geometry(reopened), first);
  assert.deepEqual(c._combinedPlacements().map(p => [p.entityId, p.groupId]), facts);
  const beforeFree = geometry(c); c._setLayout('free'); assert.deepEqual(geometry(c), beforeFree);
});

test('实际Flow模型尊重Project多列位置，不被历史长列修正重新压成一列', () => {
  const Adapter = require('../src/shared/relationshipFlowAdapter');
  const { c } = controllerFixture(); c._setLayout('project-balanced');
  const model = Adapter.toFlowModel(c._flowGraphInput(c._filteredGraph(), []), { hostContainerOnly: true, layout: 'project-balanced', cardWidth: 280, cardHeight: 143 });
  const host = model.nodes.find(n => n.type === 'hostBubble' && n.data.projectCount === 8);
  assert.ok(host, '夹具包含八个Project的主机');
  const projects = model.nodes.filter(n => n.parentId === host.id && n.data.entity.type === 'group');
  assert.ok(new Set(projects.map(n => n.position.x)).size > 1, '显示适配器不能强制回到纵向列表');
  separated(projects.map(n => ({ ...n.position, width: n.style.width, height: n.style.height })));
});

test('均衡打包在宽、窄画布与不同数量的矩形下均无重叠', () => {
  for (const n of [1, 2, 7, 32]) for (const aspect of [0.5, 1.6, 3]) {
    const regions = Array.from({ length: n }, (_, i) => ({ width: 200 + i % 4 * 71, height: 100 + i % 7 * 53 }));
    const positions = Primitives.packBalancedRegions(regions, aspect, 32);
    assert.equal(positions.length, n);
    separated(regions.map((r, i) => ({ ...r, ...positions[i] })));
  }
});

test('双列布局菜单方向键移动焦点，菜单内撤销和删除不作用于画布', () => {
  const Router = require('../src/renderer/scripts/relationshipBoardActionRouter');
  const doc = { activeElement: null, defaultView: { getComputedStyle: () => ({ gridTemplateColumns: '190px 190px' }) } };
  const buttons = Array.from({ length: 4 }, () => ({ focus() { doc.activeElement = this; } }));
  const menu = { hidden: false, ownerDocument: doc, querySelector: () => ({}), querySelectorAll: () => buttons };
  const c = { root: { isConnected: true, ownerDocument: doc, querySelector: () => menu },
    _handleContextMenuKeydown: () => false, undo: () => assert.fail('不能撤销画布'), _deleteSelection: () => assert.fail('不能删除画布') };
  const key = (name, extra = {}) => { const e = { key: name, target: { closest: () => null }, preventDefault() { this.defaultPrevented = true; }, ...extra }; Router.handleKeydown(c, e); return e; };
  buttons[0].focus(); assert.equal(key('ArrowRight').defaultPrevented, true); assert.equal(doc.activeElement, buttons[1]);
  key('ArrowDown'); assert.equal(doc.activeElement, buttons[3]);
  key('Home'); assert.equal(doc.activeElement, buttons[0]);
  key('z', { metaKey: true }); key('Delete'); assert.equal(doc.activeElement, buttons[0]);
});

test('布局菜单按用途分组，均衡总览有说明并保留所有旧选项', () => {
  const { c } = controllerFixture();
  const html = c._layoutMenuHtml();
  for (const label of ['常用排列', '关系走向', '其他布局', '均衡总览', '主机纵列']) assert.ok(html.includes(label), label);
  assert.match(html, /data-board-layout="project-balanced"/);
  assert.match(html, /role="group"/);
  assert.match(html, /Project 多列排列/);
  for (const mode of Model.BOARD_LAYOUTS) assert.equal(html.split(`data-board-layout="${mode}"`).length - 1, 1, mode);
});
