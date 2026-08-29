const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  PanelProviderService,
  normalizeBaseUrl,
  normalizeBinding,
  normalizeCapabilities,
  normalizeTopology
} = require('../src/main/services/panelProviderService');

function jsonResponse(value, status = 200) {
  const body = Buffer.from(JSON.stringify(value));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : '' },
    arrayBuffer: async () => body
  };
}

function createHarness(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-2-panel-'));
  const projectPath = path.join(root, 'project');
  fs.mkdirSync(path.join(projectPath, '.gitfinder'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const resource = {
    resourceUuid: 'resource_1',
    nodeId: 'node_1',
    projectUuid: 'panel_project_1',
    environmentUuid: 'environment_1',
    name: 'MES Lite',
    type: 'application',
    status: 'running',
    serverName: 'Con01',
    projectName: 'Manufacturing',
    environmentName: 'production',
    domains: ['https://mes.example.com'],
    panelUrl: 'https://panel.example.com/resources/resource_1',
    coolifyUrl: 'https://cool.example.com/project/resource_1',
    observedAt: '2026-08-28T06:00:00.000Z'
  };
  const fetchImpl = overrides.fetchImpl || (async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.toString(), authorization: options.headers.Authorization, method: options.method });
    if (parsed.pathname.endsWith('/capabilities')) {
      return jsonResponse({
        apiVersion: '1.1',
        providerKind: 'xiangshu-panel',
        capabilities: ['catalog:read', 'snapshots:read', 'topology:read', 'events:read']
      });
    }
    if (parsed.pathname.endsWith('/catalog')) return jsonResponse({ apiVersion: '1.1', resources: [resource] });
    if (parsed.pathname.endsWith('/snapshot')) return jsonResponse({ apiVersion: '1.1', resource });
    if (parsed.pathname.endsWith('/topology')) return jsonResponse({
      apiVersion: '1.1',
      generatedAt: '2026-08-28T06:00:00.000Z',
      cursor: 'cursor_1',
      servers: [{
        nodeId: 'node_1',
        name: 'Con01',
        status: 'online',
        latencyMs: 32,
        resourceCount: 1,
        observedAt: '2026-08-28T06:00:00.000Z',
        panelUrl: 'https://panel.example.com/nodes/node_1'
      }],
      deployments: [{
        ...resource,
        latencyMs: 86,
        latencyKind: 'http',
        branch: 'main',
        commit: '0123456789abcdef',
        recentFailure: {
          hasFailure: true,
          occurredAt: '2026-08-28T05:40:00.000Z',
          deploymentUuid: 'deployment_9',
          message: 'health check failed',
          recoveredAt: '2026-08-28T05:45:00.000Z'
        }
      }]
    });
    return jsonResponse({}, 404);
  });
  const projectService = {
    getProject: candidatePath => {
      assert.equal(candidatePath, projectPath);
      return { path: projectPath, projectId: 'project_12345678-1234-4123-8123-123456789abc' };
    },
    listProjects: async () => [{ path: projectPath, projectId: 'project_12345678-1234-4123-8123-123456789abc' }]
  };
  const service = new PanelProviderService({
    configDirectory: root,
    projectService,
    fetchImpl,
    now: () => new Date('2026-08-28T05:00:00.000Z')
  });
  return { root, projectPath, service, calls, resource, fetchImpl, projectService };
}

test('Panel 地址只允许 HTTPS 或本机 HTTP', () => {
  assert.equal(normalizeBaseUrl('https://panel.example.com/'), 'https://panel.example.com');
  assert.equal(normalizeBaseUrl('http://127.0.0.1:4173'), 'http://127.0.0.1:4173');
  assert.throws(() => normalizeBaseUrl('http://panel.example.com'), /必须使用 HTTPS/);
  assert.throws(() => normalizeBaseUrl('https://user:secret@panel.example.com'), /不能包含凭据/);
  assert.throws(() => normalizeBaseUrl('https://panel.example.com/private'), /站点根地址/);
});

test('Capabilities 拒绝未知主版本和缺失只读能力', () => {
  assert.throws(() => normalizeCapabilities({
    apiVersion: '2.0', providerKind: 'xiangshu-panel', capabilities: ['catalog:read', 'snapshots:read']
  }), /版本不兼容/);
  assert.throws(() => normalizeCapabilities({
    apiVersion: '1.0', providerKind: 'xiangshu-panel', capabilities: ['catalog:read']
  }), /snapshots:read/);
  assert.throws(() => normalizeCapabilities({
    apiVersion: '1.0', providerKind: 'other', capabilities: ['catalog:read', 'snapshots:read']
  }), /不支持的 Panel Provider/);
});

test('连接先验证只读契约，并以应用自有会话保持登录状态', async t => {
  const { root, service, calls, fetchImpl, projectService } = createHarness(t);
  const connection = await service.connect({
    baseUrl: 'https://panel.example.com',
    label: '生产 Panel',
    token: 'panel-read-token-123'
  });
  assert.equal(connection.configured, true);
  assert.equal(connection.apiVersion, '1.1');
  assert.equal(connection.label, '生产 Panel');
  assert.equal(Object.hasOwn(connection, 'token'), false);
  assert.equal(connection.credentialStorage, 'app-session');
  const sessionPath = path.join(root, 'panel-session.json');
  const persisted = fs.readFileSync(sessionPath, 'utf8');
  assert.match(persisted, /panel-read-token-123/);
  assert.equal(fs.existsSync(path.join(root, 'panel-provider.json')), false);
  if (process.platform !== 'win32') assert.equal(fs.statSync(sessionPath).mode & 0o077, 0);
  assert.equal(calls[0].authorization, 'Bearer panel-read-token-123');
  assert.equal(calls[0].method, 'GET');

  const restarted = new PanelProviderService({ configDirectory: root, projectService, fetchImpl });
  assert.equal(restarted.getConnection().configured, true);
  assert.equal((await restarted.getTopology()).state, 'ready');
  assert.equal(calls.at(-1).authorization, 'Bearer panel-read-token-123');
});

test('可保存多个 Panel 地址并聚合拓扑、Catalog 和同名远端资源', async t => {
  const { root, projectPath, service, resource } = createHarness(t);
  const primary = await service.connect({
    baseUrl: 'https://panel.example.com', label: '生产 Panel', token: 'panel-read-token-123'
  });
  const secondary = await service.connect({
    baseUrl: 'https://panel-secondary.example.com', label: '备用 Panel', token: 'panel-read-token-456'
  });
  assert.notEqual(primary.providerId, secondary.providerId);
  assert.deepEqual(service.getConnections().map(item => item.label), ['生产 Panel', '备用 Panel']);

  const persisted = JSON.parse(fs.readFileSync(path.join(root, 'panel-session.json'), 'utf8'));
  assert.equal(persisted.schemaVersion, 2);
  assert.equal(persisted.providers.length, 2);
  assert.equal(persisted.providers[0].accessToken, 'panel-read-token-123');
  assert.equal(persisted.providers[1].accessToken, 'panel-read-token-456');

  const catalog = await service.getCatalog();
  assert.equal(catalog.resources.length, 2);
  assert.deepEqual(new Set(catalog.resources.map(item => item.providerId)), new Set([primary.providerId, secondary.providerId]));

  service.saveProjectBinding(projectPath, { ...resource, providerId: primary.providerId, repositoryIds: ['r_0123456789ab'] });
  service.saveProjectBinding(projectPath, { ...resource, providerId: secondary.providerId, repositoryIds: ['r_0123456789ab'] });
  const deployments = await service.getProjectDeployments(projectPath);
  assert.equal(deployments.state, 'ready');
  assert.equal(deployments.resources.length, 2);
  assert.equal(deployments.bindings.length, 2);

  const topology = await service.getTopology();
  assert.equal(topology.state, 'ready');
  assert.equal(topology.topology.servers.length, 2);
  assert.equal(topology.topology.deployments.length, 2);
  assert.deepEqual(new Set(topology.topology.servers.map(item => item.providerId)), new Set([primary.providerId, secondary.providerId]));

  service.disconnect(primary.providerId);
  assert.deepEqual(service.getConnections().map(item => item.providerId), [secondary.providerId]);
});

test('alpha.4 单 Panel 应用会话自动迁移为多地址会话', t => {
  const { root, fetchImpl, projectService } = createHarness(t);
  fs.writeFileSync(path.join(root, 'panel-session.json'), JSON.stringify({
    schemaVersion: 1,
    provider: {
      providerId: 'panel_alpha4',
      label: 'Alpha 4 Panel',
      baseUrl: 'https://panel.example.com',
      accessToken: 'panel-read-token-123',
      apiVersion: '1.1',
      capabilities: ['catalog:read', 'snapshots:read', 'topology:read'],
      connectedAt: '2026-08-28T05:00:00.000Z'
    }
  }), { mode: 0o600 });
  const restarted = new PanelProviderService({ configDirectory: root, projectService, fetchImpl });
  assert.equal(restarted.getConnections()[0].label, 'Alpha 4 Panel');
  const migrated = JSON.parse(fs.readFileSync(path.join(root, 'panel-session.json'), 'utf8'));
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.providers.length, 1);
});

test('旧版钥匙串密文不会读取并要求用户重新连接', async t => {
  const { root, service } = createHarness(t);
  fs.writeFileSync(path.join(root, 'panel-provider.json'), JSON.stringify({
    schemaVersion: 1,
    provider: {
      providerId: 'panel_legacy',
      label: '旧 Panel',
      baseUrl: 'https://panel.example.com',
      encryptedToken: 'do-not-decrypt',
      apiVersion: '1.1',
      capabilities: ['catalog:read', 'snapshots:read', 'topology:read'],
      connectedAt: '2026-08-28T05:00:00.000Z'
    }
  }), { mode: 0o600 });
  const connection = service.getConnection();
  assert.equal(connection.configured, false);
  assert.equal(connection.reconnectRequired, true);
  assert.equal(connection.credentialStorage, 'legacy-keychain');
  assert.equal((await service.getTopology()).state, 'reauthentication-required');
});

test('应用会话文件权限过宽时拒绝读取令牌', async t => {
  if (process.platform === 'win32') return;
  const { root, service } = createHarness(t);
  fs.writeFileSync(path.join(root, 'panel-session.json'), JSON.stringify({
    schemaVersion: 1,
    provider: {
      providerId: 'panel_local',
      label: 'Panel',
      baseUrl: 'https://panel.example.com',
      accessToken: 'panel-read-token-123',
      apiVersion: '1.1',
      capabilities: ['catalog:read', 'snapshots:read', 'topology:read'],
      connectedAt: '2026-08-28T05:00:00.000Z'
    }
  }), { mode: 0o644 });
  assert.throws(() => service.getConnection(), /权限过宽/);
});

test('项目关联以 v2 repositoryId 保存便携稳定身份，随后读取只读快照', async t => {
  const { projectPath, service, resource } = createHarness(t);
  const connection = await service.connect({
    baseUrl: 'https://panel.example.com', label: 'Panel', token: 'panel-read-token-123'
  });
  const saved = service.saveProjectBinding(projectPath, {
    ...resource,
    repositoryIds: ['r_0123456789ab'],
    primaryRepositoryId: 'r_0123456789ab'
  });
  assert.equal(saved.bindings[0].providerId, connection.providerId);
  const bindingText = fs.readFileSync(path.join(projectPath, '.gitfinder', 'deployments.json'), 'utf8');
  assert.equal(bindingText.includes('panel-read-token-123'), false);
  assert.equal(bindingText.includes('https://panel.example.com'), false);
  assert.match(bindingText, /"resourceUuid": "resource_1"/);
  assert.match(bindingText, /"schemaVersion": 2/);
  assert.match(bindingText, /"repositoryIds": \[/);
  assert.equal(saved.bindings[0].primaryRepositoryId, 'r_0123456789ab');

  const snapshot = await service.getProjectDeployments(projectPath);
  assert.equal(snapshot.state, 'ready');
  assert.equal(snapshot.resources.length, 1);
  assert.equal(snapshot.resources[0].serverName, 'Con01');
  assert.deepEqual(snapshot.resources[0].domains, ['https://mes.example.com']);
  assert.equal(service.resolveExternalUrl('https://mes.example.com'), 'https://mes.example.com');
  assert.throws(() => service.resolveExternalUrl('https://untrusted.example.com'), /最近一次 Panel/);
});

test('动态拓扑返回服务器、部署状态、延迟、最近失败及本地绑定', async t => {
  const { projectPath, service, resource } = createHarness(t);
  await service.connect({ baseUrl: 'https://panel.example.com', label: 'Panel', token: 'panel-read-token-123' });
  service.saveProjectBinding(projectPath, { ...resource, repositoryIds: ['r_0123456789ab'] });

  const result = await service.getTopology();
  assert.equal(result.state, 'ready');
  assert.equal(result.topology.servers[0].latencyMs, 32);
  assert.equal(result.topology.deployments[0].latencyMs, 86);
  assert.equal(result.topology.deployments[0].recentFailure.hasFailure, true);
  assert.equal(result.topology.deployments[0].commit, '0123456789abcdef');
  assert.deepEqual(result.bindings, []);
  const localBindings = service.getProjectBindings(projectPath);
  assert.equal(localBindings.bindings[0].projectId, 'project_12345678-1234-4123-8123-123456789abc');
  assert.deepEqual(localBindings.bindings[0].repositoryIds, ['r_0123456789ab']);
  assert.equal(service.resolveExternalUrl('https://panel.example.com/nodes/node_1'), 'https://panel.example.com/nodes/node_1');
});

test('没有 topology:read 时明确返回不支持，不伪造服务器离线', async t => {
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/capabilities')) return jsonResponse({
      apiVersion: '1.0',
      providerKind: 'xiangshu-panel',
      capabilities: ['catalog:read', 'snapshots:read']
    });
    return jsonResponse({}, 404);
  };
  const { service } = createHarness(t, { fetchImpl });
  await service.connect({ baseUrl: 'https://panel.example.com', label: 'Panel', token: 'panel-read-token-123' });
  const result = await service.getTopology();
  assert.equal(result.state, 'unsupported');
  assert.deepEqual(result.topology.servers, []);
  assert.deepEqual(result.topology.deployments, []);
});

test('拓扑规范化拒绝不安全容量、时间和延迟', () => {
  const base = {
    apiVersion: '1.1',
    generatedAt: '2026-08-28T06:00:00.000Z',
    servers: [],
    deployments: []
  };
  assert.throws(() => normalizeTopology({ ...base, servers: Array.from({ length: 257 }, () => ({})) }), /服务器数量/);
  assert.throws(() => normalizeTopology({
    ...base,
    servers: [{ nodeId: 'node_1', name: 'Node', status: 'online', observedAt: 'invalid' }]
  }), /观测时间/);
  assert.throws(() => normalizeTopology({
    ...base,
    servers: [{ nodeId: 'node_1', name: 'Node', status: 'online', observedAt: base.generatedAt, latencyMs: 700000 }]
  }), /延迟/);
});

test('未配置和未关联是独立状态，断开连接不删除项目关联', async t => {
  const { root, projectPath, service, resource } = createHarness(t);
  assert.equal((await service.getProjectDeployments(projectPath)).state, 'unconfigured');
  await service.connect({ baseUrl: 'https://panel.example.com', label: 'Panel', token: 'panel-read-token-123' });
  assert.equal((await service.getProjectDeployments(projectPath)).state, 'unlinked');
  service.saveProjectBinding(projectPath, resource);
  service.disconnect();
  assert.equal(fs.existsSync(path.join(root, 'panel-session.json')), false);
  const result = await service.getProjectDeployments(projectPath);
  assert.equal(result.state, 'unconfigured');
  assert.equal(result.bindings.length, 1);
});

test('便携关联拒绝绝对路径和越界相对路径', () => {
  const base = {
    providerId: 'panel_1', nodeId: 'node_1', projectUuid: 'project_1', environmentUuid: 'environment_1', resourceUuid: 'resource_1'
  };
  assert.throws(() => normalizeBinding({ ...base, repositoryRelativePath: '/tmp/repo' }), /相对路径/);
  assert.throws(() => normalizeBinding({ ...base, repositoryRelativePath: '../repo' }), /相对路径/);
  assert.throws(() => normalizeBinding({ ...base, repositoryRelativePath: '..' }), /相对路径/);
  assert.throws(() => normalizeBinding({ ...base, repositoryIds: Array.from({ length: 9 }, (_, i) => `r_00000000000${i}`) }), /最多关联 8/);
  assert.throws(() => normalizeBinding({
    ...base,
    repositoryIds: ['r_0123456789ab'],
    primaryRepositoryId: 'r_ffffffffffff'
  }), /主仓库/);
});
