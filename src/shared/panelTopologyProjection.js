(function exposePanelTopologyProjection(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PanelTopologyProjection = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPanelTopologyProjection() {
  const RepositoryAssociation = typeof module !== 'undefined' && module.exports
    ? require('./repositoryAssociation') : window.RepositoryAssociation;
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

  function orderByTopologyAndPosition(items, relationships = [], axis = 'y') {
    const byId = new Map(items.map(item => [item.entityId, item]));
    const compare = (a, b) => (a[axis] || 0) - (b[axis] || 0)
      || (a[axis === 'x' ? 'y' : 'x'] || 0) - (b[axis === 'x' ? 'y' : 'x'] || 0)
      || a.entityId.localeCompare(b.entityId);
    const neighbors = new Map(items.map(item => [item.entityId, new Set()]));
    const reverse = new Map(items.map(item => [item.entityId, new Set()]));
    for (const edge of relationships) {
      if (!byId.has(edge.sourceId) || !byId.has(edge.targetId) || edge.sourceId === edge.targetId) continue;
      neighbors.get(edge.sourceId).add(edge.targetId);
      reverse.get(edge.targetId).add(edge.sourceId);
    }
    // Collapse cycles before topological sorting; cycle members retain spatial order.
    const seen = new Set(), finished = [];
    for (const item of items) {
      const stack = [[item.entityId, false]];
      while (stack.length) {
        const [id, done] = stack.pop();
        if (done) { finished.push(id); continue; }
        if (seen.has(id)) continue;
        seen.add(id); stack.push([id, true]);
        for (const next of neighbors.get(id)) if (!seen.has(next)) stack.push([next, false]);
      }
    }
    const componentOf = new Map(), components = [];
    for (const id of finished.reverse()) {
      if (componentOf.has(id)) continue;
      const index = components.length, members = [], stack = [id];
      componentOf.set(id, index);
      while (stack.length) {
        const next = stack.pop(); members.push(byId.get(next));
        for (const parent of reverse.get(next)) if (!componentOf.has(parent)) {
          componentOf.set(parent, index); stack.push(parent);
        }
      }
      components.push({ members: members.sort(compare), next: new Set(), incoming: 0 });
    }
    for (const [id, next] of neighbors) for (const target of next) {
      const from = componentOf.get(id), to = componentOf.get(target);
      if (from !== to && !components[from].next.has(to)) {
        components[from].next.add(to); components[to].incoming++;
      }
    }
    const ready = components.filter(item => !item.incoming), ordered = [];
    while (ready.length) {
      ready.sort((a, b) => compare(a.members[0], b.members[0]));
      const current = ready.shift(); ordered.push(...current.members);
      for (const index of current.next) if (--components[index].incoming === 0) ready.push(components[index]);
    }
    return ordered;
  }

  function routeRelationship(source, target, obstacles = [], options = {}) {
    const padding = 14, inset = options.inset ?? 0.5;
    const expand = (r, amount) => ({ x: r.x - amount, y: r.y - amount,
      width: r.width + amount * 2, height: r.height + amount * 2 });
    const normals = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
    const port = (r, side) => r.width === 0 && r.height === 0 ? { x: r.x, y: r.y } : ({
      x: side === 'left' ? r.x + inset : side === 'right' ? r.x + r.width - inset : r.x + r.width / 2,
      y: side === 'top' ? r.y + inset : side === 'bottom' ? r.y + r.height - inset
        : r.y + Math.min(options.portOffsetY ?? r.height / 2, r.height / 2)
    });
    const dx = target.x + target.width / 2 - source.x - source.width / 2;
    const dy = target.y + target.height / 2 - source.y - source.height / 2;
    const horizontal = [dx >= 0 ? 'right' : 'left', dx >= 0 ? 'left' : 'right'];
    const vertical = [dy >= 0 ? 'bottom' : 'top', dy >= 0 ? 'top' : 'bottom'];
    const preferred = Math.abs(dx) / Math.max(1, source.width + target.width)
      >= Math.abs(dy) / Math.max(1, source.height + target.height) ? horizontal : vertical;
    const pairs = [preferred, preferred === horizontal ? vertical : horizontal,
      [horizontal[0], vertical[1]], [vertical[0], horizontal[1]]];
    for (const a of Object.keys(normals)) for (const b of Object.keys(normals)) {
      if (!pairs.some(pair => pair[0] === a && pair[1] === b)) pairs.push([a, b]);
    }
    if (options.sourceSide) pairs.splice(0, pairs.length, ...pairs.filter(pair => pair[0] === options.sourceSide));
    const others = obstacles.map(r => expand(r, padding));
    const curveObstacles = [...others, expand(source, -2), expand(target, -2)].filter(r => r.width > 0 && r.height > 0);
    const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const curveClear = (points, boxes, depth = 0) => {
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
      const hits = boxes.filter(r => right > r.x && left < r.x + r.width && bottom > r.y && top < r.y + r.height);
      if (!hits.length) return true;
      if (depth === 12 || (right - left < 0.5 && bottom - top < 0.5)) return false;
      const a = midpoint(points[0], points[1]), b = midpoint(points[1], points[2]), c = midpoint(points[2], points[3]);
      const d = midpoint(a, b), e = midpoint(b, c), f = midpoint(d, e);
      return curveClear([points[0], a, d, f], hits, depth + 1) && curveClear([f, e, c, points[3]], hits, depth + 1);
    };
    const sampleCurve = p => Array.from({ length: 33 }, (_, i) => {
      const t = i / 32, u = 1 - t;
      return { x: u ** 3 * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t ** 3 * p[3].x,
        y: u ** 3 * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t ** 3 * p[3].y };
    });
    const result = (path, points, sourceSide, targetSide, obstructed = false) => {
      const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
      let remaining = lengths.reduce((sum, n) => sum + n, 0) / 2, label = points[0];
      for (let i = 0; i < lengths.length; i++) {
        if (remaining <= lengths[i]) {
          const t = lengths[i] ? remaining / lengths[i] : 0;
          label = { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }; break;
        }
        remaining -= lengths[i];
      }
      return { path, points, sourceSide, targetSide, sourcePoint: points[0], targetPoint: points.at(-1),
        labelX: label.x, labelY: label.y - 8, obstructed };
    };
    let fallback;
    const candidates = [];
    for (const [sourceSide, targetSide] of pairs) {
      const a = port(source, sourceSide), b = port(target, targetSide);
      const normalA = normals[sourceSide], normalB = normals[targetSide];
      for (const tension of [0.25, 0.5, 0.85]) {
        const bend = Math.max(28, (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) * tension);
        const c = { x: a.x + normalA[0] * bend, y: a.y + normalA[1] * bend };
        const d = { x: b.x + normalB[0] * bend, y: b.y + normalB[1] * bend };
        const path = `M ${a.x} ${a.y} C ${c.x} ${c.y}, ${d.x} ${d.y}, ${b.x} ${b.y}`;
        const points = [a, c, d, b];
        const sampled = sampleCurve(points);
        const length = sampled.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - sampled[i].x, point.y - sampled[i].y), 0);
        fallback ||= result(path, sampled, sourceSide, targetSide, true);
        candidates.push({ path, points, sampled, sourceSide, targetSide, length });
      }
    }
    candidates.sort((a, b) => a.length - b.length);
    const curve = candidates.find(candidate => curveClear(candidate.points, curveObstacles));
    if (curve) return result(curve.path, curve.sampled, curve.sourceSide, curve.targetSide);
    // Only blocked curves need a channel search. The grid is lazy and the search
    // is bounded so a dense board cannot monopolize the drag event loop.
    const boxes = [...others, expand(source, padding), expand(target, padding)];
    const inside = (p, r) => p.x > r.x + 0.01 && p.x < r.x + r.width - 0.01 && p.y > r.y + 0.01 && p.y < r.y + r.height - 0.01;
    const clear = (a, b, rects = boxes) => !rects.some(r => a.x === b.x
      ? a.x > r.x + 0.01 && a.x < r.x + r.width - 0.01 && Math.max(a.y, b.y) > r.y + 0.01 && Math.min(a.y, b.y) < r.y + r.height - 0.01
      : a.y > r.y + 0.01 && a.y < r.y + r.height - 0.01 && Math.max(a.x, b.x) > r.x + 0.01 && Math.min(a.x, b.x) < r.x + r.width - 0.01);
    const channelPairs = candidates.filter((item, index) => candidates.findIndex(other => (
      other.sourceSide === item.sourceSide && other.targetSide === item.targetSide
    )) === index).slice(0, 4);
    for (const { sourceSide, targetSide } of channelPairs) {
      const a = port(source, sourceSide), b = port(target, targetSide), na = normals[sourceSide], nb = normals[targetSide];
      const stub = padding + inset + 1;
      const start = { x: a.x + na[0] * stub, y: a.y + na[1] * stub }, end = { x: b.x + nb[0] * stub, y: b.y + nb[1] * stub };
      if (boxes.some(r => inside(start, r) || inside(end, r)) || !clear(a, start, others) || !clear(end, b, others)) continue;
      const xs = [...new Set([start.x, end.x, ...boxes.flatMap(r => [r.x, r.x + r.width])])].sort((a, b) => a - b);
      const ys = [...new Set([start.y, end.y, ...boxes.flatMap(r => [r.y, r.y + r.height])])].sort((a, b) => a - b);
      const heap = [], costs = new Map(), parents = new Map();
      const push = item => {
        let i = heap.length; heap.push(item);
        while (i > 0) { const p = (i - 1) >> 1; if (heap[p].score <= item.score) break; heap[i] = heap[p]; i = p; }
        heap[i] = item;
      };
      const pop = () => {
        const first = heap[0], last = heap.pop();
        if (heap.length) {
          let i = 0;
          while (i * 2 + 1 < heap.length) {
            let child = i * 2 + 1;
            if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
            if (last.score <= heap[child].score) break;
            heap[i] = heap[child]; i = child;
          }
          heap[i] = last;
        }
        return first;
      };
      const key = (x, y, direction) => (x * ys.length + y) * 3 + direction;
      const origin = { x: xs.indexOf(start.x), y: ys.indexOf(start.y), direction: na[0] ? 1 : 2, cost: 0, score: 0 };
      origin.key = key(origin.x, origin.y, origin.direction); push(origin); costs.set(origin.key, 0);
      let finish;
      for (let visited = 0; heap.length && visited < 6000; visited++) {
        const current = pop();
        if (costs.get(current.key) !== current.cost) continue;
        const point = { x: xs[current.x], y: ys[current.y] };
        if (point.x === end.x && point.y === end.y) { finish = current; break; }
        for (const [dx, dy, direction] of [[-1, 0, 1], [1, 0, 1], [0, -1, 2], [0, 1, 2]]) {
          const x = current.x + dx, y = current.y + dy;
          if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue;
          const next = { x: xs[x], y: ys[y] };
          if (!clear(point, next)) continue;
          const cost = current.cost + Math.abs(point.x - next.x) + Math.abs(point.y - next.y) + (direction !== current.direction ? 24 : 0);
          const id = key(x, y, direction);
          if (cost >= (costs.get(id) ?? Infinity)) continue;
          costs.set(id, cost); parents.set(id, current);
          push({ x, y, direction, key: id, cost, score: cost + Math.abs(next.x - end.x) + Math.abs(next.y - end.y) });
        }
      }
      if (!finish) continue;
      const points = [b];
      for (let current = finish; current; current = parents.get(current.key)) points.push({ x: xs[current.x], y: ys[current.y] });
      points.push(a); points.reverse();
      for (let i = points.length - 2; i > 0; i--) if ((points[i - 1].x === points[i].x && points[i].x === points[i + 1].x)
        || (points[i - 1].y === points[i].y && points[i].y === points[i + 1].y)) points.splice(i, 1);
      let path = `M ${a.x} ${a.y}`;
      for (let i = 1; i < points.length - 1; i++) {
        const p = points[i], prev = points[i - 1], next = points[i + 1];
        const radius = Math.min(8, Math.hypot(p.x - prev.x, p.y - prev.y) / 2, Math.hypot(p.x - next.x, p.y - next.y) / 2);
        const before = { x: p.x + Math.sign(prev.x - p.x) * radius, y: p.y + Math.sign(prev.y - p.y) * radius };
        const after = { x: p.x + Math.sign(next.x - p.x) * radius, y: p.y + Math.sign(next.y - p.y) * radius };
        path += ` L ${before.x} ${before.y} Q ${p.x} ${p.y} ${after.x} ${after.y}`;
      }
      path += ` L ${b.x} ${b.y}`;
      return result(path, points, sourceSide, targetSide);
    }
    return fallback;
  }

  function normalizeLayout(value = {}) {
    const number = (candidate, fallback, min, max) => {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
    };
    return {
      width: number(value.width, 280, 180, 840),
      height: number(value.height, 132, 76, 588),
      horizontalSpacing: number(value.horizontalSpacing, 64, 16, 180),
      verticalSpacing: number(value.verticalSpacing, 36, 16, 140),
      viewportAspectRatio: number(value.viewportAspectRatio, 1.6, 0.5, 3)
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
    const original = new Map(placements.map(item => [item.entityId, { ...item }]));
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
      const items = orderByTopologyAndPosition(lanePlacements(type).map(placement => {
        const desired = desiredY(placement.entityId), before = original.get(placement.entityId);
        return { entityId: placement.entityId, placement, desired, x: before.x, y: desired ?? before.y };
      }), relationships);
      let nextY = 80;
      for (const item of items) {
        item.placement.x = laneX(type);
        item.placement.y = Math.round(Math.max(nextY, Number.isFinite(item.desired) ? item.desired : nextY));
        nextY = item.placement.y + rowStep;
      }
    };

    const deployments = orderByTopologyAndPosition(lanePlacements('deployment'), relationships);
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

  // Layout rectangles around graph centers. A shared resource is assigned to the
  // nearest center once; all original edges remain available across regions.
  function arrangeAroundCenters({ placements, relationships }, centerIds, options = {}) {
    const byId = new Map(placements.map(item => [item.entityId, item]));
    const centers = unique(centerIds).filter(id => byId.has(id));
    if (!centers.length) return false;
    const layout = normalizeLayout(options);
    const size = item => ({ width: item.width || layout.width, height: item.height || layout.height });
    const neighbors = new Map(placements.map(item => [item.entityId, new Set()]));
    for (const edge of relationships) {
      if (!byId.has(edge.sourceId) || !byId.has(edge.targetId)) continue;
      neighbors.get(edge.sourceId).add(edge.targetId);
      neighbors.get(edge.targetId).add(edge.sourceId);
    }
    const owners = new Map(centers.map(id => [id, { center: id, depth: 0 }]));
    const queue = [...centers];
    for (let index = 0; index < queue.length; index++) {
      const current = owners.get(queue[index]);
      for (const id of [...neighbors.get(queue[index])].sort()) {
        if (owners.has(id)) continue;
        owners.set(id, { center: current.center, depth: current.depth + 1 });
        queue.push(id);
      }
    }
    const regions = centers.map(center => ({ center, items: placements.filter(item => owners.get(item.entityId)?.center === center) }));
    const disconnected = placements.filter(item => !owners.has(item.entityId));
    if (disconnected.length) regions.push({ center: '', items: disconnected });
    for (const region of regions) {
      const maxWidth = Math.max(...region.items.map(item => size(item).width));
      const maxHeight = Math.max(...region.items.map(item => size(item).height));
      const stepX = maxWidth + layout.horizontalSpacing;
      const stepY = maxHeight + layout.verticalSpacing;
      const step = Math.SQRT2;
      region.points = new Map();
      if (region.center) {
        region.points.set(region.center, { x: -size(byId.get(region.center)).width / 2, y: -size(byId.get(region.center)).height / 2 });
        const rings = new Map();
        for (const item of region.items) {
          const depth = owners.get(item.entityId).depth;
          if (!depth) continue;
          if (!rings.has(depth)) rings.set(depth, []);
          rings.get(depth).push(item);
        }
        let radius = 0;
        for (const [depth, ring] of [...rings].sort((a, b) => a[0] - b[0])) {
          ring.sort((a, b) => a.entityId.localeCompare(b.entityId));
          radius = Math.max(radius + step, ring.length > 1 ? step / (2 * Math.sin(Math.PI / ring.length)) : step);
          ring.forEach((item, index) => {
            const startAngle = (ring.length === 2 ? 0 : -Math.PI / 2) + (depth - 1) * Math.PI / 4;
            const angle = startAngle + index * Math.PI * 2 / ring.length;
            region.points.set(item.entityId, { x: radius * stepX * Math.cos(angle) - size(item).width / 2, y: radius * stepY * Math.sin(angle) - size(item).height / 2 });
          });
        }
      } else {
        const columns = Math.ceil(Math.sqrt(region.items.length));
        region.items.forEach((item, index) => region.points.set(item.entityId, {
          x: index % columns * (maxWidth + layout.horizontalSpacing),
          y: Math.floor(index / columns) * (maxHeight + layout.verticalSpacing)
        }));
      }
      region.left = Math.min(...[...region.points.values()].map(point => point.x));
      region.top = Math.min(...[...region.points.values()].map(point => point.y));
      region.width = Math.max(...region.items.map(item => region.points.get(item.entityId).x + size(item).width)) - region.left;
      region.height = Math.max(...region.items.map(item => region.points.get(item.entityId).y + size(item).height)) - region.top;
    }
    const columns = Math.ceil(Math.sqrt(regions.length));
    let rowX = 80;
    let rowY = 80;
    let rowHeight = 0;
    let anchoredRight = 0;
    let anchoredTop = 0;
    regions.forEach((region, index) => {
      let offsetX = rowX - region.left;
      let offsetY = rowY - region.top;
      if (options.keepCenter && index === 0) {
        const anchor = byId.get(region.center);
        offsetX = anchor.x + size(anchor).width / 2;
        offsetY = anchor.y + size(anchor).height / 2;
        anchoredRight = offsetX + region.left + region.width;
        anchoredTop = offsetY + region.top;
      } else if (options.keepCenter) {
        offsetX = anchoredRight + layout.horizontalSpacing * 2 - region.left;
        offsetY = anchoredTop - region.top;
      }
      for (const item of region.items) {
        const point = region.points.get(item.entityId);
        item.x = Math.round(point.x + offsetX);
        item.y = Math.round(point.y + offsetY);
      }
      rowHeight = Math.max(rowHeight, region.height);
      rowX += region.width + layout.horizontalSpacing * 2;
      if ((index + 1) % columns === 0) {
        rowY += rowHeight + layout.verticalSpacing * 2;
        rowX = 80;
        rowHeight = 0;
      }
    });
    return true;
  }

  function groupTopologyByProjects({ entities, existingEntities, relationships, placements }, layout) {
    const byId = new Map([...existingEntities, ...entities].map(entity => [entity.id, entity]));
    const memberships = new Map();
    const groups = new Map();
    for (const entity of entities.filter(item => item.type === 'deployment')) {
      const runtime = entity.runtime || {};
      const projectUuid = runtime.projectUuid === 'project_unknown' ? '' : runtime.projectUuid;
      const key = dynamicEntityId('projectgroup', runtime.providerId, projectUuid || 'unassigned');
      if (!groups.has(key)) groups.set(key, {
        id: key, type: 'group', transient: true, source: 'observed',
        name: `${runtime.providerLabel || runtime.providerId} · ${runtime.projectName || (projectUuid ? `Project ${projectUuid}` : '未分配项目')}`,
        details: { notes: 'Coolify Projects · 按项目归属分组' },
        runtime: { providerId: runtime.providerId, projectUuid: runtime.projectUuid || '', dynamicKind: 'coolify-project-group' }
      });
      memberships.set(entity.id, new Set([key]));
    }
    const addMembership = (target, source) => {
      if (!memberships.has(target)) memberships.set(target, new Set());
      for (const key of memberships.get(source) || []) memberships.get(target).add(key);
    };
    // Only explicit source/endpoint links establish membership; hosts remain shared infrastructure.
    for (const edge of relationships) {
      if (edge.type === 'source_of') addMembership(edge.sourceId, edge.targetId);
      if (edge.type === 'exposes') addMembership(edge.targetId, edge.sourceId);
    }
    for (const edge of relationships) if (edge.type === 'contains') addMembership(edge.sourceId, edge.targetId);
    const sharedId = 'entity_panel_shared_resources';
    const buckets = new Map();
    for (const placement of placements) {
      const keys = memberships.get(placement.entityId);
      const groupId = keys?.size === 1 ? [...keys][0] : sharedId;
      placement.groupId = groupId;
      if (!buckets.has(groupId)) buckets.set(groupId, []);
      buckets.get(groupId).push(placement);
    }
    if (buckets.has(sharedId)) groups.set(sharedId, {
      id: sharedId, type: 'group', name: '共享资源', transient: true, source: 'observed',
      details: { notes: '共用主机、跨项目仓库与访问点 · 保留唯一节点' },
      runtime: { dynamicKind: 'coolify-project-group' }
    });
    const ordered = [...groups.values()].filter(group => buckets.has(group.id)).sort((a, b) => (
      a.id === sharedId ? -1 : b.id === sharedId ? 1 : a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)
    ));
    const regions = [];
    const gap = Math.max(64, layout.horizontalSpacing);
    const aspect = layout.viewportAspectRatio || 1.6;
    for (const group of ordered) {
      const members = buckets.get(group.id);
      arrangeTopologyLanes({ entities, existingEntities, relationships, placements: members }, layout);
      const types = ['project', 'repository', 'deployment', 'server', 'endpoint'].filter(type => members.some(item => byId.get(item.entityId)?.type === type));
      const minY = Math.min(...members.map(item => item.y));
      const rowStep = layout.height + layout.verticalSpacing;
      const rowCount = Math.round((Math.max(...members.map(item => item.y)) - minY) / rowStep) + 1;
      const laneWidth = types.length * (layout.width + layout.horizontalSpacing) - layout.horizontalSpacing;
      // Fold long projects into repeated lane blocks, keeping related rows together.
      const bands = Math.max(1, Math.min(rowCount, Math.round(Math.sqrt(rowCount * rowStep * aspect / laneWidth))));
      const rowsPerBand = Math.ceil(rowCount / bands);
      for (const item of members) {
        const row = Math.round((item.y - minY) / rowStep);
        item.x = 28 + Math.floor(row / rowsPerBand) * (laneWidth + gap)
          + types.indexOf(byId.get(item.entityId)?.type) * (layout.width + layout.horizontalSpacing);
        item.y = 74 + (row % rowsPerBand) * rowStep;
      }
      regions.push({ group, members,
        width: Math.max(320, Math.max(...members.map(item => item.x)) + layout.width + 28),
        height: Math.max(180, Math.max(...members.map(item => item.y)) + layout.height + 28) });
      entities.push(group);
    }
    const positions = packRegions(regions, aspect, gap);
    regions.forEach((region, index) => {
      const { x, y } = positions[index];
      for (const item of region.members) { item.x += x; item.y += y; }
      placements.push({ entityId: region.group.id, x, y, dynamic: true });
    });
    return placements;
  }

  function packRegions(regions, aspect = 1.6, gap = 64) {
    // Use measured bounds when available; uneven project sizes must not overlap.
    let best;
    for (let columns = 1; columns <= regions.length; columns++) {
      const widths = Array(columns).fill(0);
      const heights = Array(Math.ceil(regions.length / columns)).fill(0);
      regions.forEach((region, index) => {
        widths[index % columns] = Math.max(widths[index % columns], region.width);
        heights[Math.floor(index / columns)] = Math.max(heights[Math.floor(index / columns)], region.height);
      });
      const width = widths.reduce((sum, size) => sum + size, 0) + gap * (widths.length - 1);
      const height = heights.reduce((sum, size) => sum + size, 0) + gap * (heights.length - 1);
      const score = Math.abs(Math.log(width / height / aspect));
      if (!best || score < best.score) best = { columns, widths, heights, score };
    }
    return regions.map((region, index) => {
      const column = index % best.columns;
      const row = Math.floor(index / best.columns);
      const x = 80 + best.widths.slice(0, column).reduce((sum, size) => sum + size + gap, 0);
      const y = 80 + best.heights.slice(0, row).reduce((sum, size) => sum + size + gap, 0);
      return { x, y };
    });
  }

  function endpointHealthFields(check = {}) {
    return {
      status: check.status || 'unknown',
      httpStatus: check.httpStatus ?? null,
      latencyMs: check.latencyMs ?? null,
      observedAt: check.checkedAt || null,
      checkMessage: check.message || '',
      checking: check.checking === true
    };
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
    const endpointChecks = new Map((topology.endpointChecks || []).map(check => [`${check.providerId}\u0000${check.url}`, check]));
    const layout = normalizeLayout(options.layout);
    const servers = Array.isArray(topology.servers) ? topology.servers : [];
    const deployments = Array.isArray(topology.deployments) ? topology.deployments : [];
    const topologyLayout = compactTopologyLayout(deployments, layout);
    const bindings = Array.isArray(options.bindings) ? options.bindings : [];
    const associations = Array.isArray(options.repositoryAssociations) ? options.repositoryAssociations : [];
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
      const preference = associations.find(item => item.providerId === providerId && item.resourceUuid === deployment.resourceUuid);
      const repositoryAssociation = RepositoryAssociation.resolveAssociation(deployment, repositories, deploymentBindings, preference);
      const repositoryIds = unique(repositoryAssociation.repositoryIds);
      const missingRepositoryIds = repositoryIds.filter(repositoryId => !repositoryById.has(repositoryId) || repositoryById.get(repositoryId).available === false);
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
          providerLabel: deployment.providerLabel || (providerId === defaultProviderId ? defaultProviderLabel : ''),
          dynamicKind: 'panel-deployment',
          repositoryIds,
          repositoryAssociation,
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
            verifiedAt: endpointChecks.get(endpointKey)?.checkedAt || '',
            transient: true,
            runtime: {
              providerId,
              providerLabel: deployment.providerLabel || '',
              dynamicKind: 'panel-endpoint',
              url: domain,
              ...endpointHealthFields(endpointChecks.get(endpointKey))
            }
          }, topologyLayout[deploymentIndex]?.endpoint(domainIndex) || {
            x: deploymentPlacement.x + layout.width + layout.horizontalSpacing,
            y: deploymentPlacement.y + domainIndex * (layout.height + layout.verticalSpacing)
          });
        }
        addRelationship('exposes', deploymentId, endpointId, deployment.observedAt);
      }

      let relationIndex = 0;
      for (const binding of deploymentBindings.length ? deploymentBindings : [{ repositoryIds }]) {
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
    if (options.groupByProject) groupTopologyByProjects({ entities, existingEntities, relationships, placements }, layout);
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

  return { stableHash, dynamicEntityId, dynamicRelationshipId, orderByTopologyAndPosition, routeRelationship, arrangeTopologyLanes, arrangeAroundCenters, groupTopologyByProjects, packRegions, endpointHealthFields, buildProjection };
});
