const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { EndpointHealthService, probeEndpoint, isPublicAddress } = require('../src/main/services/endpointHealthService');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
function transport(responses, calls = []) {
  return (url, options, callback) => {
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      calls.push({ url: url.href, options });
      const value = responses.shift();
      if (value instanceof Error) return req.emit('error', value);
      const res = { statusCode: value.status, headers: value.headers || {}, destroy: () => { res.destroyed = true; } };
      callback(res);
      assert.equal(res.destroyed, true, '不下载响应正文');
    });
    return req;
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('HTTP 检测跟随公开重定向，不支持 HEAD 时只读 GET，不携带凭据', async () => {
  const calls = [];
  const result = await probeEndpoint('https://site.example/app', { lookup: publicLookup,
    request: transport([{ status: 302, headers: { location: '/new' } }, { status: 405 }, { status: 200 }], calls) });
  assert.equal(result.status, 'reachable');
  assert.equal(result.httpStatus, 200);
  assert.ok(result.latencyMs >= 0);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  assert.deepEqual(calls.map(call => call.options.method), ['HEAD', 'HEAD', 'GET']);
  assert.ok(calls.every(call => !Object.keys(call.options.headers).some(key => /authorization|cookie|token/i.test(key))));
  assert.ok(calls.every(call => call.options.rejectUnauthorized === true && call.options.agent === false));
  calls[0].options.lookup('site.example', { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]);
  });
});

test('401/403 为受限，404/500 为 HTTP 异常，不能伪装成正常', async () => {
  for (const status of [200, 204, 401, 403, 404, 500]) {
    const result = await probeEndpoint('https://site.example', { lookup: publicLookup, request: transport([{ status }]) });
    assert.equal(result.httpStatus, status);
    assert.equal(result.status, status < 300 ? 'reachable' : status < 404 ? 'restricted' : 'http_error');
  }
});

test('拒绝私网、回环、保留地址、IPv4 映射和不安全重定向', async () => {
  for (const address of ['127.0.0.1', '0.0.0.0', '10.0.0.1', '100.100.100.200', '169.254.169.254', '172.16.0.1', '192.168.0.1', '192.0.2.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  let requests = 0;
  for (const url of ['file:///etc/passwd', 'https://user:secret@site.example', 'http://127.1', 'http://[::1]']) {
    const result = await probeEndpoint(url, { request: () => requests++, lookup: publicLookup });
    assert.equal(result.status, 'blocked');
  }
  assert.equal(requests, 0);
  const mixed = await probeEndpoint('https://site.example', { lookup: async () => [...await publicLookup(), { address: '10.0.0.1', family: 4 }], request: () => requests++ });
  assert.equal(mixed.status, 'blocked');
  assert.equal(requests, 0);
  for (const location of ['http://169.254.169.254/latest/meta-data', 'https://localhost/', 'http://site.example/plain']) {
    const calls = [];
    const result = await probeEndpoint('https://site.example', { lookup: publicLookup, request: transport([{ status: 302, headers: { location } }], calls) });
    assert.equal(result.status, 'blocked');
    assert.equal(calls.length, 1);
  }
});

test('重定向循环、DNS、证书与总超时均结束检测并给出可区分结果', async () => {
  const loop = await probeEndpoint('https://site.example', { lookup: publicLookup, request: transport(Array.from({ length: 6 }, () => ({ status: 302, headers: { location: '/again' } }))) });
  assert.equal(loop.status, 'redirect_error');
  for (const [code, expected] of [['ENOTFOUND', 'dns_error'], ['CERT_HAS_EXPIRED', 'tls_error'], ['ECONNREFUSED', 'unreachable']]) {
    const result = await probeEndpoint('https://site.example', { lookup: publicLookup, request: transport([Object.assign(new Error('不暴露原始异常'), { code })]) });
    assert.equal(result.status, expected);
    assert.equal(result.latencyMs, null);
    assert.doesNotMatch(result.message, /不暴露原始异常/);
  }
  const timeout = await probeEndpoint('https://site.example', { timeoutMs: 15, lookup: () => new Promise(() => {}) });
  assert.equal(timeout.status, 'timeout');
});

test('后台队列限并发、同域名跨实例去重、缓存过期重测且只接受登记的访问点', async () => {
  let now = 1000;
  const jobs = [];
  const service = new EndpointHealthService({ now: () => now, concurrency: 2, probe: url => new Promise(resolve => jobs.push({ url, resolve })) });
  service.setTargets('one', ['https://a.example', 'https://b.example', 'https://c.example']);
  service.setTargets('two', ['https://a.example']);
  assert.throws(() => service.start({ providerId: 'one', url: 'https://not-known.example' }), /不存在/);
  assert.equal(service.start().pending, 3);
  await tick();
  assert.equal(jobs.length, 2);
  service.start({ force: true });
  assert.equal(jobs.length, 2);
  const result = { status: 'reachable', httpStatus: 200, latencyMs: 4, checkedAt: new Date(now).toISOString(), message: '' };
  jobs[0].resolve(result);
  await tick();
  assert.equal(jobs.length, 3);
  jobs[1].resolve(result); jobs[2].resolve(result);
  await tick();
  assert.equal(service.snapshot().checks.length, 4);
  assert.equal(service.snapshot().pending, 0);
  assert.equal(service.start().pending, 0);
  now += 61000;
  assert.equal(service.start().pending, 3);
  service.retainProviders([]);
  assert.deepEqual(service.snapshot(), { checks: [], pending: 0 });
});
