const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Registry = require('../src/renderer/scripts/appControllerRegistry');

test('应用控制器由单一注册器创建，并执行声明的绑定生命周期', () => {
  class Controller {
    constructor(options) { this.options = options; }
    bind() { this.bound = true; }
    mount() { this.mounted = true; }
  }
  for (const [, methodName] of Object.values(Registry.DELEGATE_MAP)) {
    if (!Controller.prototype[methodName]) Controller.prototype[methodName] = function delegateTarget() {};
  }
  const host = {};
  for (const namespace of Registry.CONTROLLER_NAMESPACES) host[namespace] = { Controller };
  host.RepositoryRootScanner = { Scanner: Controller };
  Object.assign(host, {
    gitFinder: { platform: 'darwin' }, EditActionRouter: {}, FileBrowser: {}, BatchRename: {},
    FileTransfers: {}, ContentQuery: {}, WorkspaceTabs: {}, DirectoryPerformance: {},
    VirtualDirectoryWindow: {}, ProgressiveDirectoryRender: {}
  });
  const app = {
    renderMarkdown() {}, escapeHtml() {}, formatFileSize() {}, formatItemDate() {}, activateFileItem() {},
    getQuickLookNavigationState() {}, selectQuickLookNavigationItem() {}, _showStatusMessage() {},
    createWorkspaceTab() {}, updateStatusBar() {}
  };
  const controllers = Registry.create({ app, state: { visibleItems: [] }, host, document: {}, terminal: {} });

  assert.deepEqual(Object.keys(controllers), Registry.CONTROLLER_KEYS);
  for (const key of Registry.BOUND_CONTROLLER_KEYS) assert.equal(controllers[key].bound, true, `${key} 应绑定事件`);
  assert.equal(controllers.workspaceTabOverflowController.mounted, true);
  assert.equal(controllers.repositoryDetailController.options.terminal != null, true);
});

test('兼容入口由注册器安装并逐项原样传递上下文、参数和返回值', () => {
  const calls = [];
  const app = {};
  const controllers = {};
  const entries = Object.entries(Registry.DELEGATE_MAP);
  assert.equal(entries.length, 74);
  for (const [publicName, [controllerKey, methodName]] of entries) {
    controllers[controllerKey] ||= {};
    controllers[controllerKey][methodName] = function delegateTarget(...args) {
      calls.push([publicName, this === controllers[controllerKey], ...args]);
      return publicName;
    };
  }
  Registry.installDelegates(app, controllers);

  for (const [publicName] of entries) {
    const marker = { publicName };
    assert.equal(app[publicName](marker, 42), publicName);
    assert.deepEqual(calls.pop(), [publicName, true, marker, 42]);
  }
  assert.equal(Object.keys(app).includes('navigateTo'), true);
  assert.equal(typeof app.navigateTo, 'function');
});

test('兼容入口清单可审查且不会覆盖手写参数适配方法', () => {
  assert.deepEqual(Registry.DELEGATE_MAP.navigateTo, ['directoryNavigationController', 'navigateTo']);
  assert.deepEqual(Registry.DELEGATE_MAP.updateDetailPanel, ['repositoryDetailController', 'render']);
  assert.deepEqual(Registry.DELEGATE_MAP.addTreeRoot, ['sidebarTreeController', 'addRoot']);
  assert.deepEqual(Registry.DELEGATE_MAP.pasteFileClipboard, ['fileOperationController', 'pasteFileClipboard']);
  assert.deepEqual(Registry.DELEGATE_MAP.handleEditAction, ['fileOperationController', 'handleEditAction']);
  for (const manualName of ['_renderTreeNode', 'closeFileOperationDialog']) {
    assert.equal(Registry.DELEGATE_MAP[manualName], undefined, `${manualName} 应保留手写适配`);
  }
  assert.throws(
    () => Registry.installDelegates({ navigateTo() {} }),
    /兼容入口已存在：navigateTo/
  );
  assert.throws(
    () => Registry.installDelegates(Object.create({ navigateTo() {} })),
    /兼容入口已存在：navigateTo/
  );
});

test('渲染入口在 App 之前加载注册器，App 不再逐个维护控制器初始化函数', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src/renderer/scripts/app.js'), 'utf8');

  assert.ok(html.indexOf('scripts/appControllerRegistry.js') < html.indexOf('scripts/app.js'));
  assert.match(source, /AppControllerRegistry\.create/);
  assert.doesNotMatch(source, /setupQuickLookController\(\)/);
  assert.doesNotMatch(source, /setupWorkspaceTabOverflowController\(\)/);
});
