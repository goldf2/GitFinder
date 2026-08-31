// Deterministic UI fixture using the production controller. No real files, tokens or network.
const fixtureModel = window.RelationshipGraphModel;
let associations = [];
let scanned = false;
let scanCalls = 0;
const scenario = document.querySelector('#scenario');
const localRepos = () => [
  { id: 'repo_fixture_one', name: 'mes-lite', path: '/fixture/work/mes-lite', originUrl: 'git@github.com:example/mes-lite.git', available: true },
  ...(scenario.value === 'ambiguous' ? [{ id: 'repo_fixture_two', name: 'mes-lite (副本)', path: '/fixture/backup/mes-lite', originUrl: 'https://github.com/example/mes-lite', available: true }] : []),
  { id: 'repo_fixture_other', name: 'other-app', path: '/fixture/other-app', originUrl: 'https://github.com/example/other-app', available: true }
];
const fixtureBridge = {
  config: { getTreeRoots: async () => [{ path: '/fixture/work' }] },
  fs: {
    inspectWorkspaceDirectories: async paths => ({ directories: paths.map(path => ({ path, available: true })) }),
    findGitRepos: async () => { scanCalls++; document.querySelector('#scan-count').textContent = `磁盘扫描次数：${scanCalls}`; return localRepos(); }
  },
  relationshipBoards: { get: async () => ({ store: fixtureModel.defaultStore() }), save: async store => ({ store }) },
  repos: { getRegistry: async () => ({ repos: localRepos() }), merge: async () => { scanned = true; } },
  localProjects: { list: async () => [] },
  panel: {
    getLocalRepositories: async () => scenario.value === 'scan' && !scanned ? [] : localRepos(),
    getRepositoryAssociations: async () => associations,
    setRepositoryAssociation: async value => {
      associations = associations.filter(item => item.providerId !== value.providerId || item.resourceUuid !== value.resourceUuid);
      if (value.mode !== 'automatic') associations.push(value);
      return associations;
    },
    getTopology: async () => ({
      state: 'ready', provider: { providerId: 'coolify_fixture', label: '测试主机' },
      bindings: scenario.value === 'project' ? [{ projectId: 'project_fixture', providerId: 'coolify_fixture', resourceUuid: 'deploy_fixture', repositoryIds: ['repo_fixture_other'] }] : [],
      topology: {
        generatedAt: new Date().toISOString(),
        servers: [{ nodeId: 'host_fixture', name: 'host', status: 'online', latencyMs: null, observedAt: new Date().toISOString() }],
        deployments: [{ resourceUuid: 'deploy_fixture', nodeId: 'host_fixture', name: 'MES 生产部署', status: 'running:healthy',
          repositoryUrl: scenario.value === 'no-source' ? '' : 'https://github.com/example/mes-lite.git', branch: 'main', commit: 'a24c7e1234567890', commitSource: 'deployment-history', lastDeployment: { status: 'finished' }, serverName: 'host', latencyMs: null, recentFailure: { known: false }, domains: ['https://fixture.example'], observedAt: new Date().toISOString() },
          { resourceUuid: 'deploy_staging', nodeId: 'host_fixture', name: 'MES 灰度部署', status: 'exited', repositoryUrl: scenario.value === 'no-source' ? '' : 'https://github.com/example/mes-lite.git', branch: 'staging', commit: 'b35d8f2234567890', commitSource: 'deployment-history', lastDeployment: { status: 'failed' }, domains: [], observedAt: new Date().toISOString() }]
      }
    })
  }
};
const fixtureController = new window.RelationshipBoardController.Controller({ bridge: fixtureBridge, notify: message => { document.querySelector('#notice').textContent = message; }, onOpenDirectory: directory => { document.querySelector('#notice').textContent = `跳转本地目录：${directory}（隔离预览，不访问真实文件）`; } });
function inspectFixture() {
  const entity = fixtureController.panelProjection.entities.find(item => item.type === 'deployment');
  if (!entity) return;
  fixtureController._selectOnlyEntity(entity.id);
  fixtureController._renderInspector();
}
async function refreshFixture() { await fixtureController._refreshPanelTopology(); inspectFixture(); }
scenario.addEventListener('change', async () => { associations = []; scanned = false; scanCalls = 0; document.querySelector('#scan-count').textContent = '磁盘扫描次数：0'; await refreshFixture(); });
document.querySelector('#inspect').addEventListener('click', inspectFixture);
document.querySelector('#refresh').addEventListener('click', refreshFixture);
fixtureController.open(document.querySelector('#board')).then(refreshFixture);
