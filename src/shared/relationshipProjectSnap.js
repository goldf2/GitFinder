(function exposeRelationshipProjectSnap(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipProjectSnap = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipProjectSnap() {
  const DEFAULT_CARD = { width: 280, height: 143 };

  function dimensions(node) {
    return {
      width: Number(node?.measured?.width) || Number(node?.width) || Number(node?.style?.width) || DEFAULT_CARD.width,
      height: Number(node?.measured?.height) || Number(node?.height) || Number(node?.style?.height) || DEFAULT_CARD.height
    };
  }

  function nearest(value, candidates, threshold) {
    return candidates
      .map(candidate => ({ ...candidate, distance: Math.abs(candidate.value - value) }))
      .filter(candidate => candidate.distance <= threshold)
      .sort((a, b) => (a.distance + a.priority * 4) - (b.distance + b.priority * 4)
        || a.distance - b.distance)[0] || null;
  }

  function overlaps(position, size, sibling) {
    const siblingSize = dimensions(sibling);
    return position.x < sibling.position.x + siblingSize.width
      && position.x + size.width > sibling.position.x
      && position.y < sibling.position.y + siblingSize.height
      && position.y + size.height > sibling.position.y;
  }

  function withSnapState(nodes, nodeId, position, snapState) {
    return nodes.map(node => node.id === nodeId ? {
      ...node,
      position,
      data: { ...node.data, snapState }
    } : node);
  }

  function clear(nodes = [], nodeId = '') {
    return nodes.map(node => node.id === nodeId && node.data?.snapState ? {
      ...node,
      data: { ...node.data, snapState: null }
    } : node);
  }

  function snap(nodes = [], nodeId = '', options = {}) {
    const mode = String(options.snapMode || 'smart');
    const byId = new Map(nodes.map(node => [node.id, node]));
    const node = byId.get(nodeId);
    const parent = node?.parentId ? byId.get(node.parentId) : null;
    if (!node || mode === 'off' || options.disabled === true
      || node.data?.entity?.type !== 'deployment' || !parent?.data?.isProjectContainer) {
      return clear(nodes, nodeId);
    }

    const position = { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 };
    if (mode === 'grid') {
      const grid = Math.max(4, Number(options.gridSize) || 24);
      const snapped = { x: Math.round(position.x / grid) * grid, y: Math.round(position.y / grid) * grid };
      return withSnapState(nodes, nodeId, snapped, {
        x: snapped.x !== position.x,
        y: snapped.y !== position.y,
        horizontal: 'grid',
        vertical: 'grid'
      });
    }

    const nodeSize = dimensions(node);
    const parentSize = dimensions(parent);
    const horizontalSpacing = Math.max(0, Number(options.horizontalSpacing) || 0);
    const verticalSpacing = Math.max(0, Number(options.verticalSpacing) || 0);
    const paddingX = Math.max(28, horizontalSpacing / 2);
    const paddingTop = Math.max(40, verticalSpacing + 12);
    const paddingBottom = Math.max(28, verticalSpacing / 2);
    const threshold = Math.max(2, (Number(options.threshold) || 12) / Math.max(0.03, Number(options.zoom) || 1));
    const siblings = nodes.filter(item => item.id !== nodeId && item.parentId === node.parentId
      && item.data?.entity?.type === 'deployment');
    const horizontal = [
      { value: paddingX, kind: 'boundary', priority: 2 },
      { value: (parentSize.width - nodeSize.width) / 2, kind: 'center', priority: 2 },
      { value: parentSize.width - paddingX - nodeSize.width, kind: 'boundary', priority: 2 }
    ];
    const vertical = [
      { value: paddingTop, kind: 'boundary', priority: 2 },
      { value: (parentSize.height - nodeSize.height) / 2, kind: 'center', priority: 2 },
      { value: parentSize.height - paddingBottom - nodeSize.height, kind: 'boundary', priority: 2 }
    ];
    for (const sibling of siblings) {
      const size = dimensions(sibling);
      horizontal.push(
        { value: sibling.position.x, kind: 'edge', priority: 1 },
        { value: sibling.position.x + (size.width - nodeSize.width) / 2, kind: 'center', priority: 1 },
        { value: sibling.position.x + size.width - nodeSize.width, kind: 'edge', priority: 1 },
        { value: sibling.position.x + size.width + horizontalSpacing, kind: 'spacing', priority: 0 },
        { value: sibling.position.x - nodeSize.width - horizontalSpacing, kind: 'spacing', priority: 0 }
      );
      vertical.push(
        { value: sibling.position.y, kind: 'edge', priority: 1 },
        { value: sibling.position.y + (size.height - nodeSize.height) / 2, kind: 'center', priority: 1 },
        { value: sibling.position.y + size.height - nodeSize.height, kind: 'edge', priority: 1 },
        { value: sibling.position.y + size.height + verticalSpacing, kind: 'spacing', priority: 0 },
        { value: sibling.position.y - nodeSize.height - verticalSpacing, kind: 'spacing', priority: 0 }
      );
    }

    const x = nearest(position.x, horizontal, threshold);
    const y = nearest(position.y, vertical, threshold);
    const candidates = [
      x && y ? { position: { x: x.value, y: y.value }, x, y, axes: 2 } : null,
      x ? { position: { x: x.value, y: position.y }, x, y: null, axes: 1 } : null,
      y ? { position: { x: position.x, y: y.value }, x: null, y, axes: 1 } : null
    ].filter(Boolean).sort((a, b) => b.axes - a.axes
      || ((a.x?.distance || 0) + (a.y?.distance || 0)) - ((b.x?.distance || 0) + (b.y?.distance || 0)));
    const chosen = candidates.find(candidate => !siblings.some(sibling => overlaps(candidate.position, nodeSize, sibling)));
    if (!chosen) return withSnapState(nodes, nodeId, position, null);
    return withSnapState(nodes, nodeId, chosen.position, {
      x: Boolean(chosen.x),
      y: Boolean(chosen.y),
      horizontal: chosen.x?.kind || '',
      vertical: chosen.y?.kind || ''
    });
  }

  return { snap, clear, dimensions };
});
