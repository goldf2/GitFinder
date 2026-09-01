const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('旧项目卡片和已撤下侧栏控件不再留在正式渲染器', () => {
  const app = read('src/renderer/scripts/app.js');
  const content = read('src/renderer/styles/content.css');
  const sidebar = read('src/renderer/styles/sidebar.css');
  const main = read('src/renderer/styles/main.css');

  for (const name of ['getProjectCardShell', 'bindProjectCardEvents', 'loadProjectCards',
    'getProjectCardUnavailableContent', 'getProjectCardContent', 'renderProjectGantt',
    'initializeProjectCardControlFiles']) assert.doesNotMatch(app, new RegExp(`\\b${name}\\b`));
  for (const selector of ['.project-card', '.project-gantt', '.project-goal-box', '.project-stat-row',
    '.list-repo-path', '.status-count', '.directory-tree', '.tree-item']) assert.doesNotMatch(content, new RegExp(selector.replace('.', '\\.')));
  for (const selector of ['.sidebar-group-header', '.sidebar-tree-refresh',
    '.sidebar-tree-btn', '.tree-empty-btn', '.tree-volume-icon', '.tree-git-status', '.favorites-section']) {
    assert.doesNotMatch(sidebar, new RegExp(selector.replace('.', '\\.')));
  }
  assert.doesNotMatch(main, /\.status-version\b/);

  assert.match(content, /\.local-project-card\b/);
  assert.match(content, /\.project-dashboard\b/);
  assert.match(sidebar, /\.tree-node\b/);
  assert.match(main, /\.app-version-badge\b/);
  assert.match(app, /\bbuildProjectControlModel\b/);
  assert.match(app, /\bisMissingProjectPathError\b/);
});
