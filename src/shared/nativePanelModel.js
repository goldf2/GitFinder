(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NativePanelModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const FRESH_MS = 5 * 60 * 1000;
  function urlKey(value) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
      url.hash = '';
      return url.href;
    } catch (_) { return ''; }
  }
  function lamp(check, now = Date.now()) {
    if (!check) return { color: 'gray', label: '未检测' };
    if (check.checking) return { color: 'yellow', label: '检测中' };
    const time = Date.parse(check.checkedAt);
    if (!Number.isFinite(time)) return { color: 'gray', label: '无有效记录' };
    if (check.stale || now - time > FRESH_MS || time > now + 60000) return { color: 'yellow', label: '结果待更新' };
    const code = Number(check.httpStatus);
    if (code === 401 || code === 403) return { color: 'yellow', label: '需授权访问' };
    if (code >= 200 && code < 400) return { color: 'green', label: '可访问' };
    if (code >= 400) return { color: 'red', label: `HTTP ${code}` };
    const status = String(check.status || '').toLowerCase();
    if (/unhealthy|error|failed|stopped|exited|unreachable|offline/.test(status)) return { color: 'red', label: '异常' };
    if (/starting|restarting|pending|degraded/.test(status)) return { color: 'yellow', label: '变化中' };
    if (/^(running|healthy|reachable|online)(:healthy)?$/.test(status)) return { color: 'green', label: status.startsWith('running') || status === 'healthy' ? '运行中' : '可访问' };
    return { color: 'gray', label: '状态未知' };
  }
  function rows(snapshot = {}) {
    const providers = snapshot.providers || [];
    return (snapshot.topology?.deployments || []).flatMap(resource => {
      const provider = providers.find(item => item.providerId === resource.providerId);
      const urls = [...new Set((resource.domains || []).filter(url => urlKey(url)))];
      return (urls.length ? urls : ['']).map(url => ({
        ...resource, url, baseUrl: provider?.baseUrl || '',
        node: resource.providerLabel || provider?.label || resource.serverName || '未命名主机',
        project: resource.projectName || '未分配项目',
        deploymentCheck: { status: resource.status, checkedAt: snapshot.topology?.generatedAt, stale: Boolean(resource.stale) }
      }));
    });
  }
  function remoteCheck(row, observations) {
    if (!urlKey(row.baseUrl) || !urlKey(row.url)) return null;
    const matches = (observations?.checks || []).filter(check => check.resourceUuid === row.resourceUuid
      && urlKey(check.nodeUrl) === urlKey(row.baseUrl) && urlKey(check.url) === urlKey(row.url));
    return matches.length === 1 ? matches[0] : null;
  }
  return { FRESH_MS, urlKey, lamp, rows, remoteCheck };
});
