(function exposeRelationshipPortRouter(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipPortRouter = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipPortRouter() {
  const SIDES = ['top', 'right', 'bottom', 'left'];

  function center(rect = {}) {
    return {
      x: (Number(rect.x) || 0) + (Number(rect.width) || 0) / 2,
      y: (Number(rect.y) || 0) + (Number(rect.height) || 0) / 2
    };
  }

  function handlePoints(rect = {}) {
    const x = Number(rect.x) || 0;
    const y = Number(rect.y) || 0;
    const width = Number(rect.width) || 0;
    const height = Number(rect.height) || 0;
    return {
      top: { x: x + width / 2, y },
      right: { x: x + width, y: y + height / 2 },
      bottom: { x: x + width / 2, y: y + height },
      left: { x, y: y + height / 2 }
    };
  }

  function sidePair(source, target) {
    const sourcePoints = handlePoints(source);
    const targetPoints = handlePoints(target);
    let best = ['right', 'left'];
    let distance = Infinity;
    for (const sourceSide of SIDES) {
      for (const targetSide of SIDES) {
        const sourcePoint = sourcePoints[sourceSide];
        const targetPoint = targetPoints[targetSide];
        const candidate = Math.hypot(targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y);
        if (candidate < distance) {
          distance = candidate;
          best = [sourceSide, targetSide];
        }
      }
    }
    return best;
  }

  function edgeNodeId(edge, role) {
    return String(edge?.[role] || edge?.[`${role}Id`] || '');
  }

  function handleId(role, side) {
    return `${role}-${side}`;
  }

  function assignConnectionPorts(edges = [], geometry = new Map(), options = {}) {
    const rectFor = id => geometry instanceof Map ? geometry.get(id) : geometry?.[id];
    const assignments = [];
    const portsBySide = new Map();
    for (const [index, edge] of edges.entries()) {
      const source = edgeNodeId(edge, 'source');
      const target = edgeNodeId(edge, 'target');
      const sourceRect = rectFor(source);
      const targetRect = rectFor(target);
      const nearest = sourceRect && targetRect ? sidePair(sourceRect, targetRect) : ['right', 'left'];
      const sourceSide = options.preserveSides && SIDES.includes(edge.sourceSide) ? edge.sourceSide : nearest[0];
      const targetSide = options.preserveSides && SIDES.includes(edge.targetSide) ? edge.targetSide : nearest[1];
      const sourceCenter = center(sourceRect || {});
      const targetCenter = center(targetRect || {});
      const assignment = { edge, source, target, sourceSide, targetSide, sourceCenter, targetCenter, index };
      assignments.push(assignment);
      for (const port of [
        { nodeId: source, side: sourceSide, role: 'source', neighbor: targetCenter, visualOnly: edge.data?.visualOnly === true },
        { nodeId: target, side: targetSide, role: 'target', neighbor: sourceCenter, visualOnly: edge.data?.visualOnly === true }
      ]) {
        const key = `${port.nodeId}:${port.side}:${port.role}`;
        if (!portsBySide.has(key)) portsBySide.set(key, []);
        portsBySide.get(key).push({ ...port, assignment });
      }
    }

    const handlesByNode = new Map();
    for (const ports of portsBySide.values()) {
      const first = ports[0];
      const id = handleId(first.role, first.side);
      const visualOnly = ports.every(port => port.visualOnly);
      const handle = { id, side: first.side, type: first.role, offset: 50,
        ...(visualOnly ? { visualOnly: true } : {}) };
      if (!handlesByNode.has(first.nodeId)) handlesByNode.set(first.nodeId, []);
      handlesByNode.get(first.nodeId).push(handle);
      ports.forEach(port => {
        port.assignment[`${port.role}Handle`] = id;
        port.assignment[`${port.role}Offset`] = handle.offset;
      });
    }

    return {
      edges: assignments.map(item => ({
        ...item.edge,
        sourceHandle: item.sourceHandle || handleId('source', item.sourceSide),
        targetHandle: item.targetHandle || handleId('target', item.targetSide),
        sourceSide: item.sourceSide,
        targetSide: item.targetSide,
        sourceOffset: item.sourceOffset,
        targetOffset: item.targetOffset
      })),
      handlesByNode
    };
  }

  return { SIDES, handlePoints, sidePair, assignConnectionPorts };
});
