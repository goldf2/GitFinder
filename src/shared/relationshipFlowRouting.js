(function exposeRelationshipFlowRouting(root, factory) {
  const portRouter = root?.RelationshipPortRouter
    || (typeof module !== 'undefined' && module.exports ? require('./relationshipPortRouter') : null);
  const projection = root?.PanelTopologyProjection
    || (typeof module !== 'undefined' && module.exports ? require('./panelTopologyProjection') : null);
  const api = factory(portRouter, projection);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipFlowRouting = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipFlowRouting(PortRouter, Projection) {
  if (!PortRouter || !Projection) throw new Error('React Flow 避障路由依赖未加载');
  const DEFAULT_CARD = { width: 280, height: 143 };

  function dimensions(node) {
    return {
      width: Number(node?.measured?.width) || Number(node?.width) || Number(node?.style?.width) || DEFAULT_CARD.width,
      height: Number(node?.measured?.height) || Number(node?.height) || Number(node?.style?.height) || DEFAULT_CARD.height
    };
  }

  function absolutePositions(nodes = []) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const result = new Map();
    const read = (node, seen = new Set()) => {
      if (!node || seen.has(node.id)) return { x: Number(node?.position?.x) || 0, y: Number(node?.position?.y) || 0 };
      if (result.has(node.id)) return result.get(node.id);
      seen.add(node.id);
      const parent = node.parentId ? read(byId.get(node.parentId), seen) : { x: 0, y: 0 };
      const value = { x: parent.x + (Number(node.position?.x) || 0), y: parent.y + (Number(node.position?.y) || 0) };
      result.set(node.id, value);
      return value;
    };
    nodes.forEach(node => read(node));
    return result;
  }

  function titleWidth(entity = {}, memberCount = 0, fontSize = 20) {
    const scale = Math.max(14, Math.min(36, Number(fontSize) || 20)) / 20;
    const name = String(entity.name || '群组');
    const nameWidth = [...name].reduce((sum, character) => sum
      + (/[^\u0000-\u00ff]/.test(character) ? 20 : (character === ' ' ? 6 : 11)), 0) * scale;
    const countWidth = String(memberCount).length * 7 + 42;
    return Math.max(120, nameWidth + countWidth + 18);
  }

  function visualObstacles(nodes = [], geometry = new Map(), options = {}) {
    const settings = typeof options === 'object' ? options : { zoom: options };
    const safeZoom = Math.max(0.03, Number(settings.zoom) || 1);
    const childCounts = nodes.reduce((counts, node) => {
      if (node.parentId) counts.set(node.parentId, (counts.get(node.parentId) || 0) + 1);
      return counts;
    }, new Map());
    const cards = nodes.filter(node => node.type !== 'relationshipGroup').map(node => ({
      id: node.id,
      kind: 'card',
      ...geometry.get(node.id)
    }));
    const titles = nodes.filter(node => node.type === 'relationshipGroup').map(node => {
      const bounds = geometry.get(node.id);
      const fontSize = Math.max(14, Math.min(36, Number(settings.groupTitleFontSize) || 20));
      const width = titleWidth(node.data?.entity, childCounts.get(node.id) || 0, fontSize) / safeZoom;
      const height = (fontSize + 10) / safeZoom;
      const offset = 8 / safeZoom;
      return {
        id: `title:${node.id}`,
        ownerId: node.id,
        kind: 'title',
        x: bounds.x + bounds.width / 2 - width / 2,
        y: bounds.y - offset - height,
        width,
        height
      };
    });
    return [...cards, ...titles];
  }

  function route(nodes = [], edges = [], options = {}) {
    const absolute = absolutePositions(nodes);
    const byId = new Map(nodes.map(node => [node.id, node]));
    const geometry = new Map(nodes.map(node => [node.id, { ...absolute.get(node.id), ...dimensions(node) }]));
    const obstacles = visualObstacles(nodes, geometry, { zoom: options.zoom, groupTitleFontSize: options.groupTitleFontSize });
    // Routing runs in board coordinates. Scaling a screen-pixel clearance by a
    // tiny fit-view zoom can make every real card gap mathematically impassable.
    // Keep the corridor clearance aligned with the layout's world-space gaps;
    // fixed-size titles are already converted separately in visualObstacles.
    const padding = 14;
    const shape = node => node?.data?.placement?.groupShape || node?.data?.placement?.projectGroupShape || 'rect';
    const selectedRoutes = edges.map(edge => {
      const source = geometry.get(edge.source);
      const target = geometry.get(edge.target);
      if (!source || !target) return { edge, routed: null };
      const corridor = {
        x: Math.min(source.x, target.x) - padding * 4,
        y: Math.min(source.y, target.y) - padding * 4,
        width: Math.max(source.x + source.width, target.x + target.width) - Math.min(source.x, target.x) + padding * 8,
        height: Math.max(source.y + source.height, target.y + target.height) - Math.min(source.y, target.y) + padding * 8
      };
      const relevant = obstacles.filter(item => item.id !== edge.source && item.id !== edge.target
        && item.x < corridor.x + corridor.width && item.x + item.width > corridor.x
        && item.y < corridor.y + corridor.height && item.y + item.height > corridor.y);
      const routeOptions = {
        sourceShape: shape(byId.get(edge.source)),
        targetShape: shape(byId.get(edge.target)),
        padding,
        smoothChannels: true
      };
      // The shortest pair of card boundaries is not necessarily the shortest
      // clear route. Compare endpoint pairs and obstacle paths together, then
      // let the port router reuse the winning sides as stable handles.
      const routed = Projection.routeRelationship(source, target, relevant, routeOptions);
      return {
        edge: { ...edge, sourceSide: routed.sourceSide, targetSide: routed.targetSide },
        routed
      };
    });
    const ports = PortRouter.assignConnectionPorts(selectedRoutes.map(item => item.edge), geometry, { preserveSides: true });
    const routedEdges = ports.edges.map((edge, index) => {
      const routed = selectedRoutes[index].routed;
      if (!routed) return edge;
      return {
        ...edge,
        type: 'relationshipEdge',
        data: {
          ...(edge.data || {}),
          routedPath: routed.path,
          routePoints: routed.points,
          labelX: routed.labelX,
          labelY: routed.labelY,
          obstructed: routed.obstructed === true
        }
      };
    });
    return {
      nodes: nodes.map(node => ({
        ...node,
        data: { ...node.data, connectionHandles: ports.handlesByNode.get(node.id) || [] }
      })),
      edges: routedEdges
    };
  }

  return { route, visualObstacles, titleWidth };
});
