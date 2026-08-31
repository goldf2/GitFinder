const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const yauzl = require('yauzl');
const yazl = require('yazl');
const crc32 = require('buffer-crc32');
const Model = require('../../shared/relationshipGraphModel');
const { unwrapRelationshipBoardFile, containsHighConfidenceSecret } = require('./relationshipBoardFileFormat');
const { MAX_FILE_BYTES } = require('./relationshipBoardService');

const MAX_ASSET_BYTES = 512 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = Model.MAX_ENTITIES + 2;
const ASSET_NAME = /^assets\/[a-z0-9][a-z0-9._-]{0,180}$/i;

function ordinaryFile(filePath, limit) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.size > limit) throw new Error('白板包仅支持普通文件，或文件超过大小限制');
  return stat;
}

function ordinaryDirectory(directory) {
  if (!path.isAbsolute(directory) || !fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error('请选择普通文件夹');
  }
}

function assetName(filePath) {
  const suffix = path.extname(filePath).toLowerCase();
  return `assets/${crypto.randomUUID()}${/^[.a-z0-9]{1,12}$/.test(suffix) ? suffix : '.bin'}`;
}

class WhiteboardPackageService {
  constructor(documents) { this.documents = documents; }

  async exportPackage(request, destination) {
    if (!path.isAbsolute(destination)) throw new Error('白板包保存路径无效');
    ordinaryDirectory(path.dirname(destination));
    if (fs.existsSync(destination)) ordinaryFile(destination, MAX_PACKAGE_BYTES);
    // Export a validated copy; never rewrite the working board or its references.
    const store = this.documents.exporter.createEnvelope(request.store).store;
    const record = request.id ? this.documents.record(request.id) : null;
    const files = new Map(), warnings = [];
    let totalBytes = 0;
    for (const entity of store.entities) {
      if (!['image', 'attachment'].includes(entity.type)) continue;
      const details = entity.details;
      if (details.imageData) continue;
      if (details.referencePath && !request.collectReferences) {
        warnings.push(`${entity.name}：保留外部引用，换设备后需重新选择文件`);
        continue;
      }
      try {
        let source;
        if (details.assetPath && record?.projectDirectory) source = this.documents._assetFile(record.projectDirectory, details.assetPath);
        else if (details.referencePath && record?.approvedReferences?.includes(details.referencePath)) source = details.referencePath;
        else throw new Error('资源缺失或外部引用未授权');
        const stat = ordinaryFile(source, MAX_ASSET_BYTES);
        if (!files.has(source)) {
          totalBytes += stat.size;
          files.set(source, assetName(source));
        }
        details.assetPath = files.get(source);
        delete details.referencePath;
      } catch (_) { warnings.push(`${entity.name}：资源缺失或未授权，保留占位`); }
    }
    const board = Buffer.from(`${JSON.stringify(this.documents.exporter.createEnvelope(store), null, 2)}\n`);
    if (board.length > MAX_FILE_BYTES || totalBytes + board.length > MAX_PACKAGE_BYTES) throw new Error('白板 JSON 不能超过 32 MB，白板包展开后不能超过 2 GB');
    const temporary = path.join(path.dirname(destination), `.gfb-${crypto.randomUUID()}.tmp`);
    const previous = `${temporary}.previous`;
    let previousMoved = false;
    const zip = new yazl.ZipFile();
    const failed = error => zip.outputStream.destroy(error);
    zip.on('error', failed);
    try {
      const writing = pipeline(zip.outputStream, fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      zip.addBuffer(board, 'board.json');
      for (const [source, name] of files) zip.addFile(source, name);
      zip.end();
      await writing;
      if (fs.existsSync(destination)) { fs.renameSync(destination, previous); previousMoved = true; }
      fs.renameSync(temporary, destination);
      if (previousMoved) { fs.unlinkSync(previous); previousMoved = false; }
      return { fileName: path.basename(destination), assetCount: files.size, warnings };
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      if (previousMoved && !fs.existsSync(destination)) fs.renameSync(previous, destination);
    }
  }

  async importPackage(source, destination) {
    ordinaryFile(source, MAX_PACKAGE_BYTES);
    if (!path.isAbsolute(destination)) throw new Error('白板项目保存路径无效');
    if (!destination.endsWith('.gitfinder-board')) destination += '.gitfinder-board';
    ordinaryDirectory(path.dirname(destination));
    if (fs.existsSync(destination)) throw new Error('目标白板项目已存在，请选择新名称');
    const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.gfb-import-'));
    let zip;
    try {
      zip = await yauzl.openPromise(source, { strictFileNames: true, autoClose: false, validateEntrySizes: true });
      if (zip.entryCount > MAX_ENTRIES) throw new Error('白板包文件数量超过限制');
      const seen = new Set();
      let totalBytes = 0;
      for await (const entry of zip.eachEntry()) {
        const name = entry.fileName;
        const type = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (entry.isEncrypted() || (type && type !== 0o100000 && !(name === 'assets/' && type === 0o040000))) throw new Error('白板包不支持加密文件、符号链接或特殊文件');
        if (name !== 'board.json' && name !== 'assets/' && (!ASSET_NAME.test(name) || name.includes('..') || /[. ]$/.test(name) || /\/(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))) throw new Error('白板包包含不允许的路径');
        const key = name.toLowerCase();
        if (seen.has(key)) throw new Error('白板包包含重复文件名');
        seen.add(key);
        const limit = name === 'board.json' ? MAX_FILE_BYTES : name === 'assets/' ? 0 : MAX_ASSET_BYTES;
        totalBytes += entry.uncompressedSize;
        if (entry.uncompressedSize > limit || totalBytes > MAX_PACKAGE_BYTES) throw new Error('白板包展开后超过大小限制');
        if (name === 'assets/') continue;
        const target = path.join(staging, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        let size = 0, checksum = 0;
        const validate = new Transform({ transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > limit) return callback(new Error('白板包文件超过大小限制'));
          checksum = crc32.unsigned(chunk, checksum);
          callback(null, chunk);
        } });
        await pipeline(await zip.openReadStreamPromise(entry), validate, fs.createWriteStream(target, { flags: 'wx', mode: 0o600 }));
        if (size !== entry.uncompressedSize || checksum !== entry.crc32) throw new Error('白板包文件损坏，校验失败');
      }
      if (!seen.has('board.json')) throw new Error('白板包缺少 board.json');
      const parsed = JSON.parse(fs.readFileSync(path.join(staging, 'board.json'), 'utf8'));
      if (containsHighConfidenceSecret(parsed)) throw new Error('白板疑似包含凭据，已拒绝导入');
      const store = Model.assertValidStore(unwrapRelationshipBoardFile(parsed).store);
      if (store.boards.length !== 1) throw new Error('一个白板包只允许包含一个白板');
      // Only registered media is imported. Extra ZIP contents are not a file-transfer channel.
      const assets = new Set(store.entities.filter(e => ['image', 'attachment'].includes(e.type)).map(e => e.details.assetPath).filter(Boolean));
      for (const name of seen) if (name.startsWith('assets/') && name !== 'assets/' && !assets.has(name)) throw new Error('白板包包含未关联的附件');
      this.documents.exporter.exportToFile(path.join(staging, 'board.json'), store);
      if (fs.existsSync(destination)) throw new Error('目标白板项目已存在，请选择新名称');
      fs.renameSync(staging, destination);
      const result = this.documents.openPath(destination);
      const warnings = this.documents.inspectAssets(result.record.id).filter(asset => asset.state !== 'available').map(asset => asset.message);
      return { ...result, warnings };
    } finally {
      zip?.close();
      // This is our isolated import staging directory, never the selected destination.
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
}

module.exports = { WhiteboardPackageService, MAX_PACKAGE_BYTES, MAX_ASSET_BYTES };
