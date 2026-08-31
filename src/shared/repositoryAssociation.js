(function exposeRepositoryAssociation(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RepositoryAssociation = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRepositoryAssociation() {
  // Compare source identities, never credentials, directory names or upstream remotes.
  function repositoryKey(value) {
    let input = String(value || '').trim();
    if (!input || /[\s\\?#]/.test(input)) return '';
    if (!input.includes('://')) {
      const scp = input.match(/^(?:[^/@:]+@)?([^/:]+):(.+)$/);
      if (!scp) return '';
      input = `ssh://${scp[1]}/${scp[2]}`;
    }
    try {
      const url = new URL(input);
      if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return '';
      let repoPath = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
      if (!repoPath.includes('/') || /%|\/\/|(?:^|\/)\.{1,2}(?:\/|$)/.test(repoPath)) return '';
      const host = url.hostname.toLowerCase();
      if (['github.com', 'gitlab.com', 'bitbucket.org'].includes(host)) repoPath = repoPath.toLowerCase();
      const port = (url.protocol === 'ssh:' && url.port === '22') || (url.protocol === 'git:' && url.port === '9418') ? '' : url.port;
      return `${host}${port ? `:${port}` : ''}/${repoPath}`;
    } catch (_) { return ''; }
  }

  function matchRepository(deployment, repositories) {
    const key = repositoryKey(deployment?.repositoryUrl);
    const active = (repositories || []).filter(repo => repo?.id && repo.path && !repo.archived && repo.available !== false);
    const candidateIds = [...new Set(active.filter(repo => key && (repo.repositoryKey || repositoryKey(repo.originUrl)) === key).map(repo => repo.id))];
    if (candidateIds.length) return { mode: candidateIds.length === 1 ? 'automatic' : 'ambiguous', repositoryIds: candidateIds.length === 1 ? candidateIds : [], candidateIds, repositoryKey: key };
    // Coolify can return owner/repo without a host. Offer candidates but never guess the host.
    const short = String(deployment?.repositoryUrl || '').trim().replace(/\.git$/, '');
    const suggestions = !key && /^[\w.-]+\/[\w./-]+$/.test(short)
      ? active.filter(repo => (repo.repositoryKey || repositoryKey(repo.originUrl)).split('/').slice(1).join('/') === short).map(repo => repo.id)
      : [];
    return { mode: suggestions.length ? 'suggested' : (key ? 'unmatched' : 'no-source'), repositoryIds: [], candidateIds: [...new Set(suggestions)], repositoryKey: key };
  }

  function resolveAssociation(deployment, repositories, projectBindings, preference) {
    if (projectBindings.length) return { mode: 'project', repositoryIds: [...new Set(projectBindings.flatMap(binding => binding.repositoryIds || []))], candidateIds: [] };
    if (preference?.mode === 'manual') return { mode: 'manual', repositoryIds: preference.repositoryIds || [], candidateIds: [] };
    if (preference?.mode === 'disabled') return { mode: 'disabled', repositoryIds: [], candidateIds: [] };
    return matchRepository(deployment, repositories);
  }

  return { repositoryKey, matchRepository, resolveAssociation };
});
