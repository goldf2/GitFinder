const { app, shell } = require('electron');
const { registerTrustedHandler } = require('./security');
const localProjectService = require('../services/localProjectService');
const configService = require('../services/configService');
const { CoolifyProviderService } = require('../services/coolifyProviderService');

let defaultService = null;

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
  registerTrustedHandler('panel:getTopology', async () => service.getTopology());
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
