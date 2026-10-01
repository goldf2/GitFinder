const { registerTrustedHandler } = require('./security');
const service = require('../services/projectConversationService');

function registerProjectConversationsIPC() {
  registerTrustedHandler('projectConversations:list', () => service.list());
  registerTrustedHandler('projectConversations:save', (event, projectId, conversations) => service.save(projectId, conversations));
  registerTrustedHandler('projectConversations:import', (event, values) => service.import(values));
  registerTrustedHandler('projectConversations:open', (event, projectId, source, threadId) => service.open(projectId, source, threadId));
  registerTrustedHandler('projectConversations:workspace', (event, projectId, options) => service.workspace(projectId, { refreshGithub: options?.refreshGithub === true }));
  registerTrustedHandler('projectConversations:openRepository', (event, projectId, repository, view) => service.openRepository(projectId, repository, view));
  registerTrustedHandler('projectConversations:openGithubTask', (event, projectId, url) => service.openGithubTask(projectId, url));
}

module.exports = { registerProjectConversationsIPC };
