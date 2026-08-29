const { BrowserWindow, dialog } = require('electron');
const { registerTrustedHandler } = require('./security');
const relationshipBoardService = require('../services/relationshipBoardService');
const relationshipBoardImportService = require('../services/relationshipBoardImportService');
const relationshipBoardExportService = require('../services/relationshipBoardExportService');

async function selectRelationshipExportFile(event, request = {}) {
  const store = request?.store;
  const suggestedFileName = relationshipBoardExportService.suggestedFileName(store);
  const options = {
    title: '导出当前关系白板',
    defaultPath: suggestedFileName,
    filters: [{ name: 'GitFinder 关系白板', extensions: ['json'] }]
  };
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { cancelled: true };
  return relationshipBoardExportService.exportToFile(result.filePath, store);
}

async function selectRelationshipImportFile(event) {
  const options = {
    title: '导入关系白板 JSON',
    properties: ['openFile'],
    filters: [{ name: 'JSON 文件', extensions: ['json'] }]
  };
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  return relationshipBoardImportService.previewFromFile(result.filePaths[0]);
}

function registerRelationshipBoardsIPC() {
  registerTrustedHandler('relationshipBoards:get', async () => relationshipBoardService.load());
  registerTrustedHandler('relationshipBoards:save', async (event, store) => relationshipBoardService.save(store));
  registerTrustedHandler('relationshipBoards:export', selectRelationshipExportFile);
  registerTrustedHandler('relationshipBoards:previewImport', selectRelationshipImportFile);
  registerTrustedHandler('relationshipBoards:applyImport', async (event, request) => {
    return relationshipBoardImportService.applyImport(request);
  });
}

module.exports = {
  registerRelationshipBoardsIPC,
  selectRelationshipExportFile,
  selectRelationshipImportFile
};
