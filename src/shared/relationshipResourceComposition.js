(function exposeResourceComposition(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipResourceComposition = api;
})(typeof window !== 'undefined' ? window : globalThis, function createResourceComposition() {
  // Source-generated IDs survive credential-free serialization; runtime does not.
  function isProjectContainer(entity) {
    return entity?.type === 'group' && (entity.runtime?.dynamicKind === 'coolify-project-group'
      || String(entity.id || '').startsWith('entity_panel_projectgroup_'));
  }
  function isCloudProject(entity) {
    return entity?.type === 'project' && (entity.runtime?.dynamicKind === 'panel-project'
      || String(entity.id || '').startsWith('entity_panel_project_'));
  }
  function select(resource, graph) {
    const entities = new Map((graph.entities || []).map(item => [item.id, item]));
    const placements = new Map((graph.placements || []).map(item => [item.entityId, item]));
    const entity = entities.get(resource.entityId) || resource.sourceEntity;
    if (!entity || (!['server', 'deployment', 'endpoint'].includes(entity.type)
      && !isProjectContainer(entity) && !isCloudProject(entity))) return null;
    const deploymentsByHost = new Map(), endpointsByDeployment = new Map();
    const add = (map, key, id) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(id); };
    for (const edge of graph.relationships || []) {
      if (edge.type === 'runs_on') add(deploymentsByHost, edge.targetId, edge.sourceId);
      if (edge.type === 'hosts') add(deploymentsByHost, edge.sourceId, edge.targetId);
      if (edge.type === 'exposes') add(endpointsByDeployment, edge.sourceId, edge.targetId);
      if (edge.type === 'exposed_by') add(endpointsByDeployment, edge.targetId, edge.sourceId);
    }
    const selected = new Set(), roots = new Set();
    const include = id => { if (entities.has(id)) selected.add(id); };
    const deployment = id => {
      if (entities.get(id)?.type !== 'deployment') return;
      include(id); for (const endpoint of endpointsByDeployment.get(id) || []) include(endpoint);
    };
    if (entity.type === 'server') {
      include(entity.id); roots.add(entity.id);
      for (const id of deploymentsByHost.get(entity.id) || []) {
        deployment(id);
        const groupId = placements.get(id)?.groupId;
        if (isProjectContainer(entities.get(groupId))) include(groupId);
      }
    } else if (isCloudProject(entity) || isProjectContainer(entity)) {
      const groups = isProjectContainer(entity) ? [entity] : [...entities.values()].filter(item => isProjectContainer(item)
        && item.runtime?.providerId === entity.runtime?.providerId
        && item.runtime?.projectUuid === (entity.runtime?.projectUuid || entity.refId));
      const allowed = resource.scopeHostId ? (deploymentsByHost.get(resource.scopeHostId) || new Set()) : null;
      for (const group of groups) {
        const children = [...placements.values()].filter(item => item.groupId === group.id
          && entities.get(item.entityId)?.type === 'deployment' && (!allowed || allowed.has(item.entityId)));
        if (!children.length && (allowed || isCloudProject(entity))) continue;
        include(group.id); roots.add(group.id);
        for (const child of children) deployment(child.entityId);
      }
    } else if (entity.type === 'deployment') {
      roots.add(entity.id); deployment(entity.id);
    } else { roots.add(entity.id); include(entity.id); }
    return {
      rootIds: [...roots],
      entities: [...selected].map(id => entities.get(id)),
      placements: [...selected].map(id => ({ ...(placements.get(id) || { x: 80, y: 80 }), entityId: id })),
      relationships: (graph.relationships || []).filter(edge => selected.has(edge.sourceId) || selected.has(edge.targetId))
    };
  }
  function materializedIds(store, board) {
    const placements = new Map((board?.placements || []).map(item => [item.entityId, item]));
    const entities = new Map((store?.entities || []).map(item => [item.id, item]));
    const connected = new Set();
    for (const edge of store?.relationships || []) {
      if (!['runs_on', 'hosts', 'exposes', 'exposed_by'].includes(edge.type)
        || !placements.has(edge.sourceId) || !placements.has(edge.targetId)) continue;
      connected.add(edge.sourceId); connected.add(edge.targetId);
    }
    const ids = new Set();
    for (const id of connected) {
      const entity = entities.get(id);
      if (entity?.source !== 'observed' || entity.transient) continue;
      ids.add(id);
      let parent = placements.get(id)?.groupId;
      const seen = new Set();
      while (parent && !seen.has(parent) && isProjectContainer(entities.get(parent))) {
        seen.add(parent); ids.add(parent); parent = placements.get(parent)?.groupId;
      }
    }
    return ids;
  }
  return Object.freeze({ isProjectContainer, isCloudProject, select, materializedIds });
});
