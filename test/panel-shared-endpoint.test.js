const assert = require('node:assert/strict');
const test = require('node:test');
const { buildProjection, dynamicEntityId, endpointReuseAlerts, selectEndpointCheck } = require('../src/shared/panelTopologyProjection');

function project(domains, options = {}) {
  const providers = options.providers || domains.map((_, index) => `provider-${index}`);
  return buildProjection({
    state: 'ready', serverTree: true,
    existingEntities: options.existingEntities || [],
    topology: {
      servers: providers.map((providerId, index) => ({ providerId, nodeId: `host-${index}`, name: `Host ${index}` })),
      deployments: domains.map((url, index) => ({
        providerId: providers[index], providerLabel: `Coolify ${index}`, resourceUuid: `app-${index}`,
        nodeId: `host-${index}`, projectUuid: `project-${index}`, name: `App ${index}`, domains: [url]
      })),
      endpointChecks: options.checks || []
    }
  });
}

test('同一访问地址跨 Coolify 来源只产生一个浮动访问点和一条包含全部部署的警报', () => {
  const url = 'https://shared.example.com';
  const graph = project([url, url]);
  const endpoints = graph.entities.filter(entity => entity.type === 'endpoint');
  assert.equal(endpoints.length, 1);
  assert.equal(graph.metadata.endpointCount, 1);
  assert.equal(graph.placements.find(item => item.entityId === endpoints[0].id).groupId, undefined);
  assert.equal(graph.relationships.filter(edge => edge.type === 'exposes' && edge.targetId === endpoints[0].id).length, 2);
  assert.deepEqual(endpoints[0].runtime.endpointSources.map(source => source.providerId), ['provider-0', 'provider-1']);
  const [alert] = endpointReuseAlerts(graph);
  assert.equal(alert.endpointId, endpoints[0].id);
  assert.equal(alert.deploymentIds.length, 2);
  assert.equal(alert.relationshipIds.length, 2);
});

test('同域名 HTTP/HTTPS 默认端口根地址合并，路径和非默认端口仍区分服务', () => {
  const roots = project(['http://SHARED.example.com:80/', 'https://shared.example.com:443']);
  assert.equal(roots.entities.filter(entity => entity.type === 'endpoint').length, 1);
  const urls = ['https://shared.example.com', 'https://shared.example.com/api', 'https://shared.example.com/web',
    'http://shared.example.com/api', 'https://shared.example.com:8443', 'https://shared.example.com:9443',
    'https://shared.example.com?tenant=one', 'https://shared.example.com?tenant=two'];
  const distinct = project(urls);
  assert.equal(distinct.entities.filter(entity => entity.type === 'endpoint').length, urls.length);
  assert.equal(endpointReuseAlerts(distinct).length, 0);
});

test('单来源访问点保留原有 ID，已有来源作为共享访问点代表时保留该 ID', () => {
  const url = 'https://shared.example.com';
  const single = project([url]);
  assert.equal(single.entities.find(entity => entity.type === 'endpoint').id, dynamicEntityId('endpoint', 'provider-0', url));
  const savedId = dynamicEntityId('endpoint', 'provider-1', url);
  const existingEntities = [{ id: savedId, type: 'endpoint', name: '已备注访问点', runtime: { providerId: 'provider-1', url } }];
  const merged = project([url, url], { existingEntities });
  assert.deepEqual(merged.relationships.filter(edge => edge.type === 'exposes').map(edge => edge.targetId), [savedId, savedId]);
  assert.equal(merged.placements.filter(item => item.entityId === savedId).length, 1);
  const live = merged.entities.find(entity => entity.id === savedId);
  assert.equal(live.runtime.endpointSources.length, 2, '旧快照同 ID 仍提供实时来源集合供控制器合并');
  assert.deepEqual(new Set(live.runtime.endpointSources.map(source => source.entityId)), new Set([
    dynamicEntityId('endpoint', 'provider-0', url), savedId
  ]));
  assert.equal(endpointReuseAlerts(merged)[0].deploymentIds.length, 2);
  assert.equal(existingEntities[0].name, '已备注访问点', '投影不修改已保存实体');
});

test('共享访问点的代表来源不随部署返回顺序变化', () => {
  const url = 'https://shared.example.com';
  const first = project([url, url], { providers: ['one', 'two'] });
  const reversed = project([url, url], { providers: ['two', 'one'] });
  assert.equal(first.entities.find(entity => entity.type === 'endpoint').id, reversed.entities.find(entity => entity.type === 'endpoint').id);
});

test('共享访问点从全部来源选择最新检测结果并保留准确更新时间', () => {
  const url = 'https://shared.example.com';
  const checks = [
    { providerId: 'provider-0', url, checkedAt: '2026-09-05T00:00:00Z', status: 'http_error', httpStatus: 503 },
    { providerId: 'provider-1', url, checkedAt: '2026-09-05T00:01:00Z', status: 'reachable', httpStatus: 200, pageTitle: 'Shared site' }
  ];
  const endpoint = project([url, url], { checks }).entities.find(entity => entity.type === 'endpoint');
  assert.equal(endpoint.runtime.status, 'reachable');
  assert.equal(endpoint.runtime.httpStatus, 200);
  assert.equal(endpoint.runtime.pageTitle, 'Shared site');
  assert.equal(endpoint.verifiedAt, checks[1].checkedAt);
  assert.equal(endpoint.runtime.observedAt, checks[1].checkedAt);
});

test('后续检测推送沿用来源集合择新规则并保留任一来源正在检测状态', () => {
  const url = 'https://shared.example.com';
  const sources = [{ providerId: 'one', url }, { providerId: 'two', url }];
  const checks = new Map([
    [`one\u0000${url}`, { checkedAt: '2026-09-05T00:01:00Z', status: 'reachable', checking: false }],
    [`two\u0000${url}`, { checkedAt: '2026-09-05T00:00:00Z', status: 'http_error', checking: true }]
  ]);
  const result = selectEndpointCheck({ endpointSources: sources }, checks);
  assert.equal(result.status, 'reachable');
  assert.equal(result.checking, true);
  assert.equal(checks.get(`one\u0000${url}`).checking, false);
  assert.equal(selectEndpointCheck({ endpointSources: sources }, new Map()), undefined);
});
