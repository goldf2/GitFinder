const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const ToolbarView = require('../src/renderer/scripts/relationshipBoardToolbarView');
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const displayView = Object.freeze({
  mode: 'compact',
  cardScale: 1.1,
  textScale: 1,
  groupTitleFontSize: 24,
  edgeWidth: 3.2,
  cardWidth: 320,
  cardHeight: 160,
  horizontalSpacing: 48,
  verticalSpacing: 36,
  statusTintOpacity: 0.08,
  filterContextOpacity: 0.45,
  filterMutedOpacity: 0.12,
  filterMatchHaloOpacity: 0.3,
  cardAppearance: 'flat',
  projectGroupShape: 'polygon',
  cardTitleSource: 'note',
  deploymentTitleSource: 'note',
  endpointTitleSource: 'website',
  cardIcons: { server: 'server', deployment: 'database', endpoint: 'none', repository: 'repository', project: 'project' },
  showGrid: true,
  showEdgeLabels: false,
  showRuntimeStatus: true,
  selectedEntityTypes: ['server', 'endpoint'],
  selectedRuntimeStates: ['warning'],
  selectedTaskFilters: ['open'],
  unmatchedDisplay: 'hide'
});

test('显示弹层由纯视图模块按当前白板状态生成', () => {
  const cardIconOptions = [['none', '不显示'], ['server', '主机'], ['deployment', '部署'], ['endpoint', '访问 / 地球'], ['repository', 'Git 分支'], ['project', '项目 / 文件夹'], ['database', '数据库'], ['service', '服务 / 方块']];
  const html = ToolbarView.displayPopover({
    view: displayView,
    boardView: { projectGroupIncludesEndpoints: true },
    serverTree: true,
    icon: '<svg data-icon="display"></svg>',
    cardIconOptions,
    escapeHtml
  });

  assert.match(html, /data-icon="display"/);
  assert.match(html, /name="mode"[\s\S]*?<option value="compact" selected>/);
  assert.match(html, /name="cardScale"[^>]+value="1\.1"/);
  assert.match(html, /data-display-card-scale>110%/);
  assert.match(html, /name="groupTitleFontSize"[^>]+value="24"/);
  assert.match(html, /name="edgeWidth"[^>]+value="3\.2"/);
  assert.match(html, /data-display-edge-width>3\.2 px/);
  assert.match(html, /name="projectGroupShape"[\s\S]*?<option value="polygon" selected>/);
  assert.match(html, /role="dialog"[^>]+aria-modal="true"/);
  assert.match(html, /id="relationship-display-title"/);
  assert.match(html, /class="relationship-display-section"[\s\S]*?卡片与文字/);
  assert.match(html, /class="relationship-display-section"[\s\S]*?布局与间距/);
  assert.match(html, /class="relationship-display-section"[\s\S]*?命名来源/);
  assert.match(html, /name="deploymentTitleSource"[\s\S]*?<option value="note" selected>备注描述<\/option>/);
  assert.match(html, /name="endpointTitleSource"[\s\S]*?<option value="website" selected>网站标题<\/option>/);
  assert.match(html, /图标与识别/);
  assert.match(html, /name="cardIcon-deployment"[\s\S]*?<option value="database" selected>数据库<\/option>/);
  assert.match(html, /name="cardIcon-endpoint"[\s\S]*?<option value="none" selected>不显示<\/option>/);
  for (const type of ['server', 'deployment', 'endpoint', 'repository', 'project']) assert.match(html, new RegExp(`name="cardIcon-${type}"`));
  assert.match(html, /data-relationship-action="close-display-settings"/);
  assert.match(html, /name="projectGroupIncludesEndpoints"[^>]+checked/);
  assert.match(html, /name="showGrid"[^>]+checked/);
  assert.doesNotMatch(html, /name="showEdgeLabels"[^>]+checked/);

  const nonTreeHtml = ToolbarView.displayPopover({
    view: displayView,
    boardView: { projectGroupIncludesEndpoints: true },
    serverTree: false,
    icon: '',
    cardIconOptions,
    escapeHtml
  });
  assert.doesNotMatch(nonTreeHtml, /name="projectGroupIncludesEndpoints"/);
});

test('筛选弹层保留多选状态并转义资源标签', () => {
  const html = ToolbarView.filterPopover({
    view: displayView,
    boardView: {
      query: '<script>alert(1)</script>',
      verification: 'verified',
      annotation: 'has-note',
      label: 'urgent<&',
      mode: 'compact',
      projection: 'deployment-summary'
    },
    entityTypes: ['server', 'deployment', 'endpoint'],
    typeLabels: { server: '主机', deployment: '部署', endpoint: '访问点' },
    verificationFilters: ['all', 'verified'],
    verificationLabels: { all: '全部状态', verified: '已验证' },
    environmentOptions: '<option value="all">全部环境</option>',
    labels: ['urgent<&'],
    icon: '<svg data-icon="filter"></svg>',
    escapeHtml
  });

  assert.match(html, /name="entityTypes" type="checkbox" value="server" checked/);
  assert.match(html, /name="entityTypes" type="checkbox" value="endpoint" checked/);
  assert.match(html, /name="runtimeStates" type="checkbox" value="warning" checked/);
  assert.match(html, /name="taskFilters" type="checkbox" value="open" checked/);
  assert.match(html, /value="&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<option value="urgent&lt;&amp;" selected>urgent&lt;&amp;<\/option>/);
  assert.match(html, /name="projection"[\s\S]*?<option value="deployment-summary" selected>/);
});

test('添加菜单完整保留节点、白板包和 JSON 操作', () => {
  const html = ToolbarView.addMenu('<svg data-icon="add"></svg>');
  for (const action of ['add-text', 'add-image', 'add-files', 'export-package', 'import-package', 'export-json', 'import-json']) {
    assert.match(html, new RegExp(`data-relationship-action="${action}"`));
  }
  for (const nodeType of ['server', 'deployment', 'endpoint', 'group']) {
    assert.match(html, new RegExp(`data-add-node-type="${nodeType}"`));
  }
});

test('正式页面与全部关系白板夹具均先加载工具栏视图再加载控制器', () => {
  const pages = [
    'src/renderer/index.html',
    'scripts/visual-fixtures/endpoint-health.html',
    'scripts/visual-fixtures/relationship-groups.html',
    'scripts/visual-fixtures/repository-association.html',
    'scripts/visual-fixtures/sidebar-navigation.html',
    'scripts/visual-fixtures/whiteboard-documents.html'
  ];
  for (const page of pages) {
    const html = read(page);
    const presentationIndex = html.indexOf('htmlPresentation.js');
    const toolbarIndex = html.indexOf('relationshipBoardToolbarView.js');
    const controllerIndex = html.indexOf('relationshipBoardController.js');
    assert.ok(presentationIndex >= 0, `${page} 应加载安全呈现模块`);
    assert.ok(toolbarIndex >= 0, `${page} 应加载工具栏视图`);
    assert.ok(controllerIndex > Math.max(presentationIndex, toolbarIndex), `${page} 应在安全呈现和工具栏视图之后加载控制器`);
  }
});
