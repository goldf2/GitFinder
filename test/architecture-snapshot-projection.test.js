const test = require('node:test');
const assert = require('node:assert/strict');

const Projection = require('../src/shared/architectureSnapshotProjection');

test('Archify 快照投影为只读架构节点、边和边界', () => {
  const result = Projection.project({
    schema_version: 2,
    diagram_type: 'architecture',
    meta: { title: '示例架构' },
    components: [
      { id: 'api', type: 'service', label: 'API', sublabel: 'HTTP 服务', pos: [20, 40] },
      { id: 'db', type: 'database', label: '数据库', pos: [400, 40] }
    ],
    boundaries: [{ id: 'runtime', kind: 'container', label: '运行时', wraps: ['api', 'db'] }],
    connections: [{ from: 'api', to: 'db', label: '读取' }]
  }, {
    snapshotId: '0123456789abcdef', repositoryName: 'demo', repositoryHead: 'abcdef'
  });

  assert.equal(result.metadata.title, '示例架构');
  assert.equal(result.metadata.componentCount, 2);
  assert.equal(result.relationships.length, 1);
  assert.equal(result.relationships[0].type, 'connects_to');
  const components = result.entities.filter(entity => entity.type === 'architecture');
  assert.equal(components.length, 2);
  assert.equal(components[0].source, 'imported');
  assert.equal(components[0].details.architectureSnapshotId, '0123456789abcdef');
  assert.ok(result.entities.some(entity => entity.type === 'group' && entity.transient));
  assert.ok(result.placements.every(placement => placement.locked && placement.architectureReadOnly));
});
