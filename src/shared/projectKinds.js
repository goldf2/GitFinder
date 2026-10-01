(function exposeProjectKinds(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ProjectKinds = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const labels = Object.freeze({ unclassified: '未分类', app: 'App 项目', web: 'Web 项目', mixed: 'App + Web' });
  function normalize(value) {
    if (value === undefined) return 'unclassified';
    if (typeof value !== 'string' || !Object.hasOwn(labels, value)) throw new Error('项目形态只能是未分类、App、Web 或 App + Web');
    return value;
  }
  function label(value) { return labels[typeof value === 'string' && Object.hasOwn(labels, value) ? value : 'unclassified']; }
  return Object.freeze({ labels, normalize, label });
});
