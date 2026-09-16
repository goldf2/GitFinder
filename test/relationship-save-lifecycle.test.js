const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/shared/relationshipGraphModel');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');
const tick = () => new Promise(resolve => setImmediate(resolve));
function sample(name = '原内容') {
  return Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_lifecycle1',
    entities: [{ id: 'entity_lifecycle1', type: 'text', name, details: { content: name } }], relationships: [],
    boards: [{ id: 'board_lifecycle1', name: '保存回归', viewport: { x: 0, y: 0, zoom: 1 }, placements: [{ entityId: 'entity_lifecycle1', x: 40, y: 40 }] }] });
}
function fixture(t) {
  const notices = [], writes = [];
  const c = new Controller({ bridge: { relationshipBoards: {
    save: async store => { writes.push(structuredClone(store)); return { store }; }
  } }, notify: message => notices.push(message) });
  c.store = sample();
  c.render = c._setPanelTopology = () => {};
  c._refreshDocumentLibrary = c._refreshDocumentAssets = async () => {};
  t.after(() => { if (c.saveTimer) clearTimeout(c.saveTimer); });
  return { c, writes, notices };
}

test('立即保存消除同一修改尚未执行的防抖计时器', async t => {
  const { c, writes } = fixture(t);
  c._persistSoon(10000);
  await c._persistNow();
  assert.equal(c.saveTimer, null);
  assert.equal(writes.length, 1);
});

test('返回本机工作区期间锁住文档切换，避免其他打开请求交错', async t => {
  const { c } = fixture(t); let release, opened = 0;
  c.documentRecord = { id: 'doc-a', revision: 'v0' }; c.localWorkspace = sample('本机内容');
  c._persistNow = () => new Promise(resolve => { release = resolve; });
  c.bridge.relationshipBoards.openDocument = async () => { opened++; return { cancelled: true }; };
  const switching = c._showLocalWorkspace(); await tick();
  const busy = c.documentBusy;
  if (busy) await c._openDocument('doc-b');
  release(true); await switching;
  assert.equal(busy, true); assert.equal(opened, 0);
  assert.equal(c.documentBusy, false); assert.equal(c.documentRecord, null);
  assert.equal(c.store.entities[0].name, '本机内容');
});

test('本机工作区读取失败时保留原文档和内容，错误有提示且可重试', async t => {
  const { c, notices } = fixture(t);
  const record = { id: 'doc-a', revision: 'v0' }, store = c.store;
  c.documentRecord = record; c._persistNow = async () => true;
  c.bridge.relationshipBoards.get = async () => { throw new Error('workspace read failed'); };
  await assert.doesNotReject(c._showLocalWorkspace());
  assert.equal(c.documentRecord, record); assert.equal(c.store, store);
  assert.equal(c.documentBusy, false); assert.match(notices.at(-1), /workspace read failed/);
  c.bridge.relationshipBoards.get = async () => ({ store: sample('重试成功') });
  await c._showLocalWorkspace(); assert.equal(c.documentRecord, null);
  assert.equal(c.store.entities[0].name, '重试成功');
});

test('导入前保存失败立即中止，不继续读取旧磁盘快照发起合并', async t => {
  const { c } = fixture(t); let previews = 0;
  c._persistNow = async () => null;
  c.bridge.relationshipBoards.previewImport = async () => { previews++; return { cancelled: true }; };
  assert.equal(await c._importRelationshipJson(), false);
  assert.equal(previews, 0); assert.equal(c.importInFlight, false);
});

test('导入与其他文档操作互斥，取消后解除操作锁', async t => {
  const { c } = fixture(t); let previews = 0, release, opened = 0;
  c._persistNow = async () => ({ store: c.store });
  c.bridge.relationshipBoards.previewImport = () => { previews++; return new Promise(resolve => { release = resolve; }); };
  c.bridge.relationshipBoards.openDocument = async () => { opened++; return { cancelled: true }; };
  c.documentBusy = true;
  const blocked = c._importRelationshipJson(); await tick();
  if (release) release({ cancelled: true });
  await blocked; assert.equal(previews, 0);
  c.documentBusy = false;
  const importing = c._importRelationshipJson(); await tick();
  const locked = c.documentBusy;
  if (locked) await c._openDocument('doc-b');
  release({ cancelled: true }); await importing;
  assert.equal(locked, true); assert.equal(opened, 0); assert.equal(c.documentBusy, false);
});

test('手动保存期间的新编辑不被旧结果覆盖，后续自动保存使用新版本号', async t => {
  const { c } = fixture(t), requests = [];
  c.documentRecord = { id: 'doc-a', revision: 'v0' };
  c.bridge.relationshipBoards.saveDocument = request => new Promise(resolve => requests.push({ request: structuredClone(request), resolve }));
  const manual = c._saveDocument(); await tick();
  const stateDuringSave = c.saveState;
  c.store.entities[0].name = '保存期间的新编辑';
  c._persistSoon(10000); const auto = c._persistNow(); await tick();
  const concurrent = requests.length;
  requests[0].resolve({ record: { id: 'doc-a', revision: 'v1' }, store: requests[0].request.store });
  await tick(); await tick();
  if (requests[1]) requests[1].resolve({ record: { id: 'doc-a', revision: 'v2' }, store: requests[1].request.store });
  await manual; await auto;
  assert.equal(stateDuringSave, 'saving'); assert.equal(concurrent, 1);
  assert.equal(c.store.entities[0].name, '保存期间的新编辑');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].request.revision, 'v1');
  assert.equal(requests[1].request.store.entities[0].name, '保存期间的新编辑');
  assert.equal(c.saveState, 'saved'); assert.equal(c.documentBusy, false);
});

test('取消另存为不能丢弃原有待自动保存的修改', async t => {
  const { c, writes } = fixture(t);
  c.bridge.relationshipBoards.saveDocument = async () => ({ cancelled: true });
  c._persistSoon(10000);
  await c._saveDocument(true); await c.saveChain;
  assert.equal(writes.length, 1); assert.equal(c.documentRecord, null);
  assert.equal(c.saveState, 'saved'); assert.equal(c.documentBusy, false);
});

test('另存为期间的新编辑只续写新文档，不覆盖原文件', async t => {
  const { c } = fixture(t), requests = [];
  c.documentRecord = { id: 'old-document', revision: 'old-v0' };
  c.bridge.relationshipBoards.saveDocument = request => new Promise(resolve => requests.push({ request: structuredClone(request), resolve }));
  const saving = c._saveDocument(true); await tick();
  c.store.entities[0].name = '新文件里的新编辑'; c._persistSoon(10000);
  requests[0].resolve({ record: { id: 'new-document', revision: 'new-v1' }, store: requests[0].request.store });
  await tick(); await tick();
  assert.equal(requests[1].request.id, 'new-document'); assert.equal(requests[1].request.revision, 'new-v1');
  requests[1].resolve({ record: { id: 'new-document', revision: 'new-v2' }, store: requests[1].request.store });
  await saving;
  assert.equal(c.documentRecord.id, 'new-document'); assert.equal(c.store.entities[0].name, '新文件里的新编辑');
});

test('没有待保存修改时取消另存为恢复原状态，不新增写入', async t => {
  const { c, writes } = fixture(t);
  c.bridge.relationshipBoards.saveDocument = async () => ({ cancelled: true });
  await c._saveDocument(true);
  assert.equal(c.saveState, 'saved'); assert.equal(writes.length, 0);
  assert.equal(c.documentBusy, false); assert.equal(c.documentSaveInFlight, false);
});

test('自动保存先完成、手动保存再执行，两者按真实文件版本号串行落盘', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { WhiteboardDocumentService } = require('../src/main/services/whiteboardDocumentService');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-save-lifecycle-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = new WhiteboardDocumentService({ baseDirectory: path.join(dir, 'profile') });
  const { c, notices } = fixture(t);
  const initial = service.save({ store: c.store }, path.join(dir, 'board.json'));
  c.documentRecord = initial.record;
  const revisions = [];
  c.bridge.relationshipBoards.saveDocument = async request => {
    revisions.push(request.revision); await tick(); return service.save(request);
  };
  c.store.entities[0].name = '自动保存先写';
  const auto = c._persistNow();
  c.store.entities[0].name = '手动保存最终内容';
  const manual = c._saveDocument();
  await auto; await manual;
  assert.equal(revisions.length, 2); assert.notEqual(revisions[0], revisions[1]);
  assert.equal(service.open(initial.record.id).store.entities[0].name, '手动保存最终内容');
  assert.deepEqual(notices, []); assert.equal(c.saveState, 'saved');
});

test('独立保存模块在正式界面及所有旧白板 fixture 中先于控制器加载', () => {
  const fs = require('node:fs'), path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const files = ['src/renderer/index.html', ...fs.readdirSync(path.join(root, 'scripts/visual-fixtures')).filter(x => x.endsWith('.html')).map(x => `scripts/visual-fixtures/${x}`)];
  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    if (!html.includes('relationshipBoardController.js')) continue;
    assert.ok(html.indexOf('relationshipBoardPersistence.js') >= 0, file);
    assert.ok(html.indexOf('relationshipBoardPersistence.js') < html.indexOf('relationshipBoardController.js'), file);
  }
  const source = fs.readFileSync(path.join(root, 'src/renderer/scripts/relationshipBoardController.js'), 'utf8');
  assert.match(source, /Persistence\.schedule\(this, delay\)/);
  assert.match(source, /Persistence\.persistNow\(this\)/);
  assert.match(source, /Persistence\.saveDocument\(this, saveAs\)/);
});

test('手动保存错误保留内容并解除忙碌状态，下一次仍能保存', async t => {
  const { c, notices } = fixture(t); const before = structuredClone(c.store);
  c.documentRecord = { id: 'doc-a', revision: 'v0' };
  c.bridge.relationshipBoards.saveDocument = async () => { throw new Error('write failed'); };
  await c._saveDocument(); assert.equal(c.saveState, 'error'); assert.equal(c.documentBusy, false);
  assert.deepEqual(c.store, before); assert.match(notices.at(-1), /write failed/);
  c.bridge.relationshipBoards.saveDocument = async request => ({ record: { id: 'doc-a', revision: 'v1' }, store: request.store });
  await c._saveDocument(); assert.equal(c.saveState, 'saved'); assert.equal(c.documentRecord.revision, 'v1');
});
