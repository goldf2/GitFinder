(function exposeSidebarTreeController(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SidebarTreeController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createSidebarTreeControllerApi(root) {
  function isWindowsPath(pathValue, platform = '') {
    const value = String(pathValue || '');
    return platform === 'win32'
      || /^[A-Za-z]:[\\/]/.test(value)
      || /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.test(value);
  }

  function normalizePath(pathValue, platform = '') {
    const original = String(pathValue || '');
    if (!original) return '';
    const windows = isWindowsPath(original, platform);
    let normalized = windows ? original.replace(/\//g, '\\') : original;
    normalized = normalized.replace(windows ? /\\+$/ : /\/+$/, '');
    if (!normalized) normalized = windows ? original : '/';
    return platform === 'win32' || windows ? normalized.toLowerCase() : normalized;
  }

  function pathsEqual(left, right, platform = '') {
    const first = normalizePath(left, platform);
    const second = normalizePath(right, platform);
    return Boolean(first) && first === second;
  }

  function pathIsWithin(candidatePath, rootPath, platform = '') {
    const candidate = normalizePath(candidatePath, platform);
    const root = normalizePath(rootPath, platform);
    if (!candidate || !root) return false;
    if (candidate === root) return true;
    const separator = isWindowsPath(rootPath, platform) ? '\\' : '/';
    return candidate.startsWith(root === separator ? root : `${root}${separator}`);
  }

  function fallbackName(pathValue) {
    const parts = String(pathValue || '').split(/[\\/]/).filter(Boolean);
    return parts.at(-1) || String(pathValue || '') || '受管位置';
  }

  class Controller {
    constructor(options = {}) {
      this.app = options.app;
      this.state = options.state;
      this.bridge = options.bridge;
      this.document = options.document;
      this.renderRevision = 0;
      this.platform = options.platform || this.bridge?.platform || '';
      this.confirm = options.confirm
        || (typeof root?.confirm === 'function' ? root.confirm.bind(root) : () => false);
    }

    async init() {
      await this.loadRoots();
    }

    async loadRoots() {
      try {
        const roots = await this.bridge.config.getTreeRoots();
        this.app._treeRoots = Array.isArray(roots) ? roots : [];
      } catch (_error) {
        this.app._treeRoots = [];
      }
      this.app._treeRootsLoaded = true;
      if (!(this.app._treeExpandedPaths instanceof Set)) this.app._treeExpandedPaths = new Set();
      for (const root of this.app._treeRoots) {
        if (root?.path && root.expanded !== false) this.app._treeExpandedPaths.add(root.path);
      }
      await this.render();
    }

    async addRootDialog() {
      const selection = await this.bridge.fs.selectFolder();
      if (!selection?.path) return false;
      await this.addRoot(selection.path, undefined, selection.grantToken);
      return true;
    }

    async addRoot(directoryPath, name, grantToken, { navigate = true } = {}) {
      this.app._treeRoots = await this.bridge.config.addTreeRoot(directoryPath, name, grantToken);
      await this.bridge.content.invalidateIndex();
      this.app._treeExpandedPaths.add(directoryPath);
      await this.render();
      if (navigate) this.app.navigateTo(directoryPath);
      this.app.refreshProjectShortcuts(true).catch(error => console.warn('项目快捷入口刷新失败:', error));
    }

    async removeRoot(directoryPath) {
      const currentPathLosesAccess = pathIsWithin(this.state.currentPath, directoryPath, this.platform)
        && !(this.app._treeRoots || []).some(rootEntry => (
          !pathsEqual(rootEntry.path, directoryPath, this.platform)
          && pathIsWithin(this.state.currentPath, rootEntry.path, this.platform)
        ));
      this.app._treeRoots = await this.bridge.config.removeTreeRoot(directoryPath);
      await this.bridge.content.invalidateIndex();
      for (const expandedPath of [...this.app._treeExpandedPaths]) {
        if (pathIsWithin(expandedPath, directoryPath, this.platform)) {
          this.app._treeExpandedPaths.delete(expandedPath);
        }
      }
      await this.render();
      await this.app.refreshProjectShortcuts(true);
      if (currentPathLosesAccess) {
        const fallbackPath = this.app._treeRoots[0]?.path || '';
        if (fallbackPath) {
          this.app.navigateTo(fallbackPath, true);
        } else {
          this.state.currentPath = '';
          this.state.history = [];
          this.state.historyIndex = -1;
          await this.bridge.config.set?.('lastPath', '');
          this.app.captureActiveWorkspaceTab?.();
          this.app.renderWorkspaceTabs?.();
          this.app.scheduleWorkspaceTabsPersist?.();
          this.app.updateBreadcrumbs?.();
          this.app.updateNavButtons?.();
          await this.app.renderContent?.();
        }
      }
    }

    async requestRemoveRoot(directoryPath, name) {
      const label = name || fallbackName(directoryPath);
      const confirmed = this.confirm(`从“位置”中移除「${label}」？\n\n只会删除 GitFinder 中的受管位置记录，不会删除磁盘上的文件夹或任何文件。`);
      if (!confirmed) return false;
      try {
        await this.removeRoot(directoryPath);
        this.app._showStatusMessage?.(`已移除位置「${label}」；磁盘文件未删除`, 'success');
        return true;
      } catch (error) {
        this.app._showStatusMessage?.(error?.message || '无法移除位置', 'error');
        return false;
      }
    }

    async render() {
      const revision = ++this.renderRevision;
      const container = this.document.getElementById('sidebar-tree');
      if (!container) return;
      const roots = Array.isArray(this.app._treeRoots) ? this.app._treeRoots : [];
      if (!roots.length) {
        container.innerHTML = '<div class="tree-empty"><div class="tree-empty-text">尚未添加受管目录</div></div>';
        return;
      }

      let inspection = { directories: [] };
      try {
        inspection = await this.bridge.fs.getWorkspaceDirectoryInfos(roots.map(root => root.path));
      } catch (_error) {}
      if (revision !== this.renderRevision) return;
      const infoByPath = new Map((inspection?.directories || []).map(entry => [
        normalizePath(entry.path, this.platform),
        entry
      ]));

      let html = '';
      for (const root of roots) {
        if (!root?.path) continue;
        const inspected = infoByPath.get(normalizePath(root.path, this.platform));
        const directoryItem = {
          ...(inspected?.info || {}),
          type: 'directory',
          path: root.path,
          available: inspected?.available === true
        };
        html += await this.renderNode(
          root.path,
          root.name || inspected?.info?.name || fallbackName(root.path),
          true,
          0,
          directoryItem,
          revision
        );
        if (revision !== this.renderRevision) return;
      }
      container.innerHTML = html || '<div class="tree-empty"><div class="tree-empty-text">尚未添加可用目录</div></div>';
      this.bind(container);
    }

    async renderNode(pathValue, name, isRoot, depth, item = {}, revision = this.renderRevision) {
      if (revision !== this.renderRevision) return '';
      const directoryItem = { ...item, type: 'directory', path: pathValue };
      const available = directoryItem.available !== false;
      const isGitRepo = directoryItem.isGitRepo === true;
      const isProject = directoryItem.isProject === true;
      const isExpanded = available && this.app._treeExpandedPaths.has(pathValue);
      const selected = pathsEqual(this.state.currentPath, pathValue, this.platform);
      const indent = Math.max(0, Number(depth) || 0) * 16;
      const safePath = this.app.escapeHtml(pathValue);
      const safeName = this.app.escapeHtml(name || fallbackName(pathValue));
      const toggle = available
        ? `<button class="tree-node-toggle ${isExpanded ? 'expanded' : ''}" style="margin-left:${indent}px" type="button" aria-expanded="${isExpanded}" aria-label="${isExpanded ? '折叠' : '展开'} ${safeName}">${isExpanded ? '▼' : '▶'}</button>`
        : `<span class="tree-node-toggle tree-node-toggle-placeholder" style="margin-left:${indent}px" aria-hidden="true">•</span>`;
      let html = `
        <div class="tree-node ${selected ? 'selected' : ''} ${isRoot ? 'is-root' : ''} ${isGitRepo ? 'is-git' : ''} ${isProject ? 'is-project' : ''} ${directoryItem.isHidden ? 'is-hidden' : ''} ${available ? '' : 'is-unavailable'}" data-path="${safePath}" data-type="directory" data-depth="${depth}" data-is-root="${isRoot}" data-is-git="${isGitRepo}" data-is-project="${isProject}" aria-disabled="${!available}">
          ${toggle}
          ${this.app.getItemKindIconHtml(directoryItem, 'tree-node-icon')}
          <span class="tree-node-name" title="${safePath}">${safeName}</span>
          ${available ? '' : '<span class="tree-node-badge">位置不可用</span>'}
          ${isRoot ? `<button class="tree-node-remove" type="button" aria-label="移除位置 ${safeName}" title="从位置列表移除（不会删除磁盘文件）">×</button>` : ''}
        </div>`;

      if (isExpanded) {
        try {
          const items = await this.bridge.fs.listDirectory(pathValue, {
            showHidden: this.state.showHiddenFiles,
            recursive: false
          });
          if (revision !== this.renderRevision) return '';
          for (const child of (items || []).filter(entry => entry.type === 'directory')) {
            html += await this.renderNode(child.path, child.name, false, depth + 1, {
              ...child,
              available: true
            }, revision);
            if (revision !== this.renderRevision) return '';
          }
        } catch (_error) {
          html += `<div class="tree-error-row" style="margin-left:${indent + 30}px">无法读取内容</div>`;
        }
      }
      return html;
    }

    bind(container) {
      container.querySelectorAll('.tree-node').forEach(node => {
        const toggle = node.querySelector('.tree-node-toggle');
        const name = node.querySelector('.tree-node-name');
        const remove = node.querySelector('.tree-node-remove');
        const pathValue = node.dataset.path;
        const unavailable = node.getAttribute('aria-disabled') === 'true';

        toggle?.addEventListener('click', async event => {
          event.stopPropagation();
          if (unavailable) {
            this.app._showStatusMessage?.('该受管位置当前不可用', 'warning');
            return;
          }
          const expanded = !this.app._treeExpandedPaths.has(pathValue);
          if (expanded) this.app._treeExpandedPaths.add(pathValue);
          else this.app._treeExpandedPaths.delete(pathValue);
          if (node.dataset.isRoot === 'true') {
            try {
              await this.bridge.config.updateTreeRoot(pathValue, { expanded });
            } catch (_error) {
              this.app._showStatusMessage?.('无法保存位置展开状态', 'warning');
            }
          }
          await this.render();
        });

        name?.addEventListener('click', async event => {
          event.stopPropagation();
          if (unavailable) {
            this.app._showStatusMessage?.('该受管位置当前不可用，请重新连接后重试', 'warning');
            return;
          }
          const previousMode = this.state.currentMode;
          if (previousMode !== 'tree') {
            this.state.currentMode = 'tree';
            this.app.updateModeUI();
          }
          const navigated = this.app.navigateTo(pathValue);
          if (!navigated && previousMode !== 'tree') {
            this.state.currentMode = previousMode;
            this.app.updateModeUI();
          }
        });

        remove?.addEventListener('click', async event => {
          event.stopPropagation();
          await this.requestRemoveRoot(pathValue, name?.textContent || fallbackName(pathValue));
        });
      });
    }

    syncSelection() {
      const container = this.document.getElementById('sidebar-tree');
      if (!container) return;
      let selected = null;
      container.querySelectorAll('.tree-node[data-path]').forEach(node => {
        const active = pathsEqual(node.dataset.path, this.state.currentPath, this.platform);
        node.classList.toggle('selected', active);
        if (active) selected = node;
      });
      selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    async syncToCurrentPath() {
      if (!this.state.currentPath || !this.app._treeRootsLoaded) return;
      const containingRoot = (this.app._treeRoots || [])
        .filter(root => pathIsWithin(this.state.currentPath, root.path, this.platform))
        .sort((left, right) => String(right.path).length - String(left.path).length)[0];
      if (!containingRoot) return;

      let pathToExpand = this.state.currentPath;
      const pathsToExpand = [containingRoot.path];
      while (pathToExpand && !pathsEqual(pathToExpand, containingRoot.path, this.platform)) {
        pathsToExpand.push(pathToExpand);
        const parent = this.app.getParentPath(pathToExpand);
        if (!parent || pathsEqual(parent, pathToExpand, this.platform)) break;
        pathToExpand = parent;
      }

      let needsRender = false;
      for (const expandedPath of pathsToExpand) {
        if (!this.app._treeExpandedPaths.has(expandedPath)) {
          this.app._treeExpandedPaths.add(expandedPath);
          needsRender = true;
        }
      }
      if (needsRender) await this.render();
      else this.syncSelection();
    }
  }

  return {
    Controller,
    normalizePath,
    pathIsWithin,
    pathsEqual
  };
});
