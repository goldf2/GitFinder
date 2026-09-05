(function exposeRelationshipProjectStructure(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipProjectStructure = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipProjectStructure() {
  function isProjectGroup(entity = {}) {
    return entity.type === 'group' && (entity.runtime?.dynamicKind === 'coolify-project-group'
      || String(entity.id || '').startsWith('entity_panel_projectgroup_'));
  }

  function applyEndpointMembership(graph, include = true) {
    const byId = new Map(graph.placements.map(item => [item.entityId, item]));
    const types = new Map(graph.entities.map(entity => [entity.id, entity.type]));
    const endpointOwners = new Map();
    for (const edge of graph.relationships) {
      const deployment = edge.type === 'exposes' ? edge.sourceId : edge.type === 'exposed_by' ? edge.targetId : '';
      const endpoint = edge.type === 'exposes' ? edge.targetId : edge.sourceId;
      if (types.get(deployment) !== 'deployment' || types.get(endpoint) !== 'endpoint') continue;
      if (!endpointOwners.has(endpoint)) endpointOwners.set(endpoint, new Set());
      endpointOwners.get(endpoint).add(deployment);
    }
    for (const [id, deployments] of endpointOwners) {
      const item = byId.get(id);
      if (!item) continue;
      const groupId = include && deployments.size === 1 ? byId.get([...deployments][0])?.groupId : '';
      if (groupId && types.get(groupId) === 'group' && groupId !== 'entity_panel_shared_resources') item.groupId = groupId;
      else delete item.groupId;
    }
    return graph;
  }

  function endpointReuseAlerts(graph = {}) {
    const entities = new Map((graph.entities || []).map(entity => [entity.id, entity]));
    const deploymentHosts = new Map();
    const endpointDeployments = new Map();
    const endpointRelationshipIds = new Map();
    const add = (map, key, value) => {
      if (!key || !value) return;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(value);
    };
    for (const edge of graph.relationships || []) {
      const deploymentId = edge.type === 'runs_on' ? edge.sourceId : edge.type === 'hosts' ? edge.targetId : '';
      const hostId = edge.type === 'runs_on' ? edge.targetId : edge.type === 'hosts' ? edge.sourceId : '';
      if (entities.get(deploymentId)?.type === 'deployment' && entities.get(hostId)?.type === 'server') {
        add(deploymentHosts, deploymentId, hostId);
      }
      const exposedDeploymentId = edge.type === 'exposes' ? edge.sourceId : edge.type === 'exposed_by' ? edge.targetId : '';
      const endpointId = edge.type === 'exposes' ? edge.targetId : edge.type === 'exposed_by' ? edge.sourceId : '';
      if (entities.get(exposedDeploymentId)?.type !== 'deployment' || entities.get(endpointId)?.type !== 'endpoint') continue;
      add(endpointDeployments, endpointId, exposedDeploymentId);
      add(endpointRelationshipIds, endpointId, edge.id);
    }
    return [...endpointDeployments].map(([endpointId, deploymentSet]) => {
      const deploymentIds = [...deploymentSet].sort();
      const hostIds = [...new Set(deploymentIds.flatMap(id => [...(deploymentHosts.get(id) || [])]))].sort();
      if (deploymentIds.length < 2) return null;
      const endpoint = entities.get(endpointId);
      const scope = hostIds.length > 1
        ? `${hostIds.length} 台不同主机`
        : (hostIds.length === 1 ? '同一主机' : '主机信息未知的部署');
      return {
        id: `topology_alert_endpoint_reuse_${endpointId}`,
        type: 'endpoint_reuse_conflict',
        severity: 'error',
        title: '访问点被多个部署复用',
        message: `${endpoint?.name || endpointId} 同时由 ${deploymentIds.length} 个部署在${scope}提供，请检查域名与路由配置。`,
        endpointId,
        deploymentIds,
        hostIds,
        deploymentHostIds: Object.fromEntries(deploymentIds.map(id => [id, [...(deploymentHosts.get(id) || [])].sort()])),
        relationshipIds: [...(endpointRelationshipIds.get(endpointId) || [])].filter(Boolean).sort()
      };
    }).filter(Boolean).sort((left, right) => left.endpointId.localeCompare(right.endpointId));
  }

  return Object.freeze({ isProjectGroup, applyEndpointMembership, endpointReuseAlerts });
});
