const test = require('node:test');
const assert = require('node:assert/strict');
const { arrangeBoardLayout } = require('../src/shared/panelTopologyProjection');

function fixture() {
  return {
    entities: [{ id: 'g', type: 'group' }, { id: 'd', type: 'deployment' },
      { id: 'd2', type: 'deployment' }, { id: 'e', type: 'endpoint' }, { id: 'shared', type: 'endpoint' }, { id: 'locked', type: 'endpoint' }],
    placements: [{ entityId: 'g', x: 0, y: 0, groupWidth: 700, groupHeight: 500, groupLayout: 'manual' },
      { entityId: 'd', x: 60, y: 80, groupId: 'g' }, { entityId: 'd2', x: 300, y: 280, groupId: 'g' },
      { entityId: 'e', x: 12000, y: 0 }, { entityId: 'shared', x: 15000, y: 300 }, { entityId: 'locked', x: -500, y: -500, locked: true }],
    relationships: [{ type: 'exposes', sourceId: 'd', targetId: 'e' },
      { type: 'exposes', sourceId: 'd', targetId: 'shared' }, { type: 'exposed_by', sourceId: 'shared', targetId: 'd2' },
      { type: 'exposes', sourceId: 'd2', targetId: 'locked' }]
  };
}

test('自动整理缩短访问点距离、不重叠、不修改归属和锁定位置，重复整理稳定', () => {
  const graph = fixture();
  const facts = structuredClone(graph.relationships);
  const membership = graph.placements.map(p => [p.entityId, p.groupId]);
  const options = { style: 'bilateral', compactEndpoints: true, preserveGroupContents: true, groupTitleSpace: 80 };
  arrangeBoardLayout(graph, options);
  const byId = new Map(graph.placements.map(p => [p.entityId, p]));
  assert.ok(Math.hypot(byId.get('e').x - byId.get('d').x, byId.get('e').y - byId.get('d').y) < 1400);
  assert.ok(Math.hypot(byId.get('shared').x - byId.get('d2').x, byId.get('shared').y - byId.get('d2').y) < 1400);
  assert.deepEqual(graph.relationships, facts);
  assert.deepEqual(graph.placements.map(p => [p.entityId, p.groupId]), membership);
  assert.equal(byId.get('locked').x, -500);
  assert.equal(byId.get('locked').y, -500);
  const overlap = (a, b) => a.x < b.x + (b.groupWidth || 280) && a.x + 280 > b.x
    && a.y < b.y + (b.groupHeight || 143) && a.y + 143 > b.y;
  for (const id of ['e', 'shared']) for (const other of ['g', 'locked', id === 'e' ? 'shared' : 'e']) {
    assert.equal(overlap(byId.get(id), byId.get(other)), false, `${id}/${other}`);
  }
  const once = structuredClone(graph.placements);
  arrangeBoardLayout(graph, options);
  assert.deepEqual(graph.placements, once);
});
