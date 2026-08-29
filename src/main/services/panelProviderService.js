const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SESSION_SCHEMA_VERSION = 2;
const SINGLE_SESSION_SCHEMA_VERSION = 1;
const LEGACY_PROVIDER_SCHEMA_VERSION = 1;
const BINDINGS_SCHEMA_VERSION = 2;
const API_MAJOR_VERSION = 1;
const API_PREFIX = '/api/gitfinder/v1';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CATALOG_RESOURCES = 2_000;
const MAX_TOPOLOGY_SERVERS = 256;
const MAX_TOPOLOGY_DEPLOYMENTS = 2_000;
const MAX_PROJECT_BINDINGS = 50;
const MAX_BINDING_REPOSITORIES = 8;
const MAX_PANEL_PROVIDERS = 12;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,179}$/i;

function cleanText(value, maximum = 240, fallback = '') {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, maximum);
}

function normalizeIdentifier(value, label, { required = true } = {}) {
  const identifier = cleanText(value, 180);
  if (!identifier && !required) return '';
  if (!ID_PATTERN.test(identifier)) throw new Error(`${label} 无效`);
  return identifier;
}

function normalizeBaseUrl(value) {
  const input = String(value || '').trim();
  if (!input || input.length > 2048 || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new Error('Panel 地址无效');
  }
  let parsed;
  try {
    parsed = new URL(input);
  } catch (_) {
    throw new Error('Panel 地址必须是完整 URL');
  }
  const hostname = parsed.hostname.toLowerCase();
  const loopback = LOOPBACK_HOSTS.has(hostname) || hostname.startsWith('127.');
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error('Panel 必须使用 HTTPS；仅本机 localhost 允许 HTTP');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Panel 地址不能包含凭据、查询参数或片段');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('Panel 地址只填写站点根地址');
  }
  return parsed.origin;
}

function normalizeToken(value) {
  const token = String(value || '').trim();
  if (token.length < 8 || token.length > 4096 || /[\u0000-\u0020\u007f]/.test(token)) {
    throw new Error('Panel 访问令牌无效');
  }
  return token;
}

function normalizeApiVersion(value) {
  const version = cleanText(value, 24);
  const match = version.match(/^(\d+)\.(\d+)(?:\.\d+)?(?:-[a-z0-9.-]+)?$/i);
  if (!match || Number(match[1]) !== API_MAJOR_VERSION) {
    throw new Error(`Panel API 版本不兼容：${version || '未知'}`);
  }
  return version;
}

function normalizeUrl(value, { optional = true } = {}) {
  const input = cleanText(value, 2048);
  if (!input && optional) return '';
  let parsed;
  try { parsed = new URL(input); } catch (_) { throw new Error('Panel 返回了无效跳转地址'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Panel 返回了不安全的跳转地址');
  }
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeDomains(value) {
  const source = Array.isArray(value) ? value : [];
  const domains = [];
  const seen = new Set();
  for (const item of source.slice(0, 20)) {
    const candidate = cleanText(item, 320);
    if (!candidate) continue;
    let normalized = candidate;
    try {
      const parsed = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) continue;
      parsed.search = '';
      parsed.hash = '';
      normalized = parsed.toString().replace(/\/$/, '');
    } catch (_) {
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      domains.push(normalized);
    }
  }
  return domains;
}

function normalizeTimestamp(value, label, { optional = false } = {}) {
  if ((value === null || value === undefined || value === '') && optional) return null;
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) throw new Error(`Panel ${label}缺少有效时间`);
  return date.toISOString();
}

function normalizeLatency(value) {
  if (value === null || value === undefined || value === '') return null;
  const latency = Number(value);
  if (!Number.isFinite(latency) || latency < 0 || latency > 600_000) {
    throw new Error('Panel 返回了无效延迟');
  }
  return Math.round(latency * 100) / 100;
}

function normalizeDeploymentAttempt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    deploymentUuid: normalizeIdentifier(value.deploymentUuid, '部署事件 ID'),
    status: cleanText(value.status, 80, 'unknown').toLowerCase(),
    success: Boolean(value.success),
    createdAt: normalizeTimestamp(value.createdAt, '部署创建时间'),
    updatedAt: normalizeTimestamp(value.updatedAt || value.finishedAt || value.createdAt, '部署更新时间'),
    finishedAt: normalizeTimestamp(value.finishedAt, '部署完成时间', { optional: true }),
    branch: cleanText(value.branch, 240),
    commit: cleanText(value.commit, 160),
    message: cleanText(value.message, 500)
  };
}

function normalizeRecentFailure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.hasFailure !== true) {
    return { hasFailure: false, occurredAt: null, deploymentUuid: '', message: '', recoveredAt: null };
  }
  return {
    hasFailure: true,
    occurredAt: normalizeTimestamp(value.occurredAt, '最近失败时间'),
    deploymentUuid: normalizeIdentifier(value.deploymentUuid, '失败部署 ID', { required: false }),
    message: cleanText(value.message, 500),
    recoveredAt: normalizeTimestamp(value.recoveredAt, '恢复时间', { optional: true })
  };
}

function normalizeServer(value = {}) {
  return {
    nodeId: normalizeIdentifier(value.nodeId, '节点 ID'),
    name: cleanText(value.name, 160, '未命名服务器'),
    status: cleanText(value.status, 80, 'unknown').toLowerCase(),
    environmentName: cleanText(value.environmentName, 120),
    observedAt: normalizeTimestamp(value.observedAt || value.updatedAt, '服务器观测时间'),
    lastSeenAt: normalizeTimestamp(value.lastSeenAt || value.observedAt || value.updatedAt, '服务器最后在线时间'),
    latencyMs: normalizeLatency(value.latencyMs),
    resourceCount: Math.max(0, Math.min(20_000, Number.isInteger(Number(value.resourceCount)) ? Number(value.resourceCount) : 0)),
    panelUrl: normalizeUrl(value.panelUrl)
  };
}

function normalizeResource(value = {}) {
  return {
    resourceUuid: normalizeIdentifier(value.resourceUuid, '资源 ID'),
    nodeId: normalizeIdentifier(value.nodeId, '节点 ID'),
    projectUuid: normalizeIdentifier(value.projectUuid, 'Panel 项目 ID'),
    environmentUuid: normalizeIdentifier(value.environmentUuid, '环境 ID'),
    name: cleanText(value.name, 160, '未命名资源'),
    type: cleanText(value.type, 80, 'resource'),
    status: cleanText(value.status, 80, 'unknown').toLowerCase(),
    serverName: cleanText(value.serverName || value.server?.name, 160, '未知服务器'),
    projectName: cleanText(value.projectName, 160),
    environmentName: cleanText(value.environmentName, 120, '默认环境'),
    domains: normalizeDomains(value.domains),
    latencyMs: normalizeLatency(value.latencyMs),
    latencyKind: cleanText(value.latencyKind, 40).toLowerCase(),
    branch: cleanText(value.branch, 240),
    commit: cleanText(value.commit, 160),
    imageReference: cleanText(value.imageReference, 500),
    imageDigest: cleanText(value.imageDigest, 240),
    lastDeployment: normalizeDeploymentAttempt(value.lastDeployment),
    recentFailure: normalizeRecentFailure(value.recentFailure),
    panelUrl: normalizeUrl(value.panelUrl),
    coolifyUrl: normalizeUrl(value.coolifyUrl),
    observedAt: normalizeTimestamp(value.observedAt || value.updatedAt, '资源观测时间')
  };
}

function normalizeTopology(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Panel Topology 响应格式无效');
  }
  const apiVersion = normalizeApiVersion(value.apiVersion);
  if (!Array.isArray(value.servers) || !Array.isArray(value.deployments)) {
    throw new Error('Panel Topology 缺少服务器或部署列表');
  }
  if (value.servers.length > MAX_TOPOLOGY_SERVERS) {
    throw new Error(`Panel Topology 服务器数量超过 ${MAX_TOPOLOGY_SERVERS} 个的安全上限`);
  }
  if (value.deployments.length > MAX_TOPOLOGY_DEPLOYMENTS) {
    throw new Error(`Panel Topology 部署数量超过 ${MAX_TOPOLOGY_DEPLOYMENTS} 个的安全上限`);
  }
  return {
    apiVersion,
    generatedAt: normalizeTimestamp(value.generatedAt || value.observedAt, '拓扑生成时间'),
    cursor: cleanText(value.cursor, 500),
    servers: value.servers.map(normalizeServer),
    deployments: value.deployments.map(normalizeResource)
  };
}

function normalizeCapabilities(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Panel Capabilities 响应格式无效');
  }
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities.map(item => cleanText(item, 80)).filter(Boolean).slice(0, 50)
    : [];
  for (const required of ['catalog:read', 'snapshots:read']) {
    if (!capabilities.includes(required)) throw new Error(`Panel 缺少只读能力：${required}`);
  }
  const providerKind = cleanText(value.providerKind, 80, 'xiangshu-panel');
  if (providerKind !== 'xiangshu-panel') throw new Error(`不支持的 Panel Provider：${providerKind}`);
  return {
    apiVersion: normalizeApiVersion(value.apiVersion),
    providerKind,
    capabilities
  };
}

function normalizeCatalog(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Panel Catalog 响应格式无效');
  }
  const apiVersion = normalizeApiVersion(value.apiVersion);
  if (!Array.isArray(value.resources)) throw new Error('Panel Catalog 缺少资源列表');
  if (value.resources.length > MAX_CATALOG_RESOURCES) {
    throw new Error(`Panel Catalog 超过 ${MAX_CATALOG_RESOURCES} 个资源的安全上限`);
  }
  return { apiVersion, resources: value.resources.map(normalizeResource) };
}

function normalizeBinding(value = {}) {
  const repositoryRelativePath = cleanText(value.repositoryRelativePath, 600);
  if (repositoryRelativePath && (
    path.posix.isAbsolute(repositoryRelativePath)
    || /^[a-z]:\//i.test(repositoryRelativePath.replace(/\\/g, '/'))
    || path.posix.normalize(repositoryRelativePath.replace(/\\/g, '/')) === '..'
    || path.posix.normalize(repositoryRelativePath.replace(/\\/g, '/')).startsWith('../')
  )) throw new Error('关联仓库必须使用项目内相对路径');
  const repositoryIdsInput = Array.isArray(value.repositoryIds) ? value.repositoryIds : [];
  if (repositoryIdsInput.length > MAX_BINDING_REPOSITORIES) {
    throw new Error(`一个部署最多关联 ${MAX_BINDING_REPOSITORIES} 个仓库`);
  }
  const repositoryIds = [...new Set(repositoryIdsInput.map(item => normalizeIdentifier(item, '仓库 ID')))];
  const primaryRepositoryId = normalizeIdentifier(value.primaryRepositoryId, '主仓库 ID', { required: false });
  if (primaryRepositoryId && !repositoryIds.includes(primaryRepositoryId)) {
    throw new Error('主仓库必须包含在关联仓库列表中');
  }
  return {
    providerKind: 'xiangshu-panel',
    providerId: normalizeIdentifier(value.providerId, 'Provider ID'),
    nodeId: normalizeIdentifier(value.nodeId, '节点 ID'),
    projectUuid: normalizeIdentifier(value.projectUuid, 'Panel 项目 ID'),
    environmentUuid: normalizeIdentifier(value.environmentUuid, '环境 ID'),
    resourceUuid: normalizeIdentifier(value.resourceUuid, '资源 ID'),
    repositoryIds,
    ...(primaryRepositoryId ? { primaryRepositoryId } : {}),
    ...(repositoryRelativePath ? { repositoryRelativePath: path.posix.normalize(repositoryRelativePath.replace(/\\/g, '/')) } : {})
  };
}

function safeHttpError(status) {
  if (status === 401) return 'Panel 拒绝了访问令牌';
  if (status === 403) return 'Panel 凭据没有所需的只读权限';
  if (status === 404) return 'Panel 尚未提供 GitFinder API';
  if (status === 429) return 'Panel 请求过于频繁，请稍后重试';
  return `Panel API 返回 HTTP ${status}`;
}

async function requestJson(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('当前运行环境不支持安全的 Panel 请求');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(options.url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizeToken(options.token)}`,
        'User-Agent': 'GitFinder-2-Panel-Read-Only/1'
      },
      redirect: 'error',
      signal: controller.signal
    });
    if (!response?.ok) throw new Error(safeHttpError(Number(response?.status || 0)));
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) throw new Error('Panel API 未返回 JSON');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > (options.maxBytes || MAX_RESPONSE_BYTES)) {
      throw new Error('Panel API 响应超过 2 MB 安全限制');
    }
    try { return JSON.parse(bytes.toString('utf8')); } catch (_) { throw new Error('Panel API 返回了无效 JSON'); }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('连接 Panel 超时');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

class PanelProviderService {
  constructor(options = {}) {
    this.app = options.app;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.projectService = options.projectService;
    this.now = options.now || (() => new Date());
    this.configDirectory = options.configDirectory || null;
    this.providers = null;
    this.allowedExternalUrls = new Set();
  }

  _configDirectory() {
    const directory = this.configDirectory || this.app?.getPath?.('userData');
    if (!directory) throw new Error('无法确定 Panel 本机配置目录');
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }

  _sessionPath() {
    return path.join(this._configDirectory(), 'panel-session.json');
  }

  _legacyConfigPath() {
    return path.join(this._configDirectory(), 'panel-provider.json');
  }

  _writeJsonAtomic(filePath, value) {
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
      if (handle !== null) {
        try { fs.closeSync(handle); } catch (_) {}
      }
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
    }
  }

  _normalizeStoredProvider(value = {}, { legacy = false } = {}) {
    const baseUrl = normalizeBaseUrl(value.baseUrl);
    const accessToken = legacy || !value.accessToken ? '' : normalizeToken(value.accessToken);
    return {
      providerId: normalizeIdentifier(value.providerId, 'Provider ID'),
      providerKind: 'xiangshu-panel',
      label: cleanText(value.label, 120, new URL(baseUrl).hostname),
      baseUrl,
      accessToken,
      apiVersion: normalizeApiVersion(value.apiVersion),
      capabilities: Array.isArray(value.capabilities) ? value.capabilities.slice(0, 50) : [],
      connectedAt: cleanText(value.connectedAt, 64),
      reconnectRequired: legacy || Boolean(value.reconnectRequired),
      credentialStorage: legacy ? 'legacy-keychain' : 'app-session'
    };
  }

  _loadProviders() {
    if (this.providers) return this.providers;
    const filePath = this._sessionPath();
    if (!fs.existsSync(filePath)) {
      const legacy = this._loadLegacyProvider();
      this.providers = legacy ? [legacy] : [];
      return this.providers;
    }
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) {
      throw new Error('Panel 本机会话文件无效');
    }
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      throw new Error('Panel 本机会话文件权限过宽，请重新连接');
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const schemaVersion = Number(parsed.schemaVersion);
    const source = schemaVersion === SINGLE_SESSION_SCHEMA_VERSION && parsed.provider
      ? [parsed.provider]
      : parsed.providers;
    if (![SINGLE_SESSION_SCHEMA_VERSION, SESSION_SCHEMA_VERSION].includes(schemaVersion) || !Array.isArray(source)) {
      throw new Error('Panel 本机会话版本不受支持');
    }
    if (source.length > MAX_PANEL_PROVIDERS) throw new Error(`Panel 地址数量超过 ${MAX_PANEL_PROVIDERS} 个的安全上限`);
    const seen = new Set();
    this.providers = source.map(provider => this._normalizeStoredProvider(provider, {
      legacy: !provider.accessToken && provider.reconnectRequired === true
    })).filter(provider => {
      if (seen.has(provider.providerId)) return false;
      seen.add(provider.providerId);
      return true;
    });
    if (schemaVersion === SINGLE_SESSION_SCHEMA_VERSION) this._saveProviders(this.providers);
    return this.providers;
  }

  _loadLegacyProvider() {
    const filePath = this._legacyConfigPath();
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) {
      throw new Error('旧版 Panel 本机配置文件无效');
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Number(parsed.schemaVersion) !== LEGACY_PROVIDER_SCHEMA_VERSION || !parsed.provider) {
      throw new Error('旧版 Panel 本机配置版本不受支持');
    }
    return this._normalizeStoredProvider(parsed.provider, { legacy: true });
  }

  _saveProviders(providers = []) {
    const values = Array.isArray(providers) ? providers.slice(0, MAX_PANEL_PROVIDERS) : [];
    if (values.length) {
      this._writeJsonAtomic(this._sessionPath(), { schemaVersion: SESSION_SCHEMA_VERSION, providers: values });
    } else if (fs.existsSync(this._sessionPath())) {
      fs.rmSync(this._sessionPath(), { force: true });
    }
    this.providers = values;
    return values;
  }

  _findProvider(providerId = '', { requireCredential = false } = {}) {
    const providers = this._loadProviders();
    const normalizedId = cleanText(providerId, 180);
    const provider = normalizedId
      ? providers.find(candidate => candidate.providerId === normalizedId)
      : (providers.find(candidate => candidate.accessToken) || providers[0]);
    if (!provider) throw new Error('尚未连接 Xiangshu Panel');
    if (requireCredential && !provider.accessToken) throw new Error('旧版钥匙串凭据不会读取，请重新连接 Panel');
    return provider;
  }

  _publicConnection(provider = null) {
    if (!provider) return { configured: false, credentialAvailable: false };
    const configured = Boolean(provider.accessToken);
    return {
      configured,
      providerId: provider.providerId,
      providerKind: provider.providerKind,
      label: provider.label,
      baseUrl: provider.baseUrl,
      apiVersion: provider.apiVersion,
      capabilities: [...provider.capabilities],
      connectedAt: provider.connectedAt,
      credentialAvailable: configured,
      credentialStorage: provider.credentialStorage || 'app-session',
      reconnectRequired: Boolean(provider.reconnectRequired)
    };
  }

  getConnections() {
    return this._loadProviders().map(provider => this._publicConnection(provider));
  }

  getConnection(providerId = '') {
    const providers = this._loadProviders();
    const provider = providerId
      ? providers.find(candidate => candidate.providerId === providerId)
      : (providers.find(candidate => candidate.accessToken) || providers[0]);
    return this._publicConnection(provider || null);
  }

  async _get(pathname, provider) {
    if (!provider) throw new Error('尚未连接 Xiangshu Panel');
    if (!provider.accessToken) throw new Error('旧版钥匙串凭据不会读取，请重新连接 Panel');
    const url = new URL(`${API_PREFIX}${pathname}`, provider.baseUrl);
    return requestJson({ url, token: normalizeToken(provider.accessToken), fetchImpl: this.fetchImpl });
  }

  async connect(values = {}) {
    const baseUrl = normalizeBaseUrl(values.baseUrl);
    const label = cleanText(values.label, 120, new URL(baseUrl).hostname);
    const token = normalizeToken(values.token);
    const capabilities = normalizeCapabilities(await requestJson({
      url: new URL(`${API_PREFIX}/capabilities`, baseUrl),
      token,
      fetchImpl: this.fetchImpl
    }));
    const connectedAt = new Date(this.now()).toISOString();
    const providerId = `panel_${crypto.createHash('sha256').update(baseUrl).digest('hex').slice(0, 24)}`;
    const provider = {
      providerId,
      providerKind: 'xiangshu-panel',
      label,
      baseUrl,
      accessToken: token,
      apiVersion: capabilities.apiVersion,
      capabilities: capabilities.capabilities,
      connectedAt,
      credentialStorage: 'app-session'
    };
    const providers = this._loadProviders();
    const existingIndex = providers.findIndex(candidate => candidate.providerId === providerId);
    if (existingIndex < 0 && providers.length >= MAX_PANEL_PROVIDERS) {
      throw new Error(`最多添加 ${MAX_PANEL_PROVIDERS} 个 Panel 地址`);
    }
    const updated = [...providers];
    if (existingIndex >= 0) updated.splice(existingIndex, 1, provider);
    else updated.push(provider);
    this._saveProviders(updated);
    const legacyPath = this._legacyConfigPath();
    if (fs.existsSync(legacyPath)) fs.rmSync(legacyPath, { force: true });
    return this._publicConnection(provider);
  }

  disconnect(providerId = '') {
    const providers = this._loadProviders();
    const normalizedId = cleanText(providerId, 180);
    const remaining = normalizedId
      ? providers.filter(provider => provider.providerId !== normalizedId)
      : [];
    this._saveProviders(remaining);
    const legacyPath = this._legacyConfigPath();
    if (fs.existsSync(legacyPath)) fs.rmSync(legacyPath, { force: true });
    this.allowedExternalUrls.clear();
    return remaining.map(provider => this._publicConnection(provider));
  }

  async getCatalog(providerId = '') {
    const providers = providerId
      ? [this._findProvider(providerId, { requireCredential: true })]
      : this._loadProviders().filter(provider => provider.accessToken);
    if (!providers.length) throw new Error('尚未连接可用的 Xiangshu Panel');
    const settled = await Promise.allSettled(providers.map(async provider => {
      const catalog = normalizeCatalog(await this._get('/catalog', provider));
      const resources = catalog.resources.map(resource => ({
        ...resource,
        providerId: provider.providerId,
        providerLabel: provider.label
      }));
      for (const resource of resources) this._rememberExternalUrls(resource);
      return { provider, catalog, resources };
    }));
    const successes = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
    if (!successes.length) throw settled[0]?.reason || new Error('无法读取 Panel Catalog');
    return {
      apiVersion: successes[0].catalog.apiVersion,
      resources: successes.flatMap(result => result.resources),
      providers: successes.map(result => this._publicConnection(result.provider)),
      errors: settled.flatMap((result, index) => result.status === 'rejected'
        ? [{ providerId: providers[index].providerId, label: providers[index].label, message: result.reason?.message || String(result.reason) }]
        : []),
      ...(successes.length === 1 ? { provider: this._publicConnection(successes[0].provider) } : {})
    };
  }

  _bindingsPath(directory) {
    return path.join(directory, '.gitfinder', 'deployments.json');
  }

  _readBindings(directory) {
    const filePath = this._bindingsPath(directory);
    if (!fs.existsSync(filePath)) return [];
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) {
      throw new Error('项目部署关联文件无效');
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (![1, BINDINGS_SCHEMA_VERSION].includes(Number(parsed.schemaVersion)) || !Array.isArray(parsed.bindings)) {
      throw new Error('项目部署关联版本不受支持');
    }
    if (parsed.bindings.length > MAX_PROJECT_BINDINGS) throw new Error('项目部署关联数量超过安全上限');
    return parsed.bindings.map(normalizeBinding);
  }

  saveProjectBinding(directoryPath, value = {}) {
    const project = this.projectService.getProject(directoryPath);
    const connectedProviders = this._loadProviders().filter(provider => provider.accessToken);
    const requestedProviderId = cleanText(value.providerId, 180);
    if (!requestedProviderId && connectedProviders.length > 1) throw new Error('请选择部署资源所属的 Panel');
    const provider = this._findProvider(requestedProviderId || connectedProviders[0]?.providerId, { requireCredential: true });
    const binding = normalizeBinding({ ...value, providerId: provider.providerId });
    const filePath = this._bindingsPath(project.path);
    const bindings = this._readBindings(project.path);
    const replacementIndex = bindings.findIndex(candidate => (
      candidate.providerId === binding.providerId && candidate.resourceUuid === binding.resourceUuid
    ));
    if (replacementIndex >= 0) bindings.splice(replacementIndex, 1, binding);
    else bindings.push(binding);
    if (bindings.length > MAX_PROJECT_BINDINGS) throw new Error('项目部署关联数量超过安全上限');
    this._writeJsonAtomic(filePath, { schemaVersion: BINDINGS_SCHEMA_VERSION, bindings });
    return { projectId: project.projectId, bindings };
  }

  clearProjectBindings(directoryPath) {
    const project = this.projectService.getProject(directoryPath);
    const filePath = this._bindingsPath(project.path);
    this._writeJsonAtomic(filePath, { schemaVersion: BINDINGS_SCHEMA_VERSION, bindings: [] });
    return { projectId: project.projectId, bindings: [] };
  }

  async getProjectDeployments(directoryPath) {
    const project = this.projectService.getProject(directoryPath);
    const providers = this._loadProviders();
    const bindings = this._readBindings(project.path);
    const publicProviders = providers.map(provider => this._publicConnection(provider));
    if (!providers.length) {
      return { state: 'unconfigured', projectId: project.projectId, providers: [], bindings, resources: [] };
    }
    if (!bindings.length) {
      return { state: 'unlinked', projectId: project.projectId, providers: publicProviders, bindings, resources: [] };
    }
    const providerById = new Map(providers.map(provider => [provider.providerId, provider]));
    const settled = await Promise.allSettled(bindings.map(async binding => {
      const provider = providerById.get(binding.providerId);
      if (!provider) throw new Error(`关联的 Panel 已移除：${binding.providerId}`);
      if (!provider.accessToken) throw new Error(`Panel 需要重新连接：${provider.label}`);
      const raw = await this._get(`/snapshot?resourceUuid=${encodeURIComponent(binding.resourceUuid)}`, provider);
      normalizeApiVersion(raw?.apiVersion);
      const resource = normalizeResource(raw?.resource || raw);
      if (resource.resourceUuid !== binding.resourceUuid) throw new Error('Panel 返回了不匹配的资源身份');
      this._rememberExternalUrls(resource);
      return { ...resource, providerId: provider.providerId, providerLabel: provider.label };
    }));
    const resources = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
    const errors = settled.flatMap((result, index) => result.status === 'rejected'
      ? [{ providerId: bindings[index].providerId, resourceUuid: bindings[index].resourceUuid, message: result.reason?.message || String(result.reason) }]
      : []);
    const state = resources.length
      ? 'ready'
      : (providers.some(provider => !provider.accessToken) ? 'reauthentication-required' : 'error');
    return {
      state,
      projectId: project.projectId,
      providers: publicProviders,
      ...(publicProviders.length === 1 ? { provider: publicProviders[0] } : {}),
      bindings,
      resources,
      errors
    };
  }

  async getTopology() {
    const providers = this._loadProviders();
    const publicProviders = providers.map(provider => this._publicConnection(provider));
    const emptyTopology = { apiVersion: '1.0', generatedAt: '', cursor: '', servers: [], deployments: [] };
    if (!providers.length) return { state: 'unconfigured', providers: [], topology: emptyTopology, bindings: [] };
    const connected = providers.filter(provider => provider.accessToken);
    if (!connected.length) {
      return { state: 'reauthentication-required', providers: publicProviders, topology: emptyTopology, bindings: [] };
    }
    const supported = connected.filter(provider => provider.capabilities.includes('topology:read'));
    if (!supported.length) {
      return { state: 'unsupported', providers: publicProviders, topology: emptyTopology, bindings: [] };
    }
    const settled = await Promise.allSettled(supported.map(async provider => ({
      provider,
      topology: normalizeTopology(await this._get('/topology', provider))
    })));
    const successes = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
    const errors = settled.flatMap((result, index) => result.status === 'rejected'
      ? [{ providerId: supported[index].providerId, label: supported[index].label, message: result.reason?.message || String(result.reason) }]
      : []);
    if (!successes.length) {
      return { state: 'error', providers: publicProviders, topology: emptyTopology, bindings: [], errors };
    }
    const servers = successes.flatMap(({ provider, topology }) => topology.servers.map(server => ({
      ...server,
      providerId: provider.providerId,
      providerLabel: provider.label
    })));
    const deployments = successes.flatMap(({ provider, topology }) => topology.deployments.map(deployment => ({
      ...deployment,
      providerId: provider.providerId,
      providerLabel: provider.label
    })));
    for (const server of servers) this._rememberExternalUrls(server);
    for (const deployment of deployments) this._rememberExternalUrls(deployment);
    const generatedAt = successes.map(result => result.topology.generatedAt).filter(Boolean).sort().at(-1) || '';
    return {
      state: 'ready',
      providers: publicProviders,
      ...(publicProviders.length === 1 ? { provider: publicProviders[0] } : {}),
      topology: {
        apiVersion: successes[0].topology.apiVersion,
        generatedAt,
        cursor: '',
        servers,
        deployments
      },
      bindings: [],
      errors
    };
  }

  getProjectBindings(directoryPath) {
    const project = this.projectService.getProject(directoryPath);
    const bindings = this._readBindings(project.path)
      .map(binding => ({ projectId: project.projectId, ...binding }));
    return { projectId: project.projectId, bindings };
  }

  _rememberExternalUrls(resource) {
    for (const value of [resource.panelUrl, resource.coolifyUrl, ...(Array.isArray(resource.domains) ? resource.domains : [])]) {
      if (value) this.allowedExternalUrls.add(value);
    }
  }

  resolveExternalUrl(value) {
    const normalized = normalizeUrl(value, { optional: false });
    if (!this.allowedExternalUrls.has(normalized)) throw new Error('该地址不在最近一次 Panel 只读快照中');
    return normalized;
  }
}

module.exports = {
  PanelProviderService,
  normalizeBaseUrl,
  normalizeCapabilities,
  normalizeCatalog,
  normalizeTopology,
  normalizeServer,
  normalizeResource,
  normalizeBinding,
  requestJson,
  API_PREFIX,
  REQUEST_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  MAX_CATALOG_RESOURCES,
  MAX_TOPOLOGY_SERVERS,
  MAX_TOPOLOGY_DEPLOYMENTS,
  MAX_BINDING_REPOSITORIES,
  MAX_PROJECT_BINDINGS,
  MAX_PANEL_PROVIDERS
};
