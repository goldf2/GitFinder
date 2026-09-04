(function exposeRelationshipFlowAdapter(root, factory) {
  const portRouter = root?.RelationshipPortRouter
    || (typeof module !== 'undefined' && module.exports ? require('./relationshipPortRouter') : null);
  const projectSnap = root?.RelationshipProjectSnap
    || (typeof module !== 'undefined' && module.exports ? require('./relationshipProjectSnap') : null);
  const flowRouting = root?.RelationshipFlowRouting
    || (typeof module !== 'undefined' && module.exports ? require('./relationshipFlowRouting') : null);
  const api = factory(portRouter, projectSnap, flowRouting);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipFlowAdapter = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipFlowAdapter(PortRouter, ProjectSnap, FlowRouting) {
  const DEFAULT_CARD = { width: 280, height: 143 };
  const PROJECT_INSET = 12;

  function statusTone(entity) {
    if (entity?.runtime?.recentFailure?.hasFailure === true) return 'warning';
    const value = String(entity?.runtime?.healthState || entity?.runtime?.status
      || entity?.details?.healthState || entity?.details?.status || entity?.status || '').toLowerCase();
    if (/fail|fault|error|unhealthy|exited|down|critical/.test(value)) return 'warning';
    if (/stop|disabled|invalid|offline|unknown/.test(value)) return 'inactive';
    if (/healthy|running|online|reachable|success|available/.test(value)) return 'healthy';
    return 'inactive';
  }

  function showsRuntimeStatus(placement = {}, fallback = true) {
    if (placement.statusVisibility === 'show') return true;
    if (placement.statusVisibility === 'hide') return false;
    return fallback !== false;
  }

  function depthOf(placement, byId, seen = new Set()) {
    if (!placement?.groupId || seen.has(placement.entityId)) return 0;
    seen.add(placement.entityId);
    return 1 + depthOf(byId.get(placement.groupId), byId, seen);
  }

  function dimensions(placement, entity, options) {
    if (entity.type === 'group') return {
      width: Number(placement.groupWidth) || Number(options.groupWidth) || 640,
      height: Number(placement.groupHeight) || Number(options.groupHeight) || 400
    };
    if (entity.type === 'endpoint' && placement.endpointView === 'web') return {
      width: Math.max(Number(placement.cardWidth) || Number(options.cardWidth) || DEFAULT_CARD.width, 420),
      height: Math.max(Number(placement.cardHeight) || Number(options.cardHeight) || DEFAULT_CARD.height, 340)
    };
    if (['text', 'image', 'attachment'].includes(entity.type)) return {
      width: Number(entity.details?.width) || 320,
      height: Number(entity.details?.height) || 180
    };
    return {
      width: Number(placement.cardWidth) || Number(options.cardWidth) || DEFAULT_CARD.width,
      height: Number(placement.cardHeight) || Number(options.cardHeight) || DEFAULT_CARD.height
    };
  }

  function nodeDimensions(node) {
    return {
      width: Number(node?.measured?.width) || Number(node?.width) || Number(node?.style?.width) || DEFAULT_CARD.width,
      height: Number(node?.measured?.height) || Number(node?.height) || Number(node?.style?.height) || DEFAULT_CARD.height
    };
  }

  function isProjectGroup(entity = {}) {
    return entity.type === 'group' && (entity.runtime?.dynamicKind === 'coolify-project-group'
      || String(entity.id || '').startsWith('entity_panel_projectgroup_'));
  }

  function projectAncestors(placement, placementById, entities) {
    const ids = [];
    const seen = new Set([placement?.entityId]);
    let parentId = placement?.groupId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = placementById.get(parentId);
      if (!parent) break;
      if (isProjectGroup(entities.get(parent.entityId))) ids.push(parent.entityId);
      parentId = parent.groupId;
    }
    return ids;
  }

  function visibleProjectIds(graph, directIds, placementById, entities) {
    const ids = new Set();
    const addOwners = entityId => {
      const placement = placementById.get(entityId);
      for (const projectId of projectAncestors(placement, placementById, entities)) ids.add(projectId);
    };
    for (const entityId of directIds) addOwners(entityId);
    for (const edge of graph.relationships || []) {
      const deploymentId = edge.type === 'exposes' ? edge.sourceId : edge.type === 'exposed_by' ? edge.targetId : '';
      const endpointId = edge.type === 'exposes' ? edge.targetId : edge.type === 'exposed_by' ? edge.sourceId : '';
      if (directIds.has(endpointId) && entities.get(deploymentId)?.type === 'deployment') addOwners(deploymentId);
    }
    return ids;
  }

  function absolutePositions(nodes = []) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const values = new Map();
    const read = (node, seen = new Set()) => {
      if (!node || seen.has(node.id)) return { x: Number(node?.position?.x) || 0, y: Number(node?.position?.y) || 0 };
      if (values.has(node.id)) return values.get(node.id);
      seen.add(node.id);
      const parent = node.parentId ? read(byId.get(node.parentId), seen) : { x: 0, y: 0 };
      const value = { x: parent.x + (Number(node.position?.x) || 0), y: parent.y + (Number(node.position?.y) || 0) };
      values.set(node.id, value);
      return value;
    };
    for (const node of nodes) read(node);
    return values;
  }

  function projectAncestor(node, byId) {
    let parent = node?.parentId ? byId.get(node.parentId) : null;
    const seen = new Set([node?.id]);
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id);
      if (parent.data?.isProjectContainer || isProjectGroup(parent.data?.entity)) return parent.id;
      parent = parent.parentId ? byId.get(parent.parentId) : null;
    }
    return '';
  }

  function radialRectangleLimit(radius, halfWidth, halfHeight, unitX, unitY) {
    let limit = Infinity;
    for (const signX of [-1, 1]) for (const signY of [-1, 1]) {
      const cornerX = signX * halfWidth;
      const cornerY = signY * halfHeight;
      const projection = unitX * cornerX + unitY * cornerY;
      const discriminant = projection ** 2 + radius ** 2 - cornerX ** 2 - cornerY ** 2;
      if (discriminant < 0) return 0;
      limit = Math.min(limit, -projection + Math.sqrt(discriminant));
    }
    return Math.max(0, limit);
  }

  function constrainProjectNodes(nodes = []) {
    const next = nodes.map(node => ({ ...node, position: { ...(node.position || {}) }, data: { ...(node.data || {}) } }));
    const byId = new Map(next.map(node => [node.id, node]));
    const depths = new Map();
    const depth = node => {
      if (!node?.parentId || !byId.has(node.parentId)) return 0;
      if (!depths.has(node.id)) depths.set(node.id, 1 + depth(byId.get(node.parentId)));
      return depths.get(node.id);
    };
    for (const node of next) {
      node.data.isProjectContainer = node.data.isProjectContainer || isProjectGroup(node.data.entity);
      node.data.projectAncestorId = node.data.projectAncestorId || projectAncestor(node, byId);
    }
    for (const node of next.slice().sort((a, b) => depth(a) - depth(b))) {
      const project = node.data.projectAncestorId && byId.get(node.data.projectAncestorId);
      if (!project || project.id === node.id) continue;
      const absolute = absolutePositions(next);
      const projectPosition = absolute.get(project.id);
      const nodePosition = absolute.get(node.id);
      const parentPosition = node.parentId ? absolute.get(node.parentId) : { x: 0, y: 0 };
      const projectSize = nodeDimensions(project);
      const size = nodeDimensions(node);
      const inset = PROJECT_INSET;
      let x = nodePosition.x;
      let y = nodePosition.y;
      const shape = project.data?.placement?.groupShape || project.data?.placement?.projectGroupShape || 'rounded';
      if (shape === 'polygon') {
        const center = { x: projectPosition.x + projectSize.width / 2, y: projectPosition.y + projectSize.height / 2 };
        const nodeCenter = { x: x + size.width / 2, y: y + size.height / 2 };
        const dx = nodeCenter.x - center.x;
        const dy = nodeCenter.y - center.y;
        const distance = Math.hypot(dx, dy);
        const shapeFactor = shape === 'polygon' ? 0.84 : 1;
        const boundaryRadius = Math.max(0, Math.min(projectSize.width, projectSize.height) * shapeFactor / 2 - inset);
        const unitX = distance ? dx / distance : 0;
        const unitY = distance ? dy / distance : 0;
        const radius = radialRectangleLimit(boundaryRadius, size.width / 2, size.height / 2, unitX, unitY);
        if (distance > radius) {
          const scale = radius / Math.max(distance, 1);
          x = center.x + dx * scale - size.width / 2;
          y = center.y + dy * scale - size.height / 2;
        }
      } else {
        const maxX = projectPosition.x + projectSize.width - size.width - inset;
        const maxY = projectPosition.y + projectSize.height - size.height - inset;
        x = Math.min(Math.max(x, projectPosition.x + inset), Math.max(projectPosition.x + inset, maxX));
        y = Math.min(Math.max(y, projectPosition.y + inset), Math.max(projectPosition.y + inset, maxY));
      }
      node.position = { x: x - parentPosition.x, y: y - parentPosition.y };
    }
    return next;
  }

  function movementRoots(nodes = [], ids = []) {
    const moving = new Set(ids);
    const byId = new Map(nodes.map(node => [node.id, node]));
    return [...moving].filter(id => {
      let parent = byId.get(id)?.parentId;
      const seen = new Set([id]);
      while (parent && !seen.has(parent)) {
        if (moving.has(parent)) return false;
        seen.add(parent);
        parent = byId.get(parent)?.parentId;
      }
      return byId.has(id);
    });
  }

  function polygonTranslationScale(nodePosition, nodeSize, projectPosition, projectSize, delta) {
    const lengthSquared = delta.x ** 2 + delta.y ** 2;
    if (!lengthSquared) return 1;
    const center = {
      x: projectPosition.x + projectSize.width / 2,
      y: projectPosition.y + projectSize.height / 2
    };
    const radius = Math.max(0, Math.min(projectSize.width, projectSize.height) * 0.84 / 2 - PROJECT_INSET);
    let scale = 1;
    for (const cornerX of [nodePosition.x, nodePosition.x + nodeSize.width]) {
      for (const cornerY of [nodePosition.y, nodePosition.y + nodeSize.height]) {
        const x = cornerX - center.x;
        const y = cornerY - center.y;
        const constant = x ** 2 + y ** 2 - radius ** 2;
        if (constant > 1e-6) return 0;
        const linear = 2 * (x * delta.x + y * delta.y);
        const discriminant = linear ** 2 - 4 * lengthSquared * constant;
        if (discriminant < 0) return 0;
        scale = Math.min(scale, (-linear + Math.sqrt(discriminant)) / (2 * lengthSquared));
      }
    }
    return Math.min(1, Math.max(0, scale));
  }

  function feasibleLinkedDelta(nodes, roots, movingIds, startPositions, requested) {
    if ((!requested.x && !requested.y) || !roots.size) return requested;
    const startNodes = nodes.map(node => ({
      ...node,
      position: startPositions[node.id] ? { ...startPositions[node.id] } : { ...(node.position || {}) }
    }));
    const byId = new Map(startNodes.map(node => [node.id, node]));
    const absolute = absolutePositions(startNodes);
    let minX = -Infinity, maxX = Infinity, minY = -Infinity, maxY = Infinity;
    const polygons = [];
    for (const id of roots) {
      const node = byId.get(id);
      const projectId = node?.data?.projectAncestorId || projectAncestor(node, byId);
      const project = projectId && byId.get(projectId);
      if (!node || !project || movingIds.has(projectId)) continue;
      const nodePosition = absolute.get(id);
      const projectPosition = absolute.get(projectId);
      const nodeSize = nodeDimensions(node);
      const projectSize = nodeDimensions(project);
      const shape = project.data?.placement?.groupShape || project.data?.placement?.projectGroupShape || 'rounded';
      if (shape === 'polygon') {
        polygons.push({ nodePosition, nodeSize, projectPosition, projectSize });
        continue;
      }
      const lowerX = projectPosition.x + PROJECT_INSET - nodePosition.x;
      const upperX = projectPosition.x + projectSize.width - nodeSize.width - PROJECT_INSET - nodePosition.x;
      const lowerY = projectPosition.y + PROJECT_INSET - nodePosition.y;
      const upperY = projectPosition.y + projectSize.height - nodeSize.height - PROJECT_INSET - nodePosition.y;
      minX = Math.max(minX, Math.min(lowerX, upperX));
      maxX = Math.min(maxX, Math.max(lowerX, upperX));
      minY = Math.max(minY, Math.min(lowerY, upperY));
      maxY = Math.min(maxY, Math.max(lowerY, upperY));
    }
    const delta = {
      x: Math.min(Math.max(requested.x, minX), maxX),
      y: Math.min(Math.max(requested.y, minY), maxY)
    };
    let scale = 1;
    for (const polygon of polygons) scale = Math.min(scale, polygonTranslationScale(
      polygon.nodePosition, polygon.nodeSize, polygon.projectPosition, polygon.projectSize, delta
    ));
    return { x: delta.x * scale, y: delta.y * scale };
  }

  function applyLinkedDrag(nodes = [], options = {}) {
    const movingIds = new Set(options.linkedIds || [options.primaryId]);
    const roots = new Set(movementRoots(nodes, movingIds));
    const start = options.startPositions || {};
    const requested = { x: Number(options.delta?.x) || 0, y: Number(options.delta?.y) || 0 };
    const delta = feasibleLinkedDelta(nodes, roots, movingIds, start, requested);
    return nodes.map(node => {
      const origin = start[node.id];
      if (!roots.has(node.id) || !origin) return node;
      return { ...node, position: { x: origin.x + delta.x, y: origin.y + delta.y } };
    });
  }

  function rerouteFlowConnections(nodes = [], edges = [], options = {}) {
    return FlowRouting.route(nodes, edges, options);
  }

  function toFlowModel(graph = {}, options = {}) {
    const entities = new Map((graph.entities || []).map(entity => [entity.id, entity]));
    const placements = (graph.placements || []).filter(item => !item.archived && entities.has(item.entityId));
    const placementById = new Map(placements.map(item => [item.entityId, item]));
    const geometry = new Map(placements.map(placement => {
      const entity = entities.get(placement.entityId);
      return [placement.entityId, { x: placement.x || 0, y: placement.y || 0, ...dimensions(placement, entity, options) }];
    }));
    const placementOrder = new Map(placements.map((item, index) => [item.entityId, index]));
    const selectedIds = options.selectedIds instanceof Set ? options.selectedIds : new Set(options.selectedIds || []);
    const directIds = options.directIds instanceof Set ? options.directIds : new Set(options.directIds || []);
    const contextualIds = options.contextualIds instanceof Set ? options.contextualIds : new Set(options.contextualIds || []);
    const mutedIds = options.mutedIds instanceof Set ? options.mutedIds : new Set(options.mutedIds || []);
    const undraggableIds = options.undraggableIds instanceof Set ? options.undraggableIds : new Set(options.undraggableIds || []);
    const filterActive = options.filterActive === true;
    const visibleProjects = visibleProjectIds(graph, directIds, placementById, entities);
    let nodes = placements.slice().sort((a, b) => depthOf(a, placementById) - depthOf(b, placementById)
      || placementOrder.get(a.entityId) - placementOrder.get(b.entityId)).map(placement => {
      const entity = entities.get(placement.entityId);
      const parent = placement.groupId && placementById.get(placement.groupId);
      const size = geometry.get(placement.entityId);
      const projectContainer = isProjectGroup(entity);
      const linked = options.linkedNodeIds instanceof Map
        ? options.linkedNodeIds.get(placement.entityId)
        : options.linkedNodeIds?.[placement.entityId];
      return {
        id: placement.entityId,
        type: entity.type === 'group' ? 'relationshipGroup' : 'relationshipCard',
        position: { x: (placement.x || 0) - (parent?.x || 0), y: (placement.y || 0) - (parent?.y || 0) },
        ...(parent ? { parentId: parent.entityId, extent: 'parent' } : {}),
        selected: selectedIds.has(placement.entityId),
        draggable: placement.locked !== true && !undraggableIds.has(placement.entityId),
        style: { width: size.width, height: size.height },
        data: {
          entity,
          placement: { ...placement },
          isProjectContainer: projectContainer,
          linkedNodeIds: Array.isArray(linked) ? [...linked] : [placement.entityId],
          tone: statusTone(entity),
          showRuntimeStatus: showsRuntimeStatus(placement, options.showRuntimeStatus),
          filterState: directIds.has(placement.entityId) ? 'match'
            : (projectContainer ? (filterActive && !visibleProjects.has(placement.entityId) ? 'muted' : '') : (mutedIds.has(placement.entityId) ? 'muted'
              : (contextualIds.has(placement.entityId) ? 'context' : '')))
        }
      };
    });
    nodes = constrainProjectNodes(nodes);
    const visible = new Set(nodes.map(item => item.id));
    const edges = (graph.relationships || []).filter(edge => visible.has(edge.sourceId) && visible.has(edge.targetId))
      .map(edge => {
        const topologyAlert = edge.diagnostic?.severity === 'error';
        const visualOnly = edge.visualOnly === true;
        return {
          id: edge.id,
          source: edge.sourceId,
          target: edge.targetId,
          type: 'bezier',
          selected: visualOnly ? false : edge.id === options.selectedRelationshipId,
          ...(visualOnly ? { selectable: false, focusable: false, deletable: false } : {}),
          ...(topologyAlert
            ? { className: 'is-topology-alert', style: { stroke: '#d9485f', strokeWidth: 2.5 } }
            : (visualOnly ? {
              className: 'is-visual-summary',
              style: { stroke: '#8f98b3', strokeWidth: 1.25, strokeDasharray: '6 6', opacity: 0.7 }
            } : {})),
          data: {
            relationship: { ...edge },
            ...(visualOnly ? { visualOnly: true } : {}),
            ...(edge.diagnostic ? { diagnostic: { ...edge.diagnostic } } : {})
          },
          label: edge.label || ''
        };
      });
    return rerouteFlowConnections(nodes, edges, {
      zoom: options.zoom,
      groupTitleFontSize: options.groupTitleFontSize
    });
  }

  function toPlacements(nodes = [], placements = []) {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const absoluteById = new Map();
    const absolute = (node, seen = new Set()) => {
      if (!node || seen.has(node.id)) return { x: node?.position?.x || 0, y: node?.position?.y || 0 };
      if (absoluteById.has(node.id)) return absoluteById.get(node.id);
      seen.add(node.id);
      const parent = node.parentId ? absolute(nodeById.get(node.parentId), seen) : { x: 0, y: 0 };
      const value = { x: parent.x + (node.position?.x || 0), y: parent.y + (node.position?.y || 0) };
      absoluteById.set(node.id, value);
      return value;
    };
    return placements.map(placement => {
      const node = nodeById.get(placement.entityId);
      if (!node) return { ...placement };
      const position = absolute(node);
      const next = { ...placement, x: position.x, y: position.y };
      if (node.type === 'relationshipGroup') {
        const width = node.measured?.width || node.width || node.style?.width;
        const height = node.measured?.height || node.height || node.style?.height;
        if (Number.isFinite(width)) next.groupWidth = width;
        if (Number.isFinite(height)) next.groupHeight = height;
      }
      return next;
    });
  }

  return {
    toFlowModel,
    toPlacements,
    statusTone,
    showsRuntimeStatus,
    constrainProjectNodes,
    movementRoots,
    applyLinkedDrag,
    snapProjectDeployment: ProjectSnap.snap,
    clearProjectSnap: ProjectSnap.clear,
    rerouteFlowConnections,
    sidePair: PortRouter.sidePair
  };
});
