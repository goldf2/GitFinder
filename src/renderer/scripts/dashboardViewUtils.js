// Adapted from coolify-dashboard 0.8.16 public modules (MIT). See vendor/README.md.
(function(root, factory) { const api = factory(); if (typeof module !== "undefined" && module.exports) module.exports = api; if (root) root.DashboardViewUtils = api; })(typeof window !== "undefined" ? window : globalThis, function() {
const DEFAULT_FILTER_STATE = {
  query: "",
  types: [],
  statuses: [],
  projects: [],
  environments: [],
  nodes: [],
  customFilters: {},
  group: "none",
  sort: "name-asc",
};

const GROUPS = new Set(["none", "node", "project", "environment", "type", "status"]);
const SORTS = new Set(["name-asc", "name-desc", "node-asc", "node-desc", "type-asc", "type-desc", "status", "status-desc", "web-asc", "web-desc", "project-asc", "project-desc", "updated-desc", "updated-asc"]);
const CUSTOM_KEY_PATTERN = /^custom:[a-zA-Z0-9-]{1,64}$/;
const CUSTOM_SORT_PATTERN = /^custom:[a-zA-Z0-9-]{1,64}:(asc|desc)$/;

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}

function normalizeCustomFilters(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => CUSTOM_KEY_PATTERN.test(key))
    .map(([key, selected]) => [key, normalizeList(selected)])
    .filter(([, selected]) => selected.length));
}

function normalizeFilterState(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    query: typeof source.query === "string" ? source.query.slice(0, 200) : "",
    types: normalizeList(source.types),
    statuses: normalizeList(source.statuses),
    projects: normalizeList(source.projects),
    environments: normalizeList(source.environments),
    nodes: normalizeList(source.nodes),
    customFilters: normalizeCustomFilters(source.customFilters),
    group: GROUPS.has(source.group) || CUSTOM_KEY_PATTERN.test(source.group) ? source.group : DEFAULT_FILTER_STATE.group,
    sort: SORTS.has(source.sort) || CUSTOM_SORT_PATTERN.test(source.sort) ? source.sort : DEFAULT_FILTER_STATE.sort,
  };
}

function pruneSelections(selected, available) {
  const allowed = new Set(available);
  return normalizeList(selected).filter((value) => allowed.has(value));
}

function toggleSelection(selected, value) {
  const normalized = normalizeList(selected);
  return normalized.includes(value) ? normalized.filter((item) => item !== value) : [...normalized, value];
}

function matchesSelection(value, selected) {
  return !selected.length || selected.includes(value);
}

function resolveServerGrouping(group, serverCount, hasExplicitPreference) {
  if (hasExplicitPreference) return group;
  if (serverCount > 1 && group === "none") return "node";
  if (serverCount <= 1 && group === "node") return "none";
  return group;
}

const LAYOUT_MODES = new Set(["table", "cards"]);

function normalizeLayoutMode(value) {
  return LAYOUT_MODES.has(value) ? value : "table";
}

const COLUMN_SORTS = {
  service: ["name-asc", "name-desc"],
  node: ["node-asc", "node-desc"],
  type: ["type-asc", "type-desc"],
  status: ["status", "status-desc"],
  web: ["web-asc", "web-desc"],
  project: ["project-asc", "project-desc"],
  updated: ["updated-asc", "updated-desc"],
};

function columnSortValues(column) {
  if (column.startsWith("custom:")) return [`${column}:asc`, `${column}:desc`];
  return COLUMN_SORTS[column] || [];
}

function nextColumnSort(column, currentSort) {
  const values = columnSortValues(column);
  if (!values.length) return currentSort;
  return currentSort === values[0] ? values[1] : values[0];
}

function columnSortDirection(column, currentSort) {
  const values = columnSortValues(column);
  if (currentSort === values[0]) return "ascending";
  if (currentSort === values[1]) return "descending";
  return null;
}

return { normalizeFilterState, matchesSelection, toggleSelection, normalizeLayoutMode, nextColumnSort, columnSortDirection };
});
