(function exposeRelationshipLayoutPrimitives(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipLayoutPrimitives = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipLayoutPrimitives() {
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

  function packRegions(regions, aspect = 1.6, gap = 64) {
    if (!regions.length) return [];
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

  function indexPlacements(placements = []) {
    const byId = new Map(placements.map(item => [item.entityId, item]));
    const childrenByGroup = new Map();
    for (const item of placements) if (item.groupId) {
      if (!childrenByGroup.has(item.groupId)) childrenByGroup.set(item.groupId, []);
      childrenByGroup.get(item.groupId).push(item);
    }
    const children = id => childrenByGroup.get(id) || [];
    const descendants = id => {
      const seen = new Set([id]), result = [], queue = [...children(id)];
      for (const item of queue) {
        if (seen.has(item.entityId)) continue;
        seen.add(item.entityId); result.push(item); queue.push(...children(item.entityId));
      }
      return result;
    };
    const depth = id => {
      const seen = new Set([id]); let value = 0, parent = byId.get(id)?.groupId;
      while (parent && !seen.has(parent)) { seen.add(parent); value++; parent = byId.get(parent)?.groupId; }
      return value;
    };
    const canNest = (id, groupId) => {
      if (!groupId) return true;
      if (!byId.has(groupId)) return false;
      const seen = new Set([id]); let parent = groupId;
      while (parent) {
        if (seen.has(parent)) return false;
        seen.add(parent); parent = byId.get(parent)?.groupId;
      }
      return true;
    };
    return Object.freeze({ byId, childrenByGroup, children, descendants, depth, canNest });
  }

  return Object.freeze({ normalizeLayout, packRegions, indexPlacements });
});
