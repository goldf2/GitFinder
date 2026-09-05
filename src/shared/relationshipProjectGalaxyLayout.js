(function exposeRelationshipProjectGalaxyLayout(root, factory) {
  const primitives = root?.RelationshipLayoutPrimitives
    || (typeof module !== 'undefined' && module.exports ? require('./relationshipLayoutPrimitives') : null);
  const structure = root?.RelationshipProjectStructure
    || (typeof module !== 'undefined' && module.exports ? require('./relationshipProjectStructure') : null);
  const api = factory(primitives, structure);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipProjectGalaxyLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipProjectGalaxyLayout(Primitives, ProjectStructure) {
  if (!Primitives || !ProjectStructure) throw new Error('Project 星系布局依赖未加载');

  function arrangeInterior(group, interior = [], options = {}) {
    const layout = Primitives.normalizeLayout(options);
    const groupShape = (options.projectGroupShape || group.groupShape) === 'polygon' ? 'polygon' : 'rounded';
    const size = item => ({ width: Number(item.width) || layout.width, height: Number(item.height) || layout.height });
    const cardWidth = Math.max(layout.width, ...interior.map(item => size(item).width));
    const cardHeight = Math.max(layout.height, ...interior.map(item => size(item).height));
    const paddingX = Math.max(28, layout.horizontalSpacing / 2);
    const paddingTop = Math.max(40, layout.verticalSpacing + 12);
    const paddingBottom = Math.max(28, layout.verticalSpacing / 2);
    const count = Math.max(1, interior.length);
    const grids = Array.from({ length: count }, (_, index) => {
      const columns = index + 1;
      const rows = Math.ceil(count / columns);
      const contentWidth = columns * cardWidth + Math.max(0, columns - 1) * layout.horizontalSpacing;
      const contentHeight = rows * cardHeight + Math.max(0, rows - 1) * layout.verticalSpacing;
      const circularRadius = Math.hypot(contentWidth / 2 + paddingX,
        contentHeight / 2 + Math.max(paddingTop, paddingBottom));
      const frameWidth = contentWidth + paddingX * 2;
      const frameHeight = contentHeight + paddingTop + paddingBottom;
      const rectangularArea = frameWidth * frameHeight;
      const aspectScore = Math.abs(Math.log(frameWidth / frameHeight / layout.viewportAspectRatio));
      return { columns, contentWidth, contentHeight, rectangularArea,
        score: groupShape === 'rounded' ? aspectScore : circularRadius };
    }).sort((a, b) => a.score - b.score || a.rectangularArea - b.rectangularArea || a.columns - b.columns);
    const { columns, contentWidth, contentHeight } = grids[0];
    const circular = groupShape !== 'rounded';
    const boundaryFactor = groupShape === 'polygon' ? 0.84 : 1;
    const radius = circular ? Math.ceil(Math.hypot(contentWidth / 2 + paddingX,
      contentHeight / 2 + Math.max(paddingTop, paddingBottom)) / boundaryFactor) : 0;
    const groupWidth = circular ? radius * 2 : Math.ceil(contentWidth + paddingX * 2);
    const groupHeight = circular ? radius * 2 : Math.ceil(contentHeight + paddingTop + paddingBottom);
    const previousWidth = Number(group.groupWidth) || groupWidth;
    const previousHeight = Number(group.groupHeight) || groupHeight;
    const previousCenter = { x: (Number(group.x) || 0) + previousWidth / 2, y: (Number(group.y) || 0) + previousHeight / 2 };
    group.groupWidth = groupWidth;
    group.groupHeight = groupHeight;
    group.x = options.preserveCenter ? previousCenter.x - groupWidth / 2 : 0;
    group.y = options.preserveCenter ? previousCenter.y - groupHeight / 2 : 0;
    interior.forEach((item, index) => {
      const row = Math.floor(index / columns), column = index % columns, dimensions = size(item);
      const rowCount = Math.min(columns, interior.length - row * columns);
      const rowWidth = rowCount * cardWidth + Math.max(0, rowCount - 1) * layout.horizontalSpacing;
      item.x = group.x + groupWidth / 2 - rowWidth / 2 + column * (cardWidth + layout.horizontalSpacing)
        + (cardWidth - dimensions.width) / 2;
      item.y = group.y + (circular ? groupHeight / 2 - contentHeight / 2 : paddingTop)
        + row * (cardHeight + layout.verticalSpacing) + (cardHeight - dimensions.height) / 2;
    });
    return { groupWidth, groupHeight, radius, circular };
  }

  function arrange(graph, options = {}) {
    const layout = Primitives.normalizeLayout(options);
    const groupTitleSpace = Math.max(0, Number(options.groupTitleSpace) || 0);
    const includeEndpoints = options.projectGroupIncludesEndpoints === true;
    const projectGroupShape = options.projectGroupShape === 'polygon' ? 'polygon' : 'rounded';
    const entities = new Map(graph.entities.map(entity => [entity.id, entity]));
    const placements = new Map(graph.placements.map(item => [item.entityId, item]));
    const projectGroups = graph.placements.filter(item => ProjectStructure.isProjectGroup(entities.get(item.entityId)))
      .sort((a, b) => a.entityId.localeCompare(b.entityId));
    if (!projectGroups.length) return false;
    const size = item => ({ width: Number(item.width) || layout.width, height: Number(item.height) || layout.height });
    const endpointProjects = new Map(), endpointDeployments = new Map();
    for (const edge of graph.relationships) {
      const deploymentId = edge.type === 'exposes' ? edge.sourceId : edge.type === 'exposed_by' ? edge.targetId : '';
      const endpointId = edge.type === 'exposes' ? edge.targetId : edge.type === 'exposed_by' ? edge.sourceId : '';
      const groupId = placements.get(deploymentId)?.groupId;
      if (!endpointId || !groupId || !projectGroups.some(group => group.entityId === groupId)) continue;
      if (!endpointProjects.has(endpointId)) endpointProjects.set(endpointId, new Set());
      if (!endpointDeployments.has(endpointId)) endpointDeployments.set(endpointId, new Set());
      endpointProjects.get(endpointId).add(groupId); endpointDeployments.get(endpointId).add(deploymentId);
    }
    const used = new Set(), records = [];
    for (const group of projectGroups) {
      const groupShape = ['rounded', 'polygon'].includes(group.groupShape) ? group.groupShape : projectGroupShape;
      const deployments = graph.placements.filter(item => item.groupId === group.entityId
        && entities.get(item.entityId)?.type === 'deployment').sort((a, b) => a.entityId.localeCompare(b.entityId));
      const endpoints = [...endpointProjects].filter(([id, owners]) => endpointDeployments.get(id)?.size === 1 && owners.has(group.entityId))
        .map(([id]) => placements.get(id)).filter(Boolean).sort((a, b) => {
          const ownerA = [...(endpointDeployments.get(a.entityId) || [])].sort()[0] || '';
          const ownerB = [...(endpointDeployments.get(b.entityId) || [])].sort()[0] || '';
          return ownerA.localeCompare(ownerB) || a.entityId.localeCompare(b.entityId);
        });
      const interior = includeEndpoints ? [...deployments, ...endpoints] : deployments;
      const orbitingEndpoints = includeEndpoints ? [] : endpoints;
      const locked = group.locked || deployments.some(item => item.locked) || endpoints.some(item => item.locked);
      if (locked) {
        const dimensions = { width: group.groupWidth || layout.width * 2.5, height: group.groupHeight || layout.width * 2.5 };
        records.push({ group, members: [group, ...deployments, ...endpoints], locked: true,
          x: group.x, y: group.y, width: dimensions.width, height: dimensions.height });
        [group, ...deployments, ...endpoints].forEach(item => used.add(item.entityId));
        continue;
      }
      const { groupWidth, groupHeight, radius, circular } = arrangeInterior(group, interior, {
        ...options,
        projectGroupShape: groupShape
      });
      // The fixed-size title lives above the Project frame. Keep the upper
      // semicircle free so orbiting endpoint cards never cover that title.
      const orbitAngles = orbitingEndpoints.map((_, index) => orbitingEndpoints.length === 1
        ? 0 : index * Math.PI / (orbitingEndpoints.length - 1));
      const angularStep = orbitAngles.length > 1 ? Math.PI / (orbitAngles.length - 1) : Math.PI * 2;
      const separationRadius = orbitingEndpoints.length > 1
        ? (Math.max(layout.width, ...orbitingEndpoints.map(item => size(item).width)) + layout.horizontalSpacing)
          / (2 * Math.sin(angularStep / 2)) : 0;
      orbitingEndpoints.forEach((item, index) => {
        const angle = orbitAngles[index];
        const dimensions = size(item);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const boundaryRadius = circular ? radius : Math.min(
          Math.abs(cos) < 1e-6 ? Infinity : groupWidth / 2 / Math.abs(cos),
          Math.abs(sin) < 1e-6 ? Infinity : groupHeight / 2 / Math.abs(sin)
        );
        const endpointRadius = Math.abs(cos) * dimensions.width / 2 + Math.abs(sin) * dimensions.height / 2;
        const orbitRadius = Math.ceil(Math.max(boundaryRadius + endpointRadius + layout.horizontalSpacing, separationRadius));
        item.x = groupWidth / 2 + cos * orbitRadius - dimensions.width / 2;
        item.y = groupHeight / 2 + sin * orbitRadius - dimensions.height / 2;
      });
      const members = [group, ...deployments, ...endpoints], rectangles = members.map(item => ({ item, ...size(item),
        x: item.x, y: item.y }));
      rectangles[0].width = groupWidth; rectangles[0].height = groupHeight;
      let titleRect = null;
      if (groupTitleSpace) {
        const titleScale = groupTitleSpace / 40;
        const fontScale = Math.max(14, Math.min(36, Number(options.groupTitleFontSize) || 20)) / 20;
        const title = String(entities.get(group.entityId)?.name || '群组');
        const nameWidth = [...title].reduce((sum, character) => sum
          + (/[^\u0000-\u00ff]/.test(character) ? 20 : (character === ' ' ? 6 : 11)), 0) * fontScale;
        const countWidth = String(Math.max(0, members.length - 1)).length * 7 + 42;
        const titleWidth = Math.max(120, nameWidth + countWidth + 18) * titleScale;
        titleRect = { item: group, title: true,
          x: group.x + groupWidth / 2 - titleWidth / 2,
          y: group.y - groupTitleSpace,
          width: titleWidth,
          height: groupTitleSpace };
        rectangles.push(titleRect);
      }
      const left = Math.min(...rectangles.map(item => item.x)), top = Math.min(...rectangles.map(item => item.y));
      const right = Math.max(...rectangles.map(item => item.x + item.width)), bottom = Math.max(...rectangles.map(item => item.y + item.height));
      records.push({ group, members, locked: false, titleRect, x: left, y: top, width: right - left, height: bottom - top });
      members.forEach(item => used.add(item.entityId));
    }

    const groupIds = new Set(graph.placements.filter(item => entities.get(item.entityId)?.type === 'group')
      .map(item => item.entityId));
    const groupChildren = new Map();
    for (const item of graph.placements) {
      if (!groupIds.has(item.groupId)) continue;
      if (!groupChildren.has(item.groupId)) groupChildren.set(item.groupId, []);
      groupChildren.get(item.groupId).push(item);
    }
    const collectGroupMembers = (groupId, visiting = new Set()) => {
      if (visiting.has(groupId)) return [];
      const next = new Set(visiting); next.add(groupId);
      return (groupChildren.get(groupId) || []).flatMap(item => [item,
        ...(entities.get(item.entityId)?.type === 'group' ? collectGroupMembers(item.entityId, next) : [])]);
    };
    const otherRootGroups = graph.placements.filter(item => entities.get(item.entityId)?.type === 'group'
      && !ProjectStructure.isProjectGroup(entities.get(item.entityId)) && !groupIds.has(item.groupId) && !used.has(item.entityId))
      .sort((a, b) => a.entityId.localeCompare(b.entityId));
    for (const group of otherRootGroups) {
      const members = [group, ...collectGroupMembers(group.entityId)].filter(item => !used.has(item.entityId));
      const rectangles = members.map(item => {
        const dimensions = entities.get(item.entityId)?.type === 'group'
          ? { width: Number(item.groupWidth) || layout.width * 2.5,
            height: Number(item.groupHeight) || layout.height * 2.5 }
          : size(item);
        return { x: item.x, y: item.y, ...dimensions };
      });
      const left = Math.min(...rectangles.map(item => item.x));
      const top = Math.min(...rectangles.map(item => item.y));
      const right = Math.max(...rectangles.map(item => item.x + item.width));
      const bottom = Math.max(...rectangles.map(item => item.y + item.height));
      records.push({ group, members, locked: members.some(item => item.locked), x: left, y: top,
        width: right - left, height: bottom - top, project: false });
      members.forEach(item => used.add(item.entityId));
    }
    const movable = records.filter(record => !record.locked);
    const positions = Primitives.packRegions(movable, layout.viewportAspectRatio, Math.max(120, layout.horizontalSpacing * 2));
    movable.forEach((record, index) => {
      const dx = positions[index].x - record.x, dy = positions[index].y - record.y;
      record.members.forEach(item => { item.x += dx; item.y += dy; });
      if (record.titleRect) { record.titleRect.x += dx; record.titleRect.y += dy; }
      record.x += dx; record.y += dy;
    });
    const fixed = records.filter(record => record.locked);
    if (fixed.length && movable.length) {
      const dx = Math.max(...fixed.map(record => record.x + record.width)) + layout.horizontalSpacing * 2
        - Math.min(...movable.map(record => record.x));
      movable.forEach(record => {
        record.members.forEach(item => { item.x += dx; });
        if (record.titleRect) record.titleRect.x += dx;
        record.x += dx;
      });
    }
    const groupCenter = new Map(records.map(record => [record.group.entityId, {
      x: record.group.x + (record.group.groupWidth || record.width) / 2,
      y: record.group.y + (record.group.groupHeight || record.height) / 2
    }]));
    const occupied = records.flatMap(record => [...record.members.map(item => {
      const dimensions = item.entityId === record.group.entityId
        ? { width: record.group.groupWidth || record.width, height: record.group.groupHeight || record.height }
        : size(item);
      return { x: item.x, y: item.y, ...dimensions };
    }), ...(record.titleRect ? [{ ...record.titleRect }] : [])]);
    const overlapsOccupied = candidate => occupied.some(rect => (
      candidate.x < rect.x + rect.width + layout.horizontalSpacing / 2
      && candidate.x + candidate.width + layout.horizontalSpacing / 2 > rect.x
      && candidate.y < rect.y + rect.height + layout.verticalSpacing / 2
      && candidate.y + candidate.height + layout.verticalSpacing / 2 > rect.y
    ));
    const sharedEndpoints = [...endpointProjects].filter(([id]) => endpointDeployments.get(id)?.size > 1)
      .map(([id, owners]) => ({ item: placements.get(id), owners: [...owners].sort() }))
      .filter(entry => entry.item && !used.has(entry.item.entityId))
      .sort((a, b) => a.item.entityId.localeCompare(b.item.entityId));
    sharedEndpoints.forEach(entry => {
      const centers = entry.owners.map(id => groupCenter.get(id)).filter(Boolean), dimensions = size(entry.item);
      if (!centers.length || entry.item.locked) return;
      const base = {
        x: centers.reduce((sum, center) => sum + center.x, 0) / centers.length - dimensions.width / 2,
        y: centers.reduce((sum, center) => sum + center.y, 0) / centers.length - dimensions.height / 2
      };
      const step = Math.max(dimensions.width + layout.horizontalSpacing, dimensions.height + layout.verticalSpacing);
      let candidate = { ...base, ...dimensions };
      search: for (let ring = 0; ring <= 32; ring++) {
        const samples = ring ? ring * 8 : 1;
        for (let sample = 0; sample < samples; sample++) {
          const angle = -Math.PI / 2 + sample * Math.PI * 2 / samples;
          candidate = { x: base.x + Math.cos(angle) * ring * step,
            y: base.y + Math.sin(angle) * ring * step, ...dimensions };
          if (!overlapsOccupied(candidate)) break search;
        }
      }
      entry.item.x = candidate.x; entry.item.y = candidate.y;
      occupied.push(candidate);
      used.add(entry.item.entityId);
    });
    const projectLeft = records.length ? Math.min(...records.map(record => record.x)) : 0;
    const projectTop = records.length ? Math.min(...records.map(record => record.y)) : 0;
    const projectBottom = records.length ? Math.max(...records.map(record => record.y + record.height)) : 0;
    const remaining = graph.placements.filter(item => !used.has(item.entityId) && !item.locked)
      .sort((a, b) => (entities.get(a.entityId)?.type === 'server' ? -1 : 0)
        - (entities.get(b.entityId)?.type === 'server' ? -1 : 0) || a.entityId.localeCompare(b.entityId));
    let cursorY = projectTop + Math.max(0, (projectBottom - projectTop - remaining.reduce((sum, item) => sum + size(item).height, 0)
      - Math.max(0, remaining.length - 1) * layout.verticalSpacing) / 2);
    for (const item of remaining) {
      const dimensions = size(item);
      item.x = projectLeft - dimensions.width - layout.horizontalSpacing * 2;
      item.y = cursorY; cursorY += dimensions.height + layout.verticalSpacing;
    }
    graph.placements.forEach(item => { item.x = Math.round(item.x); item.y = Math.round(item.y); });
    return graph;
  }

  return Object.freeze({ arrange, arrangeInterior });
});
