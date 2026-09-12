const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WorkspaceTabs = require('../src/renderer/scripts/workspaceTabs');
const { Controller } = require('../src/renderer/scripts/directoryNavigationController');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const source = read('src/renderer/scripts/app.js');

test('象数面板与白板并列，使用不带本地权限的独立 iframe', () => {
  const html = read('src/renderer/index.html');
  assert.match(html, /data-view="relationships"[\s\S]*?data-view="panel"/);
  assert.match(html, /id="xiangshu-panel-frame"[^>]*sandbox="allow-scripts allow-same-origin allow-forms allow-popups"/);
  assert.doesNotMatch(html.match(/<iframe id="xiangshu-panel-frame"[^>]*>/)[0], /src=|allow-top-navigation|preload/);
  assert.match(source, /\['tree', 'dashboard', 'tasks', 'relationships', 'panel'\]\.includes\(view\)/);
  assert.match(source, /this\.openXiangshuPanel\(\);\s*this\.updateStatusBar\(\)/);
  assert.match(source, /rightText = 'panel\.xiangshu\.me · 网站独立视图'/);
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

test('首次进入才加载面板，重复渲染保留 iframe，显式刷新只绑定一次', () => {
  const body = source.split('  openXiangshuPanel() {')[1].split('\n  async renderContent()')[0].replace(/\n  },\s*$/, '');
  const listeners = {};
  let src = '', loads = 0, external = '';
  const frame = { getAttribute: () => src, set src(value) { src = value; loads++; }, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const status = { textContent: '' };
  const elements = { 'xiangshu-panel-frame': frame, 'xiangshu-panel-status': status };
  for (const id of ['xiangshu-panel-reload', 'xiangshu-panel-external']) elements[id] = { addEventListener: (name, fn) => { assert.equal(name, 'click'); assert.equal(listeners[id], undefined); listeners[id] = fn; } };
  const open = new Function('document', 'window', body).bind(null, { getElementById: id => elements[id] }, { gitFinder: { panel: { openExternal: url => { external = url; return Promise.resolve(); } } } });
  open(); open();
  assert.equal(loads, 1);
  assert.equal(src, 'https://panel.xiangshu.me/');
  listeners.load();
  assert.doesNotMatch(status.textContent, /同步成功/);
  listeners['xiangshu-panel-reload']();
  assert.equal(loads, 2);
  listeners['xiangshu-panel-external']();
  assert.equal(external, src);
  listeners.error();
  assert.match(status.textContent, /失败/);
});

test('面板弹出链接只允许网页协议且不创建带应用权限的窗口', () => {
  const main = read('main.js');
  const body = main.split('setWindowOpenHandler(({ url, referrer }) => {')[1].split('\n  });')[0];
  const opened = [];
  const handler = new Function('url', 'referrer', 'shell', body);
  const shell = { openExternal: url => { opened.push(url); return Promise.resolve(); } };
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:pass@example.com']) assert.deepEqual(handler(url, { url: 'https://panel.xiangshu.me/' }, shell), { action: 'deny' });
  handler('https://example.com/', { url: 'https://untrusted.example/' }, shell);
  assert.deepEqual(opened, []);
  assert.deepEqual(handler('https://example.com/', { url: 'https://panel.xiangshu.me/' }, shell), { action: 'deny' });
  assert.deepEqual(opened, ['https://example.com/']);
});
