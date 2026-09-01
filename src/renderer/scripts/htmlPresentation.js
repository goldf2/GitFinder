(function exposeHtmlPresentation(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.HtmlPresentation = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHtmlPresentationApi() {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function renderInlineMarkdown(value, options = {}) {
    const linkTitle = escapeHtml(options.linkTitle || '预览中不打开外部链接');
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, `<span class="markdown-link" title="${linkTitle}">$1</span>`);
  }

  function renderMarkdown(content, options = {}) {
    const lines = String(content || '').split(/\r?\n/);
    const inline = value => renderInlineMarkdown(value, options);
    let html = '', inCode = false, inList = false, paragraph = [];
    const flushParagraph = () => {
      if (!paragraph.length) return;
      html += `<p>${paragraph.map(inline).join(' ')}</p>`;
      paragraph = [];
    };
    const closeList = () => {
      if (!inList) return;
      html += '</ul>';
      inList = false;
    };

    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        flushParagraph(); closeList();
        html += inCode ? '</code></pre>' : '<pre><code>';
        inCode = !inCode;
      } else if (inCode) {
        html += `${escapeHtml(line)}\n`;
      } else if (!line.trim()) {
        flushParagraph(); closeList();
      } else {
        const heading = line.match(/^(#{1,4})\s+(.+)$/);
        const list = line.match(/^\s*[-*]\s+(.+)$/);
        if (heading) {
          flushParagraph(); closeList();
          const level = heading[1].length;
          html += `<h${level}>${inline(heading[2])}</h${level}>`;
        } else if (list) {
          flushParagraph();
          if (!inList) { html += '<ul>'; inList = true; }
          html += `<li>${inline(list[1])}</li>`;
        } else {
          paragraph.push(line.trim());
        }
      }
    }
    flushParagraph(); closeList();
    if (inCode) html += '</code></pre>';
    return html || options.emptyHtml || '';
  }

  return { escapeHtml, renderInlineMarkdown, renderMarkdown };
});
