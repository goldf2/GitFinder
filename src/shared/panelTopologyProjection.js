(function exposePanelTopologyProjection(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PanelTopologyProjection = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPanelTopologyProjection() {
  const RepositoryAssociation = typeof module !== 'undefined' && module.exports
    ? require('./repositoryAssociation') : window.RepositoryAssociation;
  const LayoutPrimitives = typeof module !== 'undefined' && module.exports
    ? require('./relationshipLayoutPrimitives') : window.RelationshipLayoutPrimitives;
  const ProjectStructure = typeof module !== 'undefined' && module.exports
    ? require('./relationshipProjectStructure') : window.RelationshipProjectStructure;
  const ProjectGalaxyLayout = typeof module !== 'undefined' && module.exports
    ? require('./relationshipProjectGalaxyLayout') : window.RelationshipProjectGalaxyLayout;
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
    const padding = Math.max(4, Number(options.padding) || 14), inset = options.inset ?? 0.5;
    const expand = (r, amount) => ({ x: r.x - amount, y: r.y - amount,
      width: r.width + amount * 2, height: r.height + amount * 2 });
    const normals = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
    const port = (r, side, shape = 'rect', offset = null) => {
      const hasOffset = offset !== null && offset !== undefined && Number.isFinite(Number(offset));
      return r.width === 0 && r.height === 0 ? { x: r.x, y: r.y } : ({
      x: side === 'left' ? r.x + inset : side === 'right' ? r.x + r.width - inset
        : r.x + r.width * (hasOffset ? Math.min(82, Math.max(18, Number(offset))) / 100 : 0.5),
      y: side === 'top' ? r.y + inset : side === 'bottom' ? r.y + r.height - inset
        : r.y + (hasOffset ? r.height * Math.min(82, Math.max(18, Number(offset))) / 100
          : (['circle', 'polygon'].includes(shape) ? r.height / 2 : Math.min(options.portOffsetY ?? r.height / 2, r.height / 2)))
      });
    };
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
    if (options.sourceSide || options.targetSide) pairs.splice(0, pairs.length, ...pairs.filter(pair => (
      (!options.sourceSide || pair[0] === options.sourceSide) && (!options.targetSide || pair[1] === options.targetSide)
    )));
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
      const a = port(source, sourceSide, options.sourceShape, options.sourcePortOffset);
      const b = port(target, targetSide, options.targetShape, options.targetPortOffset);
      const normalA = normals[sourceSide], normalB = normals[targetSide];
      // Tangents stay local to the cards. Growing them with a distant target
      // creates huge loops when a card in the first row must escape backwards.
      const bends = new Set([0.25, 0.5, 0.85].map(tension => Math.min(240,
        Math.max(28, (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) * tension))));
      for (const bend of bends) {
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
      const a = port(source, sourceSide, options.sourceShape, options.sourcePortOffset);
      const b = port(target, targetSide, options.targetShape, options.targetPortOffset), na = normals[sourceSide], nb = normals[targetSide];
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
      // The grid finds a safe corridor; it needn't dictate the visible line.
      // Pull it taut across clear space, keeping the endpoint stubs for normals.
      const visible = (from, to) => !boxes.some(r => {
        let enter = 0, leave = 1;
        for (const [axis, size] of [['x', 'width'], ['y', 'height']]) {
          const delta = to[axis] - from[axis], min = r[axis] + 0.01, max = r[axis] + r[size] - 0.01;
          if (Math.abs(delta) < 1e-9) { if (from[axis] <= min || from[axis] >= max) return false; }
          else {
            const t1 = (min - from[axis]) / delta, t2 = (max - from[axis]) / delta;
            enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
            if (enter >= leave) return false;
          }
        }
        return enter < leave;
      });
      const pulled = [a, start];
      for (let i = 1; i < points.length - 2;) {
        let next = points.length - 2;
        while (next > i + 1 && !visible(points[i], points[next])) next--;
        pulled.push(points[next]); i = next;
      }
      pulled.push(b);
      const smoothingObstacles = [...obstacles.map(r => expand(r, 2)), expand(source, -2), expand(target, -2)]
        .filter(r => r.width > 0 && r.height > 0);
      let path = `M ${a.x} ${a.y}`;
      const sampled = [a];
      for (let i = 1; i < pulled.length - 1; i++) {
        const p = pulled[i], prev = pulled[i - 1], next = pulled[i + 1];
        const incoming = Math.hypot(p.x - prev.x, p.y - prev.y), outgoing = Math.hypot(p.x - next.x, p.y - next.y);
        const maximumRadius = options.smoothChannels ? 120 : 24;
        let radius = Math.min(maximumRadius, incoming * (options.smoothChannels ? 0.42 : 0.5), outgoing * (options.smoothChannels ? 0.42 : 0.5)), rounded;
        while (radius >= 0.5) {
          const before = { x: p.x + (prev.x - p.x) * radius / incoming, y: p.y + (prev.y - p.y) * radius / incoming };
          const after = { x: p.x + (next.x - p.x) * radius / outgoing, y: p.y + (next.y - p.y) * radius / outgoing };
          const controls = [before, { x: (before.x + 2 * p.x) / 3, y: (before.y + 2 * p.y) / 3 },
            { x: (after.x + 2 * p.x) / 3, y: (after.y + 2 * p.y) / 3 }, after];
          if (curveClear(controls, smoothingObstacles)) { rounded = { before, after, controls }; break; }
          radius /= 2;
        }
        if (rounded) {
          path += options.smoothChannels
            ? ` L ${rounded.before.x} ${rounded.before.y} C ${rounded.controls[1].x} ${rounded.controls[1].y}, ${rounded.controls[2].x} ${rounded.controls[2].y}, ${rounded.after.x} ${rounded.after.y}`
            : ` L ${rounded.before.x} ${rounded.before.y} Q ${p.x} ${p.y} ${rounded.after.x} ${rounded.after.y}`;
          sampled.push(...sampleCurve(rounded.controls));
        } else { path += ` L ${p.x} ${p.y}`; sampled.push(p); }
      }
      path += ` L ${b.x} ${b.y}`;
      sampled.push(b);
      return result(path, sampled, sourceSide, targetSide);
    }
    return fallback;
  }

  function normalizeLayout(value = {}) {
    return LayoutPrimitives.normalizeLayout(value);
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

  function groupTopologyByProjects({ entities, existingEntities, relationships, placements }, layout, byServer = false) {
    const byId = new Map([...existingEntities, ...entities].map(entity => [entity.id, entity]));
    const memberships = new Map();
    const groups = new Map();
    for (const entity of entities.filter(item => item.type === 'deployment')) {
      const runtime = entity.runtime || {};
      const projectUuid = runtime.projectUuid === 'project_unknown' ? '' : runtime.projectUuid;
      const key = dynamicEntityId('projectgroup', runtime.providerId,
        `${projectUuid || 'unassigned'}${byServer ? `:${runtime.nodeId || 'unknown-host'}` : ''}`);
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
      runtime: { dynamicKind: 'coolify-shared-resources' }
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
      placements.push({ entityId: region.group.id, x, y, dynamic: true, groupLayout: 'auto' });
    });
    return placements;
  }

  function packRegions(regions, aspect = 1.6, gap = 64) {
    return LayoutPrimitives.packRegions(regions, aspect, gap);
  }

  // A display projection only: source facts and the many-to-many links survive.
  function serverTreeGraph({ entities, relationships, placements }, showRepositoryRelations = false) {
    const byId = new Map(entities.map(entity => [entity.id, entity]));
    const placed = new Map(placements.map(item => [item.entityId, item]));
    const groups = new Set();
    const hierarchy = new Map();
    const add = (sourceId, targetId, label) => {
      if (!placed.has(sourceId) || !placed.has(targetId)) return;
      const key = `${sourceId}:${targetId}`;
      if (!hierarchy.has(key)) hierarchy.set(key, { id: `tree_${key}`, type: 'tree_hierarchy', sourceId, targetId,
        label, title: '由实际部署关系与项目归属派生，不修改来源事实', verificationState: 'unverified' });
    };
    const hosts = new Map(), endpoints = [];
    for (const edge of relationships) {
      const deployment = edge.type === 'runs_on' ? edge.sourceId : edge.type === 'hosts' ? edge.targetId : '';
      const host = edge.type === 'runs_on' ? edge.targetId : edge.sourceId;
      if (deployment) { if (!hosts.has(deployment)) hosts.set(deployment, new Set()); hosts.get(deployment).add(host); }
      if (edge.type === 'exposes') endpoints.push([edge.sourceId, edge.targetId]);
      if (edge.type === 'exposed_by') endpoints.push([edge.targetId, edge.sourceId]);
    }
    for (const item of placements.filter(p => byId.get(p.entityId)?.type === 'deployment')) {
      const group = byId.get(item.groupId)?.type === 'group' && item.groupId !== 'entity_panel_shared_resources' ? item.groupId : '';
      if (group) { groups.add(group); add(group, item.entityId, '部署'); }
      for (const host of hosts.get(item.entityId) || []) add(host, group || item.entityId, group ? 'Project' : '部署');
    }
    const visible = new Set(placements.filter(p => {
      const type = byId.get(p.entityId)?.type;
      return !['repository', 'project'].includes(type) && (type !== 'group' || groups.has(p.entityId)
        || (p.entityId !== 'entity_panel_shared_resources' && !byId.get(p.entityId)?.transient));
    }).map(p => p.entityId));
    const correlations = new Map(), repositoryNames = new Map(), repositoryMembers = new Map();
    const sources = new Map();
    for (const edge of relationships) {
      const repository = edge.type === 'source_of' ? edge.sourceId : edge.type === 'deployed_from' ? edge.targetId : '';
      const deployment = edge.type === 'source_of' ? edge.targetId : edge.sourceId;
      if (!repository || byId.get(repository)?.type !== 'repository') continue;
      if (!sources.has(deployment)) sources.set(deployment, []);
      sources.get(deployment).push(byId.get(repository));
    }
    for (const item of placements.filter(p => byId.get(p.entityId)?.type === 'deployment')) {
      const entity = byId.get(item.entityId);
      const remote = RepositoryAssociation.repositoryKey(entity.runtime?.repositoryUrl)
        || RepositoryAssociation.repositoryKey(entity.details?.repositoryKey ? `https://${entity.details.repositoryKey}` : '');
      const repos = sources.get(entity.id) || [];
      repositoryNames.set(entity.id, remote || repos.map(repo => repo.name).join('、'));
      const keys = remote ? [`remote:${remote}`] : repos.map(repo => `local:${repo.refId || repo.id}`);
      for (const key of new Set(keys)) {
        if (!repositoryMembers.has(key)) repositoryMembers.set(key, []);
        repositoryMembers.get(key).push(item);
      }
    }
    if (showRepositoryRelations) for (const [key, members] of repositoryMembers) {
      // One representative per branch and n-1 undirected links, never an n² mesh.
      const branches = new Map();
      for (const item of members.slice().sort((a, b) => a.y - b.y || a.x - b.x || a.entityId.localeCompare(b.entityId))) {
        const branch = `${item.groupId || ''}:${[...(hosts.get(item.entityId) || [])].sort().join(',')}`;
        if (!branches.has(branch)) branches.set(branch, item);
      }
      const representatives = [...branches.values()];
      for (const other of representatives.slice(1)) {
        const first = representatives[0], id = `repository_${first.entityId}:${other.entityId}`;
        correlations.set(id, { id, type: 'repository_correlation', sourceId: first.entityId, targetId: other.entityId,
          label: '同源仓库', title: `${repositoryNames.get(first.entityId) || key} · ${members.length} 个部署，共享来源，不表示部署依赖`, verificationState: 'unverified' });
      }
    }
    return {
      placements: placements.filter(p => visible.has(p.entityId)),
      relationships: relationships.filter(edge => visible.has(edge.sourceId) && visible.has(edge.targetId)
        && !['runs_on', 'hosts'].includes(edge.type)),
      summaryRelationships: [...hierarchy.values()].filter(edge => byId.get(edge.sourceId)?.type !== 'group').concat([...correlations.values()]),
      hierarchy: [...hierarchy.values(), ...endpoints.map(([sourceId, targetId]) => ({ sourceId, targetId }))],
      repositoryNames
    };
  }

  // Lay out measured rectangles. Used both inside a Project and between Projects.
  function arrangeTreeUnits(items, edges, layout, style) {
    const byId = new Map(items.map(item => [item.entityId, item]));
    const children = new Map(items.map(item => [item.entityId, []])), parent = new Map();
    for (const edge of edges) {
      if (!byId.has(edge.sourceId) || !byId.has(edge.targetId) || parent.has(edge.targetId)) continue;
      let ancestor = edge.sourceId;
      while (ancestor && ancestor !== edge.targetId) ancestor = parent.get(ancestor);
      if (ancestor === edge.targetId) continue;
      parent.set(edge.targetId, edge.sourceId); children.get(edge.sourceId).push(edge.targetId);
    }
    // A circular/bilateral result cannot be used as the next linear branch order:
    // sorting it by y/x flips sides and rotates branches on every repeated click.
    const compare = ['bilateral', 'radial'].includes(style) ? (a, b) => a.localeCompare(b)
      : (a, b) => byId.get(a).y - byId.get(b).y || byId.get(a).x - byId.get(b).x || a.localeCompare(b);
    for (const ids of children.values()) ids.sort(compare);
    const size = (id, axis) => Number(byId.get(id)[axis]) || layout[axis];
    const regions = [];
    // Independent trees have different heights: their centered root y changes
    // after packing. Use identity order so a second click cannot swap trees.
    for (const root of [...byId.keys()].filter(id => !parent.has(id)).sort((a, b) => a.localeCompare(b))) {
      const members = [], levels = [], depthOf = new Map();
      const visit = (id, depth) => {
        members.push(byId.get(id)); depthOf.set(id, depth);
        (levels[depth] ||= []).push(id);
        for (const child of children.get(id)) visit(child, depth + 1);
      };
      visit(root, 0);
      const down = style === 'down', breadth = down ? 'width' : 'height', length = down ? 'height' : 'width';
      const crossGap = down ? layout.horizontalSpacing : layout.verticalSpacing;
      const depthGap = down ? layout.verticalSpacing : layout.horizontalSpacing;
      const starts = [0], spans = new Map();
      levels.forEach((ids, depth) => { starts[depth + 1] = starts[depth] + Math.max(...ids.map(id => size(id, length))) + depthGap; });
      const span = id => {
        const ids = children.get(id);
        const value = Math.max(size(id, breadth), ids.reduce((sum, child) => sum + span(child), 0) + Math.max(0, ids.length - 1) * crossGap);
        spans.set(id, value); return value;
      };
      span(root);
      const place = (id, depth, top) => {
        const ids = children.get(id), item = byId.get(id), extent = spans.get(id);
        item[down ? 'y' : 'x'] = starts[depth];
        item[down ? 'x' : 'y'] = top + (extent - size(id, breadth)) / 2;
        const total = ids.reduce((sum, child) => sum + spans.get(child), 0) + Math.max(0, ids.length - 1) * crossGap;
        let cursor = top + (extent - total) / 2;
        for (const child of ids) { place(child, depth + 1, cursor); cursor += spans.get(child) + crossGap; }
      };
      if (style === 'bilateral') {
        const sides = [[], []], totals = [0, 0];
        for (const child of children.get(root)) {
          const side = totals[0] <= totals[1] ? 0 : 1;
          sides[side].push(child); totals[side] += spans.get(child) + crossGap;
        }
        byId.get(root).x = 0; byId.get(root).y = -size(root, 'height') / 2;
        sides.forEach((ids, side) => {
          let cursor = -(totals[side] - (ids.length ? crossGap : 0)) / 2;
          for (const child of ids) {
            place(child, 1, cursor); cursor += spans.get(child) + crossGap;
            if (side) {
              const mirror = id => { const item = byId.get(id); item.x = size(root, 'width') - item.x - size(id, 'width'); children.get(id).forEach(mirror); };
              mirror(child);
            }
          }
        });
      } else if (style === 'radial') {
        const weights = new Map(), angles = new Map([[root, 0]]);
        const weigh = id => { const weight = Math.max(1, children.get(id).reduce((sum, child) => sum + weigh(child), 0)); weights.set(id, weight); return weight; };
        weigh(root);
        const fan = (id, angle, sweep) => {
          angles.set(id, angle);
          const ids = children.get(id), total = ids.reduce((sum, child) => sum + weights.get(child), 0);
          let start = angle - sweep / 2;
          for (const child of ids) { const part = sweep * weights.get(child) / total; fan(child, start + part / 2, part * 0.88); start += part; }
        };
        const branches = children.get(root);
        branches.forEach((id, index) => fan(id, index * Math.PI * 2 / branches.length, Math.min(Math.PI * 0.75, Math.PI * 2 / branches.length * 0.88)));
        const radiusOf = id => Math.hypot(size(id, 'width'), size(id, 'height')) / 2;
        const gap = Math.max(layout.horizontalSpacing, layout.verticalSpacing);
        const radii = [0];
        levels.forEach((ids, depth) => {
          if (!depth) return;
          let radius = radii[depth - 1] + Math.max(...levels[depth - 1].map(radiusOf)) + Math.max(...ids.map(radiusOf)) + gap;
          for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
            const chord = 2 * Math.abs(Math.sin((angles.get(ids[i]) - angles.get(ids[j])) / 2));
            radius = Math.max(radius, (radiusOf(ids[i]) + radiusOf(ids[j]) + gap) / Math.max(0.001, chord));
          }
          radii[depth] = radius;
        });
        for (const item of members) {
          const angle = angles.get(item.entityId), radius = radii[depthOf.get(item.entityId)];
          item.x = Math.cos(angle) * radius - size(item.entityId, 'width') / 2;
          item.y = Math.sin(angle) * radius - size(item.entityId, 'height') / 2;
        }
      } else place(root, 0, 0);
      const left = Math.min(...members.map(item => item.x)), top = Math.min(...members.map(item => item.y));
      regions.push({ members, left, top,
        width: Math.max(...members.map(item => item.x + size(item.entityId, 'width'))) - left,
        height: Math.max(...members.map(item => item.y + size(item.entityId, 'height'))) - top });
    }
    const positions = packRegions(regions, layout.viewportAspectRatio, Math.max(100, layout.verticalSpacing * 2));
    regions.forEach((region, i) => region.members.forEach(item => { item.x += positions[i].x - region.left; item.y += positions[i].y - region.top; }));
    return parent;
  }

  function applyProjectEndpointMembership(graph, include = true) {
    return ProjectStructure.applyEndpointMembership(graph, include);
  }

  function endpointReuseAlerts(graph) {
    return ProjectStructure.endpointReuseAlerts(graph);
  }

  function isProjectGroup(entity = {}) {
    return ProjectStructure.isProjectGroup(entity);
  }

  function arrangeProjectGalaxies(graph, options = {}) {
    return ProjectGalaxyLayout.arrange(graph, options);
  }

  function arrangeProjectContainer(group, members, options = {}) {
    return ProjectGalaxyLayout.arrangeInterior(group, members, options);
  }

  // Pure positioning: group membership and source facts are inputs, never outputs.
  // Nested groups are measured bottom-up; manual groups move as intact units.
  function arrangeBoardLayout(graph, options = {}) {
    const layout = normalizeLayout(options);
    let style = options.style || 'right';
    if (style === 'free') return graph;
    if (style === 'galaxy') {
      if (arrangeProjectGalaxies(graph, options)) return graph;
      style = 'radial';
    }
    const byId = new Map(graph.placements.map(item => [item.entityId, item]));
    const types = new Map(graph.entities.map(entity => [entity.id, entity.type]));
    const children = new Map();
    for (const item of graph.placements) {
      const owner = byId.has(item.groupId) && types.get(item.groupId) === 'group' ? item.groupId : '';
      if (!children.has(owner)) children.set(owner, []);
      children.get(owner).push(item);
    }
    const edges = graph.hierarchy || graph.relationships.map(edge => (
      ['runs_on', 'deployed_from', 'exposed_by', 'belongs_to'].includes(edge.type)
        ? { sourceId: edge.targetId, targetId: edge.sourceId } : edge
    ));
    const shift = (unit, dx, dy) => {
      for (const item of unit.members) { item.x += dx; item.y += dy; }
      unit.x += dx; unit.y += dy;
    };
    const arrange = (units, currentStyle) => {
      const owner = new Map(units.flatMap(unit => unit.members.map(item => [item.entityId, unit.entityId])));
      const links = edges.map(edge => ({ sourceId: owner.get(edge.sourceId), targetId: owner.get(edge.targetId) }))
        .filter(edge => edge.sourceId && edge.targetId && edge.sourceId !== edge.targetId);
      // A group title sits outside its frame. Reserve it for placement only:
      // never persist this space as extra container height or shift its members.
      const titleSpace = units.map(unit => types.get(unit.entityId) === 'group' ? Math.max(0, Number(options.groupTitleSpace) || 0) : 0);
      const targets = units.map((unit, i) => ({ entityId: unit.entityId, x: unit.x, y: unit.y - titleSpace[i],
        width: unit.width, height: unit.height + titleSpace[i] }));
      if (currentStyle === 'compact') {
        const ordered = orderByTopologyAndPosition(targets, links);
        const positions = packRegions(ordered, layout.viewportAspectRatio, Math.max(layout.horizontalSpacing, layout.verticalSpacing));
        ordered.forEach((item, i) => Object.assign(item, positions[i]));
      } else if (currentStyle === 'lanes') {
        let x = 80;
        for (const type of ['group', 'project', 'repository', 'deployment', 'server', 'endpoint', 'text', 'image', 'attachment']) {
          const lane = orderByTopologyAndPosition(targets.filter(item => types.get(item.entityId) === type), links);
          let y = 80;
          for (const item of lane) { item.x = x; item.y = y; y += item.height + layout.verticalSpacing; }
          if (lane.length) x += Math.max(...lane.map(item => item.width)) + layout.horizontalSpacing;
        }
      } else arrangeTreeUnits(targets, links, layout, currentStyle);
      targets.forEach((target, i) => shift(units[i], target.x - units[i].x, target.y + titleSpace[i] - units[i].y));
    };
    const build = (item, ancestors = new Set()) => {
      const unit = { entityId: item.entityId, x: item.x, y: item.y,
        width: Number(item.width) || layout.width, height: Number(item.height) || layout.height, members: [item] };
      if (types.get(item.entityId) !== 'group' || ancestors.has(item.entityId)) return unit;
      const nested = (children.get(item.entityId) || []).map(child => build(child, new Set([...ancestors, item.entityId])));
      if (!nested.length) return { ...unit, width: item.groupWidth || unit.width, height: item.groupHeight || unit.height };
      if (!options.preserveGroupContents && item.groupLayout === 'auto' && !item.locked && !nested.some(child => child.members.some(p => p.locked))) {
        arrange(nested, ['bilateral', 'radial'].includes(style) ? 'right' : style);
      }
      unit.x = Math.min(...nested.map(child => child.x)) - 28;
      unit.y = Math.min(...nested.map(child => child.y)) - 54;
      unit.width = Math.max(...nested.map(child => child.x + child.width)) + 28 - unit.x;
      unit.height = Math.max(...nested.map(child => child.y + child.height)) + 28 - unit.y;
      if (options.preserveGroupContents || item.groupLayout !== 'auto' || item.locked || nested.some(child => child.members.some(p => p.locked))) {
        const right = Math.max(unit.x + unit.width, item.x + (item.groupWidth || unit.width));
        const bottom = Math.max(unit.y + unit.height, item.y + (item.groupHeight || unit.height));
        unit.x = Math.min(unit.x, item.x); unit.y = Math.min(unit.y, item.y);
        unit.width = right - unit.x; unit.height = bottom - unit.y;
      }
      unit.members.push(...nested.flatMap(child => child.members));
      Object.assign(item, { x: unit.x, y: unit.y, groupWidth: unit.width, groupHeight: unit.height });
      return unit;
    };
    const units = (children.get('') || []).map(item => build(item));
    // Locked groups and descendants stay fixed, including their container bounds.
    const fixed = units.filter(unit => unit.members.some(item => item.locked));
    const movable = units.filter(unit => !unit.members.some(item => item.locked));
    arrange(movable, style);
    if (fixed.length && movable.length) {
      const dx = Math.max(...fixed.map(unit => unit.x + unit.width)) + layout.horizontalSpacing - Math.min(...movable.map(unit => unit.x));
      for (const unit of movable) shift(unit, dx, 0);
    }
    for (const item of graph.placements) { item.x = Math.round(item.x); item.y = Math.round(item.y); }
    return graph;
  }

  function arrangeServerTree(graph, options = {}) {
    const tree = { ...serverTreeGraph(graph), entities: graph.entities };
    arrangeBoardLayout(tree, { ...options, style: options.style || options.treeLayout || 'right' });
    return tree;
  }

  function endpointHealthFields(check = {}) {
    return {
      status: check.status || 'unknown',
      httpStatus: check.httpStatus ?? null,
      latencyMs: check.latencyMs ?? null,
      observedAt: check.checkedAt || null,
      checkMessage: check.message || '',
      pageTitle: String(check.pageTitle || '').slice(0, 160),
      checking: check.checking === true
    };
  }

  function endpointAddressKey(value) {
    try {
      const url = new URL(value.includes('://') ? value : `https://${value}`);
      url.hash = '';
      // Root HTTP/HTTPS aliases describe one public domain; distinct routes and ports retain their identity.
      if (['http:', 'https:'].includes(url.protocol) && !url.port && url.pathname === '/' && !url.search) return `domain:${url.hostname}`;
      return url.href;
    } catch (_) { return value; }
  }

  function selectEndpointCheck(runtime = {}, checks = new Map()) {
    const candidates = (runtime.endpointSources || [runtime])
      .map(source => checks.get(`${source.providerId}\u0000${source.url}`)).filter(Boolean);
    if (!candidates.length) return undefined;
    const latest = candidates.reduce((best, check) => (Date.parse(check.checkedAt) || 0) > (Date.parse(best.checkedAt) || 0) ? check : best);
    return { ...latest, checking: candidates.some(check => check.checking === true) };
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
    const existingEndpointIds = new Set(existingEntities.filter(entity => entity.type === 'endpoint').map(entity => entity.id));
    const endpointSourcesByAddress = new Map();
    for (const deployment of deployments) {
      const providerId = String(deployment.providerId || defaultProviderId);
      for (const url of unique(deployment.domains)) {
        const key = endpointAddressKey(url);
        if (!endpointSourcesByAddress.has(key)) endpointSourcesByAddress.set(key, new Map());
        endpointSourcesByAddress.get(key).set(`${providerId}\u0000${url}`, {
          entityId: dynamicEntityId('endpoint', providerId, url), providerId,
          providerLabel: deployment.providerLabel || '', url
        });
      }
    }
    for (const [key, sources] of endpointSourcesByAddress) {
      endpointSourcesByAddress.set(key, [...sources.values()].sort((left, right) =>
        Number(existingEndpointIds.has(right.entityId)) - Number(existingEndpointIds.has(left.entityId))
        || left.providerId.localeCompare(right.providerId) || left.url.localeCompare(right.url)));
    }
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
      if (!entityIds.has(entity.id) && (entity.type === 'endpoint' || !existingEntities.some(item => item.id === entity.id))) {
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
          repositoryKey: RepositoryAssociation.repositoryKey(deployment.repositoryUrl),
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
        const endpointKey = endpointAddressKey(domain);
        let endpointId = endpointIdByDomain.get(endpointKey);
        if (!endpointId) {
          const endpointSources = endpointSourcesByAddress.get(endpointKey);
          const primary = endpointSources[0];
          endpointId = primary.entityId;
          endpointIdByDomain.set(endpointKey, endpointId);
          let hostname = primary.url;
          try { hostname = new URL(primary.url).hostname || primary.url; } catch (_) {}
          const check = selectEndpointCheck({ endpointSources }, endpointChecks);
          addEntity({
            id: endpointId,
            type: 'endpoint',
            name: hostname,
            details: { urlLabel: primary.url },
            source: 'observed',
            verifiedAt: check?.checkedAt || '',
            transient: true,
            runtime: {
              providerId: primary.providerId,
              providerLabel: primary.providerLabel,
              dynamicKind: 'panel-endpoint',
              url: primary.url,
              endpointSources,
              ...endpointHealthFields(check)
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
    if (options.groupByProject || options.serverTree) groupTopologyByProjects({ entities, existingEntities, relationships, placements }, layout, options.serverTree);
    if (options.serverTree || options.groupByProject) applyProjectEndpointMembership({ entities: [...existingEntities, ...entities], relationships, placements }, options.layout?.projectGroupIncludesEndpoints !== false);
    if (options.layout?.style) {
      const graph = { entities: [...existingEntities, ...entities], relationships, placements };
      if (options.serverTree) arrangeServerTree(graph, options.layout);
      else arrangeBoardLayout(graph, options.layout);
    } else if (options.serverTree) arrangeServerTree({ entities: [...existingEntities, ...entities], relationships, placements }, { ...options.layout, ...layout });
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

  return { stableHash, dynamicEntityId, dynamicRelationshipId, orderByTopologyAndPosition, routeRelationship, arrangeTopologyLanes, arrangeAroundCenters, groupTopologyByProjects, packRegions, serverTreeGraph, arrangeServerTree, arrangeBoardLayout, arrangeProjectGalaxies, arrangeProjectContainer, applyProjectEndpointMembership, endpointReuseAlerts, endpointHealthFields, selectEndpointCheck, buildProjection };
});
