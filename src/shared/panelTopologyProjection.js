(function exposePanelTopologyProjection(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PanelTopologyProjection = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPanelTopologyProjection() {
  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function dynamicEntityId(kind, providerId, remoteId) {
    return `entity_panel_${kind}_${stableHash(`${providerId}\u0000${remoteId}`)}`;
  }

  function dynamicRelationshipId(type, sourceId, targetId) {
    return `relation_panel_${type}_${stableHash(`${sourceId}\u0000${targetId}`)}`;
  }

  function unique(values) {
    return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
  }

  function buildProjection(options = {}) {
    const state = String(options.state || 'unconfigured');
    const empty = {
      entities: [],
      relationships: [],
      placements: [],
      metadata: {
        state,
        generatedAt: options.topology?.generatedAt || '',
        serverCount: 0,
        deploymentCount: 0,
        failureCount: 0,
        missingRepositoryCount: 0
      }
    };
    if (state !== 'ready') return empty;

    const providerId = String(options.provider?.providerId || 'panel');
    const topology = options.topology || {};
    const servers = Array.isArray(topology.servers) ? topology.servers : [];
    const deployments = Array.isArray(topology.deployments) ? topology.deployments : [];
    const bindings = Array.isArray(options.bindings) ? options.bindings : [];
    const projects = Array.isArray(options.projects) ? options.projects : [];
    const repositories = Array.isArray(options.repositories) ? options.repositories : [];
    const existingEntities = Array.isArray(options.existingEntities) ? options.existingEntities : [];
    const existingByRef = new Map(existingEntities
      .filter(entity => entity?.refId && ['project', 'repository'].includes(entity.type))
      .map(entity => [`${entity.type}:${entity.refId}`, entity]));
    const projectById = new Map(projects.filter(item => item?.projectId).map(item => [item.projectId, item]));
    const repositoryById = new Map(repositories.filter(item => item?.id && item.archived !== true).map(item => [item.id, item]));
    const bindingsByResource = new Map();
    for (const binding of bindings) {
      if (!binding?.resourceUuid || binding.providerId !== providerId) continue;
      if (!bindingsByResource.has(binding.resourceUuid)) bindingsByResource.set(binding.resourceUuid, []);
      bindingsByResource.get(binding.resourceUuid).push(binding);
    }

    const entities = [];
    const relationships = [];
    const placements = [];
    const placedIds = new Set();
    const entityIds = new Set();
    const relationshipIds = new Set();
    const addEntity = (entity, placement) => {
      if (!entityIds.has(entity.id) && !existingEntities.some(item => item.id === entity.id)) {
        entityIds.add(entity.id);
        entities.push(entity);
      }
      if (!placedIds.has(entity.id)) {
        placedIds.add(entity.id);
        placements.push({ entityId: entity.id, ...placement, dynamic: true });
      }
      return entity.id;
    };
    const addReference = (type, refId, resource, placement) => {
      const existing = existingByRef.get(`${type}:${refId}`);
      if (existing) {
        if (!placedIds.has(existing.id)) {
          placedIds.add(existing.id);
          placements.push({ entityId: existing.id, ...placement, dynamic: true });
        }
        return existing.id;
      }
      const id = dynamicEntityId(type, 'gitfinder', refId);
      return addEntity({
        id,
        type,
        name: resource?.name || (type === 'project' ? '本地项目' : 'Git 仓库'),
        refId,
        details: {},
        source: 'gitfinder-registry',
        transient: true
      }, placement);
    };
    const addRelationship = (type, sourceId, targetId, observedAt) => {
      const id = dynamicRelationshipId(type, sourceId, targetId);
      if (relationshipIds.has(id)) return;
      relationshipIds.add(id);
      relationships.push({
        id,
        type,
        sourceId,
        targetId,
        source: 'observed',
        ...(observedAt ? { verifiedAt: observedAt } : {}),
        transient: true
      });
    };

    const serverIdByNode = new Map();
    servers.forEach((server, index) => {
      const id = dynamicEntityId('server', providerId, server.nodeId);
      serverIdByNode.set(server.nodeId, id);
      addEntity({
        id,
        type: 'server',
        name: server.name,
        details: { environment: server.environmentName || '', hostLabel: server.name || '' },
        source: 'observed',
        verifiedAt: server.observedAt,
        transient: true,
        runtime: { ...server, providerId, dynamicKind: 'panel-server' }
      }, { x: 980, y: 80 + index * 132 });
    });

    let failureCount = 0;
    const missingRepositories = new Set();
    deployments.forEach((deployment, deploymentIndex) => {
      const deploymentId = dynamicEntityId('deployment', providerId, deployment.resourceUuid);
      const deploymentBindings = bindingsByResource.get(deployment.resourceUuid) || [];
      const repositoryIds = unique(deploymentBindings.flatMap(binding => binding.repositoryIds || []));
      const missingRepositoryIds = repositoryIds.filter(repositoryId => !repositoryById.has(repositoryId));
      missingRepositoryIds.forEach(repositoryId => missingRepositories.add(repositoryId));
      if (deployment.recentFailure?.hasFailure) failureCount += 1;
      addEntity({
        id: deploymentId,
        type: 'deployment',
        name: deployment.name,
        details: {
          environment: deployment.environmentName || '',
          version: deployment.imageReference || '',
          branch: deployment.branch || '',
          revision: deployment.commit || '',
          status: deployment.status || ''
        },
        source: 'observed',
        verifiedAt: deployment.observedAt,
        transient: true,
        runtime: {
          ...deployment,
          providerId,
          dynamicKind: 'panel-deployment',
          repositoryIds,
          missingRepositoryIds,
          projectIds: unique(deploymentBindings.map(binding => binding.projectId))
        }
      }, { x: 680, y: 80 + deploymentIndex * 132 });

      const serverId = serverIdByNode.get(deployment.nodeId);
      if (serverId) addRelationship('runs_on', deploymentId, serverId, deployment.observedAt);

      let relationIndex = deploymentIndex;
      for (const binding of deploymentBindings) {
        const project = projectById.get(binding.projectId);
        const projectId = project
          ? addReference('project', binding.projectId, project, { x: 80, y: 80 + relationIndex * 132 })
          : '';
        for (const repositoryId of unique(binding.repositoryIds)) {
          const repository = repositoryById.get(repositoryId);
          if (!repository) continue;
          const repositoryEntityId = addReference('repository', repositoryId, repository, { x: 380, y: 80 + relationIndex * 132 });
          addRelationship('source_of', repositoryEntityId, deploymentId, deployment.observedAt);
          if (projectId) addRelationship('contains', projectId, repositoryEntityId, deployment.observedAt);
          relationIndex += 1;
        }
      }
    });

    return {
      entities,
      relationships,
      placements,
      metadata: {
        state,
        generatedAt: topology.generatedAt || '',
        serverCount: servers.length,
        deploymentCount: deployments.length,
        failureCount,
        missingRepositoryCount: missingRepositories.size
      }
    };
  }

  return { stableHash, dynamicEntityId, dynamicRelationshipId, buildProjection };
});
