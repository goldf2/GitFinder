(function (root) {
  class Controller {
    constructor(app, state, bridge) {
      this.app = app;
      this.state = state;
      this.bridge = bridge;
      document.getElementById('repository-workspace-tabs').addEventListener('click', event => {
        const view = event.target.closest('[data-workspace-view]')?.dataset.workspaceView;
        if (!view || !this.state.workspaceRepository) return;
        this.state.workspaceRepository.view = view;
        this.app.clearFileSelection();
        if (view === 'files') this.app.navigateTo(this.state.workspaceRepository.path);
        else this.app.renderContent();
      });
    }

    clear() {
      this.state.workspaceRepository = null;
      this.state.workspaceProject = null;
      this.header();
    }

    openRepository(path) {
      if (!this.app.isManagedPath(path)) return false;
      this.app.closeQuickLook();
      this.state.workspaceProject = null;
      this.state.workspaceRepository = { path, view: 'git' };
      this.state.sidebarNavigationMode = 'projects';
      this.state.currentMode = 'tree';
      this.state.contentQuery = root.ContentQuery.queryForPreset('current-all');
      this.state.searchQuery = '';
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
      void this.app.selectRepo(path);
      return true;
    }

    openProject(project) {
      if (project.rootIsGitRepo && project.repositoryCount <= 1) return this.openRepository(project.path);
      if (!(project.repositories || []).length) { this.app.openLocalProject(project.path); return true; }
      this.clear();
      this.state.workspaceProject = project;
      this.state.currentMode = 'tree';
      this.state.contentQuery = root.ContentQuery.queryForPreset('current-all');
      this.state.searchQuery = '';
      this.app.navigateTo(project.path);
      this.app.projectShortcutsController.render();
      return true;
    }

    header() {
      const el = document.getElementById('repository-workspace-tabs');
      const repo = this.state.workspaceRepository;
      document.body.classList.toggle('workspace-overview-active', this.state.currentMode === 'tree' && Boolean(this.state.workspaceProject || repo && repo.view !== 'files'));
      this.app.updateToolbarMenuState();
      el.hidden = !repo || this.state.currentMode !== 'tree';
      if (el.hidden) return;
      const e = text => this.app.escapeHtml(text || '');
      el.innerHTML = `<strong title="${e(repo.path)}">⑂ ${e(repo.path.split(/[\\/]/).pop())}</strong><div role="tablist" aria-label="仓库工作视图">${[['git','Git'],['files','文件'],['project','所属项目']].map(([id,label]) => `<button class="btn btn-small ${repo.view===id?'btn-primary':''}" role="tab" aria-selected="${repo.view===id}" data-workspace-view="${id}">${label}</button>`).join('')}</div>`;
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
        } else if (repo.view === 'project') {
          const chains = this.projectContext(repo.path);
          container.innerHTML = `<section class="workspace-overview"><h2>所属项目</h2>${chains.length ? chains.map(chain => `<div class="workspace-project-chain">${chain.map(projectButton).join('<span> › </span>')}</div>`).join('') : '<p>未归属项目。该仓库可独立使用。</p>'}<p>选择项目可查看同项目的其他仓库和资料目录。</p></section>`;
        } else {
          const [status, review, log] = await Promise.all([this.bridge.git.getStatus(repo.path, {autoFetch:false,forceRefresh:true}), this.bridge.git.getWorkingTree(repo.path), this.bridge.git.getLog(repo.path, 12)]);
          if (!current()) return true;
          if (!status.isGitRepo || !review.success) throw Error(review.error || status.error || '仓库不可用');
          const chains = this.projectContext(repo.path);
          container.innerHTML = `<section class="workspace-overview" id="git-workspace-view"><h2>${e(repo.path.split(/[\\/]/).pop())}</h2><p class="workspace-project-chain">${chains.length ? chains.map(chain=>chain.map(projectButton).join('<span> › </span>')).join(' · ') : '未归属项目'}</p><div class="workspace-git-summary"><span>分支 <strong>${e(status.branch || '尚无提交')}</strong></span><span>已暂存 ${review.stagedCount}</span><span>未暂存 ${review.unstagedCount}</span><span>领先 ${status.ahead} · 落后 ${status.behind}</span></div><div class="workspace-git-actions"><button class="btn btn-primary" data-workspace-git="review">审查与提交</button><button class="btn" data-workspace-git="fetch">Fetch</button><button class="btn" data-workspace-git="pull">Pull</button><button class="btn" data-workspace-git="push">Push</button><button class="btn" data-workspace-git="tools">分支与远程</button></div><h3>工作区变更 (${review.totalCount})</h3>${review.files.map((f,i)=>`<button class="workspace-member" data-workspace-diff="${i}">${e(f.path)} <small>${f.staged?'已暂存 ':''}${f.unstaged?'未暂存':''}</small></button>`).join('') || '<p>工作区干净</p>'}${review.limited?'<p>变更较多，仅显示部分文件；可打开审查查看。</p>':''}<pre id="workspace-file-diff" hidden></pre><h3>最近提交</h3>${log.map(c=>`<div class="workspace-commit"><code>${e(c.hash)}</code><span>${e(c.message)}</span><small>${e(c.author)}</small></div>`).join('') || '<p>暂无提交记录</p>'}</section>`;
          container.querySelectorAll('[data-workspace-diff]').forEach(button => button.addEventListener('click', async () => {
            const token = this.diffRequest = (this.diffRequest || 0) + 1;
            const file = review.files[Number(button.dataset.workspaceDiff)];
            const diff = await this.bridge.git.getFileDiff(repo.path, file.path, { staged: !file.unstaged && file.staged });
            if (!current() || token !== this.diffRequest) return;
            const output = container.querySelector('#workspace-file-diff');output.hidden=false;output.textContent=diff.success ? (diff.diff || '无文本差异') : diff.error;
          }));
          container.querySelectorAll('[data-workspace-git]').forEach(button => button.addEventListener('click', () => {
            const action=button.dataset.workspaceGit;
            if(action==='review') GitOps.openCommitModal(repo.path);
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
        container.querySelectorAll('[data-workspace-folder]').forEach(button=>button.addEventListener('click',()=>this.app.openLocalProject(button.dataset.workspaceFolder)));
      } catch (error) {
        if(current())container.innerHTML=`<section class="workspace-overview"><h2>无法读取工作区</h2><p>${e(error.message)}</p></section>`;
      }
      return true;
    }
  }
  root.WorkspaceController = { Controller };
})(window);
