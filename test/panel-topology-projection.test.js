const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildProjection,
  dynamicEntityId
} = require('../src/shared/panelTopologyProjection');

const topology = {
  generatedAt: '2026-08-29T02:00:00.000Z',
  servers: [{
    nodeId: 'node_1',
    name: 'Con01',
    status: 'online',
    latencyMs: 32,
    resourceCount: 1,
    observedAt: '2026-08-29T02:00:00.000Z'
  }],
  deployments: [{
    resourceUuid: 'resource_1',
    nodeId: 'node_1',
    projectUuid: 'panel_project_1',
    environmentUuid: 'production',
    name: 'MES Lite',
    type: 'application',
    status: 'running',
    environmentName: '生产',
    serverName: 'Con01',
    domains: ['https://mes.example.com'],
    observedAt: '2026-08-29T02:00:00.000Z',
    latencyMs: 86,
    latencyKind: 'http',
    branch: 'main',
    commit: '0123456789abcdef',
    recentFailure: {
      hasFailure: true,
      occurredAt: '2026-08-28T23:00:00.000Z',
      deploymentUuid: 'deployment_9',
      message: 'health check failed',
      recoveredAt: '2026-08-28T23:05:00.000Z'
    }
  }]
};

test('Panel 拓扑生成确定性的服务器、部署、本地仓库和项目关系', () => {
  const input = {
    state: 'ready',
    provider: { providerId: 'panel_1', label: '生产 Panel' },
    topology,
    bindings: [{
      projectId: 'project_local_1',
      providerId: 'panel_1',
      resourceUuid: 'resource_1',
      repositoryIds: ['r_0123456789ab'],
      primaryRepositoryId: 'r_0123456789ab'
    }],
    projects: [{ projectId: 'project_local_1', name: 'MES', path: '/Volumes/project/mes' }],
    repositories: [{ id: 'r_0123456789ab', name: 'mes-lite', path: '/Volumes/project/mes/mes-lite' }],
    existingEntities: []
  };

  const first = buildProjection(input);
  const second = buildProjection(input);
  assert.deepEqual(first, second);
  assert.equal(first.entities.filter(entity => entity.type === 'server').length, 1);
  assert.equal(first.entities.filter(entity => entity.type === 'deployment').length, 1);
  assert.equal(first.entities.filter(entity => entity.type === 'endpoint').length, 1);
  assert.equal(first.entities.filter(entity => entity.type === 'repository').length, 1);
  assert.equal(first.entities.filter(entity => entity.type === 'project').length, 1);
  assert.deepEqual(first.relationships.map(item => item.type).sort(), ['contains', 'exposes', 'runs_on', 'source_of']);

  const server = first.entities.find(entity => entity.type === 'server');
  assert.equal(server.name, '生产 Panel');
  assert.equal(server.details.hostLabel, 'Con01');
  assert.equal(server.details.provider, '生产 Panel');
  const deployment = first.entities.find(entity => entity.type === 'deployment');
  assert.equal(deployment.runtime.latencyMs, 86);
  assert.equal(deployment.runtime.recentFailure.hasFailure, true);
  assert.equal(deployment.runtime.commit, '0123456789abcdef');
  assert.deepEqual(deployment.runtime.missingRepositoryIds, []);
  assert.equal(first.metadata.failureCount, 1);
  const endpoint = first.entities.find(entity => entity.type === 'endpoint');
  assert.equal(endpoint.details.urlLabel, 'https://mes.example.com');
});

test('已存在的本地项目仓库节点被复用，缺失 repositoryId 不会被模糊匹配', () => {
  const existingEntities = [
    { id: 'entity_project_existing', type: 'project', refId: 'project_local_1', name: 'MES', details: {} },
    { id: 'entity_repo_existing', type: 'repository', refId: 'r_0123456789ab', name: 'mes-lite', details: {} }
  ];
  const projection = buildProjection({
    state: 'ready',
    provider: { providerId: 'panel_1', label: 'Panel' },
    topology,
    bindings: [{
      projectId: 'project_local_1',
      providerId: 'panel_1',
      resourceUuid: 'resource_1',
      repositoryIds: ['r_0123456789ab', 'r_missing000000']
    }],
    projects: [{ projectId: 'project_local_1', name: 'MES', path: '/new/path' }],
    repositories: [{ id: 'r_0123456789ab', name: 'mes-lite', path: '/new/path/mes-lite' }],
    existingEntities
  });

  assert.equal(projection.entities.some(entity => entity.id === 'entity_project_existing'), false);
  assert.equal(projection.entities.some(entity => entity.id === 'entity_repo_existing'), false);
  assert.ok(projection.placements.some(item => item.entityId === 'entity_project_existing'));
  assert.ok(projection.placements.some(item => item.entityId === 'entity_repo_existing'));
  assert.equal(projection.entities.some(entity => entity.refId === 'r_missing000000'), false);
  const deployment = projection.entities.find(entity => entity.type === 'deployment');
  assert.deepEqual(deployment.runtime.missingRepositoryIds, ['r_missing000000']);
  assert.equal(projection.metadata.missingRepositoryCount, 1);
});

test('未配置或错误状态不生成伪造离线节点', () => {
  for (const state of ['unconfigured', 'unsupported', 'error']) {
    const projection = buildProjection({ state, topology, provider: {}, bindings: [] });
    assert.deepEqual(projection.entities, []);
    assert.deepEqual(projection.relationships, []);
    assert.equal(projection.metadata.state, state);
  }
});

test('动态实体 ID 只依赖 Provider 和远端稳定身份', () => {
  assert.equal(
    dynamicEntityId('server', 'panel_1', 'node_1'),
    dynamicEntityId('server', 'panel_1', 'node_1')
  );
  assert.notEqual(
    dynamicEntityId('server', 'panel_1', 'node_1'),
    dynamicEntityId('server', 'panel_1', 'node_2')
  );
});

test('多个部署使用分层泳道布局，访问端点与所属部署保持相邻关系层', () => {
  const deployments = Array.from({ length: 7 }, (_, index) => ({
    ...topology.deployments[0],
    resourceUuid: `resource_${index + 1}`,
    name: `App ${index + 1}`,
    domains: [`https://app-${index + 1}.example.com`]
  }));
  const projection = buildProjection({
    state: 'ready',
    provider: { providerId: 'panel_1', label: '生产' },
    topology: { ...topology, deployments },
    bindings: []
  });
  const entities = new Map(projection.entities.map(entity => [entity.id, entity]));
  const placements = new Map(projection.placements.map(placement => [placement.entityId, placement]));
  const deploymentPlacements = projection.placements.filter(placement => entities.get(placement.entityId)?.type === 'deployment');

  assert.equal(new Set(deploymentPlacements.map(placement => placement.x)).size, 1);
  assert.equal(new Set(deploymentPlacements.map(placement => placement.y)).size, deployments.length);
  for (const relationship of projection.relationships.filter(item => item.type === 'exposes')) {
    const deploymentPlacement = placements.get(relationship.sourceId);
    const endpointPlacement = placements.get(relationship.targetId);
    assert.ok(endpointPlacement.x > deploymentPlacement.x);
    assert.equal(endpointPlacement.x - deploymentPlacement.x, (280 + 64) * 2);
  }
});

test('卡片横纵间距参与 Coolify 自动布局而不改变拓扑身份', () => {
  const projection = buildProjection({
    state: 'ready',
    provider: { providerId: 'panel_1', label: '生产' },
    topology: {
      ...topology,
      servers: [
        topology.servers[0],
        { ...topology.servers[0], nodeId: 'node_2', name: 'Con02' }
      ]
    },
    bindings: [],
    layout: { width: 300, height: 150, horizontalSpacing: 100, verticalSpacing: 60 }
  });
  const entities = new Map(projection.entities.map(entity => [entity.id, entity]));
  const servers = projection.placements.filter(placement => entities.get(placement.entityId)?.type === 'server');
  const deployment = projection.placements.find(placement => entities.get(placement.entityId)?.type === 'deployment');
  const endpoint = projection.placements.find(placement => entities.get(placement.entityId)?.type === 'endpoint');

  assert.equal(servers[1].x - servers[0].x, 0);
  assert.equal(servers[1].y - servers[0].y, 210);
  assert.equal(deployment.y, 80);
  assert.equal(endpoint.x - deployment.x, 800);
});

test('多个 Panel 即使返回相同远端 ID 也生成独立节点并匹配各自关联', () => {
  const projection = buildProjection({
    state: 'ready',
    providers: [
      { providerId: 'panel_1', label: '生产' },
      { providerId: 'panel_2', label: '备用' }
    ],
    topology: {
      generatedAt: topology.generatedAt,
      servers: [
        { ...topology.servers[0], providerId: 'panel_1', providerLabel: '生产' },
        { ...topology.servers[0], providerId: 'panel_2', providerLabel: '备用' }
      ],
      deployments: [
        { ...topology.deployments[0], providerId: 'panel_1', providerLabel: '生产' },
        { ...topology.deployments[0], providerId: 'panel_2', providerLabel: '备用' }
      ]
    },
    bindings: [
      { projectId: 'project_local_1', providerId: 'panel_1', resourceUuid: 'resource_1', repositoryIds: ['r_0123456789ab'] },
      { projectId: 'project_local_1', providerId: 'panel_2', resourceUuid: 'resource_1', repositoryIds: ['r_0123456789ab'] }
    ],
    projects: [{ projectId: 'project_local_1', name: 'MES', path: '/Volumes/project/mes' }],
    repositories: [{ id: 'r_0123456789ab', name: 'mes-lite', path: '/Volumes/project/mes/mes-lite' }]
  });
  const servers = projection.entities.filter(entity => entity.type === 'server');
  const deployments = projection.entities.filter(entity => entity.type === 'deployment');
  assert.equal(servers.length, 2);
  assert.equal(deployments.length, 2);
  assert.notEqual(servers[0].id, servers[1].id);
  assert.notEqual(deployments[0].id, deployments[1].id);
  assert.equal(projection.metadata.providerCount, 2);
  assert.equal(projection.relationships.filter(item => item.type === 'runs_on').length, 2);
  assert.equal(projection.relationships.filter(item => item.type === 'source_of').length, 2);
  assert.deepEqual(servers.map(server => server.name).sort(), ['备用', '生产']);
});

test('同一 Coolify 下有多台服务器时同时保留连接名称和远端服务器名', () => {
  const projection = buildProjection({
    state: 'ready',
    provider: { providerId: 'panel_1', label: '生产 Coolify' },
    topology: {
      generatedAt: topology.generatedAt,
      servers: [
        { ...topology.servers[0], nodeId: 'node_1', name: 'app-01' },
        { ...topology.servers[0], nodeId: 'node_2', name: 'app-02' }
      ],
      deployments: []
    }
  });

  assert.deepEqual(
    projection.entities.filter(entity => entity.type === 'server').map(server => server.name),
    ['生产 Coolify · app-01', '生产 Coolify · app-02']
  );
});
