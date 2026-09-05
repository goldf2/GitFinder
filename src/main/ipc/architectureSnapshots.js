const { BrowserWindow, dialog, shell } = require('electron');
const { registerTrustedHandler } = require('./security');
const fileService = require('../services/fileService');
const { ArchitectureSnapshotService } = require('../services/architectureSnapshotService');

const service = new ArchitectureSnapshotService();

function managedDirectory(candidatePath) {
  const result = fileService.resolveWorkspacePath(candidatePath);
  if (!result?.ok || result.type !== 'directory') throw new Error(`无法访问受管仓库：${result?.message || '路径校验失败'}`);
  return result.path;
}

async function pickJsonFile(event) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: '导入 Archify 代码架构快照',
    properties: ['openFile'],
    filters: [{ name: 'Archify JSON', extensions: ['json'] }]
  };
  const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
  return result.canceled ? '' : result.filePaths[0] || '';
}

function registerArchitectureSnapshotsIPC() {
  registerTrustedHandler('architectureSnapshots:list', async (_event, repoPath) => service.list(managedDirectory(repoPath)));
  registerTrustedHandler('architectureSnapshots:import', async (event, repoPath) => {
    const directory = managedDirectory(repoPath);
    const sourcePath = await pickJsonFile(event);
    if (!sourcePath) return { cancelled: true };
    return service.importFile(directory, sourcePath);
  });
  registerTrustedHandler('architectureSnapshots:open', async (_event, request = {}) => {
    const directory = managedDirectory(request.repoPath);
    const target = service.resolve(directory, request.snapshotId, request.format);
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return true;
  });
}

module.exports = { registerArchitectureSnapshotsIPC };
