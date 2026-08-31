const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const RelationshipGraphModel = require('../../shared/relationshipGraphModel');
const relationshipBoardService = require('./relationshipBoardService');
const {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  containsHighConfidenceSecret
} = require('./relationshipBoardFileFormat');
const MAX_EXPORT_BYTES = relationshipBoardService.MAX_FILE_BYTES;

function safeBaseName(value) {
  const cleaned = RelationshipGraphModel.cleanText(value, 120, '关系白板')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 100);
  const candidate = cleaned || '关系白板';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(candidate) ? `${candidate}-白板` : candidate;
}

class RelationshipBoardExportService {
  constructor(options = {}) {
    this.fs = options.fsModule || fs;
    this.now = options.now || (() => new Date());
    this.randomUUID = options.randomUUID || crypto.randomUUID;
  }

  suggestedFileName(rawStore) {
    const store = RelationshipGraphModel.assertValidStore(rawStore);
    const board = store.boards.find(item => item.id === store.activeBoardId) || store.boards[0];
    return `${safeBaseName(board?.name)}.gitfinder-board.json`;
  }

  createEnvelope(rawStore) {
    const store = RelationshipGraphModel.assertValidStore(rawStore);
    if (store.boards.length !== 1) throw new Error('导出文件必须只包含当前白板');
    if (containsHighConfidenceSecret(store)) {
      throw new Error('关系白板疑似包含密码、令牌或私钥，已拒绝导出');
    }
    const exportedAt = new Date(this.now());
    return {
      format: EXPORT_FORMAT,
      formatVersion: store.entities.some(item => ['text', 'image', 'attachment'].includes(item.type)) ? 2 : EXPORT_FORMAT_VERSION,
      exportedAt: Number.isFinite(exportedAt.getTime()) ? exportedAt.toISOString() : new Date().toISOString(),
      store
    };
  }

  exportToFile(filePath, rawStore) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || filePath.includes('\0')) {
      throw new Error('关系白板导出路径无效');
    }
    const destinationPath = path.resolve(filePath);
    const parentPath = path.dirname(destinationPath);
    const parentStat = this.fs.lstatSync(parentPath);
    if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
      throw new Error('关系白板导出目录必须是普通文件夹');
    }
    if (this.fs.existsSync(destinationPath)) {
      const destinationStat = this.fs.lstatSync(destinationPath);
      if (destinationStat.isSymbolicLink()) throw new Error('关系白板导出目标不能是符号链接');
      if (!destinationStat.isFile()) throw new Error('关系白板导出目标必须是普通文件');
    }

    const envelope = this.createEnvelope(rawStore);
    const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > MAX_EXPORT_BYTES) throw new Error('关系白板导出文件超过 32 MB 安全限制');

    const temporaryPath = path.join(parentPath, `.${path.basename(destinationPath)}.${process.pid}.${this.randomUUID()}.tmp`);
    const previousPath = path.join(parentPath, `.${path.basename(destinationPath)}.${process.pid}.${this.randomUUID()}.previous`);
    let handle = null;
    let previousMoved = false;
    try {
      handle = this.fs.openSync(temporaryPath, 'wx', 0o600);
      this.fs.writeFileSync(handle, serialized, 'utf8');
      this.fs.fsyncSync(handle);
      this.fs.closeSync(handle);
      handle = null;
      if (this.fs.existsSync(destinationPath)) {
        this.fs.renameSync(destinationPath, previousPath);
        previousMoved = true;
      }
      this.fs.renameSync(temporaryPath, destinationPath);
      if (previousMoved) {
        this.fs.rmSync(previousPath, { force: true });
        previousMoved = false;
      }
      try { this.fs.chmodSync(destinationPath, 0o600); } catch (_) {}
      try {
        const directoryHandle = this.fs.openSync(parentPath, 'r');
        try { this.fs.fsyncSync(directoryHandle); } finally { this.fs.closeSync(directoryHandle); }
      } catch (_) {}
    } finally {
      if (handle !== null) {
        try { this.fs.closeSync(handle); } catch (_) {}
      }
      if (this.fs.existsSync(temporaryPath)) this.fs.rmSync(temporaryPath, { force: true });
      if (previousMoved && !this.fs.existsSync(destinationPath) && this.fs.existsSync(previousPath)) {
        this.fs.renameSync(previousPath, destinationPath);
        previousMoved = false;
      }
    }
    return {
      cancelled: false,
      fileName: path.basename(destinationPath),
      bytes,
      nodeCount: envelope.store.entities.length,
      relationshipCount: envelope.store.relationships.length,
      boardCount: envelope.store.boards.length
    };
  }
}

let defaultService = null;

function getDefaultService() {
  if (!defaultService) defaultService = new RelationshipBoardExportService();
  return defaultService;
}

module.exports = {
  suggestedFileName: store => getDefaultService().suggestedFileName(store),
  exportToFile: (filePath, store) => getDefaultService().exportToFile(filePath, store),
  RelationshipBoardExportService,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  MAX_EXPORT_BYTES,
  safeBaseName
};
