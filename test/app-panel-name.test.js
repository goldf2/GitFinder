const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WorkspaceTabs = require('../src/renderer/scripts/workspaceTabs');
const { Controller } = require('../src/renderer/scripts/directoryNavigationController');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('应用面板菜单和可访问标题统一，保留旧DOM及panel模式', () => {
  const html = read('src/renderer/index.html');
  const button = html.match(/<button[^>]*id="btn-xiangshu-panel"[\s\S]*?<\/button>/)?.[0];
  assert.ok(button); assert.match(button, /data-view="panel"/);
  assert.match(button, /<span>应用面板<\/span>/);
  assert.doesNotMatch(button, /象数面板|panel\.xiangshu\.me/);
  assert.match(html, /id="xiangshu-panel-view" aria-label="应用面板"/);
});

test('面包屑在旧panel模式下直接显示新名称', () => {
  const container = { textContent: '' };
  const nav = Object.create(Controller.prototype);
  nav.state = { currentMode: 'panel' };
  nav.document = { getElementById: id => id === 'current-path' ? container : null };
  nav.updateBreadcrumbs();
  assert.equal(container.textContent, '应用面板');
});

test('模式选择、标签和状态栏无旧功能名残留', () => {
  const app = read('src/renderer/scripts/app.js');
  assert.match(app, /panel: '应用面板'/);
  assert.match(app, /tab\.mode === 'panel' \? '应用面板'/);
  assert.match(app, /leftText = '应用面板'/);
  assert.doesNotMatch(app, /tabHelp = tab\.mode === 'panel' \? 'panel\.xiangshu\.me'/);
  for (const file of ['src/renderer/index.html', 'src/renderer/scripts/app.js', 'src/renderer/scripts/nativePanelController.js', 'src/renderer/scripts/directoryNavigationController.js']) {
    assert.doesNotMatch(read(file), /象数面板/, file);
  }
});

test('原生面板标题和说明描述功能而非来源，偏好键不变', () => {
  const source = read('src/renderer/scripts/nativePanelController.js');
  assert.match(source, /element\('strong', '', '应用面板'\)/);
  assert.match(source, /查看已部署应用与服务，检查状态并快速访问。/);
  assert.match(source, /gitfinder\.native-panel\.v1/);
  assert.match(source, /来源：panel\.xiangshu\.me/);
});

test('旧标签内容序列化后仍维持panel和原目录，没有会话迁移', () => {
  const input = { tabs: [{ id: 'old-panel', mode: 'panel', title: '象数面板', path: '/workspace' }], activeTabId: 'old-panel' };
  const before = JSON.stringify(input);
  const normalized = WorkspaceTabs.normalizeSession(input);
  const restored = WorkspaceTabs.normalizeSession(JSON.parse(JSON.stringify(normalized)));
  assert.equal(restored.tabs[0].mode, 'panel');
  assert.equal(restored.tabs[0].path, '/workspace');
  assert.equal(restored.activeTabId, 'old-panel');
  assert.equal(JSON.stringify(input), before);
});

test('分离旧panel标签的系统窗口标题使用新名称', () => {
  const source = read('main.js');
  assert.match(source, /title: detachedTab\?\.mode === 'panel' \? '应用面板 — GitFinder 2 Alpha'/);
  const expression = source.match(/title: (detachedTab\?\.mode[\s\S]*?'GitFinder 2 Alpha'),/)?.[1];
  assert.ok(expression);
  const vm = require('node:vm');
  assert.equal(vm.runInNewContext(expression, { detachedTab: { mode: 'panel', title: '象数面板' } }), '应用面板 — GitFinder 2 Alpha');
  assert.equal(vm.runInNewContext(expression, { detachedTab: { mode: 'tree', title: '原文件夹' } }), '原文件夹 — GitFinder 2 Alpha');
  assert.equal(vm.runInNewContext(expression, { detachedTab: null }), 'GitFinder 2 Alpha');
});

test('来源域名、协议和厂商出处没有因功能更名而被替换', () => {
  assert.match(read('src/main/services/panelProviderService.js'), /providerKind !== 'xiangshu-panel'/);
  assert.match(read('src/shared/nativePanelModel.js'), /panel\\\.xiangshu\\\.me/);
  assert.match(read('src/renderer/scripts/vendor/README.md'), /象数|xiangshu/i);
});
