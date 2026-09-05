const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const {
  CALLBACK_URL,
  Controller,
  normalizeIssuer,
  normalizeState,
  presentationForState,
} = require('../src/renderer/scripts/accountController');

class FakeElement {
  constructor(id, dataset = {}) {
    this.id = id;
    this.dataset = { ...dataset };
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.innerHTML = 'preserve-me';
    this.focused = false;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  focus() { this.focused = true; }
}

function createHarness(auth) {
  const listeners = new Map();
  const ids = [
    'settings-account',
    'settings-account-summary',
    'settings-account-detail',
    'settings-account-issuer',
    'settings-account-client-id',
    'settings-account-callback',
    'settings-account-config-feedback',
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  const actionElements = ['sign-in', 'cancel', 'refresh', 'sign-out', 'configure']
    .map(action => new FakeElement(`action-${action}`, { accountAction: action }));
  const document = {
    activeElement: null,
    addEventListener(type, listener) { listeners.set(type, listener); },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      return selector === '[data-account-action]' ? actionElements : [];
    },
  };
  const messages = [];
  const controller = new Controller({
    bridge: auth ? { auth } : {},
    document,
    onStatusMessage: (message, tone) => messages.push({ message, tone }),
  });
  return { actionElements, controller, document, elements, listeners, messages };
}

function action(harness, name) {
  return harness.actionElements.find(element => element.dataset.accountAction === name);
}

test('账户状态只接收安全公开字段，不保留令牌或未知阶段', () => {
  const state = normalizeState({
    configured: true,
    configuration: {
      issuer: 'https://login.example.com',
      clientId: 'gitfinder-desktop',
      redirectUri: CALLBACK_URL,
      clientSecret: 'must-not-survive',
    },
    phase: 'signed-in',
    user: { id: 'u1', name: 'Ada', email: 'ada@example.com', accessToken: 'secret' },
    persistent: true,
    expiresAt: 123456,
    accessToken: 'secret',
    refreshToken: 'secret',
  });

  assert.deepEqual(state, {
    configured: true,
    configuration: {
      issuer: 'https://login.example.com',
      clientId: 'gitfinder-desktop',
      redirectUri: CALLBACK_URL,
    },
    phase: 'signed-in',
    user: { id: 'u1', name: 'Ada', email: 'ada@example.com' },
    persistent: true,
    expiresAt: 123456,
    error: '',
  });
  assert.equal(normalizeState({ phase: 'token-ready' }).phase, 'signed-out');
  assert.equal(JSON.stringify(state).includes('secret'), false);
});

test('服务地址只接受 HTTPS，保留合法路径并移除末尾斜杠', () => {
  assert.equal(normalizeIssuer('https://login.example.com/'), 'https://login.example.com');
  assert.equal(normalizeIssuer('https://login.example.com/casdoor/'), 'https://login.example.com/casdoor');
  assert.equal(normalizeIssuer('http://login.example.com'), '');
  assert.equal(normalizeIssuer('https://user:pass@login.example.com'), '');
  assert.equal(normalizeIssuer('https://login.example.com?tenant=one'), '');
  assert.equal(normalizeIssuer('https://login.example.com/#fragment'), '');
  assert.equal(normalizeIssuer('not a url'), '');
});

test('账户设置说明登录可选、系统浏览器注册和本机退出边界', () => {
  const markup = new Controller({ bridge: {}, document: {} }).settingsMarkup();

  assert.match(markup, /id="settings-account"/);
  assert.match(markup, /登录 \/ 注册…/);
  assert.match(markup, /系统浏览器/);
  assert.match(markup, /退出本机登录/);
  assert.match(markup, /不会退出其他网站/);
  assert.match(markup, /高级：登录服务配置/);
  assert.match(markup, /公开 Client ID/);
  assert.match(markup, new RegExp(CALLBACK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(markup, /同步|客户端密钥[^<]*输入/);
});

test('未配置时登录保持可见但禁用，离线使用不受影响', async () => {
  const auth = {
    getStatus: async () => ({ configured: false, phase: 'signed-out' }),
    onChanged: () => () => {},
    configure: async value => ({ configured: true, configuration: value, phase: 'signed-out' }),
  };
  const harness = createHarness(auth);

  await harness.controller.setup();

  assert.equal(action(harness, 'sign-in').hidden, false);
  assert.equal(action(harness, 'sign-in').disabled, true);
  assert.equal(action(harness, 'configure').disabled, false);
  assert.match(harness.elements.get('settings-account-detail').textContent, /本地功能/);
});

test('缺少 auth bridge 时账户降级不影响其余页面', async () => {
  const harness = createHarness(null);
  await assert.doesNotReject(() => harness.controller.setup());

  assert.equal(action(harness, 'sign-in').disabled, true);
  assert.equal(action(harness, 'configure').disabled, true);
  assert.match(harness.elements.get('settings-account-detail').textContent, /本地功能不受影响/);
});

test('推送状态和账户动作只更新账户节点，不重绘设置页', async () => {
  let changed;
  let signInCalls = 0;
  const auth = {
    getStatus: async () => ({
      configured: true,
      configuration: { issuer: 'https://login.example.com', clientId: 'desktop' },
      phase: 'signed-out',
    }),
    onChanged: callback => { changed = callback; return () => {}; },
    signIn: async () => {
      signInCalls += 1;
      return { configured: true, phase: 'signing-in' };
    },
  };
  const harness = createHarness(auth);
  const settingsSection = harness.elements.get('settings-account');
  await harness.controller.setup();

  await harness.controller.performAction('sign-in');
  assert.equal(signInCalls, 1);
  assert.equal(action(harness, 'cancel').hidden, false);
  assert.equal(settingsSection.innerHTML, 'preserve-me');

  changed({
    configured: true,
    phase: 'signed-in',
    user: { id: 'u1', name: 'Ada', email: 'ada@example.com' },
    persistent: true,
  });
  assert.equal(harness.elements.get('settings-account-summary').textContent, 'Ada');
  assert.equal(action(harness, 'sign-out').hidden, false);
  assert.equal(settingsSection.innerHTML, 'preserve-me');
});

test('配置校验在 renderer 阻止 HTTP，合法配置立即交给 main 生效', async () => {
  const configured = [];
  const auth = {
    getStatus: async () => ({ configured: false, phase: 'signed-out' }),
    onChanged: () => () => {},
    configure: async value => {
      configured.push(value);
      return {
        configured: true,
        configuration: { ...value, redirectUri: CALLBACK_URL },
        phase: 'signed-out',
      };
    },
  };
  const harness = createHarness(auth);
  await harness.controller.setup();
  harness.elements.get('settings-account-issuer').value = 'http://login.example.com';
  harness.elements.get('settings-account-client-id').value = 'desktop';
  assert.equal(await harness.controller.configure(), false);
  assert.equal(configured.length, 0);
  assert.match(harness.elements.get('settings-account-config-feedback').textContent, /HTTPS/);

  harness.elements.get('settings-account-issuer').value = 'https://login.example.com/';
  assert.ok(await harness.controller.configure());
  assert.deepEqual(configured, [{ issuer: 'https://login.example.com', clientId: 'desktop' }]);
  assert.match(harness.messages.at(-1).message, /旧本机会话已清除/);
});

test('IPC reject 与返回 state.error 都在账户区呈现', async () => {
  const rejected = createHarness({
    getStatus: async () => ({ configured: true, phase: 'signed-out' }),
    onChanged: () => () => {},
    signIn: async () => { throw new Error('浏览器启动失败'); },
  });
  await rejected.controller.setup();
  assert.equal(await rejected.controller.performAction('sign-in'), false);
  assert.equal(rejected.elements.get('settings-account-summary').textContent, '账户操作失败');
  assert.match(rejected.elements.get('settings-account-detail').textContent, /浏览器启动失败/);

  const returnedError = createHarness({
    getStatus: async () => ({ configured: true, phase: 'signed-out' }),
    onChanged: () => () => {},
    refresh: async () => ({ configured: true, phase: 'error', error: '会话刷新失败' }),
  });
  await returnedError.controller.setup();
  await returnedError.controller.performAction('refresh');
  assert.match(returnedError.elements.get('settings-account-detail').textContent, /会话刷新失败/);
});

test('登录请求尚未结束时可取消，迟到的登录结果不会覆盖取消状态', async () => {
  let finishSignIn;
  let cancelCalls = 0;
  const auth = {
    getStatus: async () => ({ configured: true, phase: 'signed-out' }),
    onChanged: () => () => {},
    signIn: () => new Promise(resolve => { finishSignIn = resolve; }),
    cancel: async () => {
      cancelCalls += 1;
      return { configured: true, phase: 'signed-out' };
    },
  };
  const harness = createHarness(auth);
  await harness.controller.setup();

  const signIn = harness.controller.performAction('sign-in');
  assert.equal(action(harness, 'cancel').hidden, false);
  assert.equal(action(harness, 'cancel').disabled, false);
  assert.ok(await harness.controller.performAction('cancel'));
  assert.equal(cancelCalls, 1);
  assert.equal(harness.controller.state.phase, 'signed-out');

  finishSignIn({ configured: true, phase: 'signing-in' });
  assert.equal(await signIn, false);
  assert.equal(harness.controller.state.phase, 'signed-out');
  assert.equal(harness.controller.pendingAction, '');
});

test('账户脚本先于 app 加载，设置页只做控制器最小接线', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/scripts/app.js'), 'utf8');
  const navigation = require('../src/renderer/scripts/settingsNavigation');

  assert.ok(html.indexOf('scripts/accountController.js') < html.indexOf('scripts/app.js'));
  assert.equal(navigation.ITEMS[0].id, 'settings-account');
  assert.match(appSource, /new window\.AccountController\.Controller/);
  assert.match(appSource, /this\.accountController\.settingsMarkup\(\)/);
  assert.match(appSource, /this\.accountController\.render\(\)/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(projectRoot, 'src/renderer/scripts/accountController.js'), 'utf8'),
    /renderSettingsView|contentArea\.innerHTML/
  );
});

test('状态文案覆盖登录中、登录成功、过期和错误', () => {
  assert.equal(presentationForState({ phase: 'signing-in' }).summary, '等待浏览器登录');
  assert.equal(presentationForState({ phase: 'signed-in', user: { name: 'Ada' } }).summary, 'Ada');
  assert.equal(presentationForState({ phase: 'session-expired' }).summary, '会话已过期');
  assert.equal(
    presentationForState({ phase: 'session-expired', error: '刷新失败' }).detail,
    '刷新失败'
  );
  assert.match(
    presentationForState({ phase: 'signed-in', user: { name: 'Ada' }, error: '仅当前会话有效' }).detail,
    /仅当前会话有效/
  );
  assert.equal(presentationForState({ phase: 'error', error: '失败' }).detail, '失败');
});
