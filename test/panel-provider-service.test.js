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
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: value => value.toString('utf8').replace(/^encrypted:/, '')
  };
  const projectService = {
    getProject: candidatePath => {
      assert.equal(candidatePath, projectPath);
      return { path: projectPath, projectId: 'project_12345678-1234-4123-8123-123456789abc' };
    },
    listProjects: async () => [{ path: projectPath, projectId: 'project_12345678-1234-4123-8123-123456789abc' }]
  };
  const service = new PanelProviderService({
    configDirectory: root,
    safeStorage,
    projectService,
    fetchImpl,
    now: () => new Date('2026-08-28T05:00:00.000Z')
  });
  return { root, projectPath, service, calls, resource };
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

test('连接先验证只读契约，令牌只以系统密文落盘', async t => {
  const { root, service, calls } = createHarness(t);
  const connection = await service.connect({
    baseUrl: 'https://panel.example.com',
    label: '生产 Panel',
    token: 'panel-read-token-123'
  });
  assert.equal(connection.configured, true);
  assert.equal(connection.apiVersion, '1.1');
  assert.equal(connection.label, '生产 Panel');
  assert.equal(Object.hasOwn(connection, 'token'), false);
  const persisted = fs.readFileSync(path.join(root, 'panel-provider.json'), 'utf8');
  assert.equal(persisted.includes('panel-read-token-123'), false);
  assert.match(persisted, /encryptedToken/);
  assert.equal(calls[0].authorization, 'Bearer panel-read-token-123');
  assert.equal(calls[0].method, 'GET');
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
  const { projectPath, service, resource } = createHarness(t);
  assert.equal((await service.getProjectDeployments(projectPath)).state, 'unconfigured');
  await service.connect({ baseUrl: 'https://panel.example.com', label: 'Panel', token: 'panel-read-token-123' });
  assert.equal((await service.getProjectDeployments(projectPath)).state, 'unlinked');
  service.saveProjectBinding(projectPath, resource);
  service.disconnect();
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
