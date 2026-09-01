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

test('渲染入口在 App 之前加载注册器，App 不再逐个维护控制器初始化函数', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src/renderer/scripts/app.js'), 'utf8');

  assert.ok(html.indexOf('scripts/appControllerRegistry.js') < html.indexOf('scripts/app.js'));
  assert.match(source, /AppControllerRegistry\.create/);
  assert.doesNotMatch(source, /setupQuickLookController\(\)/);
  assert.doesNotMatch(source, /setupWorkspaceTabOverflowController\(\)/);
});
