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
  resolveMagneticSnap,
  NODE_WIDTH,
  NODE_HEIGHT,
  COMPACT_NODE_WIDTH,
  COMPACT_NODE_HEIGHT
} = require('../src/renderer/scripts/relationshipBoardController');

test('左侧资源库同时提供目录范围与分类资源导航', () => {
  assert.deepEqual(
    RESOURCE_CATEGORY_DEFINITIONS.map(category => category.id),
    ['project', 'repository', 'server', 'deployment', 'endpoint', 'other']
  );
  assert.match(controllerSource, /data-resource-scope="directories"/);
  assert.match(controllerSource, /data-resource-scope="resources"/);
  assert.match(controllerSource, /data-resource-section/);
  assert.match(controllerSource, /aria-label="白板目录与资源库"/);
  assert.match(controllerSource, /getTreeRoots/);
  assert.match(relationshipCss, /\.relationship-resource-scope\s*\{/);
  assert.match(relationshipCss, /\.relationship-resource-section-trigger\s*\{/);
});

test('全局左侧导航在设置与关系白板中保留，资源库改为可移动浮动工具面板', () => {
  assert.doesNotMatch(relationshipCss, /relationships-mode\s+\.sidebar/);
  assert.doesNotMatch(relationshipCss, /relationships-mode\s+#resize-handle-left/);
  assert.doesNotMatch(contentCss, /settings-mode\s+\.sidebar/);
  assert.doesNotMatch(contentCss, /settings-mode\s+#resize-handle-left/);
  assert.match(controllerSource, /data-relationship-action="toggle-resource-panel"/);
  assert.match(controllerSource, /data-resource-panel-handle/);
  assert.match(controllerSource, /data-relationship-action="close-resource-panel"/);
  assert.match(controllerSource, /type:\s*'resource-panel'/);
  assert.match(relationshipCss, /\.relationship-resource-panel\s*\{[^}]*position:\s*absolute;/s);
  assert.match(relationshipCss, /\.relationship-resource-panel\[hidden\]\s*\{[^}]*display:\s*none;/s);
  assert.match(relationshipCss, /\.relationship-resource-drag-handle\s*\{[^}]*cursor:\s*grab;/s);
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
  const resourceSections = controller._resourceSections('resources', catalog);
  assert.equal(resourceSections.find(section => section.id === 'server').items[0].name, 'Con01');
  assert.equal(resourceSections.find(section => section.id === 'deployment').label, '站点与部署');
  assert.equal(resourceSections.find(section => section.id === 'endpoint').label, '访问端点');

  const directorySections = controller._resourceSections('directories', catalog);
  assert.deepEqual(directorySections.map(section => section.label), ['project']);
  assert.deepEqual(directorySections[0].items.map(item => item.name), ['MES', 'mes-lite']);
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

  assert.match(geometry.path, new RegExp(`^M 420 ${100 + NODE_HEIGHT / 2} C`));
  assert.match(geometry.path, new RegExp(` ${80 + NODE_WIDTH} ${180 + NODE_HEIGHT / 2}$`));
  assert.equal(geometry.labelX, (420 + 80 + NODE_WIDTH) / 2);
});

test('关系线显示明确方向箭头且临时连线保持轻量反馈', () => {
  assert.match(controllerSource, /id="relationship-edge-arrow"/);
  assert.match(controllerSource, /marker-end="url\(#relationship-edge-arrow\)"/);
  assert.match(relationshipCss, /\.relationship-edge-arrow\s*\{[^}]*fill:/s);
  assert.match(relationshipCss, /\.relationship-edge-temporary\s*\{[^}]*stroke-dasharray:/s);
});

test('选择节点或关系时使用非模态详情检查器编辑受控事实字段', () => {
  assert.match(controllerSource, /class="relationship-inspector-panel"[^>]+hidden/);
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
  assert.match(controllerSource, /data-relationship-action="arrange-by-category"/);
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
  assert.match(relationshipCss, /\.relationship-node-runtime-status\[data-state="running"\]/);
  assert.match(relationshipCss, /\.relationship-node-runtime-status\[data-state="deploy-failed"\]/);
  assert.match(relationshipCss, /\.relationship-node-runtime-status\[data-state="fault"\]/);
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
    { width: 280, height: 142, compactWidth: 236, compactHeight: 94 }
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
  assert.match(relationshipCss, /--relationship-card-height:\s*142px/);
  assert.match(relationshipCss, /backdrop-filter:\s*blur\(22px\) saturate\(145%\)/);
  assert.match(controllerSource, /entity\.type === 'repository' \? '已同步' : '正常'/);
  assert.match(controllerSource, /class="relationship-card-expand relationship-card-expand-top"[\s\S]*?<svg viewBox="0 0 20 20"/);
  assert.match(relationshipCss, /\.relationship-node-header\s*\{[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\) auto 28px;/s);
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
  assert.match(relationshipCss, /\.relationship-node\.resource-missing\s*\{[^}]*opacity:\s*1/s);
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
  controller.root = { querySelector: () => ({ style: {} }) };
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

test('多选节点使用一次键盘操作同步移动', () => {
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
    metaKey: false,
    ctrlKey: false,
    target: { matches: () => false },
    preventDefault: () => { prevented = true; }
  });

  assert.equal(prevented, true);
  assert.deepEqual(controller.store.boards[0].placements, [
    { entityId: 'entity_server01', x: 24, y: 0 },
    { entityId: 'entity_server02', x: 324, y: 40 }
  ]);
  assert.equal(controller.undoStack.length, 1);
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

test('白板多选提供修饰键、Shift 框选和不批量编辑事实的说明', () => {
  assert.match(controllerSource, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(controllerSource, /event\.shiftKey && event\.button === 0/);
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
  assert.match(geometry.path, new RegExp(`^M 420 ${100 + COMPACT_NODE_HEIGHT / 2} C`));
  assert.match(geometry.path, new RegExp(` ${80 + COMPACT_NODE_WIDTH} ${180 + COMPACT_NODE_HEIGHT / 2}$`));
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
