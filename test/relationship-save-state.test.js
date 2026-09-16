const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function fixture(t) {
  const requests = [], notices = [];
  const controller = new Controller({
    bridge: { relationshipBoards: { save: snapshot => new Promise((resolve, reject) => requests.push({ snapshot, resolve, reject })) } },
    notify: message => notices.push(message)
  });
  controller.store = { entities: [], boards: [], marker: 'first' };
  t.after(() => { if (controller.saveTimer) clearTimeout(controller.saveTimer); });
  return { controller, requests, notices };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('旧保存完成时，排队中的新快照仍显示正在保存', async t => {
  const { controller: c, requests } = fixture(t);
  const first = c._persistNow(); await tick();
  c.store.marker = 'latest'; const second = c._persistNow();
  requests[0].resolve(); await first; await tick();
  assert.equal(c.saveState, 'saving');
  assert.equal(requests[0].snapshot.marker, 'first');
  assert.equal(requests[1].snapshot.marker, 'latest');
  requests[1].resolve(); await second;
  assert.equal(c.saveState, 'saved');
});

test('旧保存完成时，新编辑还在防抖等待中不能显示已保存', async t => {
  const { controller: c, requests } = fixture(t);
  const first = c._persistNow(); await tick();
  c.store.marker = 'pending'; c._persistSoon(10000);
  requests[0].resolve(); await first;
  assert.equal(c.saveState, 'saving');
});

test('旧请求失败不覆盖新请求的保存状态，最新请求失败仍明确提示', async t => {
  const { controller: c, requests, notices } = fixture(t);
  const first = c._persistNow(); await tick();
  const second = c._persistNow();
  requests[0].reject(new Error('first write failed')); await first; await tick();
  assert.equal(c.saveState, 'saving');
  assert.match(notices[0], /first write failed/);
  requests[1].reject(new Error('latest write failed')); await second;
  assert.equal(c.saveState, 'error');
  assert.match(notices[1], /latest write failed/);
  const retry = c._persistNow(); await tick(); requests[2].resolve(); await retry;
  assert.equal(c.saveState, 'saved');
});

test('较新的文档快照验证失败，不被旧成功请求改写为已保存', async t => {
  const { controller: c, requests } = fixture(t);
  const first = c._persistNow(); await tick();
  c.documentRecord = { id: 'test-document', revision: 1 };
  c._buildActiveBoardExportStore = () => { throw new Error('invalid document'); };
  await c._persistNow(); assert.equal(c.saveState, 'error');
  requests[0].resolve(); await first;
  assert.equal(c.saveState, 'error');
});
