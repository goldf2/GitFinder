(function (root) {
  class Controller {
    constructor(app, state, bridge) {
      this.app = app;
      this.state = state;
      this.bridge = bridge;
      this.flow = new root.WorkspaceFlowController.Controller(app, state, bridge);
      document.getElementById('repository-workspace-tabs').addEventListener('click', event => {
        if (event.target.closest('[data-workspace-global]')) {void this.app.workbenchPortfolioController.enter('dashboard');return;}
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
      this.app.syncFileSelectionUI();
      const selected = this.app.getSelectedFileItems();
      if (selected.length === 1 && selected[0].isGitRepo) await this.app.selectRepo(selected[0].path);
      else if (selected.length) this.app.showFileSelectionDetail(selected);
      const area = document.getElementById('content-scroll');
      if (area && !this.state.workspaceRepository) area.scrollTop = previous?.scrollTop || 0;
      return true;
    }

    captureReturnContext() {
      const keys = ['currentPath', 'currentMode', 'contentQuery', 'searchQuery', 'searchScope',
        'sidebarNavigationMode', 'selectedTags', 'selectedStatuses', 'selectedCategory', 'filterEnabled', 'history', 'historyIndex',
        'globalSearchMode', 'globalSearchType', 'viewMode', 'selectedPaths', 'selectionAnchorPath', 'fileKeyboardFocusPath'];
      return { state: structuredClone(Object.fromEntries(keys.filter(key => key in this.state).map(key => [key, this.state[key]]))),
        scrollTop: document.getElementById('content-scroll')?.scrollTop || 0 };
    }

    clear() {
      this.state.workspaceRepository = null;
      this.state.workspaceProject = null;
      this.header();
    }

    openRepository(path, view = 'git', focusTaskId = '') {
      if (!this.app.isManagedPath(path)) return false;
      this.app.closeQuickLook();
      this.state.workspaceProject = null;
      if (this.state.currentMode === 'tree' && !this.state.workspaceRepository && this.state.visibleItems.some(item => item.path === path)) {
        this.state.selectedPaths = new Set([path]);
        this.state.selectionAnchorPath = path;
        this.state.fileKeyboardFocusPath = path;
      }
      const returnContext = (this.state.currentMode === 'tree' && this.state.workspaceRepository?.returnContext) || this.captureReturnContext();
      this.state.workspaceRepository = { path, view, returnContext, focusTaskId };
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
      document.body.classList.toggle('workspace-flow-active', this.state.currentMode === 'tree' && Boolean(repo && repo.view !== 'files'));
      if (repo && repo.view !== 'files') this.flow.inspector(repo);
      this.app._applyPanelVisibility?.();
      this.app.updateToolbarMenuState();
      el.hidden = !repo || this.state.currentMode !== 'tree';
      if (el.hidden) return;
      const e = text => this.app.escapeHtml(text || '');
      const owner = this.state.localProjects.find(p => p.path === repo.path);
      const views = [['project','总览'], ['planning','资料与规划'], ['tasks','开发任务'], ['quality','测试验收'], ['release','版本交付'], ['records','维护记录'], ...(owner?.rootIsGitRepo === false ? [] : [['git','代码']]), ['files','文件'], ['chats','会话']];
      el.innerHTML = `<button type="button" class="btn btn-small" data-workspace-back title="返回进入仓库前的列表和筛选">← 返回列表</button><strong id="repository-workspace-name" title="${e(repo.path)}">${e(owner?.name || repo.path.split(/[\\/]/).pop())}</strong><button class="btn btn-small" data-workspace-global>${this.app.isExperimentalViewEnabled('dashboard')===false?'开启全局总览（测试）':'全局总览'}</button><div role="tablist" aria-label="工作区视图">${views.map(([id,label]) => `<button class="btn btn-small ${repo.view===id?'btn-primary':''}" role="tab" aria-selected="${repo.view===id}" data-workspace-view="${id}">${label}</button>`).join('')}</div>`;
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
        } else if (['project', 'planning', 'tasks', 'quality', 'chats', 'release', 'records'].includes(repo.view)) {
          await this.flow.render(container, repo, current);

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
            container.querySelectorAll('[data-workspace-diff]').forEach(row=>row.setAttribute('aria-current',String(row===button)));
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
