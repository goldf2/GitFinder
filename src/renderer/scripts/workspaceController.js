(function (root) {
  class Controller {
    constructor(app, state, bridge) {
      this.app = app;
      this.state = state;
      this.bridge = bridge;
      document.getElementById('repository-workspace-tabs').addEventListener('click', event => {
        if (event.target.closest('[data-workspace-back]')) { void this.returnToList(); return; }
        const kindPath = event.target.closest('[data-workspace-kind]')?.dataset.workspaceKind;
        if (kindPath) { this.app.openLocalProjectDialog(kindPath); return; }
        const view = event.target.closest('[data-workspace-view]')?.dataset.workspaceView;
        if (!view || !this.state.workspaceRepository) return;
        this.state.workspaceRepository.view = view;
        this.app.clearFileSelection();
        if (view === 'files') this.app.navigateTo(this.state.workspaceRepository.path);
        else this.app.renderContent();
      });
      document.addEventListener('click', event => {
        if (!event.target.closest('.workspace-more')) document.querySelectorAll('.workspace-more[open]').forEach(menu => { menu.open = false; });
      });
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        document.querySelectorAll('.workspace-more[open]').forEach(menu => { menu.open = false; menu.querySelector('summary')?.focus(); });
      });
    }

    async returnToList() {
      const previous = this.state.workspaceRepository?.returnContext;
      this.clear();
      this.app.closeQuickLook();
      this.app.clearFileSelection();
      this.app.repositoryDetailController?.cancel();
      this.state.selectedRepo = null;
      if (previous) Object.assign(this.state, structuredClone(previous.state));
      else this.state.contentQuery = root.ContentQuery.queryForPreset('all-repositories');
      const search = document.getElementById('search-input');
      if (search) search.value = this.state.searchQuery;
      this.app.updateSearchScopeUI();
      this.app.updateModeUI();
      this.app.updateBreadcrumbs();
      this.app.updateNavButtons();
      this.app.captureActiveWorkspaceTab();
      this.app.renderWorkspaceTabs();
      this.app.scheduleWorkspaceTabsPersist();
      this.app.projectShortcutsController.render();
      await this.app.renderContent();
      const area = document.getElementById('content-area');
      if (area && !this.state.workspaceRepository) area.scrollTop = previous?.scrollTop || 0;
      return true;
    }

    captureReturnContext() {
      const keys = ['currentPath', 'currentMode', 'contentQuery', 'searchQuery', 'searchScope',
        'sidebarNavigationMode', 'selectedTags', 'selectedStatuses', 'selectedCategory', 'filterEnabled', 'history', 'historyIndex',
        'globalSearchMode', 'globalSearchType', 'viewMode'];
      return { state: structuredClone(Object.fromEntries(keys.filter(key => key in this.state).map(key => [key, this.state[key]]))),
        scrollTop: document.getElementById('content-area')?.scrollTop || 0 };
    }

    async documents(path, folders = ['','docs/00-handoff','docs/ai-context']) {
      const groups = await Promise.all(folders.map(async folder => {
        try {
          const items = await this.bridge.fs.listDirectory(folder ? `${path}/${folder}` : path, { showHidden: false, recursive: false });
          return items.filter(item => item.type === 'file' && /\.md$/i.test(item.name)).map(item => ({ path: item.path, label: folder ? `${folder}/${item.name}` : item.name }));
        } catch { return []; }
      }));
      return groups.flat().sort((a,b) => a.label.localeCompare(b.label));
    }

    async showDocument(container, path, current) {
      const token = this.documentRequest = (this.documentRequest || 0) + 1;
      const panel = container.querySelector('[data-workspace-reader]');
      if (!panel) return;
      panel.innerHTML = '<p>正在读取文档…</p>';
      container.querySelectorAll('[data-workspace-record]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.workspaceRecord === path)));
      try {
        const preview = await this.bridge.content.getPreview(path);
        if (preview.nextPageToken) await this.bridge.content.releaseTextPage(preview.nextPageToken);
        if (!current() || token !== this.documentRequest || !panel.isConnected) return;
        const e = value => this.app.escapeHtml(String(value || ''));
        const content = preview.kind === 'markdown' ? this.app.renderMarkdown(preview.content || '') : `<pre>${e(preview.content || preview.error || '无法预览此文件')}</pre>`;
        panel.innerHTML = `<h3>${e(preview.name || path.split('/').pop())}</h3><p class="file-operation-hint">${e(path)}</p><article class="markdown-preview">${content}</article>${preview.truncated ? '<p>文档较长，当前显示前段。可在快速查看中继续阅读。</p><button class="btn" data-workspace-full-document>继续阅读</button>' : ''}`;
        panel.querySelector('[data-workspace-full-document]')?.addEventListener('click', () => this.app.openQuickLook({path, name:preview.name, type:'file'}));
      } catch (error) { if (current() && token === this.documentRequest && panel.isConnected) panel.textContent = `无法读取文档：${error.message}`; }
    }

    readerMarkup(documents, empty = '没有找到本地记录。') {
      const e = value => this.app.escapeHtml(String(value || ''));
      return documents.length ? `<div class="workspace-reader-layout"><nav aria-label="文档列表">${documents.map(doc => `<button class="btn" data-workspace-record="${e(doc.path)}" title="${e(doc.label)}" aria-pressed="false">${e(({ 'CURRENT_STATE.md':'当前状态', 'SESSION_LOG.md':'研发日志', 'RELEASE_LOG.md':'发布记录', 'INDEX.md':'接续索引', 'README.md':'README 说明' })[doc.label.split('/').pop()] || doc.label.split('/').pop())}</button>`).join('')}</nav><section data-workspace-reader aria-live="polite"></section></div>` : `<p>${e(empty)}</p>`;
    }

    clear() {
      this.state.workspaceRepository = null;
      this.state.workspaceProject = null;
      this.header();
    }

    openRepository(path, view = 'git') {
      if (!this.app.isManagedPath(path)) return false;
      this.app.closeQuickLook();
      this.state.workspaceProject = null;
      const returnContext = this.state.workspaceRepository?.returnContext || this.captureReturnContext();
      this.state.workspaceRepository = { path, view, returnContext };
      this.state.sidebarNavigationMode = 'projects';
      this.state.currentMode = 'tree';
      this.state.contentQuery = root.ContentQuery.queryForPreset('current-all');
      this.state.searchQuery = '';
      const search = document.getElementById('search-input');
      if (search) search.value = '';
      this.state.searchScope = 'current';
      const owner = root.ProjectShortcuts.findProjectForPath(this.state.localProjects, path, this.bridge.platform);
      const sidebar = this.app.projectShortcutsController;
      if (owner) {
        sidebar.expandedProjectIds.add(owner.projectId);
        for (const group of this.state.projectGroups) {
          if (group.kind === 'collection' && root.ProjectGroups.descendantProjectIds(group, this.state.projectGroups).includes(owner.projectId)) sidebar.expandedProjectIds.add(group.groupId);
          sidebar.expandedTypeIds.delete(`collapsed:${group.groupId}`);
        }
      }
      this.app.updateModeUI();
      this.app.navigateTo(path);
      sidebar.render();
      if (view === 'git') void this.app.selectRepo(path);
      return true;
    }

    openProject(project) {
      return this.openRepository(project.path, project.rootIsGitRepo ? 'git' : 'project');
    }

    header() {
      const el = document.getElementById('repository-workspace-tabs');
      const repo = this.state.workspaceRepository;
      document.body.classList.toggle('workspace-overview-active', this.state.currentMode === 'tree' && Boolean(this.state.workspaceProject || repo && repo.view !== 'files'));
      document.body.classList.toggle('workspace-git-active', this.state.currentMode === 'tree' && repo?.view === 'git');
      this.app.updateToolbarMenuState();
      el.hidden = !repo || this.state.currentMode !== 'tree';
      if (el.hidden) return;
      const e = text => this.app.escapeHtml(text || '');
      const owner = this.state.localProjects.find(p => p.path === repo.path);
      const kindPath = owner?.path || repo.path;
      const kindTitle = owner ? `编辑“${owner.name}”的项目属性` : '添加项目属性';
      const views = [['project','概览'], ...(owner?.rootIsGitRepo === false ? [] : [['git','代码']]), ['files','文件'], ['tasks','任务'], ['chats','会话'], ['release','版本'], ['records','记录']];
      el.innerHTML = `<button type="button" class="btn btn-small" data-workspace-back title="返回进入仓库前的列表和筛选">← 返回列表</button><strong id="repository-workspace-name" title="${e(repo.path)}">⑂ ${e(owner?.name || repo.path.split(/[\\/]/).pop())}</strong><button type="button" class="project-kind-badge project-kind-control" data-workspace-kind="${e(kindPath)}" title="${e(kindTitle)}">${e(owner ? root.ProjectKinds.label(owner.projectKind) : '项目属性')} ▾</button><div role="tablist" aria-label="工作区视图">${views.map(([id,label]) => `<button class="btn btn-small ${repo.view===id?'btn-primary':''}" role="tab" aria-selected="${repo.view===id}" data-workspace-view="${id}">${label}</button>`).join('')}</div>`;
    }

    projectContext(path) {
      const owner = root.ProjectShortcuts.findProjectForPath(this.state.localProjects, path, this.bridge.platform);
      if (!owner) return [];
      const results = [];
      const visit = (project, parents = []) => {
        if (project.projectId === owner.projectId) results.push([...parents, project]);
        for (const child of project.memberProjects || []) visit(child, [...parents, project]);
      };
      this.app.projectEntries().forEach(project => visit(project));
      return results;
    }

    async render(container, requestId) {
      this.header();
      const repo = this.state.workspaceRepository;
      const project = this.state.workspaceProject;
      if (!repo && !project || repo?.view === 'files') return false;
      this.state.visibleItems = [];
      this.state.fileDisplayOrder = [];
      document.getElementById('empty-state').style.display = 'none';
      container.classList.remove('column-view-active','gallery-view-active');
      const e = value => this.app.escapeHtml(String(value ?? ''));
      const current = () => requestId === this.state.directoryRenderRequestId;
      const projectButton = p => `<button class="btn" data-workspace-project="${e(p.projectId)}">${e(p.name)}</button>`;
      container.innerHTML = '<div class="workspace-overview">正在读取工作区…</div>';
      try {
        if (project) {
          const entries = await this.bridge.fs.listDirectory(project.path, { showHidden: false, recursive: false });
          if (!current()) return true;
          const repos = project.repositories || [];
          const children = root.ProjectShortcuts.projectChildren(this.state.localProjects, project.projectId, this.bridge.platform);
          const dirs = entries.filter(item => item.type === 'directory' && !repos.some(r => r.path === item.path) && !children.some(p => p.path === item.path));
          container.innerHTML = `<section class="workspace-overview"><h2>${e(project.name)}</h2><p>${e(project.description)}</p><button class="btn" data-workspace-folder="${e(project.path)}">浏览项目文件</button><h3>子项目</h3>${children.map(projectButton).join('') || '<p>暂无子项目</p>'}<h3>Git 仓库</h3>${repos.map(r => `<button class="workspace-member" data-workspace-repository="${e(r.path)}">⑂ ${e(r.relativePath === '.' ? project.name : r.relativePath || r.name)}</button>`).join('') || '<p>暂无 Git 仓库</p>'}<h3>目录</h3>${dirs.map(d => `<button class="workspace-member" data-workspace-folder="${e(d.path)}">📁 ${e(d.name)}</button>`).join('') || '<p>暂无子目录</p>'}</section>`;
        } else if (['project', 'tasks', 'chats', 'release', 'records'].includes(repo.view)) {
          const owner = this.state.localProjects.find(p => p.path === repo.path);
          const chats = this.app.projectConversationsController;
          if (repo.view === 'tasks') {
            container.innerHTML = owner ? `<section class="workspace-overview project-workspace-content"><div data-project-task-board="${e(owner.projectId)}">正在读取项目任务…</div><section data-workspace-task-detail></section></section>` : '<section class="workspace-overview"><h2>任务</h2><p>此仓库尚未关联项目台账。可在项目属性中关联任务所属项目。</p></section>';
            if (owner) await chats.loadWorkspace(owner.projectId);
          } else if (repo.view === 'chats') {
            const documents = await this.documents(repo.path, ['docs/ai-context/conversations']);
            if (!current()) return true;
            const rows = owner ? chats.conversations(owner.projectId) : [];
            container.innerHTML = `<section class="workspace-overview"><h2>会话</h2>${rows.map(item => `<article class="project-chat-task-card"><h3>${e(item.title)}</h3><p>${e(item.summary || '暂无已保存摘要，可在下方阅读本地会话存档。')}</p><button class="btn btn-small" data-chat-action="open" data-chat-project="${e(owner.projectId)}" data-chat-source="${e(item.source)}" data-chat-thread="${e(item.threadId)}">在 ${item.source === 'codex' ? 'Codex' : 'ChatGPT'} 中继续 ↗</button></article>`).join('')}${owner ? `<button class="btn btn-small" data-chat-action="edit" data-chat-project="${e(owner.projectId)}">关联 / 编辑会话</button>` : ''}<h3>本地会话存档</h3>${this.readerMarkup(documents, '暂无本地会话存档；外部会话正文不会自动同步。')}</section>`;
          } else if (repo.view === 'records' || repo.view === 'release') {
            let documents = await this.documents(repo.path);
            if (!current()) return true;
            let extra = '';
            if (repo.view === 'release') {
              documents = documents.filter(doc => /release|changelog|version|发布|版本/i.test(doc.label));
              const log = await this.bridge.git.getLog(repo.path, 8).catch(() => []);
              if (!current()) return true;
              extra = `<h3>最近提交</h3><p class="file-operation-hint">提交记录用于核对版本变更，不代表已经发布。</p>${(Array.isArray(log) ? log : []).map(item => `<p><code>${e(item.hash?.slice(0,7))}</code> ${e(item.message)}</p>`).join('') || '<p>暂无提交记录</p>'}`;
              if (owner) {
                const workspace = await this.bridge.projectConversations.workspace(owner.projectId);
                if (!current()) return true;
                extra += `<h3>远端发布与构建</h3><p>在 GitHub 中查看远端状态或操作发布。</p>${workspace.repositories.map(item => `<div class="project-chat-row-actions">${[['releases','GitHub Releases ↗'],['actions','GitHub Actions ↗']].map(([view,label]) => `<button class="btn" data-chat-action="open-repository" data-chat-project="${e(owner.projectId)}" data-chat-repository="${e(item.repository)}" data-chat-view="${view}">${e(item.repository)} · ${label}</button>`).join('')}</div>`).join('') || '<p>未关联 GitHub 远程仓库</p>'}`;
              }
            }
            container.innerHTML = `<section class="workspace-overview"><h2>${repo.view === 'release' ? '版本与发布记录' : '项目记录'}</h2>${this.readerMarkup(documents, repo.view === 'release' ? '暂无本地版本或发布文档。' : '暂无本地记录。')} ${extra}</section>`;
          } else {
            const chains = this.projectContext(repo.path).map(chain => chain.filter(p => p.path !== repo.path));
            const [entries, status, review, readme] = await Promise.all([
              this.bridge.fs.listDirectory(repo.path, {showHidden:false,recursive:false}),
              this.bridge.git.getStatus(repo.path, {autoFetch:false,forceRefresh:true}),
              this.bridge.git.getWorkingTree(repo.path),
              this.bridge.fs.readMarkdownDocument(repo.path, 'README.md').catch(() => null)
            ]);
            if (!current()) return true;
            const directories = entries.filter(item => item.type === 'directory');
            container.innerHTML = `<section class="workspace-overview"><h2>${e(owner?.name || repo.path.split(/[\\/]/).pop())}</h2>${owner?.description ? `<p>${e(owner.description)}</p>` : ''}<p class="file-operation-hint">${e(repo.path)}</p><div class="workspace-summary-stats"><span>${e(status.branch || '无分支')} · ${review.files?.length || 0} 个变更</span><span>${entries.length - directories.length} 个文件 · ${directories.length} 个文件夹（当前层）</span></div>${chains.some(c=>c.length) ? `<h3>所属项目</h3>${chains.map(chain=>chain.map(projectButton).join(' / ')).join(' · ')}` : ''}<h3>目录</h3>${directories.map(d=>`<button class="workspace-member" data-workspace-folder="${e(d.path)}">📁 ${e(d.name)}</button>`).join('') || '<p>暂无子目录</p>'}<h3>说明文档</h3><article class="markdown-preview">${this.app.renderMarkdown(readme?.content || '暂无 README 说明文档。')}</article></section>`;
          }

        } else {
          const [status, review, log] = await Promise.all([this.bridge.git.getStatus(repo.path, {autoFetch:false,forceRefresh:true}), this.bridge.git.getWorkingTree(repo.path), this.bridge.git.getLog(repo.path, 12)]);
          if (!current()) return true;
          if (!status.isGitRepo || !review.success) throw Error(review.error || status.error || '仓库不可用');
          const chains = this.projectContext(repo.path);
          const ancestors = chains.map(chain => chain.filter(project => project.path !== repo.path)).filter(chain => chain.length);
          const contextHtml = ancestors.map(chain => chain.map(p => `<button type="button" class="workspace-context-link" data-workspace-project="${e(p.projectId)}">${e(p.name)}</button>`).join('<span aria-hidden="true"> / </span>')).join(' · ') || (!chains.length ? '' : '');
          container.innerHTML = root.WorkspacePresentation.gitOverview({ status, review, log, contextHtml });
          container.querySelectorAll('[data-workspace-diff]').forEach(button => button.addEventListener('click', async () => {
            const token = this.diffRequest = (this.diffRequest || 0) + 1;
            const file = review.files[Number(button.dataset.workspaceDiff)];
            const diff = await this.bridge.git.getFileDiff(repo.path, file.path, { staged: !file.unstaged && file.staged });
            if (!current() || token !== this.diffRequest) return;
            const panel = container.querySelector('#workspace-diff-panel');
            const output = container.querySelector('#workspace-file-diff');
            panel.hidden = false;
            output.hidden = false;
            container.querySelector('#workspace-diff-name').textContent = file.path;
            output.textContent = diff.success ? (diff.diff || '无文本差异') : diff.error;
            panel.scrollIntoView({ block: 'nearest' });
          }));
          container.querySelector('[data-workspace-close-diff]').addEventListener('click', () => {
            this.diffRequest = (this.diffRequest || 0) + 1;
            container.querySelector('#workspace-diff-panel').hidden = true;
            container.querySelector('#workspace-file-diff').hidden = true;
          });
          container.querySelectorAll('[data-workspace-git]').forEach(button => button.addEventListener('click', () => {
            const action=button.dataset.workspaceGit;
            const menu = button.closest('details'); if (menu) menu.open = false;
            if(action==='review') GitOps.openCommitModal(repo.path);
            else if(action==='refresh') this.app.renderContent();
            else if(action==='tools') this.app.workspaceToolsController.openRepository(repo.path);
            else GitOps[action](repo.path);
          }));
        }
        container.querySelectorAll('[data-workspace-record]').forEach(button => button.addEventListener('click', () => this.showDocument(container, button.dataset.workspaceRecord, current)));
        const firstDocument = container.querySelector('[data-workspace-record]');
        if (firstDocument) await this.showDocument(container, firstDocument.dataset.workspaceRecord, current);
        container.querySelectorAll('[data-workspace-project]').forEach(button=>button.addEventListener('click',()=>{
          const id=button.dataset.workspaceProject;
          if(id.startsWith('project_group_')) this.app.applyProjectType(id);
          else { const p=this.state.localProjects.find(p=>p.projectId===id);if(p)this.openProject(p); }
        }));
        container.querySelectorAll('[data-workspace-repository]').forEach(button=>button.addEventListener('click',()=>this.openRepository(button.dataset.workspaceRepository)));
        container.querySelectorAll('[data-workspace-folder]').forEach(button=>button.addEventListener('click',()=>{ if (this.state.workspaceRepository) { this.state.workspaceRepository.view = 'files'; this.app.navigateTo(button.dataset.workspaceFolder); } else this.app.openLocalProject(button.dataset.workspaceFolder); }));
      } catch (error) {
        if(current()) {
          container.innerHTML=`<section class="workspace-overview"><h2>无法读取工作区</h2><p>${e(error.message)}</p><button type="button" class="btn" data-workspace-retry>重新读取</button></section>`;
          container.querySelector('[data-workspace-retry]').addEventListener('click', () => this.app.renderContent());
        }
      }
      return true;
    }
  }
  root.WorkspaceController = { Controller };
})(window);
