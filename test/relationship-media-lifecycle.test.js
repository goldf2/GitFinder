const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');
const tick = () => new Promise(resolve => setImmediate(resolve));
const imageId = 'entity_media001';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

function sample() {
  return Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_media001', entities: [
    { id: imageId, type: 'image', name: '原图片', details: { assetPath: 'assets/old.png', width: '280', height: '180', fit: 'contain' } },
    { id: 'entity_text0001', type: 'text', name: '说明', details: { content: '原文字' } }
  ], relationships: [], boards: [{ id: 'board_media001', name: '媒体回归', viewport: { x: 0, y: 0, zoom: 1 }, placements: [
    { entityId: imageId, x: 40, y: 40 }, { entityId: 'entity_text0001', x: 400, y: 40 }
  ] }] });
}
function fixture(t) {
  const notices = [], calls = [];
  const c = new Controller({ bridge: { relationshipBoards: {} }, notify: message => notices.push(message) });
  c.store = sample(); c.documentRecord = { id: 'doc-media', revision: 'v1', projectDirectory: '/fixture/one.gitfinder-board' };
  c._renderGraph = () => calls.push('render');
  c.render = c._recordMutation = c._finishBoardMutation = () => {};
  t.after(() => { if (c.saveTimer) clearTimeout(c.saveTimer); });
  return { c, notices, calls };
}
const image = c => c.store.entities.find(item => item.id === imageId);
const projectedImage = c => c._flowGraphInput({ placements: c.store.boards[0].placements, relationships: [] }, []).entities.find(item => item.id === imageId);
const response = imageData => [{ entityId: imageId, state: 'available', imageData }];
const values = (replace = 'replace') => ({ name: '更新图片', caption: '新说明', fit: 'contain', width: '280', height: '180', replace });

// A second valid PNG with different pixels for byte-level round trips.
function bluePixel() {
  const crc32 = require('buffer-crc32'), zlib = require('node:zlib');
  const chunk = (type, bytes) => {
    const body = Buffer.concat([Buffer.from(type), bytes]), size = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length); return Buffer.concat([size, body, crc32(body)]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 80, 240, 255]))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

test('真实项目保存替换图片后恢复旧路径，预览与磁盘都恢复而不丢附件', async t => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { WhiteboardDocumentService } = require('../src/main/services/whiteboardDocumentService');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-media-roundtrip-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = new WhiteboardDocumentService({ baseDirectory: path.join(dir, 'profile') });
  const { c, notices } = fixture(t); image(c).details = { imageData: png, width: '280', height: '180' };
  const project = await service.createProject({ store: c.store }, path.join(dir, 'media'));
  c.store = project.store; c.documentRecord = project.record;
  const original = structuredClone(c.store), originalPath = image(c).details.assetPath;
  c.bridge.relationshipBoards.saveDocument = async request => service.save(request);
  c.bridge.relationshipBoards.getAssets = async id => service.inspectAssets(id).map(item => ({ ...item,
    ...(item.filePath ? { imageData: 'data:image/png;base64,' + fs.readFileSync(item.filePath).toString('base64') } : {}) }));
  await c._refreshDocumentAssets(); assert.equal(projectedImage(c).details.imageData, png);
  image(c).details.imageData = bluePixel(); delete image(c).details.assetPath;
  await c._persistNow(); await tick();
  const replacedPath = image(c).details.assetPath;
  assert.notEqual(replacedPath, originalPath); assert.equal(projectedImage(c).details.imageData, bluePixel());
  assert.equal(fs.readFileSync(path.join(project.record.projectDirectory, originalPath)).toString('base64'), png.split(',')[1]);
  c.store = original;
  await c._persistNow(); await tick();
  assert.equal(projectedImage(c).details.imageData, png, '恢复旧图片路径后也必须重新读取对应预览');
  const opened = service.open(project.record.id);
  assert.equal(opened.store.entities[0].details.assetPath, originalPath);
  assert.ok(fs.existsSync(path.join(project.record.projectDirectory, replacedPath)), '不清理可能仍供撤销使用的旧资源');
  assert.doesNotMatch(fs.readFileSync(project.record.path, 'utf8'), /sourceKey|old-preview|new-preview/);
  assert.deepEqual(notices, []);
});

test('仅文字变化的保存不重复读取图片，移除媒体后清掉旧预览缓存', async t => {
  const { c } = fixture(t); let reads = 0;
  c.bridge.relationshipBoards.getAssets = async () => { reads++; return image(c) ? response('cached') : []; };
  c.bridge.relationshipBoards.saveDocument = async request => ({ record: { revision: String(reads) }, store: request.store });
  await c._refreshDocumentAssets();
  c.store.entities[1].details.content = '仅修改文字';
  await c._persistNow(); await tick(); assert.equal(reads, 1);
  c.store.entities = c.store.entities.filter(item => item.id !== imageId);
  c.store.boards[0].placements = c.store.boards[0].placements.filter(item => item.entityId !== imageId);
  await c._persistNow(); await tick(); assert.equal(reads, 2); assert.equal(c.documentAssets.size, 0);
});

test('当前媒体读取错误仍有提示，随后重试可恢复缓存', async t => {
  const { c, notices } = fixture(t);
  c.bridge.relationshipBoards.getAssets = async () => { throw new Error('read failed'); };
  await c._refreshDocumentAssets(); assert.match(notices[0], /read failed/);
  c.bridge.relationshipBoards.getAssets = async () => response('recovered');
  await c._refreshDocumentAssets(); assert.equal(projectedImage(c).details.imageData, 'recovered');
});

test('同一白板连续读取媒体，迟到的旧响应不覆盖较新的缓存', async t => {
  const { c, calls } = fixture(t), requests = [];
  c.bridge.relationshipBoards.getAssets = () => new Promise(resolve => requests.push(resolve));
  const first = c._refreshDocumentAssets(), second = c._refreshDocumentAssets();
  requests[1](response('new-preview')); await second;
  requests[0](response('old-preview')); await first;
  assert.equal(c.documentAssets.get(imageId).imageData, 'new-preview');
  assert.equal(calls.length, 1);
});

test('切换白板后旧媒体读取失败不弹出当前文档的错误', async t => {
  const { c, notices } = fixture(t); let reject;
  c.bridge.relationshipBoards.getAssets = () => new Promise((_resolve, fail) => { reject = fail; });
  const reading = c._refreshDocumentAssets();
  c.documentRecord = { id: 'other-document', revision: 'v1' };
  reject(new Error('old document unavailable')); await reading;
  assert.deepEqual(notices, []);
});

test('重置同一文档或更新文件版本使正在读取的旧媒体失效', async t => {
  for (const operation of ['reset', 'revision']) {
    const { c, calls } = fixture(t); let resolve;
    c.bridge.relationshipBoards.getAssets = () => new Promise(done => { resolve = done; });
    const reading = c._refreshDocumentAssets();
    if (operation === 'reset') c._resetDocumentSelection(); else c.documentRecord.revision = 'v2';
    resolve(response('stale-preview')); await reading;
    assert.equal(c.documentAssets.size, 0, operation); assert.equal(calls.length, 0, operation);
  }
});

test('替换图片后的新内嵌内容不被原文件缩略图覆盖', async t => {
  const { c } = fixture(t);
  c.bridge.relationshipBoards.getAssets = async () => response('old-preview');
  await c._refreshDocumentAssets();
  image(c).details.imageData = png; delete image(c).details.assetPath;
  assert.equal(projectedImage(c).details.imageData, png);
  assert.equal(image(c).details.imageData, png, '投影不能修改源数据');
});

test('撤销或保存改变图片路径时，不拿相同实体ID的旧缓存充当新图片', async t => {
  const { c } = fixture(t);
  c.bridge.relationshipBoards.getAssets = async () => response('old-preview');
  await c._refreshDocumentAssets();
  assert.equal(projectedImage(c).details.imageData, 'old-preview');
  image(c).details.assetPath = 'assets/new.png';
  assert.equal(projectedImage(c).details.imageData, undefined);
  c.bridge.relationshipBoards.getAssets = async () => response('new-preview');
  await c._refreshDocumentAssets(); assert.equal(projectedImage(c).details.imageData, 'new-preview');
});

test('等待替换图片选择时，其他元素的新编辑不能被旧白板快照覆盖', async t => {
  const { c } = fixture(t); let resolve;
  c._openFormDialog = async () => values();
  c.bridge.relationshipBoards.pickImage = () => new Promise(done => { resolve = done; });
  const editing = c._editCanvasElement(imageId); await tick();
  c.store.entities[1].details.content = '选择期间的新文字';
  resolve({ data: png }); await editing;
  assert.equal(c.store.entities[1].details.content, '选择期间的新文字');
  assert.equal(image(c).details.imageData, png); assert.equal(image(c).details.assetPath, undefined);
});

test('选择替换图片期间切换到其他文档，旧结果不能写入新白板', async t => {
  const { c } = fixture(t); let resolve;
  c._openFormDialog = async () => values();
  c.bridge.relationshipBoards.pickImage = () => new Promise(done => { resolve = done; });
  const editing = c._editCanvasElement(imageId); await tick();
  c.documentRecord = { id: 'other-document', revision: 'v1' };
  c.store = sample(); c.store.boards[0].name = '另一白板';
  const before = structuredClone(c.store);
  resolve({ data: png }); await editing;
  assert.deepEqual(c.store, before);
});

test('属性对话框等待期间媒体已保存为新路径，编辑说明不得恢复旧路径', async t => {
  const { c } = fixture(t); let resolve;
  c._openFormDialog = () => new Promise(done => { resolve = done; });
  const editing = c._editCanvasElement(imageId);
  image(c).details = { ...image(c).details, assetPath: 'assets/materialized.png' };
  resolve(values('keep')); await editing;
  assert.equal(image(c).details.assetPath, 'assets/materialized.png');
  assert.equal(image(c).details.caption, '新说明');
});

test('图片选择未结束时删除该元素，返回后不复活已删除图片', async t => {
  const { c } = fixture(t); let resolve;
  c._openFormDialog = async () => values();
  c.bridge.relationshipBoards.pickImage = () => new Promise(done => { resolve = done; });
  const editing = c._editCanvasElement(imageId); await tick();
  c.store.entities = c.store.entities.filter(item => item.id !== imageId);
  c.store.boards[0].placements = c.store.boards[0].placements.filter(item => item.entityId !== imageId);
  resolve({ data: png }); await editing;
  assert.equal(image(c), undefined);
});

test('添加图片选择期间切换白板，不将图片落入另一个目标', async t => {
  const { c } = fixture(t); let resolve, additions = 0;
  c.documentRecord = null;
  c.bridge.relationshipBoards.pickImage = () => new Promise(done => { resolve = done; });
  c._addEntity = () => additions++;
  const adding = c._createCanvasElement('image');
  c.documentRecord = { id: 'other-document', revision: 'v1' };
  resolve({ data: png, name: '图片', width: 64, height: 64 }); await adding;
  assert.equal(additions, 0);
});

test('添加文件确认期间切换文档，不向后来打开的项目复制附件', async t => {
  const { c } = fixture(t); let resolve, copies = 0;
  c._openFormDialog = () => new Promise(done => { resolve = done; });
  c.bridge.relationshipBoards.attachFiles = async () => { copies++; return []; };
  const adding = c._addFiles(['/fixture/note.txt'], { x: 40, y: 40 });
  c.documentRecord = { id: 'other-document', revision: 'v1', projectDirectory: '/fixture/other.gitfinder-board' };
  resolve({ mode: 'copy' }); await adding;
  assert.equal(copies, 0);
});
