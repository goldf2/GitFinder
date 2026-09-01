// Production controller with an in-memory bridge; no real resources or credentials.
window.addEventListener('error', event => { document.querySelector('#notice').textContent = event.message; });
let savedGroups = window.RelationshipGraphModel.assertValidStore({
  schemaVersion: 1, activeBoardId: 'board_groupdemo', relationships: [],
  entities: [
    { id: 'entity_demoone1', type: 'server', name: '开发主机', details: {} },
    { id: 'entity_demotwo1', type: 'deployment', name: '预览部署', details: { status: 'running' } },
    { id: 'entity_demogroup', type: 'group', name: '生产环境', details: {} },
    { id: 'entity_demochild', type: 'group', name: '服务组', details: {} }
  ],
  boards: [{ id: 'board_groupdemo', name: '群组验证', viewport: { x: 30, y: 30, zoom: 0.8 }, placements: [
    { entityId: 'entity_demoone1', x: 608, y: 184, groupId: 'entity_demochild' },
    { entityId: 'entity_demotwo1', x: 40, y: 340 },
    { entityId: 'entity_demogroup', x: 550, y: 50, groupBackground: '#14b8a6', groupBorder: '#0f766e' },
    { entityId: 'entity_demochild', x: 580, y: 130, groupId: 'entity_demogroup', groupBackground: '#f59e0b', groupBorder: '#b45309' }
  ] }]
});
const copyGroups = value => JSON.parse(JSON.stringify(value));
const savedPanelPreferences = {};
let fixtureAssociations = [];
let fixtureRepositories = [];
let fixtureTopology = { state: 'unconfigured', topology: {} };
const setFixtureTopology = result => { fixtureTopology = copyGroups(result); groupController._setPanelTopology(result); };
const showSavedGroups = () => {
  document.querySelector('#saved-state').textContent = JSON.stringify(savedGroups.boards[0].placements.map(item => ({
    name: savedGroups.entities.find(entity => entity.id === item.entityId)?.name,
    x: item.x, y: item.y,
    group: savedGroups.entities.find(entity => entity.id === item.groupId)?.name || '顶层',
    background: item.groupBackground, border: item.groupBorder,
    layout: item.groupLayout, width: item.groupWidth, height: item.groupHeight
  })));
};
const groupController = new window.RelationshipBoardController.Controller({ bridge: {
  platform: 'darwin',
  panel: { getTopology: async () => copyGroups(fixtureTopology), getLocalRepositories: async () => copyGroups(fixtureRepositories), setRepositoryAssociation: async value => {
    fixtureAssociations = fixtureAssociations.filter(item => item.providerId !== value.providerId || item.resourceUuid !== value.resourceUuid).concat([copyGroups(value)]);
    return copyGroups(fixtureAssociations);
  } },
  config: { get: async key => copyGroups(savedPanelPreferences[key] ?? null), set: async (key, value) => { savedPanelPreferences[key] = copyGroups(value); } },
  relationshipBoards: {
    get: async () => ({ store: copyGroups(savedGroups) }),
    save: async store => { savedGroups = copyGroups(store); showSavedGroups(); return { store }; }
  },
  repos: { getRegistry: async () => ({ repos: copyGroups(fixtureRepositories) }) },
  localProjects: { list: async () => [] }
}, notify: message => { document.querySelector('#notice').textContent = message; } });
document.querySelector('#select-cards').addEventListener('click', () => {
  groupController._setEntitySelection(new Set(['entity_demoone1', 'entity_demotwo1']), 'entity_demotwo1');
  groupController._updateSelectionCss();
});
document.querySelector('#reload-layout').addEventListener('click', async () => {
  await groupController._persistNow();
  groupController.close();
  groupController.loaded = false;
  await groupController.open(document.querySelector('#board'));
});
showSavedGroups();
groupController.open(document.querySelector('#board'));
document.querySelector('#load-large-groups').addEventListener('click', () => {
  const board = groupController.store.boards[0];
  board.view.layout = 'compact';
  for (const item of board.placements.filter(p => ['entity_demogroup', 'entity_demochild'].includes(p.entityId))) {
    Object.assign(item, { groupLayout: 'manual', groupWidth: 900, groupHeight: 2600 });
  }
  groupController._persistSoon(0); groupController.render(); groupController.fitContent();
});
document.querySelector('#check-toolbar').addEventListener('click', async event => {
  event.target.disabled = true;
  const board = groupController.store.boards.find(item => item.id === groupController.store.activeBoardId);
  const viewport = { ...board.viewport };
  const workspace = document.querySelector('.fixture-workspace');
  const root = groupController.root;
  const toolbar = root.querySelector('.relationship-toolbar');
  const layoutButton = root.querySelector('[data-layout-menu="layout"]');
  const canvas = root.querySelector('.relationship-canvas');
  const frames = [];
  const bounds = () => [toolbar, layoutButton, canvas].flatMap(el => {
    const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
  });
  try {
    for (const width of [940, 1100, 1280]) {
      workspace.style.maxWidth = `${width}px`;
      let initial;
      for (let frame = 0; frame < 60; frame++) {
        groupController.endpointChecksPending = frame % 3 === 0 ? 18 : frame % 3 === 1 ? 1 : 0;
        groupController._updateEndpointCheckStatus();
        void groupController.flowCanvas?.zoomTo(
          Math.min(8, Math.max(0.03, 0.05 * 50 ** ((Math.sin(frame / 6) + 1) / 2))),
          { duration: 140 }
        );
        groupController._setSaveState(frame % 2 ? 'saved' : 'saving');
        await new Promise(requestAnimationFrame);
        const current = bounds();
        initial ||= current;
        const r = layoutButton.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        frames.push({ width, frame, shifted: current.some((n, i) => Math.abs(n - initial[i]) > 0.5),
          missing: !toolbar.isConnected || !(hit === layoutButton || layoutButton.contains(hit)) });
      }
    }
    document.querySelector('#notice').textContent = `工具栏检查 ${frames.length} 帧：位置变化 ${frames.filter(f => f.shifted).length}，遮挡/重建 ${frames.filter(f => f.missing).length}`;
  } catch (error) {
    document.querySelector('#notice').textContent = `工具栏检查失败：${error.message}`;
  } finally {
    workspace.style.maxWidth = '';
    board.viewport = viewport;
    groupController.endpointChecksPending = 0;
    groupController._updateEndpointCheckStatus(); groupController._applyViewport();
    event.target.disabled = false;
  }
});
document.querySelector('#load-tree').addEventListener('click', () => {
  groupController.store = window.RelationshipGraphModel.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_treepreview', entities: [], relationships: [],
    boards: [{ id: 'board_treepreview', name: '服务器项目树', placements: [], viewport: { x: 0, y: 0, zoom: 1 },
      view: { structure: 'server-tree', layout: 'bilateral' } }] });
  groupController.dynamicLayoutStore = { version: 1, boards: {} };
  fixtureRepositories = Array.from({ length: 7 }, (_, i) => ({ id: `repo_layout${i}`, name: `source-${i}`, path: `/synthetic/source-${i}`, originUrl: `https://github.com/example/source-${i}.git` }));
  groupController.panelRepositories = copyGroups(fixtureRepositories);
  groupController._setResources([], groupController.panelRepositories);
  setFixtureTopology({ state: 'ready', provider: { providerId: 'coolify_tree_demo', label: '演示' }, topology: {
    generatedAt: new Date().toISOString(), servers: [0, 1].map(i => ({ nodeId: `tree_host${i}`, name: `生产主机 ${i + 1}`, status: 'online', latencyMs: 8, observedAt: new Date().toISOString() })),
    deployments: Array.from({ length: 21 }, (_, index) => {
      const name = ['订单', '企业官网', '数据工具', '内容站点', '在线商城', '资料平台', '测试项目'][Math.floor(index / 3)];
      return { resourceUuid: `tree_app_${index}`, nodeId: index < 15 ? 'tree_host0' : 'tree_host1',
      projectUuid: `tree_project_${Math.floor(index / 3)}`, projectName: name, name: `${name} · ${['生产', '预览', '测试'][index % 3]}`, repositoryUrl: fixtureRepositories[Math.floor(index / 3)].originUrl,
      environmentName: 'production', status: index === 2 ? 'exited' : 'running:healthy', latencyMs: 12, observedAt: new Date().toISOString(),
      domains: [`https://site${index}.example.com`, ...(index % 5 === 0 ? [`https://api${index}.example.com`] : [])] }; })
  } });
  groupController._clearEntitySelection();
  groupController.render(); groupController._arrangeCurrentLayout(); groupController._renderGraph(); groupController.fitContent();
});
document.querySelector('#export-layout-data').addEventListener('click', () => {
  const store = groupController._buildActiveBoardExportStore();
  store.boards[0].name = 'alpha47 群组标题留白验收（隔离数据）';
  document.querySelector('#layout-export').hidden = false;
  document.querySelector('#layout-export').textContent = JSON.stringify({ format: 'gitfinder.relationship-board', formatVersion: 1, store });
});
document.querySelector('#load-linked-drag').addEventListener('click', () => {
  groupController.store = window.RelationshipGraphModel.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_linkedpreview', entities: [], relationships: [],
    boards: [{ id: 'board_linkedpreview', name: '下级联动验收', placements: [], viewport: { x: 0, y: 0, zoom: 1 }, view: { structure: 'server-tree', layout: 'right', snapMode: 'off' } }] });
  groupController.dynamicLayoutStore = { version: 1, boards: {} };
  document.querySelector('#load-coolify').click();
  groupController._clearEntitySelection();
  groupController.render(); groupController._arrangeCurrentLayout(); groupController._renderGraph(); groupController.fitContent();
});
document.querySelector('#load-auto-stack').addEventListener('click', () => {
  const groupId = 'entity_panel_projectgroup_stackdemo';
  const deploymentIds = Array.from({ length: 8 }, (_, index) => `entity_stackdemo_${index}`);
  groupController.store = window.RelationshipGraphModel.assertValidStore({
    schemaVersion: 1,
    activeBoardId: 'board_stackdemo',
    entities: [
      { id: groupId, type: 'group', name: 'Project 自动排列回归', details: {} },
      ...deploymentIds.map((id, index) => ({ id, type: 'deployment', name: `部署 ${index + 1}`, details: { status: index % 3 ? 'running:healthy' : 'exited' } }))
    ],
    relationships: [],
    boards: [{
      id: 'board_stackdemo',
      name: 'Project 堆叠回归',
      viewport: { x: 0, y: 0, zoom: 1 },
      view: { structure: 'coolify-projects', layout: 'compact', projectGroupShape: 'rounded', horizontalSpacing: 64, verticalSpacing: 36 },
      placements: [
        { entityId: groupId, x: 80, y: 80, groupWidth: 1800, groupHeight: 520, groupShape: 'rounded', groupLayout: 'manual' },
        ...deploymentIds.map((entityId, index) => ({ entityId, x: 700 + index * 12, y: 220 + index * 8, groupId }))
      ]
    }]
  });
  groupController.dynamicLayoutStore = { version: 1, boards: {} };
  setFixtureTopology({ state: 'unconfigured', topology: {} });
  groupController._clearEntitySelection();
  groupController.render();
  groupController.fitContent();
});
document.querySelector('#load-coolify').addEventListener('click', () => {
  setFixtureTopology({ state: 'ready', provider: { providerId: 'coolify_demo', label: 'Demo' }, topology: {
    servers: [{ nodeId: 'host_1', name: '主机一', status: 'online' }, { nodeId: 'host_2', name: '主机二', status: 'online' }],
    deployments: [
      { resourceUuid: 'app_one', nodeId: 'host_1', projectUuid: 'mes_project', projectName: 'MES', name: '生产部署', repositoryUrl: 'https://github.com/example/shared-source.git', environmentName: 'production', status: 'running:healthy', domains: ['https://mes.example.com', 'https://api.mes.example.com'] },
      { resourceUuid: 'app_two', nodeId: 'host_1', projectUuid: 'mes_project', projectName: 'MES', name: '测试部署', environmentName: 'staging', status: 'exited', domains: [] },
      { resourceUuid: 'app_three', nodeId: 'host_2', projectUuid: 'tools_project', projectName: '工具', name: '工具站点', repositoryUrl: 'git@github.com:example/shared-source.git', environmentName: 'production', status: 'running:healthy', domains: ['https://tools.example.com', 'https://api.mes.example.com'] }
    ]
  } });
  groupController._renderResources();
  groupController._renderGraph();
  groupController._updateSummary();
  groupController._updatePanelStatus();
  groupController.fitContent();
});

document.querySelector('#load-routing').addEventListener('click', () => {
  const nodes = [
    ['repository', '代码仓库', 30, 100], ['deployment', '生产部署', 650, 100],
    ['server', '运行主机', 650, 470], ['endpoint', 'web.example.com', 1200, 100],
    ['endpoint', 'api.example.com', 1200, 470], ['deployment', '路径中间的卡片', 340, 60]
  ];
  const id = index => `entity_routing${index}`;
  groupController.store = window.RelationshipGraphModel.assertValidStore({
    schemaVersion: 1, activeBoardId: 'board_routingdemo',
    entities: nodes.map(([type, name], index) => ({ id: id(index), type, name, details: {},
      ...(type === 'repository' ? { refId: 'repo_routingdemo' } : {}) })),
    relationships: [[0, 1, 'source_of'], [1, 2, 'runs_on'], [1, 3, 'exposes'], [1, 4, 'exposes']]
      .map(([from, to, type], index) => ({ id: `relationship_routing${index}`, sourceId: id(from), targetId: id(to), type })),
    boards: [{ id: 'board_routingdemo', name: '拓扑与避障验证', viewport: { x: 30, y: 30, zoom: 0.65 },
      placements: nodes.map(([, , x, y], index) => ({ entityId: id(index), x, y })) }]
  });
  setFixtureTopology({ state: 'unconfigured', topology: {} });
  groupController._clearEntitySelection();
  groupController.render();
  groupController.fitContent();
});

document.querySelector('#load-long-routing').addEventListener('click', () => {
  const entities = [{ id: 'entity_longhost', type: 'server', name: '共享主机', details: {} }];
  const placements = [{ entityId: 'entity_longhost', x: 3600, y: 5000 }];
  const relationships = [];
  for (const [group, count, x, y] of [[0, 15, 0, 0], [1, 3, 4000, 400], [2, 3, 4800, 3000]]) {
    const groupId = `entity_longgroup${group}`;
    entities.push({ id: groupId, type: 'group', name: `项目组 ${group + 1}`, details: {} });
    placements.push({ entityId: groupId, x: x - 24, y: y - 56, groupBackground: '#8b5cf6' });
    for (let i = 0; i < count; i++) {
      const id = `entity_longcard${group}_${i}`;
      entities.push({ id, type: 'deployment', name: `部署 ${group + 1}-${i + 1}`, details: { status: 'running' } });
      placements.push({ entityId: id, x: x + i % 6 * 480, y: y + Math.floor(i / 6) * 350, groupId });
      relationships.push({ id: `relationship_longroute${group}_${i}`, sourceId: id, targetId: 'entity_longhost', type: 'runs_on' });
    }
  }
  groupController.store = window.RelationshipGraphModel.assertValidStore({
    schemaVersion: 1, activeBoardId: 'board_longrouting', entities, relationships,
    boards: [{ id: 'board_longrouting', name: '跨群组长连线验证', viewport: { x: 30, y: 30, zoom: 0.1 }, placements }]
  });
  setFixtureTopology({ state: 'unconfigured', topology: {} });
  groupController._clearEntitySelection();
  groupController.render();
  groupController.fitContent();
});
