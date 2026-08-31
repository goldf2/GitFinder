// Isolated fixture: simulated transport results, no account, network probes or user files.
const cloneHealth = value => structuredClone(value);
let healthStore = RelationshipGraphModel.normalizeStore({ schemaVersion: 1, activeBoardId: 'board_health0001', entities: [], relationships: [], boards: [
  { id: 'board_health0001', name: '检测验证', viewport: { x: 20, y: 20, zoom: 1 }, view: { topologyLayout: 'coolify-projects' }, placements: [] }
] }).value;
const healthPreferences = {};
const healthProvider = { providerId: 'coolify_demo', label: '测试数据' };
const healthStates = ['reachable', 'http_error', 'restricted', 'timeout', 'tls_error', 'blocked'];
let healthCount = 6;
let healthSingleProject = false;
let healthChecks = [];
let healthRound = 0;
const healthTopology = () => ({ state: 'ready', provider: healthProvider, topology: { generatedAt: new Date().toISOString(), servers: [], deployments: Array.from({ length: healthCount }, (_, index) => ({
  providerId: healthProvider.providerId, providerLabel: healthProvider.label, resourceUuid: `app_${index}`, projectUuid: healthSingleProject ? 'project_one' : `project_${index}`,
  projectName: healthSingleProject ? '单个长项目' : `项目 ${index + 1}`, name: `部署 ${index + 1}`, status: 'running:healthy', observedAt: new Date().toISOString(),
  domains: [`https://www.long-domain-${index + 1}.example.com`]
})), endpointChecks: cloneHealth(healthChecks) } });
const healthSnapshot = () => ({ checks: cloneHealth(healthChecks), pending: healthChecks.filter(check => check.checking).length });
const healthController = new RelationshipBoardController.Controller({ bridge: {
  config: { get: async key => cloneHealth(healthPreferences[key] ?? null), set: async (key, value) => { healthPreferences[key] = cloneHealth(value); } },
  relationshipBoards: { get: async () => ({ store: cloneHealth(healthStore) }), save: async store => { healthStore = cloneHealth(store); return { store }; } },
  repos: { getRegistry: async () => ({ repos: [] }) }, localProjects: { list: async () => [] },
  panel: {
    getTopology: async () => healthTopology(), getEndpointChecks: async () => healthSnapshot(),
    checkEndpoints: async values => {
      healthRound++;
      const targets = healthTopology().topology.deployments.flatMap(item => item.domains);
      healthChecks = targets.map(url => ({ ...(healthChecks.find(check => check.url === url) || { providerId: healthProvider.providerId, url, status: 'unknown' }), checking: !values?.url || values.url === url }));
      setTimeout(() => { healthChecks = healthChecks.map((check, index) => check.checking ? { ...check, checking: false,
        status: healthStates[index % healthStates.length], httpStatus: [200, 503, 401, null, null, null][index % 6], latencyMs: index % 6 < 3 ? 40 + healthRound : null,
        checkedAt: new Date().toISOString(), message: index % 6 === 5 ? '内网、回环或保留地址，未检测' : '' } : check); }, 1200);
      return healthSnapshot();
    }
  }
}, notify: message => { document.querySelector('#notice').textContent = message; } });
healthController.open(document.querySelector('#board'));
document.querySelector('#reload').addEventListener('click', async () => {
  await healthController._persistNow();
  await healthController._persistDynamicLayoutsNow();
  healthController.close(); healthController.loaded = false;
  await healthController.open(document.querySelector('#board'));
});
for (const [id, single] of [['many', false], ['single', true]]) document.getElementById(id).addEventListener('click', async () => {
  healthCount = 24; healthSingleProject = single;
  await healthController._refreshPanelTopology();
  healthController._arrangeByCoolifyProjects();
});
