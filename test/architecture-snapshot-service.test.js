const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ArchitectureSnapshotService, validateDocument } = require('../src/main/services/architectureSnapshotService');

function makeTempRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-archify-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function validSnapshot() {
  return {
    schema_version: 2,
    diagram_type: 'architecture',
    meta: { title: 'GitFinder 代码架构' },
    components: [],
    boundaries: [],
    connections: []
  };
}

test('validates Archify snapshot identity and diagram type', () => {
  assert.deepEqual(validateDocument(validSnapshot()), {
    schemaVersion: 2,
    diagramType: 'architecture',
    title: 'GitFinder 代码架构'
  });
  assert.throws(() => validateDocument({ ...validSnapshot(), diagram_type: 'unknown' }), /不支持的 Archify 图类型/);
  assert.throws(() => validateDocument({ ...validSnapshot(), meta: {} }), /缺少 meta.title/);
});

test('imports, lists and resolves an offline architecture snapshot', () => {
  const repoPath = makeTempRepository();
  const sourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-archify-source-'));
  const sourcePath = path.join(sourceDirectory, 'architecture.json');
  fs.writeFileSync(sourcePath, `${JSON.stringify(validSnapshot())}\n`);
  fs.writeFileSync(path.join(sourceDirectory, 'architecture.html'), '<!doctype html><title>Archify</title>');
  const service = new ArchitectureSnapshotService({ now: () => new Date('2026-09-05T14:00:00.000Z') });

  assert.deepEqual(service.list(repoPath), []);
  assert.equal(fs.existsSync(path.join(repoPath, '.gitfinder')), false);

  const imported = service.importFile(repoPath, sourcePath);
  assert.match(imported.snapshotId, /^[a-f0-9]{16}$/);
  assert.equal(imported.diagramType, 'architecture');
  assert.equal(imported.repositoryHead, '');
  assert.equal(imported.generatedAt, '2026-09-05T14:00:00.000Z');
  assert.ok(fs.existsSync(imported.jsonPath));
  assert.ok(fs.existsSync(imported.htmlPath));

  const listed = service.list(repoPath);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].snapshotId, imported.snapshotId);
  assert.equal(service.resolve(repoPath, imported.snapshotId, 'json'), imported.jsonPath);
  assert.equal(service.resolve(repoPath, imported.snapshotId, 'html'), imported.htmlPath);

  fs.rmSync(repoPath, { recursive: true, force: true });
  fs.rmSync(sourceDirectory, { recursive: true, force: true });
});

test('rejects symlinked snapshot sources', () => {
  const repoPath = makeTempRepository();
  const sourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-archify-source-'));
  const sourcePath = path.join(sourceDirectory, 'architecture.json');
  fs.writeFileSync(sourcePath, JSON.stringify(validSnapshot()));
  const linkPath = path.join(sourceDirectory, 'linked.json');
  fs.symlinkSync(sourcePath, linkPath);
  const service = new ArchitectureSnapshotService();
  assert.throws(() => service.importFile(repoPath, linkPath), /普通文件/);
  fs.rmSync(repoPath, { recursive: true, force: true });
  fs.rmSync(sourceDirectory, { recursive: true, force: true });
});
