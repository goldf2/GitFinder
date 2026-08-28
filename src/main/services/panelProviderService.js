const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROVIDER_SCHEMA_VERSION = 1;
const BINDINGS_SCHEMA_VERSION = 1;
const API_MAJOR_VERSION = 1;
const API_PREFIX = '/api/gitfinder/v1';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CATALOG_RESOURCES = 2_000;
const MAX_PROJECT_BINDINGS = 50;
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

function normalizeResource(value = {}) {
  const observedAt = new Date(value.observedAt || value.updatedAt || 0);
  if (!Number.isFinite(observedAt.getTime())) throw new Error('Panel 资源缺少有效观测时间');
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
    panelUrl: normalizeUrl(value.panelUrl),
    coolifyUrl: normalizeUrl(value.coolifyUrl),
    observedAt: observedAt.toISOString()
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
  return {
    providerKind: 'xiangshu-panel',
    providerId: normalizeIdentifier(value.providerId, 'Provider ID'),
    nodeId: normalizeIdentifier(value.nodeId, '节点 ID'),
    projectUuid: normalizeIdentifier(value.projectUuid, 'Panel 项目 ID'),
    environmentUuid: normalizeIdentifier(value.environmentUuid, '环境 ID'),
    resourceUuid: normalizeIdentifier(value.resourceUuid, '资源 ID'),
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
    this.safeStorage = options.safeStorage;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.projectService = options.projectService;
    this.now = options.now || (() => new Date());
    this.configDirectory = options.configDirectory || null;
    this.provider = null;
    this.allowedExternalUrls = new Set();
  }

  _configPath() {
    const directory = this.configDirectory || this.app?.getPath?.('userData');
    if (!directory) throw new Error('无法确定 Panel 本机配置目录');
    fs.mkdirSync(directory, { recursive: true });
    return path.join(directory, 'panel-provider.json');
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

  _loadProvider() {
    if (this.provider) return this.provider;
    const filePath = this._configPath();
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024) {
      throw new Error('Panel 本机配置文件无效');
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Number(parsed.schemaVersion) !== PROVIDER_SCHEMA_VERSION || !parsed.provider) {
      throw new Error('Panel 本机配置版本不受支持');
    }
    const baseUrl = normalizeBaseUrl(parsed.provider.baseUrl);
    const providerId = normalizeIdentifier(parsed.provider.providerId, 'Provider ID');
    const encryptedToken = cleanText(parsed.provider.encryptedToken, 16 * 1024);
    if (!encryptedToken) throw new Error('Panel 本机配置缺少安全凭据');
    this.provider = {
      providerId,
      providerKind: 'xiangshu-panel',
      label: cleanText(parsed.provider.label, 120, new URL(baseUrl).hostname),
      baseUrl,
      encryptedToken,
      apiVersion: normalizeApiVersion(parsed.provider.apiVersion),
      capabilities: Array.isArray(parsed.provider.capabilities) ? parsed.provider.capabilities.slice(0, 50) : [],
      connectedAt: cleanText(parsed.provider.connectedAt, 64)
    };
    return this.provider;
  }

  _publicConnection(provider = this._loadProvider()) {
    if (!provider) return { configured: false, credentialAvailable: false };
    return {
      configured: true,
      providerId: provider.providerId,
      providerKind: provider.providerKind,
      label: provider.label,
      baseUrl: provider.baseUrl,
      apiVersion: provider.apiVersion,
      capabilities: [...provider.capabilities],
      connectedAt: provider.connectedAt,
      credentialAvailable: true
    };
  }

  getConnection() {
    return this._publicConnection();
  }

  _decryptToken(provider) {
    if (!this.safeStorage?.isEncryptionAvailable?.()) {
      throw new Error('系统安全凭据存储当前不可用');
    }
    try {
      return normalizeToken(this.safeStorage.decryptString(Buffer.from(provider.encryptedToken, 'base64')));
    } catch (_) {
      throw new Error('无法解锁 Panel 凭据，请重新连接');
    }
  }

  async _get(pathname, provider = this._loadProvider()) {
    if (!provider) throw new Error('尚未连接 Xiangshu Panel');
    const url = new URL(`${API_PREFIX}${pathname}`, provider.baseUrl);
    return requestJson({ url, token: this._decryptToken(provider), fetchImpl: this.fetchImpl });
  }

  async connect(values = {}) {
    const baseUrl = normalizeBaseUrl(values.baseUrl);
    const label = cleanText(values.label, 120, new URL(baseUrl).hostname);
    const token = normalizeToken(values.token);
    if (!this.safeStorage?.isEncryptionAvailable?.()) {
      throw new Error('系统安全凭据存储当前不可用，未保存令牌');
    }
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
      encryptedToken: this.safeStorage.encryptString(token).toString('base64'),
      apiVersion: capabilities.apiVersion,
      capabilities: capabilities.capabilities,
      connectedAt
    };
    this._writeJsonAtomic(this._configPath(), { schemaVersion: PROVIDER_SCHEMA_VERSION, provider });
    this.provider = provider;
    return this._publicConnection(provider);
  }

  disconnect() {
    const filePath = this._configPath();
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
    this.provider = null;
    this.allowedExternalUrls.clear();
    return { configured: false, credentialAvailable: false };
  }

  async getCatalog() {
    const provider = this._loadProvider();
    const catalog = normalizeCatalog(await this._get('/catalog', provider));
    for (const resource of catalog.resources) this._rememberExternalUrls(resource);
    return { ...catalog, provider: this._publicConnection(provider) };
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
    if (Number(parsed.schemaVersion) !== BINDINGS_SCHEMA_VERSION || !Array.isArray(parsed.bindings)) {
      throw new Error('项目部署关联版本不受支持');
    }
    if (parsed.bindings.length > MAX_PROJECT_BINDINGS) throw new Error('项目部署关联数量超过安全上限');
    return parsed.bindings.map(normalizeBinding);
  }

  saveProjectBinding(directoryPath, value = {}) {
    const project = this.projectService.getProject(directoryPath);
    const provider = this._loadProvider();
    if (!provider) throw new Error('尚未连接 Xiangshu Panel');
    const binding = normalizeBinding({ ...value, providerId: provider.providerId });
    const filePath = this._bindingsPath(project.path);
    this._writeJsonAtomic(filePath, { schemaVersion: BINDINGS_SCHEMA_VERSION, bindings: [binding] });
    return { projectId: project.projectId, bindings: [binding] };
  }

  clearProjectBindings(directoryPath) {
    const project = this.projectService.getProject(directoryPath);
    const filePath = this._bindingsPath(project.path);
    this._writeJsonAtomic(filePath, { schemaVersion: BINDINGS_SCHEMA_VERSION, bindings: [] });
    return { projectId: project.projectId, bindings: [] };
  }

  async getProjectDeployments(directoryPath) {
    const project = this.projectService.getProject(directoryPath);
    const provider = this._loadProvider();
    const bindings = this._readBindings(project.path);
    if (!provider) {
      return { state: 'unconfigured', projectId: project.projectId, provider: this._publicConnection(null), bindings, resources: [] };
    }
    const providerBindings = bindings.filter(binding => binding.providerId === provider.providerId);
    if (!providerBindings.length) {
      return { state: 'unlinked', projectId: project.projectId, provider: this._publicConnection(provider), bindings, resources: [] };
    }
    const resources = await Promise.all(providerBindings.map(async binding => {
      const raw = await this._get(`/snapshot?resourceUuid=${encodeURIComponent(binding.resourceUuid)}`, provider);
      normalizeApiVersion(raw?.apiVersion);
      const resource = normalizeResource(raw?.resource || raw);
      if (resource.resourceUuid !== binding.resourceUuid) throw new Error('Panel 返回了不匹配的资源身份');
      this._rememberExternalUrls(resource);
      return resource;
    }));
    return {
      state: 'ready',
      projectId: project.projectId,
      provider: this._publicConnection(provider),
      bindings: providerBindings,
      resources
    };
  }

  _rememberExternalUrls(resource) {
    for (const value of [resource.panelUrl, resource.coolifyUrl, ...resource.domains]) {
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
  normalizeResource,
  normalizeBinding,
  requestJson,
  API_PREFIX,
  REQUEST_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  MAX_CATALOG_RESOURCES,
  MAX_PROJECT_BINDINGS
};
