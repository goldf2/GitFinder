(function exposeProjectGroups(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ProjectGroups = api;
})(typeof window !== 'undefined' ? window : globalThis, function createProjectGroupsApi() {
  const VERSION = 1;
  const MAX_GROUPS = 100;
  const MAX_PROJECTS_PER_GROUP = 500;
  const GROUP_ID_PATTERN = /^project_group_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const COLORS = Object.freeze(['gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']);

  function defaultStore() {
    return { version: VERSION, groups: [] };
  }

  function cleanText(value, fallback = '', maxLength = 2000) {
    const cleaned = String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (cleaned || fallback).slice(0, maxLength);
  }

  function cleanGroupId(value) {
    const groupId = String(value || '').trim();
    return GROUP_ID_PATTERN.test(groupId) ? groupId : '';
  }

  function cleanProjectIds(values) {
    const result = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const projectId = String(value || '').trim();
      if (!/^project_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) continue;
      if (seen.has(projectId)) continue;
      seen.add(projectId);
      result.push(projectId);
      if (result.length >= MAX_PROJECTS_PER_GROUP) break;
    }
    return result;
  }

  function normalizeGroup(value, { requireId = true } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const groupId = cleanGroupId(value.groupId);
    if (requireId && !groupId) return null;
    return {
      groupId,
      name: cleanText(value.name, '未命名项目组', 160),
      description: cleanText(value.description, '', 2000),
      color: COLORS.includes(value.color) ? value.color : 'purple',
      projectIds: cleanProjectIds(value.projectIds)
    };
  }

  function normalizeStore(value) {
    const groups = [];
    const seen = new Set();
    for (const raw of Array.isArray(value?.groups) ? value.groups : []) {
      const group = normalizeGroup(raw);
      if (!group || seen.has(group.groupId)) continue;
      seen.add(group.groupId);
      groups.push(group);
      if (groups.length >= MAX_GROUPS) break;
    }
    return { version: VERSION, groups };
  }

  function storesEqual(left, right) {
    return JSON.stringify(normalizeStore(left)) === JSON.stringify(normalizeStore(right));
  }

  function createGroup(store, values, groupId) {
    const current = normalizeStore(store);
    const normalized = normalizeGroup({ ...values, groupId }, { requireId: true });
    if (!normalized) return { store: current, group: null };
    if (current.groups.some(group => group.groupId === normalized.groupId)) return { store: current, group: null };
    if (current.groups.length >= MAX_GROUPS) throw new Error(`最多创建 ${MAX_GROUPS} 个项目组`);
    const next = normalizeStore({ ...current, groups: [...current.groups, normalized] });
    return { store: next, group: normalized };
  }

  function updateGroup(store, groupId, values) {
    const current = normalizeStore(store);
    const index = current.groups.findIndex(group => group.groupId === cleanGroupId(groupId));
    if (index < 0) return { store: current, group: null };
    const normalized = normalizeGroup({ ...current.groups[index], ...values, groupId: current.groups[index].groupId });
    if (!normalized) return { store: current, group: null };
    const groups = current.groups.map((group, itemIndex) => itemIndex === index ? normalized : group);
    const next = normalizeStore({ ...current, groups });
    return { store: next, group: normalized };
  }

  function deleteGroup(store, groupId) {
    const current = normalizeStore(store);
    const normalizedId = cleanGroupId(groupId);
    const groups = current.groups.filter(group => group.groupId !== normalizedId);
    return { store: normalizeStore({ ...current, groups }), deleted: groups.length !== current.groups.length };
  }

  return Object.freeze({
    VERSION,
    MAX_GROUPS,
    MAX_PROJECTS_PER_GROUP,
    COLORS,
    GROUP_ID_PATTERN,
    defaultStore,
    normalizeGroup,
    normalizeStore,
    storesEqual,
    createGroup,
    updateGroup,
    deleteGroup
  });
});
