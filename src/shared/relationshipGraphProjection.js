(function exposeRelationshipGraphProjection(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipGraphProjection = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipGraphProjection() {
  function selectedValues(view, listKey, legacyKey) {
    if (Array.isArray(view?.[listKey]) && view[listKey].length) return view[listKey];
    const legacyValue = view?.[legacyKey];
    return legacyValue && legacyValue !== 'all' ? [legacyValue] : [];
  }

  const selectedEntityTypes = view => selectedValues(view, 'entityTypes', 'entityType');
  const selectedTaskFilters = view => selectedValues(view, 'taskFilters', 'task');
  const selectedRuntimeStates = view => Array.isArray(view?.runtimeStates) ? view.runtimeStates : [];

  function filterTokens(view = {}) {
    return [
      view.query,
      ...selectedEntityTypes(view),
      view.environment,
      view.verification !== 'all',
      view.annotation !== 'all',
      ...selectedTaskFilters(view),
      ...selectedRuntimeStates(view),
      view.label
    ];
  }

  const hasActiveFilters = view => filterTokens(view).some(Boolean);
  const activeFilterCount = view => filterTokens(view).filter(Boolean).length;

  function sameLocalDay(left, right) {
    const a = new Date(left);
    const b = new Date(right);
    return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())
      && a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function todosMatchAnyFilter(todos, filters, now) {
    if (!filters.length) return true;
    return filters.some(filter => {
      if (filter === 'has-todos') return todos.length > 0;
      if (filter === 'no-todos') return todos.length === 0;
      if (filter === 'open') return todos.some(todo => !todo.completed);
      if (filter === 'completed') return todos.some(todo => todo.completed);
      if (filter === 'overdue') return todos.some(todo => !todo.completed && todo.dueAt && new Date(todo.dueAt) < now);
      if (filter === 'due-today') return todos.some(todo => !todo.completed && todo.dueAt && sameLocalDay(todo.dueAt, now));
      if (filter === 'reminder-today') return todos.some(todo => !todo.completed && todo.reminderAt && sameLocalDay(todo.reminderAt, now));
      return false;
    });
  }

  function entityMatchesView({ entity, view, resource, placement = {}, model, typeLabels, now, runtimeTone, normalizeAnnotations }) {
    const entityTypes = selectedEntityTypes(view);
    if (entityTypes.length && !entityTypes.includes(entity.type)) return false;
    const runtimeStates = selectedRuntimeStates(view);
    if (runtimeStates.length && !runtimeStates.includes(runtimeTone(entity))) return false;
    if (view.environment && model.cleanText(entity.details?.environment, 80) !== view.environment) return false;
    if (view.verification !== 'all' && model.verificationStatus(entity, { now }).state !== view.verification) return false;
    const annotations = normalizeAnnotations(placement);
    const todos = annotations.todos || [];
    const currentTime = new Date(now);
    if (view.annotation === 'has-note' && !annotations.note) return false;
    if (view.label && !(annotations.labels || []).some(label => label.toLocaleLowerCase('zh-CN') === view.label.toLocaleLowerCase('zh-CN'))) return false;
    if (!todosMatchAnyFilter(todos, selectedTaskFilters(view), currentTime)) return false;
    const query = String(view.query || '').toLocaleLowerCase('zh-CN');
    if (!query) return true;
    return [
      resource?.name,
      resource?.path,
      resource?.secondary,
      entity.name,
      entity.refId,
      typeLabels[entity.type],
      Object.values(entity.details || {}).join(' '),
      entity.evidenceSummary,
      annotations.titleText,
      (annotations.labels || []).join(' '),
      annotations.note,
      todos.map(todo => todo.title).join(' ')
    ].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN').includes(query);
  }

  function filterGraph({ view, entitiesById, placements, relationships, matchesEntity, unmatchedDisplay }) {
    const filterActive = hasActiveFilters(view);
    const directIds = new Set();
    for (const placement of placements) {
      const entity = entitiesById.get(placement.entityId);
      if (entity && (!filterActive || matchesEntity(entity, placement))) directIds.add(entity.id);
    }
    const contextualIds = new Set();
    if (filterActive) {
      for (const relationship of relationships) {
        if (directIds.has(relationship.sourceId) || directIds.has(relationship.targetId)) {
          if (!directIds.has(relationship.sourceId)) contextualIds.add(relationship.sourceId);
          if (!directIds.has(relationship.targetId)) contextualIds.add(relationship.targetId);
        }
      }
    }
    const allIds = new Set(placements.map(placement => placement.entityId));
    const mutedIds = new Set([...allIds].filter(entityId => !directIds.has(entityId) && !contextualIds.has(entityId)));
    const visibleIds = filterActive && unmatchedDisplay === 'hide' ? directIds : allIds;
    return {
      placements: placements.filter(placement => visibleIds.has(placement.entityId)),
      relationships: relationships.filter(relationship => visibleIds.has(relationship.sourceId) && visibleIds.has(relationship.targetId)),
      directIds,
      contextualIds,
      mutedIds,
      filterActive
    };
  }

  function deploymentSummaryProjection({ graph, entitiesById, projection, model, now }) {
    if (projection !== 'deployment-summary' || graph.filterActive) return { ...graph, summaryRelationships: [] };
    const contains = [];
    const sourceByRepository = new Map();
    const runsByDeployment = new Map();
    for (const relationship of graph.relationships) {
      if (relationship.type === 'contains') contains.push(relationship);
      const index = relationship.type === 'source_of' ? sourceByRepository
        : (relationship.type === 'runs_on' ? runsByDeployment : null);
      if (!index) continue;
      if (!index.has(relationship.sourceId)) index.set(relationship.sourceId, []);
      index.get(relationship.sourceId).push(relationship);
    }
    const chains = [];
    for (const projectToRepository of contains) {
      for (const repositoryToDeployment of sourceByRepository.get(projectToRepository.targetId) || []) {
        for (const deploymentToServer of runsByDeployment.get(repositoryToDeployment.targetId) || []) {
          chains.push({
            projectId: projectToRepository.sourceId,
            repositoryId: projectToRepository.targetId,
            deploymentId: repositoryToDeployment.targetId,
            serverId: deploymentToServer.targetId,
            facts: [projectToRepository, repositoryToDeployment, deploymentToServer]
          });
        }
      }
    }
    if (!chains.length) return { ...graph, summaryRelationships: [] };

    const relationshipsByEntity = new Map();
    for (const relationship of graph.relationships) {
      for (const entityId of [relationship.sourceId, relationship.targetId]) {
        if (!relationshipsByEntity.has(entityId)) relationshipsByEntity.set(entityId, []);
        relationshipsByEntity.get(entityId).push(relationship);
      }
    }
    let deploymentIds = new Set(chains.map(chain => chain.deploymentId).filter(entityId => {
      const entityRelationships = relationshipsByEntity.get(entityId) || [];
      return entityRelationships.length > 0 && entityRelationships.every(relationship => (
        (relationship.type === 'source_of' && relationship.targetId === entityId)
        || (relationship.type === 'runs_on' && relationship.sourceId === entityId)
      ));
    }));
    let repositoryIds = new Set(chains.map(chain => chain.repositoryId).filter(entityId => {
      const entityRelationships = relationshipsByEntity.get(entityId) || [];
      return entityRelationships.length > 0 && entityRelationships.every(relationship => (
        (relationship.type === 'contains' && relationship.targetId === entityId)
        || (relationship.type === 'source_of' && relationship.sourceId === entityId && deploymentIds.has(relationship.targetId))
      ));
    }));
    let changed = true;
    while (changed) {
      const nextDeployments = new Set([...deploymentIds].filter(entityId => (
        (relationshipsByEntity.get(entityId) || []).every(relationship => relationship.type !== 'source_of' || repositoryIds.has(relationship.sourceId))
      )));
      const nextRepositories = new Set([...repositoryIds].filter(entityId => (
        (relationshipsByEntity.get(entityId) || []).every(relationship => relationship.type !== 'source_of' || nextDeployments.has(relationship.targetId))
      )));
      changed = nextDeployments.size !== deploymentIds.size || nextRepositories.size !== repositoryIds.size;
      deploymentIds = nextDeployments;
      repositoryIds = nextRepositories;
    }
    const projectedChains = chains.filter(chain => repositoryIds.has(chain.repositoryId) && deploymentIds.has(chain.deploymentId));
    if (!projectedChains.length) return { ...graph, summaryRelationships: [] };
    const collapsedIds = new Set(projectedChains.flatMap(chain => [chain.repositoryId, chain.deploymentId]));
    const summaries = new Map();
    for (const chain of projectedChains) {
      const key = `${chain.projectId}\u0000${chain.serverId}`;
      if (!summaries.has(key)) summaries.set(key, {
        id: `summary_${chain.projectId}_${chain.serverId}`,
        type: 'deployment_summary',
        sourceId: chain.projectId,
        targetId: chain.serverId,
        chains: []
      });
      summaries.get(key).chains.push(chain);
    }
    const summaryRelationships = [...summaries.values()].map(summary => {
      const deployments = [...new Set(summary.chains.map(chain => chain.deploymentId))];
      const title = deployments.map(entityId => {
        const entity = entitiesById.get(entityId);
        return [entity?.name, entity?.details?.environment, entity?.details?.version, entity?.details?.branch, entity?.details?.revision]
          .filter(Boolean).join(' · ');
      }).filter(Boolean).join('；');
      const states = summary.chains.flatMap(chain => chain.facts)
        .map(fact => model.verificationStatus(fact, { now }).state);
      return {
        ...summary,
        count: deployments.length,
        label: deployments.length > 1 ? `部署 ×${deployments.length}` : '部署',
        title,
        verificationState: states.includes('unverified') ? 'unverified' : (states.includes('stale') ? 'stale' : 'verified')
      };
    });
    return {
      ...graph,
      placements: graph.placements.filter(placement => !collapsedIds.has(placement.entityId)),
      relationships: graph.relationships.filter(relationship => !collapsedIds.has(relationship.sourceId) && !collapsedIds.has(relationship.targetId)),
      summaryRelationships,
      directIds: new Set([...graph.directIds].filter(entityId => !collapsedIds.has(entityId))),
      contextualIds: new Set([...graph.contextualIds].filter(entityId => !collapsedIds.has(entityId))),
      mutedIds: new Set([...graph.mutedIds].filter(entityId => !collapsedIds.has(entityId)))
    };
  }

  return Object.freeze({
    selectedEntityTypes,
    selectedTaskFilters,
    selectedRuntimeStates,
    hasActiveFilters,
    activeFilterCount,
    entityMatchesView,
    filterGraph,
    deploymentSummaryProjection
  });
});
