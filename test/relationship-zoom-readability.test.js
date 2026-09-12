const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/relationship-canvas/index.jsx'), 'utf8');
test('edges limit compensation and become lighter in distant overview', () => {
  assert.match(source, /vectorEffect: 'none'/);
  assert.match(source, /compensationScale = Math.max\(0.5, scale\)/);
  assert.doesNotMatch(source, /max\(2px,/);
  assert.match(source, /Number\(value\) \/ compensationScale/);
  assert.match(source, /Math.min\(1, Math.max\(0.25, scale \/ 0.4\)\)/);
  assert.match(source, /style=\{screenStyle\}/);
  const widths = [0.05, 0.1, 0.25, 0.5, 1, 2].map(zoom => 1.7 * zoom / Math.max(0.5, zoom));
  assert.deepEqual(widths, [0.17, 0.34, 0.85, 1.7, 1.7, 1.7]);
});
test('group overview titles shrink, truncate and hide member explanation unless selected', () => {
  assert.match(source, /zoom >= 0.6 \|\| selected/);
  assert.match(source, /'--group-title-scale': Math.min\(1, Math.max\(0.45, zoom\)\)/);
  assert.match(source, /title=\{entity.name\}/);
  const css = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/relationship-canvas/relationshipCanvas.css'), 'utf8');
  assert.match(css, /max-width: var\(--group-title-max-width/);
  assert.match(css, /text-overflow: ellipsis/);
});
