const { BrowserWindow, dialog, nativeImage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { WhiteboardDocumentService } = require('../services/whiteboardDocumentService');
const { WhiteboardPackageService } = require('../services/whiteboardPackageService');
let documents;
const documentService = () => documents ||= new WhiteboardDocumentService();

async function documentDialog(event, type, options) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  return owner ? dialog[type](owner, options) : dialog[type](options);
}
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
  const saveProject = async (event, request) => {
    const name = String(request.store?.boards?.[0]?.name || '新白板').replace(/[\\/:*?"<>|]/g, '-');
    const result = await documentDialog(event, 'showSaveDialog', { title: '保存白板项目文件夹', defaultPath: `${name}.gitfinder-board`, buttonLabel: '创建白板项目', properties: ['createDirectory'] });
    if (result.canceled) return { cancelled: true };
    return documentService().createProject(request, result.filePath);
  };
  registerTrustedHandler('whiteboards:create', saveProject);
  registerTrustedHandler('whiteboards:pickFiles', async (event, imagesOnly = false) => {
    const result = await documentDialog(event, 'showOpenDialog', { title: '添加白板文件', properties: ['openFile', 'multiSelections'], ...(imagesOnly ? { filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] } : {}) });
    return result.canceled ? { cancelled: true } : { paths: result.filePaths };
  });
  registerTrustedHandler('whiteboards:attachFiles', async (_event, request) => documentService().attachFiles(request));
  registerTrustedHandler('whiteboards:assets', async (_event, id) => documentService().inspectAssets(id).map(asset => {
    if (asset.filePath && asset.size <= 32 * 1024 * 1024 && /\.(png|jpe?g|webp)$/i.test(asset.filePath)) {
      const picture = nativeImage.createFromPath(asset.filePath);
      if (!picture.isEmpty()) {
        const size = picture.getSize();
        asset.imageData = picture.resize({ width: Math.min(1200, size.width) }).toDataURL();
      }
    }
    delete asset.filePath;
    return asset;
  }));
  registerTrustedHandler('whiteboards:revealAsset', async (_event, request) => {
    const asset = documentService().inspectAssets(request.id).find(item => item.entityId === request.entityId);
    if (!asset?.filePath || asset.state !== 'available') throw new Error('资源缺失或未授权');
    shell.showItemInFolder(asset.filePath);
    return true;
  });
  registerTrustedHandler('whiteboards:list', async () => documentService().list());
  const importPackage = async (event, source) => {
    const result = await documentDialog(event, 'showSaveDialog', { title: '将白板包导入为项目文件夹', defaultPath: `${path.basename(source).replace(/\.(gfb|zip)$/i, '')}.gitfinder-board`, buttonLabel: '导入并打开', properties: ['createDirectory'] });
    if (result.canceled) return { cancelled: true };
    return new WhiteboardPackageService(documentService()).importPackage(source, result.filePath);
  };
  registerTrustedHandler('whiteboards:importPackage', async event => {
    const result = await documentDialog(event, 'showOpenDialog', { title: '导入白板包', properties: ['openFile'], filters: [{ name: 'GitFinder 白板包（ZIP）', extensions: ['gfb', 'zip'] }] });
    if (result.canceled) return { cancelled: true };
    return importPackage(event, result.filePaths[0]);
  });
  registerTrustedHandler('whiteboards:exportPackage', async (event, request) => {
    const suggested = relationshipBoardExportService.suggestedFileName(request.store).replace(/\.gitfinder-board\.json$/, '.gfb');
    let collectReferences = true;
    if (request.store.entities.some(entity => entity.details?.referencePath)) {
      const answer = await documentDialog(event, 'showMessageBox', { type: 'question', message: '是否将外部引用文件复制进白板包？', detail: '默认收集已授权的附件，方便换设备打开。缺失或未授权的文件保留占位；原文件不会被移动。仅保留引用时，包内会保留原文件路径。', buttons: ['复制进白板包', '仅保留引用', '取消'], defaultId: 0, cancelId: 2 });
      if (answer.response === 2) return { cancelled: true };
      collectReferences = answer.response === 0;
    }
    const result = await documentDialog(event, 'showSaveDialog', { title: '导出白板包（包含媒体）', defaultPath: suggested, filters: [{ name: 'GitFinder 白板包（ZIP）', extensions: ['gfb'] }] });
    if (result.canceled) return { cancelled: true };
    return new WhiteboardPackageService(documentService()).exportPackage({ ...request, collectReferences }, result.filePath);
  });
  registerTrustedHandler('whiteboards:open', async (event, id) => {
    if (id) return documentService().open(id);
    const result = await documentDialog(event, 'showOpenDialog', { title: '打开白板项目、文件或白板包', properties: ['openFile', 'openDirectory'], filters: [{ name: 'GitFinder 白板', extensions: ['json', 'gfb', 'zip'] }] });
    if (result.canceled) return { cancelled: true };
    if (/\.(gfb|zip)$/i.test(result.filePaths[0])) return importPackage(event, result.filePaths[0]);
    return documentService().openPath(result.filePaths[0]);
  });
  registerTrustedHandler('whiteboards:save', async (event, request) => {
    if (request.id && !request.saveAs) return documentService().save(request);
    return saveProject(event, request);
  });
  registerTrustedHandler('whiteboards:remove', async (event, request) => {
    const record = documentService().record(request.id);
    if (request.trash) {
      const result = await documentDialog(event, 'showMessageBox', { type: 'warning', message: `将“${record.name}”移到废纸篓？`, detail: record.projectDirectory ? `整个白板项目及其复制的媒体将移到废纸篓；外部引用文件不受影响。\n${record.projectDirectory}` : record.path, buttons: ['取消', '移到废纸篓'], defaultId: 0, cancelId: 0 });
      if (result.response !== 1) return { cancelled: true };
      await shell.trashItem(record.projectDirectory || record.path);
    }
    return { library: documentService().remove(request.id) };
  });
  registerTrustedHandler('whiteboards:pickImage', async event => {
    const result = await documentDialog(event, 'showOpenDialog', { title: '添加白板图片', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (result.canceled) return { cancelled: true };
    const filePath = result.filePaths[0];
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error('请选择不超过 4 MB 的图片');
    const bytes = fs.readFileSync(filePath);
    const picture = nativeImage.createFromBuffer(bytes);
    if (picture.isEmpty()) throw new Error('无法读取该图片');
    const size = picture.getSize();
    if (size.width * size.height > 20000000) throw new Error('图片尺寸过大，请先缩小');
    const png = picture.toPNG();
    if (png.length > 4 * 1024 * 1024) throw new Error('图片解码后过大，请先缩小');
    return { name: path.basename(filePath), data: `data:image/png;base64,${png.toString('base64')}`, ...size };
  });
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
