const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CoolifyProviderService,
  normalizeCoolifyBaseUrl,
  normalizeCoolifyResource,
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

test('Coolify 地址只接受站点根地址和安全协议', () => {
  assert.equal(normalizeCoolifyBaseUrl('https://cool.example.com/api/v1'), 'https://cool.example.com');
  assert.equal(normalizeCoolifyBaseUrl('http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
  assert.throws(() => normalizeCoolifyBaseUrl('http://cool.example.com'), /HTTPS/);
  assert.throws(() => normalizeCoolifyBaseUrl('https://user:secret@cool.example.com'), /凭据/);
  assert.throws(() => normalizeCoolifyBaseUrl('https://cool.example.com/project/one'), /根地址/);
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
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.ok(calls.every(call => call.authorization === 'Bearer coolify-read-token-123'));
  assert.equal(calls.some(call => call.path.startsWith('/api/gitfinder/')), false);
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
