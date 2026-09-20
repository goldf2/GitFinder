const test = require('node:test');
const assert = require('node:assert/strict');
const { lamp, rows, remoteCheck, thumbnailUrl } = require('../src/shared/nativePanelModel');
const now = Date.parse('2026-09-12T00:00:00Z');
const checkedAt = new Date(now).toISOString();

test('management links use provider and source IDs, independently of public endpoints', () => {
  const provider = { providerId: 'one', baseUrl: 'https://coolify.test' };
  for (const type of ['application', 'service', 'database']) {
    const resource = { providerId: 'one', resourceUuid: 'resource1', projectUuid: 'project1', environmentUuid: 'env1', type, domains: [] };
    const snapshot = { providers: [provider], topology: { deployments: [resource] } };
    assert.equal(rows(snapshot)[0].managementUrl, `https://coolify.test/project/project1/environment/env1/${type}/resource1`);
    resource.domains = ['https://app.test', 'https://second.test'];
    assert.equal(rows(snapshot)[0].managementUrl, rows(snapshot)[1].managementUrl);
    resource.environmentUuid = '';
    resource.coolifyUrl = 'https://untrusted.test';
    assert.equal(rows(snapshot)[0].managementUrl, '');
  }
  assert.equal(rows({topology:{deployments:[{resourceUuid:'x',type:'application'}]}})[0].managementUrl, '');
});

test('remote screenshots resolve against the panel, never target servers or arbitrary URLs', () => {
  const path = '/api/thumbnails/' + 'a'.repeat(40) + '.webp';
  assert.equal(thumbnailUrl(path), 'https://panel.xiangshu.me' + path);
  assert.equal(thumbnailUrl('https://panel.xiangshu.me' + path), 'https://panel.xiangshu.me' + path);
  for (const bad of ['https://evil.test' + path, 'https://panel-al02.xiangshu.me' + path, '/undefined', 'data:image/svg+xml,x', path + '?token=x', '/api/thumbnails/../config']) assert.equal(thumbnailUrl(bad), '');
});

test('three sources distinguish unknown, checking, stale, HTTP failures and auth restrictions', () => {
  assert.equal(lamp(null, now).color, 'gray');
  assert.equal(lamp({ checking: true }, now).color, 'yellow');
  assert.equal(lamp({ status: 'reachable', checkedAt }, now).color, 'green');
  assert.equal(lamp({ status: 'online', httpStatus: 404, checkedAt }, now).color, 'red');
  assert.equal(lamp({ httpStatus: 403, checkedAt }, now).color, 'yellow');
  assert.equal(lamp({ status: 'running:healthy', checkedAt }, now).color, 'green');
  assert.equal(lamp({ status: 'running:unhealthy', checkedAt }, now).color, 'red');
  assert.equal(lamp({ status: 'running', checkedAt }, now + 301000).color, 'yellow');
});

test('resource endpoints become rows without dropping URL-less deployments', () => {
  const result = rows({ topology: { deployments: [
    { resourceUuid: 'a', domains: ['https://example.com', 'javascript:alert(1)'] },
    { resourceUuid: 'b', domains: [] }
  ] } });
  assert.equal(result.length, 2);
  assert.equal(result[0].url, 'https://example.com');
  assert.equal(result[1].url, '');
});

test('remote observations require matching node, resource and URL; duplicates are ambiguous', () => {
  const row = { resourceUuid: 'a', baseUrl: 'https://node.test', url: 'https://app.test' };
  const record = { resourceUuid: 'a', nodeUrl: 'https://node.test/', url: 'https://app.test/', checkedAt };
  assert.deepEqual(remoteCheck(row, { checks: [record] }), record);
  assert.equal(remoteCheck(row, { checks: [{ ...record, nodeUrl: 'https://other.test' }] }), null);
  assert.equal(remoteCheck(row, { checks: [record, record] }), null);
});
