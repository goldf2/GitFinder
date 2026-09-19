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
      height: Math.max(Number(entity.details?.height) || 180, entity.type === 'text' ? Math.ceil((Number(entity.details?.fontSize) || 24) * 1.4 + 32) : 0)
    };
    return {
      width: Number(placement.cardWidth) || Number(options.cardWidth) || DEFAULT_CARD.width,
      height: (Number(placement.cardHeight) || Number(options.cardHeight) || DEFAULT_CARD.height)
        * (entity.type === 'endpoint' ? 0.6 : 1)
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

  function isHostProjectSummary(edge, entities) {
    return edge?.visualOnly === true
      && entities.get(edge.sourceId)?.type === 'server'
      && isProjectGroup(entities.get(edge.targetId));
  }

  // Rebuild the presentation from actual visible children, not stale frame
  // dimensions. This only affects the physical server tree, never source data.
  function fitPhysicalProjects(nodes, preserveManual = false) {
    for (const project of nodes.filter(node => isProjectGroup(node.data?.entity))) {
      if (project.data?.placement?.containerLayout === 'wrap') { project.data.nestedContainer = true; continue; }
      const children = nodes.filter(node => node.parentId === project.id);
      const size = nodeDimensions(project);
      const protectedLayout = preserveManual && (project.data?.placement?.groupLayout === 'manual'
        || project.data?.placement?.locked || children.some(child => child.data?.placement?.locked));
      const invalid = size.width < 320 || children.some(child => {
        const childSize = nodeDimensions(child);
        return child.position.x < 16 || child.position.y < 64
          || child.position.x + childSize.width > size.width - 16
          || child.position.y + childSize.height > size.height - 16;
      });
      if (invalid && !protectedLayout) {
        let y = 72;
        for (let index = 0; index < children.length; index += 2) {
          const row = children.slice(index, index + 2);
          let x = 24;
          for (const child of row) {
            child.position = { x, y };
            x += nodeDimensions(child).width + 24;
          }
          y += Math.max(...row.map(child => nodeDimensions(child).height)) + 24;
        }
      }
      project.data.nestedContainer = true;
      project.style = { ...project.style,
        width: Math.max(protectedLayout ? size.width : 320, ...children.map(child => child.position.x + nodeDimensions(child).width + 24)),
        height: Math.max(protectedLayout ? size.height : 136, ...children.map(child => child.position.y + nodeDimensions(child).height + 24)) };
    }
    return nodes;
  }

  function hostBubbleBounds(nodes, memberIds, fallback = { x: 0, y: 0 }, titleMetrics = {}) {
    // The host title is a first-level header. Keep a dedicated header band so
    // Project headers can never occupy the same screen row.
    const HOST_HEADER_SPACE = Math.max(88, Number(titleMetrics.containerHeaderHeight) || 0);
    const minWidth = Math.max(424, Number(titleMetrics.containerTitleMinWidth) + 40 || 0);
    const absolute = absolutePositions(nodes);
    const byId = new Map(nodes.map(node => [node.id, node]));
    const rects = memberIds.map(id => {
      const node = byId.get(id), position = absolute.get(id);
      if (!node || !position) return null;
      const size = nodeDimensions(node);
      return { x: position.x, y: position.y, width: size.width, height: size.height };
    }).filter(Boolean);
    if (!rects.length) return { x: fallback.x - 72, y: fallback.y - HOST_HEADER_SPACE, width: minWidth, height: 220 + HOST_HEADER_SPACE };
    const left = Math.min(...rects.map(rect => rect.x)) - 72;
    const top = Math.min(...rects.map(rect => rect.y)) - HOST_HEADER_SPACE;
    const right = Math.max(...rects.map(rect => rect.x + rect.width)) + 72;
    const bottom = Math.max(...rects.map(rect => rect.y + rect.height)) + 64;
    return { x: left, y: top, width: Math.max(minWidth, right - left), height: bottom - top };
  }

  function addHostBubbleNodes(nodes, relationships, entities, allHosts = false, preserveProjectRows = false, titleMetrics = {}) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const membersByHost = new Map();
    if (allHosts) for (const node of nodes) {
      if (entities.get(node.id)?.type === 'server') membersByHost.set(node.id, new Set());
    }
    for (const edge of relationships) {
      const target = entities.get(edge.targetId);
      const hostSummary = isHostProjectSummary(edge, entities)
        || (allHosts && edge.visualOnly === true && target?.type === 'deployment');
      if (!hostSummary || !byId.has(edge.targetId)) continue;
      // Deployments already owned by a Project are not direct host children.
      // Keeping only the Project at this level produces a real three-tier tree.
      if (allHosts && target?.type === 'deployment' && (byId.get(edge.targetId)?.parentId ||
        [...relationships].some(relation => relation.visualOnly !== true && relation.targetId === edge.targetId && isProjectGroup(entities.get(relation.sourceId))))) continue;
      if (!membersByHost.has(edge.sourceId)) membersByHost.set(edge.sourceId, new Set());
      membersByHost.get(edge.sourceId).add(edge.targetId);
    }
    const bubbles = [];
    for (const [hostId, memberSet] of membersByHost) {
      const host = entities.get(hostId);
      const hostNode = byId.get(hostId);
      if (!host || !hostNode) continue;
      const memberIds = [...memberSet];
      if (allHosts && !preserveProjectRows && hostNode.data?.placement?.containerLayout !== 'wrap') {
        const projects = memberIds.map(memberId => byId.get(memberId)).filter(node => isProjectGroup(node?.data?.entity))
          .sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id));
        // Repair legacy tall empty columns and collisions while retaining sane
        // manual spacing. Child positions are already relative to each Project.
        for (let index = 1; index < projects.length; index++) {
          const previous = projects[index - 1], current = projects[index];
          const bottom = previous.position.y + nodeDimensions(previous).height;
          const gap = current.position.y - bottom;
          if (gap < 32 || gap > 160) current.position = { x: previous.position.x, y: bottom + 48 };
        }
      }
      const wrap = hostNode.data?.placement?.containerLayout === 'wrap';
      const bounds = wrap ? { x: hostNode.position.x, y: hostNode.position.y,
        width: hostNode.data.placement.groupWidth, height: hostNode.data.placement.groupHeight }
        : hostBubbleBounds(nodes, memberIds, hostNode.position, titleMetrics);
      const id = `host-bubble:${hostId}`;
      // Reparent Project containers into the synthetic host node. Positions must
      // be converted from canvas coordinates to the host's local coordinates.
      const absolute = absolutePositions(nodes);
      for (const memberId of memberIds) {
        const member = byId.get(memberId);
        if (!member || !isProjectGroup(member.data?.entity)) continue;
        if (member.parentId && member.parentId !== id) continue;
        const position = absolute.get(memberId) || member.position || { x: 0, y: 0 };
        member.parentId = id;
        member.data = { ...member.data, nestedContainer: true };
        member.extent = 'parent';
        member.position = { x: position.x - bounds.x, y: position.y - bounds.y };
      }
      bubbles.push({
        id,
        type: 'hostBubble',
        position: { x: bounds.x, y: bounds.y },
        draggable: hostNode.draggable !== false && hostNode.data?.placement?.locked !== true
          && !nodes.some(node => node.data?.placement?.locked && (memberSet.has(node.id) || memberSet.has(node.parentId))),
        selectable: false,
        focusable: false,
        connectable: false,
        zIndex: -1,
        style: { width: bounds.width, height: bounds.height },
        data: {
          entity: host,
          placement: { ...(hostNode.data?.placement || {}), entityId: hostId },
          memberIds,
          // Direct (unclassified) deployments still need explicit linked drag;
          // Project descendants move with their React Flow parent.
          linkedNodeIds: [id, ...memberIds.filter(memberId => !isProjectGroup(entities.get(memberId)))],
          fallbackPosition: hostNode.position,
          projectCount: memberIds.filter(memberId => isProjectGroup(entities.get(memberId))).length,
          deploymentCount: memberIds.filter(memberId => entities.get(memberId)?.type === 'deployment').length,
          titleMetrics: { containerHeaderHeight: titleMetrics.containerHeaderHeight, containerTitleMinWidth: titleMetrics.containerTitleMinWidth },
          hostBubble: true,
          nestedContainer: allHosts
        }
      });
    }
    return bubbles;
  }

  function refreshHostBubbles(nodes) {
    const shifts = new Map();
    const resized = nodes.map(node => {
      if (node.type !== 'hostBubble' || !node.data.memberIds?.length || node.data?.placement?.containerLayout === 'wrap') return node;
      const bounds = hostBubbleBounds(nodes, node.data.memberIds || [], node.data.fallbackPosition, node.data.titleMetrics);
      shifts.set(node.id, { x: node.position.x - bounds.x, y: node.position.y - bounds.y });
      return { ...node, position: { x: bounds.x, y: bounds.y }, style: { ...node.style, width: bounds.width, height: bounds.height } };
    });
    return resized.map(node => {
      const shift = shifts.get(node.parentId);
      return shift ? { ...node, position: { x: node.position.x + shift.x, y: node.position.y + shift.y } } : node;
    });
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

  function overlaps(left, right) {
    return left.x < right.x + right.width && left.x + left.width > right.x
      && left.y < right.y + right.height && left.y + left.height > right.y;
  }

  // Group titles are rendered by React Flow in screen space, outside the
  // container frame. Persisted/manual boards can still contain a card in that
  // band, so protect the title at render time without changing relationships,
  // group membership, or the stored placement until the user moves a card.
  function avoidGroupTitleCollisions(nodes = [], options = {}) {
    const absolute = absolutePositions(nodes);
    const childCounts = nodes.reduce((counts, node) => {
      if (node.parentId) counts.set(node.parentId, (counts.get(node.parentId) || 0) + 1);
      return counts;
    }, new Map());
    const zoom = Math.max(0.03, Number(options.zoom) || 1);
    const fontSize = Math.max(8, Math.min(96, Number(options.groupTitleFontSize) || 20));
    const titles = nodes.filter(node => node.type === 'relationshipGroup').map(node => {
      const position = absolute.get(node.id) || { x: 0, y: 0 };
      const size = nodeDimensions(node);
      const width = (typeof FlowRouting?.titleWidth === 'function'
        ? FlowRouting.titleWidth(node.data?.entity, childCounts.get(node.id) || 0, fontSize)
        : 120) / zoom;
      const height = (fontSize + 10) / zoom;
      const offset = 8 / zoom;
      return {
        ownerId: node.id,
        x: position.x + size.width / 2 - width / 2,
        y: position.y - offset - height,
        width,
        height
      };
    });
    if (!titles.length) return nodes;

    const rectangles = new Map(nodes.map(node => {
      const position = absolute.get(node.id) || { x: 0, y: 0 };
      const size = nodeDimensions(node);
      return [node.id, { node, x: position.x, y: position.y, width: size.width, height: size.height }];
    }));
    const candidatesFor = (rect, title, gap) => [
      { x: title.x - rect.width - gap, y: title.y },
      { x: title.x + title.width + gap, y: title.y },
      { x: title.x, y: title.y - rect.height - gap },
      { x: title.x, y: title.y + title.height + gap }
    ];
    const canPlace = (candidate, currentId) => {
      if (titles.some(title => overlaps(candidate, title))) return false;
      return [...rectangles.values()].some(rect => rect.node.id !== currentId && overlaps(candidate, rect)) === false;
    };
    const cards = nodes.filter(node => node.type !== 'relationshipGroup' && node.type !== 'endpoint' && !node.parentId
      && node.data?.placement?.locked !== true);
    for (const node of cards) {
      const rect = rectangles.get(node.id);
      if (!rect) continue;
      const blockers = titles.filter(title => overlaps(rect, title));
      if (!blockers.length) continue;
      let best = null;
      for (const title of blockers) for (const candidate of candidatesFor(rect, title, 16 / zoom)) {
        if (!canPlace({ ...candidate, width: rect.width, height: rect.height }, node.id)) continue;
        const distance = Math.hypot(candidate.x - rect.x, candidate.y - rect.y);
        if (!best || distance < best.distance) best = { ...candidate, distance };
      }
      if (!best) continue;
      const dx = best.x - rect.x, dy = best.y - rect.y;
      node.position = { ...(node.position || {}), x: (Number(node.position?.x) || 0) + dx, y: (Number(node.position?.y) || 0) + dy };
      rectangles.set(node.id, { ...rect, x: best.x, y: best.y });
    }
    return nodes;
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
    const displayPlacements = placements;
    const placementById = new Map(displayPlacements.map(item => [item.entityId, item]));
    const geometry = new Map(displayPlacements.map(placement => {
      const entity = entities.get(placement.entityId);
      return [placement.entityId, { x: placement.x || 0, y: placement.y || 0, ...dimensions(placement, entity, options) }];
    }));
    const placementOrder = new Map(displayPlacements.map((item, index) => [item.entityId, index]));
    const selectedIds = options.selectedIds instanceof Set ? options.selectedIds : new Set(options.selectedIds || []);
    const directIds = options.directIds instanceof Set ? options.directIds : new Set(options.directIds || []);
    const contextualIds = options.contextualIds instanceof Set ? options.contextualIds : new Set(options.contextualIds || []);
    const mutedIds = options.mutedIds instanceof Set ? options.mutedIds : new Set(options.mutedIds || []);
    const undraggableIds = options.undraggableIds instanceof Set ? options.undraggableIds : new Set(options.undraggableIds || []);
    let nodes = displayPlacements.slice().sort((a, b) => depthOf(a, placementById) - depthOf(b, placementById)
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
          filterState: projectContainer || entity.type === 'server' ? ''
            : directIds.has(placement.entityId) ? 'match'
              : mutedIds.has(placement.entityId) ? 'muted'
                : contextualIds.has(placement.entityId) ? 'context' : ''
        }
      };
    });
    const preserveProjectRows = ['project-balanced', 'free'].includes(options.layout);
    if (options.hostContainerOnly) nodes = fitPhysicalProjects(nodes, preserveProjectRows);
    // Expanding a title may grow its frame upward/rightward, but must not
    // move the world position of saved children (including locked members).
    if (options.containerHeaderHeight > 72 || options.containerTitleMinWidth > 0) {
      for (const group of nodes.filter(node => isProjectGroup(node.data?.entity) && node.data?.placement?.containerLayout !== 'wrap')) {
        const children = nodes.filter(node => node.parentId === group.id);
        const extraTop = children.length ? Math.max(0, (options.containerHeaderHeight || 72) - Math.min(...children.map(node => node.position.y))) : 0;
        group.position = { ...group.position, y: group.position.y - extraTop };
        group.style = { ...group.style, width: Math.max(group.style.width, (options.containerTitleMinWidth || 0) + 40), height: Math.max(group.style.height + extraTop, (options.containerHeaderHeight || 72) + 48) };
        for (const child of children) child.position = { ...child.position, y: child.position.y + extraTop };
      }
    }
    if (!options.linkedNodeIds && !options.hostContainerOnly) nodes = avoidGroupTitleCollisions(nodes, options);
    nodes = constrainProjectNodes(nodes);
    const hostContainerOnly = options.hostContainerOnly === true;
    const hostContainers = hostContainerOnly || options.hostContainers === true;
    const hostIds = hostContainers ? new Set(nodes.filter(node => node.data?.entity?.type === 'server').map(node => node.id)) : new Set();
    if (hostContainers) nodes = nodes.filter(node => !hostIds.has(node.id));
    const visible = new Set([...nodes.map(item => item.id), ...(hostContainerOnly ? [] : hostIds)]);
    const edges = (graph.relationships || []).filter(edge => visible.has(edge.sourceId) && visible.has(edge.targetId)
      && !isHostProjectSummary(edge, entities))
      .map(edge => {
        const topologyAlert = edge.diagnostic?.severity === 'error';
        const visualOnly = edge.visualOnly === true;
        return {
          id: edge.id,
          source: hostIds.has(edge.sourceId) ? `host-bubble:${edge.sourceId}` : edge.sourceId,
          target: hostIds.has(edge.targetId) ? `host-bubble:${edge.targetId}` : edge.targetId,
          type: 'bezier',
          selected: visualOnly ? false : edge.id === options.selectedRelationshipId,
          ...(visualOnly ? { selectable: false, focusable: false, deletable: false } : {}),
          ...(topologyAlert
            ? { className: 'is-topology-alert', style: { stroke: '#d9485f', strokeWidth: 'calc(var(--relationship-edge-width, 1.7px) + 0.8px)' } }
            : (visualOnly ? {
              className: 'is-visual-summary',
              style: { stroke: '#8f98b3', strokeWidth: 'max(0.5px, calc(var(--relationship-edge-width, 1.7px) - 0.45px))', strokeDasharray: '6 6', opacity: 0.7 }
            } : {})),
          data: {
            relationship: { ...edge },
            ...(visualOnly ? { visualOnly: true } : {}),
            ...(edge.diagnostic ? { diagnostic: { ...edge.diagnostic } } : {})
          },
          label: edge.label || ''
        };
      });
    if (hostContainers) {
      const hostRelationships = [...(graph.relationships || [])];
      if (!hostContainerOnly) {
        // Derive boundaries from real ownership on mixed boards too. A shared
        // Project remains outside hosts instead of being parented to two of them.
        const owners = new Map(), groupOwners = new Map();
        for (const edge of graph.relationships || []) {
          const pair = edge.type === 'runs_on' ? [edge.sourceId, edge.targetId]
            : edge.type === 'hosts' ? [edge.targetId, edge.sourceId] : null;
          if (!pair || entities.get(pair[0])?.type !== 'deployment' || !hostIds.has(pair[1])) continue;
          if (!owners.has(pair[0])) owners.set(pair[0], new Set());
          owners.get(pair[0]).add(pair[1]);
          const groupId = placementById.get(pair[0])?.groupId;
          if (isProjectGroup(entities.get(groupId))) {
            if (!groupOwners.has(groupId)) groupOwners.set(groupId, new Set());
            groupOwners.get(groupId).add(pair[1]);
          }
        }
        for (const [deploymentId, hosts] of owners) for (const hostId of hosts) {
          const groupId = placementById.get(deploymentId)?.groupId;
          const targetId = groupOwners.get(groupId)?.size === 1 ? groupId : !groupId ? deploymentId : '';
          if (targetId) hostRelationships.push({ id: `host-scope:${hostId}:${targetId}`, sourceId: hostId, targetId, visualOnly: true });
        }
      }
      // The host card is a physical-resource identity, so keep it only as the
      // read-only container boundary. Its original placement remains untouched.
      nodes = [...addHostBubbleNodes([...nodes, ...placements
        .filter(item => hostIds.has(item.entityId))
        .map(item => ({ id: item.entityId, position: { x: item.x || 0, y: item.y || 0 }, style: { width: DEFAULT_CARD.width, height: DEFAULT_CARD.height }, draggable: !undraggableIds.has(item.entityId) && item.locked !== true, data: { entity: entities.get(item.entityId), placement: item } }))], hostRelationships, entities, true, preserveProjectRows || !hostContainerOnly, options), ...nodes];
      nodes = refreshHostBubbles(nodes);
      const hosts = (hostContainerOnly ? nodes.filter(node => node.type === 'hostBubble') : []).sort((a, b) => a.position.x - b.position.x || a.id.localeCompare(b.id));
      for (let index = 0; index < hosts.length; index++) {
        const host = hosts[index];
        if (host.data?.placement?.containerLayout === 'wrap') continue;
        const adjacent = hosts[index - 1];
        if (adjacent) {
          const previousSize = nodeDimensions(adjacent);
          const gap = host.position.x - adjacent.position.x - previousSize.width;
          const farApart = gap > Math.max(240, previousSize.width)
            || Math.abs(host.position.y - adjacent.position.y) > Math.max(previousSize.height, nodeDimensions(host).height) + 240;
          if (farApart) {
            const position = { x: adjacent.position.x + previousSize.width + 80, y: adjacent.position.y };
            for (const member of nodes.filter(node => host.data.memberIds.includes(node.id) && node.parentId !== host.id)) {
              member.position = { x: member.position.x + position.x - host.position.x, y: member.position.y + position.y - host.position.y };
            }
            host.position = position;
          }
        }
        for (const previous of hosts.slice(0, index)) {
          const rect = { ...host.position, ...nodeDimensions(host) };
          const other = { ...previous.position, ...nodeDimensions(previous) };
          if (overlaps(rect, other)) {
            const x = other.x + other.width + 80;
            const dx = x - host.position.x;
            for (const member of nodes.filter(node => host.data.memberIds.includes(node.id) && node.parentId !== host.id)) {
              member.position = { ...member.position, x: member.position.x + dx };
            }
            host.position = { ...host.position, x };
          }
        }
      }
    } else {
      nodes = [...addHostBubbleNodes(nodes, graph.relationships || [], entities, false, false, options), ...nodes];
    }
    for (const node of nodes) if (node.type === 'hostBubble') node.data.initialPosition = { ...node.position };
    return rerouteFlowConnections(nodes, options.showRelationshipLines === false ? [] : edges, {
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
      if (!node) {
        const host = nodeById.get(`host-bubble:${placement.entityId}`);
        if (host?.data?.placement?.containerLayout === 'wrap') {
          const rect = nodeDimensions(host);
          return { ...placement, x: host.position.x, y: host.position.y, containerLayout: 'wrap', groupWidth: rect.width, groupHeight: rect.height };
        }
        const initial = host?.data?.initialPosition;
        return host && initial && !host.data.memberIds?.length ? { ...placement, x: host.data.fallbackPosition.x + host.position.x - initial.x, y: host.data.fallbackPosition.y + host.position.y - initial.y } : { ...placement };
      }
      const position = absolute(node);
      const next = { ...placement, x: position.x, y: position.y };
      if (node.data?.placement?.containerLayout === 'wrap') { next.containerLayout = 'wrap'; if (node.type === 'relationshipGroup') next.groupLayout = 'manual'; }
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
    refreshHostBubbles,
    avoidGroupTitleCollisions,
    movementRoots,
    applyLinkedDrag,
    snapProjectDeployment: ProjectSnap.snap,
    clearProjectSnap: ProjectSnap.clear,
    rerouteFlowConnections,
    sidePair: PortRouter.sidePair
  };
});
