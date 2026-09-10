(function exposeFileSelectionDetailController(root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('../../shared/projectShortcuts') : root.ProjectShortcuts);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FileSelectionDetailController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createFileSelectionDetailControllerApi(ProjectShortcuts) {
  class Controller {
    constructor(options = {}) {
      this.app = options.app;
      this.state = options.state;
      this.document = options.document || null;
      this.fileBrowser = options.fileBrowser;
      this.item = null;
      this.activeTab = 'project';
    }

    setContext(item, activeTab = 'project') {
      this.item = item;
      this.activeTab = activeTab;
      const tabs = this._element('detail-identity-tabs');
      if (!tabs) return;
      tabs.hidden = !item || (!item.isProject && !item.isGitRepo);
      for (const [kind, available] of [['project', item?.isProject], ['repository', item?.isGitRepo]]) {
        const button = this._element(`detail-${kind}-tab`);
        button.hidden = !available;
        button.setAttribute('aria-selected', String(activeTab === kind));
        button.tabIndex = activeTab === kind ? 0 : -1;
        button.onclick = () => this.switchTab(kind);
        button.onkeydown = event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !this.item?.isProject || !this.item?.isGitRepo) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'project' : event.key === 'End' ? 'repository' : kind === 'project' ? 'repository' : 'project';
          this.switchTab(next);
          this._element(`detail-${next}-tab`).focus();
        };
      }
    }

    switchTab(kind) {
      const item = this.item;
      if (!item || kind === this.activeTab) return;
      if (kind === 'project' && item.isProject) this.show([item]);
      if (kind === 'repository' && item.isGitRepo) this.app.selectRepo(item.path);
    }

    show(items = []) {
      if (items.length === 1 && items[0].isProject) {
        const known = this.state.localProjects?.find(project => project.path === items[0].path);
        items = [{ ...items[0], project: { ...items[0].project, ...known } }];
      }
      const single = items.length === 1 ? items[0] : null;
      if (single?.isGitRepo && !single.isProject) {
        this.setContext(single, 'repository');
        this.app.selectRepo(single.path);
        return;
      }
      this.setContext(single, 'project');
      this.app.cancelRepoSelection?.();
      this.app.panelDeploymentController?.cancel();
      this.state.selectedRepo = null;
      const empty = this._element('detail-empty');
      const content = this._element('detail-content');
      if (!empty || !content) return;
      content.style.display = 'none';
      empty.style.display = 'flex';
      empty.classList?.toggle('project-detail-view', single?.isProject === true);
      if (!items.length) {
        empty.innerHTML = '<div class="detail-empty-icon">📋</div><div class="detail-empty-text">选择文件或仓库查看详情</div>';
        return;
      }
      if (items.length > 1) {
        empty.innerHTML = `<div class="detail-empty-icon">✓</div><div class="detail-empty-text">已选择 ${items.length} 项</div><div class="detail-empty-subtext">可以批量移动或移到废纸篓</div>`;
        return;
      }

      const item = items[0];
      const lifecycle = this.fileBrowser.projectLifecycleLabel(item);
      const summary = this.app.getFileItemSummary(item) || (item.isProject ? '本地项目' : '双击打开');
      empty.innerHTML = `
        <div class="detail-empty-icon detail-empty-icon-semantic">${this.app.getItemKindIconHtml(item, 'detail-empty-kind-icon')}</div>
        <div class="detail-empty-text">${this.app.escapeHtml(item.name)}</div>
        <div class="detail-empty-path">${this.app.escapeHtml(item.path)}</div>
        <div class="detail-empty-subtext">${this.app.escapeHtml(lifecycle ? `${lifecycle} · ${summary}` : summary)}</div>
        ${item.type === 'directory' ? `<div class="detail-empty-actions">
          <button class="btn btn-small" data-app-action="file-project-settings" data-project-path="${this.app.escapeHtml(item.path)}">${item.isProject ? '项目设置' : '设为项目…'}</button>
          ${item.isProject || item.isGitRepo ? `<button class="btn btn-small" data-detail-action="show-relationship-resource" data-relationship-kind="${item.isProject ? 'project' : 'repository'}" data-relationship-ref="${this.app.escapeHtml(item.isProject ? item.project?.projectId || '' : '')}" data-relationship-path="${this.app.escapeHtml(item.path)}">关系白板</button>` : ''}
        </div>` : ''}
      `;
      if (item.isProject) empty.innerHTML = this.projectMarkup(item, lifecycle, summary);
      empty.querySelector('[data-app-action="file-project-settings"]')?.addEventListener('click', event => {
        const button = event.currentTarget;
        this.app.openLocalProjectDialog(button.dataset.projectPath || item.path);
      });
      empty.querySelector('[data-detail-action="show-relationship-resource"]')?.addEventListener('click', event => {
        const button = event.currentTarget;
        this.app.showResourceInRelationshipBoard({
          kind: button.dataset.relationshipKind,
          refId: button.dataset.relationshipRef,
          path: button.dataset.relationshipPath
        });
      });
      this.app.panelDeploymentController?.showDirectory(item);
      empty.querySelectorAll?.('[data-detail-repo-path]').forEach(button => {
        button.addEventListener('click', () => this.app.selectRepo(button.dataset.detailRepoPath));
      });
      empty.querySelectorAll?.('[data-detail-child-path]').forEach(button => {
        button.addEventListener('click', () => this.app.openLocalProject(button.dataset.detailChildPath));
      });
    }

    projectMarkup(item, lifecycle, summary) {
      const escape = value => this.app.escapeHtml(String(value || ''));
      const project = item.project || {};
      const repositories = Array.isArray(project.repositories) ? project.repositories : [];
      const children = project.projectId ? ProjectShortcuts.projectChildren(this.state.localProjects || [], project.projectId) : [];
      return `<header class="detail-header">
        <div class="detail-header-top"><span class="detail-empty-icon-semantic">${this.app.getItemKindIconHtml(item, 'detail-empty-kind-icon')}</span><h3>${escape(item.name)}</h3></div>
        <div class="detail-path">${escape(item.path)}</div>
        <div class="detail-status"><span class="detail-status-badge">${escape(lifecycle ? `${lifecycle} · ${summary}` : summary)}</span></div>
        <div class="detail-header-toolbar">
          <button class="btn btn-small" data-app-action="file-project-settings" data-project-path="${escape(item.path)}">项目设置</button>
          <button class="btn btn-small" data-detail-action="show-relationship-resource" data-relationship-kind="project" data-relationship-ref="${escape(project.projectId)}" data-relationship-path="${escape(item.path)}">关系白板</button>
        </div></header>
        <section class="project-detail-section"><h4>项目简介</h4><p>${escape(project.description || '暂无项目简介，可在“项目设置”中补充。')}</p></section>
        <section class="project-detail-section"><h4>内部仓库（${repositories.length}）</h4><div class="project-detail-links">${repositories.length ? repositories.map(repo => `<button class="btn btn-small" data-detail-repo-path="${escape(repo.path)}">⑂ ${escape(repo.relativePath === '.' ? '项目根目录' : repo.relativePath || repo.path)}</button>`).join('') : '<p>尚未发现 Git 仓库</p>'}</div></section>
        <section class="project-detail-section"><h4>子项目（${children.length}）</h4><div class="project-detail-links">${children.length ? children.map(child => `<button class="btn btn-small" data-detail-child-path="${escape(child.path)}">${escape(child.name)}</button>`).join('') : '<p>暂无子项目</p>'}</div></section>`;
    }

    _element(id) {
      return this.document?.getElementById?.(id) || null;
    }
  }

  return { Controller };
});
