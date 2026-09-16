(function exposeExperimentalFeatures(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ExperimentalFeatures = api;
})(typeof window !== 'undefined' ? window : globalThis, function createExperimentalFeatures() {
  const KEYS = Object.freeze(['dashboard', 'tasks']);
  function normalize(value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { dashboard: input.dashboard === true, tasks: input.tasks === true };
  }
  function isViewEnabled(value, view) {
    return !KEYS.includes(view) || normalize(value)[view];
  }
  // Retain each tab and its navigation history. Only its unavailable view changes.
  function gateSession(session, flags) {
    if (!session) return session;
    const gate = tab => isViewEnabled(flags, tab.mode) ? tab : { ...tab, mode: 'tree' };
    return { ...session, tabs: (session.tabs || []).map(gate), closedTabs: (session.closedTabs || []).map(gate) };
  }
  return Object.freeze({ KEYS, normalize, isViewEnabled, gateSession });
});
