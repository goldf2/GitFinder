const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/scripts/app.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/scripts/projectShortcutsController.js'), 'utf8');
const navigationSource = fs.readFileSync(path.join(projectRoot, 'src/renderer/scripts/directoryNavigationController.js'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src/renderer/styles/sidebar.css'), 'utf8');

test('左侧项目区是快捷导航而不是项目分类或一级视图', () => {
  assert.match(html, /id="project-shortcuts-sidebar-section"[^>]+data-section-id="projects"[^>]+hidden/);
  assert.match(html, /<span class="sidebar-title-text">项目<\/span>/);
  assert.doesNotMatch(html, /<span class="sidebar-title-text">项目分类<\/span>/);
  assert.doesNotMatch(html, /class="view-btn[^>]+data-view="projects"/);
  assert.match(controllerSource, /data-project-shortcut-all[\s\S]*?applyContentPreset\('all-projects'\)/);
  assert.match(html, /id="sidebar-navigation"[^>]*role="tablist"/);
  assert.match(html, /data-sidebar-navigation="projects"/);
  assert.match(html, /data-sidebar-navigation="repositories"/);
  assert.match(html, /data-sidebar-navigation="directories"/);
  assert.ok(html.indexOf('data-sidebar-navigation="projects"') < html.indexOf('data-sidebar-navigation="repositories"'));
  assert.ok(html.indexOf('data-sidebar-navigation="repositories"') < html.indexOf('data-sidebar-navigation="directories"'));
  assert.match(html, /id="repository-shortcuts-sidebar-section"[^>]+data-section-id="repositories"[^>]+hidden/);
  assert.match(controllerSource, /config\.get\('sidebarNavigationMode'\)/);
  assert.match(controllerSource, /data-repository-shortcut-all[\s\S]*?applyContentPreset\('all-repositories'\)/);
  assert.match(controllerSource, /data-repository-shortcut-path/);
  assert.match(appSource, /id === 'projects' \|\| id === 'repositories'/);
  assert.match(appSource, /id !== 'board-components' && AppState\.sidebarCollapsedSections\.has\(id\)/);
  assert.match(css, /\.sidebar-section\[hidden\]\s*\{\s*display: none/);
});

test('项目快捷入口显示固定与最近项目，进入目录仍使用统一目录导航', () => {
  assert.ok(html.indexOf('../shared/projectShortcuts.js') < html.indexOf('scripts/app.js'));
  assert.ok(html.indexOf('scripts/projectShortcutsController.js') < html.indexOf('scripts/app.js'));
  assert.match(controllerSource, /project-shortcut-heading">已固定/);
  assert.match(controllerSource, /project-shortcut-heading">最近/);
  assert.match(controllerSource, /async open\(projectId\)[\s\S]*?this\.app\.openLocalProject\(project\.path\)/);
  assert.match(navigationSource, /recordProjectVisit\?\.\(path\)/);
  assert.match(css, /\.project-shortcut-row/);
  assert.match(css, /\.project-shortcut-pin/);
  assert.match(controllerSource, /data-project-tree-toggle/);
  assert.match(controllerSource, /project\.repositories/);
  assert.match(controllerSource, /data-project-repository-path/);
  assert.match(css, /\.project-tree-children/);
});

test('项目快捷偏好通过受限配置键保存且侧栏顺序位于目录之前', () => {
  assert.match(controllerSource, /config\.get\('projectShortcuts'\)/);
  assert.match(controllerSource, /config\.set\('projectShortcuts'/);
  assert.match(appSource, /id === 'projects'[\s\S]*?locationsIndex[\s\S]*?resolvedOrder\.splice\(insertAt, 0, id\)/);
  assert.doesNotMatch(appSource, /favoritesIndex/);
  assert.match(controllerSource, /项目位置不可用/);
});

test('侧边栏项目区可在应用设置中隐藏、限制最近数量并清除记录', () => {
  assert.match(appSource, /id="settings-show-project-shortcuts"/);
  assert.match(appSource, /id="settings-show-recent-projects"/);
  assert.match(appSource, /id="settings-recent-project-limit"/);
  assert.match(appSource, /data-app-action="clear-recent-projects"/);
  assert.match(controllerSource, /preferences\.visible/);
  assert.match(controllerSource, /display\.recent\.slice\(0, preferences\.recentLimit\)/);
});
