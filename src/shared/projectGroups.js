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
      projectIds: cleanProjectIds(value.projectIds),
      ...(value.kind === 'collection' ? { kind: 'collection', categoryId: cleanGroupId(value.categoryId), collectionIds: [...new Set((Array.isArray(value.collectionIds) ? value.collectionIds : []).map(cleanGroupId).filter(Boolean))].slice(0, MAX_GROUPS) } : {})
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
    validateHierarchy(next.groups);
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
    validateHierarchy(next.groups);
    return { store: next, group: normalized };
  }

  function deleteGroup(store, groupId) {
    const current = normalizeStore(store);
    const normalizedId = cleanGroupId(groupId);
    const removed = current.groups.find(group => group.groupId === normalizedId);
    const groups = current.groups.filter(group => group.groupId !== normalizedId).map(group => {
      if (removed?.kind !== 'collection' || !group.collectionIds?.includes(normalizedId)) return group;
      return { ...group, projectIds: [...new Set([...group.projectIds, ...removed.projectIds])], collectionIds: [...new Set([...group.collectionIds.filter(id => id !== normalizedId), ...removed.collectionIds])] };
    });
    return { store: normalizeStore({ ...current, groups }), deleted: groups.length !== current.groups.length };
  }

  function validateHierarchy(groups) {
    const lookup = new Map(groups.filter(group => group.kind === 'collection').map(group => [group.groupId, group]));
    const visited = new Set();
    function visit(id, branch = new Set()) {
      if (branch.has(id)) throw new Error('不能把项目加入自身或自己的子项目');
      if (visited.has(id) || !lookup.has(id)) return;
      const next = new Set([...branch, id]);
      for (const child of lookup.get(id).collectionIds || []) visit(child, next);
      visited.add(id);
    }
    for (const id of lookup.keys()) visit(id);
  }

  function descendantProjectIds(group, groups, seen = new Set()) {
    if (!group || seen.has(group.groupId)) return [];
    seen.add(group.groupId);
    return [...new Set([...group.projectIds, ...(group.collectionIds || []).flatMap(id => descendantProjectIds(groups.find(candidate => candidate.groupId === id && candidate.kind === 'collection'), groups, seen))])];
  }

  // Logical hierarchy only; original project identities, paths and Git data stay intact.
  function projectEntries(projects = [], groups = [], parentId = '') {
    const collections = groups.filter(group => group.kind === 'collection');
    const assigned = new Set(collections.flatMap(group => group.projectIds));
    const nested = new Set(collections.flatMap(group => group.collectionIds || []));
    function build(group, branch = new Set(), inheritedCategory = '') {
      const next = new Set([...branch, group.groupId]);
      const childGroups = (group.collectionIds || []).map(id => collections.find(child => child.groupId === id)).filter(child => child && !next.has(child.groupId));
      const direct = projects.filter(project => group.projectIds.includes(project.projectId));
      const members = [...childGroups.map(child => build(child, next, group.categoryId || inheritedCategory)), ...direct];
      const repositories = [...new Map(members.flatMap(project => project.repositories || []).map(repo => [repo.path, repo])).values()];
      return {
        projectId: group.groupId, name: group.name, description: group.description,
        color: group.color, categoryId: group.categoryId || inheritedCategory, isProjectCollection: true,
        path: '', rootIsGitRepo: false, lifecycle: 'active',
        modifiedTime: members.map(project => project.modifiedTime).filter(Boolean).sort().at(-1) || null,
        memberProjects: members, missingMemberCount: group.projectIds.length - direct.length + (group.collectionIds || []).length - childGroups.length,
        repositories, repositoryCount: repositories.length
      };
    }
    const roots = collections.filter(group => !nested.has(group.groupId));
    if (parentId) {
      const parent = collections.find(group => group.groupId === parentId);
      return parent ? build(parent).memberProjects : [];
    }
    return [...roots.map(group => build(group)), ...projects.filter(project => !assigned.has(project.projectId))];
  }

  function containsCollection(project, id) {
    return project.projectId === id || (project.memberProjects || []).some(child => containsCollection(child, id));
  }

  function repositoryMatchesType(project, groups, type) {
    const selected = groups.find(group => group.groupId === type);
    if (selected?.kind === 'collection') return !!project && descendantProjectIds(selected, groups).includes(project.projectId);
    const nested = new Set(groups.flatMap(group => group.collectionIds || []));
    const owners = groups.filter(group => group.kind === 'collection' && !nested.has(group.groupId) && descendantProjectIds(group, groups).includes(project?.projectId));
    if (owners.length) return owners.some(group => matchesCategory({ isProjectCollection: true, categoryId: group.categoryId }, groups, type));
    return project ? matchesCategory(project, groups, type) : type === 'unclassified' || !type;
  }

  function matchesCategory(project, groups, categoryId) {
    const categories = groups.filter(group => group.kind !== 'collection');
    if (!categoryId) return true;
    if (project.isProjectCollection) {
      const assigned = categories.some(group => group.groupId === project.categoryId);
      return categoryId === 'unclassified' ? !assigned : project.categoryId === categoryId;
    }
    return categoryId === 'unclassified'
      ? !categories.some(group => group.projectIds.includes(project.projectId))
      : categories.some(group => group.groupId === categoryId && group.projectIds.includes(project.projectId));
  }

  return Object.freeze({
    VERSION,
    MAX_GROUPS,
    MAX_PROJECTS_PER_GROUP,
    COLORS,
    GROUP_ID_PATTERN,
    defaultStore,
    projectEntries,
    containsCollection,
    descendantProjectIds,
    validateHierarchy,
    matchesCategory,
    repositoryMatchesType,
    normalizeGroup,
    normalizeStore,
    storesEqual,
    createGroup,
    updateGroup,
    deleteGroup
  });
});
