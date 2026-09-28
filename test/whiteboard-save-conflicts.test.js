const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Model = require('../src/shared/relationshipGraphModel');
globalThis.RelationshipGraphModel = Model;
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');
const { WhiteboardDocumentService } = require('../src/main/services/whiteboardDocumentService');

function sample(name = 'Original') {
  return Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_conflicts1',
    entities: [{ id: 'entity_conflicts1', type: 'text', name, details: { content: name } }],
    relationships: [], boards: [{ id: 'board_conflicts1', name: 'Conflict regression',
      viewport: { x: 0, y: 0, zoom: 1 }, placements: [{ entityId: 'entity_conflicts1', x: 40, y: 40 }] }] });
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-save-conflicts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = new WhiteboardDocumentService({ baseDirectory: path.join(dir, 'library') });
  const file = path.join(dir, 'board.json');
  service.save({ store: sample() }, file);
  // Integral timestamps make equal-metadata regressions deterministic across filesystems.
  fs.utimesSync(file, 1700000000, 1700000000);
  const opened = service.openPath(file);
  const bytes = fs.readFileSync(file, 'utf8');
  const external = bytes.replaceAll('Original', 'External');
  assert.equal(Buffer.byteLength(external), Buffer.byteLength(bytes));
  return { dir, service, file, opened, bytes, external };
}
function assertNoScratch(dir) {
  assert.deepEqual(fs.readdirSync(dir).filter(name => /\.(tmp|previous)$/.test(name)), []);
}

test('same-size external edits with an unchanged timestamp cannot be overwritten', t => {
  const { service, file, opened, external } = fixture(t);
  const before = fs.statSync(file);
  fs.writeFileSync(file, external); fs.utimesSync(file, 1700000000, 1700000000);
  const after = fs.statSync(file);
  assert.equal(after.size, before.size); assert.equal(after.mtimeMs, before.mtimeMs);
  assert.throws(() => service.save({ ...opened.record, store: sample('My edits') }), /外部修改/);
  assert.equal(fs.readFileSync(file, 'utf8'), external);
});

test('touching an unchanged file does not create a content conflict', t => {
  const { service, file, opened } = fixture(t);
  fs.utimesSync(file, 1700000001, 1700000001);
  const saved = service.save({ ...opened.record, store: sample('My edits') });
  assert.equal(service.open(saved.record.id).store.entities[0].name, 'My edits');
});

test('external edits during serialization are checked again before replacing the destination', t => {
  const { dir, service, file, opened, external } = fixture(t);
  const createEnvelope = service.exporter.createEnvelope.bind(service.exporter);
  service.exporter.createEnvelope = store => {
    fs.writeFileSync(file, external);
    return createEnvelope(store);
  };
  assert.throws(() => service.save({ ...opened.record, store: sample('My edits') }), /外部修改/);
  assert.equal(fs.readFileSync(file, 'utf8'), external); assertNoScratch(dir);
});

test('external deletion during serialization is not silently recreated', t => {
  const { dir, service, file, opened } = fixture(t);
  const createEnvelope = service.exporter.createEnvelope.bind(service.exporter);
  service.exporter.createEnvelope = store => { fs.unlinkSync(file); return createEnvelope(store); };
  assert.throws(() => service.save({ ...opened.record, store: sample('My edits') }), /外部修改|移除/);
  assert.equal(fs.existsSync(file), false); assertNoScratch(dir);
});

test('open returns the revision of the parsed snapshot, not a later external version', t => {
  const { service, file, external } = fixture(t);
  const writeRecords = service._writeRecords.bind(service);
  service._writeRecords = records => { writeRecords(records); fs.writeFileSync(file, external); };
  const opened = service.openPath(file);
  assert.equal(opened.store.entities[0].name, 'Original');
  assert.notEqual(opened.record.revision, service._revision(file));
  assert.throws(() => service.save({ ...opened.record, store: sample('My edits') }), /外部修改/);
  assert.equal(fs.readFileSync(file, 'utf8'), external);
});

test('save returns the revision of its written snapshot, not a later external version', t => {
  const { service, file, opened, external } = fixture(t);
  const writeRecords = service._writeRecords.bind(service);
  service._writeRecords = records => { writeRecords(records); fs.writeFileSync(file, external); };
  const saved = service.save({ ...opened.record, store: sample('My edits') });
  assert.notEqual(saved.record.revision, service._revision(file));
  assert.throws(() => service.save({ ...saved.record, store: sample('Next edit') }), /外部修改/);
  assert.equal(fs.readFileSync(file, 'utf8'), external);
});

test('a temporary write failure preserves the original file and allows a retry', t => {
  const { dir, service, file, opened, bytes } = fixture(t);
  const originalFs = service.exporter.fs;
  service.exporter.fs = Object.assign(Object.create(originalFs), {
    writeFileSync() { throw new Error('simulated ENOSPC'); }
  });
  assert.throws(() => service.save({ ...opened.record, store: sample('My edits') }), /ENOSPC/);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes); assertNoScratch(dir);
  service.exporter.fs = originalFs;
  const saved = service.save({ ...opened.record, store: sample('My edits') });
  assert.equal(service.open(saved.record.id).store.entities[0].name, 'My edits');
});

test('a replacement failure rolls back the original file and cleans scratch files', t => {
  const { dir, service, file, opened, bytes } = fixture(t);
  const originalFs = service.exporter.fs;
  service.exporter.fs = Object.assign(Object.create(originalFs), {
    renameSync(from, to) {
      if (from.endsWith('.tmp') && to === file) throw new Error('simulated EACCES');
      return originalFs.renameSync(from, to);
    }
  });
  assert.throws(() => service.save({ ...opened.record, store: sample('My edits') }), /EACCES/);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes); assertNoScratch(dir);
  service.exporter.fs = originalFs;
  assert.doesNotThrow(() => service.save({ ...opened.record, store: sample('Retry') }));
});

test('an obsolete saved revision is rejected; Save As preserves both versions', t => {
  const { dir, service, file, opened } = fixture(t);
  const saved = service.save({ ...opened.record, store: sample('New saved version') });
  assert.throws(() => service.save({ ...opened.record, store: sample('Stale editor') }), /外部修改/);
  const copy = service.save({ ...opened.record, store: sample('Recovered edits') }, path.join(dir, 'recovered.json'));
  assert.equal(service.open(saved.record.id).store.entities[0].name, 'New saved version');
  assert.equal(service.open(copy.record.id).store.entities[0].name, 'Recovered edits');
  assert.notEqual(saved.record.path, copy.record.path); assert.equal(saved.record.path, file);
});

test('controller keeps unsaved edits on a disk conflict and can recover with Save As', async t => {
  const { dir, service, file, opened, external } = fixture(t);
  const notices = [], destination = path.join(dir, 'recovered.json');
  const c = new Controller({ bridge: { relationshipBoards: {
    saveDocument: async request => service.save(request, request.saveAs ? destination : undefined)
  } }, notify: message => notices.push(message) });
  c.store = opened.store; c.documentRecord = opened.record; c.documentLibrary = [opened.record];
  c.render = () => {}; c._refreshDocumentLibrary = c._refreshDocumentAssets = async () => {};
  t.after(() => { if (c.saveTimer) clearTimeout(c.saveTimer); });
  c.store.entities[0].name = 'My unsaved edits';
  fs.writeFileSync(file, external); fs.utimesSync(file, 1700000000, 1700000000);
  assert.equal(await c._persistNow(), null);
  assert.equal(c.saveState, 'error'); assert.equal(c.store.entities[0].name, 'My unsaved edits');
  assert.match(notices.at(-1), /外部修改/);
  const saved = await c._saveDocument(true);
  assert.ok(saved); assert.equal(c.saveState, 'saved'); assert.equal(c.documentBusy, false);
  assert.equal(fs.readFileSync(file, 'utf8'), external);
  assert.equal(service.open(saved.record.id).store.entities[0].name, 'My unsaved edits');
});
