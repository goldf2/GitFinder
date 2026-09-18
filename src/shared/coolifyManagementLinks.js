(function exposeCoolifyManagementLinks(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.CoolifyManagementLinks = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCoolifyManagementLinks() {
  function safeUrl(value) {
    if (typeof value !== 'string' || value.length > 4096 || /[\s\\]/.test(value)) return '';
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
      return url.toString().replace(/\/$/, '');
    } catch { return ''; }
  }
  function identifier(value) {
    const text = typeof value === 'string' ? value : '';
    return /^[A-Za-z0-9_-]{1,180}$/.test(text) && !/(^|_)unknown$/.test(text) ? text : '';
  }
  // Build only from a configured instance and source UUIDs, never from names,
  // workload domains, credentials, or URL fields copied into portable documents.
  function projectUrl(base, projectUuid) {
    const root = safeUrl(base), id = identifier(projectUuid);
    return root && id ? `${root}/project/${encodeURIComponent(id)}` : '';
  }
  function serverUrl(base, nodeId) {
    const root = safeUrl(base), id = identifier(nodeId);
    return root && id ? `${root}/server/${encodeURIComponent(id)}` : '';
  }
  function deploymentUrl(base, resource = {}) {
    const project = projectUrl(base, resource.projectUuid);
    const environment = identifier(resource.environmentUuid), id = identifier(resource.resourceUuid);
    const type = resource.resourceType || resource.type;
    return project && environment && id && ['application', 'service', 'database'].includes(type)
      ? `${project}/environment/${environment}/${type}/${id}` : '';
  }
  function isProject(entity) {
    return (entity?.type === 'group' && (entity.runtime?.dynamicKind === 'coolify-project-group' || String(entity.id || '').startsWith('entity_panel_projectgroup_')))
      || (entity?.type === 'project' && entity.runtime?.dynamicKind === 'panel-project');
  }
  function entityUrl(entity) {
    const url = safeUrl(entity?.runtime?.coolifyUrl);
    if (!url) return '';
    const route = new URL(url).pathname;
    const segment = '[A-Za-z0-9_-]+';
    const suffix = entity.type === 'server' ? `/server/${segment}`
      : entity.type === 'deployment' ? `/project/${segment}/environment/${segment}/(?:application|service|database)/${segment}`
        : isProject(entity) ? `/project/${segment}` : '';
    return suffix && new RegExp(`${suffix}$`).test(route) ? url : '';
  }
  return Object.freeze({ safeUrl, identifier, projectUrl, serverUrl, deploymentUrl, entityUrl, isProject });
});
