const test = require('node:test');
const assert = require('node:assert/strict');
const { orderByTopologyAndPosition, routeRelationship } = require('../src/shared/panelTopologyProjection');

test('排列按拓扑先后，同级按原始位置，不受数组或名称顺序影响', () => {
  const items = [{ entityId: 'end', x: 0, y: 0 }, { entityId: 'b', x: 0, y: 300 },
    { entityId: 'a', x: 100, y: 100 }, { entityId: 'start', x: 500, y: 500 }];
  const edges = [{ sourceId: 'start', targetId: 'a' }, { sourceId: 'start', targetId: 'b' },
    { sourceId: 'a', targetId: 'end' }, { sourceId: 'b', targetId: 'end' }];
  assert.deepEqual(orderByTopologyAndPosition(items, edges).map(p => p.entityId), ['start', 'a', 'b', 'end']);
  assert.deepEqual(orderByTopologyAndPosition([...items].reverse(), edges).map(p => p.entityId), ['start', 'a', 'b', 'end']);
  assert.equal(items[0].entityId, 'end', '排序不修改输入');
});

test('环内保留位置顺序，环外后继仍在环之后，重复边不丢节点', () => {
  const items = ['end', 'b', 'a'].map((entityId, y) => ({ entityId, x: 0, y }));
  const edges = [{ sourceId: 'a', targetId: 'b' }, { sourceId: 'b', targetId: 'a' },
    { sourceId: 'a', targetId: 'end' }, { sourceId: 'a', targetId: 'end' }];
  assert.deepEqual(orderByTopologyAndPosition(items, edges).map(p => p.entityId), ['b', 'a', 'end']);
});

const rect = (x, y, width = 200, height = 120) => ({ x, y, width, height });
test('根据相对位置选择左右或上下端口，缩放后仍贴合边界', () => {
  for (const [target, sides] of [[rect(450, 0), ['right', 'left']], [rect(-450, 0), ['left', 'right']],
    [rect(0, 350), ['bottom', 'top']], [rect(0, -350), ['top', 'bottom']]]) {
    const route = routeRelationship(rect(0, 0), target, [], { portOffsetY: 60, inset: 0.5 });
    assert.deepEqual([route.sourceSide, route.targetSide], sides);
    assert.equal(route.obstructed, false);
  }
});

test('连线绕开中间卡片，路径中间位置可用于标签且端点不漂移', () => {
  const source = rect(0, 200), target = rect(800, 200);
  const obstacle = rect(350, 100, 300, 320);
  const route = routeRelationship(source, target, [obstacle], { portOffsetY: 60 });
  assert.equal(route.obstructed, false);
  assert.ok(route.points.some(p => p.y < obstacle.y || p.y > obstacle.y + obstacle.height));
  assert.ok(Number.isFinite(route.labelX) && Number.isFinite(route.labelY));
});

test('密集障碍使用有界折线路由，重叠时不声称路径可通行', () => {
  const obstacles = [rect(300, -100, 140, 420), rect(570, 180, 140, 420)];
  const route = routeRelationship(rect(0, 200), rect(900, 200), obstacles);
  assert.equal(route.obstructed, false);
  const blocked = routeRelationship(rect(0, 0), rect(30, 10), [rect(-100, -100, 500, 500)]);
  assert.equal(blocked.obstructed, true);
  assert.ok(blocked.path.startsWith('M '));
});
