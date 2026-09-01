const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { repositoryKey } = require('../../shared/repositoryAssociation');
const { EndpointHealthService } = require('./endpointHealthService');

const SESSION_SCHEMA_VERSION = 1;
const TOPOLOGY_CACHE_SCHEMA_VERSION = 1;
const BINDINGS_SCHEMA_VERSION = 2;
const API_PREFIX = '/api/v1';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_PROVIDERS = 12;
const MAX_RESOURCES = 2_000;
const MAX_SERVERS = 256;
const MAX_PROJECTS = 256;
const MAX_BINDINGS = 50;
const MAX_BINDING_REPOSITORIES = 8;
const MAX_DEPLOYMENT_LOOKUPS = 100;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,179}$/i;

function cleanText(value, maximum = 240, fallback = '') {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, maximum);
}

function normalizeIdentifier(value, label, { required = true, fallback = '' } = {}) {
  const identifier = cleanText(value || fallback, 180);
  if (!identifier && !required) return '';
  if (!ID_PATTERN.test(identifier)) throw new Error(`${label} 无效`);
  return identifier;
}

function normalizeCoolifyBaseUrl(value) {
  const input = String(value || '').trim();
  if (!input || input.length > 2048 || /[\u0000-\u001f\u007f]/.test(input)) throw new Error('Coolify 地址无效');
  let parsed;
  try { parsed = new URL(input); } catch (_) { throw new Error('Coolify 地址必须是完整 URL'); }
  const hostname = parsed.hostname.toLowerCase();
  const loopback = LOOPBACK_HOSTS.has(hostname) || hostname.startsWith('127.');
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error('Coolify 必须使用 HTTPS；仅本机 localhost 允许 HTTP');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Coolify 地址不能包含凭据、查询参数或片段');
  }
  const pathname = parsed.pathname.replace(/\/+$/, '');
  if (pathname && pathname !== '/api/v1') throw new Error('Coolify 地址只填写管理站点根地址');
  return parsed.origin;
}

function normalizeToken(value) {
  const token = String(value || '').trim();
  if (token.length < 8 || token.length > 4096 || /[\u0000-\u0020\u007f]/.test(token)) {
    throw new Error('Coolify API Token 无效');
  }
  return token;
}

function normalizeTimestamp(value, fallback = '') {
  const date = new Date(value || fallback || 0);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function normalizeExternalUrl(value, { optional = true } = {}) {
  const input = cleanText(value, 2048);
  if (!input && optional) return '';
  let parsed;
  try { parsed = new URL(input); } catch (_) { throw new Error('Coolify 返回了无效跳转地址'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Coolify 返回了不安全的跳转地址');
  }
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
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

async function requestCoolifyJson(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境不支持 Coolify API 请求');
  const baseUrl = normalizeCoolifyBaseUrl(options.baseUrl);
  const pathname = String(options.pathname || '');
  if (!pathname.startsWith(`${API_PREFIX}/`) && pathname !== API_PREFIX) throw new Error('Coolify API 路径无效');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
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
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Coolify API ${pathname} 请求超时`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

async function readCoolifyOverview(options = {}) {
  const baseUrl = normalizeCoolifyBaseUrl(options.baseUrl);
  const token = normalizeToken(options.token);
  const observedAt = normalizeTimestamp(options.observedAt, new Date().toISOString());
  const get = pathname => requestCoolifyJson({ ...options, baseUrl, token, pathname });
  const endpointResults = await Promise.allSettled([
    get(`${API_PREFIX}/applications`),
    get(`${API_PREFIX}/services`),
    get(`${API_PREFIX}/databases`),
    get(`${API_PREFIX}/servers`),
    get(`${API_PREFIX}/projects`)
  ]);
  const names = ['applications', 'services', 'databases', 'servers', 'projects'];
  const values = endpointResults.map(result => result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []);
  const errors = endpointResults.flatMap((result, index) => result.status === 'rejected'
    ? [{ kind: names[index], message: result.reason?.message || String(result.reason) }]
    : []);
  if (endpointResults.slice(0, 4).every(result => result.status === 'rejected')) {
    throw endpointResults[0].reason;
  }
  const [applications, services, databases, rawServers, rawProjects] = values;
  if (applications.length + services.length + databases.length > MAX_RESOURCES) throw new Error(`Coolify 资源数量超过 ${MAX_RESOURCES} 个的安全上限`);
  if (rawServers.length > MAX_SERVERS) throw new Error(`Coolify 服务器数量超过 ${MAX_SERVERS} 个的安全上限`);
  if (rawProjects.length > MAX_PROJECTS) throw new Error(`Coolify 项目数量超过 ${MAX_PROJECTS} 个的安全上限`);

  // A GitHub App stores owner/repo separately from its (possibly enterprise) host.
  // Resolve only its explicit source identity; never infer the host from a name.
  const needsGithubSource = resource => resource.source_type === 'App\\Models\\GithubApp' && resource.source_id != null
    && ![resource.git_full_url, resource.git_repository, resource.repository].some(repositoryKey);
  const [projectDetails, sourceHosts] = await Promise.all([
    mapWithConcurrency(rawProjects, 4, project => get(`${API_PREFIX}/projects/${encodeURIComponent(project.uuid)}`)),
    applications.some(needsGithubSource) ? get(`${API_PREFIX}/github-apps`).then(sources => new Map(
      (Array.isArray(sources) ? sources : []).map(source => [String(source.id), cleanText(source.html_url, 1000)])
    )).catch(error => {
      errors.push({ kind: 'repository-source', message: error.message });
      return new Map();
    }) : new Map()
  ]);
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

  const deploymentResults = await mapWithConcurrency(applications.slice(0, MAX_DEPLOYMENT_LOOKUPS), 4, application => (
    get(`${API_PREFIX}/deployments/applications/${encodeURIComponent(application.uuid)}?skip=0&take=1`)
  ));
  const deploymentByApplication = new Map();
  deploymentResults.forEach((result, index) => {
    const application = applications[index];
    if (result.status === 'fulfilled') deploymentByApplication.set(String(application.uuid), deploymentFacts(result.value, observedAt));
    else errors.push({ kind: 'deployment', resourceUuid: String(application.uuid), message: result.reason?.message || String(result.reason) });
  });

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
  return { generatedAt: observedAt, servers, deployments: resources, errors };
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
    this._writeJsonAtomic(this._topologyCachePath(), {
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
    this._writeJsonAtomic(filePath, { ...envelope, snapshot });
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
    this._writeJsonAtomic(this._associationsPath(), { version: 1, associations });
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

  _writeJsonAtomic(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let handle = null;
    try {
      handle = fs.openSync(temporaryPath, 'wx', 0o600);
      fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = null;
      fs.renameSync(temporaryPath, filePath);
    } finally {
      if (handle !== null) try { fs.closeSync(handle); } catch (_) {}
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    }
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
    if (values.length) this._writeJsonAtomic(this._sessionPath(), { schemaVersion: SESSION_SCHEMA_VERSION, providers: values });
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
    this._saveProviders(providers);
    if (baseUrl !== current.baseUrl) {
      this.endpointHealth.setTargets(provider.providerId, []);
      this._retainCachedProviders(providers.filter(item => item.providerId !== provider.providerId).map(item => item.providerId));
    }
    this.allowedExternalUrls.clear();
    return this._publicConnection(provider);
  }

  disconnect(providerId = '') {
    const remaining = providerId ? this._loadProviders().filter(item => item.providerId !== providerId) : [];
    this._saveProviders(remaining);
    this._retainCachedProviders(remaining.map(item => item.providerId));
    this.endpointHealth.retainProviders(remaining.map(item => item.providerId));
    this.allowedExternalUrls.clear();
    return remaining.map(provider => this._publicConnection(provider));
  }

  async _overview(provider) {
    const overview = await readCoolifyOverview({
      baseUrl: provider.baseUrl,
      token: provider.accessToken,
      fetchImpl: this.fetchImpl,
      observedAt: new Date(this.now()).toISOString()
    });
    for (const value of [provider.baseUrl, ...overview.servers.flatMap(server => [server.coolifyUrl]), ...overview.deployments.flatMap(resource => [resource.coolifyUrl, ...resource.domains])]) {
      if (value) this.allowedExternalUrls.add(value);
    }
    return overview;
  }

  async _aggregate(providerId = '') {
    const providers = providerId ? [this._findProvider(providerId)] : this._loadProviders();
    if (!providers.length) return { state: 'unconfigured', providers: [], successes: [], errors: [] };
    const settled = await Promise.allSettled(providers.map(async provider => ({ provider, overview: await this._overview(provider) })));
    const successes = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
    const errors = settled.flatMap((result, index) => result.status === 'rejected'
      ? [{ providerId: providers[index].providerId, label: providers[index].label, message: result.reason?.message || String(result.reason) }]
      : []);
    return {
      state: successes.length ? 'ready' : 'error',
      providers: providers.map(provider => this._publicConnection(provider)),
      successes,
      errors
    };
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

  async getTopology() {
    const result = await this._aggregate();
    const currentProviders = this._loadProviders();
    this.endpointHealth.retainProviders(currentProviders.map(item => item.providerId));
    for (const { provider, overview } of result.successes) {
      if (!currentProviders.some(current => current.providerId === provider.providerId && current.baseUrl === provider.baseUrl)) continue;
      this.endpointHealth.setTargets(provider.providerId, overview.deployments.flatMap(resource => resource.domains));
    }
    const empty = { apiVersion: 'v1', generatedAt: '', cursor: '', servers: [], deployments: [] };
    if (result.state === 'unconfigured') return { state: 'unconfigured', providers: [], topology: empty, bindings: [], cached: false };
    if (!result.successes.length) return { state: 'error', providers: result.providers, topology: empty, bindings: [], errors: result.errors, cached: false };
    const servers = result.successes.flatMap(({ provider, overview }) => overview.servers.map(server => ({
      ...server, providerId: provider.providerId, providerLabel: provider.label
    })));
    const deployments = result.successes.flatMap(({ provider, overview }) => overview.deployments.map(resource => ({
      ...resource, providerId: provider.providerId, providerLabel: provider.label
    })));
    const snapshot = {
      state: 'ready',
      providers: result.providers,
      ...(result.providers.length === 1 ? { provider: result.providers[0] } : {}),
      topology: {
        apiVersion: 'v1',
        generatedAt: result.successes.map(item => item.overview.generatedAt).sort().at(-1) || '',
        cursor: '',
        servers,
        deployments,
        endpointChecks: this.endpointHealth.snapshot().checks
      },
      bindings: [],
      errors: result.errors,
      cached: false
    };
    snapshot.cachedAt = this._writeTopologyCache(snapshot);
    return snapshot;
  }

  checkEndpoints(values = {}) { return this.endpointHealth.start(values); }

  getEndpointChecks() { return this.endpointHealth.snapshot(); }

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
    this._writeJsonAtomic(this._bindingsPath(project.path), { schemaVersion: BINDINGS_SCHEMA_VERSION, bindings });
    return { projectId: project.projectId, bindings };
  }

  clearProjectBindings(directoryPath) {
    const project = this.projectService.getProject(directoryPath);
    this._writeJsonAtomic(this._bindingsPath(project.path), { schemaVersion: BINDINGS_SCHEMA_VERSION, bindings: [] });
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
