const test = require('node:test');
const assert = require('node:assert/strict');
const Projection = require('../src/shared/panelTopologyProjection');

test('Project 纵向列表按主机分列且重复排列稳定，不改变归属', () => {
  const graph = {
    entities: [
      { id: 'host1', type: 'server', name: 'AL01' }, { id: 'host2', type: 'server', name: 'AL02' },
      { id: 'a', type: 'group', name: 'A' }, { id: 'b', type: 'group', name: 'B' },
      { id: 'c', type: 'group', name: 'C' },
      ...['a', 'b', 'c'].map(id => ({ id: `d${id}`, type: 'deployment', name: id }))
    ],
    placements: [
      ...['host1', 'host2'].map(entityId => ({ entityId, x: 0, y: 0 })),
      ...['b', 'c', 'a'].flatMap(entityId => [
        { entityId, x: 20, y: 20, groupWidth: 400, groupHeight: 240 },
        { entityId: `d${entityId}`, groupId: entityId, x: 50, y: 80 }
      ])
    ],
    relationships: ['a', 'b', 'c'].map(id => ({ sourceId: `d${id}`, targetId: id === 'c' ? 'host2' : 'host1', type: 'runs_on' }))
  };
  const options = { style: 'project-columns', preserveGroupContents: true, groupTitleSpace: 60 };
  const edges = structuredClone(graph.relationships);
  Projection.arrangeBoardLayout(graph, options);
  const byId = new Map(graph.placements.map(p => [p.entityId, p]));
  assert.equal(byId.get('a').x, byId.get('b').x);
  assert.ok(byId.get('a').y < byId.get('b').y);
  assert.ok(byId.get('c').x > byId.get('a').x + byId.get('a').groupWidth);
  assert.ok(byId.get('host1').y < byId.get('a').y);
  assert.equal(byId.get('da').groupId, 'a');
  assert.deepEqual(graph.relationships, edges);
  const before = structuredClone(graph);
  Projection.arrangeBoardLayout(graph, options);
  assert.deepEqual(graph, before);
});
