const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { repositoryKey } = require('../../shared/repositoryAssociation');
const { EndpointHealthService } = require('./endpointHealthService');
const {
  cleanText,
  normalizeIdentifier,
  normalizeBaseUrl,
  normalizeToken: normalizeProviderToken,
  normalizeExternalUrl: normalizeProviderExternalUrl,
  writeJsonAtomic
} = require('./providerUtils');

const SESSION_SCHEMA_VERSION = 1;
const TOPOLOGY_CACHE_SCHEMA_VERSION = 1;
const SYNC_LOG_SCHEMA_VERSION = 1;
const MAX_SYNC_LOG_RUNS = 12;
const MAX_SYNC_LOG_EVENTS = 512;
const MAX_SYNC_LOG_BYTES = 1024 * 1024;
const BINDINGS_SCHEMA_VERSION = 2;
const API_PREFIX = '/api/v1';
const REQUEST_TIMEOUT_MS = 12_000;
const PROVIDER_SYNC_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_PROVIDERS = 12;
const MAX_RESOURCES = 2_000;
const MAX_SERVERS = 256;
const MAX_PROJECTS = 256;
const MAX_BINDINGS = 50;
const MAX_BINDING_REPOSITORIES = 8;
const MAX_DEPLOYMENT_LOOKUPS = 100;
const PROGRESS_PHASES = new Set(['endpoints', 'project-details', 'deployment-history', 'finalizing']);
const PROGRESS_PHASE_LABELS = {
  endpoints: '读取基础资源',
  'project-details': '读取项目详情',
  'deployment-history': '读取部署历史',
  finalizing: '整理拓扑'
};

function redactProgressText(value, maxLength = 160) {
  return cleanText(value, maxLength)
    .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/\b(?:bearer|token|secret|password|access[_-]?token)\s*[:=]?\s*[^\s,;]+/gi, '[redacted-secret]');
}

function progressCount(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

const PROGRESS_COUNT_KEYS = [
  'applications', 'services', 'databases', 'servers', 'projects', 'deployments',
  'projectDetails', 'deploymentHistory'
];

function syncLogEndpoint(pathname = '') {
  const value = String(pathname || '').split('?')[0];
  if (['applications', 'services', 'databases', 'servers', 'projects', 'project-detail', 'github-apps', 'deployment-history'].includes(value)) return value;
  if (/\/applications$/i.test(value)) return 'applications';
  if (/\/services$/i.test(value)) return 'services';
  if (/\/databases$/i.test(value)) return 'databases';
  if (/\/servers$/i.test(value)) return 'servers';
  if (/\/projects$/i.test(value)) return 'projects';
  if (/\/projects\/[^/]+$/i.test(value)) return 'project-detail';
  if (/\/github-apps$/i.test(value)) return 'github-apps';
  if (/\/deployments\/applications\//i.test(value)) return 'deployment-history';
  return 'coolify-api';
}

function syncLogSecrets(options = {}) {
  return [options.baseUrl, options.token, options.accessToken]
    .map(value => String(value || '').trim())
    .filter(value => value.length >= 3);
}

function redactSyncLogText(value, secrets = [], maxLength = 500) {
  let text = redactProgressText(value, maxLength);
  for (const secret of secrets) text = text.split(secret).join('[redacted]');
  return text
    .replace(/(?:authorization|access[_-]?token|api[_-]?key|secret|password|token)\s*[:=]\s*[^\s,;}]*/gi, '[redacted-secret]')
    .replace(/\b(?:bearer|token|secret|password|access[_-]?token)\s+[^\s,;}]*/gi, '[redacted-secret]')
    .slice(0, maxLength);
}

function emitSyncLog(options = {}, payload = {}) {
  if (typeof options.onSyncLog !== 'function') return;
  const secrets = syncLogSecrets(options);
  const event = {
    kind: ['phase', 'request', 'provider'].includes(payload.kind) ? payload.kind : 'event',
    at: normalizeTimestamp(payload.at, new Date().toISOString()),
    ...(payload.phase ? { phase: redactSyncLogText(payload.phase, secrets, 64) } : {}),
    ...(payload.endpoint ? { endpoint: syncLogEndpoint(payload.endpoint) } : {}),
    ...(payload.status ? { status: redactSyncLogText(payload.status, secrets, 32) } : {}),
    ...(payload.providerId ? { providerId: redactSyncLogText(payload.providerId, secrets, 180) } : {}),
    ...(payload.providerLabel ? { providerLabel: redactSyncLogText(payload.providerLabel, secrets, 160) } : {}),
    ...(payload.completed !== undefined ? { completed: progressCount(payload.completed) } : {}),
    ...(payload.total !== undefined ? { total: progressCount(payload.total) } : {}),
    ...(payload.durationMs !== undefined ? { durationMs: progressCount(payload.durationMs) } : {}),
    ...(payload.responseCount !== undefined ? { responseCount: progressCount(payload.responseCount) } : {}),
    ...(payload.readCounts ? { readCounts: normalizeProgressCounts(payload.readCounts) } : {}),
    ...(payload.error ? { error: redactSyncLogText(payload.error, secrets, 500) } : {})
  };
  try {
    const result = options.onSyncLog(event);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (_) {
    // Logging is diagnostic-only and must never interrupt a Coolify read.
  }
}

function normalizeProgressCounts(value) {
  if (!value || typeof value !== 'object') return {};
  return PROGRESS_COUNT_KEYS.reduce((counts, key) => {
    if (value[key] !== undefined && value[key] !== null) counts[key] = progressCount(value[key]);
    return counts;
  }, {});
}

/**
 * Progress is deliberately a best-effort side channel.  A renderer callback
 * must never be able to interrupt a sync, and its payload must not contain a
 * provider URL, API token, or an arbitrary fetch error.
 */
function emitProgress(options = {}, payload = {}) {
  if (typeof options.onProgress !== 'function') return;
  if (options.signal?.aborted && !payload.allowAborted) return;
  const phase = PROGRESS_PHASES.has(payload.phase) ? payload.phase : 'finalizing';
  const total = progressCount(payload.total);
  const completed = Math.min(total, progressCount(payload.completed));
  const status = ['running', 'completed', 'failed', 'cancelled'].includes(payload.status)
    ? payload.status : 'running';
  const state = ['running', 'ready', 'warning', 'error', 'cancelled'].includes(payload.state)
    ? payload.state
    : ({ completed: 'ready', failed: 'error', cancelled: 'cancelled' }[status] || 'running');
  const providerCount = progressCount(payload.providerCount ?? options.providerCount);
  const completedProviders = Math.min(providerCount, progressCount(payload.completedProviders ?? options.completedProviders));
  const startedAt = redactProgressText(payload.startedAt ?? options.startedAt, 40);
  const updatedAt = redactProgressText(payload.updatedAt ?? new Date().toISOString(), 40);
  const event = {
    requestId: redactProgressText(options.requestId, 160),
    providerId: redactProgressText(options.providerId, 160),
    providerLabel: redactProgressText(options.providerLabel, 160),
    phase,
    phaseLabel: PROGRESS_PHASE_LABELS[phase],
    state,
    providerCount,
    completedProviders,
    completed,
    total,
    status,
    startedAt,
    updatedAt
  };
  const readCounts = normalizeProgressCounts(payload.readCounts);
  if (Object.keys(readCounts).length) event.readCounts = readCounts;
  if (payload.error) event.error = redactProgressText(payload.error, 240);
  try {
    const result = options.onProgress(event);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (_) {
    // Progress observers are non-critical and must not affect synchronization.
  }
}

function normalizeCoolifyBaseUrl(value) {
  return normalizeBaseUrl(value, {
    label: 'Coolify', allowedPaths: ['', '/api/v1'], trimTrailingSlash: true, rootDescription: '管理站点根地址'
  });
}

function normalizeToken(value) {
  return normalizeProviderToken(value, 'Coolify API Token 无效');
}

function normalizeTimestamp(value, fallback = '') {
  const date = new Date(value || fallback || 0);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function normalizeExternalUrl(value, { optional = true } = {}) {
  return normalizeProviderExternalUrl(value, { providerLabel: 'Coolify', optional });
}

function splitDomains(value) {
  if (Array.isArray(value)) return value.flatMap(splitDomains);
  if (!value || typeof value !== 'string') return [];
  return value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean);
}

function collectDomains(value) {
  const candidates = [];
  const visit = (item, depth = 0) => {
    if (depth > 4 || item === null || item === undefined) return;
    if (Array.isArray(item)) return item.slice(0, 100).forEach(child => visit(child, depth + 1));
    if (typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (/^(fqdn|fqdns|domain|domains|docker_compose_domains)$/i.test(key)) visit(child, depth + 1);
        else if (/^(applications|services|databases)$/i.test(key)) visit(child, depth + 1);
      }
      return;
    }
    for (const domain of splitDomains(item)) candidates.push(domain);
  };
  visit(value);
  const normalized = [];
  const seen = new Set();
  for (const candidate of candidates.slice(0, 100)) {
    try {
      const url = normalizeExternalUrl(candidate.includes('://') ? candidate : `https://${candidate}`, { optional: false });
      if (!seen.has(url)) {
        seen.add(url);
        normalized.push(url);
      }
    } catch (_) {}
    if (normalized.length >= 20) break;
  }
  return normalized;
}

function statusText(value) {
  return cleanText(value, 80, 'unknown').toLowerCase();
}

function serverStatus(server = {}) {
  const reachable = server.settings?.is_reachable;
  const usable = server.settings?.is_usable;
  if (reachable === false || usable === false) return 'offline';
  if (reachable === true && usable === true) return 'online';
  return statusText(server.status || server.state);
}

function managementUrl(baseUrl, resource = {}, type = '', identity = {}) {
  const projectUuid = cleanText(identity.projectUuid || resource.project_uuid || resource.project?.uuid, 180);
  const environmentUuid = cleanText(identity.environmentUuid || resource.environment_uuid || resource.environment?.uuid, 180);
  const resourceUuid = cleanText(identity.resourceUuid || resource.uuid || resource.id, 180);
  if (!projectUuid || !environmentUuid || !resourceUuid) return baseUrl;
  const kind = ['application', 'service', 'database'].includes(type) ? type : 'application';
  return `${baseUrl}/project/${encodeURIComponent(projectUuid)}/environment/${encodeURIComponent(environmentUuid)}/${kind}/${encodeURIComponent(resourceUuid)}`;
}

function unknownRecentFailure() {
  return { known: false, hasFailure: false, occurredAt: null, deploymentUuid: '', message: '', recoveredAt: null };
}

function deploymentFacts(items, fallbackTime) {
  const deployments = Array.isArray(items) ? items : items?.deployments;
  const latest = Array.isArray(deployments) ? deployments[0] : null;
  if (!latest || typeof latest !== 'object') return { lastDeployment: null, recentFailure: unknownRecentFailure() };
  const status = statusText(latest.status);
  const failed = /failed|error|cancelled|canceled/.test(status);
  const succeeded = /finished|success|succeeded|complete|completed/.test(status);
  const createdAt = normalizeTimestamp(latest.created_at || latest.createdAt, fallbackTime);
  const updatedAt = normalizeTimestamp(latest.updated_at || latest.updatedAt || latest.finished_at, createdAt);
  const deploymentUuid = normalizeIdentifier(latest.deployment_uuid || latest.uuid || latest.id, '部署事件 ID');
  const message = cleanText(latest.commit_message || latest.message || latest.description, 500);
  return {
    lastDeployment: {
      deploymentUuid,
      status,
      success: succeeded,
      createdAt,
      updatedAt,
      finishedAt: failed || succeeded ? updatedAt : null,
      branch: cleanText(latest.branch, 240),
      commit: cleanText(latest.commit, 160),
      message
    },
    recentFailure: {
      known: failed || succeeded,
      hasFailure: failed,
      occurredAt: failed ? updatedAt : null,
      deploymentUuid: failed ? deploymentUuid : '',
      message: failed ? message : '',
      recoveredAt: null
    }
  };
}

function normalizeCoolifyResource(resource = {}, type = 'resource', context = {}) {
  const environment = context.environment || {};
  const server = context.server || {};
  const resourceUuid = normalizeIdentifier(resource.uuid || resource.id, 'Coolify 资源 ID');
  const projectUuid = normalizeIdentifier(
    resource.project_uuid || resource.project?.uuid || environment.projectUuid,
    'Coolify 项目 ID',
    { fallback: 'project_unknown' }
  );
  const environmentUuid = normalizeIdentifier(
    resource.environment_uuid || resource.environment?.uuid || environment.environmentUuid,
    'Coolify 环境 ID',
    { fallback: 'environment_unknown' }
  );
  const nodeId = normalizeIdentifier(
    resource.server_uuid || resource.server?.uuid || server.uuid || server.id,
    'Coolify 服务器 ID',
    { fallback: 'server_unknown' }
  );
  const facts = context.deploymentFacts || { lastDeployment: null, recentFailure: unknownRecentFailure() };
  const shortSource = cleanText(resource.git_repository || resource.repository, 1000);
  const isShortSource = /^[\w.-]+\/[\w./-]+$/.test(shortSource);
  const sourceKey = [resource.git_full_url, resource.git_repository, resource.repository,
    isShortSource && context.sourceHtmlUrl ? `${context.sourceHtmlUrl.replace(/\/+$/, '')}/${shortSource}` : ''
  ].map(repositoryKey).find(Boolean);
  return {
    resourceUuid,
    nodeId,
    projectUuid,
    environmentUuid,
    name: cleanText(resource.name || resource.description, 160, '未命名资源'),
    type: cleanText(type, 80, 'resource'),
    status: statusText(resource.status || resource.container_status || resource.state),
    serverName: cleanText(server.name || resource.server?.name, 160, '未知服务器'),
    projectName: cleanText(resource.project?.name || environment.projectName, 160),
    environmentName: cleanText(resource.environment?.name || environment.environmentName, 120, '默认环境'),
    domains: collectDomains(resource),
    latencyMs: null,
    latencyKind: '',
    branch: cleanText(resource.git_branch || resource.branch, 240),
    commit: cleanText(facts.lastDeployment?.commit || resource.git_commit_sha || resource.commit, 160),
    commitSource: facts.lastDeployment?.commit ? 'deployment-history' : 'configuration',
    repositoryUrl: sourceKey ? `https://${sourceKey}` : (isShortSource ? shortSource : ''),
    imageReference: cleanText([
      resource.docker_registry_image_name,
      resource.docker_registry_image_tag
    ].filter(Boolean).join(':'), 500),
    imageDigest: cleanText(resource.image_digest, 240),
    lastDeployment: facts.lastDeployment,
    recentFailure: facts.recentFailure,
    panelUrl: '',
    coolifyUrl: context.baseUrl ? normalizeExternalUrl(managementUrl(context.baseUrl, resource, type, {
      projectUuid,
      environmentUuid,
      resourceUuid
    }), { optional: true }) : '',
    observedAt: normalizeTimestamp(resource.updated_at || resource.updatedAt, context.observedAt)
  };
}

function safeHttpError(status, pathname) {
  if (status === 401) return 'Coolify 拒绝了 API Token，请重新连接';
  if (status === 403) return 'Coolify Token 缺少 read 权限，或 API IP 白名单拒绝了当前设备';
  if (status === 404) return `Coolify API 不支持只读端点 ${pathname}`;
  if (status === 429) return 'Coolify 请求过于频繁，请稍后重试';
  return `Coolify API ${pathname} 返回 HTTP ${status}`;
}

function networkErrorCode(error) {
  const visited = new Set();
  const queue = [error];
  while (queue.length) {
    const current = queue.shift();
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || visited.has(current)) continue;
    visited.add(current);
    const code = String(current.code || '').trim();
    if (code) return code;
    if (current.cause) queue.push(current.cause);
    if (Array.isArray(current.errors)) queue.push(...current.errors);
  }
  return '';
}

function safeNetworkError(pathname, error) {
  const code = networkErrorCode(error);
  const descriptions = {
    ETIMEDOUT: '连接超时',
    UND_ERR_CONNECT_TIMEOUT: '连接超时',
    ECONNREFUSED: '连接被拒绝',
    ENETUNREACH: '网络不可达',
    EHOSTUNREACH: '主机不可达',
    ENOTFOUND: '域名解析失败',
    EAI_AGAIN: '域名解析暂时失败',
    CERT_HAS_EXPIRED: 'TLS 证书已过期',
    ERR_TLS_CERT_ALTNAME_INVALID: 'TLS 证书域名不匹配',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS 证书校验失败'
  };
  const description = descriptions[code];
  if (description) return new Error(`Coolify API ${pathname} ${description}${code ? `（${code}）` : ''}`);
  if (error?.name === 'TypeError' && /fetch failed/i.test(String(error.message || ''))) {
    return new Error(`Coolify API ${pathname} 网络连接失败`);
  }
  return null;
}

async function requestCoolifyJson(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境不支持 Coolify API 请求');
  const baseUrl = normalizeCoolifyBaseUrl(options.baseUrl);
  const pathname = String(options.pathname || '');
  if (!pathname.startsWith(`${API_PREFIX}/`) && pathname !== API_PREFIX) throw new Error('Coolify API 路径无效');
  const externalSignal = options.signal;
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(1, Number(options.timeoutMs)) : REQUEST_TIMEOUT_MS;
  let rejectHardTimeout;
  const hardTimeout = new Promise((_, reject) => { rejectHardTimeout = reject; });
  const abortRequest = reason => {
    const error = reason instanceof Error
      ? reason
      : Object.assign(new Error(`Coolify API ${pathname} 请求已取消`), { code: 'ABORT_ERR' });
    try { controller.abort(error); } catch (_) { controller.abort(); }
    rejectHardTimeout(error);
  };
  const onExternalAbort = () => abortRequest(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    const error = Object.assign(new Error(`Coolify API ${pathname} 请求超时`), { code: 'ETIMEDOUT' });
    controller.abort(error);
    rejectHardTimeout(error);
  }, timeoutMs);
  const request = (async () => {
    const response = await fetchImpl(new URL(pathname, baseUrl), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizeToken(options.token)}`,
        'User-Agent': 'GitFinder-2-Coolify-Read-Only/1'
      },
      redirect: 'error',
      signal: controller.signal
    });
    if (!response?.ok) throw new Error(safeHttpError(Number(response?.status || 0), pathname));
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) throw new Error('Coolify API 返回了网页而不是 JSON，请检查地址和 API 是否已启用');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > (options.maxBytes || MAX_RESPONSE_BYTES)) throw new Error('Coolify API 响应超过安全限制');
    let parsed;
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch (_) { throw new Error('Coolify API 返回了无效 JSON'); }
    return parsed?.data ?? parsed;
  })();
  try {
    // AbortController is best-effort across Electron/Node fetch implementations.
    // The hard race also covers a response body whose promise never settles.
    return await Promise.race([request, hardTimeout]);
  } catch (error) {
    if (error?.name === 'AbortError') {
      if (externalSignal?.aborted) throw Object.assign(new Error(`Coolify API ${pathname} 请求已取消`), { code: 'ABORT_ERR' });
      throw new Error(`Coolify API ${pathname} 请求超时`);
    }
    const networkError = safeNetworkError(pathname, error);
    if (networkError) throw networkError;
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

function withTimeout(task, timeoutMs, message, options = {}) {
  const duration = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Number(timeoutMs)) : PROVIDER_SYNC_TIMEOUT_MS;
  const controller = options.controller || new AbortController();
  let rejectTimeout;
  const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
  const rejectAbort = reason => {
    const error = reason instanceof Error ? reason : Object.assign(new Error('Coolify 同步已取消'), { code: 'ABORT_ERR' });
    rejectTimeout(error);
  };
  const onAbort = () => rejectAbort(controller.signal.reason);
  if (controller.signal.aborted) onAbort();
  else controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    const error = Object.assign(new Error(message), { code: 'ETIMEDOUT' });
    try { controller.abort(error); } catch (_) { controller.abort(); }
    rejectTimeout(error);
  }, duration);
  const promise = typeof task === 'function'
    ? Promise.resolve().then(() => task(controller.signal))
    : Promise.resolve(task);
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
  });
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      try { results[index] = { status: 'fulfilled', value: await mapper(values[index], index) }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function readCoolifyOverviewInternal(options = {}) {
  const progressState = options._progressState || { phase: 'endpoints' };
  const readCounts = {};
  const report = (phase, completed, total, status = 'running', error = '') => {
    progressState.phase = phase;
    progressState.completed = progressCount(completed);
    progressState.total = progressCount(total);
    const phaseKey = `${phase}:${status}:${progressState.completed}:${progressState.total}`;
    if (phaseKey !== progressState.lastLoggedPhaseKey || status !== 'running') {
      emitSyncLog(options, {
        kind: 'phase', phase, status, completed, total, readCounts, error
      });
      progressState.lastLoggedPhaseKey = phaseKey;
    }
    emitProgress(options, { phase, completed, total, status, error, readCounts });
  };
  const baseUrl = normalizeCoolifyBaseUrl(options.baseUrl);
  const token = normalizeToken(options.token);
  const observedAt = normalizeTimestamp(options.observedAt, new Date().toISOString());
  const get = (pathname, requestOptions = {}) => {
    const endpoint = syncLogEndpoint(pathname);
    const startedAt = Date.now();
    emitSyncLog({ ...options, baseUrl, token }, {
      kind: 'request', endpoint, phase: progressState.phase, status: 'started'
    });
    return requestCoolifyJson({
      ...options,
      ...requestOptions,
      baseUrl,
      token,
      pathname
    }).then(value => {
      emitSyncLog({ ...options, baseUrl, token }, {
        kind: 'request', endpoint, phase: progressState.phase, status: 'succeeded',
        durationMs: Date.now() - startedAt,
        ...(Array.isArray(value) ? { responseCount: value.length } : {})
      });
      return value;
    }).catch(error => {
      emitSyncLog({ ...options, baseUrl, token }, {
        kind: 'request', endpoint, phase: progressState.phase, status: 'failed',
        durationMs: Date.now() - startedAt, error: error?.message || String(error)
      });
      throw error;
    });
  };
  const endpointPaths = [
    `${API_PREFIX}/applications`,
    `${API_PREFIX}/services`,
    `${API_PREFIX}/databases`,
    `${API_PREFIX}/servers`,
    `${API_PREFIX}/projects`
  ];
  const names = ['applications', 'services', 'databases', 'servers', 'projects'];
  let endpointCompleted = 0;
  report('endpoints', 0, endpointPaths.length);
  const endpointResults = await Promise.allSettled(endpointPaths.map((pathname, index) => Promise.resolve()
    .then(() => get(pathname))
    .then(value => {
      if (Array.isArray(value)) readCounts[names[index]] = value.length;
      return value;
    })
    .finally(() => {
      endpointCompleted += 1;
      report('endpoints', endpointCompleted, endpointPaths.length);
    })));
  report('endpoints', endpointPaths.length, endpointPaths.length, 'completed');
  const values = endpointResults.map(result => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []);
  const errors = endpointResults.flatMap((result, index) => result.status === 'rejected'
    ? [{ kind: names[index], message: result.reason?.message || String(result.reason) }]
    : []);
  if (endpointResults.slice(0, 4).every(result => result.status === 'rejected')) {
    throw endpointResults[0].reason;
  }
  const [applications, services, databases, rawServers, rawProjects] = values;
  readCounts.deployments = applications.length + services.length + databases.length;
  if (applications.length + services.length + databases.length > MAX_RESOURCES) throw new Error(`Coolify 资源数量超过 ${MAX_RESOURCES} 个的安全上限`);
  if (rawServers.length > MAX_SERVERS) throw new Error(`Coolify 服务器数量超过 ${MAX_SERVERS} 个的安全上限`);
  if (rawProjects.length > MAX_PROJECTS) throw new Error(`Coolify 项目数量超过 ${MAX_PROJECTS} 个的安全上限`);

  // A GitHub App stores owner/repo separately from its (possibly enterprise) host.
  // Resolve only its explicit source identity; never infer the host from a name.
  const needsGithubSource = resource => resource.source_type === 'App\\Models\\GithubApp' && resource.source_id != null
    && ![resource.git_full_url, resource.git_repository, resource.repository].some(repositoryKey);
  const needsSourceHosts = applications.some(needsGithubSource);
  let projectDetailsCompleted = 0;
  const projectDetailsTotal = rawProjects.length + (needsSourceHosts ? 1 : 0);
  readCounts.projectDetails = 0;
  report('project-details', 0, projectDetailsTotal);
  const [projectDetails, sourceHosts] = await Promise.all([
    mapWithConcurrency(rawProjects, 4, project => get(`${API_PREFIX}/projects/${encodeURIComponent(project.uuid)}`).finally(() => {
      projectDetailsCompleted += 1;
      readCounts.projectDetails = projectDetailsCompleted;
      report('project-details', projectDetailsCompleted, projectDetailsTotal);
    })),
    needsSourceHosts ? get(`${API_PREFIX}/github-apps`).then(sources => new Map(
      (Array.isArray(sources) ? sources : []).map(source => [String(source.id), cleanText(source.html_url, 1000)])
    )).catch(error => {
      errors.push({ kind: 'repository-source', message: error.message });
      return new Map();
    }).finally(() => {
      projectDetailsCompleted += 1;
      readCounts.projectDetails = projectDetailsCompleted;
      report('project-details', projectDetailsCompleted, projectDetailsTotal);
    }) : new Map()
  ]);
  report('project-details', projectDetailsTotal, projectDetailsTotal, 'completed');
  const environmentById = new Map();
  projectDetails.forEach((result, index) => {
    if (result.status === 'rejected') {
      errors.push({ kind: 'project', message: result.reason?.message || String(result.reason) });
      return;
    }
    const project = result.value || rawProjects[index] || {};
    for (const environment of Array.isArray(project.environments) ? project.environments : []) {
      const context = {
        projectName: cleanText(project.name, 160),
        projectUuid: cleanText(project.uuid, 180),
        environmentName: cleanText(environment.name, 120),
        environmentUuid: cleanText(environment.uuid, 180)
      };
      environmentById.set(String(environment.id), context);
      if (environment.uuid) environmentById.set(String(environment.uuid), context);
    }
  });

  const serverById = new Map();
  for (const server of rawServers) {
    if (server.id !== undefined) serverById.set(String(server.id), server);
    if (server.uuid) serverById.set(String(server.uuid), server);
  }
  const defaultServer = rawServers.length === 1 ? rawServers[0] : {};
  const serverFor = resource => serverById.get(String(
    resource.server_uuid || resource.server?.uuid || resource.server_id || resource.destination?.server_id || resource.destination?.server?.id || ''
  )) || defaultServer;
  const environmentFor = resource => environmentById.get(String(
    resource.environment_uuid || resource.environment?.uuid || resource.environment_id || ''
  )) || {};

  // Deployment history is useful detail, but it is not required to draw the
  // topology. A large Coolify fleet can have dozens of applications and each
  // history endpoint has its own timeout. The topology path therefore uses a
  // bounded "fast" pass (the most recently updated applications only), while
  // catalog/detail reads keep the complete history pass by default.
  const historyMode = options.deploymentHistoryMode === 'fast' ? 'fast' : 'full';
  const requestedHistoryLimit = Number(options.deploymentHistoryLimit);
  const historyLimit = historyMode === 'fast'
    ? Math.min(MAX_DEPLOYMENT_LOOKUPS, Math.max(0, Number.isFinite(requestedHistoryLimit) ? requestedHistoryLimit : 8))
    : MAX_DEPLOYMENT_LOOKUPS;
  const historyApplications = applications
    .map((application, index) => ({ application, index }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.application.updated_at || left.application.updatedAt || '') || 0;
      const rightTime = Date.parse(right.application.updated_at || right.application.updatedAt || '') || 0;
      return rightTime - leftTime;
    })
    .slice(0, historyLimit);
  let deploymentCompleted = 0;
  readCounts.deploymentHistory = 0;
  report('deployment-history', 0, historyApplications.length);
  const deploymentResults = await mapWithConcurrency(
    historyApplications,
    historyMode === 'fast' ? 8 : 4,
    ({ application }) => get(
      `${API_PREFIX}/deployments/applications/${encodeURIComponent(application.uuid)}?skip=0&take=1`,
      historyMode === 'fast' ? { timeoutMs: options.deploymentHistoryTimeoutMs || 4_000 } : {}
    ).finally(() => {
      deploymentCompleted += 1;
      readCounts.deploymentHistory = deploymentCompleted;
      report('deployment-history', deploymentCompleted, historyApplications.length);
    })
  );
  report('deployment-history', historyApplications.length, historyApplications.length, 'completed');
  const deploymentByApplication = new Map();
  deploymentResults.forEach((result, index) => {
    const application = historyApplications[index].application;
    if (result.status === 'fulfilled') deploymentByApplication.set(String(application.uuid), deploymentFacts(result.value, observedAt));
    else errors.push({ kind: 'deployment', resourceUuid: String(application.uuid), message: result.reason?.message || String(result.reason) });
  });

  report('finalizing', 0, 1);

  const resources = [
    ...applications.map(resource => normalizeCoolifyResource(resource, 'application', {
      baseUrl, observedAt, environment: environmentFor(resource), server: serverFor(resource),
      sourceHtmlUrl: needsGithubSource(resource) ? sourceHosts.get(String(resource.source_id)) : '',
      deploymentFacts: deploymentByApplication.get(String(resource.uuid))
    })),
    ...services.map(resource => normalizeCoolifyResource(resource, 'service', {
      baseUrl, observedAt, environment: environmentFor(resource), server: serverFor(resource)
    })),
    ...databases.map(resource => normalizeCoolifyResource(resource, 'database', {
      baseUrl, observedAt, environment: environmentFor(resource), server: serverFor(resource)
    }))
  ];
  const resourceCountByServer = new Map();
  for (const resource of resources) resourceCountByServer.set(resource.nodeId, (resourceCountByServer.get(resource.nodeId) || 0) + 1);
  const servers = rawServers.map(server => {
    const nodeId = normalizeIdentifier(server.uuid || server.id, 'Coolify 服务器 ID');
    return {
      nodeId,
      name: cleanText(server.name || server.description, 160, '未命名服务器'),
      status: serverStatus(server),
      environmentName: '',
      observedAt: normalizeTimestamp(server.updated_at || server.updatedAt, observedAt),
      lastSeenAt: normalizeTimestamp(server.updated_at || server.updatedAt, observedAt),
      latencyMs: null,
      resourceCount: resourceCountByServer.get(nodeId) || 0,
      panelUrl: '',
      coolifyUrl: baseUrl
    };
  });
  const result = {
    generatedAt: observedAt,
    servers,
    deployments: resources,
    errors,
    readCounts: { ...readCounts },
    deploymentHistory: {
      mode: historyMode,
      requested: historyApplications.length,
      total: applications.length,
      deferred: Math.max(0, applications.length - historyApplications.length)
    }
  };
  report('finalizing', 1, 1, 'completed');
  return result;
}

async function readCoolifyOverview(options = {}) {
  const progressState = { phase: 'endpoints' };
  const internalOptions = { ...options, _progressState: progressState };
  try {
    return await readCoolifyOverviewInternal(internalOptions);
  } catch (error) {
    const cancelled = error?.code === 'ABORT_ERR' || options.signal?.aborted;
    emitProgress(options, {
      phase: progressState.phase,
      completed: progressState.completed,
      total: progressState.total,
      status: cancelled ? 'cancelled' : 'failed',
      error: cancelled ? '' : error?.message,
      allowAborted: true
    });
    throw error;
  }
}

function normalizeBinding(value = {}) {
  const repositoryRelativePath = cleanText(value.repositoryRelativePath, 600);
  const normalizedRelativePath = repositoryRelativePath ? path.posix.normalize(repositoryRelativePath.replace(/\\/g, '/')) : '';
  if (normalizedRelativePath && (
    path.posix.isAbsolute(normalizedRelativePath)
    || /^[a-z]:\//i.test(normalizedRelativePath)
    || normalizedRelativePath === '..'
    || normalizedRelativePath.startsWith('../')
  )) throw new Error('关联仓库必须使用项目内相对路径');
  const input = Array.isArray(value.repositoryIds) ? value.repositoryIds : [];
  if (input.length > MAX_BINDING_REPOSITORIES) throw new Error(`一个部署最多关联 ${MAX_BINDING_REPOSITORIES} 个仓库`);
  const repositoryIds = [...new Set(input.map(item => normalizeIdentifier(item, '仓库 ID')))];
  const primaryRepositoryId = normalizeIdentifier(value.primaryRepositoryId, '主仓库 ID', { required: false });
  if (primaryRepositoryId && !repositoryIds.includes(primaryRepositoryId)) throw new Error('主仓库必须包含在关联仓库列表中');
  return {
    providerKind: 'coolify',
    providerId: normalizeIdentifier(value.providerId, 'Provider ID'),
    nodeId: normalizeIdentifier(value.nodeId, '服务器 ID'),
    projectUuid: normalizeIdentifier(value.projectUuid, 'Coolify 项目 ID'),
    environmentUuid: normalizeIdentifier(value.environmentUuid, 'Coolify 环境 ID'),
    resourceUuid: normalizeIdentifier(value.resourceUuid, 'Coolify 资源 ID'),
    repositoryIds,
    ...(primaryRepositoryId ? { primaryRepositoryId } : {}),
    ...(normalizedRelativePath ? { repositoryRelativePath: normalizedRelativePath } : {})
  };
}

class CoolifyProviderService {
  constructor(options = {}) {
    this.app = options.app;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.projectService = options.projectService;
    this.getRegistry = options.getRegistry || (() => ({ repos: [] }));
    this.readOrigin = options.readOrigin || (directory => new Promise(resolve => {
      execFile('git', ['remote', 'get-url', 'origin'], { cwd: directory, encoding: 'utf8', timeout: 3000, maxBuffer: 8192, windowsHide: true }, (error, stdout) => resolve(error ? '' : stdout.trim()));
    }));
    this.now = options.now || (() => new Date());
    this.configDirectory = options.configDirectory || null;
    this.providers = null;
    this.allowedExternalUrls = new Set();
    this.endpointHealth = options.endpointHealth || new EndpointHealthService();
    this.endpointChecksCacheKey = '';
    this.activeSyncControllers = new Set();
    this.syncLog = null;
    this.syncLogLoaded = false;
    this.activeSyncRuns = new Map();
    this.syncRunCounter = 0;
  }

  _configDirectory() {
    const directory = this.configDirectory || this.app?.getPath?.('userData');
    if (!directory) throw new Error('无法确定 Coolify 本机会话目录');
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }

  _sessionPath() { return path.join(this._configDirectory(), 'coolify-session.json'); }

  _associationsPath() { return path.join(this._configDirectory(), 'coolify-repository-associations.json'); }

  _topologyCachePath() { return path.join(this._configDirectory(), 'coolify-topology-cache.json'); }

  _syncLogPath() { return path.join(this._configDirectory(), 'coolify-sync-log.json'); }

  _emptySyncLog() {
    return { schemaVersion: SYNC_LOG_SCHEMA_VERSION, runs: [] };
  }

  _loadSyncLog() {
    if (this.syncLogLoaded) return this.syncLog;
    this.syncLogLoaded = true;
    this.syncLog = this._emptySyncLog();
    let changed = false;
    try {
      const filePath = this._syncLogPath();
      if (fs.existsSync(filePath)) {
        const stat = fs.lstatSync(filePath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SYNC_LOG_BYTES) throw new Error('Coolify 同步日志文件无效');
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Number(parsed.schemaVersion) !== SYNC_LOG_SCHEMA_VERSION || !Array.isArray(parsed.runs)) throw new Error('Coolify 同步日志版本不受支持');
        this.syncLog.runs = parsed.runs.filter(run => run && typeof run === 'object').slice(-MAX_SYNC_LOG_RUNS);
      } else changed = true;
    } catch (_) {
      // A corrupt diagnostic log must not prevent the topology from loading.
      this.syncLog = this._emptySyncLog();
      changed = true;
    }
    const interruptedAt = normalizeTimestamp(this.now(), new Date().toISOString());
    for (const run of this.syncLog.runs) {
      if (run.status !== 'running') continue;
      run.status = 'interrupted';
      run.endedAt = interruptedAt;
      run.updatedAt = interruptedAt;
      run.error = '应用在同步完成前退出';
      changed = true;
    }
    if (changed) this._persistSyncLog();
    return this.syncLog;
  }

  _persistSyncLog() {
    if (!this.syncLog) return;
    try {
      const runs = Array.isArray(this.syncLog.runs)
        ? this.syncLog.runs.slice(-MAX_SYNC_LOG_RUNS).map(run => ({
          ...run,
          events: Array.isArray(run.events) ? run.events.slice(-MAX_SYNC_LOG_EVENTS) : []
        }))
        : [];
      const payload = { schemaVersion: SYNC_LOG_SCHEMA_VERSION, runs };
      // Keep the persisted diagnostic artifact bounded even when an instance has
      // hundreds of project/detail requests.  Endpoint counters remain intact;
      // only the oldest timeline events are dropped first.
      const serializedLength = () => JSON.stringify(payload, null, 2).length;
      while (serializedLength() > MAX_SYNC_LOG_BYTES) {
        const candidate = runs.find(run => run.events.length > 0);
        if (candidate) {
          candidate.events.shift();
          candidate.droppedEvents = progressCount(candidate.droppedEvents) + 1;
          continue;
        }
        if (runs.length <= 1) break;
        runs.shift();
      }
      writeJsonAtomic(this._syncLogPath(), payload);
    } catch (_) {
      // Diagnostic persistence is best-effort and must not interrupt a sync.
    }
  }

  _syncRunId(requestId = '', secrets = []) {
    const supplied = redactSyncLogText(requestId, secrets, 96).replace(/[^a-zA-Z0-9_.:-]/g, '_');
    if (supplied) return supplied;
    this.syncRunCounter += 1;
    return `sync_${Date.now()}_${this.syncRunCounter}`;
  }

  _beginSyncLog(providers = [], requestId = '') {
    try {
      this._loadSyncLog();
      const startedAt = normalizeTimestamp(this.now(), new Date().toISOString());
      const secrets = providers.flatMap(provider => [provider?.baseUrl, provider?.accessToken]);
      const run = {
        runId: this._syncRunId(requestId, secrets),
        status: 'running',
        startedAt,
        updatedAt: startedAt,
        endedAt: null,
        providerCount: providers.length,
        providers: providers.map(provider => ({
          providerId: redactSyncLogText(provider?.providerId, [], 180),
          providerLabel: redactSyncLogText(provider?.label, [provider?.baseUrl, provider?.accessToken], 160),
          status: 'pending',
          readCounts: {}
        })),
        endpointSummary: {},
        readCounts: {},
        events: [],
        droppedEvents: 0
      };
      this.syncLog.runs.push(run);
      this.syncLog.runs = this.syncLog.runs.slice(-MAX_SYNC_LOG_RUNS);
      this.activeSyncRuns.set(run.runId, run);
      // Persist the running marker immediately so an interrupted process can be diagnosed.
      this._persistSyncLog();
      return run;
    } catch (_) {
      return null;
    }
  }

  _appendSyncLog(runId, payload = {}, secrets = []) {
    const run = this.activeSyncRuns.get(runId);
    if (!run) return;
    const endpoint = payload.endpoint ? syncLogEndpoint(payload.endpoint) : undefined;
    const event = {
      kind: ['phase', 'request', 'provider'].includes(payload.kind) ? payload.kind : 'event',
      at: normalizeTimestamp(payload.at, new Date().toISOString()),
      ...(payload.phase ? { phase: redactSyncLogText(payload.phase, secrets, 64) } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(payload.status ? { status: redactSyncLogText(payload.status, secrets, 32) } : {}),
      ...(payload.providerId ? { providerId: redactSyncLogText(payload.providerId, secrets, 180) } : {}),
      ...(payload.providerLabel ? { providerLabel: redactSyncLogText(payload.providerLabel, secrets, 160) } : {}),
      ...(payload.completed !== undefined ? { completed: progressCount(payload.completed) } : {}),
      ...(payload.total !== undefined ? { total: progressCount(payload.total) } : {}),
      ...(payload.durationMs !== undefined ? { durationMs: progressCount(payload.durationMs) } : {}),
      ...(payload.responseCount !== undefined ? { responseCount: progressCount(payload.responseCount) } : {}),
      ...(payload.readCounts ? { readCounts: normalizeProgressCounts(payload.readCounts) } : {}),
      ...(payload.error ? { error: redactSyncLogText(payload.error, secrets, 500) } : {})
    };
    if (run.events.length >= MAX_SYNC_LOG_EVENTS) {
      run.events.shift();
      run.droppedEvents += 1;
    }
    run.events.push(event);
    run.updatedAt = event.at;
    if (event.readCounts) {
      run.readCounts = { ...run.readCounts, ...event.readCounts };
    }
    if (event.kind === 'request' && event.endpoint) {
      const summary = run.endpointSummary[event.endpoint] || {
        requests: 0, succeeded: 0, failed: 0, lastStatus: '', lastDurationMs: null, lastError: ''
      };
      if (event.status === 'started') summary.requests += 1;
      if (event.status === 'succeeded') summary.succeeded += 1;
      if (event.status === 'failed') summary.failed += 1;
      if (event.status) summary.lastStatus = event.status;
      if (event.durationMs !== undefined) summary.lastDurationMs = event.durationMs;
      if (event.error) summary.lastError = event.error;
      run.endpointSummary[event.endpoint] = summary;
    }
    if (event.kind === 'provider' && event.providerId) {
      const provider = run.providers.find(item => item.providerId === event.providerId);
      if (provider) {
        if (event.status) provider.status = event.status;
        if (event.readCounts) provider.readCounts = { ...provider.readCounts, ...event.readCounts };
        if (event.error) provider.error = event.error;
      }
    }
  }

  _finishSyncLog(run, summary = {}, secrets = []) {
    if (!run || !this.activeSyncRuns.has(run.runId)) return;
    const endedAt = normalizeTimestamp(this.now(), new Date().toISOString());
    run.status = ['completed', 'warning', 'failed', 'cancelled'].includes(summary.status) ? summary.status : 'completed';
    run.endedAt = endedAt;
    run.updatedAt = endedAt;
    run.durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(run.startedAt));
    if (summary.error) run.error = redactSyncLogText(summary.error, secrets, 500);
    if (summary.state) run.state = redactSyncLogText(summary.state, [], 32);
    if (summary.errors) run.errors = summary.errors.slice(0, MAX_SYNC_LOG_RUNS).map(error => ({
      providerId: redactSyncLogText(error?.providerId, [], 180),
      providerLabel: redactSyncLogText(error?.label, [], 160),
      message: redactSyncLogText(error?.message, secrets, 500)
    }));
    run.completedProviders = progressCount(summary.completedProviders);
    this.activeSyncRuns.delete(run.runId);
    this._persistSyncLog();
  }

  getSyncLog() {
    const log = this._loadSyncLog();
    const runs = JSON.parse(JSON.stringify(log.runs || []));
    const activeRun = runs.filter(run => run.status === 'running').at(-1) || null;
    const filePath = this._syncLogPath();
    return { path: filePath, exists: fs.existsSync(filePath), schemaVersion: SYNC_LOG_SCHEMA_VERSION, runs, activeRun };
  }

  clearSyncLog() {
    this._loadSyncLog();
    if (this.activeSyncRuns.size) throw new Error('同步进行中，暂不能清理日志');
    this.syncLog = this._emptySyncLog();
    try { fs.rmSync(this._syncLogPath(), { force: true }); } catch (_) {}
    return this.getSyncLog();
  }

  _readTopologyCacheEnvelope() {
    const filePath = this._topologyCachePath();
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw new Error('Coolify 拓扑缓存文件无效');
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Number(parsed.schemaVersion) !== TOPOLOGY_CACHE_SCHEMA_VERSION || parsed.snapshot?.state !== 'ready'
      || !Array.isArray(parsed.snapshot?.providers) || !Array.isArray(parsed.snapshot?.topology?.servers)
      || !Array.isArray(parsed.snapshot?.topology?.deployments)) throw new Error('Coolify 拓扑缓存版本不受支持');
    return parsed;
  }

  _writeTopologyCache(snapshot) {
    const cachedAt = new Date(this.now()).toISOString();
    writeJsonAtomic(this._topologyCachePath(), {
      schemaVersion: TOPOLOGY_CACHE_SCHEMA_VERSION,
      cachedAt,
      snapshot: { ...snapshot, cached: false, cachedAt }
    });
    return cachedAt;
  }

  _retainCachedProviders(providerIds) {
    const keep = new Set(providerIds || []);
    const filePath = this._topologyCachePath();
    if (!keep.size) {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
      return;
    }
    const envelope = this._readTopologyCacheEnvelope();
    if (!envelope) return;
    const providers = envelope.snapshot.providers.filter(provider => keep.has(provider.providerId));
    if (!providers.length) {
      fs.rmSync(filePath, { force: true });
      return;
    }
    const active = new Set(providers.map(provider => provider.providerId));
    const snapshot = {
      ...envelope.snapshot,
      providers,
      topology: {
        ...envelope.snapshot.topology,
        servers: envelope.snapshot.topology.servers.filter(item => active.has(item.providerId)),
        deployments: envelope.snapshot.topology.deployments.filter(item => active.has(item.providerId)),
        endpointChecks: (envelope.snapshot.topology.endpointChecks || []).filter(item => active.has(item.providerId))
      },
      errors: (envelope.snapshot.errors || []).filter(item => active.has(item.providerId))
    };
    delete snapshot.provider;
    if (providers.length === 1) snapshot.provider = providers[0];
    writeJsonAtomic(filePath, { ...envelope, snapshot });
  }

  _activateTopology(snapshot) {
    const providers = Array.isArray(snapshot?.providers) ? snapshot.providers : [];
    const deployments = Array.isArray(snapshot?.topology?.deployments) ? snapshot.topology.deployments : [];
    const servers = Array.isArray(snapshot?.topology?.servers) ? snapshot.topology.servers : [];
    this.endpointHealth.retainProviders(providers.map(item => item.providerId));
    for (const provider of providers) {
      this.endpointHealth.setTargets(provider.providerId, deployments
        .filter(item => item.providerId === provider.providerId).flatMap(item => item.domains || []));
    }
    for (const value of [
      ...providers.map(item => item.baseUrl),
      ...servers.flatMap(item => [item.coolifyUrl]),
      ...deployments.flatMap(item => [item.coolifyUrl, ...(item.domains || [])])
    ]) if (value) this.allowedExternalUrls.add(value);
  }

  getCachedTopology() {
    const currentProviders = this._loadProviders().map(provider => this._publicConnection(provider));
    if (!currentProviders.length) return {
      state: 'unconfigured', providers: [], cached: false,
      topology: { apiVersion: 'v1', generatedAt: '', cursor: '', servers: [], deployments: [] }, bindings: []
    };
    const envelope = this._readTopologyCacheEnvelope();
    if (!envelope) return {
      state: 'cache-miss', providers: currentProviders, cached: false,
      topology: { apiVersion: 'v1', generatedAt: '', cursor: '', servers: [], deployments: [] }, bindings: []
    };
    const activeIds = new Set(currentProviders.map(provider => provider.providerId));
    const cachedIds = new Set(envelope.snapshot.providers.map(provider => provider.providerId));
    const providers = currentProviders.filter(provider => cachedIds.has(provider.providerId));
    const snapshot = {
      ...envelope.snapshot,
      state: 'ready',
      providers,
      cached: true,
      cachedAt: envelope.cachedAt,
      topology: {
        ...envelope.snapshot.topology,
        servers: envelope.snapshot.topology.servers.filter(item => activeIds.has(item.providerId)),
        deployments: envelope.snapshot.topology.deployments.filter(item => activeIds.has(item.providerId)),
        endpointChecks: (envelope.snapshot.topology.endpointChecks || []).filter(item => activeIds.has(item.providerId))
      },
      errors: (envelope.snapshot.errors || []).filter(item => activeIds.has(item.providerId))
    };
    delete snapshot.provider;
    if (providers.length === 1) snapshot.provider = providers[0];
    this._activateTopology(snapshot);
    return snapshot;
  }

  getRepositoryAssociations() {
    const filePath = this._associationsPath();
    if (!fs.existsSync(filePath)) return [];
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new Error('本地仓库关联文件无效');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.associations)) throw new Error('本地仓库关联版本不受支持');
    return data.associations;
  }

  setRepositoryAssociation(value = {}) {
    const providerId = this._findProvider(value.providerId).providerId;
    const resourceUuid = normalizeIdentifier(value.resourceUuid, '部署 ID');
    if (!['automatic', 'manual', 'disabled'].includes(value.mode)) throw new Error('仓库关联模式无效');
    const repositoryIds = [...new Set((Array.isArray(value.repositoryIds) ? value.repositoryIds : []).map(id => normalizeIdentifier(id, '仓库 ID')))];
    if (value.mode === 'manual') {
      if (!repositoryIds.length || repositoryIds.length > MAX_BINDING_REPOSITORIES) throw new Error('请选择 1–8 个本地仓库');
      const activeIds = new Set(this.getRegistry().repos.filter(repo => !repo.archived && repo.path).map(repo => repo.id));
      if (repositoryIds.some(id => !activeIds.has(id))) throw new Error('所选仓库已不在本地注册表中，请刷新后重试');
    }
    const associations = this.getRepositoryAssociations().filter(item => item.providerId !== providerId || item.resourceUuid !== resourceUuid);
    if (value.mode !== 'automatic') associations.push({ providerId, resourceUuid, mode: value.mode, repositoryIds: value.mode === 'manual' ? repositoryIds : [] });
    writeJsonAtomic(this._associationsPath(), { version: 1, associations });
    return associations;
  }

  async getLocalRepositories() {
    const repositories = this.getRegistry().repos.filter(repo => !repo.archived && repo.path);
    const results = new Array(repositories.length);
    let next = 0;
    // Only read already registered roots. No recursive scan, fetch, status or credential access.
    await Promise.all(Array.from({ length: Math.min(4, repositories.length) }, async () => {
      while (next < repositories.length) {
        const index = next++;
        const repo = repositories[index];
        const available = fs.existsSync(path.join(repo.path, '.git'));
        const origin = available ? await this.readOrigin(repo.path) : '';
        results[index] = { ...repo, originUrl: '', repositoryKey: repositoryKey(origin), available };
      }
    }));
    return results;
  }

  _loadProviders() {
    if (this.providers) return this.providers;
    const filePath = this._sessionPath();
    if (!fs.existsSync(filePath)) return (this.providers = []);
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) throw new Error('Coolify 本机会话文件无效');
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw new Error('Coolify 本机会话文件权限过宽，请重新连接');
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Number(parsed.schemaVersion) !== SESSION_SCHEMA_VERSION || !Array.isArray(parsed.providers)) {
      throw new Error('Coolify 本机会话版本不受支持');
    }
    if (parsed.providers.length > MAX_PROVIDERS) throw new Error(`Coolify 实例数量超过 ${MAX_PROVIDERS} 个的安全上限`);
    const seen = new Set();
    this.providers = parsed.providers.map(value => {
      const baseUrl = normalizeCoolifyBaseUrl(value.baseUrl);
      return {
        providerId: normalizeIdentifier(value.providerId, 'Provider ID'),
        providerKind: 'coolify',
        label: cleanText(value.label, 120, new URL(baseUrl).hostname),
        baseUrl,
        accessToken: normalizeToken(value.accessToken),
        apiVersion: 'v1',
        capabilities: ['read'],
        connectedAt: cleanText(value.connectedAt, 64),
        credentialStorage: 'app-session'
      };
    }).filter(provider => {
      if (seen.has(provider.providerId)) return false;
      seen.add(provider.providerId);
      return true;
    });
    return this.providers;
  }

  _saveProviders(providers) {
    const values = Array.isArray(providers) ? providers.slice(0, MAX_PROVIDERS) : [];
    if (values.length) writeJsonAtomic(this._sessionPath(), { schemaVersion: SESSION_SCHEMA_VERSION, providers: values });
    else if (fs.existsSync(this._sessionPath())) fs.rmSync(this._sessionPath(), { force: true });
    this.providers = values;
    return values;
  }

  _publicConnection(provider) {
    if (!provider) return { configured: false, credentialAvailable: false };
    return {
      configured: Boolean(provider.accessToken),
      providerId: provider.providerId,
      providerKind: 'coolify',
      label: provider.label,
      baseUrl: provider.baseUrl,
      apiVersion: 'v1',
      capabilities: ['read'],
      connectedAt: provider.connectedAt,
      credentialAvailable: Boolean(provider.accessToken),
      credentialStorage: 'app-session',
      reconnectRequired: false
    };
  }

  _findProvider(providerId = '') {
    const providers = this._loadProviders();
    const provider = providerId ? providers.find(item => item.providerId === providerId) : providers[0];
    if (!provider) throw new Error('尚未连接 Coolify');
    return provider;
  }

  getConnections() { return this._loadProviders().map(provider => this._publicConnection(provider)); }
  getConnection(providerId = '') { return this._publicConnection(providerId ? this._loadProviders().find(item => item.providerId === providerId) : this._loadProviders()[0]); }

  _abortActiveSyncs() {
    for (const controller of this.activeSyncControllers) {
      try { controller.abort(Object.assign(new Error('Coolify 配置已变更，同步结果已取消'), { code: 'ABORT_ERR' })); } catch (_) { controller.abort(); }
    }
  }

  _isCurrentProvider(provider) {
    const current = this._loadProviders().find(item => item.providerId === provider?.providerId);
    return Boolean(current && current.baseUrl === provider.baseUrl && current.accessToken === provider.accessToken);
  }

  async connect(values = {}) {
    const baseUrl = normalizeCoolifyBaseUrl(values.baseUrl);
    const token = normalizeToken(values.token);
    await requestCoolifyJson({ baseUrl, token, pathname: `${API_PREFIX}/applications`, fetchImpl: this.fetchImpl });
    const generatedProviderId = `coolify_${crypto.createHash('sha256').update(baseUrl).digest('hex').slice(0, 24)}`;
    const providers = [...this._loadProviders()];
    const index = providers.findIndex(item => item.providerId === generatedProviderId || item.baseUrl === baseUrl);
    const providerId = index >= 0 ? providers[index].providerId : generatedProviderId;
    const provider = {
      providerId,
      providerKind: 'coolify',
      label: cleanText(values.label, 120, new URL(baseUrl).hostname),
      baseUrl,
      accessToken: token,
      apiVersion: 'v1',
      capabilities: ['read'],
      connectedAt: new Date(this.now()).toISOString(),
      credentialStorage: 'app-session'
    };
    if (index < 0 && providers.length >= MAX_PROVIDERS) throw new Error(`最多添加 ${MAX_PROVIDERS} 个 Coolify 实例`);
    if (index >= 0) providers.splice(index, 1, provider);
    else providers.push(provider);
    this._abortActiveSyncs();
    this._saveProviders(providers);
    return this._publicConnection(provider);
  }

  async update(values = {}) {
    const providers = [...this._loadProviders()];
    const index = providers.findIndex(item => item.providerId === values.providerId);
    if (index < 0) throw new Error('要编辑的 Coolify 连接已不存在');
    const current = providers[index];
    const baseUrl = normalizeCoolifyBaseUrl(values.baseUrl || current.baseUrl);
    const token = values.token ? normalizeToken(values.token) : current.accessToken;
    if (providers.some((item, candidateIndex) => candidateIndex !== index && item.baseUrl === baseUrl)) {
      throw new Error('该 Coolify 地址已经添加');
    }
    if (baseUrl !== current.baseUrl || values.token) {
      await requestCoolifyJson({ baseUrl, token, pathname: `${API_PREFIX}/applications`, fetchImpl: this.fetchImpl });
    }
    const provider = {
      ...current,
      label: cleanText(values.label, 120, new URL(baseUrl).hostname),
      baseUrl,
      accessToken: token,
      connectedAt: baseUrl === current.baseUrl && !values.token
        ? current.connectedAt
        : new Date(this.now()).toISOString()
    };
    providers.splice(index, 1, provider);
    this._abortActiveSyncs();
    this._saveProviders(providers);
    if (baseUrl !== current.baseUrl) {
      this.endpointHealth.setTargets(provider.providerId, []);
      this._retainCachedProviders(providers.filter(item => item.providerId !== provider.providerId).map(item => item.providerId));
    }
    this.allowedExternalUrls.clear();
    return this._publicConnection(provider);
  }

  disconnect(providerId = '') {
    this._abortActiveSyncs();
    const remaining = providerId ? this._loadProviders().filter(item => item.providerId !== providerId) : [];
    this._saveProviders(remaining);
    this._retainCachedProviders(remaining.map(item => item.providerId));
    this.endpointHealth.retainProviders(remaining.map(item => item.providerId));
    this.allowedExternalUrls.clear();
    return remaining.map(provider => this._publicConnection(provider));
  }

  async _overview(provider, options = {}) {
    const overview = await readCoolifyOverview({
      ...options,
      baseUrl: provider.baseUrl,
      token: provider.accessToken,
      fetchImpl: this.fetchImpl,
      signal: options.signal,
      observedAt: new Date(this.now()).toISOString()
    });
    if (!this._isCurrentProvider(provider)) throw Object.assign(new Error('Coolify 实例已变更，同步结果已丢弃'), { code: 'ESTALE' });
    for (const value of [provider.baseUrl, ...overview.servers.flatMap(server => [server.coolifyUrl]), ...overview.deployments.flatMap(resource => [resource.coolifyUrl, ...resource.domains])]) {
      if (value) this.allowedExternalUrls.add(value);
    }
    return overview;
  }

  async _aggregate(providerId = '', options = {}) {
    const providers = providerId ? [this._findProvider(providerId)] : this._loadProviders();
    if (!providers.length) return { state: 'unconfigured', providers: [], successes: [], errors: [] };
    const syncRun = this._beginSyncLog(providers, options.requestId);
    const providerTimeoutMs = options.providerTimeoutMs || PROVIDER_SYNC_TIMEOUT_MS;
    const providerCount = providers.length;
    const startedAt = normalizeTimestamp(this.now(), new Date().toISOString());
    let completedProviders = 0;
    const reportProvider = (provider, payload = {}) => {
      if (syncRun) this._appendSyncLog(syncRun.runId, {
        kind: 'phase',
        ...payload,
        providerId: provider?.providerId || payload.providerId,
        providerLabel: provider?.label || payload.providerLabel
      }, [provider?.baseUrl, provider?.accessToken]);
      return emitProgress({
        ...options,
        signal: undefined,
        providerId: provider?.providerId || payload.providerId,
        providerLabel: provider?.label || payload.providerLabel,
        providerCount,
        completedProviders,
        startedAt
      }, {
        ...payload,
        providerCount,
        completedProviders,
        startedAt,
        updatedAt: normalizeTimestamp(this.now(), new Date().toISOString())
      });
    };
    const settled = await Promise.allSettled(providers.map(async provider => {
      const controller = new AbortController();
      let active = true;
      this.activeSyncControllers.add(controller);
      const providerStartedAt = Date.now();
      if (syncRun) this._appendSyncLog(syncRun.runId, {
        kind: 'provider',
        providerId: provider.providerId,
        providerLabel: provider.label,
        status: 'started'
      }, [provider.baseUrl, provider.accessToken]);
      try {
        const overview = await withTimeout(
          signal => this._overview(provider, {
            ...options,
            signal,
            onProgress: progress => {
              if (!active) return;
              reportProvider(provider, progress);
            },
            onSyncLog: event => {
              if (!active || !syncRun) return;
              this._appendSyncLog(syncRun.runId, {
                ...event,
                providerId: provider.providerId,
                providerLabel: provider.label
              }, [provider.baseUrl, provider.accessToken]);
            }
          }),
          providerTimeoutMs,
          `Coolify 实例同步超时（超过 ${Math.ceil(providerTimeoutMs / 1000)} 秒）`,
          { controller }
        );
        if (!this._isCurrentProvider(provider)) throw Object.assign(new Error('Coolify 实例已变更，同步结果已丢弃'), { code: 'ESTALE' });
        completedProviders += 1;
        const warning = Array.isArray(overview.errors) && overview.errors.length > 0;
        if (syncRun) this._appendSyncLog(syncRun.runId, {
          kind: 'provider',
          providerId: provider.providerId,
          providerLabel: provider.label,
          status: warning ? 'warning' : 'succeeded',
          durationMs: Date.now() - providerStartedAt,
          readCounts: overview.readCounts,
          error: warning ? overview.errors[0]?.message : ''
        }, [provider.baseUrl, provider.accessToken]);
        reportProvider(provider, {
          phase: 'finalizing',
          completed: 1,
          total: 1,
          status: 'completed',
          state: warning ? 'warning' : 'ready',
          error: warning ? overview.errors[0]?.message : ''
        });
        return { provider, overview };
      } catch (error) {
        completedProviders += 1;
        const cancelled = error?.code === 'ABORT_ERR' || controller.signal.aborted;
        if (syncRun) this._appendSyncLog(syncRun.runId, {
          kind: 'provider',
          providerId: provider.providerId,
          providerLabel: provider.label,
          status: cancelled ? 'cancelled' : 'failed',
          durationMs: Date.now() - providerStartedAt,
          error: error?.message
        }, [provider.baseUrl, provider.accessToken]);
        reportProvider(provider, {
          phase: 'finalizing',
          completed: 0,
          total: 1,
          status: cancelled ? 'cancelled' : 'failed',
          state: cancelled ? 'cancelled' : 'error',
          error: error?.message,
          allowAborted: true
        });
        throw error;
      } finally {
        active = false;
        this.activeSyncControllers.delete(controller);
      }
    }));
    const successes = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
    const errors = settled.flatMap((result, index) => result.status === 'rejected'
      ? [{ providerId: providers[index].providerId, label: providers[index].label, message: result.reason?.message || String(result.reason) }]
      : []);
    const aggregate = {
      state: successes.length ? 'ready' : 'error',
      providers: providers.map(provider => this._publicConnection(provider)),
      successes,
      errors
    };
    const overallState = successes.length ? (errors.length ? 'warning' : 'ready') : 'error';
    if (typeof options.onProgress === 'function') {
      emitProgress({
        ...options,
        signal: undefined,
        providerCount,
        completedProviders,
        startedAt
      }, {
        phase: 'finalizing',
        completed: providerCount,
        total: providerCount,
        status: overallState === 'error' ? 'failed' : 'completed',
        state: overallState,
        error: errors[0]?.message,
        allowAborted: true
      });
    }
    if (syncRun) this._finishSyncLog(syncRun, {
      status: overallState === 'error' ? 'failed' : (overallState === 'warning' ? 'warning' : 'completed'),
      state: overallState,
      completedProviders,
      errors
    }, providers.flatMap(provider => [provider.baseUrl, provider.accessToken]));
    return aggregate;
  }

  async getCatalog(providerId = '') {
    const result = await this._aggregate(providerId);
    if (result.state === 'unconfigured') throw new Error('尚未连接 Coolify');
    if (!result.successes.length) throw new Error(result.errors[0]?.message || '无法读取 Coolify 资源');
    return {
      apiVersion: 'v1',
      resources: result.successes.flatMap(({ provider, overview }) => overview.deployments.map(resource => ({
        ...resource, providerId: provider.providerId, providerLabel: provider.label
      }))),
      providers: result.providers,
      errors: result.errors,
      ...(result.providers.length === 1 ? { provider: result.providers[0] } : {})
    };
  }

  async getTopology(options = {}) {
    const result = await this._aggregate('', { ...options, deploymentHistoryMode: 'fast' });
    const currentProviders = this._loadProviders();
    this.endpointHealth.retainProviders(currentProviders.map(item => item.providerId));
    for (const { provider, overview } of result.successes) {
      if (!currentProviders.some(current => current.providerId === provider.providerId && current.baseUrl === provider.baseUrl)) continue;
      this.endpointHealth.setTargets(provider.providerId, overview.deployments.flatMap(resource => resource.domains));
    }
    const empty = { apiVersion: 'v1', generatedAt: '', cursor: '', servers: [], deployments: [] };
    if (result.state === 'unconfigured') return { state: 'unconfigured', providers: [], topology: empty, bindings: [], cached: false };
    let cachedSnapshot = null;
    try { cachedSnapshot = this._readTopologyCacheEnvelope()?.snapshot || null; } catch (_) { cachedSnapshot = null; }
    const failedProviderIds = new Set(result.errors.map(error => error.providerId).filter(Boolean));
    if (!result.successes.length) {
      const cachedProviders = new Set((cachedSnapshot?.providers || []).map(provider => provider.providerId));
      if (cachedSnapshot?.state === 'ready' && result.providers.some(provider => cachedProviders.has(provider.providerId))) {
        const stale = {
          ...cachedSnapshot,
          state: 'ready',
          providers: result.providers,
          cached: true,
          staleProviders: [...failedProviderIds],
          errors: result.errors
        };
        this._activateTopology(stale);
        return stale;
      }
      return { state: 'error', providers: result.providers, topology: empty, bindings: [], errors: result.errors, cached: false };
    }
    const cachedDeploymentFacts = new Map((cachedSnapshot?.topology?.deployments || []).map(resource => [
      `${resource.providerId || ''}\u0000${resource.resourceUuid || resource.uuid || resource.id || resource.name || ''}`,
      resource
    ]));
    const restoreCachedHistory = (resource, providerId) => {
      const cached = cachedDeploymentFacts.get(`${providerId}\u0000${resource.resourceUuid || resource.uuid || resource.id || resource.name || ''}`);
      if (!cached) return resource;
      const next = { ...resource };
      let restored = false;
      if (!next.lastDeployment && cached.lastDeployment) {
        next.lastDeployment = cached.lastDeployment;
        restored = true;
      }
      if ((!next.recentFailure || !next.recentFailure.known) && cached.recentFailure?.known) {
        next.recentFailure = cached.recentFailure;
        restored = true;
      }
      if (next.commitSource === 'configuration' && cached.commitSource === 'deployment-history' && cached.commit) {
        next.commit = cached.commit;
        next.commitSource = 'deployment-history-cache';
        restored = true;
      }
      if (restored) next.deploymentHistoryStale = true;
      return next;
    };
    const servers = result.successes.flatMap(({ provider, overview }) => overview.servers.map(server => ({
      ...server, providerId: provider.providerId, providerLabel: provider.label
    })));
    const deployments = result.successes.flatMap(({ provider, overview }) => overview.deployments.map(resource => ({
      ...restoreCachedHistory(resource, provider.providerId), providerId: provider.providerId, providerLabel: provider.label
    })));
    // Keep the last successful snapshot for a provider that timed out or
    // temporarily rejected the request. A single unhealthy Coolify instance
    // must not erase the other instance's live data or make the whole board
    // appear empty.
    const mergeStale = (fresh, stale, key) => {
      const merged = [...fresh];
      const freshKeys = new Set(fresh.map(item => `${item.providerId}\u0000${key(item)}`));
      for (const item of stale || []) {
        if (!failedProviderIds.has(item.providerId)) continue;
        const itemKey = `${item.providerId}\u0000${key(item)}`;
        if (!freshKeys.has(itemKey)) merged.push({ ...item, stale: true });
      }
      return merged;
    };
    const mergedServers = mergeStale(servers, cachedSnapshot?.topology?.servers, item => item.nodeId || item.serverUuid || item.id || item.name);
    const mergedDeployments = mergeStale(deployments, cachedSnapshot?.topology?.deployments, item => item.resourceUuid || item.uuid || item.id || item.name);
    const staleSnapshot = failedProviderIds.size > 0;
    const snapshot = {
      state: 'ready',
      providers: result.providers,
      ...(result.providers.length === 1 ? { provider: result.providers[0] } : {}),
      topology: {
        apiVersion: 'v1',
        generatedAt: result.successes.map(item => item.overview.generatedAt).sort().at(-1) || '',
        cursor: '',
        servers: mergedServers,
        deployments: mergedDeployments,
        endpointChecks: this.endpointHealth.snapshot().checks
      },
      bindings: [],
      errors: result.errors,
      cached: staleSnapshot,
      ...(staleSnapshot ? { staleProviders: [...failedProviderIds] } : {})
    };
    snapshot.cachedAt = this._writeTopologyCache(snapshot);
    return snapshot;
  }

  checkEndpoints(values = {}) { return this.endpointHealth.start(values); }

  getEndpointChecks() {
    const snapshot = this.endpointHealth.snapshot();
    if (!snapshot.pending) {
      const cacheKey = JSON.stringify(snapshot.checks);
      if (cacheKey !== this.endpointChecksCacheKey) {
        try {
          const envelope = this._readTopologyCacheEnvelope();
          if (envelope) {
            envelope.snapshot.topology.endpointChecks = snapshot.checks;
            writeJsonAtomic(this._topologyCachePath(), envelope);
            this.endpointChecksCacheKey = cacheKey;
          }
        } catch (_) {}
      }
    }
    return snapshot;
  }

  _bindingsPath(directory) { return path.join(directory, '.gitfinder', 'deployments.json'); }

  _readBindings(directory) {
    const filePath = this._bindingsPath(directory);
    if (!fs.existsSync(filePath)) return [];
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) throw new Error('项目部署关联文件无效');
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Number(parsed.schemaVersion) !== BINDINGS_SCHEMA_VERSION || !Array.isArray(parsed.bindings)) throw new Error('项目部署关联版本不受支持');
    if (parsed.bindings.length > MAX_BINDINGS) throw new Error('项目部署关联数量超过安全上限');
    return parsed.bindings.filter(item => item.providerKind === 'coolify').map(normalizeBinding);
  }

  saveProjectBinding(directoryPath, value = {}) {
    const project = this.projectService.getProject(directoryPath);
    const provider = this._findProvider(value.providerId);
    const binding = normalizeBinding({ ...value, providerId: provider.providerId });
    const bindings = this._readBindings(project.path);
    const index = bindings.findIndex(item => item.providerId === binding.providerId && item.resourceUuid === binding.resourceUuid);
    if (index >= 0) bindings.splice(index, 1, binding);
    else bindings.push(binding);
    if (bindings.length > MAX_BINDINGS) throw new Error('项目部署关联数量超过安全上限');
    writeJsonAtomic(this._bindingsPath(project.path), { schemaVersion: BINDINGS_SCHEMA_VERSION, bindings });
    return { projectId: project.projectId, bindings };
  }

  clearProjectBindings(directoryPath) {
    const project = this.projectService.getProject(directoryPath);
    writeJsonAtomic(this._bindingsPath(project.path), { schemaVersion: BINDINGS_SCHEMA_VERSION, bindings: [] });
    return { projectId: project.projectId, bindings: [] };
  }

  getProjectBindings(directoryPath) {
    const project = this.projectService.getProject(directoryPath);
    return { projectId: project.projectId, bindings: this._readBindings(project.path).map(binding => ({ projectId: project.projectId, ...binding })) };
  }

  async getProjectDeployments(directoryPath) {
    const project = this.projectService.getProject(directoryPath);
    const providers = this.getConnections();
    const bindings = this._readBindings(project.path);
    if (!providers.length) return { state: 'unconfigured', projectId: project.projectId, providers: [], bindings, resources: [] };
    if (!bindings.length) return { state: 'unlinked', projectId: project.projectId, providers, bindings, resources: [] };
    const catalog = await this.getCatalog();
    const byKey = new Map(catalog.resources.map(resource => [`${resource.providerId}\u0000${resource.resourceUuid}`, resource]));
    const resources = [];
    const errors = [...catalog.errors];
    for (const binding of bindings) {
      const resource = byKey.get(`${binding.providerId}\u0000${binding.resourceUuid}`);
      if (resource) resources.push(resource);
      else errors.push({ providerId: binding.providerId, resourceUuid: binding.resourceUuid, message: 'Coolify 中未找到已关联资源' });
    }
    return {
      state: resources.length ? 'ready' : 'error',
      projectId: project.projectId,
      providers,
      ...(providers.length === 1 ? { provider: providers[0] } : {}),
      bindings,
      resources,
      errors
    };
  }

  resolveExternalUrl(value) {
    const normalized = normalizeExternalUrl(value, { optional: false });
    if (!this.allowedExternalUrls.has(normalized)) throw new Error('该地址不在最近一次 Coolify 只读快照中');
    return normalized;
  }
}

module.exports = {
  CoolifyProviderService,
  normalizeCoolifyBaseUrl,
  normalizeCoolifyResource,
  normalizeBinding,
  requestCoolifyJson,
  readCoolifyOverview,
  API_PREFIX,
  MAX_PROVIDERS,
  MAX_RESOURCES,
  MAX_SERVERS
};
