const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HtmlPresentation = require('../src/renderer/scripts/htmlPresentation');

test('共享 HTML 呈现统一转义空值与外部内容', () => {
  assert.equal(HtmlPresentation.escapeHtml(null), '');
  assert.equal(
    HtmlPresentation.escapeHtml(`<img title="x" data-y='z'>&`),
    '&lt;img title=&quot;x&quot; data-y=&#39;z&#39;&gt;&amp;'
  );
});

test('共享模态呈现同步可见性、语义和交互锁定', () => {
  const attributes = new Map();
  const modal = { style: {}, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  assert.equal(HtmlPresentation.setModalVisibility(modal, true), true);
  assert.deepEqual([modal.style.display, attributes.has('inert'), attributes.get('aria-hidden')], ['flex', false, 'false']);
  HtmlPresentation.setModalVisibility(modal, false);
  assert.deepEqual([modal.style.display, attributes.has('inert'), attributes.get('aria-hidden')], ['none', true, 'true']);
  assert.equal(HtmlPresentation.setModalVisibility(null, true), false);
});

test('共享 Markdown 只生成受控结构且不创建外部链接', () => {
  const html = HtmlPresentation.renderMarkdown(
    '# 标题\n\n- **安全**\n- [外部](javascript:alert(1))\n\n```html\n<script>alert(2)</script>\n```',
    { linkTitle: '不打开外部链接', emptyHtml: '<i>空</i>' }
  );
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<strong>安全<\/strong>/);
  assert.match(html, /class="markdown-link" title="不打开外部链接">外部<\/span>/);
  assert.doesNotMatch(html, /href=|<script>/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
  assert.equal(HtmlPresentation.renderMarkdown('', { emptyHtml: '<i>空</i>' }), '<i>空</i>');
});

test('共享呈现模块先于所有消费者加载', () => {
  const page = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  const shared = page.indexOf('scripts/htmlPresentation.js');
  for (const consumer of ['syntaxHighlight.js', 'quickLook.js', 'quickLookPaging.js', 'quickLookController.js', 'galleryView.js', 'git.js', 'batchRenameController.js', 'contentFilterController.js', 'directoryPerformanceController.js', 'fileOperationDialogController.js', 'smartCollectionsController.js', 'relationshipBoardController.js', 'app.js']) {
    assert.ok(shared >= 0 && shared < page.indexOf(`scripts/${consumer}`), `${consumer} 应在共享呈现模块之后加载`);
  }
});
