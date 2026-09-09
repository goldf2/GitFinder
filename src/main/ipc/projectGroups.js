const { registerTrustedHandler } = require('./security');
const projectGroupService = require('../services/projectGroupService');

function registerProjectGroupsIPC() {
  registerTrustedHandler('projectGroups:list', async () => projectGroupService.list());

  registerTrustedHandler('projectGroups:create', async (event, values = {}) => {
    return projectGroupService.create(values);
  });

  registerTrustedHandler('projectGroups:update', async (event, groupId, values = {}) => {
    return projectGroupService.update(groupId, values);
  });

  registerTrustedHandler('projectGroups:delete', async (event, groupId) => {
    return projectGroupService.delete(groupId);
  });
}

module.exports = { registerProjectGroupsIPC };
