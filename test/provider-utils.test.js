const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const provider = require('../src/main/services/providerUtils');

test('Provider 共享边界规范化文本、网络值和稳定 ID', () => {
  assert.equal(provider.cleanText('  a\u0000\n b  '), 'a b');
  assert.equal(provider.normalizeIdentifier('provider_1', 'Provider ID'), 'provider_1');
  assert.throws(() => provider.normalizeIdentifier('../provider', 'Provider ID'), /Provider ID 无效/);
  assert.equal(provider.normalizeBaseUrl('http://127.0.0.1:4173', { label: 'Panel' }), 'http://127.0.0.1:4173');
  assert.equal(provider.normalizeBaseUrl('https://cool.example.com/api/v1/', {
    label: 'Coolify', allowedPaths: ['', '/api/v1'], trimTrailingSlash: true
  }), 'https://cool.example.com');
  assert.throws(() => provider.normalizeBaseUrl('http://panel.example.com', { label: 'Panel' }), /必须使用 HTTPS/);
  assert.throws(() => provider.normalizeToken('bad token', 'Panel 访问令牌无效'), /访问令牌无效/);
  assert.equal(provider.normalizeExternalUrl('https://example.com/path/#fragment'), 'https://example.com/path');
});

test('Provider 共享原子写入创建私有文件，失败时保留上一份数据', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-provider-utils-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, 'nested', 'provider.json');
  provider.writeJsonAtomic(filePath, { version: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { version: 1 });
  if (process.platform !== 'win32') assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);

  const circular = {};
  circular.self = circular;
  assert.throws(() => provider.writeJsonAtomic(filePath, circular), /circular/i);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { version: 1 });
  assert.deepEqual(fs.readdirSync(path.dirname(filePath)), ['provider.json']);
});
