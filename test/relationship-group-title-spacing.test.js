const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
const Projection = require('../src/shared/panelTopologyProjection');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function fixture() {
  const entities = [{ id: 'entity_titlehost', type: 'server', name: '主机', details: {} }];
  const placements = [{ entityId: 'entity_titlehost', x: 0, y: 0, moveWithDescendants: true }];
  const relationships = [];
  for (let i = 0; i < 7; i++) {
    const groupId = `entity_titlegroup${i}`, cardId = `entity_titlecard${i}`;
    entities.push({ id: groupId, type: 'group', name: `项目 ${i}`, details: {} },
      { id: cardId, type: 'deployment', name: `部署 ${i}`, details: {} });
    placements.push({ entityId: groupId, x: 500, y: i * 900, groupWidth: 1100, groupHeight: 700 + i * 80, groupLayout: 'manual' },
      { entityId: cardId, x: 528, y: i * 900 + 54, groupId });
    relationships.push({ id: `relationship_titlehost${i}`, sourceId: cardId, targetId: 'entity_titlehost', type: 'runs_on' });
  }
  const c = new Controller({ bridge: {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_titlesdemo', entities, relationships,
    boards: [{ id: 'board_titlesdemo', name: '标题避让', placements, viewport: { x: 0, y: 0, zoom: 1 },
      view: { structure: 'server-tree', layout: 'bilateral' } }] });
  const canvas = { clientWidth: 1080, clientHeight: 600, getBoundingClientRect: () => ({ width: 1080, height: 600 }) };
  c.root = { querySelector: selector => selector === '.relationship-canvas' ? canvas : null };
  for (const name of ['render', '_renderGraph', '_refreshHistoryButtons', '_persistSoon', '_persistDynamicLayoutsSoon', '_applyViewport']) c[name] = () => {};
  return c;
}

test('标题留白属于排列占位，不写入群组宽高，也不改变组内相对位置', () => {
  const c = fixture();
  const graph = { entities: c.store.entities, relationships: c.store.relationships, placements: structuredClone(c.store.boards[0].placements) };
  const before = structuredClone(graph.placements);
  Projection.arrangeServerTree(graph, { style: 'bilateral', preserveGroupContents: true, groupTitleSpace: 240 });
  for (const p of graph.placements.filter(p => p.groupWidth)) {
    const old = before.find(q => q.entityId === p.entityId);
    assert.equal(p.groupWidth, old.groupWidth);
    assert.equal(p.groupHeight, old.groupHeight);
    const child = graph.placements.find(q => q.groupId === p.entityId), oldChild = before.find(q => q.entityId === child.entityId);
    assert.deepEqual([child.x - p.x, child.y - p.y], [oldChild.x - old.x, oldChild.y - old.y]);
  }
});
