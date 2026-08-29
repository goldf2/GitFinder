const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MAX_TAB_SNAPSHOT_BYTES,
  createDetachedTabContext
} = require('../src/main/services/workspaceWindowService');

const projectRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('独立窗口上下文只保留一个规范化标签页且不继承关闭历史', () => {
  const context = createDetachedTabContext({
    id: 'tab-source',
    path: '/Volumes/project/demo',
    mode: 'relationships',
    history: ['/Volumes/project', '/Volumes/project/demo'],
    historyIndex: 1,
    searchQuery: 'deploy',
    unknownSecret: 'drop-me'
  }, { windowIdFactory: () => 'window-test' });

  assert.equal(context.kind, 'detached-tab');
  assert.equal(context.windowId, 'window-test');
  assert.equal(context.workspaceSession.tabs.length, 1);
  assert.equal(context.workspaceSession.activeTabId, 'tab-source');
  assert.equal(context.workspaceSession.tabs[0].mode, 'relationships');
  assert.equal(context.workspaceSession.tabs[0].path, '/Volumes/project/demo');
  assert.equal(context.workspaceSession.closedTabs.length, 0);
  assert.equal(Object.hasOwn(context.workspaceSession.tabs[0], 'unknownSecret'), false);
});

test('独立窗口拒绝损坏或过大的标签页快照', () => {
  assert.throws(() => createDetachedTabContext(null), /标签页快照无效/);
  assert.throws(() => createDetachedTabContext({
    path: '/workspace',
    searchQuery: 'x'.repeat(MAX_TAB_SNAPSHOT_BYTES)
  }), /超过安全限制/);
});

test('标签页新窗口通过受信 IPC、当前焦点窗口和右键菜单接入', () => {
  const mainSource = read('main.js');
  const preloadSource = read('preload.js');
  const appSource = read('src/renderer/scripts/app.js');
  const html = read('src/renderer/index.html');

  assert.match(mainSource, /registerTrustedHandler\('app:get-window-context'/);
  assert.match(mainSource, /registerTrustedHandler\('app:open-tab-window'/);
  assert.match(mainSource, /createDetachedTabContext\(rawTab\)/);
  assert.match(mainSource, /BrowserWindow\.getFocusedWindow\(\)/);
  assert.match(preloadSource, /getWindowContext:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('app:get-window-context'\)/);
  assert.match(preloadSource, /openTabWindow:\s*\(tab\)\s*=>\s*ipcRenderer\.invoke\('app:open-tab-window', tab\)/);
  assert.match(html, /id="workspace-tab-context-menu"[^>]+role="menu"[^>]+hidden/);
  assert.match(appSource, /openWorkspaceTabInNewWindow\(tabId\)/);
  assert.match(appSource, /AppState\.windowContext\?\.kind === 'detached-tab'/);
});
