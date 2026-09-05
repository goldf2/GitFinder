(function exposeProjectShortcutsController(root, factory) {
  const projectShortcuts = typeof module !== 'undefined' && module.exports
    ? require('../../shared/projectShortcuts')
    : root?.ProjectShortcuts;
  const api = factory(projectShortcuts, root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ProjectShortcutsController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createProjectShortcutsControllerApi(ProjectShortcuts, root) {
  const NAVIGATION_MODES = Object.freeze(['projects', 'repositories', 'directories']);

  class Controller {
    constructor(options = {}) {
      this.app = options.app;
      this.state = options.state;
      this.bridge = options.bridge || root?.gitFinder;
      this.document = options.document || root?.document || null;
      this.platform = options.platform || this.bridge?.platform || '';
      this.localProjectsListPromise = null;
      this.expandedProjectIds = new Set();
      this.bound = false;
    }

    element(id) {
      return this.document?.getElementById(id) || null;
    }

    bind() {
      if (this.bound) return;
      this.bound = true;
      const navigation = this.element('sidebar-navigation');
      navigation?.addEventListener('click', event => {
        const mode = event.target.closest?.('[data-sidebar-navigation]')?.dataset.sidebarNavigation;
        if (mode) void this.setNavigationMode(mode);
      });
      navigation?.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const currentButton = event.target.closest?.('[data-sidebar-navigation]');
        if (!currentButton) return;
        event.preventDefault();
        const currentIndex = Math.max(0, NAVIGATION_MODES.indexOf(currentButton.dataset.sidebarNavigation));
        const mode = event.key === 'Home' ? NAVIGATION_MODES[0]
          : event.key === 'End' ? NAVIGATION_MODES[NAVIGATION_MODES.length - 1]
            : NAVIGATION_MODES[(currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + NAVIGATION_MODES.length) % NAVIGATION_MODES.length];
        void this.setNavigationMode(mode);
        this.element(`sidebar-navigation-${mode}`)?.focus();
      });
      this.element('project-shortcuts-list')?.addEventListener('click', event => {
        const pinButton = event.target.closest?.('[data-project-shortcut-pin]');
        if (pinButton) {
          event.stopPropagation();
          this.togglePinned(pinButton.dataset.projectShortcutPin);
          return;
        }
        const treeToggle = event.target.closest?.('[data-project-tree-toggle]');
        if (treeToggle) {
          event.stopPropagation();
          this.toggleExpandedProject(treeToggle.dataset.projectTreeToggle);
          return;
        }
        const repositoryButton = event.target.closest?.('[data-project-repository-path]');
        if (repositoryButton) {
          this.openRepository(repositoryButton.dataset.projectRepositoryPath);
          return;
        }
        if (event.target.closest?.('[data-project-shortcut-all]')) {
          this.app.applyContentPreset('all-projects');
          return;
        }
        const projectButton = event.target.closest?.('[data-project-shortcut-id]');
        if (projectButton) this.open(projectButton.dataset.projectShortcutId);
      });
      this.element('repository-shortcuts-list')?.addEventListener('click', event => {
        if (event.target.closest?.('[data-repository-shortcut-all]')) {
          this.app.applyContentPreset('all-repositories');
          return;
        }
        const repositoryButton = event.target.closest?.('[data-repository-shortcut-path]');
        if (repositoryButton) this.openRepository(repositoryButton.dataset.repositoryShortcutPath);
      });
    }

    async load() {
      const [rawStore, rawPreferences, navigationMode] = await Promise.all([
        this.bridge.config.get('projectShortcuts').catch(() => null),
        this.bridge.config.get('projectShortcutPreferences').catch(() => null),
        this.bridge.config.get('sidebarNavigationMode').catch(() => null)
      ]);
      this.state.projectShortcuts = ProjectShortcuts.normalizeStore(rawStore);
      this.state.projectShortcutPreferences = ProjectShortcuts.normalizePreferences(rawPreferences);
      this.state.sidebarNavigationMode = NAVIGATION_MODES.includes(navigationMode) ? navigationMode : 'directories';
      this.render();
      return this.state.projectShortcuts;
    }

    async setNavigationMode(mode) {
      if (!NAVIGATION_MODES.includes(mode)) return;
      this.state.sidebarNavigationMode = mode;
      this.render();
      try {
        await this.bridge.config.set('sidebarNavigationMode', mode);
      } catch (_) {
        this.app._showStatusMessage('侧栏已切换，但未能保存导航偏好', 'warning');
      }
    }

    renderNavigation() {
      const mode = NAVIGATION_MODES.includes(this.state.sidebarNavigationMode)
        ? this.state.sidebarNavigationMode
        : 'directories';
      const projects = this.element('project-shortcuts-sidebar-section');
      const repositories = this.element('repository-shortcuts-sidebar-section');
      const locations = this.element('locations-sidebar-section');
      if (projects) projects.hidden = mode !== 'projects';
      if (repositories) repositories.hidden = mode !== 'repositories';
      if (locations) locations.hidden = mode !== 'directories';
      this.element('sidebar-navigation')?.querySelectorAll('[data-sidebar-navigation]').forEach(button => {
        const selected = button.dataset.sidebarNavigation === mode;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
    }

    async loadLocalProjects(forceRefresh = false) {
      if (!forceRefresh && this.state.localProjects.length) return this.state.localProjects;
      if (this.localProjectsListPromise) return this.localProjectsListPromise;
      this.localProjectsListPromise = this.bridge.localProjects.list()
        .then(projects => {
          this.state.localProjects = Array.isArray(projects) ? projects : [];
          const availableIds = new Set(this.state.localProjects.map(project => project?.projectId).filter(Boolean));
          this.expandedProjectIds = new Set([...this.expandedProjectIds].filter(projectId => availableIds.has(projectId)));
          return this.state.localProjects;
        })
        .finally(() => { this.localProjectsListPromise = null; });
      return this.localProjectsListPromise;
    }

    async refresh(forceRefresh = false) {
      const projects = await this.loadLocalProjects(forceRefresh);
      const merged = ProjectShortcuts.mergeKnownProjects(this.state.projectShortcuts, projects);
      if (!ProjectShortcuts.storesEqual(merged, this.state.projectShortcuts)) {
        this.state.projectShortcuts = merged;
        await this.bridge.config.set('projectShortcuts', merged);
      }
      await this.recordVisit(this.state.currentPath);
      this.render();
      return projects;
    }

    async upsertLocalProject(project) {
      if (!project?.projectId || !project?.path) return false;
      const existingIndex = this.state.localProjects.findIndex(item => item?.projectId === project.projectId);
      const existing = existingIndex >= 0 ? this.state.localProjects[existingIndex] : null;
      const next = {
        ...(existing || {}),
        ...project,
        repositories: Array.isArray(project.repositories)
          ? project.repositories
          : (existing?.repositories || []),
        repositoryCount: Number.isFinite(Number(project.repositoryCount))
          ? Number(project.repositoryCount)
          : Number(existing?.repositoryCount || 0),
        rootIsGitRepo: typeof project.rootIsGitRepo === 'boolean'
          ? project.rootIsGitRepo
          : existing?.rootIsGitRepo === true
      };
      this.state.localProjects = existingIndex >= 0
        ? this.state.localProjects.map((item, index) => index === existingIndex ? next : item)
        : [...this.state.localProjects, next];
      const merged = ProjectShortcuts.mergeKnownProjects(this.state.projectShortcuts, this.state.localProjects);
      const shortcutsChanged = !ProjectShortcuts.storesEqual(merged, this.state.projectShortcuts);
      this.state.projectShortcuts = merged;
      this.render();
      if (shortcutsChanged) await this.bridge.config.set('projectShortcuts', merged);
      return next;
    }

    async recordVisit(directoryPath) {
      if (!directoryPath || !this.state.localProjects.length) return false;
      const project = ProjectShortcuts.findProjectForPath(
        this.state.localProjects,
        directoryPath,
        this.platform
      );
      if (!project) {
        this.render();
        return false;
      }
      const next = ProjectShortcuts.touchProject(this.state.projectShortcuts, project);
      if (ProjectShortcuts.storesEqual(next, this.state.projectShortcuts)) {
        this.render();
        return false;
      }
      this.state.projectShortcuts = next;
      this.render();
      await this.bridge.config.set('projectShortcuts', next);
      return true;
    }

    async togglePinned(projectId) {
      const display = ProjectShortcuts.resolveDisplay(this.state.projectShortcuts, this.state.localProjects);
      const entry = [...display.pinned, ...display.recent].find(item => item.projectId === projectId);
      const project = entry?.project
        || this.state.localProjects.find(item => item.projectId === projectId)
        || entry;
      if (!project?.projectId) return false;
      const currentlyPinned = display.pinned.some(item => item.projectId === projectId);
      const next = ProjectShortcuts.setPinned(this.state.projectShortcuts, project, !currentlyPinned);
      this.state.projectShortcuts = next;
      this.render();
      await this.bridge.config.set('projectShortcuts', next);
      this.app._showStatusMessage(currentlyPinned ? '已从项目快捷入口取消固定' : '已固定到项目快捷入口', 'success');
      return true;
    }

    toggleExpandedProject(projectId) {
      if (!this.state.localProjects.some(project => project?.projectId === projectId)) return false;
      if (this.expandedProjectIds.has(projectId)) this.expandedProjectIds.delete(projectId);
      else this.expandedProjectIds.add(projectId);
      this.render();
      return true;
    }

    async open(projectId) {
      let project = this.state.localProjects.find(item => item.projectId === projectId);
      if (!project) {
        await this.refresh(true);
        project = this.state.localProjects.find(item => item.projectId === projectId);
      }
      if (!project?.path) {
        this.app._showStatusMessage('项目位置不可用；可取消固定或重新添加所在受管目录', 'warning');
        return false;
      }
      this.app.openLocalProject(project.path);
      return true;
    }

    openRepository(repositoryPath) {
      const pathsEqual = (left, right) => ProjectShortcuts.pathIsWithin(left, right, this.platform)
        && ProjectShortcuts.pathIsWithin(right, left, this.platform);
      const projectRepositories = (this.state.localProjects || [])
        .flatMap(project => Array.isArray(project?.repositories) ? project.repositories : []);
      const repository = [...(this.state.allRepos || []), ...projectRepositories]
        .find(item => pathsEqual(item.path, repositoryPath));
      if (!repository?.path) {
        this.app._showStatusMessage('Git 仓库位置不可用；请重新扫描受管目录', 'warning');
        return false;
      }
      this.app.openLocalProject(repository.path);
      return true;
    }

    async savePreferences(value) {
      const preferences = ProjectShortcuts.normalizePreferences(value);
      this.state.projectShortcutPreferences = preferences;
      this.render();
      await this.bridge.config.set('projectShortcutPreferences', preferences);
      return preferences;
    }

    async clearRecent() {
      const current = ProjectShortcuts.normalizeStore(this.state.projectShortcuts);
      if (!current.recent.length) return false;
      const next = ProjectShortcuts.normalizeStore({ ...current, recent: [] });
      this.state.projectShortcuts = next;
      this.render();
      await this.bridge.config.set('projectShortcuts', next);
      return true;
    }

    render() {
      this.renderNavigation();
      const section = this.element('project-shortcuts-sidebar-section');
      const container = this.element('project-shortcuts-list');
      if (!section || !container) {
        this.renderRepositoryShortcuts();
        return;
      }
      const preferences = ProjectShortcuts.normalizePreferences(this.state.projectShortcutPreferences);
      const display = ProjectShortcuts.resolveDisplay(this.state.projectShortcuts, this.state.localProjects);
      const recent = preferences.visible && preferences.showRecent ? display.recent.slice(0, preferences.recentLimit) : [];
      const pinned = preferences.visible ? display.pinned : [];
      const shortcutIds = new Set([...pinned, ...recent].map(entry => entry.projectId));
      const remainingProjects = [...this.state.localProjects]
        .filter(project => project?.projectId && !shortcutIds.has(project.projectId))
        .sort((left, right) => String(left.name || left.path).localeCompare(String(right.name || right.path), 'zh-CN'))
        .map(project => ({ projectId: project.projectId, project, available: Boolean(project.path) }));
      const activeProject = ProjectShortcuts.findProjectForPath(
        this.state.localProjects,
        this.state.currentPath,
        this.platform
      );
      const renderEntry = (entry, pinned) => {
        const project = entry.project;
        const available = entry.available && project?.path;
        const active = available && activeProject?.projectId === entry.projectId && !this.app.isContentCollection();
        const item = project
          ? { type: 'directory', isProject: true, isGitRepo: project.rootIsGitRepo === true, project }
          : { type: 'directory', isProject: true, isGitRepo: false, project: { color: 'gray' } };
        const name = project?.name || entry.name || '未命名项目';
        const title = available ? project.path : `${name} · 项目位置不可用`;
        const repositories = [...(Array.isArray(project?.repositories) ? project.repositories : [])]
          .filter(repository => repository?.path)
          .sort((left, right) => String(left.relativePath || left.name || left.path)
            .localeCompare(String(right.relativePath || right.name || right.path), 'zh-CN'));
        const expanded = available && this.expandedProjectIds.has(entry.projectId);
        const childrenId = `project-tree-children-${entry.projectId}`;
        const repositoryRows = repositories.map(repository => {
          const repositoryName = repository.relativePath === '.'
            ? '项目根仓库'
            : (repository.relativePath || repository.name || repository.path);
          const repositoryActive = !this.app.isContentCollection()
            && ProjectShortcuts.pathIsWithin(this.state.currentPath, repository.path, this.platform)
            && ProjectShortcuts.pathIsWithin(repository.path, this.state.currentPath, this.platform);
          return `
            <button class="sidebar-item sidebar-shortcut-open project-tree-repository ${repositoryActive ? 'active' : ''}" data-project-repository-path="${this.app.escapeHtml(repository.path)}" type="button" title="${this.app.escapeHtml(repository.path)}">
              ${this.app.getItemKindIconHtml({ type: 'directory', isGitRepo: true }, 'sidebar-kind-icon')}
              <span class="sidebar-item-name">${this.app.escapeHtml(repositoryName)}</span>
            </button>`;
        }).join('');
        return `
          <div class="sidebar-shortcut-row project-shortcut-row ${active ? 'active' : ''} ${available ? '' : 'is-unavailable'}">
            ${available
              ? `<button class="tree-node-toggle project-tree-toggle ${expanded ? 'expanded' : ''}" data-project-tree-toggle="${this.app.escapeHtml(entry.projectId)}" type="button" aria-expanded="${expanded}" aria-controls="${childrenId}" aria-label="${expanded ? '折叠' : '展开'} ${this.app.escapeHtml(name)}">${expanded ? '▼' : '▶'}</button>`
              : '<span class="tree-node-toggle tree-node-toggle-placeholder project-tree-toggle-placeholder" aria-hidden="true">•</span>'}
            <button class="sidebar-item sidebar-shortcut-open project-shortcut-open" data-project-shortcut-id="${this.app.escapeHtml(entry.projectId)}" data-project-shortcut-path="${this.app.escapeHtml(project?.path || '')}" type="button" title="${this.app.escapeHtml(title)}" aria-disabled="${available ? 'false' : 'true'}">
              ${this.app.getItemKindIconHtml(item, 'sidebar-kind-icon')}
              <span class="sidebar-item-name">${this.app.escapeHtml(name)}</span>
              ${available ? `<span class="badge" title="${repositories.length} 个关联 Git 仓库">${repositories.length}</span>` : ''}
              ${available ? '' : '<span class="project-shortcut-status">不可用</span>'}
            </button>
            <button class="project-shortcut-pin ${pinned ? 'active' : ''}" data-project-shortcut-pin="${this.app.escapeHtml(entry.projectId)}" type="button" title="${pinned ? '取消固定' : '固定到项目区'}" aria-label="${pinned ? '取消固定' : '固定'} ${this.app.escapeHtml(name)}">${pinned ? '●' : '○'}</button>
          </div>
          ${expanded ? `<div class="project-tree-children" id="${childrenId}" role="group" aria-label="${this.app.escapeHtml(name)} 的关联仓库">
            ${repositoryRows || '<div class="sidebar-shortcut-empty project-tree-empty">暂无关联 Git 仓库</div>'}
          </div>` : ''}`;
      };
      const allProjectsActive = this.app.contentCollectionKind() === 'projects';
      container.innerHTML = `
        <button class="sidebar-item sidebar-shortcut-all project-shortcut-all ${allProjectsActive ? 'active' : ''}" data-project-shortcut-all type="button" title="显示所有受管位置中的项目">
          <span class="sidebar-icon sidebar-shortcut-all-icon project-shortcut-all-icon" aria-hidden="true">▦</span>
          <span class="sidebar-item-name">所有项目</span>
          <span class="badge">${this.state.localProjects.length}</span>
        </button>
        ${pinned.length ? `<div class="sidebar-shortcut-heading project-shortcut-heading">已固定</div>${pinned.map(entry => renderEntry(entry, true)).join('')}` : ''}
        ${recent.length ? `<div class="sidebar-shortcut-heading project-shortcut-heading">最近</div>${recent.map(entry => renderEntry(entry, false)).join('')}` : ''}
        ${remainingProjects.length ? `<div class="sidebar-shortcut-heading project-shortcut-heading">项目</div>${remainingProjects.map(entry => renderEntry(entry, false)).join('')}` : ''}
        ${this.state.localProjects.length ? '' : '<div class="sidebar-shortcut-empty">尚未识别到本地项目</div>'}`;
      this.renderRepositoryShortcuts();
    }

    renderRepositoryShortcuts() {
      const container = this.element('repository-shortcuts-list');
      if (!container) return;
      const repositories = [...(this.state.allRepos || [])]
        .filter(repository => repository?.path)
        .sort((left, right) => String(left.name || left.path).localeCompare(String(right.name || right.path), 'zh-CN'));
      const activePath = String(this.state.currentPath || '');
      const pathsEqual = (left, right) => ProjectShortcuts.pathIsWithin(left, right, this.platform)
        && ProjectShortcuts.pathIsWithin(right, left, this.platform);
      const allRepositoriesActive = this.app.contentCollectionKind() === 'repositories';
      container.innerHTML = `
        <button class="sidebar-item sidebar-shortcut-all repository-shortcut-all ${allRepositoriesActive ? 'active' : ''}" data-repository-shortcut-all type="button" title="显示所有受管位置中的 Git 仓库">
          <span class="sidebar-icon sidebar-shortcut-all-icon" aria-hidden="true">⑂</span>
          <span class="sidebar-item-name">所有 Git 仓库</span>
          <span class="badge">${repositories.length}</span>
        </button>
        ${repositories.length ? '<div class="sidebar-shortcut-heading">仓库</div>' : '<div class="sidebar-shortcut-empty">尚未扫描到 Git 仓库</div>'}
        ${repositories.map(repository => {
          const name = repository.name || repository.path;
          const active = pathsEqual(repository.path, activePath) && !this.app.isContentCollection();
          return `
            <button class="sidebar-item sidebar-shortcut-open repository-shortcut-open ${active ? 'active' : ''}" data-repository-shortcut-path="${this.app.escapeHtml(repository.path)}" type="button" title="${this.app.escapeHtml(repository.path)}">
              ${this.app.getItemKindIconHtml({ type: 'directory', isGitRepo: true }, 'sidebar-kind-icon')}
              <span class="sidebar-item-name">${this.app.escapeHtml(name)}</span>
            </button>`;
        }).join('')}`;
    }
  }

  return { Controller };
});
