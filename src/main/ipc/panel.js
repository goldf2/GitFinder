const { app, shell } = require('electron');
const { registerTrustedHandler } = require('./security');
const localProjectService = require('../services/localProjectService');
const configService = require('../services/configService');
const { CoolifyProviderService } = require('../services/coolifyProviderService');

let defaultService = null;

function normalizeSyncRequestId(value) {
  const candidate = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(candidate)
    ? candidate
    : `panel_sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sendTopologyProgress(event, progress, requestId) {
  if (!event?.sender || event.sender.isDestroyed?.()) return;
  const source = progress && typeof progress === 'object' ? progress : {};
  const readCounts = ['applications', 'services', 'databases', 'servers', 'projects', 'deployments', 'projectDetails', 'deploymentHistory']
    .reduce((counts, key) => {
      if (Number.isInteger(source.readCounts?.[key])) counts[key] = Math.max(0, source.readCounts[key]);
      return counts;
    }, {});
  const payload = {
    requestId,
    state: ['running', 'ready', 'warning', 'error', 'cancelled'].includes(source.state) ? source.state : 'running',
    phase: String(source.phase || '').slice(0, 48),
    phaseLabel: String(source.phaseLabel || '').slice(0, 120),
    providerId: String(source.providerId || '').slice(0, 180),
    providerLabel: String(source.providerLabel || '').slice(0, 160),
    providerCount: Number.isInteger(source.providerCount) ? source.providerCount : 0,
    completedProviders: Number.isInteger(source.completedProviders) ? source.completedProviders : 0,
    completed: Number.isInteger(source.completed) ? source.completed : 0,
    total: Number.isInteger(source.total) ? source.total : null,
    startedAt: String(source.startedAt || '').slice(0, 40),
    updatedAt: String(source.updatedAt || '').slice(0, 40),
    error: String(source.error || '').slice(0, 500)
  };
  if (Object.keys(readCounts).length) payload.readCounts = readCounts;
  try { event.sender.send('panel:syncProgress', payload); } catch (_) {}
}

function getTopologyForEvent(service, event, options = {}) {
  const requestId = normalizeSyncRequestId(options?.requestId);
  return service.getTopology({
    requestId,
    onProgress: progress => sendTopologyProgress(event, progress, requestId)
  });
}

function getService(options = {}) {
  if (options.service) return options.service;
  if (!defaultService) {
    defaultService = new CoolifyProviderService({ app, projectService: localProjectService, getRegistry: () => configService.getRegistry() });
  }
  return defaultService;
}

function registerPanelIPC(options = {}) {
  const service = getService(options);
  registerTrustedHandler('panel:getConnection', async () => service.getConnection());
  registerTrustedHandler('panel:getConnections', async () => service.getConnections());
  registerTrustedHandler('panel:connect', async (event, values = {}) => service.connect(values));
  registerTrustedHandler('panel:update', async (event, values = {}) => service.update(values));
  registerTrustedHandler('panel:disconnect', async (event, providerId = '') => service.disconnect(providerId));
  registerTrustedHandler('panel:getCatalog', async (event, providerId = '') => service.getCatalog(providerId));
  registerTrustedHandler('panel:getCachedTopology', async () => service.getCachedTopology());
  registerTrustedHandler('panel:getSyncLog', async () => {
    if (typeof service.getSyncLog !== 'function') return { state: 'unavailable', runs: [], path: '' };
    return service.getSyncLog();
  });
  registerTrustedHandler('panel:openSyncLog', async () => {
    if (typeof service.getSyncLog !== 'function') throw new Error('Coolify 同步日志暂不可用');
    const log = service.getSyncLog();
    if (!log?.path) throw new Error('Coolify 同步日志文件尚未生成');
    shell.showItemInFolder(log.path);
    return { path: log.path };
  });
  registerTrustedHandler('panel:refreshTopology', async (event, options = {}) => getTopologyForEvent(service, event, options));
  registerTrustedHandler('panel:getTopology', async (event, options = {}) => getTopologyForEvent(service, event, options));
  registerTrustedHandler('panel:checkEndpoints', async (event, values = {}) => service.checkEndpoints(values));
  registerTrustedHandler('panel:getEndpointChecks', async () => service.getEndpointChecks());
  registerTrustedHandler('panel:getRepositoryAssociations', async () => service.getRepositoryAssociations());
  registerTrustedHandler('panel:setRepositoryAssociation', async (event, values) => service.setRepositoryAssociation(values));
  registerTrustedHandler('panel:getLocalRepositories', async () => service.getLocalRepositories());
  registerTrustedHandler('panel:getProjectBindings', async (event, directoryPath) => service.getProjectBindings(directoryPath));
  registerTrustedHandler('panel:getProjectDeployments', async (event, directoryPath) => service.getProjectDeployments(directoryPath));
  registerTrustedHandler('panel:saveProjectBinding', async (event, directoryPath, binding = {}) => service.saveProjectBinding(directoryPath, binding));
  registerTrustedHandler('panel:clearProjectBindings', async (event, directoryPath) => service.clearProjectBindings(directoryPath));
  registerTrustedHandler('panel:openExternal', async (event, value) => {
    await shell.openExternal(service.resolveExternalUrl(value));
    return true;
  });
  return service;
}

module.exports = { registerPanelIPC, getService };
