const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const SettingsNavigation = require('../src/renderer/scripts/settingsNavigation');

test('设置分类保持稳定顺序并规范化外部深链接', () => {
  assert.deepEqual(
    SettingsNavigation.ITEMS.map(item => item.id),
    [
      'settings-browsing',
      'settings-sidebar',
      'settings-appearance',
      'settings-panel-provider',
      'settings-developer-tools',
      'settings-projects',
      'settings-updates'
    ]
  );
  assert.equal(SettingsNavigation.normalizeSection('settings-panel-provider'), 'settings-panel-provider');
  assert.equal(SettingsNavigation.normalizeSection('missing-section'), 'settings-browsing');
  assert.equal(SettingsNavigation.normalizeSection(''), 'settings-browsing');
});

test('纵向设置导航支持方向键、Home 和 End', () => {
  assert.equal(SettingsNavigation.sectionFromKey('settings-browsing', 'ArrowDown'), 'settings-sidebar');
  assert.equal(SettingsNavigation.sectionFromKey('settings-browsing', 'ArrowUp'), 'settings-updates');
  assert.equal(SettingsNavigation.sectionFromKey('settings-updates', 'ArrowDown'), 'settings-browsing');
  assert.equal(SettingsNavigation.sectionFromKey('settings-panel-provider', 'Home'), 'settings-browsing');
  assert.equal(SettingsNavigation.sectionFromKey('settings-panel-provider', 'End'), 'settings-updates');
  assert.equal(SettingsNavigation.sectionFromKey('settings-panel-provider', 'Enter'), null);
});

test('设置页采用左侧分类导航与右侧单分类内容', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/scripts/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'src/renderer/styles/content.css'), 'utf8');

  assert.ok(html.indexOf('scripts/settingsNavigation.js') < html.indexOf('scripts/app.js'));
  assert.match(appSource, /class="app-settings-navigation"/);
  assert.match(appSource, /role="tablist"[^>]+aria-orientation="vertical"/);
  assert.match(appSource, /data-settings-section=/);
  assert.match(appSource, /role="tabpanel"/);
  assert.match(appSource, /panel\.hidden\s*=\s*!isActive/);
  assert.match(appSource, /sectionFromKey/);
  assert.match(css, /\.app-settings-layout\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.app-settings-content\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.app-settings-navigation-item\[aria-selected="true"\]/);
  assert.match(css, /\.app-settings-section\s*\{[^}]*max-width:\s*860px/s);
  assert.match(css, /data-settings-section="settings-panel-provider"[^}]*--settings-navigation-accent:/s);
  assert.match(css, /data-settings-section="settings-updates"[^}]*--settings-navigation-accent:/s);
  assert.doesNotMatch(appSource, /app-settings-header[\s\S]{0,500}>完成<\/button>/);
});

test('软件更新有设置页入口，状态栏更新按钮不会被上下文文字覆盖', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/scripts/app.js'), 'utf8');
  const updateSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/scripts/updateController.js'), 'utf8');

  assert.ok(html.indexOf('scripts/updateController.js') < html.indexOf('scripts/app.js'));
  assert.match(html, /id="status-context"/);
  assert.match(html, /id="btn-check-update"[^>]+data-update-action="primary"/);
  assert.match(updateSource, /id="settings-updates"/);
  assert.match(updateSource, /data-update-action="primary"/);
  assert.match(appSource, /getElementById\('status-context'\)/);
  assert.doesNotMatch(appSource, /getElementById\('status-right'\)[\s\S]{0,200}\.textContent\s*=/);
});

test('设置页标题区保持紧凑且不重复展示品牌', () => {
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/scripts/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'src/renderer/styles/content.css'), 'utf8');

  assert.match(appSource, /class="app-settings-header-copy"/);
  assert.doesNotMatch(appSource, /app-settings-kicker/);
  assert.match(appSource, /偏好只保存在本机，不写入项目配置。/);
  assert.match(css, /\.app-settings-page\s*\{[^}]*padding:\s*16px 0 14px/s);
  assert.match(css, /\.app-settings-header-copy\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.app-settings-header h1\s*\{[^}]*font-size:\s*20px/s);
});
