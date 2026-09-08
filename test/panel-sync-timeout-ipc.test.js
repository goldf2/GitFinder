const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('同步与刷新使用持久化总超时，未配置默认 90 秒并限制范围', async () => {
  const handlers = new Map();
  let configured;
  let received;
  const source = fs.readFileSync(require.resolve('../src/main/ipc/panel'), 'utf8');
  const context = { module: { exports: {} }, require: id => {
    if (id === 'electron') return { app: {}, shell: {} };
    if (id === './security') return { registerTrustedHandler: (name, fn) => handlers.set(name, fn) };
    if (id.endsWith('/configService')) return { get: key => key === 'coolifyProviderSyncTimeoutMs' ? configured : 18000 };
    return {};
  }};
  vm.runInNewContext(source, context);
  context.module.exports.registerPanelIPC({ service: { getTopology: options => { received = options; return {}; } } });
  for (const channel of ['panel:getTopology', 'panel:refreshTopology']) {
    for (const [value, expected] of [[undefined, 90000], [180000, 180000], [1000, 30000], [999999, 300000], ['invalid', 90000]]) {
      configured = value;
      await handlers.get(channel)({}, { requestId: 'test_sync' });
      assert.equal(received.providerTimeoutMs, expected);
      assert.equal(received.deploymentHistoryTimeoutMs, 18000);
    }
  }
});
