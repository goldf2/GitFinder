const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Model = require('../src/shared/relationshipGraphModel');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');
const { WhiteboardDocumentService } = require('../src/main/services/whiteboardDocumentService');
const { packRegions } = require('../src/shared/panelTopologyProjection');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function sample() {
  return Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_document1', entities: [
    { id: 'entity_text0001', type: 'text', name: '部署说明', details: { content: '第一行\n第二行 <script>', color: '#123456', fontSize: '32', align: 'center', width: '320', height: '160' } },
    { id: 'entity_image001', type: 'image', name: '截图', details: { imageData: png, width: '280', height: '180', fit: 'cover' } },
    { id: 'entity_group001', type: 'group', name: '分组', details: {} }
  ], relationships: [], boards: [{ id: 'board_document1', name: '生产部署', viewport: { x: 42, y: 73, zoom: 0.8 }, view: { query: '第一行' }, placements: [
    { entityId: 'entity_text0001', x: 60, y: 90, groupId: 'entity_group001', locked: true, expanded: true },
    { entityId: 'entity_image001', x: 420, y: 90, groupId: 'entity_group001' }, { entityId: 'entity_group001', x: 0, y: 0, groupBackground: '#123456' }
  ] }] });
}

test('独立白板文件往返包含图片、文字换行、分组、位置、筛选和展开状态', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-doc-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = new WhiteboardDocumentService({ baseDirectory: path.join(dir, 'app') });
  const file = path.join(dir, 'one.gitfinder-board.json');
  const saved = service.save({ store: sample() }, file);
  assert.equal(JSON.parse(fs.readFileSync(file)).formatVersion, 2);
  assert.deepEqual(service.open(saved.record.id).store, sample());
  assert.equal(service.list().length, 1);
  const next = sample(); next.boards[0].name = '重命名';
  service.save({ id: saved.record.id, revision: saved.record.revision, store: next });
  assert.equal(service.list()[0].name, '重命名');
  service.remove(saved.record.id);
  assert.ok(fs.existsSync(file), '移除记录不能删除文件');
  assert.equal(service.list().length, 0);
});

test('外部修改、删除、未知 ID 和符号链接不能被静默覆盖，缺失记录仍保留', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-doc-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = new WhiteboardDocumentService({ baseDirectory: path.join(dir, 'app') });
  const file = path.join(dir, 'one.json');
  const saved = service.save({ store: sample() }, file);
  fs.appendFileSync(file, '\n');
  assert.throws(() => service.save({ id: saved.record.id, revision: saved.record.revision, store: sample() }), /外部修改/);
  assert.throws(() => service.save({ id: '../other', store: sample() }), /不在资源库/);
  const link = path.join(dir, 'link.json'); fs.symlinkSync(file, link);
  assert.throws(() => service.openPath(link), /普通白板文件/);
  fs.unlinkSync(file);
  assert.equal(service.list()[0].missing, true);
});

test('媒体模型拒绝外部地址、SVG和脚本；文字按纯文本保留', () => {
  for (const imageData of ['https://evil.example/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)']) {
    const store = sample(); store.entities[1].details.imageData = imageData;
    assert.throws(() => Model.assertValidStore(store), /内嵌/);
  }
  const c = new Controller({ bridge: {} }); c.store = sample();
  const flowSource = fs.readFileSync(path.join(__dirname, '../src/renderer/relationship-canvas/index.jsx'), 'utf8');
  assert.match(flowSource, /\{details\.content \|\| entity\.name\}/);
  assert.doesNotMatch(flowSource, /dangerouslySetInnerHTML/);
  assert.match(flowSource, /fontSize: `\$\{Number\(details\.fontSize\) \|\| 24\}px`/);
  assert.equal(c._displayGeometryMap(c.store.boards[0].placements).get('entity_image001').height, 180);
});

test('分组布局使用真实高度、宽度打包，多行项目矩形互不重叠', () => {
  const regions = [{ width: 800, height: 1900 }, { width: 400, height: 200 }, { width: 1100, height: 700 }, { width: 500, height: 300 }, { width: 900, height: 900 }];
  const positions = packRegions(regions, 1.8);
  regions.forEach((a, i) => regions.forEach((b, j) => {
    if (i >= j) return;
    const p = positions[i], q = positions[j];
    assert.ok(p.x + a.width <= q.x || q.x + b.width <= p.x || p.y + a.height <= q.y || q.y + b.height <= p.y);
  }));
  assert.deepEqual(packRegions([], 1.8), []);
});

test('文件编辑不写入本机白板合集，只刷新已有资源运行时，不注入额外部署', async () => {
  let localWrites = 0; const writes = [];
  const c = new Controller({ bridge: { relationshipBoards: { save: async () => localWrites++, saveDocument: async request => { writes.push(request); return { record: { revision: `v${writes.length}` } }; } } } });
  c.store = sample(); c.documentRecord = { id: 'doc1', revision: 'v0' };
  c.panelProjection = { entities: [{ id: 'entity_extra001', type: 'server', name: 'other', details: {} }], placements: [{ entityId: 'entity_extra001', dynamic: true, x: 0, y: 0 }], relationships: [] };
  assert.equal(c._combinedPlacements().length, 3);
  await c._persistNow(); await c._persistNow();
  assert.equal(localWrites, 0); assert.equal(writes[1].revision, 'v1');
  assert.equal(writes[0].store.entities.length, 3);
  assert.equal(writes[0].store.entities[1].details.imageData, png);
});

test('独立文件禁止合集导入，首次保存文件后撤销不能还原成本机合集', async () => {
  let previews = 0;
  const c = new Controller({ bridge: { relationshipBoards: {
    save: async () => true,
    saveDocument: async () => ({ record: { id: 'doc1', revision: 'v1' } }),
    previewImport: async () => previews++
  } } });
  c.store = sample(); c.undoStack = [{ old: 'local workspace' }];
  c.render = () => {}; c._refreshDocumentLibrary = async () => {};
  await c._saveDocument();
  assert.equal(c.documentRecord.id, 'doc1');
  assert.deepEqual(c.undoStack, []);
  assert.equal(await c._importRelationshipJson(), false);
  assert.equal(previews, 0);
});

test('白板项目文件夹保存媒体，复制与引用独立，移动项目仍能解析相对附件', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-project-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = new WhiteboardDocumentService({ baseDirectory: path.join(dir, 'app') });
  const project = await service.createProject({ store: sample() }, path.join(dir, 'one'));
  assert.ok(project.record.projectDirectory.endsWith('.gitfinder-board'));
  assert.ok(fs.existsSync(path.join(project.record.projectDirectory, 'board.json')));
  assert.equal(project.store.entities[1].details.imageData, undefined);
  assert.ok(fs.existsSync(path.join(project.record.projectDirectory, project.store.entities[1].details.assetPath)));
  const external = path.join(dir, 'external-note.txt'); fs.writeFileSync(external, 'outside managed locations');
  const copied = await service.attachFiles({ id: project.record.id, paths: [external] });
  const linked = await service.attachFiles({ id: project.record.id, paths: [external], mode: 'reference' });
  assert.ok(copied[0].details.assetPath); assert.equal(linked[0].details.referencePath, external);
  project.store.entities.push(...copied, ...linked);
  project.store.boards[0].placements.push(...[...copied, ...linked].map((entity, index) => ({ entityId: entity.id, x: index * 400, y: 500 })));
  const saved = service.save({ id: project.record.id, revision: project.record.revision, store: project.store });
  assert.equal(service.inspectAssets(saved.record.id).filter(item => item.state === 'available').length, 3);
  fs.unlinkSync(external);
  const status = service.inspectAssets(saved.record.id);
  assert.equal(status.find(item => item.entityId === copied[0].id).state, 'available');
  assert.equal(status.find(item => item.entityId === linked[0].id).state, 'missing');
  const moved = path.join(dir, 'moved.gitfinder-board'); fs.renameSync(project.record.projectDirectory, moved);
  const reopened = service.openPath(moved);
  assert.equal(service.inspectAssets(reopened.record.id).find(item => item.entityId === copied[0].id).state, 'available');
  assert.equal(service.inspectAssets(reopened.record.id).find(item => item.entityId === linked[0].id).state, 'unapproved');
  assert.equal(reopened.store.entities.length, 5);
});

test('附件拒绝目录穿越、符号链接，导入项目不自动读取未经选择的外部引用', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-project-safety-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = new WhiteboardDocumentService({ baseDirectory: path.join(dir, 'app') });
  const data = sample(); delete data.entities[1].details.imageData;
  data.entities[1].details.assetPath = 'assets/../outside.png';
  assert.throws(() => Model.assertValidStore(data), /相对路径/);
  delete data.entities[1].details.assetPath;
  data.entities[1].details.referencePath = path.join(dir, 'not-selected.png');
  fs.writeFileSync(data.entities[1].details.referencePath, 'not a photo');
  const project = await service.createProject({ store: data }, path.join(dir, 'test'));
  const status = service.inspectAssets(project.record.id)[0];
  assert.equal(status.state, 'unapproved'); assert.equal(status.filePath, undefined);
  const link = path.join(dir, 'link.png'); fs.symlinkSync(data.entities[1].details.referencePath, link);
  await assert.rejects(service.attachFiles({ id: project.record.id, paths: [link] }), /普通文件/);
  await assert.rejects(service.createProject({ store: data }, project.record.projectDirectory), /已存在/);
});

test('卡片宽高统一配置可保存，缩放保持兼容且文字图片尺寸不受影响', () => {
  const c = new Controller({ bridge: {} }); c.store = sample();
  Object.assign(c.store.boards[0].view, { cardWidth: 400, cardHeight: 240 });
  c.store = Model.assertValidStore(c.store);
  assert.deepEqual(c._nodeDimensions(), { width: 400, height: 240 });
  assert.equal(c._displayGeometryMap(c.store.boards[0].placements).get('entity_text0001').width, 320);
  c.store.boards[0].view.cardScale = 1.2;
  assert.deepEqual(c._nodeDimensions(), { width: 480, height: 288 });
  const adapterSource = fs.readFileSync(path.join(__dirname, '../src/shared/relationshipFlowAdapter.js'), 'utf8');
  assert.match(adapterSource, /\['text', 'image', 'attachment'\]\.includes\(entity\.type\)/);
});
