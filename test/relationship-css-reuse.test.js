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
    'border: 1px solid var(--border-color)',
    'background: var(--bg-primary)',
    'box-shadow: 0 14px 38px var(--shadow-overlay)',
    'backdrop-filter: blur(18px) saturate(140%)'
  ]) assert.match(shared, new RegExp(declaration.replace(/[()]/g, '\\$&')));

  const display = block('.relationship-display-popover');
  assert.match(display, /position: fixed/);
  assert.match(display, /width: min\(880px/);
  assert.match(display, /z-index:/);
  const filter = block('.relationship-filter-popover', { last: true });
  assert.match(filter, /position: absolute/);
  assert.match(filter, /width:/);
  assert.match(filter, /z-index:/);
  assert.doesNotMatch(display, /border:|background:|box-shadow:|backdrop-filter:/);
  assert.doesNotMatch(filter, /border:|background:|box-shadow:|backdrop-filter:/);
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

test('大型显示设置只滚动内容区且每个分区按内容高度展开', () => {
  const sections = block('.relationship-display-sections');
  assert.match(sections, /overflow:\s*auto/);
  assert.match(sections, /grid-auto-rows:\s*max-content/);
  const section = block('.relationship-display-section');
  assert.match(section, /overflow:\s*visible/);
});
