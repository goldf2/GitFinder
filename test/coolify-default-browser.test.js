const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Coolify外链由主进程委托系统默认浏览器，校验失败不启动，启动失败可回传', async () => {
  const handlers = new Map(), calls = [], sequence = [];
  const allowed = 'https://coolify.example.invalid/project/project_1';
  let rejectLaunch = false;
  const context = { module: { exports: {} }, require: id => {
    if (id === 'electron') return { app: {}, shell: { openExternal: async (...args) => {
      sequence.push('system-default'); calls.push(args);
      if (rejectLaunch) throw new Error('default browser unavailable');
    } } };
    if (id === './security') return { registerTrustedHandler: (name, fn) => handlers.set(name, fn) };
    return {};
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/main/ipc/panel'), 'utf8'), context);
  context.module.exports.registerPanelIPC({ service: { resolveExternalUrl: value => {
    sequence.push('validate');
    if (value !== allowed) throw new Error('not in trusted snapshot');
    return value;
  } } });
  const open = handlers.get('panel:openExternal');
  assert.equal(await open({}, allowed), true);
  assert.deepEqual(sequence, ['validate', 'system-default']);
  assert.deepEqual(calls, [[allowed]], 'Only the URL is delegated; no browser name, executable, window, or embedded view is selected.');
  await assert.rejects(open({}, 'https://untrusted.example.invalid'), /trusted snapshot/);
  assert.equal(calls.length, 1);
  rejectLaunch = true;
  await assert.rejects(open({}, allowed), /default browser unavailable/);
});
