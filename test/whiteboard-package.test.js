const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pipeline } = require('node:stream/promises');
const yazl = require('yazl');
const yauzl = require('yauzl');
const { WhiteboardDocumentService } = require('../src/main/services/whiteboardDocumentService');
const { WhiteboardPackageService } = require('../src/main/services/whiteboardPackageService');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-package-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const documents = new WhiteboardDocumentService({ baseDirectory: path.join(root, 'app') });
  return { root, documents, packages: new WhiteboardPackageService(documents) };
}
function store() {
  return { schemaVersion: 1, activeBoardId: 'board_package01', entities: [
    { id: 'entity_note0001', type: 'text', name: '说明', details: { content: '发布说明' } }
  ], relationships: [], boards: [{ id: 'board_package01', name: '跨平台白板', viewport: { x: 35, y: 90, zoom: 0.8 }, placements: [{ entityId: 'entity_note0001', x: 100, y: 200, note: '备注' }] }] };
}
async function archive(file, entries) {
  const zip = new yazl.ZipFile();
  const writing = pipeline(zip.outputStream, fs.createWriteStream(file));
  for (const entry of entries) zip.addBuffer(Buffer.from(entry.data), entry.name, { compress: false, ...entry.options });
  zip.end(); await writing;
}

test('GFB 是标准 ZIP：复制附件和已授权引用可携带，原项目不变，导入可再保存', async t => {
  const { root, documents, packages } = fixture(t);
  const project = await documents.createProject({ store: store() }, path.join(root, 'original'));
  const external = path.join(root, '外部说明.txt'); fs.writeFileSync(external, 'hello media');
  const copied = await documents.attachFiles({ id: project.record.id, paths: [external] });
  const referenced = await documents.attachFiles({ id: project.record.id, paths: [external], mode: 'reference' });
  project.store.entities.push(...copied, ...referenced);
  project.store.boards[0].placements.push(...[...copied, ...referenced].map((e, i) => ({ entityId: e.id, x: i * 350, y: 300, expanded: true })));
  const before = JSON.stringify(project.store);
  const file = path.join(root, 'example.gfb');
  const result = await packages.exportPackage({ id: project.record.id, store: project.store, collectReferences: true }, file);
  assert.equal(result.assetCount, 2); assert.deepEqual(result.warnings, []);
  assert.equal(JSON.stringify(project.store), before);
  assert.equal(fs.readFileSync(file).readUInt32LE(), 0x04034b50);
  const zip = await yauzl.openPromise(file);
  const names = []; for await (const entry of zip.eachEntry()) names.push(entry.fileName);
  assert.equal(names[0], 'board.json'); assert.equal(names.length, 3);
  fs.unlinkSync(external);
  const imported = await packages.importPackage(file, path.join(root, 'imported'));
  assert.equal(imported.record.projectDirectory, path.join(root, 'imported.gitfinder-board'));
  assert.deepEqual(imported.store.boards, project.store.boards);
  assert.equal(documents.inspectAssets(imported.record.id).filter(a => a.state === 'available').length, 2);
  assert.ok(imported.store.entities.slice(1).every(e => e.details.assetPath && !e.details.referencePath));
  const saved = documents.save({ ...imported.record, store: imported.store });
  assert.equal(documents.open(saved.record.id).store.entities.length, 3);
  assert.equal(documents.list().length, 2);
});

test('缺失附件保留元素，外部引用可保留但导入不自动授权，不复制无关文件或仓库', async t => {
  const { root, documents, packages } = fixture(t);
  const project = await documents.createProject({ store: store() }, path.join(root, 'original'));
  const external = path.join(root, 'note.txt'); fs.writeFileSync(external, 'external');
  const [reference] = await documents.attachFiles({ id: project.record.id, paths: [external], mode: 'reference' });
  project.store.entities.push(reference, { id: 'entity_missing1', type: 'image', name: '丢失图片', details: { assetPath: 'assets/missing.png' } });
  project.store.boards[0].placements.push({ entityId: reference.id, x: 0, y: 0 }, { entityId: 'entity_missing1', x: 500, y: 0 });
  fs.writeFileSync(path.join(project.record.projectDirectory, 'private.txt'), 'must not include');
  const file = path.join(root, 'references.gfb');
  const output = await packages.exportPackage({ id: project.record.id, store: project.store, collectReferences: false }, file);
  assert.equal(output.warnings.length, 2); assert.equal(output.assetCount, 0);
  const imported = await packages.importPackage(file, path.join(root, 'imported'));
  assert.equal(imported.store.entities.length, 3); assert.equal(imported.warnings.length, 2);
  assert.deepEqual(documents.inspectAssets(imported.record.id).map(a => a.state), ['unapproved', 'missing']);
  assert.equal(fs.existsSync(path.join(imported.record.projectDirectory, 'private.txt')), false);
});

test('非法 ZIP、穿越路径、重复名、符号链接、超限、凭据和损坏文件拒绝导入且不留项目', async t => {
  const { root, documents, packages } = fixture(t);
  const board = JSON.stringify(documents.exporter.createEnvelope(store()));
  const cases = [
    [{ name: 'other.json', data: board }],
    [{ name: 'board.json', data: board }, { name: 'board.json', data: board }],
    [{ name: 'board.json', data: board }, { name: 'assets/link', data: 'target', options: { mode: 0o120777 } }],
    [{ name: 'board.json', data: board }, { name: 'assets/unrelated.txt', data: 'private' }],
    [{ name: 'board.json', data: board.replace('发布说明', 'token=do-not-import') }]
  ];
  for (const [i, entries] of cases.entries()) {
    const source = path.join(root, `bad${i}.gfb`);
    await archive(source, entries);
    await assert.rejects(packages.importPackage(source, path.join(root, `bad${i}`)));
    assert.equal(fs.existsSync(path.join(root, `bad${i}.gitfinder-board`)), false);
  }
  for (const mutation of ['traversal', 'large', 'corrupt']) {
    const file = path.join(root, `${mutation}.gfb`);
    await archive(file, [{ name: 'board.json', data: board }]);
    const bytes = fs.readFileSync(file), central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (mutation === 'traversal') bytes.write('../bad.txt', central + 46);
    if (mutation === 'large') bytes.writeUInt32LE(33 * 1024 * 1024, central + 24);
    if (mutation === 'corrupt') bytes[30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28) + 5] ^= 1;
    fs.writeFileSync(file, bytes);
    await assert.rejects(packages.importPackage(file, path.join(root, mutation)));
  }
  assert.equal(documents.list().length, 0);
  assert.equal(fs.readdirSync(root).some(name => name.startsWith('.gfb-import-')), false);
});

test('导入不覆盖已有项目，导出失败不损坏已有白板包', async t => {
  const { root, documents, packages } = fixture(t);
  const existing = path.join(root, 'saved.gfb'); fs.writeFileSync(existing, 'previous');
  const invalid = store(); invalid.entities[0].details.content = 'password=do-not-export';
  await assert.rejects(packages.exportPackage({ store: invalid }, existing), /凭据|密码|令牌/);
  assert.equal(fs.readFileSync(existing, 'utf8'), 'previous');
  await packages.exportPackage({ store: store() }, existing);
  const target = await documents.createProject({ store: store() }, path.join(root, 'existing'));
  await assert.rejects(packages.importPackage(existing, target.record.projectDirectory), /已存在/);
  assert.equal(documents.list().length, 1);
});
