const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/relationship-canvas/index.jsx'), 'utf8');
test('explicit more button opens only one toolbar independently of selection', () => {
  assert.match(source, /const \[openId, setOpenId\] = useState\(null\)/);
  assert.match(source, /setOpenId\(current => current === id \? null : id\)/);
  assert.equal((source.match(/<MoreActions id=\{id\} entity=\{entity\} \/>/g) || []).length, 3);
  assert.doesNotMatch(source, /<NodeToolbar isVisible=\{selected\}/);
  assert.match(source, /openId === id \? <span className="gf-flow-group-actions"/);
  assert.match(source, /event.key === 'Escape'/);
  assert.match(source, /addEventListener\('pointerdown', closeOutside, true\)/);
});
test('node popup actions use compact typography instead of inheriting canvas type size', () => {
  const css = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/relationship-canvas/relationshipCanvas.css'), 'utf8');
  const rule = css.match(/\.gf-flow-node-toolbar button \{([^}]+)\}/)[1];
  assert.match(rule, /font-size: 12px/);
  assert.match(rule, /min-height: 28px/);
  assert.match(rule, /padding: 4px 8px/);
});
test('edges limit compensation and become lighter in distant overview', () => {
  assert.match(source, /vectorEffect: 'none'/);
  assert.match(source, /data\?\.edgeZoomMode === 'follow' \? 1/);
  assert.match(source, /data\?\.edgeZoomMode === 'fixed' \? scale : Math.max\(0.5, scale\)/);
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
