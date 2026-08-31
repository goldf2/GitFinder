const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Model = require('../../shared/relationshipGraphModel');
const { RelationshipBoardExportService } = require('./relationshipBoardExportService');
const { unwrapRelationshipBoardFile, containsHighConfidenceSecret } = require('./relationshipBoardFileFormat');
const { resolveDefaultBaseDirectory, MAX_FILE_BYTES } = require('./relationshipBoardService');

class WhiteboardDocumentService {
  constructor(options = {}) {
    this.baseDirectory = options.baseDirectory || resolveDefaultBaseDirectory();
    this.indexPath = path.join(this.baseDirectory, 'whiteboard-library.json');
    this.exporter = new RelationshipBoardExportService();
  }

  _records() {
    if (!fs.existsSync(this.indexPath)) return [];
    if (fs.lstatSync(this.indexPath).isSymbolicLink()) throw new Error('白板资源库不能是符号链接');
    const value = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
    if (!Array.isArray(value)) throw new Error('白板资源库格式无效');
    return value;
  }

  _writeRecords(records) {
    fs.mkdirSync(this.baseDirectory, { recursive: true, mode: 0o700 });
    const temp = `${this.indexPath}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(records), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, this.indexPath);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }

  record(id) {
    const record = this._records().find(item => item.id === id);
    if (!record) throw new Error('白板不在资源库中，请重新打开文件');
    return record;
  }

  list() {
    return this._records().map(item => ({ ...item, missing: !fs.existsSync(item.path) }));
  }

  _revision(filePath) {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('请选择普通白板文件');
    if (stat.size > MAX_FILE_BYTES) throw new Error('白板文件超过 32 MB 限制');
    return `${stat.mtimeMs}:${stat.size}`;
  }

  _register(filePath, store) {
    const records = this._records();
    let record = records.find(item => item.path === filePath);
    if (!record) { record = { id: crypto.randomUUID(), path: filePath }; records.push(record); }
    record.name = store.boards[0].name;
    record.updatedAt = new Date().toISOString();
    record.nodeCount = store.entities.length;
    if (path.basename(filePath) === 'board.json' && path.dirname(filePath).endsWith('.gitfinder-board')) record.projectDirectory = path.dirname(filePath);
    this._writeRecords(records);
    return { ...record, revision: this._revision(filePath) };
  }

  openPath(filePath) {
    if (!path.isAbsolute(filePath)) throw new Error('白板路径无效');
    filePath = path.resolve(filePath);
    if (fs.lstatSync(filePath).isDirectory()) filePath = path.join(filePath, 'board.json');
    const revision = this._revision(filePath);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (this._revision(filePath) !== revision) throw new Error('文件正在被修改，请重试');
    if (containsHighConfidenceSecret(parsed)) throw new Error('白板疑似包含凭据，已拒绝打开');
    const store = Model.assertValidStore(unwrapRelationshipBoardFile(parsed).store);
    if (store.boards.length !== 1) throw new Error('请选择只包含一个白板的文件；多个白板请使用导入合并');
    return { record: this._register(filePath, store), store };
  }

  open(id) { return this.openPath(this.record(id).path); }

  save(request, destination) {
    const record = destination ? null : this.record(request.id);
    const filePath = destination || record.path;
    if (record && (!fs.existsSync(filePath) || this._revision(filePath) !== request.revision)) {
      throw new Error('白板文件已在外部修改或移除。请重新打开，或另存为以保留当前内容');
    }
    const store = record?.projectDirectory ? this._materializeImages(request.store, record.projectDirectory) : request.store;
    this.exporter.exportToFile(filePath, store);
    return { record: this._register(path.resolve(filePath), store), store };
  }

  _assetFile(directory, relative) {
    if (!/^assets\/[a-z0-9][a-z0-9._-]{0,180}$/i.test(relative) || relative.includes('..')) throw new Error('媒体路径不在白板项目内');
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('项目目录不能是符号链接');
    const assets = path.join(directory, 'assets');
    if (fs.existsSync(assets) && (fs.lstatSync(assets).isSymbolicLink() || !fs.lstatSync(assets).isDirectory())) throw new Error('媒体目录无效');
    const file = path.join(directory, relative);
    if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) throw new Error('媒体必须是普通文件');
    return file;
  }

  _materializeImages(input, directory) {
    const store = Model.assertValidStore(input);
    for (const entity of store.entities) {
      const data = entity.details.imageData;
      if (!data) continue;
      const ext = data.slice(11, data.indexOf(';')) === 'jpeg' ? 'jpg' : data.slice(11, data.indexOf(';'));
      const relative = `assets/${crypto.randomUUID()}.${ext}`;
      const file = this._assetFile(directory, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'), { flag: 'wx' });
      delete entity.details.imageData;
      delete entity.details.referencePath;
      entity.details.assetPath = relative;
    }
    return store;
  }

  async createProject(request, directory) {
    if (!path.isAbsolute(directory)) throw new Error('请选择白板项目保存位置');
    if (!directory.endsWith('.gitfinder-board')) directory += '.gitfinder-board';
    if (fs.existsSync(directory)) throw new Error('该白板项目文件夹已存在，请选择新名称');
    const validated = Model.assertValidStore(request.store);
    if (validated.boards.length !== 1) throw new Error('一个项目只保存一个白板');
    fs.mkdirSync(directory, { recursive: false });
    const source = request.id ? this.record(request.id) : null;
    for (const entity of validated.entities) {
      if (!entity.details.assetPath || !source?.projectDirectory) continue;
      const from = this._assetFile(source.projectDirectory, entity.details.assetPath);
      const to = this._assetFile(directory, entity.details.assetPath);
      if (!fs.existsSync(from)) continue; // Keep the missing reference visible.
      fs.mkdirSync(path.dirname(to), { recursive: true });
      await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    }
    const store = this._materializeImages(validated, directory);
    const filePath = path.join(directory, 'board.json');
    this.exporter.exportToFile(filePath, store);
    const record = this._register(filePath, store);
    if (source?.approvedReferences?.length) {
      const records = this._records(); records.find(item => item.id === record.id).approvedReferences = source.approvedReferences;
      this._writeRecords(records);
    }
    return { record, store };
  }

  async attachFiles({ id, paths, mode = 'copy' }) {
    const record = this.record(id);
    if (!record.projectDirectory) throw new Error('请先将白板另存为项目文件夹');
    if (!Array.isArray(paths) || !paths.length || paths.length > 20 || !['copy', 'reference'].includes(mode)) throw new Error('一次最多添加 20 个文件');
    const entities = [];
    for (const source of paths) {
      if (typeof source !== 'string' || !path.isAbsolute(source)) throw new Error('文件路径无效');
      const stat = fs.lstatSync(source);
      if (!stat.isFile() || stat.size > 512 * 1024 * 1024) throw new Error('仅支持普通文件，单个文件不能超过 512 MB');
    }
    for (const source of paths) {
      const stat = fs.lstatSync(source), extension = path.extname(source).toLowerCase();
      const image = ['.png', '.jpg', '.jpeg', '.webp'].includes(extension);
      const details = { width: '360', height: image ? '240' : '140', ...(image ? { fit: 'contain' } : { fileSize: String(stat.size) }) };
      if (mode === 'copy') {
        const suffix = /^[.a-z0-9]{1,12}$/.test(extension) ? extension : '.bin';
        details.assetPath = `assets/${crypto.randomUUID()}${suffix}`;
        const destination = this._assetFile(record.projectDirectory, details.assetPath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
      } else details.referencePath = source;
      entities.push({ id: `entity_${crypto.randomUUID().replace(/-/g, '')}`, type: image ? 'image' : 'attachment', name: path.basename(source), source: 'manual', details });
    }
    if (mode === 'reference') {
      const records = this._records(), target = records.find(item => item.id === id);
      target.approvedReferences = [...new Set([...(target.approvedReferences || []), ...paths])];
      this._writeRecords(records);
    }
    return entities;
  }

  inspectAssets(id) {
    const record = this.record(id);
    this._revision(record.path);
    const store = Model.assertValidStore(unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(record.path, 'utf8'))).store);
    return store.entities.filter(entity => ['image', 'attachment'].includes(entity.type)).map(entity => {
      const details = entity.details;
      try {
        if (details.imageData) return { entityId: entity.id, imageData: details.imageData, state: 'available' };
        let filePath;
        if (details.assetPath && record.projectDirectory) filePath = this._assetFile(record.projectDirectory, details.assetPath);
        else if (details.referencePath && record.approvedReferences?.includes(details.referencePath)) filePath = details.referencePath;
        else return { entityId: entity.id, state: 'unapproved', message: '外部引用未授权，请重新选择文件' };
        if (!filePath || !fs.lstatSync(filePath).isFile()) throw new Error('资源缺失');
        return { entityId: entity.id, filePath, state: 'available', size: fs.statSync(filePath).size };
      } catch (_) { return { entityId: entity.id, state: 'missing', message: '资源缺失，白板仍可编辑' }; }
    });
  }

  remove(id) { this._writeRecords(this._records().filter(item => item.id !== id)); return this.list(); }
}

module.exports = { WhiteboardDocumentService };
