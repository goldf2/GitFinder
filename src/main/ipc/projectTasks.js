const { registerTrustedHandler } = require('./security');
const configService = require('../services/configService');
const Features = require('../../shared/experimentalFeatures');
const projectTaskProjectionService = require('../services/projectTaskProjectionService');
const projectTaskGitEvidenceService = require('../services/projectTaskGitEvidenceService');
const projectTaskWritebackService = require('../services/projectTaskWritebackService');

function registerTaskHandler(channel, handler) {
  const portfolio = channel === 'projectTasks:getPortfolio';
  const allowed = () => {
    const flags = Features.normalize(configService.get('experimentalFeatures'));
    return flags.tasks || (portfolio && flags.dashboard);
  };
  const disabled = () => ({ success: false, disabled: true, readOnly: true, projects: [], tasks: [], dependencies: [], milestones: [], timeline: [], warnings: [], error: '请先在设置 → 测试功能中启用对应功能' });
  registerTrustedHandler(channel, async (event, ...args) => {
    if (!allowed()) {
      if (portfolio) return disabled();
      throw new Error('开发进度测试功能未启用');
    }
    const result = await handler(event, ...args);
    // A read already in flight cannot repopulate a disabled view.
    return allowed() ? result : disabled();
  });
}

function registerProjectTasksIPC() {
  registerTaskHandler('projectTasks:getPortfolio', async (event, options = {}) => {
    return projectTaskProjectionService.getPortfolio({
      forceRefresh: Boolean(options?.forceRefresh)
    });
  });

  registerTaskHandler('projectTasks:getGitEvidence', async (event, taskKey, options = {}) => {
    return projectTaskGitEvidenceService.getTaskEvidence(taskKey, {
      forceRefresh: Boolean(options?.forceRefresh)
    });
  });

  registerTaskHandler('projectTasks:previewStatusChange', async (event, taskKey, targetStatus) => {
    return projectTaskWritebackService.previewStatusChange(taskKey, targetStatus);
  });

  registerTaskHandler('projectTasks:applyStatusChange', async (event, taskKey, request = {}) => {
    return projectTaskWritebackService.applyStatusChange(taskKey, request);
  });

  registerTaskHandler('projectTasks:previewTaskUpdate', async (event, taskKey, changes = {}) => {
    return projectTaskWritebackService.previewTaskUpdate(taskKey, changes);
  });

  registerTaskHandler('projectTasks:applyTaskUpdate', async (event, taskKey, request = {}) => {
    return projectTaskWritebackService.applyTaskUpdate(taskKey, request);
  });

  registerTaskHandler('projectTasks:previewTaskCreate', async (event, projectId, values = {}) => {
    return projectTaskWritebackService.previewTaskCreate(projectId, values);
  });

  registerTaskHandler('projectTasks:applyTaskCreate', async (event, projectId, request = {}) => {
    return projectTaskWritebackService.applyTaskCreate(projectId, request);
  });

  registerTaskHandler('projectTasks:previewMilestoneUpdate', async (event, milestoneKey, changes = {}) => {
    return projectTaskWritebackService.previewMilestoneUpdate(milestoneKey, changes);
  });

  registerTaskHandler('projectTasks:applyMilestoneUpdate', async (event, milestoneKey, request = {}) => {
    return projectTaskWritebackService.applyMilestoneUpdate(milestoneKey, request);
  });
}

module.exports = { registerProjectTasksIPC };
