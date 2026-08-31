const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/relationships.css'), 'utf8');
const rule = selector => {
  const start = css.lastIndexOf(`${selector} {`);
  assert.ok(start >= 0, `missing rule: ${selector}`);
  return css.slice(start, css.indexOf('}', start) + 1);
};

test('资源条目使用紧凑双行布局，不继承白板卡片尺寸', () => {
  const item = rule('.relationship-resource-item');
  assert.match(item, /min-height: 32px/);
  assert.match(item, /box-sizing: border-box/);
  assert.match(item, /padding: 2px 4px/);
  assert.match(rule('.relationship-resource-icon'), /height: 22px/);
  assert.match(rule('.relationship-resource-copy strong'), /line-height: 16px/);
  assert.match(rule('.relationship-resource-copy small'), /line-height: 12px/);
});

test('白板文件条目与普通资源使用相同文字密度，没有嵌套按钮内边距', () => {
  assert.match(rule('.relationship-resource-item .whiteboard-library-open'), /padding: 0/);
  assert.match(rule('.whiteboard-library-open strong'), /font-size: 12px/);
  assert.match(rule('.whiteboard-library-open strong'), /line-height: 16px/);
  assert.match(rule('.whiteboard-library-open small'), /line-height: 12px/);
});
