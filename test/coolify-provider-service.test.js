const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CoolifyProviderService,
  normalizeCoolifyBaseUrl,
  normalizeCoolifyResource,
  requestCoolifyJson,
  readCoolifyOverview
} = require('../src/main/services/coolifyProviderService');

function jsonResponse(value, status = 200) {
  const body = Buffer.from(JSON.stringify(value));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : '' },
    arrayBuffer: async () => body
  };
}

function createHarness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-2-coolify-'));
  const projectPath = path.join(root, 'project');
  fs.mkdirSync(path.join(projectPath, '.gitfinder'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.toString(), path: parsed.pathname, method: options.method, authorization: options.headers.Authorization });
    if (parsed.pathname === '/api/v1/applications') return jsonResponse([{
      id: 11,
      uuid: 'app_1',
      name: 'MES Lite',
      status: 'running:healthy',
      fqdn: 'https://mes.example.com',
      git_repository: 'https://github.com/example/mes-lite.git',
      git_branch: 'main',
      git_commit_sha: '0123456789abcdef',
      environment_id: 21,
      server_id: 31,
      updated_at: '2026-08-29T05:30:00.000Z'
    }]);
    if (parsed.pathname === '/api/v1/services') return jsonResponse([{
      id: 12,
      uuid: 'service_1',
      name: 'Redis',
      status: 'running',
      environment_id: 21,
      server_id: 31,
      updated_at: '2026-08-29T05:20:00.000Z'
    }]);
    if (parsed.pathname === '/api/v1/databases') return jsonResponse([]);
    if (parsed.pathname === '/api/v1/servers') return jsonResponse([{
      id: 31,
      uuid: 'server_1',
      name: 'Con01',
      updated_at: '2026-08-29T05:31:00.000Z',
      settings: { is_reachable: true, is_usable: true }
    }]);
    if (parsed.pathname === '/api/v1/projects') return jsonResponse([{
      id: 41,
      uuid: 'project_1',
      name: 'Manufacturing'
    }]);
    if (parsed.pathname === '/api/v1/projects/project_1') return jsonResponse({
      id: 41,
      uuid: 'project_1',
      name: 'Manufacturing',
      environments: [{ id: 21, uuid: 'environment_1', name: 'production' }]
    });
    if (parsed.pathname === '/api/v1/deployments/applications/app_1') return jsonResponse([{
      deployment_uuid: 'deployment_1',
      status: 'failed',
      commit: '0123456789abcdef',
      created_at: '2026-08-29T05:00:00.000Z',
      updated_at: '2026-08-29T05:02:00.000Z',
      commit_message: 'health check failed'
    }]);
    return jsonResponse({ message: 'not found' }, 404);
  };
  const projectService = {
    getProject(candidatePath) {
      assert.equal(candidatePath, projectPath);
      return { path: projectPath, projectId: 'project_local_1' };
    }
  };
  const service = new CoolifyProviderService({
    configDirectory: root,
    projectService,
    fetchImpl,
    now: () => new Date('2026-08-29T05:32:00.000Z')
  });
  return { root, projectPath, calls, fetchImpl, projectService, service };
}

test('访问点检测独立于拓扑加载，只能重测已发现地址，断开后撤销目标', async t => {
  const { service } = createHarness(t);
  const probes = [];
  service.endpointHealth.probe = async url => { probes.push(url); return { status: 'reachable', httpStatus: 200, latencyMs: 42, checkedAt: '2026-08-31T01:00:00Z', pageTitle: 'MES 控制台' }; };
  const provider = await service.connect({ baseUrl: 'https://cool.example.com', token: 'fixture-read-token' });
  const topology = await service.getTopology();
  assert.deepEqual(probes, []);
  assert.equal(topology.topology.endpointChecks[0].status, 'unknown');
  assert.throws(() => service.checkEndpoints({ providerId: provider.providerId, url: 'https://arbitrary.example.com' }), /访问点不存在/);
  assert.equal(service.checkEndpoints().pending, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(service.getEndpointChecks().checks[0].httpStatus, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(service.configDirectory, 'coolify-topology-cache.json'), 'utf8')).snapshot.topology.endpointChecks[0].pageTitle, 'MES 控制台');
  assert.deepEqual(probes, ['https://mes.example.com/']);
  assert.doesNotMatch(JSON.stringify(service.getEndpointChecks()), /token|Authorization/);
  assert.equal((await service.getTopology()).topology.endpointChecks[0].latencyMs, 42);
  service.disconnect(provider.providerId);
  assert.deepEqual(service.getEndpointChecks(), { checks: [], pending: 0 });
});

test('本机手工关联与暂停模式可跨重启读取，不写项目文件且无令牌', async t => {
  const { service, root } = createHarness(t);
  const provider = await service.connect({ baseUrl: 'https://cool.example.com', token: 'fixture-read-token' });
  service.getRegistry = () => ({ repos: [{ id: 'repo_1', path: '/app' }, { id: 'archived', path: '/old', archived: true }] });
  const identity = { providerId: provider.providerId, resourceUuid: 'app_1' };
  service.setRepositoryAssociation({ ...identity, mode: 'manual', repositoryIds: ['repo_1'], accessToken: 'never-store' });
  const restarted = new CoolifyProviderService({ configDirectory: root, getRegistry: service.getRegistry });
  assert.deepEqual(restarted.getRepositoryAssociations()[0], { ...identity, mode: 'manual', repositoryIds: ['repo_1'] });
  assert.throws(() => restarted.setRepositoryAssociation({ ...identity, mode: 'manual', repositoryIds: ['archived'] }), /注册表/);
  restarted.setRepositoryAssociation({ ...identity, mode: 'disabled' });
  assert.equal(service.getRepositoryAssociations()[0].mode, 'disabled');
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'coolify-repository-associations.json'), 'utf8'), /token|https|\/app|projectId/);
  restarted.setRepositoryAssociation({ ...identity, mode: 'automatic' });
  assert.deepEqual(service.getRepositoryAssociations(), []);
  assert.equal(fs.existsSync(path.join(root, 'project', '.gitfinder', 'deployments.json')), false);
});

test('自动匹配读取现有仓库的当前 origin，不用陈旧缓存或触发远程访问', async t => {
  const { service, root } = createHarness(t);
  const repoPath = path.join(root, 'local');
  fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
  service.getRegistry = () => ({ repos: [
    { id: 'repo_1', path: repoPath, originUrl: 'https://github.com/old/app' },
    { id: 'missing', path: path.join(root, 'missing'), originUrl: 'https://github.com/old/app' },
    { id: 'archived', path: repoPath, archived: true }
  ] });
  let reads = 0;
  service.readOrigin = async directory => { assert.equal(directory, repoPath); reads++; return 'https://user:secret@github.com/new/app.git'; };
  const repos = await service.getLocalRepositories();
  assert.equal(reads, 1);
  assert.equal(repos.length, 2);
  assert.equal(repos[0].repositoryKey, 'github.com/new/app');
  assert.equal(repos[1].available, false);
  assert.equal(repos[1].repositoryKey, '');
  assert.doesNotMatch(JSON.stringify(repos), /secret|github.com\/old/);
});

test('Coolify 地址只接受站点根地址和安全协议', () => {
  assert.equal(normalizeCoolifyBaseUrl('https://cool.example.com/api/v1'), 'https://cool.example.com');
  assert.equal(normalizeCoolifyBaseUrl('http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
  assert.throws(() => normalizeCoolifyBaseUrl('http://cool.example.com'), /HTTPS/);
  assert.throws(() => normalizeCoolifyBaseUrl('https://user:secret@cool.example.com'), /凭据/);
  assert.throws(() => normalizeCoolifyBaseUrl('https://cool.example.com/project/one'), /根地址/);
});

test('Coolify 网络失败保留可诊断但不泄露地址或令牌的错误码', async () => {
  const error = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ETIMEDOUT' } });
  await assert.rejects(
    requestCoolifyJson({ baseUrl: 'https://cool.example.com', token: 'fixture-secret-token', pathname: '/api/v1/servers', fetchImpl: async () => { throw error; } }),
    failure => {
      assert.match(failure.message, /网络连接失败|连接超时/);
      assert.match(failure.message, /ETIMEDOUT/);
      assert.doesNotMatch(failure.message, /cool\.example\.com|fixture-secret-token/);
      return true;
    }
  );
});

test('直接读取 Coolify 官方只读端点并归一化主机、部署和最近失败', async t => {
  const { calls, fetchImpl } = createHarness(t);
  const overview = await readCoolifyOverview({
    baseUrl: 'https://cool.example.com',
    token: 'coolify-read-token-123',
    fetchImpl,
    observedAt: '2026-08-29T05:32:00.000Z'
  });
  assert.equal(overview.servers[0].nodeId, 'server_1');
  assert.equal(overview.deployments.length, 2);
  assert.equal(overview.deployments[0].projectUuid, 'project_1');
  assert.equal(overview.deployments[0].environmentUuid, 'environment_1');
  assert.equal(overview.deployments[0].serverName, 'Con01');
  assert.deepEqual(overview.deployments[0].domains, ['https://mes.example.com']);
  assert.equal(overview.deployments[0].recentFailure.known, true);
  assert.equal(overview.deployments[0].recentFailure.hasFailure, true);
  assert.equal(overview.deployments[1].recentFailure.known, false);
  assert.deepEqual(overview.deploymentHistory, { mode: 'full', requested: 1, total: 1, deferred: 0 });
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.ok(calls.every(call => call.authorization === 'Bearer coolify-read-token-123'));
  assert.equal(calls.some(call => call.path.startsWith('/api/gitfinder/')), false);
});

test('拓扑快速路径限制部署历史请求，不让大规模应用列表阻塞首屏', async t => {
  const { calls, fetchImpl } = createHarness(t);
  const overview = await readCoolifyOverview({
    baseUrl: 'https://cool.example.com',
    token: 'fixture-read-token',
    fetchImpl,
    deploymentHistoryMode: 'fast',
    deploymentHistoryLimit: 0
  });
  assert.deepEqual(overview.deploymentHistory, { mode: 'fast', requested: 0, total: 1, deferred: 1 });
  assert.equal(calls.some(call => call.path.startsWith('/api/v1/deployments/applications/')), false);
  assert.equal(overview.deployments[0].recentFailure.known, false);
});

test('getTopology 使用快速部署历史模式，目录详情仍可单独读取完整历史', async t => {
  const { service } = createHarness(t);
  await service.connect({ baseUrl: 'https://cool.example.com', token: 'fixture-read-token' });
  const optionsSeen = [];
  service._overview = async (provider, options) => {
    optionsSeen.push(options);
    return {
      generatedAt: '2026-08-29T05:32:00.000Z',
      servers: [],
      deployments: [],
      errors: [],
      deploymentHistory: { mode: options.deploymentHistoryMode || 'full', requested: 0, total: 0, deferred: 0 }
    };
  };
  await service.getTopology();
  assert.equal(optionsSeen[0].deploymentHistoryMode, 'fast');
  optionsSeen.length = 0;
  service._overview = async (provider, options) => {
    optionsSeen.push(options);
    return { generatedAt: '2026-08-29T05:32:00.000Z', servers: [], deployments: [], errors: [] };
  };
  await service.getCatalog();
  assert.equal(optionsSeen[0].deploymentHistoryMode, undefined);
});

test('字段归一化不把未知部署历史伪装成没有失败', () => {
  const resource = normalizeCoolifyResource({ uuid: 'app_1', name: 'App', status: 'running' }, 'application', {
    observedAt: '2026-08-29T05:32:00.000Z'
  });
  assert.deepEqual(resource.recentFailure, {
    known: false,
    hasFailure: false,
    occurredAt: null,
    deploymentUuid: '',
    message: '',
    recoveredAt: null
  });
});

test('提交优先读取实际最近部署记录，标明来源，失败记录不伪称当前运行版本', () => {
  const result = normalizeCoolifyResource({ uuid: 'app_1', git_commit_sha: 'HEAD' }, 'application', {
    deploymentFacts: { lastDeployment: { commit: 'abcdef1234567890', status: 'failed' }, recentFailure: { known: true, hasFailure: true } }
  });
  assert.equal(result.commit, 'abcdef1234567890');
  assert.equal(result.commitSource, 'deployment-history');
  assert.equal(result.lastDeployment.status, 'failed');
  assert.equal(normalizeCoolifyResource({ uuid: 'app_1', git_commit_sha: 'HEAD' }).commitSource, 'configuration');
});

test('兼容 Coolify 包装后的部署历史，完整 Git URL 优先用于身份匹配且移除凭据', async t => {
  const { fetchImpl } = createHarness(t);
  const overview = await readCoolifyOverview({ baseUrl: 'https://cool.example.com', token: 'fixture-read-token',
    fetchImpl: async (url, options) => {
      const response = await fetchImpl(url, options);
      if (new URL(url).pathname.includes('/deployments/applications/')) {
        return jsonResponse({ count: 1, deployments: JSON.parse(Buffer.from(await response.arrayBuffer()).toString('utf8')) });
      }
      return response;
    }
  });
  assert.equal(overview.deployments[0].commit, '0123456789abcdef');
  assert.equal(overview.deployments[0].commitSource, 'deployment-history');
  assert.equal(overview.deployments[0].recentFailure.hasFailure, true);
  const source = normalizeCoolifyResource({ uuid: 'app_1', git_repository: 'owner/app', git_full_url: 'https://user:secret@github.com/owner/app.git' });
  assert.equal(source.repositoryUrl, 'https://github.com/owner/app');
  assert.doesNotMatch(JSON.stringify(source), /secret|user:/);
});

test('GitHub App 的短仓库名通过明确 source_id 补全主机，不猜测 github.com', async t => {
  const { fetchImpl } = createHarness(t);
  const run = async unavailable => readCoolifyOverview({ baseUrl: 'https://cool.example.com', token: 'fixture-read-token',
    fetchImpl: async (url, options) => {
      const pathname = new URL(url).pathname;
      assert.equal(options.method, 'GET');
      if (pathname === '/api/v1/github-apps') return unavailable ? jsonResponse({}, 404) : jsonResponse([
        { id: 7, html_url: 'https://git.enterprise.example', client_secret: 'fixture-secret-never-forward' },
        { id: 8, html_url: 'https://github.com' }
      ]);
      const response = await fetchImpl(url, options);
      if (pathname !== '/api/v1/applications') return response;
      const apps = JSON.parse(Buffer.from(await response.arrayBuffer()).toString('utf8'));
      return jsonResponse(apps.flatMap(app => [
        { ...app, git_repository: 'Owner/app', git_full_url: null, source_type: 'App\\Models\\GithubApp', source_id: 7 },
        { ...app, uuid: 'app_gitlab', git_repository: 'Owner/app', source_type: 'App\\Models\\GitlabApp', source_id: 7 }
      ]));
    }
  });
  const complete = await run(false);
  assert.equal(complete.deployments[0].repositoryUrl, 'https://git.enterprise.example/Owner/app');
  assert.equal(complete.deployments[1].repositoryUrl, 'Owner/app');
  assert.doesNotMatch(JSON.stringify(complete), /fixture-secret-never-forward|client_secret/);
  assert.equal((await run(true)).deployments[0].repositoryUrl, 'Owner/app');
});

test('多 Coolify 实例保存在应用自有会话并可聚合白板拓扑', async t => {
  const { root, service, calls } = createHarness(t);
  const first = await service.connect({
    baseUrl: 'https://cool.example.com',
    label: '生产 Coolify',
    token: 'coolify-read-token-123'
  });
  const second = await service.connect({
    baseUrl: 'https://cool-standby.example.com',
    label: '备用 Coolify',
    token: 'coolify-read-token-456'
  });
  assert.equal(first.providerKind, 'coolify');
  assert.notEqual(first.providerId, second.providerId);
  assert.equal(Object.hasOwn(first, 'token'), false);
  const sessionPath = path.join(root, 'coolify-session.json');
  const persisted = fs.readFileSync(sessionPath, 'utf8');
  assert.match(persisted, /coolify-read-token-123/);
  assert.match(persisted, /coolify-read-token-456/);
  assert.equal(persisted.includes('panel-session'), false);
  if (process.platform !== 'win32') assert.equal(fs.statSync(sessionPath).mode & 0o077, 0);

  const topology = await service.getTopology();
  assert.equal(topology.state, 'ready');
  assert.equal(topology.topology.servers.length, 2);
  assert.equal(topology.topology.deployments.length, 4);
  assert.deepEqual(new Set(topology.topology.deployments.map(item => item.providerId)), new Set([first.providerId, second.providerId]));
  assert.ok(calls.every(call => !call.url.includes('/api/gitfinder/')));
});

test('成功读取后缓存无凭据拓扑，重启和离线时可直接恢复上次事实', async t => {
  const { root, service } = createHarness(t);
  await service.connect({ baseUrl: 'https://cool.example.com', token: 'coolify-read-token-123' });
  const fresh = await service.getTopology();
  const cachePath = path.join(root, 'coolify-topology-cache.json');
  const persisted = fs.readFileSync(cachePath, 'utf8');
  assert.equal(fresh.cached, false);
  assert.doesNotMatch(persisted, /coolify-read-token-123|accessToken|Authorization/);

  const restarted = new CoolifyProviderService({
    configDirectory: root,
    projectService: service.projectService,
    getRegistry: service.getRegistry,
    fetchImpl: async () => { throw new Error('offline'); },
    now: () => new Date('2026-08-29T06:00:00.000Z')
  });
  const cached = restarted.getCachedTopology();
  assert.equal(cached.state, 'ready');
  assert.equal(cached.cached, true);
  assert.equal(cached.topology.deployments[0].resourceUuid, 'app_1');
  assert.match(cached.cachedAt, /^2026-08-29T05:32:00/);
  assert.equal(restarted.checkEndpoints().pending, 1, '缓存应恢复允许检测的访问点目标');
});

test('部分 Coolify 实例同步失败时保留该实例的旧快照，不清空在线实例', async t => {
  const { root, service } = createHarness(t);
  const first = await service.connect({ baseUrl: 'https://cool.example.com', token: 'coolify-read-token-123' });
  const second = await service.connect({ baseUrl: 'https://cool-standby.example.com', token: 'coolify-read-token-456' });
  await service.getTopology();
  const originalFetch = service.fetchImpl;
  service.fetchImpl = async (url, options) => {
    if (new URL(url).hostname === 'cool-standby.example.com') throw new Error('备用实例暂时不可达');
    return originalFetch(url, options);
  };
  const refreshed = await service.getTopology();
  assert.equal(refreshed.state, 'ready');
  assert.equal(refreshed.cached, true);
  assert.deepEqual(new Set(refreshed.staleProviders), new Set([second.providerId]));
  assert.ok(refreshed.errors.some(error => error.providerId === second.providerId));
  assert.ok(refreshed.topology.deployments.some(item => item.providerId === first.providerId && item.stale !== true));
  assert.ok(refreshed.topology.deployments.some(item => item.providerId === second.providerId && item.stale === true));
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'coolify-topology-cache.json'), 'utf8'), /coolify-read-token-123|coolify-read-token-456/);
});

test('断开连接会同步裁剪拓扑缓存，不能在下次启动显示已移除实例', async t => {
  const { root, service } = createHarness(t);
  const provider = await service.connect({ baseUrl: 'https://cool.example.com', token: 'coolify-read-token-123' });
  await service.getTopology();
  service.disconnect(provider.providerId);
  assert.equal(fs.existsSync(path.join(root, 'coolify-topology-cache.json')), false);
  assert.equal(service.getCachedTopology().state, 'unconfigured');
});

test('已保存的 Coolify 可重命名并在验证成功后更换地址', async t => {
  const { service, calls } = createHarness(t);
  const original = await service.connect({
    baseUrl: 'https://cool.example.com',
    label: '生产 Coolify',
    token: 'coolify-read-token-123'
  });
  const renamed = await service.update({ providerId: original.providerId, label: '生产集群' });
  assert.equal(renamed.label, '生产集群');
  assert.equal(renamed.providerId, original.providerId);
  const callsBeforeMove = calls.length;
  const moved = await service.update({
    providerId: original.providerId,
    baseUrl: 'https://cool-new.example.com',
    label: '新生产集群'
  });
  assert.equal(moved.providerId, original.providerId);
  assert.equal(moved.baseUrl, 'https://cool-new.example.com');
  assert.equal(service.getConnections().length, 1);
  assert.ok(calls.length > callsBeforeMove);
});

test('项目只保存 Coolify 稳定 ID，令牌和实例地址不进入便携关联', async t => {
  const { projectPath, service } = createHarness(t);
  const connection = await service.connect({
    baseUrl: 'https://cool.example.com',
    label: '生产 Coolify',
    token: 'coolify-read-token-123'
  });
  const catalog = await service.getCatalog(connection.providerId);
  const app = catalog.resources.find(item => item.resourceUuid === 'app_1');
  service.saveProjectBinding(projectPath, {
    ...app,
    providerId: connection.providerId,
    repositoryIds: ['r_0123456789ab']
  });
  const text = fs.readFileSync(path.join(projectPath, '.gitfinder', 'deployments.json'), 'utf8');
  assert.match(text, /"providerKind": "coolify"/);
  assert.equal(text.includes('coolify-read-token-123'), false);
  assert.equal(text.includes('https://cool.example.com'), false);

  const result = await service.getProjectDeployments(projectPath);
  assert.equal(result.state, 'ready');
  assert.equal(result.resources[0].resourceUuid, 'app_1');
  assert.equal(service.resolveExternalUrl('https://mes.example.com'), 'https://mes.example.com');
});
