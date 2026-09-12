const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WorkspaceTabs = require('../src/renderer/scripts/workspaceTabs');
const { Controller } = require('../src/renderer/scripts/directoryNavigationController');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('src/renderer/scripts/app.js');

test('象数面板与白板并列，使用打包本地代码而非 iframe', () => {
  const html = read('src/renderer/index.html');
  assert.match(html, /data-view="relationships"[\s\S]*?data-view="panel"/);
  assert.doesNotMatch(html, /xiangshu-panel-frame/);
  assert.match(html, /nativePanelModel.js/);
  assert.match(html, /nativePanelController.js/);
  assert.match(source, /\['tree', 'dashboard', 'tasks', 'relationships', 'panel'\]\.includes\(view\)/);
  assert.match(source, /this\.openXiangshuPanel\(\);\s*this\.updateStatusBar\(\)/);
  assert.match(source, /本地面板 · 部署 \/ 本机 \/ 远端独立状态/);
});

test('面板标签保存、重开和恢复关闭标签后不退回文件浏览', () => {
  const session = WorkspaceTabs.normalizeSession({ tabs: [{ id: 'panel-tab', mode: 'panel', path: '/workspace' }], activeTabId: 'panel-tab' });
  const restored = WorkspaceTabs.normalizeSession(JSON.parse(JSON.stringify(session)));
  assert.equal(restored.tabs[0].mode, 'panel');
  assert.equal(restored.activeTabId, 'panel-tab');
  const nav = Object.create(Controller.prototype);
  nav.state = { currentMode: 'panel' };
  assert.equal(nav._navigationBlocked(), true);
});

test('controller is reused across renders and stopped on view exit', () => {
  assert.match(source, /if \(!this.nativePanelController\) this.nativePanelController = new window.NativePanelController/);
  assert.match(source, /AppState.currentMode !== 'panel'\) this.nativePanelController\?\.close\(\)/);
  assert.match(read('main.js'), /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
});

test('native panel surfaces and lights use the shared theme instead of website colors', () => {
  const css = read('src/renderer/styles/content.css').split('#xiangshu-panel-view:not([hidden])')[1];
  assert.match(css, /background: var\(--bg-secondary\)/);
  assert.match(css, /box-shadow: var\(--ui-shadow-floating\)/);
  for (const token of ['status-clean', 'status-dirty', 'status-ahead', 'status-none']) assert.ok(css.includes(`var(--${token})`));
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
});

test('thumbnails render in both layouts and update when remote observations arrive', () => {
  const controller = read('src/renderer/scripts/nativePanelController.js');
  assert.match(controller, /\['网页缩略图'\]/);
  assert.match(controller, /item\.append\(preview, name/);
  assert.match(controller, /this.remoteLoading = false; this.updateLamps\(\); this.updateThumbnails\(\)/);
  assert.match(controller, /M.thumbnailUrl\(check\?\.screenshotUrl\)/);
  assert.match(controller, /缩略图暂不可用/);
  assert.match(controller, /image.loading = 'lazy'/);
  assert.match(read('src/renderer/index.html'), /img-src 'self' data: https:\/\/panel.xiangshu.me\/api\/thumbnails\//);
});
