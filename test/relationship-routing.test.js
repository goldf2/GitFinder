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

test('对角相邻卡片允许上下与左右混合端口，不强制一对反向端口', () => {
  const route = routeRelationship(rect(0, 0, 320, 190), rect(400, 400, 320, 190), [], { portOffsetY: 59.5 });
  assert.deepEqual([route.sourceSide, route.targetSide], ['bottom', 'left']);
  assert.equal(route.obstructed, false);
});

test('被上排卡片挡住时可从同侧平滑绕开，不直接退化成长直角通道', () => {
  const obstacle = rect(400, 0, 320, 190);
  const route = routeRelationship(rect(400, 270, 320, 190), rect(500, -400, 320, 190), [obstacle], { portOffsetY: 59.5 });
  assert.match(route.path, / C /);
  assert.deepEqual([route.sourceSide, route.targetSide], ['left', 'left']);
  assert.equal(route.obstructed, false);
  assert.ok(route.points.every(p => !(p.x > obstacle.x && p.x < obstacle.x + obstacle.width && p.y > obstacle.y && p.y < obstacle.y + obstacle.height)));
  const length = route.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route.points[i].x, p.y - route.points[i].y), 0);
  assert.ok(length < 850, '比较候选曲线，避免先找到可行路线就接受过大的绕行');
});

test('多排部署汇聚到主机时路由保持可通行，并保留可用的曲线', () => {
  const cards = Array.from({ length: 36 }, (_, i) => rect(i % 9 * 400, Math.floor(i / 9) * 270, 320, 190));
  const host = rect(500, -400, 320, 190);
  const routes = cards.map((card, i) => routeRelationship(card, host, cards.filter((_, j) => i !== j), { portOffsetY: 59.5 }));
  assert.ok(routes.every(route => !route.obstructed));
  assert.ok(routes.every(route => / [CQ] /.test(route.path)), '直连和绕障转角均保留平滑曲线');
});

test('跨群组长连线不因避障向画布外绕出巨大弧圈', () => {
  const cards = Array.from({ length: 15 }, (_, i) => rect(i % 6 * 480, Math.floor(i / 6) * 350, 390, 260));
  const host = rect(3600, 5000, 390, 260);
  for (const [i, card] of cards.entries()) {
    const route = routeRelationship(card, host, cards.filter((_, j) => i !== j), { portOffsetY: 59.5 });
    assert.equal(route.obstructed, false, `card ${i}`);
    const overshoot = Math.max(...route.points.flatMap(p => [card.x - p.x, card.y - p.y,
      p.x - host.x - host.width, p.y - host.y - host.height]));
    assert.ok(overshoot < 180, `card ${i} 绕行超过局部范围: ${overshoot}`);
    for (let j = 1; j < route.points.length; j++) {
      const a = route.points[j - 1], b = route.points[j];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
      for (let step = 0; step <= steps; step++) {
        const x = a.x + (b.x - a.x) * step / steps, y = a.y + (b.y - a.y) * step / steps;
        assert.ok(!cards.some((other, k) => k !== i && x > other.x && x < other.x + other.width
          && y > other.y && y < other.y + other.height), `card ${i} 绕障后仍穿过卡片`);
      }
    }
  }
});

test('远距离空白区走线接近直连，保留端口切线而非随距离膨胀的弯曲', () => {
  const route = routeRelationship(rect(0, 0), rect(4000, 5000));
  const a = route.sourcePoint, b = route.targetPoint, length = Math.hypot(b.x - a.x, b.y - a.y);
  const deviation = Math.max(...route.points.map(p => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length));
  assert.ok(deviation < 100, `偏离直连 ${deviation}`);
  assert.equal(route.obstructed, false);
});
