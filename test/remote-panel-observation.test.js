const test = require('node:test');
const assert = require('node:assert/strict');
const { RemotePanelObservationService, SOURCE } = require('../src/main/services/remotePanelObservationService');
const data = {
  checkedAt: '2026-09-12T00:00:00Z', nodes: [{ id: 'n', status: 'online' }],
  resources: [{ originalId: 'uuid', nodeId: 'n', nodeUrl: 'https://node.test', secret: 'must-not-leak',
    webChecks: [{ url: 'https://app.test', status: 'online', statusCode: 404, latencyMs: 12, screenshotUrl: '/api/thumbnails/' + 'a'.repeat(40) + '.webp' }] }]
};
test('fixed read-only source, whitelist fields, batch time and cache', async () => {
  let calls = 0;
  const service = new RemotePanelObservationService({ fetchImpl: async (url, options) => {
    calls++; assert.equal(url, SOURCE); assert.equal(options.redirect, 'error');
    assert.equal(options.method, undefined); return Response.json(data);
  } });
  const result = await service.get();
  assert.equal(result.checks[0].httpStatus, 404);
  assert.equal(result.checks[0].checkedAt, data.checkedAt);
  assert.equal(result.checks[0].stale, false);
  assert.equal(result.checks[0].screenshotUrl, 'https://panel.xiangshu.me/api/thumbnails/' + 'a'.repeat(40) + '.webp');
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak/);
  await service.get(); assert.equal(calls, 1);
});
test('API failure keeps prior checks stale and never manufactures endpoint failure', async () => {
  let now = 1;
  let fail = false;
  const service = new RemotePanelObservationService({ now: () => now, fetchImpl: async () => {
    if (fail) throw new Error('private diagnostic');
    return Response.json(data);
  } });
  await service.get(); now += 61000; fail = true;
  const result = await service.get();
  assert.equal(result.checks[0].status, 'online');
  assert.equal(result.checks[0].stale, true);
  assert.match(result.error, /暂不可读取/);
  assert.doesNotMatch(JSON.stringify(result), /private diagnostic/);
});
test('malformed, oversized and credential-bearing records do not become valid checks', async () => {
  for (const response of [Response.json({ resources: [] }), new Response('x'.repeat(3 * 1024 * 1024 + 1))]) {
    const service = new RemotePanelObservationService({ fetchImpl: async () => response });
    assert.equal((await service.get()).checks.length, 0);
  }
  const service = new RemotePanelObservationService({ fetchImpl: async () => Response.json({ ...data, resources: [{ ...data.resources[0], nodeUrl: 'https://user:password@node.test' }] }) });
  assert.equal((await service.get()).checks.length, 0);
});
