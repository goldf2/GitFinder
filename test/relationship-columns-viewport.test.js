const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

test('纵向列表以可读比例从顶部浏览，适合全部仍是独立操作', () => {
  const c = new Controller({ bridge: {} });
  c._boardView = () => ({ layout: 'project-columns' });
  c.root = { querySelector: () => ({ clientWidth: 1000, clientHeight: 700 }) };
  c._unarchivedPlacements = () => [];
  c._displayGeometryMap = () => new Map([['first', { x: 80, y: 80, width: 5000, height: 14000 }]]);
  let viewport, fit;
  c.flowCanvas = { setViewport: value => { viewport = value; }, fitView: value => { fit = value; } };
  c._fitArrangedLayout();
  assert.equal(viewport.zoom, 0.32);
  assert.equal(viewport.y + 80 * viewport.zoom, 72);
  assert.equal(fit, undefined);
  c.fitContent({ minZoom: 0.4 });
  assert.equal(fit.minZoom, 0.4);
  c.fitContent();
  assert.ok(fit.minZoom <= 0.03);
});
