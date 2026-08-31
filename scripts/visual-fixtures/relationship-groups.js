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
const showSavedGroups = () => {
  document.querySelector('#saved-state').textContent = JSON.stringify(savedGroups.boards[0].placements.map(item => ({
    name: savedGroups.entities.find(entity => entity.id === item.entityId)?.name,
    x: item.x, y: item.y,
    group: savedGroups.entities.find(entity => entity.id === item.groupId)?.name || '顶层',
    background: item.groupBackground, border: item.groupBorder
  })));
};
const groupController = new window.RelationshipBoardController.Controller({ bridge: {
  platform: 'darwin',
  panel: { setRepositoryAssociation: async value => {
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
document.querySelector('#load-tree').addEventListener('click', () => {
  groupController.store = window.RelationshipGraphModel.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_treepreview', entities: [], relationships: [],
    boards: [{ id: 'board_treepreview', name: '服务器项目树', placements: [], viewport: { x: 0, y: 0, zoom: 1 },
      view: { topologyLayout: 'server-tree', treeLayout: 'bilateral' } }] });
  groupController.expandedCardIds.clear();
  groupController.cardHeights.clear();
  groupController.dynamicLayoutStore = { version: 1, boards: {} };
  fixtureRepositories = [{ id: 'repo_demo_shared', name: 'shared-source', path: '/workspace/shared-source', originUrl: 'https://github.com/example/shared-source.git' }];
  groupController.panelRepositories = copyGroups(fixtureRepositories);
  const repo = groupController.panelRepositories[0];
  groupController._setResources([], groupController.panelRepositories);
  groupController._setPanelTopology({ state: 'ready', provider: { providerId: 'coolify_tree_demo', label: '演示' }, topology: {
    generatedAt: new Date().toISOString(), servers: [{ nodeId: 'tree_host', name: '生产主机', status: 'online', latencyMs: 8, observedAt: new Date().toISOString() }],
    deployments: ['订单', '企业官网', '数据工具', '内容站点'].map((name, index) => ({ resourceUuid: `tree_app_${index}`, nodeId: 'tree_host',
      projectUuid: `tree_project_${index}`, projectName: name, name: `${name}部署`, repositoryUrl: repo.originUrl,
      environmentName: 'production', status: index === 2 ? 'exited' : 'running:healthy', latencyMs: 12, observedAt: new Date().toISOString(),
      domains: [`https://site${index}.example.com`, ...(index === 0 ? ['https://api.example.com'] : [])] }))
  } });
  groupController._clearEntitySelection();
  groupController.render(); groupController._arrangeServerTree(); groupController._renderGraph(); groupController.fitContent();
});
document.querySelector('#load-coolify').addEventListener('click', () => {
  groupController._setPanelTopology({ state: 'ready', provider: { providerId: 'coolify_demo', label: 'Demo' }, topology: {
    servers: [{ nodeId: 'host_1', name: '主机一', status: 'online' }, { nodeId: 'host_2', name: '主机二', status: 'online' }],
    deployments: [
      { resourceUuid: 'app_one', nodeId: 'host_1', projectUuid: 'mes_project', projectName: 'MES', name: '生产部署', repositoryUrl: 'https://github.com/example/shared-source.git', environmentName: 'production', status: 'running:healthy', domains: ['https://mes.example.com', 'https://api.mes.example.com'] },
      { resourceUuid: 'app_two', nodeId: 'host_1', projectUuid: 'mes_project', projectName: 'MES', name: '测试部署', environmentName: 'staging', status: 'exited', domains: [] },
      { resourceUuid: 'app_three', nodeId: 'host_2', projectUuid: 'tools_project', projectName: '工具', name: '工具站点', repositoryUrl: 'git@github.com:example/shared-source.git', environmentName: 'production', status: 'running:healthy', domains: ['https://tools.example.com'] }
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
  groupController._setPanelTopology({ state: 'unconfigured', topology: {} });
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
  groupController._setPanelTopology({ state: 'unconfigured', topology: {} });
  groupController._clearEntitySelection();
  groupController.render();
  groupController.fitContent();
});
