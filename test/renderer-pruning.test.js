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

test('已迁移界面不保留零引用样式，替代原语仍在生产路径中', () => {
  const app = read('src/renderer/scripts/app.js');
  const content = read('src/renderer/styles/content.css');
  const detail = read('src/renderer/styles/detail.css');
  const sidebar = read('src/renderer/styles/sidebar.css');
  const main = read('src/renderer/styles/main.css');
  const transfer = read('src/renderer/scripts/fileTransferController.js');
  const repositoryDetail = read('src/renderer/scripts/repositoryDetailController.js');

  for (const selector of ['.file-action-danger', '.external-import-conflict',
    '.external-import-ready', '.developer-tools-modal']) {
    assert.doesNotMatch(content, new RegExp(selector.replace('.', '\\.')));
  }
  for (const selector of ['.detail-header-actions', '.detail-fav-btn',
    '.git-info-row', '.git-info-value', '.detail-tag-remove']) {
    assert.doesNotMatch(detail, new RegExp(selector.replace('.', '\\.')));
  }
  assert.doesNotMatch(sidebar, /\.sidebar-item \.folder-icon\b/);

  assert.match(content, /\.transfer-kind-badge\b/);
  assert.match(transfer, /class="transfer-kind-badge"/);
  assert.match(app, /class="app-settings-controls developer-tools-body"/);
  assert.match(main, /\.finder-menu \.finder-menu-danger/);
  assert.match(repositoryDetail, /class="git-remote-row"/);
  assert.match(repositoryDetail, /class="detail-tag toggle"/);
  assert.match(sidebar, /\.sidebar-kind-icon\b/);
});
