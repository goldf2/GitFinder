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

  function statusTone(entity) {
    if (entity?.runtime?.recentFailure?.hasFailure === true) return 'warning';
    const value = String(entity?.runtime?.healthState || entity?.runtime?.status
      || entity?.details?.healthState || entity?.details?.status || entity?.status || '').toLowerCase();
    if (/fail|fault|error|unhealthy|exited|down|critical/.test(value)) return 'warning';
    if (/stop|disabled|invalid|offline|unknown/.test(value)) return 'inactive';
    if (/healthy|running|online|reachable|success|available/.test(value)) return 'healthy';
    return 'inactive';
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
      const inset = 12;
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

  function applyLinkedDrag(nodes = [], options = {}) {
    const roots = new Set(movementRoots(nodes, options.linkedIds || [options.primaryId]));
    const changed = new Set(options.changedIds || []);
    const start = options.startPositions || {};
    const dx = Number(options.delta?.x) || 0;
    const dy = Number(options.delta?.y) || 0;
    return nodes.map(node => {
      const origin = start[node.id];
      if (!roots.has(node.id) || changed.has(node.id) || !origin) return node;
      return { ...node, position: { x: origin.x + dx, y: origin.y + dy } };
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
    let nodes = placements.slice().sort((a, b) => depthOf(a, placementById) - depthOf(b, placementById)
      || placementOrder.get(a.entityId) - placementOrder.get(b.entityId)).map(placement => {
      const entity = entities.get(placement.entityId);
      const parent = placement.groupId && placementById.get(placement.groupId);
      const size = geometry.get(placement.entityId);
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
          isProjectContainer: isProjectGroup(entity),
          linkedNodeIds: Array.isArray(linked) ? [...linked] : [placement.entityId],
          tone: statusTone(entity),
          filterState: mutedIds.has(placement.entityId) ? 'muted'
            : (contextualIds.has(placement.entityId) ? 'context' : (directIds.has(placement.entityId) ? 'match' : ''))
        }
      };
    });
    nodes = constrainProjectNodes(nodes);
    const visible = new Set(nodes.map(item => item.id));
    const edges = (graph.relationships || []).filter(edge => visible.has(edge.sourceId) && visible.has(edge.targetId))
      .map(edge => {
        const topologyAlert = edge.diagnostic?.severity === 'error';
        return {
          id: edge.id,
          source: edge.sourceId,
          target: edge.targetId,
          type: 'bezier',
          selected: edge.id === options.selectedRelationshipId,
          ...(topologyAlert ? { className: 'is-topology-alert', style: { stroke: '#d9485f', strokeWidth: 2.5 } } : {}),
          data: { relationship: { ...edge }, ...(edge.diagnostic ? { diagnostic: { ...edge.diagnostic } } : {}) },
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
    constrainProjectNodes,
    movementRoots,
    applyLinkedDrag,
    snapProjectDeployment: ProjectSnap.snap,
    clearProjectSnap: ProjectSnap.clear,
    rerouteFlowConnections,
    sidePair: PortRouter.sidePair
  };
});
