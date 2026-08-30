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

  function normalizeLayout(value = {}) {
    const number = (candidate, fallback, min, max) => {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    };
    return {
      width: number(value.width, 280, 180, 392),
      height: number(value.height, 132, 76, 260),
      horizontalSpacing: number(value.horizontalSpacing, 64, 16, 180),
      verticalSpacing: number(value.verticalSpacing, 36, 16, 140)
    };
  }

  function compactTopologyLayout(deployments, layout) {
    const pairColumns = 3;
    const endpointOffsetX = layout.width + layout.horizontalSpacing;
    const pairWidth = layout.width * 2 + layout.horizontalSpacing * 2;
    const endpointGapY = layout.height + layout.verticalSpacing;
    const rowStartY = 80 + layout.height + layout.verticalSpacing;
    const rowHeights = [];
    deployments.forEach((deployment, index) => {
      const row = Math.floor(index / pairColumns);
      const endpointRows = Math.max(1, unique(deployment?.domains).length);
      rowHeights[row] = Math.max(rowHeights[row] || 0, endpointRows * endpointGapY);
    });
    const rowOffsets = [];
    rowHeights.reduce((offset, height, index) => {
      rowOffsets[index] = offset;
      return offset + height;
    }, rowStartY);
    return deployments.map((deployment, index) => {
      const column = index % pairColumns;
      const row = Math.floor(index / pairColumns);
      const deploymentPlacement = { x: 80 + column * pairWidth, y: rowOffsets[row] };
      return {
        deployment: deploymentPlacement,
        endpoint: domainIndex => ({
          x: deploymentPlacement.x + endpointOffsetX,
          y: deploymentPlacement.y + domainIndex * endpointGapY
        })
      };
    });
  }

  function arrangeTopologyLanes({ entities, existingEntities, relationships, placements }, layout) {
    const entitiesById = new Map([...existingEntities, ...entities].map(entity => [entity.id, entity]));
    const placementsById = new Map(placements.map(placement => [placement.entityId, placement]));
    const laneStep = layout.width + layout.horizontalSpacing;
    const rowStep = layout.height + layout.verticalSpacing;
    const laneX = type => 80 + ({ project: 0, repository: 1, deployment: 2, server: 3, endpoint: 4 }[type] || 0) * laneStep;
    const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const relatedAverage = (entityId, type, side) => average(relationships
      .filter(relationship => relationship.type === type && relationship[side] === entityId)
      .map(relationship => placementsById.get(relationship[side === 'sourceId' ? 'targetId' : 'sourceId'])?.y)
      .filter(Number.isFinite));
    const lanePlacements = type => placements.filter(placement => entitiesById.get(placement.entityId)?.type === type);
    const placeLane = (type, desiredY) => {
      const items = lanePlacements(type).map(placement => ({
        placement,
        desired: desiredY(placement.entityId),
        name: String(entitiesById.get(placement.entityId)?.name || placement.entityId)
      })).sort((left, right) => {
        const leftY = Number.isFinite(left.desired) ? left.desired : Number.POSITIVE_INFINITY;
        const rightY = Number.isFinite(right.desired) ? right.desired : Number.POSITIVE_INFINITY;
        return leftY - rightY || left.name.localeCompare(right.name, 'zh-CN') || left.placement.entityId.localeCompare(right.placement.entityId);
      });
      let nextY = 80;
      for (const item of items) {
        item.placement.x = laneX(type);
        item.placement.y = Math.round(Math.max(nextY, Number.isFinite(item.desired) ? item.desired : nextY));
        nextY = item.placement.y + rowStep;
      }
    };

    const deployments = lanePlacements('deployment').sort((left, right) => {
      const leftEntity = entitiesById.get(left.entityId);
      const rightEntity = entitiesById.get(right.entityId);
      return String(leftEntity?.runtime?.providerLabel || '').localeCompare(String(rightEntity?.runtime?.providerLabel || ''), 'zh-CN')
        || String(leftEntity?.details?.environment || '').localeCompare(String(rightEntity?.details?.environment || ''), 'zh-CN')
        || String(leftEntity?.name || left.entityId).localeCompare(String(rightEntity?.name || right.entityId), 'zh-CN');
    });
    deployments.forEach((placement, index) => {
      placement.x = laneX('deployment');
      placement.y = 80 + index * rowStep;
    });
    placeLane('repository', entityId => relatedAverage(entityId, 'source_of', 'sourceId'));
    placeLane('project', entityId => relatedAverage(entityId, 'contains', 'sourceId'));
    placeLane('server', entityId => relatedAverage(entityId, 'runs_on', 'targetId'));
    placeLane('endpoint', entityId => relatedAverage(entityId, 'exposes', 'targetId'));
    return placements;
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
        providerCount: 0,
        serverCount: 0,
        deploymentCount: 0,
        endpointCount: 0,
        failureCount: 0,
        missingRepositoryCount: 0
      }
    };
    if (state !== 'ready') return empty;

    const defaultProviderId = String(options.provider?.providerId || 'panel');
    const defaultProviderLabel = String(options.provider?.label || '');
    const topology = options.topology || {};
    const layout = normalizeLayout(options.layout);
    const servers = Array.isArray(topology.servers) ? topology.servers : [];
    const deployments = Array.isArray(topology.deployments) ? topology.deployments : [];
    const topologyLayout = compactTopologyLayout(deployments, layout);
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
      if (!binding?.resourceUuid || !binding.providerId) continue;
      const key = `${binding.providerId}\u0000${binding.resourceUuid}`;
      if (!bindingsByResource.has(key)) bindingsByResource.set(key, []);
      bindingsByResource.get(key).push(binding);
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

    const providerIds = new Set();
    const serverIdByNode = new Map();
    const serverCountByProvider = new Map();
    for (const server of servers) {
      const providerId = String(server.providerId || defaultProviderId);
      serverCountByProvider.set(providerId, (serverCountByProvider.get(providerId) || 0) + 1);
    }
    servers.forEach((server, index) => {
      const providerId = String(server.providerId || defaultProviderId);
      const providerLabel = String(server.providerLabel || (providerId === defaultProviderId ? defaultProviderLabel : ''));
      const hostLabel = String(server.name || 'Coolify 服务器');
      const displayName = providerLabel
        ? (serverCountByProvider.get(providerId) > 1 && hostLabel !== providerLabel
          ? `${providerLabel} · ${hostLabel}`
          : providerLabel)
        : hostLabel;
      providerIds.add(providerId);
      const id = dynamicEntityId('server', providerId, server.nodeId);
      serverIdByNode.set(`${providerId}\u0000${server.nodeId}`, id);
      addEntity({
        id,
        type: 'server',
        name: displayName,
        details: { environment: server.environmentName || '', hostLabel, provider: providerLabel },
        source: 'observed',
        verifiedAt: server.observedAt,
        transient: true,
        runtime: { ...server, providerId, providerLabel, dynamicKind: 'panel-server' }
      }, { x: 80 + index * (layout.width + layout.horizontalSpacing), y: 80 });
    });

    let failureCount = 0;
    const missingRepositories = new Set();
    const endpointIdByDomain = new Map();
    deployments.forEach((deployment, deploymentIndex) => {
      const providerId = String(deployment.providerId || defaultProviderId);
      providerIds.add(providerId);
      const deploymentId = dynamicEntityId('deployment', providerId, deployment.resourceUuid);
      const deploymentBindings = bindingsByResource.get(`${providerId}\u0000${deployment.resourceUuid}`) || [];
      const repositoryIds = unique(deploymentBindings.flatMap(binding => binding.repositoryIds || []));
      const missingRepositoryIds = repositoryIds.filter(repositoryId => !repositoryById.has(repositoryId));
      missingRepositoryIds.forEach(repositoryId => missingRepositories.add(repositoryId));
      if (deployment.recentFailure?.hasFailure) failureCount += 1;
      const deploymentPlacement = topologyLayout[deploymentIndex]?.deployment || {
        x: 80,
        y: 80 + layout.height + layout.verticalSpacing + deploymentIndex * (layout.height + layout.verticalSpacing)
      };
      addEntity({
        id: deploymentId,
        type: 'deployment',
        name: deployment.name,
        details: {
          environment: deployment.environmentName || '',
          version: deployment.imageReference || '',
          branch: deployment.branch || '',
          revision: deployment.commit || '',
          status: deployment.status || '',
          provider: deployment.providerLabel || ''
        },
        source: 'observed',
        verifiedAt: deployment.observedAt,
        transient: true,
        runtime: {
          ...deployment,
          providerId,
          providerLabel: deployment.providerLabel || '',
          dynamicKind: 'panel-deployment',
          repositoryIds,
          missingRepositoryIds,
          projectIds: unique(deploymentBindings.map(binding => binding.projectId))
        }
      }, deploymentPlacement);

      const serverId = serverIdByNode.get(`${providerId}\u0000${deployment.nodeId}`);
      if (serverId) addRelationship('runs_on', deploymentId, serverId, deployment.observedAt);

      for (const [domainIndex, domain] of unique(deployment.domains).entries()) {
        const endpointKey = `${providerId}\u0000${domain}`;
        let endpointId = endpointIdByDomain.get(endpointKey);
        if (!endpointId) {
          endpointId = dynamicEntityId('endpoint', providerId, domain);
          endpointIdByDomain.set(endpointKey, endpointId);
          let hostname = domain;
          try { hostname = new URL(domain).hostname || domain; } catch (_) {}
          addEntity({
            id: endpointId,
            type: 'endpoint',
            name: hostname,
            details: { urlLabel: domain },
            source: 'observed',
            verifiedAt: deployment.observedAt,
            transient: true,
            runtime: {
              providerId,
              providerLabel: deployment.providerLabel || '',
              dynamicKind: 'panel-endpoint',
              url: domain,
              status: 'unknown',
              latencyMs: null,
              observedAt: deployment.observedAt
            }
          }, topologyLayout[deploymentIndex]?.endpoint(domainIndex) || {
            x: deploymentPlacement.x + layout.width + layout.horizontalSpacing,
            y: deploymentPlacement.y + domainIndex * (layout.height + layout.verticalSpacing)
          });
        }
        addRelationship('exposes', deploymentId, endpointId, deployment.observedAt);
      }

      let relationIndex = 0;
      for (const binding of deploymentBindings) {
        const project = projectById.get(binding.projectId);
        const projectId = project
          ? addReference('project', binding.projectId, project, {
              x: deploymentPlacement.x - (layout.width + layout.horizontalSpacing) * 2,
              y: deploymentPlacement.y + relationIndex * (layout.height + layout.verticalSpacing)
            })
          : '';
        for (const repositoryId of unique(binding.repositoryIds)) {
          const repository = repositoryById.get(repositoryId);
          if (!repository) continue;
          const repositoryEntityId = addReference('repository', repositoryId, repository, {
            x: deploymentPlacement.x - layout.width - layout.horizontalSpacing,
            y: deploymentPlacement.y + relationIndex * (layout.height + layout.verticalSpacing)
          });
          addRelationship('source_of', repositoryEntityId, deploymentId, deployment.observedAt);
          if (projectId) addRelationship('contains', projectId, repositoryEntityId, deployment.observedAt);
          relationIndex += 1;
        }
      }
    });

    arrangeTopologyLanes({ entities, existingEntities, relationships, placements }, layout);
    return {
      entities,
      relationships,
      placements,
      metadata: {
        state,
        generatedAt: topology.generatedAt || '',
        providerCount: providerIds.size,
        serverCount: servers.length,
        deploymentCount: deployments.length,
        endpointCount: endpointIdByDomain.size,
        failureCount,
        missingRepositoryCount: missingRepositories.size
      }
    };
  }

  return { stableHash, dynamicEntityId, dynamicRelationshipId, arrangeTopologyLanes, buildProjection };
});
