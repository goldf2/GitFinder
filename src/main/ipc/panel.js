const { app, shell } = require('electron');
const { registerTrustedHandler } = require('./security');
const localProjectService = require('../services/localProjectService');
const { PanelProviderService } = require('../services/panelProviderService');

let defaultService = null;

function getService(options = {}) {
  if (options.service) return options.service;
  if (!defaultService) {
    defaultService = new PanelProviderService({ app, projectService: localProjectService });
  }
  return defaultService;
}

function registerPanelIPC(options = {}) {
  const service = getService(options);
  registerTrustedHandler('panel:getConnection', async () => service.getConnection());
  registerTrustedHandler('panel:getConnections', async () => service.getConnections());
  registerTrustedHandler('panel:connect', async (event, values = {}) => service.connect(values));
  registerTrustedHandler('panel:disconnect', async (event, providerId = '') => service.disconnect(providerId));
  registerTrustedHandler('panel:getCatalog', async (event, providerId = '') => service.getCatalog(providerId));
  registerTrustedHandler('panel:getTopology', async () => service.getTopology());
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
