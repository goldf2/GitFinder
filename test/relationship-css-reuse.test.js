const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const featureCss = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/relationships.css'), 'utf8').replace(/\r\n?/g, '\n');
const chromeCss = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/apple-ui/settings-board.css'), 'utf8').replace(/\r\n?/g, '\n');

function block(selector, options = {}) {
  const needle = `${selector} {`;
  const start = options.last ? featureCss.lastIndexOf(needle) : featureCss.indexOf(needle);
  assert.notEqual(start, -1, `缺少 CSS 规则：${selector}`);
  return featureCss.slice(start, featureCss.indexOf('}', start) + 1);
}

test('显示与筛选弹层复用同一外壳且各自只保留尺寸层级', () => {
  const shared = chromeCss.match(/:is\([\s\S]*?\.relationship-display-popover[\s\S]*?\.relationship-filter-popover[\s\S]*?\)\s*\{[^}]+\}/)?.[0] || '';
  for (const declaration of [
    'border-color: var(--ui-divider)',
    'background: var(--ui-material-surface)',
    'box-shadow: var(--ui-shadow-floating)',
    'backdrop-filter: blur(24px) saturate(150%)'
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
  assert.ok((featureCss.match(/border: 1px solid var\(--border-color\);/g) || []).length <= 27);
});

test('大型显示设置只滚动内容区且每个分区按内容高度展开', () => {
  const sections = block('.relationship-display-sections');
  assert.match(sections, /overflow:\s*auto/);
  assert.match(sections, /grid-auto-rows:\s*max-content/);
  const section = block('.relationship-display-section');
  assert.match(section, /overflow:\s*visible/);
});
