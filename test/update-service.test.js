const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  DEFAULT_RELEASE_PAGE_URL,
  DEFAULT_UPDATE_FEED_URL,
  createUpdateService,
  isNewerVersion,
  resolveUpdateConfiguration,
} = require('../src/main/services/updateService');

class FakeUpdater extends EventEmitter {
  setFeedURL(options) {
    this.feed = options;
  }

  async checkForUpdates() {
    this.checkCount = (this.checkCount || 0) + 1;
    return this.checkResult || null;
  }

  async downloadUpdate() {
    this.downloadCount = (this.downloadCount || 0) + 1;
  }

  quitAndInstall() {
    this.installCount = (this.installCount || 0) + 1;
  }
}

class FakeNotification extends EventEmitter {
  static instances = [];
  static isSupported() { return true; }

  constructor(options) {
    super();
    this.options = options;
    FakeNotification.instances.push(this);
  }

  show() { this.shown = true; }
}

test('Alpha 版本按语义版本比较，而不是只比较 2.0.0 主版本', () => {
  assert.equal(isNewerVersion('2.0.0-alpha.86', '2.0.0-alpha.85'), true);
  assert.equal(isNewerVersion('2.0.0-alpha.85', '2.0.0-alpha.85'), false);
  assert.equal(isNewerVersion('2.0.0-alpha.84', '2.0.0-alpha.85'), false);
  assert.equal(isNewerVersion('2.0.0', '2.0.0-alpha.99'), true);
});

test('打包应用默认使用 OakTech Alpha 更新源，可用环境变量覆盖或关闭', () => {
  assert.deepEqual(resolveUpdateConfiguration({ isPackaged: false, env: {} }), {
    enabled: false,
    reason: 'development',
    feedUrl: null,
    releasePageUrl: DEFAULT_RELEASE_PAGE_URL,
  });

  const defaults = resolveUpdateConfiguration({ isPackaged: true, env: {} });
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.feedUrl, DEFAULT_UPDATE_FEED_URL);
  assert.equal(defaults.releasePageUrl, DEFAULT_RELEASE_PAGE_URL);

  assert.equal(resolveUpdateConfiguration({
    isPackaged: true,
    env: { GITFINDER_2_UPDATE_ENABLED: '0' },
  }).reason, 'disabled');

  assert.equal(resolveUpdateConfiguration({
    isPackaged: true,
    env: { GITFINDER_2_UPDATE_URL: 'https://updates.example.test/gitfinder/alpha' },
  }).feedUrl, 'https://updates.example.test/gitfinder/alpha/');
});

test('更新源拒绝明文远程地址、账号凭据与查询参数', () => {
  const invalidValues = [
    'http://updates.example.test/gitfinder',
    'https://user:secret@updates.example.test/gitfinder',
    'https://updates.example.test/gitfinder?token=secret',
    'file:///tmp/releases',
  ];
  for (const value of invalidValues) {
    const result = resolveUpdateConfiguration({
      isPackaged: true,
      env: { GITFINDER_2_UPDATE_URL: value },
    });
    assert.equal(result.enabled, false, value);
    assert.equal(result.reason, 'invalid-configuration', value);
    assert.equal(result.feedUrl, null, value);
  }
});

test('更新服务统一配置发布源、检查结果和下载安装动作', async () => {
  const updater = new FakeUpdater();
  const dialogCalls = [];
  updater.checkResult = {
    updateInfo: {
      version: '2.0.0-alpha.86',
      releaseNotes: 'Online update ready',
      releaseDate: '2026-09-03T12:00:00.000Z',
    },
  };
  const scheduled = [];
  const service = createUpdateService({
    app: { getVersion: () => '2.0.0-alpha.85' },
    autoUpdater: updater,
    configuration: resolveUpdateConfiguration({ isPackaged: true, env: {} }),
    dialog: { showMessageBox: async (...args) => {
      dialogCalls.push(args);
      return { response: 0 };
    } },
    getMainWindow: () => null,
    schedule: (callback, delay) => scheduled.push({ callback, delay }),
  });

  assert.equal(service.setup(), true);
  assert.deepEqual(updater.feed, {
    provider: 'generic',
    url: DEFAULT_UPDATE_FEED_URL,
    channel: 'latest',
  });
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(scheduled[0].delay, 10_000);

  const result = await service.checkForUpdates();
  assert.equal(result.available, true);
  assert.equal(result.currentVersion, '2.0.0-alpha.85');
  assert.equal(result.version, '2.0.0-alpha.86');

  assert.equal(await service.downloadUpdate(), true);
  assert.equal(updater.downloadCount, 1);
  assert.equal(dialogCalls.length, 1);
  assert.match(dialogCalls[0].at(-1).message, /2\.0\.0-alpha\.86/);
  assert.equal(service.installUpdate(), true);
  assert.equal(updater.installCount, 1);
});

test('关闭自动检查后启动不请求网络，手动检查仍然可用', async () => {
  const updater = new FakeUpdater();
  updater.checkResult = { isUpdateAvailable: false, updateInfo: { version: '2.0.0-alpha.87' } };
  let automaticChecks = false;
  const scheduled = [];
  const service = createUpdateService({
    app: { getVersion: () => '2.0.0-alpha.87' },
    autoUpdater: updater,
    configuration: resolveUpdateConfiguration({ isPackaged: true, env: {} }),
    dialog: { showMessageBox: async () => ({ response: 1 }) },
    getAutomaticChecks: () => automaticChecks,
    setAutomaticChecks: (value) => { automaticChecks = value; },
    getMainWindow: () => null,
    schedule: (callback, delay) => scheduled.push({ callback, delay }),
  });

  assert.equal(service.setup(), true);
  assert.equal(scheduled.length, 0);
  assert.equal(service.status().automaticChecks, false);

  const result = await service.checkForUpdates();
  assert.equal(result.available, false);
  assert.equal(updater.checkCount, 1);

  assert.equal(service.setAutomaticChecks(true).automaticChecks, true);
  assert.equal(automaticChecks, true);
});

test('启动延迟期间关闭自动检查会取消该次联网检查', async () => {
  const updater = new FakeUpdater();
  let automaticChecks = true;
  const scheduled = [];
  const service = createUpdateService({
    app: { getVersion: () => '2.0.0-alpha.87' },
    autoUpdater: updater,
    configuration: resolveUpdateConfiguration({ isPackaged: true, env: {} }),
    dialog: { showMessageBox: async () => ({ response: 1 }) },
    getAutomaticChecks: () => automaticChecks,
    setAutomaticChecks: (value) => { automaticChecks = value; },
    getMainWindow: () => null,
    schedule: (callback) => scheduled.push(callback),
  });

  service.setup();
  service.setAutomaticChecks(false);
  await scheduled[0]();

  assert.equal(updater.checkCount, undefined);
});

test('可用更新必须经过用户确认，取消时不会下载', async () => {
  const updater = new FakeUpdater();
  const responses = [1, 0];
  const service = createUpdateService({
    app: { getVersion: () => '2.0.0-alpha.87' },
    autoUpdater: updater,
    configuration: resolveUpdateConfiguration({ isPackaged: true, env: {} }),
    dialog: { showMessageBox: async () => ({ response: responses.shift() }) },
    getMainWindow: () => null,
    schedule: () => {},
  });

  service.setup();
  updater.emit('update-available', { version: '2.0.0-alpha.88' });

  assert.equal(await service.downloadUpdate(), false);
  assert.equal(updater.downloadCount, undefined);
  assert.equal(await service.downloadUpdate(), true);
  assert.equal(updater.downloadCount, 1);
});

test('以 electron-updater 6.8.9 的 isUpdateAvailable 为最终结果', async () => {
  const updater = new FakeUpdater();
  updater.checkResult = {
    isUpdateAvailable: false,
    updateInfo: { version: '2.0.0-alpha.99' },
  };
  const service = createUpdateService({
    app: { getVersion: () => '2.0.0-alpha.85' },
    autoUpdater: updater,
    configuration: resolveUpdateConfiguration({ isPackaged: true, env: {} }),
    dialog: { showMessageBox: async () => ({ response: 2 }) },
    getMainWindow: () => null,
    schedule: () => {},
  });

  service.setup();
  const result = await service.checkForUpdates();
  assert.equal(result.available, false);
  assert.equal(result.version, '2.0.0-alpha.99');
});

test('未启用的更新服务返回明确原因而不请求网络', async () => {
  const updater = new FakeUpdater();
  const configuration = resolveUpdateConfiguration({ isPackaged: false, env: {} });
  const service = createUpdateService({
    app: { getVersion: () => '2.0.0-alpha.85' },
    autoUpdater: updater,
    configuration,
    dialog: null,
    getMainWindow: () => null,
    schedule: () => assert.fail('不应调度检查'),
  });

  assert.equal(service.setup(), false);
  assert.deepEqual(await service.checkForUpdates(), {
    available: false,
    currentVersion: '2.0.0-alpha.85',
    reason: 'development',
  });
  assert.equal(updater.checkCount, undefined);
});

test('发现更新时发送一次非阻塞系统通知，点击后打开软件更新设置', () => {
  FakeNotification.instances = [];
  const updater = new FakeUpdater();
  const sent = [];
  const window = {
    webContents: { send: (...args) => sent.push(args) },
    isDestroyed: () => false,
    isMinimized: () => true,
    restore() { this.restored = true; },
    show() { this.shown = true; },
    focus() { this.focused = true; },
  };
  const service = createUpdateService({
    app: { getVersion: () => '2.0.0-alpha.86' },
    autoUpdater: updater,
    configuration: resolveUpdateConfiguration({ isPackaged: true, env: {} }),
    Notification: FakeNotification,
    dialog: { showMessageBox: () => assert.fail('发现更新不应弹出阻塞式对话框') },
    getMainWindow: () => window,
    schedule: () => {},
  });

  service.setup();
  updater.emit('update-available', { version: '2.0.0-alpha.87' });
  updater.emit('update-available', { version: '2.0.0-alpha.87' });

  assert.equal(FakeNotification.instances.length, 1);
  assert.equal(FakeNotification.instances[0].shown, true);
  assert.match(FakeNotification.instances[0].options.body, /2\.0\.0-alpha\.87/);

  FakeNotification.instances[0].emit('click');
  assert.equal(window.restored, true);
  assert.equal(window.shown, true);
  assert.equal(window.focused, true);
  assert.deepEqual(sent.at(-1), ['app:shortcut', 'open-update-settings']);
});
