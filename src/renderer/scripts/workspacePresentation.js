(function exposeWorkspacePresentation(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorkspacePresentation = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const count = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;

  function gitOverview({ status, review, log, contextHtml = '' }) {
    const files = review.files || [], commits = Array.isArray(log) ? log : [];
    const changeRow = (file, index) => `<button type="button" class="workspace-change-row" data-workspace-diff="${index}" aria-controls="workspace-diff-panel"><span class="workspace-file-name" title="${escape(file.path)}">${escape(file.path)}</span><small>${file.staged ? '已暂存' : ''}${file.staged && file.unstaged ? ' · ' : ''}${file.unstaged ? '未暂存' : ''}</small></button>`;
    const commitRow = commit => `<div class="workspace-commit" title="${escape(`${commit.message} · ${commit.author || ''}`)}"><code>${escape(commit.hash)}</code><span>${escape(commit.message)}</span><small class="workspace-commit-author">${escape(commit.author)}</small></div>`;
    const ahead = count(status.ahead), behind = count(status.behind);
    const staged = count(review.stagedCount), unstaged = count(review.unstagedCount);
    return `<section class="workspace-overview workspace-git-overview" id="git-workspace-view" aria-label="Git 仓库工作区">
      ${contextHtml ? `<div class="workspace-context">${contextHtml}</div>` : ''}
      <div class="workspace-overview-toolbar">
        <div class="workspace-git-summary">
          <span class="workspace-branch" title="当前分支">⑂ ${escape(status.branch || '尚无提交')}</span>
          ${staged ? `<span>${staged} 已暂存</span>` : ''}${unstaged ? `<span class="workspace-has-changes">${unstaged} 未暂存</span>` : ''}
          ${!staged && !unstaged ? '<span>工作区干净</span>' : ''}
          ${ahead ? `<span title="基于本地远端缓存；Fetch 可刷新">↑ ${ahead} 待推送</span>` : ''}${behind ? `<span title="基于本地远端缓存；Fetch 可刷新">↓ ${behind} 待拉取</span>` : ''}
          ${status.hasRemote === false ? '<span class="workspace-remote-note">未配置远端</span>' : status.hasRemote && !status.upstream ? '<span class="workspace-remote-note">未设置跟踪分支</span>' : ''}
        </div>
        <div class="workspace-git-actions">
          <button type="button" class="btn btn-primary" data-workspace-git="review">审查与提交</button>
          <details class="workspace-more">
            <summary class="btn" aria-label="更多 Git 操作">更多 ▾</summary>
            <div class="workspace-more-panel" role="group" aria-label="Git 操作">
              <button type="button" data-workspace-git="refresh">刷新工作区</button>
              <button type="button" data-workspace-git="fetch">Fetch · 更新远端状态</button>
              <button type="button" data-workspace-git="pull">Pull · 拉取</button>
              <button type="button" data-workspace-git="push">Push · 推送</button>
              <button type="button" data-workspace-git="tools">分支与远程…</button>
            </div>
          </details>
        </div>
      </div>
      <div class="workspace-code-columns"><section class="workspace-section" aria-labelledby="workspace-changes-title">
        <h3 id="workspace-changes-title">文件变更 <span>${count(review.totalCount)}</span></h3>
        ${files.length ? `<div class="workspace-change-list">${files.slice(0, 8).map(changeRow).join('')}</div>${files.length > 8 ? `<details class="workspace-extra-files"><summary>展开其余 ${files.length - 8} 个文件</summary><div class="workspace-change-list">${files.slice(8).map((file, index) => changeRow(file, index + 8)).join('')}</div></details>` : ''}` : '<p class="workspace-empty-hint">没有待提交的文件变更。</p>'}
        ${review.limited ? '<p class="workspace-empty-hint">文件较多，仅显示服务返回的部分结果；请打开“审查与提交”查看详情。</p>' : ''}
        <section class="workspace-diff-panel" id="workspace-diff-panel" aria-label="文件差异" hidden>
          <div class="workspace-diff-heading"><strong id="workspace-diff-name"></strong><button type="button" class="btn btn-small" data-workspace-close-diff>关闭差异</button></div>
          <pre id="workspace-file-diff" tabindex="0" hidden></pre>
        </section>
      </section>
      <section class="workspace-section" aria-labelledby="workspace-history-title">
        <h3 id="workspace-history-title">最近提交</h3>
        <div class="workspace-commit-list">${commits.slice(0, 5).map(commitRow).join('') || '<p class="workspace-empty-hint">暂无提交记录。</p>'}</div>
        ${commits.length > 5 ? `<details class="workspace-history-more"><summary>展开其余 ${commits.length - 5} 条最近提交</summary><div class="workspace-commit-list">${commits.slice(5).map(commitRow).join('')}</div></details>` : ''}
      </section></div>
    </section>`;
  }
  return Object.freeze({ gitOverview });
});
