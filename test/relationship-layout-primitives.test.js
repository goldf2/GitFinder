const test = require('node:test');
const assert = require('node:assert/strict');
const { indexPlacements } = require('../src/shared/relationshipLayoutPrimitives');

test('位置树索引一次构建后复用后代、深度与嵌套判断', () => {
  const root = { entityId: 'root' };
  const child = { entityId: 'child', groupId: 'root' };
  const leaf = { entityId: 'leaf', groupId: 'child' };
  const sibling = { entityId: 'sibling', groupId: 'root' };
  const index = indexPlacements([root, child, leaf, sibling]);

  assert.equal(index.byId.get('leaf'), leaf);
  assert.deepEqual(index.children('root'), [child, sibling]);
  assert.deepEqual(index.descendants('root'), [child, sibling, leaf]);
  assert.equal(index.depth('leaf'), 2);
  assert.equal(index.canNest('root', 'leaf'), false);
  assert.equal(index.canNest('leaf', 'root'), true);
  assert.equal(index.canNest('leaf', 'missing'), false);
  assert.equal(index.canNest('leaf', ''), true);
});

test('位置树索引在损坏的循环数据中仍会终止且不重复返回节点', () => {
  const a = { entityId: 'a', groupId: 'b' };
  const b = { entityId: 'b', groupId: 'a' };
  const index = indexPlacements([a, b]);

  assert.deepEqual(index.descendants('a'), [b]);
  assert.equal(index.depth('a'), 1);
  assert.equal(index.canNest('a', 'b'), false);
});
