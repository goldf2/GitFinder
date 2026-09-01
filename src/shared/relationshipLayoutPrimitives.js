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

  return Object.freeze({ normalizeLayout, packRegions });
});
