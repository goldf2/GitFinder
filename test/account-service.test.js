const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { createAccountService, normalizeConfiguration } = require('../src/main/services/accountService');
const { createAccountStore } = require('../src/main/services/accountStore');

const configuration = { issuer: 'https://accounts.example.test', clientId: 'gitfinder-desktop' };
const session = () => ({ user: { id: 'member-1', name: '测试用户', email: '' },
  accessToken: 'private-access-token', refreshToken: 'private-refresh-token', expiresAt: Date.now() + 3600000 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function harness(t, options = {}) {
  const allocator = http.createServer();
  await new Promise(resolve => allocator.listen(0, '127.0.0.1', resolve));
  const port = allocator.address().port;
  await new Promise(resolve => allocator.close(resolve));
  let stored = options.saved || { configuration };
  const writes = [];
  const opened = [];
  const states = [];
  const request = { url: 'https://accounts.example.test/login', state: crypto.randomUUID() };
  const client = {
    authorization: async () => request,
    exchange: async () => session(),
    refresh: async () => session(),
    ...options.client,
  };
  const service = createAccountService({
    store: { read: () => stored, write: (config, next) => {
      stored = { configuration: config, session: next }; writes.push(stored); return Boolean(next);
    } },
    createClient: options.createClient || (async () => client),
    openExternal: async url => { opened.push(url); },
    onChanged: state => states.push(state),
    redirectUri: `http://127.0.0.1:${port}/oauth/callback`,
    loginTimeoutMs: options.loginTimeoutMs || 3000,
  });
  t.after(() => service.dispose());
  service.restore();
  return { service, opened, states, writes, port,
    callback: state => `http://127.0.0.1:${port}/oauth/callback?code=test-code&state=${state || request.state}` };
}

test('configuration permits only HTTPS issuer and a public client ID', () => {
  assert.deepEqual(normalizeConfiguration({ ...configuration, issuer: `${configuration.issuer}/` }), configuration);
  for (const issuer of ['http://example.test', 'file:///tmp/x', 'https://user:password@example.test', 'https://example.test?token=x']) {
    assert.throws(() => normalizeConfiguration({ ...configuration, issuer }));
  }
  assert.throws(() => normalizeConfiguration({ ...configuration, clientId: 'secret with spaces' }));
});

test('startup restores cached identity without discovery and never exposes tokens', async t => {
  const h = await harness(t, { saved: { configuration, session: session() },
    createClient: () => { throw new Error('startup must be offline'); } });
  const state = h.service.status();
  assert.equal(state.phase, 'signed-in');
  assert.equal(state.user.name, '测试用户');
  assert.equal(JSON.stringify(state).includes('private-'), false);
  assert.equal(h.opened.length, 0);
});

test('expired cached session stays local and requests explicit renewal', async t => {
  const h = await harness(t, { saved: { configuration, session: { ...session(), expiresAt: 1 } } });
  assert.equal(h.service.status().phase, 'session-expired');
  assert.equal(h.opened.length, 0);
  assert.equal((await h.service.refresh()).phase, 'signed-in');
});

test('forged state and unrelated path do not consume a real loopback callback', async t => {
  const h = await harness(t);
  assert.equal((await h.service.signIn()).phase, 'signing-in');
  assert.equal((await fetch(h.callback('forged'))).status, 400);
  assert.equal((await fetch(h.callback().replace('/oauth/callback', '/wrong'))).status, 404);
  assert.equal(h.service.status().phase, 'signing-in');
  const response = await fetch(h.callback());
  assert.equal(response.status, 200);
  assert.match(await response.text(), /登录成功/);
  assert.equal(h.service.status().phase, 'signed-in');
  assert.equal(h.writes.length, 1);
  assert.equal(h.states.some(state => JSON.stringify(state).includes('private-')), false);
});

test('duplicate login is single-flight and cancellation ignores late discovery', async t => {
  const gate = deferred();
  const h = await harness(t, { createClient: () => gate.promise });
  const login = h.service.signIn();
  assert.equal((await h.service.signIn()).phase, 'signing-in');
  h.service.cancel();
  gate.resolve({ authorization: async () => ({ url: 'https://example.test', state: 'x' }) });
  await login;
  assert.equal(h.opened.length, 0);
  assert.equal(h.service.status().phase, 'signed-out');
});

test('logout during an in-flight refresh cannot restore the old account', async t => {
  const gate = deferred();
  const h = await harness(t, { saved: { configuration, session: session() }, client: { refresh: () => gate.promise } });
  const refreshing = h.service.refresh();
  await new Promise(resolve => setImmediate(resolve));
  h.service.signOut();
  gate.resolve(session());
  await refreshing;
  assert.equal(h.service.status().user, null);
  assert.equal(h.writes.at(-1).session, null);
});

test('cancel while exchanging code cannot commit a session', async t => {
  const gate = deferred();
  const entered = deferred();
  const h = await harness(t, { client: { exchange: () => { entered.resolve(); return gate.promise; } } });
  await h.service.signIn();
  const response = fetch(h.callback()).catch(() => null);
  await entered.promise;
  h.service.cancel();
  gate.resolve(session());
  await response;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.writes.length, 0);
  assert.equal(h.service.status().user, null);
});

test('timeout closes callback listener and lets local app continue', async t => {
  const h = await harness(t, { loginTimeoutMs: 25 });
  await h.service.signIn();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(h.service.status().phase, 'error');
  assert.match(h.service.status().error, /超时/);
  await assert.rejects(fetch(h.callback()));
});

test('occupied callback port is handled without losing offline functionality', async t => {
  const h = await harness(t);
  const blocker = http.createServer();
  await new Promise(resolve => blocker.listen(h.port, '127.0.0.1', resolve));
  t.after(() => blocker.close());
  const state = await h.service.signIn();
  assert.match(state.error, /端口被占用/);
  assert.equal(h.opened.length, 0);
});

test('changing provider clears the previous session and pending login', async t => {
  const h = await harness(t, { saved: { configuration, session: session() } });
  const state = h.service.configure({ issuer: 'https://other.example.test', clientId: 'another-app' });
  assert.equal(state.user, null);
  assert.equal(state.phase, 'signed-out');
  assert.equal(h.writes.at(-1).session, null);
});

test('session store encrypts tokens, binds issuer/client and does not fall back to plaintext', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-account-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const key = crypto.randomBytes(32);
  let secure = true;
  const safeStorage = {
    isEncryptionAvailable: () => secure,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: text => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]);
    },
    decryptString: value => {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString();
    },
  };
  const store = createAccountStore(directory, safeStorage);
  const identity = session();
  assert.equal(store.write(configuration, identity), true);
  const file = path.join(directory, 'account-session.json');
  assert.equal(fs.readFileSync(file, 'utf8').includes('private-access-token'), false);
  assert.deepEqual(store.read().session, identity);
  const rebound = JSON.parse(fs.readFileSync(file, 'utf8'));
  rebound.configuration.issuer = 'https://malicious.example.test';
  fs.writeFileSync(file, JSON.stringify(rebound));
  assert.equal(store.read().session, null);
  secure = false;
  assert.equal(store.write(configuration, identity), false);
  assert.equal(store.read().session, null);
  assert.equal(fs.readFileSync(file, 'utf8').includes('private-'), false);
  secure = true;
  safeStorage.getSelectedStorageBackend = () => 'basic_text';
  assert.equal(store.write(configuration, identity), false);
});
