const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const DIRECTORY = '.gitfinder';
const SNAPSHOT_DIRECTORY = 'architecture';
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_HTML_BYTES = 32 * 1024 * 1024;
const DIAGRAM_TYPES = Object.freeze(['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle']);
const SNAPSHOT_ID_PATTERN = /^[a-f0-9]{16}$/;

function cleanText(value, fallback = '', maxLength = 240) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

function ensureDirectory(directory) {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('架构快照目录必须是普通文件夹');
}

function ensureRegularFile(filePath, maxBytes) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('架构快照必须是普通文件');
  if (stat.size > maxBytes) throw new Error('架构快照文件过大');
  return stat;
}

function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

function readHead(repoPath) {
  try {
    return execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore']
    }).trim().slice(0, 80);
  } catch (_) {
    return '';
  }
}

function validateDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Archify 快照必须是 JSON 对象');
  }
  const schemaVersion = Number(document.schema_version);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > 9) {
    throw new Error('Archify 快照缺少有效 schema_version');
  }
  const diagramType = String(document.diagram_type || '');
  if (!DIAGRAM_TYPES.includes(diagramType)) {
    throw new Error(`不支持的 Archify 图类型：${diagramType || '未知'}`);
  }
  const title = cleanText(document.meta?.title);
  if (!title) throw new Error('Archify 快照缺少 meta.title');
  return { schemaVersion, diagramType, title };
}

class ArchitectureSnapshotService {
  constructor(options = {}) {
    this.now = options.now || (() => new Date());
  }

  _root(repoPath, create = true) {
    const root = path.join(path.resolve(repoPath), DIRECTORY, SNAPSHOT_DIRECTORY);
    if (create) {
      ensureDirectory(path.dirname(root));
      ensureDirectory(root);
    }
    return root;
  }

  _recordFromDirectory(repoPath, directoryName) {
    if (!SNAPSHOT_ID_PATTERN.test(directoryName)) return null;
    const root = path.join(this._root(repoPath), directoryName);
    const metadataPath = path.join(root, 'metadata.json');
    const jsonPath = path.join(root, 'architecture.json');
    if (!fs.existsSync(metadataPath) || !fs.existsSync(jsonPath)) return null;
    try {
      ensureRegularFile(metadataPath, 256 * 1024);
      ensureRegularFile(jsonPath, MAX_JSON_BYTES);
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      return {
        ...metadata,
        snapshotId: directoryName,
        jsonPath,
        htmlPath: fs.existsSync(path.join(root, 'architecture.html')) ? path.join(root, 'architecture.html') : ''
      };
    } catch (_) {
      return null;
    }
  }

  list(repoPath) {
    const root = this._root(repoPath, false);
    if (!fs.existsSync(root)) return [];
    ensureDirectory(root);
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => this._recordFromDirectory(repoPath, entry.name))
      .filter(Boolean)
      .sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)));
  }

  importFile(repoPath, sourcePath) {
    const absoluteRepoPath = path.resolve(repoPath);
    const absoluteSourcePath = path.resolve(sourcePath);
    ensureRegularFile(absoluteSourcePath, MAX_JSON_BYTES);
    const source = fs.readFileSync(absoluteSourcePath, 'utf8');
    let document;
    try { document = JSON.parse(source); } catch (error) { throw new Error(`Archify 快照 JSON 无法解析：${error.message || String(error)}`); }
    const info = validateDocument(document);
    const head = readHead(absoluteRepoPath);
    const snapshotId = crypto.createHash('sha256')
      .update(`${head}\n${source}`, 'utf8').digest('hex').slice(0, 16);
    const root = path.join(this._root(absoluteRepoPath), snapshotId);
    ensureDirectory(root);
    atomicWrite(path.join(root, 'architecture.json'), `${JSON.stringify(document, null, 2)}\n`);

    const htmlCandidate = absoluteSourcePath.replace(/\.json$/i, '.html');
    let htmlPath = '';
    if (htmlCandidate !== absoluteSourcePath && fs.existsSync(htmlCandidate)) {
      ensureRegularFile(htmlCandidate, MAX_HTML_BYTES);
      fs.copyFileSync(htmlCandidate, path.join(root, 'architecture.html'));
      htmlPath = path.join(root, 'architecture.html');
    }
    const metadata = {
      schemaVersion: 1,
      snapshotId,
      diagramType: info.diagramType,
      title: info.title,
      archifySchemaVersion: info.schemaVersion,
      repositoryHead: head,
      generatedAt: this.now().toISOString(),
      sourceFileName: path.basename(absoluteSourcePath)
    };
    atomicWrite(path.join(root, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    return { ...metadata, jsonPath: path.join(root, 'architecture.json'), htmlPath };
  }

  resolve(repoPath, snapshotId, format = 'json') {
    if (!SNAPSHOT_ID_PATTERN.test(String(snapshotId || ''))) throw new Error('架构快照标识无效');
    const filename = format === 'html' ? 'architecture.html' : 'architecture.json';
    const target = path.join(this._root(repoPath, false), snapshotId, filename);
    ensureRegularFile(target, format === 'html' ? MAX_HTML_BYTES : MAX_JSON_BYTES);
    return target;
  }
}

module.exports = {
  ArchitectureSnapshotService,
  DIAGRAM_TYPES,
  MAX_JSON_BYTES,
  MAX_HTML_BYTES,
  validateDocument
};
