const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const ResourceView = require('../src/renderer/scripts/relationshipBoardResourceView');
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

test('资源目录统一投影受管资源、白板实体和白板文件', () => {
  const items = ResourceView.catalog({
    resources: [
      { key: 'project:p1', kind: 'project', refId: 'p1', name: '原始项目名', path: '/p1', secondary: 'active' },
      { key: 'repository:r1', kind: 'repository', refId: 'r1', name: 'Repo', path: '/r1', secondary: 'Git 仓库' }
    ],
    entities: [
      { id: 'entity_project', type: 'project', refId: 'p1', name: '项目别名' },
      { id: 'entity_endpoint', type: 'endpoint', name: '站点' },
      { id: 'entity_text', type: 'text', name: '说明' }
    ],
    placements: [{ entityId: 'entity_project' }, { entityId: 'entity_text' }],
    documents: [
      { id: 'doc1', name: '运行白板', path: '/boards/run.gfb', nodeCount: 4 },
      { id: 'doc2', name: '缺失白板', path: '/boards/missing.gfb', nodeCount: 0, missing: true }
    ],
    displayName: entity => `显示:${entity.name}`,
    displaySubtitle: entity => `摘要:${entity.type}`
  });

  assert.deepEqual(ResourceView.RESOURCE_CATEGORY_DEFINITIONS.map(category => category.id),
    ['whiteboard', 'project', 'repository', 'architecture', 'server', 'deployment', 'endpoint', 'other']);
  assert.equal(items.find(item => item.key === 'project:p1').name, '显示:项目别名');
  assert.equal(items.find(item => item.key === 'project:p1').placed, true);
  assert.equal(items.find(item => item.entityId === 'entity_endpoint').category, 'endpoint');
  assert.equal(items.find(item => item.entityId === 'entity_text').category, 'other');
  assert.equal(items.find(item => item.key === 'whiteboard:doc1').secondary, '4 个元素');
  assert.equal(items.find(item => item.key === 'whiteboard:doc2').secondary, '文件缺失 · 可移除记录');
  assert.deepEqual(ResourceView.sections(items).map(section => section.items.length), [2, 1, 1, 0, 0, 0, 1, 1]);
});

test('资源目录标记定位、添加、拖动、折叠并转义可变内容', () => {
  const items = [
    { key: 'project:p1', kind: 'project', category: 'project', name: '<项目&>', path: '/project', secondary: '项目', transient: true, placed: false },
    { key: 'entity:e1', kind: 'endpoint', category: 'endpoint', name: 'api.example.com', path: '', secondary: 'HTTPS', placed: true },
    { key: 'whiteboard:d1', id: 'd1', kind: 'whiteboard', category: 'whiteboard', name: '白板', path: '/board.gfb', secondary: '2 个元素' }
  ];
  const html = ResourceView.render({ items, collapsed: new Set(['project']), typeIcons: { project: 'P', endpoint: 'E' }, escapeHtml,
    panelMoveControls: key => `<button data-move="${escapeHtml(key)}">移动</button>` });

  assert.match(html, /data-resource-section="project"/);
  assert.match(html, /data-resource-section-toggle="project" aria-expanded="false"/);
  assert.match(html, /class="relationship-resource-section-items" hidden/);
  assert.match(html, /draggable="true"[^>]+data-resource-key="project:p1"/);
  assert.match(html, /data-add-resource="project:p1"/);
  assert.match(html, /&lt;项目&amp;&gt;/);
  assert.doesNotMatch(html, /<项目&>/);
  assert.match(html, /data-locate-resource="entity:e1"/);
  assert.match(html, /data-open-document="d1"/);
  assert.match(html, /data-trash-document="d1"/);
  assert.match(html, /data-move="resource:project"/);

  const filtered = ResourceView.render({ items, query: 'api.example', collapsed: new Set(['endpoint']), typeIcons: {}, escapeHtml, panelMoveControls: () => '' });
  assert.match(filtered, /api\.example\.com/);
  assert.doesNotMatch(filtered, /data-resource-section="project"/);
  assert.doesNotMatch(filtered, /relationship-resource-section-items" hidden/);
  assert.equal(ResourceView.render({ items, query: '不存在', escapeHtml, panelMoveControls: () => '' }),
    '<div class="relationship-resource-empty">没有匹配的资源</div>');
});

test('正式页面与全部白板夹具均先加载资源视图再加载控制器', () => {
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
    const viewIndex = html.indexOf('relationshipBoardResourceView.js');
    const controllerIndex = html.indexOf('relationshipBoardController.js');
    assert.ok(viewIndex >= 0, `${page} 应加载资源视图`);
    assert.ok(controllerIndex > viewIndex, `${page} 应在资源视图之后加载控制器`);
  }
});
