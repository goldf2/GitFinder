const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const html = read('src/renderer/index.html');
const appSource = read('src/renderer/scripts/app.js');
const controllerSource = read('src/renderer/scripts/relationshipBoardController.js');
const selectionDetailSource = read('src/renderer/scripts/fileSelectionDetailController.js');
const relationshipCss = read('src/renderer/styles/relationships.css');
const contentCss = read('src/renderer/styles/content.css');
const serviceSource = read('src/main/services/relationshipBoardService.js');
const importServiceSource = read('src/main/services/relationshipBoardImportService.js');
const relationshipIpcSource = read('src/main/ipc/relationshipBoards.js');
const userDataVerifierSource = read('scripts/verify-relationship-user-data.js');
const preloadSource = read('preload.js');
const mainSource = read('main.js');

globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const {
  Controller,
  RESOURCE_CATEGORY_DEFINITIONS,
  normalizeDynamicLayoutStore,
  edgePanVelocity,
  resolveMagneticSnap,
  NODE_WIDTH,
  NODE_HEIGHT,
  COMPACT_NODE_WIDTH,
  COMPACT_NODE_HEIGHT
} = require('../src/renderer/scripts/relationshipBoardController');

test('访问点区分正常、认证、HTTP、网络、未检测和过期，不使用部署时间', () => {
  const controller = new Controller({ bridge: {}, now: () => new Date('2026-08-31T02:01:00Z') });
  const entity = { id: 'endpoint1', type: 'endpoint', details: {}, runtime: { dynamicKind: 'panel-endpoint', status: 'reachable', url: 'https://example.com', observedAt: '2026-08-31T02:00:00Z', httpStatus: 200, latencyMs: 42 } };
  assert.equal(controller._entityRuntimeStatus(entity).label, '可访问');
  assert.equal(controller._entityRuntimeTone(entity), 'normal');
  assert.match(controller._cardSummary(entity), /HTTPS · HTTP 200 · 42 ms/);
  assert.match(controller._cardUpdatedLabel(entity), /检测/);
  assert.match(controller._runtimeInspectorRows(entity), /HTTP 响应|最后检测/);
  for (const [status, label] of [['restricted', '访问受限'], ['http_error', 'HTTP 异常'], ['timeout', '检测超时'], ['dns_error', '解析失败'], ['tls_error', '证书异常'], ['unreachable', '连接失败'], ['redirect_error', '重定向异常']]) {
    entity.runtime.status = status;
    assert.equal(controller._entityRuntimeStatus(entity).state, 'fault');
    assert.equal(controller._entityRuntimeStatus(entity).label, label);
    assert.equal(controller._entityRuntimeTone(entity), 'warning');
  }
  entity.runtime.status = 'blocked';
  assert.equal(controller._entityRuntimeStatus(entity).label, '未检测');
  entity.runtime.checking = true;
  assert.equal(controller._entityRuntimeStatus(entity).label, '检测中');
  entity.runtime.checking = false;
  entity.runtime.status = 'reachable';
  entity.runtime.observedAt = '2026-08-31T01:00:00Z';
  assert.equal(controller._entityRuntimeStatus(entity).label, '结果已过期');
  entity.runtime.checkMessage = '<script>not html</script>';
  assert.match(controller._endpointCheckHtml(entity), /&lt;script&gt;/);
  assert.match(controller._endpointCheckHtml(entity), /data-endpoint-check="endpoint1"/);
});

test('后台检测只更新运行时，不改变布局或待办，重复快照不重绘', () => {
  const controller = new Controller({ bridge: {} });
  const entity = { id: 'endpoint1', runtime: { dynamicKind: 'panel-endpoint', providerId: 'one', url: 'https://example.com' } };
  controller.panelProjection = { entities: [entity], placements: [{ entityId: 'endpoint1', x: 380, y: 42, note: 'keep me' }] };
  const placements = structuredClone(controller.panelProjection.placements);
  let rendered = 0;
  controller._renderGraph = () => rendered++;
  controller._updateFilterSummary = controller._updateSummary = () => {};
  const checks = [{ providerId: 'one', url: 'https://example.com', status: 'reachable', httpStatus: 200, latencyMs: 42, checkedAt: '2026-08-31T02:00:00Z' }];
  controller._applyEndpointChecks(checks);
  assert.equal(entity.runtime.httpStatus, 200);
  assert.deepEqual(controller.panelProjection.placements, placements);
  controller._applyEndpointChecks(checks);
  assert.equal(rendered, 1);
  controller._applyEndpointChecks([]);
  assert.equal(entity.runtime.status, 'unknown');
  assert.equal(entity.runtime.observedAt, null);
});

test('后台检测不打断拖动，关闭白板后的旧响应被丢弃', async () => {
  let finish;
  const controller = new Controller({ bridge: { panel: {
    checkEndpoints: () => new Promise(resolve => { finish = resolve; }), getEndpointChecks: async () => ({ checks: [], pending: 0 })
  } } });
  controller.root = { isConnected: true };
  controller._updateEndpointCheckStatus = () => {};
  let applied = 0;
  controller._applyEndpointChecks = () => applied++;
  controller.pointerAction = { type: 'drag' };
  await controller._refreshEndpointChecks();
  assert.equal(applied, 0);
  assert.ok(controller.endpointCheckTimer);
  clearTimeout(controller.endpointCheckTimer);
  controller.pointerAction = null;
  const pending = controller._refreshEndpointChecks({ force: true });
  controller.openRequestId++;
  finish({ checks: [], pending: 0 });
  await pending;
  assert.equal(applied, 0);
  await controller._refreshEndpointChecks();
  assert.equal(applied, 1);
});

test('边缘平移仅在画布内边缘触发，靠边加速并支持四边、角落和减少动态效果', () => {
  const rect = { left: 100, top: 60, width: 800, height: 600 };
  assert.deepEqual(edgePanVelocity({ x: 500, y: 300 }, rect), { x: 0, y: 0 });
  assert.deepEqual(edgePanVelocity({ x: 901, y: 300 }, rect), { x: 0, y: 0 });
  assert.ok(edgePanVelocity({ x: 895, y: 300 }, rect).x > edgePanVelocity({ x: 865, y: 300 }, rect).x);
  assert.ok(edgePanVelocity({ x: 105, y: 300 }, rect).x < 0);
  assert.ok(edgePanVelocity({ x: 500, y: 65 }, rect).y < 0);
  const corner = edgePanVelocity({ x: 895, y: 655 }, rect);
  assert.ok(corner.x > 0 && corner.y > 0);
  assert.ok(edgePanVelocity({ x: 895, y: 655 }, rect, true).x < corner.x);
});

test('持续边缘平移保持缩放下抓取点与群组相对位置，中央和松手停止、保存并支持撤销', t => {
  const { controller } = nestedGroupFixture();
  let queued;
  const previousRAF = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = callback => { queued = callback; return 1; };
  globalThis.cancelAnimationFrame = () => { queued = null; };
  t.after(() => { globalThis.requestAnimationFrame = previousRAF; globalThis.cancelAnimationFrame = previousCancel; });
  const board = controller.store.boards[0];
  board.viewport = { x: 0, y: 0, zoom: 0.5 };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  controller.root = { isConnected: true, querySelector: selector => selector === '.relationship-canvas' ? canvas : null, querySelectorAll: () => [], classList: { remove() {} } };
  for (const name of ['_applyViewport', '_updateGroupFrames', '_updateEdges', '_renderSnapGuides', '_showGroupDropTarget', '_refreshMinimapNodes', '_updateMinimap', '_positionSelectionToolbar', '_clearSnapGuides', '_applyGroupDrop']) controller[name] = () => {};
  controller._stationarySnapBounds = () => [];
  controller._groupDropTarget = () => '';
  let saves = 0;
  controller._persistSoon = () => saves++;
  const moving = board.placements.slice(0, 3);
  const origins = new Map(moving.map(item => [item.entityId, { x: item.x, y: item.y }]));
  const event = { pointerId: 7, clientX: 795, clientY: 300, altKey: true };
  controller.pointerAction = { type: 'node', pointerId: 7, entityId: moving[0].entityId,
    entityIds: moving.map(item => item.entityId), persistentIds: moving.map(item => item.entityId), dynamicIds: [],
    origins, pointX: 1590, pointY: 600, moved: true, before: controller._historySnapshot() };
  controller._trackEdgePan(event);
  assert.equal(typeof queued, 'function');
  for (let frame = 1; frame < 6; frame++) queued(frame * 16);
  assert.ok(board.viewport.x < -20);
  assert.equal(board.viewport.zoom, 0.5);
  for (const item of moving) assert.ok(Math.abs(item.x * 0.5 + board.viewport.x - origins.get(item.entityId).x * 0.5) < 0.3, '屏幕抓取点不能漂移');
  assert.equal(moving[1].x - moving[0].x, 40);
  controller._trackEdgePan({ ...event, clientX: 400 });
  assert.equal(queued, null);
  controller._trackEdgePan(event);
  controller._handlePointerUp(event);
  assert.equal(controller.edgePanFrame, null);
  assert.equal(controller.pointerAction, null);
  assert.ok(saves > 0);
  assert.equal(controller.undoStack.length, 1);
  controller.undo();
  assert.equal(controller.store.boards[0].viewport.x, 0);
  assert.equal(controller.store.boards[0].placements[0].x, 0);
});

test('部署检查器提供自动匹配和候选入口，不暴露 repositoryId 技术提示', () => {
  const controller = new Controller({ bridge: {} });
  const fact = { id: 'entity_deployment', runtime: { repositoryAssociation: { mode: 'ambiguous', candidateIds: ['repo_a', 'repo_b'] } } };
  const html = controller._repositoryAssociationHtml(fact);
  assert.match(html, /确认候选仓库/);
  assert.match(html, /匹配此部署/);
  assert.doesNotMatch(html, /选择 repositoryId/);
  fact.runtime.repositoryAssociation = { mode: 'project' };
  assert.doesNotMatch(controller._repositoryAssociationHtml(fact), /data-panel-association-action/);
});

test('解除仓库关联通过本机 IPC 保存，不修改白板事实且失败会提示', async () => {
  const notifications = [];
  let fail = false;
  const calls = [];
  const controller = new Controller({ bridge: { panel: { setRepositoryAssociation: async value => {
    calls.push(value);
    if (fail) throw new Error('保存失败');
    return [value];
  } } }, notify: message => notifications.push(message) });
  const entity = { id: 'entity_deployment', type: 'deployment', runtime: { providerId: 'coolify_1', resourceUuid: 'app_1', repositoryAssociation: { mode: 'automatic' } } };
  controller._allEntitiesById = () => new Map([[entity.id, entity]]);
  controller._setPanelTopology = () => {};
  controller._renderResources = controller._renderGraph = controller._updateSummary = controller._renderInspector = () => {};
  await controller._changeRepositoryAssociation(entity.id, 'disabled');
  assert.deepEqual(calls[0], { providerId: 'coolify_1', resourceUuid: 'app_1', mode: 'disabled', repositoryIds: [] });
  assert.equal(controller.repositoryAssociations[0].mode, 'disabled');
  assert.equal(controller.store, null);
  fail = true;
  await controller._changeRepositoryAssociation(entity.id, 'automatic');
  assert.equal(controller.repositoryAssociations[0].mode, 'disabled');
  assert.match(notifications.at(-1), /仓库关联失败/);
  assert.equal(controller.repositoryAssociationSaving, false);
});

test('资源库直接显示分类搜索，不再显示范围切换按钮或外层标题', () => {
  assert.deepEqual(
    RESOURCE_CATEGORY_DEFINITIONS.map(category => category.id),
    ['whiteboard', 'project', 'repository', 'server', 'deployment', 'endpoint', 'other']
  );
  assert.doesNotMatch(controllerSource, /data-resource-scope=/);
  assert.match(controllerSource, /data-resource-section/);
  assert.match(controllerSource, /aria-label="白板资源库"/);
  assert.doesNotMatch(html, /<span class="sidebar-title-text">白板组件<\/span>/);
  assert.match(controllerSource, /getTreeRoots/);
  assert.doesNotMatch(relationshipCss, /\.relationship-resource-scope/);
  assert.match(relationshipCss, /\.relationship-resource-section-trigger\s*\{/);
});

test('连续关联、取消选择和失败后卡片按钮都恢复可点击', async () => {
  let fail = false, choose = ['repo_one'];
  const controller = new Controller({ bridge: { panel: { setRepositoryAssociation: async () => { if (fail) throw new Error('失败'); return []; } } } });
  const entity = { id: 'entity_app', type: 'deployment', runtime: { providerId: 'provider', resourceUuid: 'app', repositoryAssociation: { mode: 'automatic' } } };
  controller._allEntitiesById = () => new Map([[entity.id, entity]]);
  controller._setPanelTopology = controller._renderResources = controller._updateSummary = controller._renderInspector = () => {};
  controller._openRepositoryAssociationDialog = async () => choose;
  let rendered;
  controller._renderGraph = () => { rendered = controller._repositoryAssociationHtml(entity); };
  for (const action of ['match', 'choose', 'disabled', 'automatic', 'choose', 'choose']) {
    if (action === 'automatic') fail = true;
    if (action === 'choose' && fail) choose = null;
    await controller._changeRepositoryAssociation(entity.id, action);
    assert.equal(controller.repositoryAssociationSaving, false);
    assert.doesNotMatch(rendered, /data-panel-association-action="[^"]+"[^>]*disabled/);
  }
});

test('仓库跳转区分新标签和系统文件管理器，标签按平台显示', async () => {
  for (const [platform, label] of [['darwin', '在访达打开'], ['win32', '在资源管理器打开']]) {
    const calls = [];
    const controller = new Controller({ bridge: { platform, fs: { openDirectory: async p => { calls.push(['system', p]); return true; } } }, onOpenDirectory: async p => calls.push(['tab', p]) });
    controller.panelRepositories = [{ id: 'repo_one', path: '/workspace/repo', name: 'repo' }];
    controller.resourceMap.set('repository:repo_one', controller.panelRepositories[0]);
    controller._persistNow = async () => { calls.push(['save']); };
    const html = controller._repositoryAssociationHtml({ id: 'app', runtime: { repositoryIds: ['repo_one'] } });
    assert.match(html, /新标签页打开目录/); assert.ok(html.includes(label));
    await controller._openRepositoryDirectory('repo_one', false);
    await controller._openRepositoryDirectory('repo_one', true);
    assert.deepEqual(calls, [['save'], ['tab', '/workspace/repo'], ['system', '/workspace/repo']]);
  }
});

test('全局导航保留，资源库及详情作为可折叠、左右停靠的独立组件', () => {
  assert.doesNotMatch(relationshipCss, /relationships-mode\s+\.sidebar/);
  assert.doesNotMatch(relationshipCss, /relationships-mode\s+#resize-handle-left/);
  assert.doesNotMatch(contentCss, /settings-mode\s+\.sidebar/);
  assert.doesNotMatch(contentCss, /settings-mode\s+#resize-handle-left/);
  assert.match(controllerSource, /data-relationship-action="toggle-resource-panel"/);
  assert.match(html, /id="relationship-resource-sidebar-content"/);
  assert.match(controllerSource, /data-panel-collapse="library"/);
  assert.match(controllerSource, /data-panel-collapse="inspector"/);
  assert.match(controllerSource, /data-panel-dock="right"/);
  assert.match(controllerSource, /application\/x-gitfinder-panel/);
  assert.match(relationshipCss, /\.relationship-panel-dock > \.relationship-dock-component\s*\{[^}]*position:\s*static;/s);
});

test('项目仓库、Panel 主机部署和访问端点归入稳定资源分类', () => {
  const controller = new Controller({ bridge: { platform: 'darwin' } });
  controller.directories = [
    { key: '/Volumes/project', name: 'project', path: '/Volumes/project' },
    { key: '/Users/test/Desktop', name: 'Desktop', path: '/Users/test/Desktop' }
  ];
  controller.resources = [
    { key: 'project:project_1', kind: 'project', refId: 'project_1', name: 'MES', path: '/Volumes/project/MES', secondary: 'active' },
    { key: 'repository:r_1', kind: 'repository', refId: 'r_1', name: 'mes-lite', path: '/Volumes/project/MES/mes-lite', secondary: 'Git 仓库' }
  ];
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_resources01',
    entities: [{ id: 'entity_endpoint01', type: 'endpoint', name: 'MES 公网', details: { urlLabel: 'https://mes.example.com' }, source: 'manual' }],
    relationships: [],
    boards: [{ id: 'board_resources01', name: '部署', viewport: { x: 0, y: 0, zoom: 1 }, placements: [] }]
  };
  controller.panelProjection = {
    entities: [
      { id: 'entity_server01', type: 'server', name: 'Con01', details: {}, source: 'observed', transient: true },
      { id: 'entity_deploy01', type: 'deployment', name: 'MES production', details: { environment: 'production' }, source: 'observed', transient: true }
    ],
    relationships: [],
    placements: [
      { entityId: 'entity_server01', x: 900, y: 0, dynamic: true },
      { entityId: 'entity_deploy01', x: 600, y: 0, dynamic: true }
    ],
    metadata: {}
  };

  const catalog = controller._resourceCatalog();
  assert.deepEqual(catalog.map(resource => resource.kind).sort(), ['deployment', 'endpoint', 'project', 'repository', 'server']);
  const resourceSections = controller._resourceSections(catalog);
  assert.equal(resourceSections.find(section => section.id === 'server').items[0].name, 'Con01');
  assert.equal(resourceSections.find(section => section.id === 'deployment').label, '站点与部署');
  assert.equal(resourceSections.find(section => section.id === 'endpoint').label, '访问端点');

  assert.deepEqual(resourceSections.flatMap(section => section.items.filter(item => item.placed).map(item => item.name)), ['Con01', 'MES production']);
});

test('当前白板资源包含文字、媒体、群组和缺失仓库，并随白板切换更新', () => {
  const c = new Controller({ bridge: {} });
  c.resources = [{ key: 'repository:known', kind: 'repository', refId: 'known', name: '未添加仓库', path: '/known' }];
  c.store = { activeBoardId: 'one', entities: [
    { id: 'text', type: 'text', name: '说明', details: { text: '备注内容' } },
    { id: 'image', type: 'image', name: '截图', details: {} },
    { id: 'file', type: 'file', name: '附件', details: {} },
    { id: 'group', type: 'group', name: '服务分组', details: {} },
    { id: 'repo', type: 'repository', refId: 'missing', name: '缺失仓库', details: {} }
  ], boards: [
    { id: 'one', placements: ['text', 'image', 'file', 'group', 'repo'].map(entityId => ({ entityId })) },
    { id: 'two', placements: [] }
  ] };
  const items = () => c._resourceSections().flatMap(section => section.items).filter(item => item.placed);
  assert.deepEqual(items().map(item => item.entityId).sort(), ['file', 'group', 'image', 'repo', 'text']);
  assert.ok(items().every(item => item.placed));
  assert.ok(c._resourceCatalog().some(item => item.key === 'repository:known'));
  c.store.activeBoardId = 'two';
  assert.deepEqual(items(), []);
});

test('关系白板作为结构独立工作区接入菜单、渲染生命周期和本机 IPC', () => {
  assert.match(html, /data-view="relationships"[\s\S]*?<span>关系白板<\/span>/);
  assert.ok(html.indexOf('../shared/relationshipGraphModel.js') < html.indexOf('scripts/relationshipBoardController.js'));
  assert.ok(html.indexOf('scripts/relationshipBoardController.js') < html.indexOf('scripts/app.js'));
  assert.match(appSource, /\['tree', 'dashboard', 'tasks', 'relationships'\]\.includes\(view\)/);
  assert.match(appSource, /AppState\.currentMode === 'relationships'[\s\S]*?relationshipBoardController\.open\(contentArea,/);
  assert.match(appSource, /isCurrent:\s*\(\)\s*=>\s*renderRequestId === AppState\.directoryRenderRequestId/);
  assert.match(appSource, /restoreWorkspaceView\s*=\s*AppState\.currentMode !== 'tree'/);
  assert.match(preloadSource, /relationshipBoards:[\s\S]*?relationshipBoards:get[\s\S]*?relationshipBoards:save/);
  assert.match(mainSource, /registerRelationshipBoardsIPC\(\)/);
  assert.match(mainSource, /label: '关系白板',[^\n]+view:relationships/);
  assert.match(serviceSource, /function getDefaultService\(\)/);
  assert.match(serviceSource, /app\?\.getPath\?\.\('userData'\)/);
  assert.doesNotMatch(serviceSource, /const relationshipBoardService = new RelationshipBoardService\(\)/);
  assert.match(userDataVerifierSource, /Intentionally import before ready/);
  assert.match(userDataVerifierSource, /app\.getPath\('userData'\)/);
  assert.match(userDataVerifierSource, /relationshipBoardService\.save\(markerStore\)/);
  assert.match(userDataVerifierSource, /relationshipBoardImportService\.previewFromFile\(importFile\)/);
  assert.match(userDataVerifierSource, /relationshipBoardImportService\.applyImport\(preview\)/);
});

test('关系白板文件导入导出只通过系统文件选择、主进程预览令牌和确认应用', () => {
  const relationshipPreloadBlock = preloadSource.match(/relationshipBoards:\s*\{[\s\S]*?\n\s*\},/)?.[0] || '';
  assert.match(controllerSource, /data-relationship-action="export-json"/);
  assert.match(controllerSource, /data-relationship-action="import-json"/);
  assert.match(controllerSource, /relationshipBoards\.exportCurrent\(\{ store \}\)/);
  assert.match(controllerSource, /relationshipBoards\.previewImport\(\)/);
  assert.match(controllerSource, /relationshipBoards\.applyImport\(\{[\s\S]*?operationId:[\s\S]*?previewToken:/);
  assert.match(controllerSource, /确认前不会写入/);
  assert.match(relationshipPreloadBlock, /previewImport:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('relationshipBoards:previewImport'\)/);
  assert.match(relationshipPreloadBlock, /applyImport:\s*\(request\)\s*=>\s*ipcRenderer\.invoke\('relationshipBoards:applyImport', request\)/);
  assert.match(relationshipPreloadBlock, /exportCurrent:\s*\(request\)\s*=>\s*ipcRenderer\.invoke\('relationshipBoards:export', request\)/);
  assert.match(relationshipIpcSource, /dialog\.showOpenDialog/);
  assert.match(relationshipIpcSource, /dialog\.showSaveDialog/);
  assert.match(relationshipIpcSource, /exportToFile\(result\.filePath, store\)/);
  assert.match(relationshipIpcSource, /previewFromFile\(result\.filePaths\[0\]\)/);
  assert.match(importServiceSource, /baseRevision/);
  assert.match(importServiceSource, /sourceFingerprint/);
  assert.match(importServiceSource, /createImportBackup\(\)/);
  assert.doesNotMatch(relationshipPreloadBlock, /previewImport:\s*\([^)]*path/i);
});

test('确认 JSON 差异后控制器载入主进程结果并保留一次撤销快照', async () => {
  const initialStore = {
    schemaVersion: 1,
    activeBoardId: 'board_import001',
    entities: [{ id: 'entity_server01', type: 'server', name: 'Con01', details: {} }],
    relationships: [],
    boards: [{
      id: 'board_import001',
      name: '部署',
      viewport: { x: 0, y: 0, zoom: 1 },
      placements: [{ entityId: 'entity_server01', x: 0, y: 0 }]
    }]
  };
  const importedStore = structuredClone(initialStore);
  importedStore.entities.push({
    id: 'entity_deploy01',
    type: 'deployment',
    name: 'MES production',
    details: { environment: 'production' },
    source: 'imported'
  });
  importedStore.boards[0].placements.push({ entityId: 'entity_deploy01', x: 300, y: 0 });
  let applyRequest = null;
  const notifications = [];
  const controller = new Controller({
    bridge: {
      relationshipBoards: {
        previewImport: async () => ({
          cancelled: false,
          hasChanges: true,
          fileName: 'relationships.json',
          operationId: 'relationship_import_00000000000000000000000000000000',
          previewToken: 'a'.repeat(64),
          totalChanges: 2,
          counts: { addedEntities: 1, updatedBoards: 1 },
          changes: [],
          boundary: '只合并，不删除。'
        }),
        applyImport: async request => {
          applyRequest = request;
          return {
            applied: true,
            store: RelationshipGraphModel.assertValidStore(importedStore),
            totalChanges: 2,
            backupFileName: 'relationship-boards.import-backup-test.json'
          };
        }
      }
    },
    notify: (message, type) => notifications.push({ message, type })
  });
  controller.store = RelationshipGraphModel.assertValidStore(initialStore);
  controller.root = { querySelector: () => null };
  controller._persistNow = async () => {};
  controller._openImportPreviewDialog = async () => true;
  controller.render = () => {};
  controller._setCanvasAnnouncement = () => {};

  assert.equal(await controller._importRelationshipJson(), true);

  assert.deepEqual(applyRequest, {
    operationId: 'relationship_import_00000000000000000000000000000000',
    previewToken: 'a'.repeat(64)
  });
  assert.equal(controller.store.entities.length, 2);
  assert.equal(controller.undoStack.length, 1);
  assert.match(notifications[0].message, /已合并 2 项/);
  assert.equal(notifications[0].type, 'success');
});

test('白板不在画布内重复暴露 Coolify Token，连接统一放在应用设置', () => {
  const relationshipPreloadBlock = preloadSource.match(/relationshipBoards:\s*\{[\s\S]*?\n\s*\},/)?.[0] || '';
  assert.equal(fs.existsSync(path.join(projectRoot, 'src/main/services/coolifyReadOnlyConnectorService.js')), false);
  assert.doesNotMatch(controllerSource, /data-relationship-action="connect-coolify"/);
  assert.doesNotMatch(controllerSource, /连接 Coolify（只读）/);
  assert.doesNotMatch(controllerSource, /name="accessToken"/);
  assert.doesNotMatch(relationshipPreloadBlock, /previewCoolify|applyCoolify/);
  assert.doesNotMatch(relationshipIpcSource, /previewCoolify|applyCoolify|coolifyReadOnlyConnectorService/);
});

test('Coolify 动态拓扑通过只读 IPC 投影到白板而不写入持久关系事实', () => {
  assert.match(preloadSource, /getTopology:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('panel:getTopology'\)/);
  assert.match(preloadSource, /getProjectBindings:\s*\(directoryPath\)\s*=>\s*ipcRenderer\.invoke\('panel:getProjectBindings'/);
  assert.match(controllerSource, /PanelTopologyProjection/);
  assert.match(controllerSource, /data-panel-topology-status/);
  assert.match(controllerSource, /data-relationship-action="refresh-panel"/);
  assert.match(controllerSource, /动态事实直接来自 Coolify，只读显示，不写入本机白板/);

  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_panel001',
    entities: [],
    relationships: [],
    boards: [{
      id: 'board_panel001',
      name: '部署关系',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: RelationshipGraphModel.defaultBoardView(),
      placements: []
    }]
  };
  controller.panelProjects = [{ projectId: 'project_local_1', name: 'MES', path: '/Volumes/project/mes' }];
  controller.panelRepositories = [{ id: 'r_0123456789ab', name: 'mes-lite', path: '/Volumes/project/mes/mes-lite' }];
  controller._setResources(controller.panelProjects, controller.panelRepositories);
  controller._setPanelTopology({
    state: 'ready',
    provider: { providerId: 'panel_1', label: 'Panel' },
    topology: {
      generatedAt: '2026-08-29T02:00:00.000Z',
      servers: [{ nodeId: 'node_1', name: 'Con01', status: 'online', observedAt: '2026-08-29T02:00:00.000Z', latencyMs: 32 }],
      deployments: [{
        resourceUuid: 'resource_1', nodeId: 'node_1', name: 'MES Lite', status: 'running',
        environmentName: '生产', observedAt: '2026-08-29T02:00:00.000Z', latencyMs: 80,
        recentFailure: { hasFailure: false }
      }]
    },
    bindings: [{
      providerId: 'panel_1', projectId: 'project_local_1', resourceUuid: 'resource_1', repositoryIds: ['r_0123456789ab']
    }]
  });

  const graph = controller._filteredGraph();
  assert.equal(graph.placements.length, 4);
  assert.equal(graph.relationships.length, 3);
  assert.equal(controller.store.entities.length, 0);
  assert.equal(controller.store.relationships.length, 0);
  assert.doesNotMatch(JSON.stringify(controller.store), /entity_panel_/);

  const exported = controller._buildActiveBoardExportStore();
  assert.equal(exported.boards.length, 1);
  assert.equal(exported.entities.length, 4);
  assert.equal(exported.relationships.length, 3);
  assert.equal(exported.entities.some(entity => entity.source === 'observed'), true);
  assert.equal(exported.relationships.every(relationship => relationship.id.startsWith('relationship_')), true);
  assert.doesNotMatch(JSON.stringify(exported), /\/Volumes\/|"transient"|"runtime"|"dynamic"|"provider"/);
});

test('关系白板不等待全盘项目扫描或 Coolify 网络即可先显示本机关系与仓库', async () => {
  let resolveProjects;
  const projects = new Promise(resolve => { resolveProjects = resolve; });
  const topology = new Promise(() => {});
  const controller = new Controller({
    bridge: {
      relationshipBoards: { get: async () => ({ store: RelationshipGraphModel.defaultStore() }) },
      localProjects: { list: () => projects },
      repos: { getRegistry: async () => ({ repos: [{ id: 'r_0123456789ab', path: '/repo', name: 'repo' }] }) },
      panel: { getTopology: () => topology }
    }
  });

  const loadResult = await Promise.race([
    controller._load().then(() => 'loaded'),
    new Promise(resolve => setTimeout(() => resolve('blocked'), 50))
  ]);
  assert.equal(loadResult, 'loaded');
  assert.equal(controller.loaded, true);
  assert.equal(controller.resources.some(item => item.kind === 'repository'), true);
  assert.equal(controller.resources.some(item => item.kind === 'project'), false);

  resolveProjects([{ projectId: 'project_local_1', name: 'MES', path: '/project' }]);
  await controller.resourceLoadingPromise;
  assert.equal(controller.resources.some(item => item.kind === 'project'), true);
});

test('关系白板完成本地渲染后才在后台刷新 Coolify', async () => {
  const originalDocument = globalThis.document;
  let rendered = 0;
  let refreshStartedAfterRender = false;
  globalThis.document = {
    addEventListener() {},
    removeEventListener() {}
  };
  try {
    const controller = new Controller({ bridge: { panel: { getTopology: async () => ({ state: 'ready' }) } } });
    controller._load = async () => {
      controller.store = RelationshipGraphModel.defaultStore();
      controller.loaded = true;
    };
    controller.render = () => { rendered += 1; };
    controller._refreshPanelTopology = () => {
      refreshStartedAfterRender = rendered === 1;
      return new Promise(() => {});
    };
    const container = { innerHTML: '' };

    const openResult = await Promise.race([
      controller.open(container),
      new Promise(resolve => setTimeout(() => resolve('blocked'), 50))
    ]);

    assert.notEqual(openResult, 'blocked');
    assert.equal(rendered, 1);
    assert.equal(refreshStartedAfterRender, true);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('切换到文件浏览后，迟到的白板载入不会重新占用内容区或键盘事件', async () => {
  const originalDocument = globalThis.document;
  let resolveLoad;
  let rendered = 0;
  let keydownBound = false;
  globalThis.document = {
    addEventListener(type) { if (type === 'keydown') keydownBound = true; },
    removeEventListener(type) { if (type === 'keydown') keydownBound = false; }
  };
  try {
    const controller = new Controller({ bridge: {} });
    controller.store = RelationshipGraphModel.defaultStore();
    controller._load = () => new Promise(resolve => { resolveLoad = resolve; });
    controller.render = () => { rendered++; };
    controller._schedulePanelRefresh = () => {};
    const container = { innerHTML: '' };
    const opening = controller.open(container, { isCurrent: () => false });
    await Promise.resolve();
    controller.close();
    resolveLoad();
    await opening;

    assert.equal(rendered, 0);
    assert.equal(keydownBound, false);
    assert.equal(controller.container, null);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('白板使用稳定项目仓库身份并提供指针、键盘和降低动效交互', () => {
  assert.match(controllerSource, /refId:\s*resource\.refId/);
  assert.match(controllerSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(controllerSource, /keyboardConnectSourceId/);
  assert.match(controllerSource, /event\.key === 'Enter'/);
  assert.match(controllerSource, /undoStack/);
  assert.match(controllerSource, /redoStack/);
  assert.match(relationshipCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(controllerSource, /git\.init|git\.commit|git\.push|ssh|deploy\(/i);
});

test('反向关系使用相邻端口而不是绕到两个节点外侧', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [],
    relationships: [],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      placements: [
        { entityId: 'entity_source01', x: 420, y: 100 },
        { entityId: 'entity_target01', x: 80, y: 180 }
      ]
    }]
  };

  const geometry = controller._edgeGeometry({ sourceId: 'entity_source01', targetId: 'entity_target01' });

  assert.match(geometry.path, /^M 420.5 159.5 C/);
  assert.match(geometry.path, new RegExp(` ${80 + NODE_WIDTH - .5} 239.5$`));
  assert.equal(geometry.labelX, (420 + 80 + NODE_WIDTH) / 2);
});

test('关系线显示明确方向箭头且临时连线保持轻量反馈', () => {
  assert.match(controllerSource, /id="relationship-edge-arrow"/);
  assert.match(controllerSource, /marker-end="url\(#relationship-edge-arrow\)"/);
  assert.match(relationshipCss, /\.relationship-edge-arrow\s*\{[^}]*fill:/s);
  assert.match(relationshipCss, /\.relationship-edge-temporary\s*\{[^}]*stroke-dasharray:/s);
});

test('选择节点或关系时使用非模态详情检查器编辑受控事实字段', () => {
  assert.match(controllerSource, /class="relationship-inspector-panel relationship-dock-component"[^>]+hidden/);
  assert.match(controllerSource, /data-relationship-inspector-form/);
  assert.match(controllerSource, /name="source"/);
  assert.match(controllerSource, /name="verifiedAt"[^>]+datetime-local/);
  assert.match(controllerSource, /name="evidenceSummary"[^>]+maxlength="500"/);
  assert.match(controllerSource, /name="reviewIntervalDays"[^>]+type="number"[^>]+min="1"[^>]+max="3650"/);
  assert.match(controllerSource, /name="relationshipType"/);
  assert.match(controllerSource, /name="relationshipLabel"[^>]+maxlength="80"/);
  assert.match(controllerSource, /data-relationship-action="reverse-relationship"/);
  assert.match(controllerSource, /标记为刚刚验证/);
  assert.match(controllerSource, /Model\.assertValidStore\(nextStore\)/);
  assert.match(controllerSource, /不会连接服务器、执行部署或修改 Git/);
  assert.match(controllerSource, /key: 'version', label: '版本'/);
  assert.match(controllerSource, /key: 'branch', label: '分支'/);
  assert.match(controllerSource, /key: 'revision', label: '提交'/);
  assert.match(relationshipCss, /\.relationship-body\.has-inspector/);
  assert.match(relationshipCss, /@media\s*\(prefers-reduced-transparency:\s*reduce\)/);
  assert.match(relationshipCss, /@media\s*\(prefers-contrast:\s*more\)/);
});

test('白板主体不会被长资源列表撑高而把属性面板滚出视口', () => {
  assert.match(relationshipCss, /\.relationship-body\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\);[^}]*overflow:\s*hidden;/s);
  assert.match(relationshipCss, /\.relationship-resource-panel,\s*\.relationship-canvas,\s*\.relationship-inspector-panel\s*\{[^}]*min-height:\s*0;/s);
});

test('关系类型按端点提供常用预设，反转方向时使用语义相反的预设', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_project1', type: 'project', name: 'Project', refId: 'project_alpha01', details: {} },
      { id: 'entity_repo0001', type: 'repository', name: 'Repo', refId: 'repo_alpha001', details: {} }
    ],
    relationships: [{
      id: 'relationship_test0001',
      type: 'contains',
      sourceId: 'entity_project1',
      targetId: 'entity_repo0001',
      source: 'manual'
    }],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      placements: [
        { entityId: 'entity_project1', x: 0, y: 0 },
        { entityId: 'entity_repo0001', x: 320, y: 0 }
      ]
    }]
  };
  controller.selectedRelationshipId = 'relationship_test0001';
  controller._persistSoon = () => {};
  controller._renderGraph = () => {};
  controller._refreshHistoryButtons = () => {};
  controller._updateSummary = () => {};
  controller._setCanvasAnnouncement = () => {};

  assert.equal(controller._reverseSelectedRelationship(), true);
  assert.deepEqual(controller.store.relationships[0], {
    id: 'relationship_test0001',
    type: 'belongs_to',
    sourceId: 'entity_repo0001',
    targetId: 'entity_project1',
    source: 'manual'
  });
  assert.equal(controller.undoStack.length, 1);
  assert.match(controller._relationshipTypeOptions('repository', 'repository', 'forked_from'), /Fork 来源于/);
  assert.match(controller._relationshipTypeOptions('repository', 'repository', 'forked_from'), /镜像/);
  assert.doesNotMatch(controller._relationshipTypeOptions('repository', 'repository', 'forked_from'), />包含</);
});

test('节点卡片除连接点、详情内容和交互控件外可从整个卡面开始拖动', () => {
  assert.match(controllerSource, /const node = event\.target\.closest\('\.relationship-node'\);[\s\S]*?const nodeControl = event\.target\.closest\('\.relationship-port, \.relationship-card-detail-content, button, input, textarea, select, a'\);[\s\S]*?node && !nodeControl/);
  assert.doesNotMatch(controllerSource, /const header = event\.target\.closest\('\.relationship-node-header'\)/);
  assert.match(relationshipCss, /\.relationship-node:not\(\.panel-dynamic\)\s*\{[^}]*cursor:\s*grab/s);
});

test('Coolify 动态节点可移动且布局覆盖只保存在本机偏好中', () => {
  const normalized = normalizeDynamicLayoutStore({
    version: 1,
    boards: {
      board_test0001: {
        entity_panel_server_12345678: {
          x: 456.4,
          y: 123.6,
          labels: ['生产'],
          note: '只读主机备注',
          todos: [{ id: 'todo_check001', title: '检查延迟', completed: false }]
        },
        invalid: { x: 'bad', y: 0 }
      }
    }
  });
  assert.deepEqual(normalized, {
    version: 1,
    boards: {
      board_test0001: {
        entity_panel_server_12345678: {
          x: 456,
          y: 124,
          labels: ['生产'],
          note: '只读主机备注',
          todos: [{ id: 'todo_check001', title: '检查延迟', completed: false }]
        }
      }
    }
  });
  assert.match(controllerSource, /relationshipDynamicLayouts/);
  assert.match(controllerSource, /data-relationship-action="reset-dynamic-layout"/);
  assert.match(controllerSource, /data-relationship-action="toggle-layout-menu"/);
  assert.match(controllerSource, /command\('按类别分列', 'arrange-by-category'\)/);
  assert.match(controllerSource, /_saveDynamicPlacementOverrides/);
  assert.match(relationshipCss, /\.relationship-node\.panel-dynamic\s*\{[^}]*cursor:\s*grab/s);
});

test('按类别分列会排列当前白板的本地与动态资源并保持关系顺序', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_lanes001',
    entities: [
      { id: 'entity_project01', type: 'project', name: 'MES', details: {} },
      { id: 'entity_repo0001', type: 'repository', name: 'mes-lite', details: {} },
      { id: 'entity_deploy01', type: 'deployment', name: 'Production', details: {} },
      { id: 'entity_server01', type: 'server', name: 'Con01', details: {} },
      { id: 'entity_endpoint1', type: 'endpoint', name: 'mes.example.com', details: {} }
    ],
    relationships: [
      { id: 'relation_contain1', type: 'contains', sourceId: 'entity_project01', targetId: 'entity_repo0001' },
      { id: 'relation_source01', type: 'source_of', sourceId: 'entity_repo0001', targetId: 'entity_deploy01' },
      { id: 'relation_runson01', type: 'runs_on', sourceId: 'entity_deploy01', targetId: 'entity_server01' },
      { id: 'relation_expose01', type: 'exposes', sourceId: 'entity_deploy01', targetId: 'entity_endpoint1' }
    ],
    boards: [{
      id: 'board_lanes001',
      name: '类别分列',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: RelationshipGraphModel.defaultBoardView(),
      placements: ['entity_project01', 'entity_repo0001', 'entity_deploy01', 'entity_server01', 'entity_endpoint1']
        .map(entityId => ({ entityId, x: 0, y: 0 }))
    }]
  };
  let fitOptions = null;
  controller._renderGraph = () => {};
  controller._persistSoon = () => {};
  controller._refreshHistoryButtons = () => {};
  controller.fitContent = options => { fitOptions = options; };

  assert.equal(controller._arrangeByCategory(), true);

  const placements = new Map(controller.store.boards[0].placements.map(placement => [placement.entityId, placement]));
  assert.deepEqual(
    ['entity_project01', 'entity_repo0001', 'entity_deploy01', 'entity_server01', 'entity_endpoint1'].map(id => placements.get(id).x),
    [80, 424, 768, 1112, 1456]
  );
  assert.deepEqual([...placements.values()].map(placement => placement.y), [80, 80, 80, 80, 80]);
  assert.deepEqual(fitOptions, { minZoom: 1 });
  assert.match(controllerSource, /_resetDynamicLayout\(\)[\s\S]*?fitContent\(\{ minZoom: 1 \}\)/);
});

test('智能磁吸优先对齐节点参考线，网格模式使用稳定间距', () => {
  const smart = resolveMagneticSnap({
    mode: 'smart',
    threshold: 8,
    gridSize: 24,
    movingBounds: { left: 100, centerX: 218, right: 336, top: 96, centerY: 143, bottom: 190 },
    stationaryBounds: [{ left: 344, centerX: 462, right: 580, top: 100, centerY: 147, bottom: 194 }]
  });
  assert.equal(smart.dx, 8);
  assert.equal(smart.dy, 4);
  assert.deepEqual(smart.guides.map(guide => [guide.axis, guide.position, guide.kind]), [
    ['x', 344, 'node'],
    ['y', 100, 'node']
  ]);

  const grid = resolveMagneticSnap({
    mode: 'grid',
    gridSize: 24,
    movingBounds: { left: 51, centerX: 169, right: 287, top: 49, centerY: 96, bottom: 143 },
    stationaryBounds: []
  });
  assert.deepEqual({ dx: grid.dx, dy: grid.dy }, { dx: -3, dy: -1 });
});

test('白板工具栏公开吸附和群组入口，元素注释支持标签备注待办提醒与筛选', () => {
  assert.match(controllerSource, /data-relationship-snap-mode/);
  assert.match(controllerSource, /按住 Option\/Alt 临时关闭吸附/);
  assert.match(controllerSource, /data-relationship-action="create-group-from-selection"/);
  assert.match(controllerSource, /data-relationship-action="add-todo-row"/);
  assert.match(controllerSource, /name="placementLabels"/);
  assert.match(controllerSource, /name="placementNote"/);
  assert.match(controllerSource, /name="placementTitleMode"/);
  assert.match(controllerSource, /name="placementTitleText"/);
  assert.match(controllerSource, /name="task"/);
  assert.match(controllerSource, /name="annotation"/);
  assert.match(controllerSource, /name="label"/);
  assert.match(controllerSource, /event\.altKey/);
  assert.match(controllerSource, /relationship-guide-layer/);
  assert.match(controllerSource, /preserveDirtyInspector/);
  assert.match(relationshipCss, /\.relationship-snap-guide\s*\{/);
  assert.match(relationshipCss, /\.relationship-node-labels\s*\{/);
  assert.match(relationshipCss, /\.relationship-todo-row\s*\{/);
});

test('卡片显示别名可替换、前后追加或作为副标题且不修改原始实体名', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_alias0001',
    entities: [{ id: 'entity_server01', type: 'server', name: 'localhost', details: { hostLabel: 'localhost' } }],
    relationships: [],
    boards: [{
      id: 'board_alias0001',
      name: '别名测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: RelationshipGraphModel.defaultBoardView(),
      placements: [{ entityId: 'entity_server01', x: 0, y: 0, titleMode: 'prefix', titleText: '生产' }]
    }]
  };
  const entity = controller.store.entities[0];

  assert.equal(controller._entityDisplayName(entity), '生产 · localhost');
  assert.equal(controller._entityBaseName(entity), 'localhost');
  controller.store.boards[0].placements[0].titleMode = 'replace';
  assert.equal(controller._entityDisplayName(entity), '生产');
  controller.store.boards[0].placements[0].titleMode = 'suffix';
  assert.equal(controller._entityDisplayName(entity), 'localhost · 生产');
  controller.store.boards[0].placements[0].titleMode = 'subtitle';
  assert.equal(controller._entityDisplayName(entity), 'localhost');
  assert.equal(controller._entityDisplaySubtitle(entity, 'online'), '生产 · online');
  assert.equal(entity.name, 'localhost');
});

test('白板显示菜单可实时调节卡片尺寸、间距、文字、层次、网格和关系文字', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_display01',
    entities: [],
    relationships: [],
    boards: [{
      id: 'board_display01',
      name: '显示测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: {
        ...RelationshipGraphModel.defaultBoardView(),
        cardScale: 1.2,
        textScale: 1.1,
        horizontalSpacing: 96,
        verticalSpacing: 52,
        cardAppearance: 'flat',
        showGrid: false,
        showEdgeLabels: false,
        cardTitleSource: 'note',
        showRuntimeStatus: false
      },
      placements: []
    }]
  };

  assert.deepEqual(controller._nodeDimensions(), {
    width: Math.round(NODE_WIDTH * 1.2),
    height: Math.round(NODE_HEIGHT * 1.2)
  });
  assert.match(controllerSource, /data-relationship-action="toggle-display-menu"/);
  assert.match(controllerSource, /name="cardScale"/);
  assert.match(controllerSource, /name="textScale"/);
  assert.match(controllerSource, /name="horizontalSpacing" type="range"/);
  assert.match(controllerSource, /name="verticalSpacing" type="range"/);
  assert.match(controllerSource, /horizontalSpacing: this\._displayViewSettings\(\)\.horizontalSpacing/);
  assert.match(controllerSource, /verticalSpacing: this\._displayViewSettings\(\)\.verticalSpacing/);
  assert.match(controllerSource, /name="cardAppearance"/);
  assert.match(controllerSource, /name="showGrid"/);
  assert.match(controllerSource, /name="showEdgeLabels"/);
  assert.match(controllerSource, /name="cardTitleSource"/);
  assert.match(controllerSource, /name="showRuntimeStatus"/);
  assert.match(controllerSource, /data-relationship-action="reset-display-settings"/);
  assert.match(relationshipCss, /--relationship-card-scale/);
  assert.match(relationshipCss, /--relationship-text-scale/);
  assert.match(relationshipCss, /data-card-appearance="flat"/);
  assert.match(relationshipCss, /data-show-grid="false"/);
  assert.match(relationshipCss, /data-show-edge-labels="false"/);
});

test('服务卡片将运行、停止、部署失败和故障显示为明确状态徽标', () => {
  const controller = new Controller({ bridge: {} });

  assert.deepEqual(controller._entityRuntimeStatus({
    type: 'deployment',
    runtime: { status: 'running', recentFailure: { hasFailure: false } }
  }), { state: 'running', label: '运行中', sourceStatus: 'running' });
  assert.deepEqual(controller._entityRuntimeStatus({
    type: 'deployment',
    runtime: { status: 'running', recentFailure: { hasFailure: true } }
  }), { state: 'deploy-failed', label: '部署失败', sourceStatus: 'running' });
  assert.equal(controller._entityRuntimeStatus({
    type: 'deployment',
    runtime: { status: 'stopped' }
  }).label, '已停止');
  assert.equal(controller._entityRuntimeStatus({
    type: 'deployment',
    runtime: { status: 'unhealthy' }
  }).label, '故障');
  assert.match(controllerSource, /relationship-node-runtime-status/);
  assert.match(relationshipCss, /\.relationship-node\[data-status-tone="normal"\] \.relationship-card-surface/);
  assert.match(relationshipCss, /\.relationship-node\[data-status-tone="warning"\] \.relationship-card-surface/);
  assert.match(relationshipCss, /\.relationship-node\[data-status-tone="inactive"\] \.relationship-card-surface/);
});

test('单卡标题来源和状态可覆盖白板默认且继续支持别名重命名', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_override01',
    entities: [{ id: 'entity_deploy01', type: 'deployment', name: 'MES production', details: { status: 'running' } }],
    relationships: [],
    boards: [{
      id: 'board_override01',
      name: '覆盖测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { ...RelationshipGraphModel.defaultBoardView(), cardTitleSource: 'note', showRuntimeStatus: false },
      placements: [{ entityId: 'entity_deploy01', x: 0, y: 0, note: '生产主站', titleMode: 'suffix', titleText: '华东' }]
    }]
  };

  assert.equal(controller._entityDisplayName(controller.store.entities[0]), '生产主站 · 华东');
  assert.equal(controller._cardShowsRuntimeStatus(controller.store.boards[0].placements[0]), false);
  controller.store.boards[0].placements[0].titleSource = 'name';
  controller.store.boards[0].placements[0].statusVisibility = 'show';
  assert.equal(controller._entityDisplayName(controller.store.entities[0]), 'MES production · 华东');
  assert.equal(controller._cardShowsRuntimeStatus(controller.store.boards[0].placements[0]), true);
  assert.match(controllerSource, /name="placementTitleSource"/);
  assert.match(controllerSource, /name="placementStatusVisibility"/);
});

test('卡片上下按钮切换双态详情并保留可固定的属性浮窗', () => {
  assert.deepEqual(
    { width: NODE_WIDTH, height: NODE_HEIGHT, compactWidth: COMPACT_NODE_WIDTH, compactHeight: COMPACT_NODE_HEIGHT },
    { width: 280, height: 143, compactWidth: 236, compactHeight: 94 }
  );
  assert.match(controllerSource, /relationship-card-expand relationship-card-expand-top/);
  assert.match(controllerSource, /relationship-card-expand relationship-card-expand-bottom/);
  assert.match(controllerSource, /relationship-node-identity/);
  assert.match(controllerSource, /relationship-node-attention-row/);
  assert.match(controllerSource, /relationship-attention-chip neutral">无待办/);
  assert.match(controllerSource, /<b>\$\{expanded \? '收起详情' : '展开详情'\}<\/b>/);
  assert.match(controllerSource, /data-relationship-card-detail/);
  assert.match(controllerSource, /expandedCardIds/);
  assert.match(controllerSource, /relationship-card-detail-content/);
  assert.match(controllerSource, /data-relationship-action="toggle-all-card-details"/);
  assert.match(controllerSource, /data-relationship-action="toggle-inspector-pin"/);
  assert.match(controllerSource, /inspectorPinned/);
  assert.match(relationshipCss, /\.relationship-node\.is-detail\s*\{/);
  assert.match(relationshipCss, /--relationship-card-width:\s*280px/);
  assert.match(relationshipCss, /--relationship-card-height:\s*143px/);
  assert.match(relationshipCss, /backdrop-filter:\s*blur\(22px\) saturate\(145%\)/);
  assert.match(controllerSource, /entity\.type === 'repository' \? '已同步' : '正常'/);
  assert.match(controllerSource, /class="relationship-card-expand relationship-card-expand-top"[\s\S]*?<svg viewBox="0 0 20 20"/);
  assert.match(relationshipCss, /\.relationship-node-header\s*\{[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\) 28px;/s);
  assert.match(controllerSource, /class="relationship-node-status-row"/);
  assert.match(relationshipCss, /\.relationship-node-identity \.relationship-node-title\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(relationshipCss, /\.relationship-card-expand-bottom\s*\{[^}]*min-width:\s*106px;/s);
  assert.match(relationshipCss, /\.relationship-card-todos\s*\{/);
  assert.match(relationshipCss, /\.relationship-inspector-panel\s*\{[^}]*position:\s*absolute;/s);
  assert.match(relationshipCss, /\.relationship-inspector-panel\[data-pinned="true"\]/);
  assert.doesNotMatch(relationshipCss, /\.relationship-body\.has-inspector\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+286px;/s);
});

test('展开卡片使用临时布局推开同列下方卡片且不改写保存坐标', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_expand001',
    entities: [
      { id: 'entity_deploy01', type: 'deployment', name: 'Production', details: {} },
      { id: 'entity_deploy02', type: 'deployment', name: 'Staging', details: {} },
      { id: 'entity_server01', type: 'server', name: 'Con01', details: {} }
    ],
    relationships: [],
    boards: [{
      id: 'board_expand001',
      name: '展开测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: RelationshipGraphModel.defaultBoardView(),
      placements: [
        { entityId: 'entity_deploy01', x: 0, y: 0, todos: [{ id: 'todo_expand001', title: '检查部署', completed: false }] },
        { entityId: 'entity_deploy02', x: 0, y: 120 },
        { entityId: 'entity_server01', x: 500, y: 120 }
      ]
    }]
  };
  controller.expandedCardIds.add('entity_deploy01');

  const geometry = controller._displayGeometryMap(controller.store.boards[0].placements);

  assert.ok(geometry.get('entity_deploy01').height > NODE_HEIGHT);
  assert.ok(geometry.get('entity_deploy02').y > 120);
  assert.equal(geometry.get('entity_server01').y, 120);
  assert.equal(controller.store.boards[0].placements[1].y, 120);
});

test('卡片整体缩放，详情色条不裁切且连接点在色条之上', () => {
  assert.match(controllerSource, /class="relationship-card-surface"/);
  assert.match(relationshipCss, /\.relationship-card-surface\s*\{[^}]*zoom:\s*var\(--relationship-card-scale\)/s);
  assert.match(relationshipCss, /\.relationship-card-surface\s*\{[^}]*overflow:\s*visible/s);
  assert.match(relationshipCss, /\.relationship-node\.is-detail\s*\{[^}]*overflow:\s*visible/s);
  assert.match(relationshipCss, /\.relationship-attention-rail\s*\{[^}]*z-index:\s*1/s);
  assert.match(relationshipCss, /\.relationship-port\s*\{[^}]*z-index:\s*2/s);
  assert.match(controllerSource, /\['left', 'right', 'top', 'bottom'\]\.map/);
  assert.match(controllerSource, /<span class="relationship-port" data-port-side=/);
  const controller = new Controller({ bridge: {}, now: () => '2026-08-31T00:00:00Z' });
  const rail = controller._cardAttentionRailHtml([
    { id: 'todo_rail001', title: '逾期任务', dueAt: '2026-08-30T00:00:00Z' },
    { id: 'todo_rail002', title: '提醒任务', reminderAt: '2026-09-01T00:00:00Z' }
  ]);
  for (const kind of ['todo', 'reminder', 'overdue']) assert.match(rail, new RegExp(`data-kind="${kind}"`));
  assert.equal(controller._cardAttentionRailHtml([]), '');
  assert.equal(controller._cardAttentionRailHtml([{ id: 'todo_done001', title: '已完成', completed: true }]), '');
});

test('测量详情内容高度后推开邻卡，纵向连线贴合上下端口', () => {
  const controller = new Controller({ bridge: {} });
  const placements = [{ entityId: 'entity_height01', x: 0, y: 0 }, { entityId: 'entity_height02', x: 0, y: 250 }];
  controller.store = {
    activeBoardId: 'board_height01',
    entities: placements.map(item => ({ id: item.entityId, type: 'server', name: item.entityId, details: {} })),
    relationships: [],
    boards: [{ id: 'board_height01', view: { ...RelationshipGraphModel.defaultBoardView(), cardScale: 1.35 }, placements }]
  };
  controller.expandedCardIds.add('entity_height01');
  controller.cardHeights.set('entity_height01', 600);
  const geometry = controller._displayGeometryMap(placements);
  assert.equal(geometry.get('entity_height01').height, 600);
  assert.equal(geometry.get('entity_height02').y, 600 + controller._displayViewSettings().verticalSpacing);
  const edge = controller._edgeGeometry({ sourceId: 'entity_height01', targetId: 'entity_height02' }, null, geometry);
  assert.equal(edge.sourceSide, 'bottom');
  assert.equal(edge.targetSide, 'top');
  assert.equal(edge.sourcePoint.y, 600 - 0.5 * 1.35);
  assert.equal(edge.targetPoint.y, geometry.get('entity_height02').y + 0.5 * 1.35);
  assert.equal(placements[1].y, 250);
  assert.match(controllerSource, /surface\.offsetHeight \* cardScale/);
});

test('筛选器同组多选取任一条件、跨组同时满足并提供弱化或隐藏策略', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_filter001',
    entities: [
      { id: 'entity_project1', type: 'project', name: 'Project', details: {} },
      { id: 'entity_repo0001', type: 'repository', name: 'Repo', details: {} },
      { id: 'entity_server01', type: 'server', name: 'Server', details: {} }
    ],
    relationships: [],
    boards: [{
      id: 'board_filter001',
      name: '筛选测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: {
        ...RelationshipGraphModel.defaultBoardView(),
        entityTypes: ['project', 'repository'],
        taskFilters: ['has-todos', 'no-todos']
      },
      placements: [
        { entityId: 'entity_project1', x: 0, y: 0, todos: [{ id: 'todo_filter001', title: '待办', completed: false }] },
        { entityId: 'entity_repo0001', x: 300, y: 0 },
        { entityId: 'entity_server01', x: 600, y: 0 }
      ]
    }]
  };

  let graph = controller._filteredGraph();
  assert.deepEqual([...graph.directIds], ['entity_project1', 'entity_repo0001']);
  assert.deepEqual([...graph.mutedIds], ['entity_server01']);

  controller.store.boards[0].view.unmatchedDisplay = 'hide';
  graph = controller._filteredGraph();
  assert.deepEqual(graph.placements.map(item => item.entityId), ['entity_project1', 'entity_repo0001']);
  assert.match(controllerSource, /name="entityTypes" type="checkbox"/);
  assert.match(controllerSource, /name="taskFilters" type="checkbox"/);
  assert.match(controllerSource, /name="runtimeStates" type="checkbox"/);
  assert.match(relationshipCss, /\.relationship-node\.filter-muted\s*\{/);
});

test('部署节点用结构化版本上下文生成可扫描副标题', () => {
  const controller = new Controller({ bridge: {} });
  const subtitle = controller._entitySubtitle({
    type: 'deployment',
    details: {
      environment: 'production',
      version: 'v2.4.1',
      branch: 'release/2.4',
      revision: 'abcdef012345',
      status: 'running'
    }
  }, null, false);

  assert.equal(subtitle, 'production · v2.4.1 · release/2.4 · abcdef012345 · running');
});

test('本机或 Panel 资源丢失时保留节点关系并显示明确缺失状态', () => {
  const controller = new Controller({ bridge: {} });
  controller.resourceMap = new Map();
  controller.panelProjection = { entities: [], relationships: [], placements: [], metadata: {} };

  const missingRepository = controller._entityAvailability({
    id: 'entity_repo0001',
    type: 'repository',
    name: 'Repo',
    refId: 'r_0123456789ab',
    details: {}
  });
  const missingPanelDeployment = controller._entityAvailability({
    id: 'entity_panel_deployment_12345678',
    type: 'deployment',
    name: 'MES production',
    details: {},
    source: 'observed'
  });
  const manualObserved = controller._entityAvailability({
    id: 'entity_manual001',
    type: 'deployment',
    name: 'Manually observed',
    details: {},
    source: 'observed'
  });

  assert.equal(missingRepository.missing, true);
  assert.match(missingRepository.detail, /关系仍保留/);
  assert.equal(missingPanelDeployment.missing, true);
  assert.equal(manualObserved.missing, false);
  assert.match(controllerSource, /data-resource-state="\$\{availability\.missing \? 'missing' : 'ready'\}"/);
  assert.match(controllerSource, /可继续查看、编辑和导出本节点及其关系/);
  assert.match(relationshipCss, /\.relationship-node\.resource-missing \.relationship-card-surface\s*\{[^}]*opacity:\s*1/s);
  assert.match(relationshipCss, /\.relationship-node-kind\[data-state="missing"\]/);

  controller.resourceLoadingPromise = Promise.resolve();
  assert.equal(controller._entityAvailability({
    id: 'entity_project1',
    type: 'project',
    name: 'Loading project',
    refId: 'project_loading01',
    details: {}
  }).missing, false);
});

test('手工部署创建入口将版本上下文写入受控详情字段', async () => {
  const controller = new Controller({ bridge: {} });
  let createdEntity = null;
  controller._openFormDialog = async options => {
    assert.deepEqual(options.fields.map(field => field.key), [
      'name',
      'environment',
      'version',
      'branch',
      'revision',
      'status'
    ]);
    return {
      name: 'MES production',
      environment: 'production',
      version: 'v2.4.1',
      branch: 'release/2.4',
      revision: 'abcdef012345',
      status: 'running'
    };
  };
  controller._addEntity = entity => { createdEntity = entity; };

  await controller._createManualEntity('deployment');

  assert.equal(createdEntity.type, 'deployment');
  assert.equal(createdEntity.name, 'MES production');
  assert.deepEqual(createdEntity.details, {
    environment: 'production',
    version: 'v2.4.1',
    branch: 'release/2.4',
    revision: 'abcdef012345',
    status: 'running'
  });
  assert.equal(createdEntity.source, 'manual');
});

test('服务器详情从关系事实派生项目、仓库和部署版本上下文', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_project1', type: 'project', name: 'Alpha Project', refId: 'project_alpha01', details: {} },
      { id: 'entity_repo0001', type: 'repository', name: 'Repo A', refId: 'repo_alpha001', details: {} },
      {
        id: 'entity_deploy01',
        type: 'deployment',
        name: 'Alpha production',
        details: {
          environment: 'production',
          version: 'v2.4.1',
          branch: 'main',
          revision: 'abcdef012345',
          status: 'running'
        }
      },
      { id: 'entity_server01', type: 'server', name: 'Con01', details: {} }
    ],
    relationships: [
      { id: 'relationship_test0001', type: 'contains', sourceId: 'entity_project1', targetId: 'entity_repo0001' },
      { id: 'relationship_test0002', type: 'source_of', sourceId: 'entity_repo0001', targetId: 'entity_deploy01' },
      { id: 'relationship_test0003', type: 'runs_on', sourceId: 'entity_deploy01', targetId: 'entity_server01' }
    ],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'facts', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_project1', x: 0, y: 0 },
        { entityId: 'entity_repo0001', x: 300, y: 0 },
        { entityId: 'entity_deploy01', x: 600, y: 0 },
        { entityId: 'entity_server01', x: 900, y: 0 }
      ]
    }]
  };

  const context = controller._serverDeploymentContext('entity_server01');
  const html = controller._serverDeploymentContextHtml('entity_server01');

  assert.equal(context.length, 1);
  assert.equal(context[0].deployment.id, 'entity_deploy01');
  assert.deepEqual(context[0].repositories.map(entity => entity.id), ['entity_repo0001']);
  assert.deepEqual(context[0].projects.map(entity => entity.id), ['entity_project1']);
  assert.equal(context[0].versionContext, 'production · v2.4.1 · main · abcdef012345 · running');
  assert.match(html, /关联部署/);
  assert.match(html, /Alpha Project/);
  assert.match(html, /Repo A/);
  assert.match(html, /production · v2\.4\.1 · main · abcdef012345 · running/);
  assert.match(html, /data-relationship-locate-entity="entity_deploy01"/);
});

test('服务器关联部署可清除摘要和筛选后定位当前白板节点', () => {
  const notifications = [];
  const controller = new Controller({
    bridge: {},
    notify: (message, type) => notifications.push({ message, type })
  });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_deploy01', type: 'deployment', name: 'Production', details: {} },
      { id: 'entity_server01', type: 'server', name: 'Con01', details: {} }
    ],
    relationships: [{
      id: 'relationship_test0001',
      type: 'runs_on',
      sourceId: 'entity_deploy01',
      targetId: 'entity_server01'
    }],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: {
        mode: 'compact',
        projection: 'deployment-summary',
        query: 'server',
        entityType: 'server',
        environment: 'production',
        verification: 'verified'
      },
      placements: [
        { entityId: 'entity_deploy01', x: 600, y: 100 },
        { entityId: 'entity_server01', x: 900, y: 100 }
      ]
    }]
  };
  controller.root = {
    querySelector: selector => selector === '.relationship-canvas'
      ? { getBoundingClientRect: () => ({ width: 1000, height: 600 }) }
      : null
  };
  controller._applyViewMode = () => {};
  controller._persistSoon = () => {};
  controller._renderGraph = () => {};
  controller._updateFilterSummary = () => {};
  controller._updateSummary = () => {};
  controller._setCanvasAnnouncement = () => {};

  assert.equal(controller._focusEntityOnBoard('entity_deploy01'), true);
  assert.deepEqual(controller.store.boards[0].view, {
    ...RelationshipGraphModel.defaultBoardView(),
    mode: 'compact',
    projection: 'facts'
  });
  assert.equal(controller.selectedEntityId, 'entity_deploy01');
  assert.equal(controller.store.boards[0].viewport.x, 500 - (600 + COMPACT_NODE_WIDTH / 2));
  assert.equal(controller.store.boards[0].viewport.y, 300 - (100 + COMPACT_NODE_HEIGHT / 2));
  assert.equal(notifications.length, 0);

  assert.equal(controller._focusEntityOnBoard('entity_missing1'), false);
  assert.match(notifications[0].message, /当前白板/);
  assert.equal(notifications[0].type, 'warning');
});

test('事实检查器显示自定义复核周期和默认周期说明', () => {
  const controller = new Controller({
    bridge: {},
    now: () => new Date('2026-08-28T12:00:00.000Z')
  });
  const htmlWithOverride = controller._factFieldsHtml({
    verifiedAt: '2026-08-20T12:00:00.000Z',
    reviewIntervalDays: 7
  });
  const htmlWithDefault = controller._factFieldsHtml({});

  assert.match(htmlWithOverride, /name="reviewIntervalDays"[^>]+value="7"/);
  assert.match(htmlWithOverride, /已超过 7 天复核周期/);
  assert.match(htmlWithDefault, /留空使用默认 30 天/);
});

test('白板筛选采用锚定弹层并在工具栏只保留一个入口', () => {
  assert.match(controllerSource, /class="relationship-filter-host"/);
  assert.match(controllerSource, /data-relationship-action="toggle-filter-menu"/);
  assert.match(controllerSource, /class="relationship-filter-popover" role="dialog"/);
  assert.match(controllerSource, /data-relationship-filter-form/);
  assert.match(controllerSource, /name="entityType"/);
  assert.match(controllerSource, /name="environment"/);
  assert.match(controllerSource, /name="verification"/);
  assert.match(controllerSource, /name="mode"/);
  assert.match(controllerSource, /name="projection"/);
  assert.match(relationshipCss, /\.relationship-filter-popover\s*\{[^}]*position:\s*absolute/s);
  assert.doesNotMatch(controllerSource, /data-relationship-action="filter-(project|repository|server)"/);
});

test('部署摘要从完整事实链派生并聚合同一项目到服务器的部署', () => {
  const controller = new Controller({
    bridge: {},
    now: () => new Date('2026-08-27T12:00:00.000Z')
  });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_project1', type: 'project', name: 'Alpha', refId: 'project_alpha01', details: {} },
      { id: 'entity_repo0001', type: 'repository', name: 'Repo A', refId: 'repo_alpha001', details: {} },
      { id: 'entity_repo0002', type: 'repository', name: 'Repo B', refId: 'repo_alpha002', details: {} },
      { id: 'entity_deploy01', type: 'deployment', name: 'Deploy A', details: { environment: 'production', version: 'v2.4.1' } },
      { id: 'entity_deploy02', type: 'deployment', name: 'Deploy B', details: { environment: 'staging', branch: 'develop', revision: 'abcdef012345' } },
      { id: 'entity_server01', type: 'server', name: 'Con01', details: {} }
    ],
    relationships: [
      { id: 'relationship_test0001', type: 'contains', sourceId: 'entity_project1', targetId: 'entity_repo0001' },
      { id: 'relationship_test0002', type: 'source_of', sourceId: 'entity_repo0001', targetId: 'entity_deploy01' },
      { id: 'relationship_test0003', type: 'runs_on', sourceId: 'entity_deploy01', targetId: 'entity_server01' },
      { id: 'relationship_test0004', type: 'contains', sourceId: 'entity_project1', targetId: 'entity_repo0002' },
      { id: 'relationship_test0005', type: 'source_of', sourceId: 'entity_repo0002', targetId: 'entity_deploy02' },
      { id: 'relationship_test0006', type: 'runs_on', sourceId: 'entity_deploy02', targetId: 'entity_server01' }
    ],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'deployment-summary', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_project1', x: 0, y: 0 },
        { entityId: 'entity_repo0001', x: 300, y: 0 },
        { entityId: 'entity_repo0002', x: 300, y: 160 },
        { entityId: 'entity_deploy01', x: 600, y: 0 },
        { entityId: 'entity_deploy02', x: 600, y: 160 },
        { entityId: 'entity_server01', x: 900, y: 80 }
      ]
    }]
  };

  const entityCount = controller.store.entities.length;
  const relationshipCount = controller.store.relationships.length;
  const graph = controller._filteredGraph();

  assert.deepEqual(graph.placements.map(item => item.entityId), ['entity_project1', 'entity_server01']);
  assert.equal(graph.relationships.length, 0);
  assert.equal(graph.summaryRelationships.length, 1);
  assert.equal(graph.summaryRelationships[0].sourceId, 'entity_project1');
  assert.equal(graph.summaryRelationships[0].targetId, 'entity_server01');
  assert.equal(graph.summaryRelationships[0].count, 2);
  assert.equal(graph.summaryRelationships[0].label, '部署 ×2');
  assert.match(graph.summaryRelationships[0].title, /Deploy A · production · v2\.4\.1/);
  assert.match(graph.summaryRelationships[0].title, /Deploy B · staging · develop · abcdef012345/);
  assert.equal(controller.store.entities.length, entityCount);
  assert.equal(controller.store.relationships.length, relationshipCount);

  controller.store.boards[0].view.query = 'Deploy A';
  const filtered = controller._filteredGraph();
  assert.deepEqual([...filtered.directIds], ['entity_deploy01']);
  assert.deepEqual(filtered.placements.map(item => item.entityId), [
    'entity_project1',
    'entity_repo0001',
    'entity_repo0002',
    'entity_deploy01',
    'entity_deploy02',
    'entity_server01'
  ]);
  assert.deepEqual([...filtered.mutedIds], ['entity_project1', 'entity_repo0002', 'entity_deploy02']);
  assert.equal(filtered.summaryRelationships.length, 0);
});

test('部署摘要不会折叠带额外端点关系的中间事实链', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_project1', type: 'project', name: 'Alpha', refId: 'project_alpha01', details: {} },
      { id: 'entity_repo0001', type: 'repository', name: 'Repo', refId: 'repo_alpha001', details: {} },
      { id: 'entity_deploy01', type: 'deployment', name: 'Deploy', details: {} },
      { id: 'entity_server01', type: 'server', name: 'Con01', details: {} },
      { id: 'entity_endpoint1', type: 'endpoint', name: 'Public', details: {} }
    ],
    relationships: [
      { id: 'relationship_test0001', type: 'contains', sourceId: 'entity_project1', targetId: 'entity_repo0001' },
      { id: 'relationship_test0002', type: 'source_of', sourceId: 'entity_repo0001', targetId: 'entity_deploy01' },
      { id: 'relationship_test0003', type: 'runs_on', sourceId: 'entity_deploy01', targetId: 'entity_server01' },
      { id: 'relationship_test0004', type: 'exposes', sourceId: 'entity_deploy01', targetId: 'entity_endpoint1' }
    ],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'deployment-summary', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_project1', x: 0, y: 0 },
        { entityId: 'entity_repo0001', x: 300, y: 0 },
        { entityId: 'entity_deploy01', x: 600, y: 0 },
        { entityId: 'entity_server01', x: 900, y: 0 },
        { entityId: 'entity_endpoint1', x: 900, y: 180 }
      ]
    }]
  };

  const graph = controller._filteredGraph();
  assert.equal(graph.summaryRelationships.length, 0);
  assert.equal(graph.placements.length, 5);
  assert.equal(graph.relationships.length, 4);
});

test('部署摘要在界面中明确标记为不修改事实的派生显示', () => {
  assert.match(controllerSource, /部署摘要 · 派生显示，不修改关系事实/);
  assert.match(controllerSource, /class="relationship-edge relationship-edge-summary/);
  assert.match(relationshipCss, /\.relationship-edge-summary\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(relationshipCss, /\.relationship-edge-summary \.relationship-edge-line\s*\{[^}]*stroke-dasharray:/s);
});

test('框选只命中当前可见节点并使用当前节点尺寸', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_server01', type: 'server', name: 'One', details: {} },
      { id: 'entity_server02', type: 'server', name: 'Two', details: {} },
      { id: 'entity_server03', type: 'server', name: 'Three', details: {} }
    ],
    relationships: [],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'facts', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_server01', x: 0, y: 0 },
        { entityId: 'entity_server02', x: 300, y: 0 },
        { entityId: 'entity_server03', x: 0, y: 200 }
      ]
    }]
  };

  assert.deepEqual(controller._selectionBoxEntityIds(-10, -10, 250, 110), ['entity_server01']);
  assert.deepEqual(controller._selectionBoxEntityIds(550, 110, -10, -10), ['entity_server01', 'entity_server02']);
});

test('多选节点可成组拖动并保持相对位置', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [],
    relationships: [],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'facts', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_server01', x: 0, y: 0 },
        { entityId: 'entity_server02', x: 300, y: 40 }
      ]
    }]
  };
  controller.root = { querySelector: selector => selector.startsWith('[data-entity-id=') ? { style: {} } : null };
  controller._clientToWorld = () => ({ x: 30, y: 25 });
  controller._updateEdges = () => {};
  controller.pointerAction = {
    type: 'node',
    pointerId: 7,
    entityId: 'entity_server01',
    entityIds: ['entity_server01', 'entity_server02'],
    origins: new Map([
      ['entity_server01', { x: 0, y: 0 }],
      ['entity_server02', { x: 300, y: 40 }]
    ]),
    pointX: 10,
    pointY: 5,
    moved: false
  };

  controller._handlePointerMove({ pointerId: 7 });

  assert.deepEqual(controller.store.boards[0].placements, [
    { entityId: 'entity_server01', x: 20, y: 20 },
    { entityId: 'entity_server02', x: 320, y: 60 }
  ]);
  assert.equal(controller.pointerAction.moved, true);
});

test('视觉分组边框包围成员并保留标题空间', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_group001', type: 'group', name: '生产链路', details: {} },
      { id: 'entity_server01', type: 'server', name: 'One', details: {} },
      { id: 'entity_server02', type: 'server', name: 'Two', details: {} }
    ],
    relationships: [],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'facts', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_group001', x: 20, y: 20 },
        { entityId: 'entity_server01', x: 100, y: 120, groupId: 'entity_group001' },
        { entityId: 'entity_server02', x: 420, y: 260, groupId: 'entity_group001' }
      ]
    }]
  };

  const geometry = controller._placementGeometry(controller.store.boards[0].placements[0]);

  assert.deepEqual(geometry, {
    x: 72,
    y: 66,
    width: 420 + NODE_WIDTH + 28 - 72,
    height: 260 + NODE_HEIGHT + 28 - 66
  });
});

test('拖动视觉分组会把当前白板中的成员一起移动', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_group001', type: 'group', name: '生产链路', details: {} },
      { id: 'entity_server01', type: 'server', name: 'One', details: {} },
      { id: 'entity_server02', type: 'server', name: 'Two', details: {} }
    ],
    relationships: [],
    boards: [{
      id: 'board_test0001', name: '测试', viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'facts', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_group001', x: 20, y: 20 },
        { entityId: 'entity_server01', x: 100, y: 120, groupId: 'entity_group001' },
        { entityId: 'entity_server02', x: 420, y: 260, groupId: 'entity_group001' }
      ]
    }]
  };

  assert.deepEqual(controller._movingEntityIds('entity_group001'), [
    'entity_group001',
    'entity_server01',
    'entity_server02'
  ]);
});

test('所选节点可归入和移出已有视觉分组且每次只产生一个撤销点', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_group001', type: 'group', name: '生产链路', details: {} },
      { id: 'entity_server01', type: 'server', name: 'One', details: {} },
      { id: 'entity_server02', type: 'server', name: 'Two', details: {} }
    ],
    relationships: [],
    boards: [{
      id: 'board_test0001', name: '测试', viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'facts', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_group001', x: 20, y: 20 },
        { entityId: 'entity_server01', x: 100, y: 120 },
        { entityId: 'entity_server02', x: 420, y: 260 }
      ]
    }]
  };
  controller._setEntitySelection(new Set(['entity_server01', 'entity_server02']), 'entity_server02');
  controller._persistSoon = () => {};
  controller._renderGraph = () => {};
  controller._refreshHistoryButtons = () => {};
  controller._updateSummary = () => {};

  assert.equal(controller._assignSelectionToGroup('entity_group001'), true);
  assert.equal(controller.undoStack.length, 1);
  assert.deepEqual(controller.store.boards[0].placements.slice(1).map(item => item.groupId), [
    'entity_group001',
    'entity_group001'
  ]);

  assert.equal(controller._removeSelectionFromGroups(), true);
  assert.equal(controller.undoStack.length, 2);
  assert.deepEqual(controller.store.boards[0].placements.slice(1).map(item => item.groupId), [undefined, undefined]);
});

test('删除视觉分组会安全解组但保留成员节点', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_group001', type: 'group', name: '生产链路', details: {} },
      { id: 'entity_server01', type: 'server', name: 'One', details: {} }
    ],
    relationships: [],
    boards: [{
      id: 'board_test0001', name: '测试', viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'facts', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_group001', x: 20, y: 20 },
        { entityId: 'entity_server01', x: 100, y: 120, groupId: 'entity_group001' }
      ]
    }]
  };
  controller._selectOnlyEntity('entity_group001');
  controller._persistSoon = () => {};
  controller._renderGraph = () => {};
  controller._refreshHistoryButtons = () => {};
  controller._updateSummary = () => {};

  controller._deleteSelection();

  assert.deepEqual(controller.store.boards[0].placements, [{ entityId: 'entity_server01', x: 100, y: 120 }]);
  assert.deepEqual(controller.store.entities.map(entity => entity.id), ['entity_server01']);
});

test('自动分组在工具栏和空白右键菜单都有明确入口，并复用 Coolify Projects 操作', () => {
  const { controller } = nestedGroupFixture();
  assert.match(controller._layoutMenuHtml(), /role="menuitem" data-relationship-action="arrange-by-coolify-projects"/);
  assert.match(controller._layoutMenuHtml(), /一次性初始化/);
  assert.doesNotMatch(controllerSource, /data-relationship-layout aria-label="整理操作"/);
  assert.ok(controller._contextMenuItems('canvas').some(item => item?.action === 'arrange-by-coolify-projects' && item.label === '初始化分组（Coolify Projects）'));
});

test('重复自动分组不增加节点或关系，并保留手工群组、卡片备注和显示别名', () => {
  const { controller } = nestedGroupFixture();
  controller.fitContent = () => {};
  const originalPlacements = structuredClone(controller.store.boards[0].placements);
  const originalEntities = structuredClone(controller.store.entities);
  controller._setPanelTopology({ state: 'ready', provider: { providerId: 'coolify_one' }, topology: {
    servers: [{ nodeId: 'host_one', name: '共享主机' }],
    deployments: [{ resourceUuid: 'app_one', nodeId: 'host_one', projectUuid: 'project_one', projectName: '生产', name: 'App', domains: ['https://app.example.com'] }]
  } });
  const card = controller.panelProjection.placements.find(item => controller.panelProjection.entities.find(entity => entity.id === item.entityId)?.type === 'deployment');
  card.titleMode = 'replace';
  card.titleText = '生产应用';
  card.note = '保留原有备注';
  controller._saveDynamicPlacementOverrides([card.entityId]);
  controller._arrangeByCoolifyProjects();
  const first = structuredClone(controller.panelProjection);
  controller._arrangeByCoolifyProjects();
  assert.deepEqual(controller.panelProjection, first);
  assert.deepEqual(controller.store.entities, originalEntities);
  assert.deepEqual(controller.store.boards[0].placements, originalPlacements);
  assert.equal(controller.panelProjection.placements.find(item => item.entityId === card.entityId).note, '保留原有备注');
  assert.equal(controller.panelProjection.placements.find(item => item.entityId === card.entityId).titleText, '生产应用');
});

test('无 Coolify 部署数据时自动分组给出提示且不改动布局或历史', () => {
  const { controller, notifications } = nestedGroupFixture();
  const previous = structuredClone(controller.store);
  assert.equal(controller._arrangeByCoolifyProjects(), false);
  assert.deepEqual(controller.store, previous);
  assert.equal(controller.undoStack.length, 0);
  assert.match(notifications.at(-1), /请先连接 Coolify/);
});

test('按 Coolify Projects 分组可保存和撤销，刷新保持手动移动且新节点自动归组', () => {
  const { controller } = nestedGroupFixture();
  controller.fitContent = () => {};
  const result = { state: 'ready', provider: { providerId: 'coolify_one' }, topology: { servers: [], deployments: [
    { resourceUuid: 'app_one', projectUuid: 'project_one', projectName: '生产', name: 'App', domains: [] }
  ] } };
  controller._setPanelTopology(result);
  assert.ok(!controller.panelProjection.entities.some(item => item.type === 'group'));
  assert.equal(controller._arrangeByCoolifyProjects(), true);
  const group = controller.panelProjection.entities.find(item => item.type === 'group');
  let card = controller.panelProjection.placements.find(item => item.groupId === group.id);
  const cardId = card.entityId;
  card.x = 777;
  controller._saveDynamicPlacementOverrides([cardId]);
  controller._setPanelTopology(result);
  card = controller.panelProjection.placements.find(item => item.entityId === cardId);
  assert.equal(card.x, 777);
  assert.equal(card.groupId, group.id);
  result.topology.deployments.push({ ...result.topology.deployments[0], resourceUuid: 'app_two' });
  controller._setPanelTopology(result);
  assert.equal(controller.panelProjection.placements.filter(item => item.groupId === group.id).length, 2);
  controller.undo();
  assert.ok(!controller.panelProjection.entities.some(item => item.type === 'group'));
  controller.redo();
  assert.equal(controller.store.boards[0].view.topologyLayout, 'coolify-projects');
  assert.ok(controller.panelProjection.entities.some(item => item.type === 'group'));
  const exported = controller._buildActiveBoardExportStore();
  assert.ok(exported.entities.some(item => item.type === 'group'));
  assert.equal(exported.boards[0].view.topologyLayout, 'coolify-projects');
});

test('筛选和保存重载不能将 Coolify Projects 分组退回默认分列', t => {
  const { controller } = nestedGroupFixture();
  controller.fitContent = controller._applyViewMode = controller._syncDisplayForm = controller._updateFilterSummary = () => {};
  const topology = { state: 'ready', provider: { providerId: 'coolify_one' }, topology: { deployments: [
    { resourceUuid: 'app_one', projectUuid: 'project_one', projectName: '生产', name: 'App', domains: [] }
  ] } };
  controller._setPanelTopology(topology);
  controller._arrangeByCoolifyProjects();
  const original = structuredClone(controller.panelProjection.placements);
  const NativeFormData = globalThis.FormData;
  t.after(() => { globalThis.FormData = NativeFormData; });
  globalThis.FormData = class { get(key) { return key === 'query' ? 'App' : ''; } getAll() { return []; } };
  controller._updateBoardViewFromForm({});
  assert.equal(controller.store.boards[0].view.topologyLayout, 'coolify-projects');
  const { RelationshipBoardService } = require('../src/main/services/relationshipBoardService');
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'gitfinder-group-filter-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  new RelationshipBoardService({ baseDirectory: directory }).save(controller.store);
  const restarted = nestedGroupFixture().controller;
  restarted.store = new RelationshipBoardService({ baseDirectory: directory }).load().store;
  restarted.dynamicLayoutStore = normalizeDynamicLayoutStore(structuredClone(controller.dynamicLayoutStore));
  restarted._setPanelTopology(topology);
  assert.deepEqual(restarted.panelProjection.placements, original);
  assert.equal(restarted.store.boards[0].view.query, 'App');
});

test('新白板默认 Coolify Projects 分组，旧白板规范化保留分列模式', async () => {
  const { controller } = nestedGroupFixture();
  controller._openFormDialog = async () => ({ name: '新白板' });
  await controller._createBoard();
  assert.equal(controller.store.boards.at(-1).view.topologyLayout, 'coolify-projects');
  const normalized = globalThis.RelationshipGraphModel.normalizeStore(nestedGroupFixture().controller.store).value;
  assert.equal(normalized.boards[0].view.topologyLayout, 'lanes');
});

test('拖动 Coolify 自动群组时包含动态成员，而不是只移动会重新计算的外框', () => {
  const { controller } = nestedGroupFixture();
  controller.fitContent = () => {};
  controller._setPanelTopology({ state: 'ready', provider: { providerId: 'coolify_one' }, topology: { deployments: [
    { resourceUuid: 'app_one', projectUuid: 'project_one', projectName: '生产', name: 'App', domains: ['https://app.example.com'] }
  ] } });
  controller._arrangeByCoolifyProjects();
  const group = controller.panelProjection.entities.find(entity => entity.type === 'group');
  const memberIds = controller.panelProjection.placements.filter(item => item.groupId === group.id).map(item => item.entityId);
  controller._selectOnlyEntity(group.id);
  assert.deepEqual(new Set(controller._movingEntityIds(group.id)), new Set([group.id, ...memberIds]));
  controller._setEntitySelection(new Set([group.id, memberIds[0]]));
  assert.equal(controller._movingEntityIds(group.id).length, memberIds.length + 1);
});

test('中心布局将手工嵌套群组作为整体移动，支持保存和撤销重做', () => {
  const { controller } = nestedGroupFixture();
  controller.fitContent = () => {};
  controller._selectOnlyEntity('entity_local002');
  const original = structuredClone(controller.store);
  assert.equal(controller._arrangeAround('selection-centered'), true);
  const placements = controller.store.boards[0].placements;
  const anchor = placements.find(item => item.entityId === 'entity_local002');
  assert.deepEqual({ x: anchor.x, y: anchor.y }, { x: 900, y: 100 });
  const dx = placements[0].x - original.boards[0].placements[0].x;
  const dy = placements[0].y - original.boards[0].placements[0].y;
  for (let index = 0; index < 3; index++) {
    assert.equal(placements[index].x - original.boards[0].placements[index].x, dx);
    assert.equal(placements[index].y - original.boards[0].placements[index].y, dy);
    assert.equal(placements[index].groupId, original.boards[0].placements[index].groupId);
  }
  const normalized = globalThis.RelationshipGraphModel.assertValidStore(controller.store);
  assert.equal(normalized.boards[0].view.topologyLayout, 'selection-centered');
  controller.undo();
  assert.deepEqual(controller.store.boards[0].placements, original.boards[0].placements);
  controller.redo();
  assert.equal(controller.store.boards[0].view.topologyLayout, 'selection-centered');
  assert.equal(controller._arrangeAround('server-centered'), true);
  assert.equal(globalThis.RelationshipGraphModel.assertValidStore(controller.store).boards[0].view.topologyLayout, 'server-centered');
});

test('中心布局缺少选择或主机时不更改当前白板', () => {
  const { controller, notifications } = nestedGroupFixture();
  const original = structuredClone(controller.store);
  assert.equal(controller._arrangeAround('selection-centered'), false);
  assert.match(notifications.at(-1), /请先选中/);
  assert.deepEqual(controller.store, original);
  controller.store.entities = controller.store.entities.map(entity => ({ ...entity, type: 'repository' }));
  assert.equal(controller._arrangeAround('server-centered'), false);
  assert.match(notifications.at(-1), /没有主机/);
  assert.equal(controller.undoStack.length, 0);
});

test('白板右键菜单按空白、卡片、群组和连线提供已有操作', () => {
  const { controller } = nestedGroupFixture();
  assert.ok(controller._contextMenuItems('canvas').some(item => item?.nodeType === 'server'));
  controller._selectOnlyEntity('entity_local001');
  let items = controller._contextMenuItems('node');
  assert.ok(items.some(item => item?.contextAction === 'rename'));
  assert.ok(items.some(item => item?.action === 'remove-selection-group'));
  assert.equal(items.find(item => item?.action === 'create-group-from-selection').disabled, true);
  controller._setEntitySelection(new Set(['entity_local001', 'entity_local002']));
  items = controller._contextMenuItems('node');
  assert.equal(items.find(item => item?.action === 'create-group-from-selection').disabled, false);
  assert.ok(!items.some(item => item?.contextAction === 'rename'));
  controller._selectOnlyEntity('entity_outer001');
  assert.ok(controller._contextMenuItems('node').some(item => item?.label === '解散群组（保留成员）'));
  controller._clearEntitySelection();
  controller.selectedRelationshipId = 'relation_manual';
  controller.store.relationships.push({ id: 'relation_manual', sourceId: 'entity_local001', targetId: 'entity_local002', type: 'depends-on' });
  assert.ok(controller._contextMenuItems('relationship').some(item => item?.action === 'reverse-relationship'));
});

test('动态节点及混合选择不提供部分删除，动态连线只允许查看', () => {
  const { controller } = nestedGroupFixture();
  for (const ids of [['entity_dynamic01'], ['entity_dynamic01', 'entity_local001']]) {
    controller._setEntitySelection(new Set(ids));
    assert.ok(!controller._contextMenuItems('node').some(item => item?.contextAction === 'delete'));
    assert.ok(controller._contextMenuItems('node').some(item => item?.contextAction === 'details'));
  }
  controller._clearEntitySelection();
  controller.selectedRelationshipId = 'relation_live';
  const items = controller._contextMenuItems('relationship');
  assert.ok(items.some(item => item?.label === '查看关系详情'));
  assert.ok(!items.some(item => item?.contextAction === 'delete' || item?.action === 'reverse-relationship'));
});

test('右键已选节点保留多选，右键其他节点切换选择，菜单约束在视口内', () => {
  const { controller } = nestedGroupFixture();
  const menu = { hidden: true, style: {}, offsetWidth: 230, offsetHeight: 360, querySelector: () => ({ focus() {} }) };
  controller.root = { ownerDocument: { defaultView: { innerWidth: 800, innerHeight: 600 } }, querySelector: selector => selector === '.relationship-context-menu' ? menu : null };
  controller._updateSelectionCss = () => {};
  controller._clientToWorld = (x, y) => ({ x: x / 2, y: y / 2 });
  const eventFor = id => ({ clientX: 790, clientY: 590,
    target: { closest: selector => selector === '.relationship-canvas' ? {} : selector === '.relationship-node' && id ? { dataset: { entityId: id } } : null },
    preventDefault() {}, stopPropagation() {}
  });
  controller._setEntitySelection(new Set(['entity_local001', 'entity_local002']));
  controller._handleContextMenu(eventFor('entity_local001'));
  assert.equal(controller._entitySelectionIds().size, 2);
  assert.equal(menu.style.left, '562px');
  assert.equal(menu.style.top, '232px');
  assert.deepEqual(controller.contextMenuPoint, { x: 395, y: 295 });
  controller._handleContextMenu(eventFor('entity_dynamic01'));
  assert.deepEqual([...controller._entitySelectionIds()], ['entity_dynamic01']);
  controller._handleContextMenu(eventFor(null));
  assert.equal(controller._entitySelectionIds().size, 0);
  assert.match(menu.innerHTML, /添加群组/);
});

test('右键输入区保留原生文字菜单，菜单外点击与窗口失焦会关闭', () => {
  const { controller } = nestedGroupFixture();
  let prevented = false;
  controller._handleContextMenu({ target: { closest: () => ({}) }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  const menu = { hidden: false };
  controller.root = { querySelector: selector => selector === '.relationship-context-menu' ? menu : null };
  controller._boundContextDismiss({ target: { closest: () => ({}) } });
  assert.equal(menu.hidden, false);
  controller._boundContextDismiss({ target: { closest: () => null } });
  assert.equal(menu.hidden, true);
  menu.hidden = false;
  controller._boundBlur();
  assert.equal(menu.hidden, true);
});

test('右键菜单上下键移动焦点，Escape 只关闭菜单而不清空选择或移动白板', () => {
  const { controller } = nestedGroupFixture();
  const document = { activeElement: null };
  let canvasFocused = false;
  const buttons = [0, 1, 2].map(index => ({ focus: () => { document.activeElement = buttons[index]; } }));
  const menu = { hidden: false, querySelectorAll: () => buttons };
  controller.root = { isConnected: true, ownerDocument: document, querySelector: selector => selector === '.relationship-context-menu' ? menu : { focus: () => { canvasFocused = true; } } };
  controller._selectOnlyEntity('entity_local001');
  document.activeElement = buttons[0];
  const key = value => controller._handleKeydown({ key: value, preventDefault() {}, stopImmediatePropagation() {} });
  key('ArrowDown');
  assert.equal(document.activeElement, buttons[1]);
  key('Home');
  assert.equal(document.activeElement, buttons[0]);
  key('ArrowUp');
  assert.equal(document.activeElement, buttons[2]);
  key('Delete');
  assert.ok(controller.store.entities.some(item => item.id === 'entity_local001'));
  key('Escape');
  assert.equal(menu.hidden, true);
  assert.equal(canvasFocused, true);
  assert.equal(controller.selectedEntityId, 'entity_local001');
  assert.deepEqual(controller.store.boards[0].viewport, { x: 0, y: 0, zoom: 1 });
});

test('菜单展开仅作用于所选卡片，全选不包含筛选隐藏项', () => {
  const { controller } = nestedGroupFixture();
  controller._setEntitySelection(new Set(['entity_local001', 'entity_dynamic01', 'entity_outer001']));
  controller._runContextAction('details');
  assert.deepEqual([...controller.expandedCardIds], ['entity_local001', 'entity_dynamic01']);
  controller._runContextAction('details');
  assert.equal(controller.expandedCardIds.size, 0);
  controller._updateSelectionCss = () => {};
  controller._filteredGraph = () => ({ placements: [{ entityId: 'entity_local002' }] });
  controller._runContextAction('select-all');
  assert.deepEqual([...controller._entitySelectionIds()], ['entity_local002']);
});

test('属性与重命名命令展开已折叠详情，保留停靠侧与未保存输入', () => {
  for (const action of ['inspector', 'rename', 'annotations']) {
    const { controller } = nestedGroupFixture();
    controller._selectOnlyEntity('entity_outer001');
    controller.panelLayout.inspector = { side: 'left', order: 3, collapsed: true };
    const calls = [];
    const field = { closest: () => null, scrollIntoView: () => calls.push('scroll'), focus: () => calls.push('focus') };
    const panel = { querySelector: selector => { calls.push(selector); return field; } };
    controller._panelElement = () => panel;
    controller._closeContextMenu = () => {};
    controller._updateSelectionCss = options => assert.equal(options.preserveDirtyInspector, true);
    controller._placePanelComponents = () => calls.push('place');
    controller._savePanelLayout = () => calls.push('save-layout');
    const before = JSON.stringify(controller.store);
    controller._runContextAction(action);
    assert.deepEqual(controller.panelLayout.inspector, { side: 'left', order: 3, collapsed: false });
    assert.ok(calls.includes('place'));
    assert.ok(calls.includes('focus'));
    assert.equal(JSON.stringify(controller.store), before);
  }
});

test('空白右键添加节点使用点击处的世界坐标，菜单不随画布缩放或筛选变淡', async () => {
  const { controller } = nestedGroupFixture();
  controller._openFormDialog = async () => ({ name: '右键主机' });
  await controller._createManualEntity('server', { x: 720, y: 440 });
  assert.equal(controller.store.boards[0].placements.at(-1).x, 720);
  assert.equal(controller.store.boards[0].placements.at(-1).y, 440);
  assert.match(relationshipCss, /\.relationship-context-menu\s*\{[^}]*position: fixed;[^}]*z-index: 1000;[^}]*background: var\(--bg-primary\)/s);
  assert.match(controllerSource, /<aside class="relationship-inspector-panel relationship-dock-component"[^]*?<\/div>\s*<div class="relationship-context-menu"/);
  assert.match(relationshipCss, /\.relationship-edge-layer\s*\{[^}]*z-index: 1/s);
  assert.match(relationshipCss, /\.relationship-edge text\s*\{[^}]*pointer-events: all/s);
});

function nestedGroupFixture() {
  const notifications = [];
  const controller = new Controller({ bridge: {}, notify: message => notifications.push(message) });
  controller.store = {
    schemaVersion: 1, activeBoardId: 'board_groups001', relationships: [],
    entities: [
      { id: 'entity_outer001', type: 'group', name: '生产', details: {} },
      { id: 'entity_inner001', type: 'group', name: '服务', details: {} },
      { id: 'entity_local001', type: 'server', name: '本地', details: {} },
      { id: 'entity_local002', type: 'server', name: '待归组', details: {} }
    ],
    boards: [{ id: 'board_groups001', name: '群组测试', viewport: { x: 0, y: 0, zoom: 1 }, placements: [
      { entityId: 'entity_outer001', x: 0, y: 0, groupBackground: '#eab308', groupBorder: '#ef4444' },
      { entityId: 'entity_inner001', x: 40, y: 50, groupId: 'entity_outer001' },
      { entityId: 'entity_local001', x: 100, y: 150, groupId: 'entity_inner001' },
      { entityId: 'entity_local002', x: 900, y: 100 }
    ] }]
  };
  controller.panelProjection = {
    entities: [{ id: 'entity_dynamic01', type: 'deployment', name: 'Coolify 部署', transient: true, details: {} }], relationships: [],
    placements: [{ entityId: 'entity_dynamic01', x: 100, y: 420, dynamic: true }]
  };
  controller._persistSoon = controller._persistDynamicLayoutsSoon = controller._renderGraph = controller.render = () => {};
  controller._refreshHistoryButtons = controller._updateSummary = () => {};
  return { controller, notifications };
}

test('群组自动排列使用显示间距，关闭后固定位置，手动尺寸不挪动成员', () => {
  const { controller: c } = nestedGroupFixture();
  const board = c.store.boards[0];
  const group = board.placements[1];
  board.placements[3].groupId = group.entityId;
  board.placements[3].y = board.placements[2].y;
  Object.assign(group, { groupWidth: 800, groupHeight: 500, groupLayout: 'auto' });
  board.view = { horizontalSpacing: 60, verticalSpacing: 80 };
  let geometry = c._displayGeometryMap(c._combinedPlacements());
  const a = geometry.get('entity_local001'), b = geometry.get('entity_local002');
  assert.equal(b.x - a.x - a.width, 60);
  assert.equal(a.y, b.y);
  group.groupWidth = 400;
  geometry = c._displayGeometryMap(c._combinedPlacements());
  assert.equal(geometry.get('entity_local002').y - geometry.get('entity_local001').y - a.height, 80);
  c._toggleGroupLayout(group.entityId);
  assert.equal(group.groupLayout, 'manual');
  const positions = board.placements.map(item => [item.x, item.y]);
  board.view.verticalSpacing = 120;
  group.groupWidth = 900; group.groupHeight = 900;
  geometry = c._displayGeometryMap(c._combinedPlacements());
  assert.deepEqual(board.placements.map(item => [item.x, item.y]), positions);
  assert.equal(geometry.get(group.entityId).width, 900);
  assert.equal(geometry.get('entity_local002').y, board.placements[3].y);
});

test('组内自动排列按拓扑而非存储顺序，并将嵌套成员关系提升到群组单位', () => {
  const { controller: c } = nestedGroupFixture();
  const placements = c.store.boards[0].placements;
  c.store.relationships = [{ id: 'relationship_order001', sourceId: 'entity_local002', targetId: 'entity_local001', type: 'related_to' }];
  const ordered = c._orderedLayoutItems([placements[0], placements[3]], c._combinedPlacements());
  assert.deepEqual(ordered.map(item => item.entityId), ['entity_local002', 'entity_outer001']);
  placements[3].groupId = 'entity_inner001';
  Object.assign(placements[1], { groupLayout: 'auto', groupWidth: 800 });
  const before = JSON.stringify(placements);
  const geometry = c._displayGeometryMap(c._combinedPlacements());
  assert.ok(geometry.get('entity_local002').x < geometry.get('entity_local001').x);
  assert.equal(JSON.stringify(placements), before, '几何测量不改动保存坐标');
});

test('拖动无关卡片复用连线，障碍进入路径后重新避让', () => {
  const { controller: c } = nestedGroupFixture();
  const edge = { sourceId: 'entity_local001', targetId: 'entity_local002' };
  const boxes = new Map([['entity_local001', { x: 0, y: 0, width: 280, height: 167 }],
    ['entity_local002', { x: 800, y: 0, width: 280, height: 167 }],
    ['entity_dynamic01', { x: 0, y: 1000, width: 280, height: 167 }]]);
  const route = c._edgeGeometry(edge, null, boxes);
  const distant = new Map(boxes); distant.set('entity_dynamic01', { x: 20, y: 1000, width: 280, height: 167 });
  assert.equal(c._edgeGeometry(edge, null, distant), route);
  const blocking = new Map(distant); blocking.set('entity_dynamic01', { x: 400, y: 0, width: 280, height: 167 });
  const changed = c._edgeGeometry(edge, null, blocking);
  assert.notEqual(changed.path, route.path);
  assert.equal(changed.obstructed, false);
});

test('动态群组排列设置、尺寸与导出保留，锁定成员不被自动移动', () => {
  const { controller: c, notifications } = nestedGroupFixture();
  c.panelProjection.entities.push({ id: 'entity_livegroup', type: 'group', name: '在线分组', details: {}, transient: true });
  c.panelProjection.placements.push({ entityId: 'entity_livegroup', dynamic: true, x: 0, y: 0, groupLayout: 'auto', groupWidth: 700, groupHeight: 600 });
  c.panelProjection.placements[0].groupId = 'entity_livegroup';
  c._saveDynamicPlacementOverrides(['entity_livegroup']);
  c._applyDynamicLayoutOverrides();
  const saved = c.panelProjection.placements.find(p => p.entityId === 'entity_livegroup');
  assert.equal(saved.groupLayout, 'auto'); assert.equal(saved.groupWidth, 700); assert.equal(saved.groupHeight, 600);
  assert.equal(c._buildActiveBoardExportStore().boards[0].placements.find(p => p.entityId === 'entity_livegroup').groupWidth, 700);
  c.store.boards[0].placements[2].locked = true;
  c._toggleGroupLayout('entity_inner001');
  assert.notEqual(c.store.boards[0].placements[1].groupLayout, 'auto');
  assert.match(notifications.at(-1), /锁定/);
});

test('筛选隐藏自动群组成员不重新排位或收缩边框', () => {
  const { controller: c } = nestedGroupFixture();
  const board = c.store.boards[0];
  Object.assign(board.placements[1], { groupLayout: 'auto', groupWidth: 400, groupHeight: 180 });
  board.placements[3].groupId = 'entity_inner001';
  c._boardView();
  const before = c._historySnapshot();
  const full = c._displayGeometryMap(c._combinedPlacements());
  const visible = c._displayGeometryMap(c._combinedPlacements().filter(p => p.entityId !== 'entity_local001'));
  assert.deepEqual(visible.get('entity_local002'), full.get('entity_local002'));
  assert.deepEqual(visible.get('entity_inner001'), full.get('entity_inner001'));
  assert.equal(visible.has('entity_local001'), false);
  assert.equal(c._historySnapshot(), before);
});

test('群组拖拽尺寸按缩放换算，保留手动成员，限制最小边界并支持撤销和取消', () => {
  const { controller: c } = nestedGroupFixture();
  c.store.boards[0].viewport = { x: 0, y: 0, zoom: 0.5 };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {}, classList: { remove() {} } };
  c.root = { querySelector: selector => selector === '.relationship-canvas' ? canvas : null, querySelectorAll: () => [], classList: { remove() {} } };
  for (const method of ['_stopWheelPan', '_clearSnapGuides', '_showGroupDropTarget', '_removeTemporaryEdge', '_hideSelectionBox', '_updateMinimap', '_positionSelectionToolbar']) c[method] = () => {};
  const target = { closest: selector => selector === '.relationship-canvas' ? canvas : selector === '[data-resize-group]' ? { dataset: { resizeGroup: 'entity_inner001' } } : null };
  const down = { target, pointerId: 10, button: 0, clientX: 250, clientY: 250, preventDefault() {} };
  c._boardView();
  const before = c._historySnapshot();
  const assertRestored = () => {
    const saved = JSON.parse(before);
    assert.deepEqual(c.store, saved.store);
    assert.deepEqual(c.panelProjection.placements, saved.dynamicPlacements);
    assert.deepEqual(normalizeDynamicLayoutStore(c.dynamicLayoutStore), normalizeDynamicLayoutStore(saved.dynamicLayouts));
  };
  c._handlePointerDown(down);
  const { width, height, minWidth, minHeight } = c.pointerAction;
  const member = { ...c.store.boards[0].placements[2] };
  c._handlePointerMove({ pointerId: 10, clientX: 300, clientY: 290 });
  assert.equal(c.store.boards[0].placements[1].groupWidth, width + 100);
  assert.equal(c.store.boards[0].placements[1].groupHeight, height + 80);
  assert.deepEqual(c.store.boards[0].placements[2], member);
  c._handlePointerMove({ pointerId: 10, clientX: -1000, clientY: -1000 });
  assert.equal(c.store.boards[0].placements[1].groupWidth, Math.round(minWidth));
  assert.equal(c.store.boards[0].placements[1].groupHeight, Math.round(minHeight));
  c._handlePointerUp({ pointerId: 10 });
  assert.equal(c.undoStack.length, 1);
  c.undo();
  assertRestored();
  c._handlePointerDown(down);
  c._handlePointerMove({ pointerId: 10, clientX: 300, clientY: 290 });
  c._cancelPointerAction();
  assertRestored();
  c._handlePointerDown(down);
  c._handlePointerUp({ pointerId: 10 });
  assertRestored();
});

test('嵌套群组递归包围并移动所有成员，父子同时选中也只移动一次', () => {
  const { controller } = nestedGroupFixture();
  controller.panelProjection.placements[0].groupId = 'entity_inner001';
  controller._setEntitySelection(new Set(['entity_outer001', 'entity_inner001', 'entity_local001']), 'entity_outer001');
  assert.deepEqual(controller._selectedMemberPlacements().map(item => item.entityId), ['entity_outer001']);
  const moving = controller._movingEntityIds('entity_outer001');
  assert.equal(new Set(moving).size, 4);
  assert.equal(moving.length, 4);
  assert.ok(moving.includes('entity_dynamic01'));
  const outer = controller._placementGeometry(controller._placementForEntity('entity_outer001'));
  const inner = controller._placementGeometry(controller._placementForEntity('entity_inner001'));
  assert.ok(outer.x < inner.x && outer.y < inner.y);
  assert.ok(outer.x + outer.width > inner.x + inner.width);
  assert.ok(outer.y + outer.height > inner.y + inner.height);
  const geometries = controller._displayGeometryMap(controller._combinedPlacements());
  geometries.get('entity_dynamic01').height += 400;
  const expanded = controller._placementGeometry(controller._placementForEntity('entity_outer001'), controller._combinedPlacements(), new Set(), geometries);
  assert.ok(expanded.height >= outer.height + 400);
});

test('本地与 Coolify 卡片可一起成组，刷新、撤销和重做保留正确成员关系', async () => {
  const { controller } = nestedGroupFixture();
  controller._openFormDialog = async () => ({ name: '新服务群组' });
  controller._setEntitySelection(new Set(['entity_local002', 'entity_dynamic01']), 'entity_dynamic01');
  assert.equal(await controller._createGroupFromSelection(), true);
  const groupId = controller.selectedEntityId;
  assert.equal(controller._placementForEntity('entity_local002').groupId, groupId);
  assert.equal(controller.dynamicLayoutStore.boards.board_groups001.entity_dynamic01.groupId, groupId);
  delete controller.panelProjection.placements[0].groupId;
  controller._applyDynamicLayoutOverrides();
  assert.equal(controller._placementForEntity('entity_dynamic01').groupId, groupId);
  assert.equal(controller.undoStack.length, 1);
  controller.undo();
  assert.equal(controller._placementForEntity('entity_dynamic01').groupId, undefined);
  assert.equal(controller._placementForEntity('entity_local002').groupId, undefined);
  controller.redo();
  assert.equal(controller._placementForEntity('entity_dynamic01').groupId, groupId);
  assert.equal(controller._placementForEntity('entity_local002').groupId, groupId);
});

test('群组拒绝循环，拖入重叠嵌套区域时选最内层，拖出可解除归属', () => {
  const { controller, notifications } = nestedGroupFixture();
  controller._selectOnlyEntity('entity_outer001');
  assert.equal(controller._assignSelectionToGroup('entity_inner001'), false);
  assert.match(notifications.at(-1), /自己的子群组/);
  assert.equal(controller.undoStack.length, 0);
  assert.deepEqual(controller._groupDropTargets(controller._movingEntityIds('entity_outer001')), []);
  const action = { groupMemberIds: ['entity_local002'], groupTargets: controller._groupDropTargets(['entity_local002']) };
  action.groupDropId = controller._groupDropTarget(action, { x: 110, y: 160 });
  assert.equal(action.groupDropId, 'entity_inner001');
  assert.equal(controller._applyGroupDrop(action), true);
  assert.equal(controller._placementForEntity('entity_local002').groupId, 'entity_inner001');
  controller._placementForEntity('entity_local002').x = 2000;
  action.groupDropId = controller._groupDropTarget(action, { x: 2010, y: 160 });
  assert.equal(action.groupDropId, '');
  assert.equal(controller._applyGroupDrop(action), true);
  assert.equal(controller._placementForEntity('entity_local002').groupId, undefined);
});

test('拖动成员时目标群组保持原边界，不跟着卡片扩张导致无法拖出', () => {
  const { controller } = nestedGroupFixture();
  const frames = new Map(['entity_outer001', 'entity_inner001'].map(id => [id, { style: {} }]));
  controller.root = { querySelector: selector => frames.get(selector.match(/data-entity-id="([^"]+)"/)?.[1]) || null };
  const targets = controller._groupDropTargets(['entity_local001']);
  controller.pointerAction = { type: 'node', groupTargets: targets };
  controller._placementForEntity('entity_local001').x = 2000;
  controller._updateGroupFrames();
  const original = targets.find(item => item.id === 'entity_inner001');
  assert.equal(frames.get('entity_inner001').style.transform, `translate(${original.x}px,${original.y}px)`);
  controller.pointerAction = null;
  controller._updateGroupFrames();
  assert.notEqual(frames.get('entity_inner001').style.transform, `translate(${original.x}px,${original.y}px)`);
});

test('组内框选结束后忽略随后的背景点击，保留多选而不改选父群组', () => {
  const { controller } = nestedGroupFixture();
  controller.root = { querySelector: () => null };
  controller._hideSelectionBox = controller._updateSelectionCss = () => {};
  controller.pointerAction = { type: 'box', pointerId: 7, moved: true };
  controller._setEntitySelection(new Set(['entity_local001', 'entity_local002']), 'entity_local002');
  controller._handlePointerUp({ pointerId: 7 });
  assert.equal(controller.suppressNextNodeClick, true);
  assert.equal(controller._entitySelectionIds().size, 2);
  assert.equal(controller.pointerAction, null);
});

test('框选组内卡片不会顺带选中未完整包围的父群组', () => {
  const { controller } = nestedGroupFixture();
  assert.deepEqual(controller._selectionBoxEntityIds(99, 149, 150, 180), ['entity_local001']);
  const all = controller._selectionBoxEntityIds(-100, -100, 1500, 1000);
  assert.ok(all.includes('entity_outer001') && all.includes('entity_inner001'));
});

test('删除外层群组保留子群组和动态成员，撤销可恢复归属', () => {
  const { controller } = nestedGroupFixture();
  controller.panelProjection.placements[0].groupId = 'entity_outer001';
  controller._saveDynamicPlacementOverrides(['entity_dynamic01']);
  controller._selectOnlyEntity('entity_outer001');
  controller._deleteSelection();
  assert.equal(controller._placementForEntity('entity_inner001').groupId, undefined);
  assert.equal(controller._placementForEntity('entity_dynamic01').groupId, undefined);
  assert.equal(controller.dynamicLayoutStore.boards.board_groups001.entity_dynamic01.groupId, undefined);
  assert.equal(controller._placementForEntity('entity_local001').groupId, 'entity_inner001');
  controller.undo();
  assert.equal(controller._placementForEntity('entity_inner001').groupId, 'entity_outer001');
  assert.equal(controller._placementForEntity('entity_dynamic01').groupId, 'entity_outer001');
});

test('白板导出包含嵌套群组配色和动态卡片成员身份', () => {
  const { controller } = nestedGroupFixture();
  controller.panelProjection.placements[0].groupId = 'entity_inner001';
  const exported = controller._buildActiveBoardExportStore();
  const placements = exported.boards[0].placements;
  assert.equal(placements.find(item => item.entityId === 'entity_outer001').groupBackground, '#eab308');
  assert.equal(placements.find(item => item.entityId === 'entity_outer001').groupBorder, '#ef4444');
  assert.equal(placements.find(item => item.entityId === 'entity_inner001').groupId, 'entity_outer001');
  assert.equal(placements.find(item => item.entityId === 'entity_dynamic01').groupId, 'entity_inner001');
});

test('群组编辑器提供命名配色与无环上级选择，选中项使用明确描边', () => {
  const { controller } = nestedGroupFixture();
  const editor = controller._groupAppearanceEditorHtml('entity_outer001');
  assert.match(editor, /name="groupBackground" value="#eab308"/);
  assert.match(editor, /name="groupBorder" value="#ef4444"/);
  assert.doesNotMatch(editor, /value="entity_inner001"/);
  assert.match(relationshipCss, /\.relationship-node\.selected \.relationship-card-surface\s*\{\s*outline: 2px solid/);
  assert.match(relationshipCss, /\.relationship-group-frame\.selected\s*\{\s*outline: 2px solid/);
});

test('多选节点按一次删除形成一个可撤销操作', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_project1', type: 'project', name: 'Project', refId: 'project_alpha01', details: {} },
      { id: 'entity_repo0001', type: 'repository', name: 'Repo', refId: 'repo_alpha001', details: {} },
      { id: 'entity_server01', type: 'server', name: 'Server', details: {} }
    ],
    relationships: [{
      id: 'relationship_test0001',
      type: 'contains',
      sourceId: 'entity_project1',
      targetId: 'entity_repo0001'
    }],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'facts', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_project1', x: 0, y: 0 },
        { entityId: 'entity_repo0001', x: 300, y: 0 },
        { entityId: 'entity_server01', x: 600, y: 0 }
      ]
    }]
  };
  controller._setEntitySelection(new Set(['entity_project1', 'entity_repo0001']), 'entity_repo0001');
  controller._persistSoon = () => {};
  controller._renderGraph = () => {};
  controller._refreshHistoryButtons = () => {};
  controller._updateSummary = () => {};

  controller._deleteSelection();

  assert.deepEqual(controller.store.entities.map(entity => entity.id), ['entity_server01']);
  assert.equal(controller.store.relationships.length, 0);
  assert.deepEqual(controller.store.boards[0].placements.map(item => item.entityId), ['entity_server01']);
  assert.equal(controller.undoStack.length, 1);
  assert.equal(controller._entitySelectionIds().size, 0);
});

test('多选节点使用 Alt 加方向键同步微调，不移动视图', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [],
    relationships: [],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', projection: 'facts', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_server01', x: 0, y: 0 },
        { entityId: 'entity_server02', x: 300, y: 40 }
      ]
    }]
  };
  controller.root = { isConnected: true, querySelector: () => null };
  controller._setEntitySelection(new Set(['entity_server01', 'entity_server02']), 'entity_server02');
  controller._persistSoon = () => {};
  controller._renderGraph = () => {};
  controller._refreshHistoryButtons = () => {};
  controller._updateSummary = () => {};
  let prevented = false;

  controller._handleKeydown({
    key: 'ArrowRight',
    shiftKey: true,
    altKey: true,
    metaKey: false,
    ctrlKey: false,
    target: { closest: selector => selector === '.relationship-canvas' ? {} : null },
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation() {}
  });

  assert.equal(prevented, true);
  assert.deepEqual(controller.store.boards[0].placements, [
    { entityId: 'entity_server01', x: 24, y: 0 },
    { entityId: 'entity_server02', x: 324, y: 40 }
  ]);
  assert.equal(controller.undoStack.length, 1);
  assert.deepEqual(controller.store.boards[0].viewport, { x: 0, y: 0, zoom: 1 });
});

function keyboardPanFixture() {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    activeBoardId: 'board_keyboard01', entities: [], relationships: [],
    boards: [{ id: 'board_keyboard01', viewport: { x: 0, y: 0, zoom: 0.5 }, placements: [{ entityId: 'entity_one', x: 100, y: 200 }] }]
  };
  const world = { style: {} };
  const grid = {};
  const canvas = {
    style: { setProperty: (key, value) => { grid[key] = value; } },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 })
  };
  controller.root = { isConnected: true, querySelector: selector => ({ '.relationship-world': world, '.relationship-canvas': canvas }[selector] || null) };
  controller._persistSoon = delay => { controller.persistDelay = delay; };
  controller._setEntitySelection(new Set(['entity_one']), 'entity_one');
  const key = (value, overrides = {}) => {
    let handled = false;
    let stopped = false;
    controller._handleKeydown({
      key: value, target: { closest: selector => selector === '.relationship-canvas' ? canvas : null },
      preventDefault: () => { handled = true; }, stopImmediatePropagation: () => { stopped = true; }, ...overrides
    });
    return { handled, stopped };
  };
  return { controller, key, world, grid, viewport: controller.store.boards[0].viewport };
}

test('群组标题反向补偿画布缩放，字号固定且不修改群组坐标', () => {
  const { controller, grid, world, viewport } = keyboardPanFixture();
  const placements = JSON.stringify(controller.store.boards[0].placements);
  for (const zoom of [0.25, 0.5, 1, 1.5, 2.5]) {
    viewport.zoom = zoom;
    controller._applyViewport();
    assert.equal(Number(grid['--relationship-viewport-zoom']), zoom);
    assert.equal(Number(grid['--relationship-inverse-zoom']) * zoom, 1);
    assert.equal(world.style.transform, `translate(0px,0px) scale(${zoom})`);
  }
  assert.equal(JSON.stringify(controller.store.boards[0].placements), placements);
  assert.match(relationshipCss, /\.relationship-group-frame \.relationship-node-header\s*\{[^}]*transform: scale\(var\(--relationship-inverse-zoom, 1\)\)/s);
  assert.match(relationshipCss, /\.relationship-group-frame \.relationship-node-header\s*\{[^}]*transform-origin: left bottom/s);
});

test('资源库使用平整侧栏标题和可旋转折叠箭头，移动控件保留', () => {
  assert.match(controllerSource, /class="relationship-resource-library-trigger"[^>]*data-panel-collapse="library"/);
  assert.match(controllerSource, /class="relationship-library-disclosure" aria-hidden="true">▼/);
  assert.doesNotMatch(controllerSource, /<strong>资源库<\/strong>/);
  assert.match(relationshipCss, /\.relationship-resource-library-trigger\[aria-expanded="false"\] \.relationship-library-disclosure\s*\{[^}]*rotate\(-90deg\)/s);
  assert.match(relationshipCss, /\.relationship-panel-dock > \.relationship-resource-panel\s*\{[^}]*border: 0/s);
  assert.match(controllerSource, /_panelMoveControls\('library', '资源库'\)/);
});

test('WASD 和方向键平移视图，即使选中卡片也不修改节点坐标', () => {
  const { controller, key, world, grid, viewport } = keyboardPanFixture();
  for (const [value, x, y] of [['w', 0, 40], ['s', 0, -40], ['a', 40, 0], ['d', -40, 0], ['ArrowUp', 0, 40], ['ArrowDown', 0, -40], ['ArrowLeft', 40, 0], ['ArrowRight', -40, 0]]) {
    viewport.x = viewport.y = 0;
    assert.deepEqual(key(value), { handled: true, stopped: true });
    assert.equal(viewport.x, x);
    assert.equal(viewport.y, y);
    assert.equal(world.style.transform, `translate(${x}px,${y}px) scale(0.5)`);
    assert.equal(grid['--relationship-grid-x'], `${x}px`);
    assert.equal(grid['--relationship-grid-y'], `${y}px`);
  }
  assert.deepEqual(controller.store.boards[0].placements, [{ entityId: 'entity_one', x: 100, y: 200 }]);
  assert.equal(controller.undoStack.length, 0);
  assert.equal(controller.persistDelay, 220);
});

test('键盘平移支持 Shift 加速和按住重复，在所有缩放下保持相同屏幕步长', () => {
  const { controller, key, viewport } = keyboardPanFixture();
  controller._clearEntitySelection();
  key('W', { shiftKey: true });
  assert.equal(viewport.y, 120);
  key('d', { repeat: true });
  viewport.zoom = 2;
  key('d', { repeat: true });
  assert.equal(viewport.x, -80);
  assert.equal(viewport.zoom, 2);
});

test('输入、菜单、弹窗、组合输入和非画布焦点不会触发平移', () => {
  for (const overrides of [
    { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true },
    { ctrlKey: true }, { metaKey: true }, { altKey: true },
    { target: { closest: () => null } },
    { target: { isContentEditable: true, closest: () => ({}) } },
    { target: { closest: selector => selector.startsWith('input,') || selector === '.relationship-canvas' ? {} : null } },
    { target: { closest: selector => selector.startsWith('button,') || selector === '.relationship-canvas' ? {} : null } }
  ]) {
    const { key, viewport } = keyboardPanFixture();
    assert.deepEqual(key('w', overrides), { handled: false, stopped: false });
    assert.equal(viewport.y, 0);
  }
  for (const blocker of ['dialog', 'popover', 'drag', 'connection', 'closed']) {
    const { controller, key, viewport } = keyboardPanFixture();
    if (blocker === 'dialog') controller.root.ownerDocument = { querySelectorAll: () => [{ getClientRects: () => [{}] }] };
    if (blocker === 'popover') controller.root.querySelector = selector => ['.relationship-context-menu', '.relationship-layout-menu'].includes(selector) ? null : ({});
    if (blocker === 'drag') controller.pointerAction = { type: 'node' };
    if (blocker === 'connection') controller.keyboardConnectSourceId = 'entity_one';
    if (blocker === 'closed') controller.root.isConnected = false;
    assert.deepEqual(key('ArrowDown'), { handled: false, stopped: false });
    assert.equal(viewport.y, 0);
  }
});

test('应用中未打开的隐藏对话框模板不会阻止白板键盘平移', () => {
  const { controller, key, viewport } = keyboardPanFixture();
  controller.root.ownerDocument = { querySelectorAll: () => [{ getClientRects: () => [] }] };
  assert.deepEqual(key('d'), { handled: true, stopped: true });
  assert.equal(viewport.x, -40);
});

test('空白默认框选光标，空格切换抓手，释放、输入框和失焦会恢复', () => {
  const { controller, key } = keyboardPanFixture();
  const classes = new Set();
  controller.root.classList = {
    toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    add: name => classes.add(name),
    remove: (...names) => names.forEach(name => classes.delete(name))
  };
  key('Shift', { shiftKey: true });
  assert.equal(classes.has('box-select-ready'), false);
  key(' ');
  assert.ok(classes.has('pan-ready'));
  assert.equal(controller.spacePan, true);
  controller._boundKeyup({ key: ' ' });
  assert.equal(classes.has('pan-ready'), false);
  assert.equal(controller.spacePan, false);
  key(' ', { target: { isContentEditable: true } });
  assert.equal(controller.spacePan, false);
  key(' ');
  controller._boundBlur();
  assert.equal(controller.spacePan, false);
  assert.equal(classes.has('pan-ready'), false);
  assert.match(relationshipCss, /\.relationship-canvas,\s*\.relationship-node\.relationship-group-frame\s*\{\s*cursor: crosshair/);
  assert.match(relationshipCss, /\.relationship-workspace\.box-selecting \.relationship-canvas \*\s*\{\s*cursor: crosshair !important/);
});

test('滚动按帧合并，触控板无额外惯性，鼠标平滑收敛且可立即打断', t => {
  const { controller, viewport } = keyboardPanFixture();
  const previousRAF = globalThis.requestAnimationFrame, previousCancel = globalThis.cancelAnimationFrame;
  let queued = null, paints = 0;
  globalThis.requestAnimationFrame = callback => { assert.equal(queued, null); queued = callback; return 1; };
  globalThis.cancelAnimationFrame = () => { queued = null; };
  t.after(() => { globalThis.requestAnimationFrame = previousRAF; globalThis.cancelAnimationFrame = previousCancel; });
  controller._applyViewport = () => paints++;
  const frame = time => { const callback = queued; queued = null; callback(time); };
  const wheel = { ctrlKey: false, deltaMode: 0, deltaX: 2.5, deltaY: 3.5, preventDefault() {}, stopPropagation() {} };
  for (let i = 0; i < 10; i++) controller._handleWheel(wheel);
  assert.equal(paints, 0);
  frame(16);
  assert.deepEqual(viewport, { x: -25, y: -35, zoom: 0.5 });
  assert.equal(paints, 1); assert.equal(queued, null);
  controller._handleWheel({ ...wheel, deltaX: 0, deltaY: 120 });
  frame(32);
  assert.ok(viewport.y < -35 && viewport.y > -155, '滚轮不能一步跳到终点');
  let previous = viewport.y;
  for (let time = 48; queued && time < 1000; time += 16) {
    frame(time); assert.ok(viewport.y <= previous && viewport.y >= -155); previous = viewport.y;
  }
  assert.equal(viewport.y, -155); assert.equal(queued, null);
  controller._handleWheel({ ...wheel, deltaX: 0, deltaY: 120 }); frame(1000);
  const interrupted = viewport.y;
  controller._stopWheelPan();
  assert.equal(queued, null); assert.equal(viewport.y, interrupted);
  controller.pointerAction = { type: 'node' }; controller._handleWheel(wheel);
  assert.equal(viewport.y, interrupted); assert.equal(queued, null);
});

test('减少动态效果时滚动立即响应，不启动平滑动画', t => {
  const { controller, viewport } = keyboardPanFixture();
  const previousWindow = globalThis.window, previousRAF = globalThis.requestAnimationFrame;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.requestAnimationFrame = () => { throw new Error('不应启动动画'); };
  t.after(() => { globalThis.window = previousWindow; globalThis.requestAnimationFrame = previousRAF; });
  controller._queueWheelPan(0, -120, true);
  assert.equal(viewport.y, -120); assert.equal(controller.wheelPan, null);
});

test('双指滚动直接按屏幕像素平移双轴，不缩放或移动卡片', () => {
  const { controller, viewport, world, grid } = keyboardPanFixture();
  let prevented = 0;
  let stopped = 0;
  for (const zoom of [0.5, 2]) {
    viewport.zoom = zoom;
    controller._handleWheel({
      ctrlKey: false, deltaMode: 0, deltaX: 12.5, deltaY: -7.25,
      preventDefault: () => { prevented++; }, stopPropagation: () => { stopped++; }
    });
    assert.equal(viewport.zoom, zoom);
  }
  assert.deepEqual(viewport, { x: -25, y: 14.5, zoom: 2 });
  assert.equal(world.style.transform, 'translate(-25px,14.5px) scale(2)');
  assert.equal(grid['--relationship-grid-x'], '-25px');
  assert.equal(grid['--relationship-grid-y'], '14.5px');
  assert.equal(prevented, 2);
  assert.equal(stopped, 2);
  assert.equal(controller.persistDelay, 220);
  assert.deepEqual(controller.store.boards[0].placements, [{ entityId: 'entity_one', x: 100, y: 200 }]);
  assert.equal(controller.undoStack.length, 0);
});

test('平移兼容行和页单位，触控板捏合围绕手势位置缩放', () => {
  const { controller, viewport } = keyboardPanFixture();
  const wheel = { ctrlKey: false, deltaX: 1, deltaY: -1, preventDefault() {}, stopPropagation() {} };
  controller._handleWheel({ ...wheel, deltaMode: 1 });
  assert.deepEqual(viewport, { x: -16, y: 16, zoom: 0.5 });
  controller._handleWheel({ ...wheel, deltaMode: 2 });
  assert.deepEqual(viewport, { x: -816, y: 616, zoom: 0.5 });
  const worldX = (200 - viewport.x) / viewport.zoom;
  const worldY = (100 - viewport.y) / viewport.zoom;
  controller._handleWheel({ ...wheel, ctrlKey: true, deltaMode: 0, deltaY: -100, clientX: 210, clientY: 120 });
  assert.ok(viewport.zoom > 0.5);
  assert.ok(Math.abs((200 - viewport.x) / viewport.zoom - worldX) < 1e-9);
  assert.ok(Math.abs((100 - viewport.y) / viewport.zoom - worldY) < 1e-9);
});

test('Ctrl 和 Cmd 滚轮均围绕鼠标缩放，不改变卡片坐标', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const { controller, viewport } = keyboardPanFixture();
    const before = structuredClone(controller.store.boards[0].placements);
    controller._handleWheel({ [modifier]: true, deltaMode: 0, deltaX: 0, deltaY: -40,
      clientX: 210, clientY: 120, preventDefault() {}, stopPropagation() {} });
    assert.ok(viewport.zoom > 0.5);
    assert.equal((200 - viewport.x) / viewport.zoom, 400);
    assert.equal((100 - viewport.y) / viewport.zoom, 200);
    assert.deepEqual(controller.store.boards[0].placements, before);
  }
});

test('缩放入口支持 5% 到 800%，保持鼠标锚点且不改卡片坐标', () => {
  const { controller, viewport } = keyboardPanFixture();
  const before = structuredClone(controller.store.boards[0].placements);
  for (const [requested, expected] of [[0.001, 0.05], [0.1, 0.1], [4, 4], [10, 8], [1, 1]]) {
    const worldX = (200 - viewport.x) / viewport.zoom;
    const worldY = (100 - viewport.y) / viewport.zoom;
    controller._zoomViewport(requested, 200, 100);
    assert.equal(viewport.zoom, expected);
    assert.ok(Math.abs((200 - viewport.x) / viewport.zoom - worldX) < 1e-8);
    assert.ok(Math.abs((100 - viewport.y) / viewport.zoom - worldY) < 1e-8);
  }
  assert.deepEqual(controller.store.boards[0].placements, before);
});

test('适合内容可缩小到 25% 以下，网格不会缩成密集噪点', () => {
  const { controller, viewport, grid } = keyboardPanFixture();
  const placements = [{ entityId: 'entity_one', x: 0, y: 0, width: 6000, height: 4000 }];
  controller._filteredGraph = () => ({ placements });
  controller._displayGeometryMap = () => new Map();
  controller._placementGeometry = item => item;
  controller.fitContent();
  assert.ok(viewport.zoom < 0.25 && viewport.zoom >= 0.05);
  assert.ok(6000 * viewport.zoom <= 680 && 4000 * viewport.zoom <= 480);
  for (const zoom of [0.05, 0.1, 0.25, 0.5, 1]) {
    viewport.zoom = zoom;
    controller._applyViewport();
    assert.ok(parseFloat(grid['--relationship-grid-size']) >= 16);
  }
});

test('创建独立服务器树状白板保留原布局，仓库相关性按钮可切换与撤销', () => {
  const { controller } = keyboardPanFixture();
  const board = controller.store.boards[0];
  controller.store.entities = [
    { id: 'entity_one', type: 'server', name: 'host', details: {} },
    { id: 'entity_tree_group', type: 'group', name: 'Project', details: {} },
    { id: 'entity_tree_app', type: 'deployment', name: 'app', details: {} }
  ];
  board.placements.push({ entityId: 'entity_tree_group', x: 500, y: 400 },
    { entityId: 'entity_tree_app', x: 600, y: 500, groupId: 'entity_tree_group' });
  controller.store.relationships = [{ id: 'relationship_tree_host', sourceId: 'entity_tree_app', targetId: 'entity_one', type: 'runs_on' }];
  controller._boardView();
  const before = JSON.stringify(board);
  controller.render = controller._renderGraph = controller.fitContent = controller._refreshHistoryButtons = () => {};
  controller._persistDynamicLayoutsSoon = () => {};
  assert.equal(controller._createServerTree(), true);
  assert.equal(JSON.stringify(controller.store.boards[0]), before);
  assert.equal(controller.store.boards.length, 2);
  assert.equal(controller._isServerTree(), true);
  assert.equal(controller._filteredGraph().summaryRelationships.length, 1);
  assert.equal(controller._createServerTree(), false, '重复点击不增加新白板');
  const click = () => controller._handleClick({ target: { closest: selector => selector === '[data-relationship-action]'
    ? { dataset: { relationshipAction: 'repository-relations' } } : null } });
  click();
  assert.equal(controller._boardView().showRepositoryRelations, true);
  click();
  assert.equal(controller._boardView().showRepositoryRelations, false);
  controller._restoreHistorySnapshot(controller.undoStack.at(-1));
  assert.equal(controller._boardView().showRepositoryRelations, true);
});

test('画布空白框选、群组空白拖动、标题仅点击，中键及空格只平移', () => {
  for (const [area, modifiers, expected] of [
    ['blank', {}, 'box'], ['blank', { shiftKey: true }, 'box'],
    ['group-body', {}, 'node'], ['node', {}, 'node'], ['group-header', {}, null],
    ['group-body', { spacePan: true }, 'pan'], ['group-header', { button: 1 }, 'pan'],
    ['blank', { button: 1 }, 'pan'], ['node', { button: 1 }, 'pan'],
    ['node', { spacePan: true }, 'pan'], ['blank', { spacePan: true }, 'pan'],
    ['button', {}, null], ['input', {}, null]
  ]) {
    const { controller: c } = nestedGroupFixture();
    const classes = { add() {}, remove() {} };
    const canvas = { setPointerCapture() {}, focus() {}, classList: classes, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const node = ['group-body', 'group-header'].includes(area)
      ? { dataset: { entityId: 'entity_outer001', entityType: 'group' }, classList: classes }
      : area === 'node' ? { dataset: { entityId: 'entity_local001', entityType: 'repository' }, classList: classes } : null;
    c.root = { querySelector: selector => selector === '.relationship-canvas' ? canvas : null, querySelectorAll: () => [], classList: classes };
    c._renderSelectionBox = c._updateSelectionCss = c._hideSelectionBox = c._positionSelectionToolbar = c._updateMinimap = () => {};
    const target = { closest: selector => {
      if (selector === '.relationship-canvas') return canvas;
      if (['.relationship-node', '.relationship-node, .relationship-edge'].includes(selector)) return node;
      if (selector === '.relationship-node-header') return area === 'group-header' ? {} : null;
      if (selector.startsWith('.relationship-port,') || selector.startsWith('input,')) return ['button', 'input'].includes(area) ? {} : null;
      return null;
    } };
    c.spacePan = modifiers.spacePan || false;
    c._handlePointerDown({ target, pointerId: 7, clientX: 50, clientY: 70, button: 0, preventDefault() {}, ...modifiers });
    assert.equal(c.pointerAction?.type || null, expected, `${area} ${JSON.stringify(modifiers)}`);
    if (expected === 'box') {
      c._handlePointerUp({ pointerId: 7 });
      assert.equal(c._entitySelectionIds().size, 0, '空白单击清空选区');
    }
  }
});

test('群组空白点击不弹工具条，标题点击弹出且不改变坐标', () => {
  const { controller: c } = nestedGroupFixture();
  const toolbar = { hidden: false, style: {} };
  c.root = { querySelector: selector => selector === '.relationship-selection-toolbar' ? toolbar : null };
  c._updateSelectionCss = () => c._renderSelectionToolbar();
  c._positionSelectionToolbar = () => {};
  const before = JSON.stringify(c.store);
  const node = { dataset: { entityId: 'entity_outer001', entityType: 'group' } };
  for (const header of [false, true, false]) {
    c._handleClick({ target: { closest: selector => selector === '.relationship-node' ? node
      : selector === '.relationship-node-header' && header ? {} : null } });
    assert.equal(toolbar.hidden, !header);
    assert.equal(c.selectedEntityId, 'entity_outer001');
    assert.equal(JSON.stringify(c.store), before);
  }
});

test('群组工具条定位在标题上方，不遮挡缩放后固定字号的标题', () => {
  const { controller: c } = nestedGroupFixture();
  c._selectOnlyEntity('entity_outer001');
  const toolbar = { hidden: false, style: {}, offsetWidth: 220, offsetHeight: 40 };
  const header = { getBoundingClientRect: () => ({ left: 100, top: 130, right: 420, bottom: 160 }) };
  const node = { dataset: { entityId: 'entity_outer001', entityType: 'group' },
    querySelector: () => header, getBoundingClientRect: () => ({ left: 100, top: 180, right: 500, bottom: 600 }) };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) };
  c.root = { querySelector: selector => selector === '.relationship-canvas' ? canvas : toolbar, querySelectorAll: () => [node] };
  c._positionSelectionToolbar();
  assert.equal(toolbar.style.top, '78px');
});

test('快捷排列将嵌套群组视为整体，只移动选区并支持撤销', () => {
  const { controller } = nestedGroupFixture();
  controller._boardView();
  controller._setEntitySelection(new Set(['entity_outer001', 'entity_inner001', 'entity_local002']));
  const before = JSON.stringify(controller.store);
  const local = controller._placementForEntity('entity_local001');
  const inner = controller._placementForEntity('entity_inner001');
  const relative = { x: local.x - inner.x, y: local.y - inner.y };
  assert.equal(controller._arrangeSelection('row'), true);
  const groups = controller._selectedMemberPlacements().map(item => controller._placementGeometry(item));
  assert.equal(groups[0].y, groups[1].y);
  assert.ok(groups[1].x >= groups[0].x + groups[0].width);
  assert.deepEqual({ x: local.x - inner.x, y: local.y - inner.y }, relative);
  assert.equal(controller._placementForEntity('entity_dynamic01').x, 100);
  controller.undo();
  assert.equal(JSON.stringify(controller.store), before);
});

test('所选群组的快捷显示控制作用于成员，不改变其他节点', () => {
  const { controller } = nestedGroupFixture();
  controller._selectOnlyEntity('entity_outer001');
  controller._setSelectionDisplay('expand');
  assert.deepEqual([...controller.expandedCardIds], ['entity_local001']);
  controller._setSelectionDisplay('hide-status');
  assert.equal(controller._placementForEntity('entity_local001').statusVisibility, 'hide');
  assert.equal(controller._placementForEntity('entity_local002').statusVisibility, undefined);
  controller._setSelectionDisplay('inherit-status');
  assert.equal(controller._placementForEntity('entity_local001').statusVisibility, undefined);
  controller._setSelectionDisplay('collapse');
  assert.equal(controller.expandedCardIds.size, 0);
});

test('解散自动群组只移除组框，刷新和重开保持，撤销可恢复', () => {
  const { controller } = nestedGroupFixture();
  controller._setPanelTopology({ state: 'ready', provider: { providerId: 'coolify_test', label: 'Demo' }, topology: {
    servers: [{ nodeId: 'host1', name: '主机' }],
    deployments: [{ resourceUuid: 'app1', nodeId: 'host1', projectUuid: 'proj1', projectName: 'MES', name: '部署' }]
  } });
  controller._arrangeByCoolifyProjects();
  const group = controller.panelProjection.entities.find(item => item.type === 'group' && item.name.includes('MES'));
  const member = controller.panelProjection.placements.find(item => item.groupId === group.id);
  const position = { x: member.x, y: member.y };
  const count = controller.panelProjection.entities.filter(item => item.type !== 'group').length;
  controller._selectOnlyEntity(group.id);
  assert.ok(controller._contextMenuItems('node').some(item => item?.contextAction === 'delete'));
  controller._deleteSelection();
  controller._setPanelTopology(controller.panelTopologyResult);
  assert.equal(controller._allEntitiesById().has(group.id), false);
  assert.equal(controller._placementForEntity(member.entityId).groupId, undefined);
  assert.deepEqual({ x: member.x, y: member.y }, position);
  assert.equal(controller.panelProjection.entities.filter(item => item.type !== 'group').length, count);
  const reopened = new Controller({ bridge: {} });
  reopened.store = JSON.parse(JSON.stringify(controller.store));
  reopened.dynamicLayoutStore = JSON.parse(JSON.stringify(controller.dynamicLayoutStore));
  reopened._setPanelTopology(controller.panelTopologyResult);
  assert.equal(reopened._allEntitiesById().has(group.id), false);
  controller.undo();
  assert.ok(controller._allEntitiesById().has(group.id));
  assert.equal(controller._placementForEntity(member.entityId).groupId, group.id);
  controller.redo();
  assert.equal(controller._allEntitiesById().has(group.id), false);
});

test('全景导航包含负坐标和视口，点击只改变相机，空白图也可用', () => {
  const { controller, viewport } = keyboardPanFixture();
  controller.minimapNodes = [{ x: -500, y: -200, width: 280, height: 143 }];
  const map = controller._minimapTransform(800, 600);
  const project = (x, y) => ({ x: (x - map.x) * map.scale, y: (y - map.y) * map.scale });
  for (const point of [project(-500, -200), project(1600, 1200)]) {
    assert.ok(point.x >= 0 && point.x <= 220);
    assert.ok(point.y >= 0 && point.y <= 128);
  }
  controller._navigateMinimap({ x: 110, y: 64 }, map, 800, 600);
  assert.equal(viewport.zoom, 0.5);
  assert.deepEqual(controller.store.boards[0].placements, [{ entityId: 'entity_one', x: 100, y: 200 }]);
  assert.equal(controller.undoStack.length, 0);
  controller.minimapNodes = [];
  assert.ok(Number.isFinite(controller._minimapTransform(800, 600).scale));
});

test('面板组件独立停靠和折叠只保存本机偏好，不修改白板关系', async () => {
  const saved = [];
  const { controller } = nestedGroupFixture();
  controller.bridge = { config: { set: async (key, value) => saved.push({ key, value }) } };
  const before = JSON.stringify(controller.store);
  controller._placePanelComponents = () => {};
  controller._syncResourcePanelVisibility = () => {};
  assert.equal(controller._setPanelSide('resource:server', 'right'), true);
  controller._togglePanelCollapsed('library');
  controller._setPanelSide('inspector', 'left');
  controller._togglePanelCollapsed('inspector');
  await controller._savePanelLayout();
  assert.deepEqual(controller.panelLayout['resource:server'], { side: 'right', detached: true, order: 0 });
  assert.equal(controller.panelLayout.library.collapsed, true);
  assert.equal(controller.panelLayout.inspector.side, 'left');
  assert.equal(controller.panelLayout.inspector.collapsed, true);
  assert.equal(JSON.stringify(controller.store), before);
  assert.ok(saved.every(item => item.key === 'relationshipPanelLayout'));
  assert.equal(controller._setPanelSide('unrelated', 'right'), false);
});

test('混合选择不能通过快捷键部分删除实时资源或本地卡片', () => {
  const { controller } = nestedGroupFixture();
  controller._setEntitySelection(new Set(['entity_local001', 'entity_dynamic01']));
  const before = controller._historySnapshot();
  controller._deleteSelection();
  assert.equal(controller._historySnapshot(), before);
  assert.equal(controller.undoStack.length, 0);
});

test('筛选切换只保留仍然可见的已选节点', () => {
  const controller = new Controller({ bridge: {} });
  controller._setEntitySelection(
    new Set(['entity_server01', 'entity_server02', 'entity_server03']),
    'entity_server02'
  );

  controller._pruneEntitySelection(new Set(['entity_server02', 'entity_server04']));

  assert.deepEqual([...controller._entitySelectionIds()], ['entity_server02']);
  assert.equal(controller.selectedEntityId, 'entity_server02');

  controller._pruneEntitySelection(new Set(['entity_server04']));

  assert.equal(controller._entitySelectionIds().size, 0);
  assert.equal(controller.selectedEntityId, '');
});

test('白板多选提供修饰键、默认空白框选和不批量编辑事实的说明', () => {
  assert.match(controllerSource, /event\.metaKey \|\| event\.ctrlKey/);
  assert.doesNotMatch(controllerSource, /event\.shiftKey && event\.button === 0/);
  assert.match(controllerSource, /空白拖动框选/);
  assert.match(controllerSource, /class="relationship-selection-box"/);
  assert.match(controllerSource, /事实字段必须逐个节点编辑/);
  assert.match(relationshipCss, /\.relationship-selection-box\s*\{/);
  assert.match(controllerSource, /建立视觉分组/);
  assert.match(controllerSource, /移出分组/);
  assert.match(relationshipCss, /\.relationship-group-frame\s*\{/);
});

test('内容筛选高亮匹配与一跳上下文并低可视保留其余节点', () => {
  const controller = new Controller({
    bridge: {},
    now: () => new Date('2026-08-27T12:00:00.000Z')
  });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_project1', type: 'project', name: 'Alpha Project', refId: 'project_alpha01', details: {} },
      { id: 'entity_repo0001', type: 'repository', name: 'Repository R', refId: 'repository_r01', details: {} },
      { id: 'entity_deploy01', type: 'deployment', name: 'Production', details: { environment: 'production' }, verifiedAt: '2026-07-01T12:00:00.000Z' },
      { id: 'entity_server01', type: 'server', name: 'Con01', details: { environment: 'production' } }
    ],
    relationships: [
      { id: 'relationship_test0001', type: 'contains', sourceId: 'entity_project1', targetId: 'entity_repo0001' },
      { id: 'relationship_test0002', type: 'source_of', sourceId: 'entity_repo0001', targetId: 'entity_deploy01' },
      { id: 'relationship_test0003', type: 'runs_on', sourceId: 'entity_deploy01', targetId: 'entity_server01' }
    ],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'full', query: 'alpha', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_project1', x: 0, y: 0 },
        { entityId: 'entity_repo0001', x: 300, y: 0 },
        { entityId: 'entity_deploy01', x: 600, y: 0 },
        { entityId: 'entity_server01', x: 900, y: 0 }
      ]
    }]
  };

  let graph = controller._filteredGraph();
  assert.deepEqual([...graph.directIds], ['entity_project1']);
  assert.deepEqual(graph.placements.map(item => item.entityId), ['entity_project1', 'entity_repo0001', 'entity_deploy01', 'entity_server01']);
  assert.deepEqual([...graph.contextualIds], ['entity_repo0001']);
  assert.deepEqual([...graph.mutedIds], ['entity_deploy01', 'entity_server01']);
  assert.deepEqual(graph.relationships.map(item => item.id), ['relationship_test0001', 'relationship_test0002', 'relationship_test0003']);

  controller.store.boards[0].view = {
    mode: 'full', query: '', entityType: 'all', environment: '', verification: 'stale'
  };
  graph = controller._filteredGraph();
  assert.deepEqual([...graph.directIds], ['entity_deploy01']);
  assert.deepEqual(graph.placements.map(item => item.entityId), ['entity_project1', 'entity_repo0001', 'entity_deploy01', 'entity_server01']);
  assert.deepEqual([...graph.contextualIds], ['entity_repo0001', 'entity_server01']);
  assert.deepEqual([...graph.mutedIds], ['entity_project1']);
  assert.deepEqual(graph.relationships.map(item => item.id), ['relationship_test0001', 'relationship_test0002', 'relationship_test0003']);

  controller.store.boards[0].view.unmatchedDisplay = 'hide';
  graph = controller._filteredGraph();
  assert.deepEqual(graph.placements.map(item => item.entityId), ['entity_deploy01']);
  assert.deepEqual(graph.relationships, []);
});

test('精简模式使用对应节点尺寸计算双向连线端点', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [],
    relationships: [],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'compact', query: '', entityType: 'all', environment: '', verification: 'all' },
      placements: [
        { entityId: 'entity_source01', x: 420, y: 100 },
        { entityId: 'entity_target01', x: 80, y: 180 }
      ]
    }]
  };

  assert.deepEqual(controller._nodeDimensions(), { width: COMPACT_NODE_WIDTH, height: COMPACT_NODE_HEIGHT });
  const geometry = controller._edgeGeometry({ sourceId: 'entity_source01', targetId: 'entity_target01' });
  assert.match(geometry.path, /^M 420.5 144.5 C/);
  assert.match(geometry.path, new RegExp(` ${80 + COMPACT_NODE_WIDTH - .5} 224.5$`));
});

test('项目和仓库可按稳定身份加入当前白板并清除遮挡它的筛选', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [],
    relationships: [],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { mode: 'compact', query: 'other', entityType: 'server', environment: '', verification: 'all' },
      placements: []
    }]
  };
  controller.resourceMap = new Map([['project:project_alpha01', {
    key: 'project:project_alpha01',
    kind: 'project',
    refId: 'project_alpha01',
    name: 'Alpha Project',
    path: '/workspace/alpha',
    secondary: '开发中'
  }]]);
  controller._persistSoon = () => {};
  controller._renderGraph = () => {};
  controller._updateFilterSummary = () => {};
  controller._updateSummary = () => {};
  controller._setCanvasAnnouncement = () => {};

  assert.equal(controller.revealResource('project', 'project_alpha01'), true);
  assert.equal(controller.store.entities.length, 1);
  assert.equal(controller.store.entities[0].refId, 'project_alpha01');
  assert.equal(controller.store.boards[0].placements.length, 1);
  assert.equal(controller.store.boards[0].view.mode, 'compact');
  assert.equal(controller.store.boards[0].view.query, '');
  assert.equal(controller.store.boards[0].view.entityType, 'all');
  assert.equal(controller.selectedEntityId, controller.store.entities[0].id);
  assert.equal(controller.undoStack.length, 1);

  assert.equal(controller.revealResource('project', 'project_alpha01'), true);
  assert.equal(controller.store.entities.length, 1);
  assert.equal(controller.store.boards[0].placements.length, 1);
  assert.equal(controller.undoStack.length, 1);
});

test('项目首页、目录详情和仓库详情均提供关系白板下钻入口', () => {
  assert.match(appSource, /data-app-action="show-relationship-resource"[^>]+data-relationship-kind="project"/);
  assert.match(selectionDetailSource, /data-detail-action="show-relationship-resource"/);
  assert.match(html, /id="detail-relationship-board"/);
  assert.match(appSource, /showResourceInRelationshipBoard\(options = \{\}\)/);
  assert.match(appSource, /localProjects\.describe\(resourcePath\)/);
  assert.match(appSource, /repos\.getRegistry\(\)/);
  assert.match(appSource, /DirectoryNavigation\.pathsEqual/);
  assert.match(appSource, /relationshipBoardController\.revealResource\(kind, refId\)/);
  assert.match(controllerSource, /revealResource\(kind, refId\)/);
});

test('人工核验可撤销并写入确定时间而不改变关系结构', () => {
  const controller = new Controller({
    bridge: {},
    now: () => new Date('2026-08-27T12:34:56.000Z')
  });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_test0001',
    entities: [
      { id: 'entity_deploy01', type: 'deployment', name: 'MES', details: {} },
      { id: 'entity_server01', type: 'server', name: 'Con01', details: {} }
    ],
    relationships: [{
      id: 'relationship_test0001',
      type: 'runs_on',
      sourceId: 'entity_deploy01',
      targetId: 'entity_server01',
      source: 'manual'
    }],
    boards: [{
      id: 'board_test0001',
      name: '测试',
      viewport: { x: 0, y: 0, zoom: 1 },
      placements: [
        { entityId: 'entity_deploy01', x: 0, y: 0 },
        { entityId: 'entity_server01', x: 320, y: 0 }
      ]
    }]
  };
  controller.selectedRelationshipId = 'relationship_test0001';
  controller._persistSoon = () => {};
  controller._renderGraph = () => {};
  controller._refreshHistoryButtons = () => {};
  controller._updateSummary = () => {};
  controller._setCanvasAnnouncement = () => {};

  assert.equal(controller._verifySelectedNow(), true);
  assert.equal(controller.store.relationships[0].verifiedAt, '2026-08-27T12:34:56.000Z');
  assert.equal(controller.store.relationships[0].source, 'manual');
  assert.equal(controller.store.relationships.length, 1);
  assert.equal(controller.undoStack.length, 1);
});
