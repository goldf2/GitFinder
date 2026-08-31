const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildProjection,
  arrangeAroundCenters,
  dynamicEntityId
} = require('../src/shared/panelTopologyProjection');

test('围绕中心按关系距离分环，中心不动，孤立节点保留且不改关系', () => {
  const placements = ['center', 'app', 'url', 'isolated'].map(entityId => ({ entityId, x: 150, y: 200, width: 280, height: 160 }));
  const relationships = [{ sourceId: 'center', targetId: 'app' }, { sourceId: 'app', targetId: 'url' }];
  const originalEdges = structuredClone(relationships);
  assert.equal(arrangeAroundCenters({ placements, relationships }, ['center'], { keepCenter: true }), true);
  assert.equal(placements[0].x, 150);
  assert.equal(placements[0].y, 200);
  const distance = item => Math.hypot(item.x - placements[0].x, item.y - placements[0].y);
  assert.ok(distance(placements[2]) > distance(placements[1]));
  assert.ok(placements[3].x > Math.max(...placements.slice(0, 3).map(item => item.x + item.width)));
  assert.deepEqual(relationships, originalEdges);
});

test('多服务器中心共享节点仅出现一次，循环和多访问点可排列且矩形不重叠', () => {
  const placements = ['s1', 's2', 'app', ...Array.from({ length: 16 }, (_, index) => `url${index}`)].map((entityId, index) => ({ entityId, x: 0, y: 0, width: index % 3 ? 280 : 440, height: index % 2 ? 160 : 400 }));
  const relationships = [{ sourceId: 'app', targetId: 's1' }, { sourceId: 'app', targetId: 's2' }, ...placements.slice(3).map(item => ({ sourceId: 'app', targetId: item.entityId })), { sourceId: 'url0', targetId: 'url1' }];
  const original = structuredClone(relationships);
  arrangeAroundCenters({ placements, relationships }, ['s1', 's2'], {});
  assert.equal(placements.length, 19);
  assert.equal(new Set(placements.map(item => item.entityId)).size, 19);
  for (let index = 0; index < placements.length; index++) {
    const a = placements[index];
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
    for (const b of placements.slice(index + 1)) {
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${a.entityId} overlaps ${b.entityId}`);
    }
  }
  assert.deepEqual(relationships, original);
  const first = structuredClone(placements);
  arrangeAroundCenters({ placements, relationships }, ['s1', 's2'], {});
  assert.deepEqual(placements, first);
});

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

test('访问点只使用独立 HTTP 检测结果和时间，不能继承部署健康、延迟或更新时间', () => {
  const input = { state: 'ready', provider: { providerId: 'coolify_one' }, topology };
  const before = buildProjection(input);
  const endpoint = before.entities.find(entity => entity.type === 'endpoint');
  assert.equal(endpoint.runtime.status, 'unknown');
  assert.equal(endpoint.runtime.observedAt, null);
  assert.equal(endpoint.runtime.latencyMs, null);
  assert.equal(endpoint.verifiedAt, '');
  const checked = buildProjection({ ...input, topology: { ...topology, endpointChecks: [{
    providerId: 'coolify_one', url: 'https://mes.example.com', status: 'http_error', httpStatus: 503, latencyMs: 55, checkedAt: '2026-08-31T02:00:00Z', message: 'HTTP 503'
  }] } });
  const result = checked.entities.find(entity => entity.type === 'endpoint');
  assert.equal(result.id, endpoint.id);
  assert.equal(result.runtime.httpStatus, 503);
  assert.equal(result.runtime.observedAt, '2026-08-31T02:00:00Z');
  assert.equal(result.runtime.checkMessage, 'HTTP 503');
  assert.equal(checked.entities.find(entity => entity.type === 'deployment').runtime.status, 'running');
  assert.deepEqual(checked.placements, before.placements);
  assert.deepEqual(checked.relationships, before.relationships);
});

test('Coolify 项目群组按画布比例横向换行，单个长项目也折为多列且无节点重叠', () => {
  for (const sameProject of [false, true]) {
    const deployments = Array.from({ length: 24 }, (_, index) => ({
      ...topology.deployments[0], resourceUuid: `app_${index}`, projectUuid: sameProject ? 'one_project' : `project_${index}`,
      projectName: sameProject ? '单个长项目' : `项目 ${index}`, domains: [`https://site-${index}.example.com`]
    }));
    const input = { state: 'ready', groupByProject: true, topology: { deployments }, layout: { viewportAspectRatio: 1.7 } };
    const result = buildProjection(input);
    assert.deepEqual(result, buildProjection(input), '相同画布与数据保持确定布局');
    const groups = result.entities.filter(entity => entity.type === 'group');
    const members = result.placements.filter(item => !groups.some(group => group.id === item.entityId));
    const bounds = { width: Math.max(...members.map(item => item.x + 280)) - Math.min(...members.map(item => item.x)),
      height: Math.max(...members.map(item => item.y + 132)) - Math.min(...members.map(item => item.y)) };
    assert.ok(bounds.width / bounds.height > 1 && bounds.width / bounds.height < 2.7, JSON.stringify(bounds));
    if (!sameProject) assert.ok(new Set(result.placements.filter(item => groups.some(group => group.id === item.entityId)).map(item => item.x)).size > 1);
    for (let index = 0; index < members.length; index++) {
      const a = members[index];
      for (const b of members.slice(index + 1)) assert.ok(a.x + 280 <= b.x || b.x + 280 <= a.x || a.y + 132 <= b.y || b.y + 132 <= a.y);
    }
    assert.equal(new Set(members.map(item => item.entityId)).size, 48);
  }
});

test('Coolify Projects 分组使用实例和项目身份，跨环境同组、同名跨实例分开', () => {
  const deployments = [
    { ...topology.deployments[0], providerId: 'one', providerLabel: '实例一', resourceUuid: 'one_a', projectName: 'MES', environmentName: '生产' },
    { ...topology.deployments[0], providerId: 'one', providerLabel: '实例一', resourceUuid: 'one_b', projectName: 'MES', environmentName: '测试' },
    { ...topology.deployments[0], providerId: 'two', providerLabel: '实例二', resourceUuid: 'two_a', projectName: 'MES' }
  ];
  const input = { state: 'ready', groupByProject: true, topology: { deployments, servers: [] } };
  const before = JSON.stringify(input);
  const result = buildProjection(input);
  const group = id => result.placements.find(item => item.entityId === dynamicEntityId('deployment', id.startsWith('two') ? 'two' : 'one', id)).groupId;
  assert.equal(group('one_a'), group('one_b'));
  assert.notEqual(group('one_a'), group('two_a'));
  assert.equal(result.entities.filter(item => item.type === 'group').length, 2);
  assert.equal(JSON.stringify(input), before);
  deployments[0].projectName = '新名称';
  const renamed = buildProjection(input);
  assert.equal(renamed.entities.find(item => item.type === 'group' && item.runtime.providerId === 'one').id, group('one_a'));
});

test('项目分组中共享仓库、主机和多项目访问点只出现一次，所有关系保留且分组不重叠', () => {
  const result = buildProjection({ state: 'ready', groupByProject: true, provider: { providerId: 'coolify_1', label: 'Con01' },
    topology: { servers: topology.servers, deployments: [
      { ...topology.deployments[0], resourceUuid: 'one', projectName: 'MES', repositoryUrl: 'https://github.com/owner/app' },
      { ...topology.deployments[0], resourceUuid: 'two', projectUuid: 'other', projectName: '工具', repositoryUrl: 'https://github.com/owner/app' }
    ] }, repositories: [{ id: 'repo_one', name: 'app', path: '/work/app', originUrl: 'git@github.com:owner/app.git' }]
  });
  const groups = result.entities.filter(item => item.type === 'group');
  assert.equal(groups.length, 3);
  for (const type of ['server', 'repository', 'endpoint']) {
    const resources = result.entities.filter(item => item.type === type);
    assert.equal(resources.length, 1);
    assert.equal(result.placements.find(item => item.entityId === resources[0].id).groupId, 'entity_panel_shared_resources');
  }
  assert.equal(result.relationships.length, 6);
  assert.equal(new Set(result.placements.map(item => item.entityId)).size, result.placements.length);
  const ranges = groups.map(item => result.placements.filter(p => p.groupId === item.id)).map(members => ({
    top: Math.min(...members.map(item => item.y)) - 74,
    bottom: Math.max(...members.map(item => item.y)) + 132 + 28
  })).sort((a, b) => a.top - b.top);
  for (let i = 1; i < ranges.length; i++) assert.ok(ranges[i].top > ranges[i - 1].bottom);
});

test('旧分列布局不会自动新增群组，缺失项目明确归入未分配而非猜测', () => {
  const input = { state: 'ready', topology: { servers: [], deployments: [{ ...topology.deployments[0], projectUuid: 'project_unknown' }] } };
  assert.ok(!buildProjection(input).entities.some(item => item.type === 'group'));
  assert.ok(buildProjection({ ...input, groupByProject: true }).entities.some(item => item.type === 'group' && item.name.includes('未分配项目')));
});

test('自动投影为多个部署共用仓库连线，不初始化项目且保留多访问点', () => {
  const projection = buildProjection({
    state: 'ready', provider: { providerId: 'coolify_1' },
    topology: { ...topology, deployments: [
      { ...topology.deployments[0], resourceUuid: 'app_1', repositoryUrl: 'https://github.com/owner/app' },
      { ...topology.deployments[0], resourceUuid: 'app_2', repositoryUrl: 'https://github.com/owner/app.git', domains: ['https://one.example', 'https://two.example'] }
    ] },
    repositories: [{ id: 'repo_1', name: 'app', path: '/work/app', originUrl: 'git@github.com:owner/app.git' }]
  });
  assert.equal(projection.entities.filter(entity => entity.type === 'repository').length, 1);
  assert.equal(projection.entities.some(entity => entity.type === 'project'), false);
  assert.equal(projection.relationships.filter(relation => relation.type === 'source_of').length, 2);
  assert.equal(projection.relationships.filter(relation => relation.type === 'exposes').length, 3);
  assert.equal(projection.entities.find(entity => entity.type === 'deployment').runtime.repositoryAssociation.mode, 'automatic');
});

test('本机关联按实例和部署隔离，解除只影响一个部署', () => {
  const projection = buildProjection({
    state: 'ready', topology: { servers: [], deployments: ['one', 'two'].map(providerId => ({ ...topology.deployments[0], providerId, repositoryUrl: 'https://github.com/owner/app' })) },
    repositories: [{ id: 'repo_1', path: '/app', originUrl: 'https://github.com/owner/app' }],
    repositoryAssociations: [{ providerId: 'one', resourceUuid: 'resource_1', mode: 'disabled' }]
  });
  const deployments = projection.entities.filter(entity => entity.type === 'deployment');
  assert.equal(deployments[0].runtime.repositoryAssociation.mode, 'disabled');
  assert.equal(deployments[1].runtime.repositoryAssociation.mode, 'automatic');
  assert.equal(projection.relationships.filter(relation => relation.type === 'source_of').length, 1);
});

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
