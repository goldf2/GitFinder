const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/relationships.css'), 'utf8');

function block(selector, options = {}) {
  const needle = `${selector} {`;
  const start = options.last ? css.lastIndexOf(needle) : css.indexOf(needle);
  assert.notEqual(start, -1, `缺少 CSS 规则：${selector}`);
  return css.slice(start, css.indexOf('}', start) + 1);
}

test('显示与筛选弹层复用同一外壳且各自只保留尺寸层级', () => {
  const shared = block('.relationship-display-popover,\n.relationship-filter-popover');
  for (const declaration of [
    'position: absolute',
    'border: 1px solid var(--border-color)',
    'background: var(--bg-primary)',
    'box-shadow: 0 14px 38px var(--shadow-overlay)',
    'backdrop-filter: blur(18px) saturate(140%)'
  ]) assert.match(shared, new RegExp(declaration.replace(/[()]/g, '\\$&')));

  for (const selector of ['.relationship-display-popover', '.relationship-filter-popover']) {
    const specific = block(selector, { last: true });
    assert.doesNotMatch(specific, /position:|border:|background:|box-shadow:|backdrop-filter:/);
    assert.match(specific, /width:/);
    assert.match(specific, /z-index:/);
  }
});

test('关系白板表单控件复用边框、文字和字体原语', () => {
  const shared = block([
    '.relationship-display-select select',
    '.relationship-filter-grid select',
    '.relationship-dialog-field input',
    '.relationship-repository-search',
    '.relationship-inspector-field input',
    '.relationship-inspector-field select',
    '.relationship-inspector-field textarea',
    '.relationship-topology-alert-item > button',
    '.relationship-server-context button',
    '.relationship-multi-group-actions select'
  ].join(',\n'));
  assert.match(shared, /border: 1px solid var\(--border-color\)/);
  assert.match(shared, /border-radius: 7px/);
  assert.match(shared, /color: var\(--text-primary\)/);
  assert.match(shared, /font: inherit/);
  assert.ok((css.match(/border: 1px solid var\(--border-color\);/g) || []).length <= 18);
});
