const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const html = read('src/renderer/index.html');
const appSource = read('src/renderer/scripts/app.js');
const controllerSource = read('src/renderer/scripts/relationshipBoardController.js');
const actionRouterSource = read('src/renderer/scripts/relationshipBoardActionRouter.js');
const resourceViewSource = read('src/renderer/scripts/relationshipBoardResourceView.js');
const toolbarViewSource = read('src/renderer/scripts/relationshipBoardToolbarView.js');
const boardRendererSource = `${controllerSource}\n${resourceViewSource}\n${toolbarViewSource}`;
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
  NODE_WIDTH,
  NODE_HEIGHT,
  COMPACT_NODE_WIDTH,
  COMPACT_NODE_HEIGHT
} = require('../src/renderer/scripts/relationshipBoardController');

test('白板变更统一完成保存、重绘、历史和摘要刷新', () => {
  const controller = new Controller({ bridge: {} });
  const calls = [];
  for (const name of ['_persistSoon', '_renderGraph', '_refreshHistoryButtons', '_updateSummary']) {
    controller[name] = () => calls.push(name);
  }
  controller._finishBoardMutation();
  assert.deepEqual(calls, ['_persistSoon', '_renderGraph', '_refreshHistoryButtons', '_updateSummary']);
  calls.length = 0;
  controller._finishBoardMutation({ updateSummary: false });
  assert.deepEqual(calls, ['_persistSoon', '_renderGraph', '_refreshHistoryButtons']);
});

test('服务器树汇总关系进入新引擎时明确标记为只读显示线', () => {
  const controller = new Controller({ bridge: {} });
  const entities = [
    { id: 'server', type: 'server', name: '主机', details: {} },
    { id: 'project', type: 'group', name: '项目', details: {} }
  ];
  const placements = [
    { entityId: 'server', x: 0, y: 0 },
    { entityId: 'project', x: 400, y: 0, groupWidth: 640, groupHeight: 400 }
  ];
  controller._allEntitiesById = () => new Map(entities.map(entity => [entity.id, entity]));
  controller._displayGeometryMap = () => new Map([
    ['server', { x: 0, y: 0, width: 280, height: 143 }],
    ['project', { x: 400, y: 0, width: 640, height: 400 }]
  ]);
  controller._entityDisplayName = entity => entity.name;
  controller._entityCardIcon = () => 'server';
  controller._groupShape = () => 'rounded';

  const flow = controller._flowGraphInput({
    placements,
    relationships: [{ id: 'fact', sourceId: 'server', targetId: 'project', type: 'manual' }],
    summaryRelationships: [{ id: 'summary', sourceId: 'server', targetId: 'project', type: 'server_project_summary' }]
  }, []);

  assert.equal(flow.relationships.find(edge => edge.id === 'fact').visualOnly, undefined);
  assert.equal(flow.relationships.find(edge => edge.id === 'summary').visualOnly, true);
});

test('连续拖动和选择只更新交互状态，不重算摘要或重绘资源库', (t) => {
  const previousEngine = globalThis.RelationshipCanvasEngine;
  t.after(() => { globalThis.RelationshipCanvasEngine = previousEngine; });
  globalThis.RelationshipCanvasEngine = {
    toPlacements: nodes => nodes.map(node => ({ entityId: node.id, x: node.x, y: node.y }))
  };

  const controller = new Controller({ bridge: {} });
  const placement = { entityId: 'entity_drag_target', x: 0, y: 0 };
  const entity = { id: placement.entityId, type: 'deployment', details: {} };
  controller._combinedPlacements = () => [placement];
  controller._placementForEntity = () => placement;
  controller._allEntitiesById = () => new Map([[entity.id, entity]]);
  controller._recordMutation = () => {};
  controller._persistSoon = () => {};
  controller._updateSelectionCss = () => {};
  controller._hideInspector = () => {};
  let summaryUpdates = 0;
  let resourceRenders = 0;
  controller._updateSummary = () => { summaryUpdates += 1; controller._renderResources(); };
  controller._renderResources = () => { resourceRenders += 1; };

  for (let index = 1; index <= 100; index += 1) {
    controller._handleFlowModelChange({ nodes: [{ id: entity.id, x: index, y: index * 2 }] });
  }
  for (let index = 0; index < 100; index += 1) {
    controller._handleFlowSelection({ nodeIds: index % 2 ? [] : [entity.id] });
  }

  assert.equal(placement.x, 100);
  assert.equal(placement.y, 200);
  assert.equal(summaryUpdates, 0);
  assert.equal(resourceRenders, 0);
});

test('跨主机共用访问点显示可展开警报详情并标记冲突连线', () => {
  const controller = new Controller({ bridge: {} });
  const entities = [
    ['server-a', 'server', '主机 A'], ['server-b', 'server', '主机 B'],
    ['deploy-a', 'deployment', '部署 A'], ['deploy-b', 'deployment', '部署 B'],
    ['endpoint', 'endpoint', 'shared.example.com']
  ].map(([id, type, name]) => ({ id, type, name, details: {} }));
  const relationships = [
    ['host-a', 'runs_on', 'deploy-a', 'server-a'], ['host-b', 'runs_on', 'deploy-b', 'server-b'],
    ['expose-a', 'exposes', 'deploy-a', 'endpoint'], ['expose-b', 'exposes', 'deploy-b', 'endpoint']
  ].map(([id, type, sourceId, targetId]) => ({ id, type, sourceId, targetId, source: 'manual' }));
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board-alerts',
    entities,
    relationships,
    boards: [{ id: 'board-alerts', name: '警报', viewport: { x: 0, y: 0, zoom: 1 },
      view: globalThis.RelationshipGraphModel.defaultBoardView(),
      placements: entities.map((entity, index) => ({ entityId: entity.id, x: index * 360, y: index * 120 })) }]
  };

  const alerts = controller._topologyAlerts();
  const html = controller._topologyAlertItemsHtml(alerts);
  const flow = controller._flowGraphInput({
    entities,
    placements: controller._combinedPlacements(),
    relationships,
    summaryRelationships: []
  }, alerts);

  assert.equal(alerts.length, 1);
  assert.match(html, /shared\.example\.com/);
  assert.match(html, /主机 A/);
  assert.match(html, /部署 B/);
  assert.match(html, /data-relationship-locate-entity="endpoint"/);
  assert.equal(flow.relationships.find(edge => edge.id === 'expose-a').diagnostic.severity, 'error');
  assert.equal(flow.relationships.find(edge => edge.id === 'host-a').diagnostic, undefined);
});

test('同主机复用域名同样显示左上角警报并标记全部访问连线', () => {
  const controller = new Controller({ bridge: {} });
  const entities = [
    ['server', 'server', '主机'], ['deploy-a', 'deployment', '部署 A'],
    ['deploy-b', 'deployment', '部署 B'], ['endpoint', 'endpoint', 'oaktechz.com']
  ].map(([id, type, name]) => ({ id, type, name, details: {} }));
  const relationships = [
    ['host-a', 'runs_on', 'deploy-a', 'server'], ['host-b', 'runs_on', 'deploy-b', 'server'],
    ['expose-a', 'exposes', 'deploy-a', 'endpoint'], ['expose-b', 'exposes', 'deploy-b', 'endpoint']
  ].map(([id, type, sourceId, targetId]) => ({ id, type, sourceId, targetId, source: 'manual' }));
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board-same-host-alert',
    entities,
    relationships,
    boards: [{ id: 'board-same-host-alert', name: '警报', viewport: { x: 0, y: 0, zoom: 1 },
      view: globalThis.RelationshipGraphModel.defaultBoardView(),
      placements: entities.map((entity, index) => ({ entityId: entity.id, x: index * 360, y: index * 120 })) }]
  };

  const alerts = controller._topologyAlerts();
  const flow = controller._flowGraphInput({
    entities,
    placements: controller._combinedPlacements(),
    relationships,
    summaryRelationships: []
  }, alerts);

  assert.equal(alerts.length, 1);
  assert.match(controller._topologyAlertItemsHtml(alerts), /oaktechz\.com/);
  assert.match(alerts[0].message, /同一主机/);
  assert.equal(flow.relationships.find(edge => edge.id === 'expose-a').diagnostic.severity, 'error');
  assert.equal(flow.relationships.find(edge => edge.id === 'expose-b').diagnostic.severity, 'error');
});

test('访问点区分正常、认证、HTTP、网络、未检测和过期，不使用部署时间', () => {
  const controller = new Controller({ bridge: {}, now: () => new Date('2026-08-31T02:01:00Z') });
  const entity = { id: 'endpoint1', type: 'endpoint', details: {}, runtime: { dynamicKind: 'panel-endpoint', status: 'reachable', url: 'https://example.com', observedAt: '2026-08-31T02:00:00Z', httpStatus: 200, latencyMs: 42 } };
  assert.equal(controller._entityRuntimeStatus(entity).label, '可访问');
  assert.equal(controller._entityRuntimeTone(entity), 'normal');
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
  const entity = { id: 'endpoint1', type: 'endpoint', name: 'example.com', details: {}, runtime: { dynamicKind: 'panel-endpoint', providerId: 'one', url: 'https://example.com' } };
  controller.panelProjection = { entities: [entity], placements: [{ entityId: 'endpoint1', x: 380, y: 42, note: 'keep me' }] };
  const placements = structuredClone(controller.panelProjection.placements);
  let rendered = 0;
  controller._renderGraph = () => rendered++;
  controller._updateFilterSummary = controller._updateSummary = () => {};
  const checks = [{ providerId: 'one', url: 'https://example.com', status: 'reachable', httpStatus: 200, latencyMs: 42,
    checkedAt: '2026-08-31T02:00:00Z', pageTitle: 'Example 控制台' }];
  controller._applyEndpointChecks(checks);
  assert.equal(entity.runtime.httpStatus, 200);
  assert.equal(entity.runtime.pageTitle, 'Example 控制台');
  assert.equal(entity.name, 'example.com');
  assert.match(controller._runtimeInspectorRows(entity), /网站标题[\s\S]*Example 控制台/);
  assert.deepEqual(controller.panelProjection.placements, placements);
  controller._applyEndpointChecks(checks);
  assert.equal(rendered, 1);
  controller._applyEndpointChecks([]);
  assert.equal(entity.runtime.status, 'unknown');
  assert.equal(entity.runtime.observedAt, null);
  assert.equal(entity.name, 'example.com');
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
  controller.flowMutationActive = true;
  await controller._refreshEndpointChecks();
  assert.equal(applied, 0);
  assert.ok(controller.endpointCheckTimer);
  clearTimeout(controller.endpointCheckTimer);
  controller.flowMutationActive = false;
  const pending = controller._refreshEndpointChecks({ force: true });
  controller.openRequestId++;
  finish({ checks: [], pending: 0 });
  await pending;
  assert.equal(applied, 0);
  await controller._refreshEndpointChecks();
  assert.equal(applied, 1);
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
    ['whiteboard', 'project', 'repository', 'architecture', 'server', 'deployment', 'endpoint', 'other']
  );
  assert.doesNotMatch(controllerSource, /data-resource-scope=/);
  assert.match(resourceViewSource, /data-resource-section/);
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
  assert.match(actionRouterSource, /application\/x-gitfinder-panel/);
  assert.match(relationshipCss, /\.relationship-panel-dock > \.relationship-dock-component\s*\{[^}]*position:\s*static;/s);
  assert.match(relationshipCss, /\.relationship-panel-dock \.relationship-title-alias-editor\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(relationshipCss, /\.relationship-inspector-field\s*\{[^}]*min-width:\s*0/s);
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

  assert.deepEqual(resourceSections.flatMap(section => section.items.filter(item => item.placed).map(item => item.name)), []);
});

test('本机工作区把 Coolify 资源作为可组合来源，加入后才标记为已放置', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_composable01',
    entities: [],
    relationships: [],
    boards: [{ id: 'board_composable01', name: '本机工作区', viewport: { x: 0, y: 0, zoom: 1 }, view: RelationshipGraphModel.defaultBoardView(), placements: [] }]
  };
  controller.panelProjection = {
    entities: [{ id: 'entity_server_composable', type: 'server', name: 'Con01', details: { hostLabel: 'Con01' }, source: 'observed', transient: true, runtime: { dynamicKind: 'panel-server' } }],
    relationships: [],
    placements: [{ entityId: 'entity_server_composable', x: 80, y: 80, dynamic: true }],
    metadata: { state: 'ready' }
  };
  const resource = controller._resourceCatalog().find(item => item.key === 'entity:entity_server_composable');
  assert.equal(resource?.placed, false);
  controller._persistSoon = controller._renderGraph = controller._refreshHistoryButtons = controller._updateSummary = () => {};
  controller._recordMutation = () => {};
  controller._addResource(resource);
  assert.equal(controller.store.entities.some(entity => entity.id === 'entity_server_composable'), true);
  assert.equal(controller.store.boards[0].placements.some(item => item.entityId === 'entity_server_composable'), true);
  assert.equal(controller._resourceCatalog().find(item => item.key === resource.key)?.placed, true);
});

test('本机工作区默认不注入在线拓扑，显式选择范围后可一次性固化节点和关系', () => {
  const controller = new Controller({ bridge: {} });
  const server = { id: 'entity_scope_server01', type: 'server', name: 'Con01', details: { hostLabel: 'Con01' }, source: 'observed', transient: true };
  const deployment = { id: 'entity_scope_deploy01', type: 'deployment', name: 'MES', details: { environment: 'production' }, source: 'observed', transient: true };
  controller.store = {
    schemaVersion: 1, activeBoardId: 'board_scope_add01', entities: [], relationships: [],
    boards: [{ id: 'board_scope_add01', name: '本机工作区', viewport: { x: 0, y: 0, zoom: 1 }, view: { ...RelationshipGraphModel.defaultBoardView(), topologyScopeMode: 'server', topologyScopeId: server.id }, placements: [] }]
  };
  controller.localWorkspaceMode = true;
  controller.panelProjection = {
    entities: [server, deployment],
    relationships: [{ id: 'relation_panel_runs01', type: 'runs_on', sourceId: deployment.id, targetId: server.id, source: 'observed' }],
    placements: [{ entityId: server.id, x: 80, y: 80, dynamic: true }, { entityId: deployment.id, x: 420, y: 80, dynamic: true }],
    metadata: { state: 'ready' }
  };
  controller._persistSoon = controller._renderGraph = controller._refreshHistoryButtons = controller._updateSummary = () => {};
  controller._addTopologyScopeToBoard();
  assert.deepEqual(controller.store.entities.map(entity => entity.id).sort(), [server.id, deployment.id].sort());
  assert.deepEqual(controller.store.boards[0].placements.map(item => item.entityId).sort(), [server.id, deployment.id].sort());
  assert.equal(controller.store.relationships.length, 1);
  assert.equal(controller.store.boards[0].view.topologyScopeMode, 'board');
  assert.equal(controller._combinedPlacements().length, 2);
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
  assert.ok(html.indexOf('../shared/relationshipGraphProjection.js') < html.indexOf('scripts/relationshipBoardController.js'));
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
  assert.match(toolbarViewSource, /data-relationship-action="export-json"/);
  assert.match(toolbarViewSource, /data-relationship-action="import-json"/);
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
  assert.doesNotMatch(boardRendererSource, /data-relationship-action="connect-coolify"/);
  assert.doesNotMatch(controllerSource, /连接 Coolify（只读）/);
  assert.doesNotMatch(boardRendererSource, /name="accessToken"/);
  assert.doesNotMatch(relationshipPreloadBlock, /previewCoolify|applyCoolify/);
  assert.doesNotMatch(relationshipIpcSource, /previewCoolify|applyCoolify|coolifyReadOnlyConnectorService/);
});

test('Coolify 动态拓扑通过只读 IPC 投影到白板而不写入持久关系事实', () => {
  assert.match(preloadSource, /getTopology:\s*\(options = \{\}\)\s*=>\s*ipcRenderer\.invoke\('panel:getTopology', options\)/);
  assert.match(preloadSource, /getCachedTopology:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('panel:getCachedTopology'\)/);
  assert.match(preloadSource, /refreshTopology:\s*\(options = \{\}\)\s*=>\s*ipcRenderer\.invoke\('panel:refreshTopology', options\)/);
  assert.match(preloadSource, /onSyncProgress:\s*\(callback\)/);
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
      view: { ...RelationshipGraphModel.defaultBoardView(), topologyScopeMode: 'all' },
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
  assert.doesNotMatch(JSON.stringify(exported), /\/Volumes\/|"transient"|"dynamic"|"provider"/);
});

test('Coolify 部分实例失败时显示部分同步，不把可用快照误报为全盘失败', () => {
  const controller = new Controller({ bridge: {} });
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_partial_status',
    entities: [],
    relationships: [],
    boards: [{ id: 'board_partial_status', name: '状态', viewport: { x: 0, y: 0, zoom: 1 }, view: RelationshipGraphModel.defaultBoardView(), placements: [] }]
  };
  controller._setPanelTopology({
    state: 'ready',
    cached: true,
    staleProviders: ['al02'],
    providers: [
      { providerId: 'con01', label: 'Con01' },
      { providerId: 'al02', label: 'AL02' },
      { providerId: 'al03', label: 'AL03' }
    ],
    errors: [{ providerId: 'al02', label: 'AL02', message: 'Coolify API /api/v1/servers 连接超时（ETIMEDOUT）' }],
    topology: {
      generatedAt: '2026-09-06T00:00:00.000Z',
      servers: [{ nodeId: 'con01-server', providerId: 'con01', name: 'Con01' }],
      deployments: [{ resourceUuid: 'deployment-1', providerId: 'con01', nodeId: 'con01-server', name: 'MES' }]
    }
  });
  const status = controller._panelStatusView();
  assert.equal(status.state, 'warning');
  assert.match(status.label, /2\/3 个 Coolify 已同步/);
  assert.match(status.label, /1 个实例失败/);
  assert.doesNotMatch(status.label, /同步失败/);
  assert.match(status.title, /AL02|ETIMEDOUT/);
});

test('Coolify 同步状态显示实例、阶段和阶段计数', () => {
  const controller = new Controller({ bridge: {} });
  controller.panelRefreshInFlight = true;
  controller.panelSyncRequestId = 'panel_sync_test_1';
  controller.panelSyncProgress = {
    requestId: 'panel_sync_test_1',
    state: 'running',
    phase: 'project-details',
    phaseLabel: '读取 Project 详情',
    providerLabel: 'con01',
    providerCount: 3,
    completedProviders: 1,
    completed: 14,
    total: 37,
    readCounts: { servers: 3, projects: 9, applications: 20, services: 2, databases: 1, deployments: 23, projectDetails: 7 },
    updatedAt: new Date().toISOString()
  };
  const status = controller._panelStatusView();
  assert.equal(status.state, 'loading');
  assert.match(status.label, /1\/3 个 Coolify/);
  assert.match(status.label, /con01/);
  assert.match(status.label, /读取 Project 详情 14\/37/);
  assert.match(status.label, /已读 项目详情 7\/37/);
});

test('Coolify 同步状态显示已读取的数据数量', () => {
  const controller = new Controller({ bridge: {} });
  controller.panelRefreshInFlight = true;
  controller.panelSyncRequestId = 'panel_sync_data_1';
  controller.panelSyncProgress = {
    requestId: 'panel_sync_data_1',
    state: 'running',
    phase: 'endpoints',
    phaseLabel: '读取基础资源',
    providerLabel: 'con01',
    providerCount: 1,
    completedProviders: 0,
    completed: 4,
    total: 5,
    readCounts: { servers: 3, projects: 9, applications: 20, services: 2, databases: 1, deployments: 23 }
  };
  const status = controller._panelStatusView();
  assert.match(status.label, /已读 服务器 3/);
  assert.match(status.label, /项目 9/);
  assert.match(status.title, /应用 20/);
  assert.match(status.title, /数据库 1/);
  controller.panelSyncProgress = { ...controller.panelSyncProgress, phase: 'finalizing', phaseLabel: '整理拓扑' };
  const finalizingStatus = controller._panelStatusView();
  assert.match(finalizingStatus.label, /已读 服务器 3/);
  assert.match(finalizingStatus.label, /部署 23/);
});

test('关闭白板后丢弃旧 Coolify 同步进度事件', () => {
  const controller = new Controller({ bridge: {} });
  controller.panelRefreshInFlight = true;
  controller.panelSyncRequestId = 'panel_sync_current';
  controller._updatePanelStatus = () => {};
  controller._handlePanelSyncProgress({
    requestId: 'panel_sync_old',
    state: 'running',
    phaseLabel: '读取部署历史',
    providerCount: 2,
    completedProviders: 1
  });
  assert.equal(controller.panelSyncProgress, null);
  controller._handlePanelSyncProgress({
    requestId: 'panel_sync_current',
    state: 'running',
    phaseLabel: '读取部署历史',
    providerCount: 2,
    completedProviders: 1
  });
  assert.equal(controller.panelSyncProgress.requestId, 'panel_sync_current');
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

test('关系白板先恢复 Coolify 缓存，再在后台刷新且刷新失败不清空缓存', async () => {
  const controller = new Controller({ bridge: { panel: {} } });
  controller.store = RelationshipGraphModel.defaultStore();
  controller.panelProjects = [];
  controller.panelProjection = { entities: [{ id: 'cached' }], relationships: [], placements: [{ entityId: 'cached' }], metadata: {} };
  controller.panelTopologyResult = { state: 'ready', cached: true, topology: { servers: [], deployments: [{ resourceUuid: 'cached' }] } };
  controller.root = { isConnected: true, querySelector: () => null };
  controller.bridge.panel.getCachedTopology = async () => ({ state: 'ready', cached: true, topology: { servers: [], deployments: [] } });
  controller.bridge.panel.refreshTopology = async () => ({ state: 'error', errors: [{ message: 'offline' }] });
  controller.bridge.panel.getLocalRepositories = async () => [];
  controller._setPanelTopology = result => { controller.panelTopologyResult = result; };
  controller._renderGraph = () => {};
  controller._renderResources = () => {};
  controller._updateFilterSummary = () => {};
  controller._updateSummary = () => {};
  controller._updatePanelStatus = () => {};
  controller._schedulePanelRefresh = () => {};

  assert.equal(await controller._restoreCachedPanelTopology(), true);
  assert.equal(controller.panelTopologyResult.cached, true);
  assert.equal(await controller._refreshPanelTopology(), false);
  assert.equal(controller.panelTopologyResult.state, 'ready');
  assert.match(controller.panelLastError, /offline/);
});

test('Coolify 拓扑可先完成，本地仓库远程检查不会阻塞同步状态', async () => {
  let resolveRepositories;
  const repositories = new Promise(resolve => { resolveRepositories = resolve; });
  const controller = new Controller({ bridge: { panel: {
    refreshTopology: async () => ({
      state: 'ready',
      topology: { servers: [{ nodeId: 'server-1', name: 'Con01' }], deployments: [] }
    }),
    getLocalRepositories: () => repositories
  } } });
  controller.root = { isConnected: true, querySelector: () => null };
  controller.store = RelationshipGraphModel.defaultStore();
  controller._topologyWithProjectBindings = async result => result;
  controller._setPanelTopology = result => { controller.panelTopologyResult = result; };
  controller._setResources = () => {};
  controller._renderResources = () => {};
  controller._renderGraph = () => {};
  controller._updateFilterSummary = () => {};
  controller._updateSummary = () => {};
  controller._updatePanelStatus = () => {};
  controller._schedulePanelRefresh = () => {};
  controller._refreshEndpointChecks = async () => {};

  assert.equal(await controller._refreshPanelTopology(), true);
  assert.equal(controller.panelRefreshInFlight, false);
  assert.equal(controller.repositoryRefreshInFlight, true);
  assert.equal(controller.panelTopologyResult.state, 'ready');

  resolveRepositories([{ id: 'repo-1', name: 'repo', path: '/repo', available: true }]);
  for (let attempt = 0; attempt < 10 && controller.repositoryRefreshInFlight; attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(controller.repositoryRefreshInFlight, false);
  assert.equal(controller.panelRepositories[0].id, 'repo-1');
});

test('Coolify 拓扑不等待项目绑定或关联文件 IPC', async () => {
  let resolveAssociations;
  const associations = new Promise(resolve => { resolveAssociations = resolve; });
  const controller = new Controller({ bridge: { panel: {
    refreshTopology: async () => ({
      state: 'ready',
      topology: { servers: [{ nodeId: 'server-1', name: 'Con01' }], deployments: [] }
    }),
    getRepositoryAssociations: () => associations,
    getProjectBindings: () => new Promise(() => {})
  } } });
  controller.root = { isConnected: true, querySelector: () => null };
  controller.store = RelationshipGraphModel.defaultStore();
  controller.panelProjects = [{ projectId: 'project-1', path: '/project', name: 'Project' }];
  controller._setPanelTopology = result => { controller.panelTopologyResult = result; };
  controller._setResources = () => {};
  controller._renderResources = () => {};
  controller._renderGraph = () => {};
  controller._updateFilterSummary = () => {};
  controller._updateSummary = () => {};
  controller._updatePanelStatus = () => {};
  controller._schedulePanelRefresh = () => {};
  controller._refreshEndpointChecks = async () => {};

  assert.equal(await controller._refreshPanelTopology(), true);
  assert.equal(controller.panelRefreshInFlight, false);
  assert.equal(controller.panelTopologyResult.state, 'ready');
  resolveAssociations([]);
});

test('拓扑刷新等待期间开始拖动时保留当前模型，下一次刷新恢复更新', async (t) => {
  let finish;
  const controller = new Controller({ bridge: { panel: {
    refreshTopology: () => new Promise(resolve => { finish = resolve; })
  } } });
  controller.root = { isConnected: true };
  controller.panelTopologyResult = { state: 'unconfigured', revision: 'current' };
  t.after(() => clearTimeout(controller.panelRefreshTimer));
  let rendered = 0;
  let scheduled = 0;
  for (const name of ['_setResources', '_renderResources', '_updateFilterSummary', '_updateSummary', '_updatePanelStatus']) controller[name] = () => {};
  controller._renderGraph = () => { rendered++; };
  controller._setPanelTopology = value => { controller.panelTopologyResult = value; };
  controller._schedulePanelRefresh = () => { scheduled++; Controller.prototype._schedulePanelRefresh.call(controller); };

  const pending = controller._refreshPanelTopology();
  controller.flowMutationActive = true;
  finish({ state: 'ready', revision: 'during-drag' });
  assert.equal(await pending, false);
  assert.equal(controller.panelTopologyResult.revision, 'current');
  assert.equal(rendered, 0);
  assert.equal(scheduled, 1);
  assert.ok(controller.panelRefreshTimer, '首次拓扑尚未应用时也应在拖动后重试');

  controller.flowMutationActive = false;
  const next = controller._refreshPanelTopology();
  finish({ state: 'ready', revision: 'after-drag' });
  assert.equal(await next, true);
  assert.equal(controller.panelTopologyResult.revision, 'after-drag');
  assert.equal(rendered, 1);
});

test('关闭并重开白板后丢弃旧拓扑响应，旧请求结束不解除新请求的占用', async (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { removeEventListener() {} };
  t.after(() => { globalThis.document = previousDocument; });
  const finishes = [];
  const controller = new Controller({ bridge: { panel: {
    refreshTopology: () => new Promise(resolve => { finishes.push(resolve); })
  } } });
  let rendered = 0;
  for (const name of ['_setResources', '_renderResources', '_updateFilterSummary', '_updateSummary', '_updatePanelStatus', '_closeContextMenu', '_schedulePanelRefresh']) controller[name] = () => {};
  controller._renderGraph = () => { rendered++; };
  controller._setPanelTopology = value => { controller.panelTopologyResult = value; };
  controller.root = { isConnected: true };

  const old = controller._refreshPanelTopology();
  controller.close();
  controller.root = { isConnected: true };
  const current = controller._refreshPanelTopology();
  assert.equal(finishes.length, 2);
  finishes[0]({ state: 'ready', revision: 'old' });
  assert.equal(await old, false);
  assert.equal(rendered, 0);
  assert.equal(controller.panelRefreshInFlight, true);

  finishes[1]({ state: 'ready', revision: 'current' });
  assert.equal(await current, true);
  assert.equal(controller.panelTopologyResult.revision, 'current');
  assert.equal(rendered, 1);
  assert.equal(controller.panelRefreshInFlight, false);
});

test('缓存拓扑等待项目关联期间关闭白板后不再替换当前投影', async () => {
  let finishBindings;
  let bindingsStarted;
  const started = new Promise(resolve => { bindingsStarted = resolve; });
  const controller = new Controller({ bridge: { panel: {
    getCachedTopology: async () => ({ state: 'ready', revision: 'old-cache' })
  } } });
  controller.root = { isConnected: true };
  controller._topologyWithProjectBindings = result => new Promise(resolve => {
    bindingsStarted();
    finishBindings = () => resolve(result);
  });
  let applied = 0;
  controller._setPanelTopology = () => { applied++; };
  for (const name of ['_renderGraph', '_updateFilterSummary', '_updateSummary', '_updatePanelStatus']) controller[name] = () => {};
  const pending = controller._restoreCachedPanelTopology();
  await started;
  controller.openRequestId++;
  finishBindings();
  assert.equal(await pending, false);
  assert.equal(applied, 0);
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
  assert.equal(fitOptions, undefined);
  assert.equal(controller._boardView().layout, 'lanes');
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
      view: { ...RelationshipGraphModel.defaultBoardView(), deploymentTitleSource: 'note', showRuntimeStatus: false },
      placements: [{ entityId: 'entity_deploy01', x: 0, y: 0, note: '生产主站', titleMode: 'suffix', titleText: '华东' }]
    }]
  };

  assert.equal(controller._entityDisplayName(controller.store.entities[0]), '生产主站 · 华东');
  controller.store.boards[0].placements[0].titleSource = 'name';
  controller.store.boards[0].placements[0].statusVisibility = 'show';
  assert.equal(controller._entityDisplayName(controller.store.entities[0]), 'MES production · 华东');
  assert.match(controllerSource, /name="placementTitleSource"/);
  assert.match(controllerSource, /name="placementStatusVisibility"/);
  assert.match(controllerSource, /showRuntimeStatus: display\.showRuntimeStatus/);
  const editor = controller._annotationEditorHtml('entity_deploy01');
  assert.match(editor, /value="name"[^>]*>部署名称/);
  assert.match(editor, /value="note"[^>]*>备注描述/);
});

test('访问点标题可按白板默认或单卡在域名与网站标题之间切换', () => {
  const controller = new Controller({ bridge: {} });
  const endpoint = { id: 'entity_endpoint01', type: 'endpoint', name: '生产站点', details: { urlLabel: 'https://site.example/path' },
    runtime: { dynamicKind: 'panel-endpoint', url: 'https://site.example/path', pageTitle: '生产站点' } };
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_endpoint_title',
    entities: [endpoint], relationships: [],
    boards: [{ id: 'board_endpoint_title', name: '标题来源', viewport: { x: 0, y: 0, zoom: 1 },
      view: { ...RelationshipGraphModel.defaultBoardView(), endpointTitleSource: 'website' },
      placements: [{ entityId: endpoint.id, x: 0, y: 0 }] }]
  };
  assert.equal(controller._entityDisplayName(endpoint), '生产站点');
  controller.store.boards[0].placements[0].titleSource = 'domain';
  assert.equal(controller._entityDisplayName(endpoint), 'site.example');
  const editor = controller._annotationEditorHtml(endpoint.id);
  assert.match(editor, /value="domain"[^>]*>域名/);
  assert.match(editor, /value="website"[^>]*>网站标题/);
});

test('资源卡图标遵循单卡覆盖、类型默认和内置默认的优先级', () => {
  const controller = new Controller({ bridge: {} });
  const deployment = { id: 'entity_icon0001', type: 'deployment', name: 'Production', details: {} };
  controller.store = {
    schemaVersion: 1,
    activeBoardId: 'board_icon0001',
    entities: [deployment], relationships: [],
    boards: [{ id: 'board_icon0001', name: '图标测试', viewport: { x: 0, y: 0, zoom: 1 },
      view: { ...RelationshipGraphModel.defaultBoardView(), cardIcons: { ...RelationshipGraphModel.DEFAULT_CARD_ICONS, deployment: 'database' } },
      placements: [{ entityId: deployment.id, x: 0, y: 0 }] }]
  };

  assert.equal(controller._entityCardIcon(deployment), 'database');
  controller.store.boards[0].placements[0].iconKey = 'service';
  assert.equal(controller._entityCardIcon(deployment), 'service');
  controller.store.boards[0].placements[0].iconKey = 'none';
  assert.equal(controller._entityCardIcon(deployment), 'none');
  const flow = controller._flowGraphInput({ placements: controller.store.boards[0].placements, relationships: [], summaryRelationships: [] }, []);
  assert.equal(flow.entities[0].iconKey, 'none');
  assert.equal(deployment.iconKey, undefined);
  assert.match(controller._annotationEditorHtml(deployment.id), /name="placementIconKey"[\s\S]*?<option value="none" selected>/);

  const text = { id: 'entity_text00001', type: 'text', name: '说明', details: { content: '说明' } };
  controller.store.entities.push(text);
  controller.store.boards[0].placements.push({ entityId: text.id, x: 320, y: 0 });
  assert.doesNotMatch(controller._annotationEditorHtml(text.id), /name="placementIconKey"/);
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
  assert.match(toolbarViewSource, /class="relationship-filter-host"/);
  assert.match(toolbarViewSource, /data-relationship-action="toggle-filter-menu"/);
  assert.match(toolbarViewSource, /class="relationship-filter-popover" role="dialog"/);
  assert.match(toolbarViewSource, /data-relationship-filter-form/);
  assert.match(toolbarViewSource, /name="entityType"/);
  assert.match(toolbarViewSource, /name="environment"/);
  assert.match(toolbarViewSource, /name="verification"/);
  assert.match(toolbarViewSource, /name="mode"/);
  assert.match(toolbarViewSource, /name="projection"/);
  assert.match(relationshipCss, /\.relationship-filter-popover\s*\{[^}]*position:\s*absolute/s);
  assert.match(relationshipCss, /\.relationship-display-popover\s*\{[^}]*position:\s*fixed/s);
  assert.doesNotMatch(boardRendererSource, /data-relationship-action="filter-(project|repository|server)"/);
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

test('自动分组在工具栏和空白右键菜单都有明确入口，并复用 Coolify Projects 操作', () => {
  const { controller } = nestedGroupFixture();
  assert.match(controller._layoutMenuHtml(), /data-board-structure="coolify-projects"/);
  assert.match(controller._layoutMenuHtml(), /结构只影响运行拓扑中的层级和群组成员，并应用所选布局；自由摆放保留原位置/);
  assert.doesNotMatch(controllerSource, /data-relationship-layout aria-label="整理操作"/);
  assert.ok(controller._contextMenuItems('canvas').some(item => item?.action === 'arrange-by-coolify-projects' && item.label === '初始化分组（Coolify Projects）'));
});

test('重复自动分组不增加节点或关系，并保留手工群组、卡片备注和显示别名', () => {
  const { controller } = nestedGroupFixture();
  controller._boardView().layout = 'free';
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
  card.iconKey = 'database';
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
  assert.equal(controller.panelProjection.placements.find(item => item.entityId === card.entityId).iconKey, 'database');
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
  assert.equal(controller.store.boards[0].view.structure, 'coolify-projects');
  assert.ok(controller.panelProjection.entities.some(item => item.type === 'group'));
  const exported = controller._buildActiveBoardExportStore();
  assert.ok(exported.entities.some(item => item.type === 'group'));
  assert.equal(exported.boards[0].view.structure, 'coolify-projects');
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
  assert.equal(controller.store.boards[0].view.structure, 'coolify-projects');
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
  assert.equal(controller.store.boards.at(-1).view.structure, 'coolify-projects');
  const normalized = globalThis.RelationshipGraphModel.normalizeStore(nestedGroupFixture().controller.store).value;
  assert.equal(normalized.boards[0].view.structure, 'resources');
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
  assert.equal(normalized.boards[0].view.layout, 'radial');
  controller.undo();
  assert.deepEqual(controller.store.boards[0].placements, original.boards[0].placements);
  controller.redo();
  assert.equal(controller.store.boards[0].view.layout, 'radial');
  assert.equal(controller._arrangeAround('server-centered'), true);
  assert.equal(globalThis.RelationshipGraphModel.assertValidStore(controller.store).boards[0].view.layout, 'radial');
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

test('群组自动排列使用显示间距，关闭后固定位置，手动尺寸不挪动成员', () => {
  const { controller: c } = nestedGroupFixture();
  const board = c.store.boards[0];
  const group = board.placements[1];
  board.placements[3].groupId = group.entityId;
  board.placements[3].y = board.placements[2].y;
  Object.assign(group, { groupWidth: 800, groupHeight: 500, groupLayout: 'auto' });
  board.view = { layout: 'compact', horizontalSpacing: 60, verticalSpacing: 80 };
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
  c._boardView().layout = 'compact';
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
  const canvas = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 })
  };
  controller.root = { isConnected: true, querySelector: selector => selector === '.relationship-canvas' ? canvas : null };
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
  return { controller, key, viewport: controller.store.boards[0].viewport };
}

test('资源库使用平整侧栏标题和可旋转折叠箭头，移动控件保留', () => {
  assert.match(controllerSource, /class="relationship-resource-library-trigger"[^>]*data-panel-collapse="library"/);
  assert.match(controllerSource, /class="relationship-library-disclosure" aria-hidden="true">▼/);
  assert.doesNotMatch(controllerSource, /<strong>资源库<\/strong>/);
  assert.match(relationshipCss, /\.relationship-resource-library-trigger\[aria-expanded="false"\] \.relationship-library-disclosure\s*\{[^}]*rotate\(-90deg\)/s);
  assert.match(relationshipCss, /\.relationship-panel-dock > \.relationship-resource-panel\s*\{[^}]*border: 0/s);
  assert.match(controllerSource, /_panelMoveControls\('library', '资源库'\)/);
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

test('应用中未打开的隐藏对话框模板不会阻止白板键盘平移', () => {
  const { controller, key, viewport } = keyboardPanFixture();
  controller.root.ownerDocument = { querySelectorAll: () => [{ getClientRects: () => [] }] };
  assert.deepEqual(key('d'), { handled: true, stopped: true });
  assert.equal(viewport.x, -40);
});

test('自由摆放下服务器树结构在同一白板切换，保留坐标且仓库相关性可切换与撤销', () => {
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
  controller._boardView().layout = 'free';
  const before = JSON.stringify(board.placements);
  controller.render = controller._renderGraph = controller.fitContent = controller._refreshHistoryButtons = () => {};
  controller._persistDynamicLayoutsSoon = () => {};
  assert.equal(controller._setStructure('server-tree'), true);
  assert.equal(JSON.stringify(controller.store.boards[0].placements), before);
  assert.equal(controller.store.boards.length, 1);
  assert.equal(controller._isServerTree(), true);
  assert.equal(controller._filteredGraph().summaryRelationships.length, 1);
  assert.equal(controller._setStructure('server-tree'), false, '重复点击不增加新白板');
  const click = () => controller._handleClick({ target: { closest: selector => selector.includes('[data-relationship-action]')
    ? { dataset: { relationshipAction: 'repository-relations' } } : null } });
  click();
  assert.equal(controller._boardView().showRepositoryRelations, true);
  click();
  assert.equal(controller._boardView().showRepositoryRelations, false);
  controller._restoreHistorySnapshot(controller.undoStack.at(-1));
  assert.equal(controller._boardView().showRepositoryRelations, true);
});

test('单个容器可从快捷工具条覆盖形状和显示样式，多边形自动保持等宽高', () => {
  const { controller } = nestedGroupFixture();
  for (const name of ['_renderGraph', '_refreshHistoryButtons', '_updateSummary', '_setCanvasAnnouncement']) controller[name] = () => {};
  controller._selectOnlyEntity('entity_outer001');
  const group = controller._placementForEntity('entity_outer001');
  group.groupWidth = 640; group.groupHeight = 360;
  assert.equal(controller._setGroupShape(group.entityId, 'polygon'), true);
  assert.equal(group.groupShape, 'polygon');
  assert.equal(group.groupWidth, group.groupHeight);
  assert.equal(controller._setGroupAppearance(group.entityId, 'outline'), true);
  assert.equal(group.groupAppearance, 'outline');
  assert.equal(controller._setGroupShape(group.entityId, 'inherit'), true);
  assert.equal(group.groupShape, undefined);
  assert.equal(controller.undoStack.length, 3);
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
  let centeredId = '';
  controller.flowCanvas = { setCenter: () => {} };
  controller._displayGeometryMap = () => ({ get: entityId => {
    centeredId = entityId;
    return { x: 80, y: 80, width: 280, height: 143 };
  } });
  const originalAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => callback();
  try {
    assert.equal(controller.revealResource('project', 'project_alpha01'), true);
    assert.equal(controller.store.entities.length, 1);
    assert.equal(controller.store.entities[0].refId, 'project_alpha01');
    assert.equal(controller.store.boards[0].placements.length, 1);
    assert.equal(controller.store.boards[0].view.mode, 'compact');
    assert.equal(controller.store.boards[0].view.query, '');
    assert.equal(controller.store.boards[0].view.entityType, 'all');
    assert.equal(controller.selectedEntityId, controller.store.entities[0].id);
    assert.equal(centeredId, controller.store.entities[0].id);
    assert.equal(controller.undoStack.length, 1);

    assert.equal(controller.revealResource('project', 'project_alpha01'), true);
    assert.equal(controller.store.entities.length, 1);
    assert.equal(controller.store.boards[0].placements.length, 1);
    assert.equal(controller.undoStack.length, 1);
  } finally {
    globalThis.requestAnimationFrame = originalAnimationFrame;
  }
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
