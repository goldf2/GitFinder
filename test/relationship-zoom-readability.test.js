const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/relationship-canvas/index.jsx'), 'utf8');
test('edges compensate viewport zoom including dash and interaction widths', () => {
  assert.match(source, /vectorEffect: 'none'/);
  assert.match(source, /strokeWidth: `calc\(max\(2px,/);
  assert.match(source, /Number\(value\) \/ scale/);
  assert.match(source, /style=\{screenStyle\}/);
  for (const zoom of [0.05, 0.1, 0.25, 0.5, 1, 2]) assert.equal((2 / zoom) * zoom, 2);
});
test('group overview titles shrink, truncate and hide member explanation unless selected', () => {
  assert.match(source, /zoom >= 0.6 \|\| selected/);
  assert.match(source, /'--group-title-scale': Math.min\(1, Math.max\(0.45, zoom\)\)/);
  assert.match(source, /title=\{entity.name\}/);
  const css = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/relationship-canvas/relationshipCanvas.css'), 'utf8');
  assert.match(css, /max-width: var\(--group-title-max-width/);
  assert.match(css, /text-overflow: ellipsis/);
});
