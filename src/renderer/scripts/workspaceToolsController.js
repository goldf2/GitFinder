(function exposeWorkspaceTools(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorkspaceToolsController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorkspaceTools(root) {
  class Controller {
    constructor({ app, state, bridge, document }) {
      Object.assign(this, { app, state, bridge, document });
      this.busy = false;
      this.revision = 0;
      this.location = '';
      this.repoPath = '';
      this.tab = 'branches';
      this.remoteName = '';
      this.registryFilter = 'archived';
      this.modal = document.getElementById('workspace-tools-modal');
      this.modal.addEventListener('click', event => {
        const control = event.target.closest('[data-workspace-tool]');
        if (control) this.handle(control.dataset.workspaceTool, control).catch(error => this.feedback(error.message, true));
        else if (event.target === this.modal) this.close();
      });
      this.modal.addEventListener('submit', event => {
        event.preventDefault();
        if (event.target.id === 'remote-edit-form') this.handle('save-remote').catch(error => this.feedback(error.message, true));
      });
      this.modal.addEventListener('change', event => {
        if (event.target.id === 'registry-filter') {
          this.registryFilter = event.target.value;
          this.render().catch(error => this.feedback(error.message, true));
        }
      });
      const locationModal = document.getElementById('location-name-modal');
      locationModal.addEventListener('click', event => {
        if (event.target === locationModal || event.target.closest('[data-location-close]')) this.closeLocation();
      });
      document.getElementById('location-name-form').addEventListener('submit', event => {
        event.preventDefault();
        this.saveLocation().catch(error => this.locationFeedback(error.message));
      });
      document.getElementById('location-name-reset').addEventListener('click', () => {
        document.getElementById('location-name-input').value = this.defaultName(this.location);
      });
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (locationModal.style.display !== 'none') this.closeLocation();
        if (this.modal.style.display !== 'none') this.close();
      });
    }

    escape(value) { return this.app.escapeHtml(String(value ?? '')); }
    defaultName(path) { return path.split(/[\\/]/).filter(Boolean).at(-1) || path; }
    locationFeedback(message) { this.document.getElementById('location-name-feedback').textContent = message; }

    async openLocation(path) {
      if (this.busy) return;
      const entry = (await this.bridge.config.getTreeRoots()).find(item => item.path === path);
      if (!entry) throw Error('该位置已移除');
      this.location = path;
      this.document.getElementById('location-name-path').textContent = path;
      this.document.getElementById('location-name-input').value = entry.name || this.defaultName(path);
      this.locationFeedback('只修改左侧位置的显示名称，磁盘目录不改名。');
      this.document.getElementById('location-name-modal').style.display = 'flex';
      this.document.getElementById('location-name-input').focus();
    }

    closeLocation() {
      if (this.busy) return;
      this.document.getElementById('location-name-modal').style.display = 'none';
      this.location = '';
    }

    async saveLocation() {
      if (this.busy || !this.location) return;
      const name = this.document.getElementById('location-name-input').value.trim();
      if (!name || name.length > 160) { this.locationFeedback('请输入1–160个字符的显示名称。'); return; }
      this.busy = true;
      this.document.getElementById('location-name-save').disabled = true;
      try {
        await this.bridge.config.updateTreeRoot(this.location, { name });
        await this.app.loadTreeRoots();
        this.busy = false;
        this.closeLocation();
        this.app._showStatusMessage('位置显示名称已保存', 'success');
      } finally {
        this.busy = false;
        this.document.getElementById('location-name-save').disabled = false;
      }
    }

    async openRepository(repoPath) {
      if (this.busy) return;
      this.repoPath = repoPath;
      this.tab = 'branches';
      this.remoteName = '';
      await this.open();
    }

    async openMaintenance() {
      if (this.busy) return;
      this.repoPath = '';
      this.tab = 'registry';
      await this.open();
    }

    async open() {
      this.modal.style.display = 'flex';
      this.document.getElementById('workspace-tools-title').textContent = this.repoPath ? '仓库工具' : '仓库维护';
      this.document.getElementById('workspace-tools-path').textContent = this.repoPath || '本机仓库登记与目录分组';
      this.feedback('');
      try { await this.render(); } catch (error) { this.feedback(error.message, true); }
    }

    close() {
      if (this.busy) return;
      this.modal.style.display = 'none';
      this.revision += 1;
    }

    feedback(message, error = false) {
      const element = this.document.getElementById('workspace-tools-feedback');
      element.textContent = message;
      element.classList.toggle('error', error);
    }

    async render() {
      const revision = ++this.revision;
      const tabs = this.repoPath
        ? [['branches', '分支'], ['remotes', '远程仓库'], ['history', '提交历史'], ['tags', '技术标签']]
        : [['registry', '仓库登记'], ['groups', '目录分组']];
      this.document.getElementById('workspace-tools-tabs').innerHTML = tabs.map(([id, title]) => `<button class="btn${id === this.tab ? ' btn-primary' : ''}" type="button" data-workspace-tool="tab" data-tab="${id}" aria-pressed="${id === this.tab}">${title}</button>`).join('');
      const body = this.document.getElementById('workspace-tools-body');
      body.innerHTML = '<p>正在读取…</p>';
      let html = '';
      if (this.tab === 'branches') {
        const branches = await this.bridge.git.getBranches(this.repoPath);
        html = '<p class="workspace-tool-hint">选择已有的本地分支切换；远程分支仅展示。</p>' + branches.map(branch => `<div class="workspace-tool-row"><span>${this.escape(branch.name)}<small>${branch.isCurrent ? '当前分支' : branch.isRemote ? '远程分支' : '本地分支'}</small></span>${!branch.isRemote ? `<button class="btn" data-workspace-tool="checkout" data-name="${this.escape(branch.name)}" ${branch.isCurrent ? 'disabled' : ''}>切换</button>` : ''}</div>`).join('');
        if (!branches.length) html += '<p>尚无分支，首次提交后会显示。</p>';
      } else if (this.tab === 'remotes') {
        const remotes = await this.bridge.git.getRemotes(this.repoPath);
        html = remotes.map(remote => `<div class="workspace-tool-row"><span><strong>${this.escape(remote.name)}</strong><small>${this.escape(remote.fetchUrl || '')}</small>${remote.pushUrl && remote.pushUrl !== remote.fetchUrl ? `<small>推送：${this.escape(remote.pushUrl)}</small>` : ''}</span><button class="btn" data-workspace-tool="edit-remote" data-name="${this.escape(remote.name)}" data-url="${this.escape(remote.fetchUrl || '')}">编辑</button><button class="btn" data-workspace-tool="remove-remote" data-name="${this.escape(remote.name)}">移除</button></div>`).join('') || '<p>尚未配置远程仓库。</p>';
        html += '<form id="remote-edit-form" class="workspace-tool-form"><label>名称<input id="remote-name" required maxlength="100" placeholder="origin"></label><label>地址<input id="remote-url" required placeholder="https://… 或 git@…"></label><button class="btn btn-primary" id="remote-save" type="submit">添加远程</button><button class="btn" type="button" data-workspace-tool="cancel-remote">清空</button></form>';
        this.remoteName = '';
      } else if (this.tab === 'history') {
        const commits = await this.bridge.git.getLog(this.repoPath, 100);
        html = '<p class="workspace-tool-hint">最近100次提交</p>' + (commits.map(commit => `<div class="workspace-tool-row"><code>${this.escape(commit.hash)}</code><span>${this.escape(commit.message)}<small>${this.escape(commit.author)} · ${this.escape(new Date(commit.timestamp * 1000).toLocaleString())}</small></span></div>`).join('') || '<p>尚无提交记录。</p>');
      } else if (this.tab === 'tags') {
        const [names, current] = await Promise.all([this.bridge.fs.autoDetectTags(this.repoPath), this.bridge.tags.getRepoTags(this.repoPath)]);
        html = '<p class="workspace-tool-hint">根据依赖及项目文件识别技术标签，勾选后加入；已有标签保留。</p><div class="workspace-tool-options">' + names.map(name => {
          const assigned = current.some(tag => tag.name === name);
          return `<label><input type="checkbox" data-detected-tag="${this.escape(name)}" ${assigned ? 'checked disabled' : ''}>${this.escape(name)}${assigned ? '（已有）' : ''}</label>`;
        }).join('') + '</div>' + (names.length ? '<button class="btn btn-primary" data-workspace-tool="apply-tags">加入选中标签</button>' : '<p>未识别到技术标签。</p>');
      } else if (this.tab === 'registry') {
        const [active, archived] = await Promise.all([this.bridge.repos.listActive(), this.bridge.repos.listArchived()]);
        const entries = this.registryFilter === 'active' ? active : this.registryFilter === 'all' ? [...active, ...archived] : archived;
        html = `<div class="workspace-tool-index-toolbar"><label>显示 <select id="registry-filter">${[['archived', `归档 ${archived.length}`], ['active', `活跃 ${active.length}`], ['all', '全部']].map(([value, label]) => `<option value="${value}"${value === this.registryFilter ? ' selected' : ''}>${label}</option>`).join('')}</select></label><button class="btn" data-workspace-tool="refresh">刷新</button></div><p class="workspace-tool-hint">这里只维护本机登记。恢复需要原目录仍存在；清除记录不会删除磁盘文件。</p>`;
        html += entries.map(entry => `<div class="workspace-tool-row"><span><strong>${this.escape(entry.name || this.defaultName(entry.path))}</strong><small>${this.escape(entry.path)}</small><small>${this.escape(entry.id)}</small></span>${entry.archived ? `<button class="btn" data-workspace-tool="restore" data-id="${this.escape(entry.id)}" data-path="${this.escape(entry.path)}">恢复登记</button><button class="btn" data-workspace-tool="purge" data-id="${this.escape(entry.id)}">清除记录</button>` : `<button class="btn" data-workspace-tool="repository" data-path="${this.escape(entry.path)}">仓库工具</button><button class="btn" data-workspace-tool="repair-id" data-path="${this.escape(entry.path)}">重算标识</button>`}</div>`).join('') || '<p>没有此类登记。</p>';
      } else if (this.tab === 'groups') {
        const roots = await this.bridge.config.getTreeRoots();
        html = '<p class="workspace-tool-hint">按所选位置的第一层子目录生成仓库分组，保留已有分组。项目类型归属不改变。</p><label>位置 <select id="directory-group-root">' + roots.map(entry => `<option value="${this.escape(entry.path)}">${this.escape(entry.name || entry.path)}</option>`).join('') + '</select></label><button class="btn" data-workspace-tool="preview-groups">预览分组</button><div id="directory-group-preview"></div>';
      }
      if (revision !== this.revision || this.modal.style.display === 'none') return;
      body.innerHTML = html;
    }

    async mutate(operation, message) {
      if (this.busy) return;
      this.busy = true;
      this.feedback('正在处理…');
      this.modal.querySelectorAll('button, input, select').forEach(element => { element.disabled = true; });
      try {
        const result = await operation();
        if (result?.success === false) throw Error(result.error || '操作失败');
        await this.render();
        this.feedback(message);
      } catch (error) {
        await this.render();
        this.feedback(error.message, true);
      } finally {
        this.busy = false;
        this.modal.querySelectorAll('#workspace-tools-tabs button, [data-workspace-tool="close"]').forEach(element => { element.disabled = false; });
      }
    }

    async refreshRepository() {
      await this.bridge.git.clearCache();
      if (this.state.selectedRepo?.path === this.repoPath) await this.app.selectRepo(this.repoPath);
    }

    async reloadRepos() {
      this.state.allRepos = (await this.bridge.repos.get()).repos;
      this.state.enrichedRepos = [];
      this.app.renderProjectShortcuts();
    }

    async directoryGroups() {
      const path = this.document.getElementById('directory-group-root').value;
      const store = await this.bridge.repos.get();
      const prefix = path.replace(/[\\/]+$/, '') + (this.bridge.platform === 'win32' ? '\\' : '/');
      return { path, repos: store.repos.filter(repo => repo.path.startsWith(prefix)) };
    }

    async handle(action, control) {
      if (this.busy) return;
      this.feedback('');
      if (action === 'close') { this.close(); return; }
      if (action === 'tab') { this.tab = control.dataset.tab; await this.render(); return; }
      if (action === 'refresh') { await this.render(); return; }
      if (action === 'repository') { await this.openRepository(control.dataset.path); return; }
      if (action === 'edit-remote') {
        this.remoteName = control.dataset.name;
        this.document.getElementById('remote-name').value = this.remoteName;
        this.document.getElementById('remote-name').disabled = true;
        this.document.getElementById('remote-url').value = control.dataset.url;
        this.document.getElementById('remote-save').textContent = '保存地址';
        this.document.getElementById('remote-url').focus();
        return;
      }
      if (action === 'cancel-remote') {
        this.remoteName = '';
        this.document.getElementById('remote-edit-form').reset();
        this.document.getElementById('remote-name').disabled = false;
        this.document.getElementById('remote-save').textContent = '添加远程';
        return;
      }
      if (action === 'save-remote') {
        const name = this.remoteName || this.document.getElementById('remote-name').value.trim();
        const url = this.document.getElementById('remote-url').value.trim();
        if (!name || !url) throw Error('请输入名称和地址');
        const editing = Boolean(this.remoteName);
        await this.mutate(async () => {
          const result = editing ? await this.bridge.git.setRemoteUrl(this.repoPath, name, url) : await this.bridge.git.addRemote(this.repoPath, name, url);
          if (result.success) await this.refreshRepository();
          return result;
        }, editing ? '远程地址已保存' : '远程仓库已添加');
      }
      if (action === 'remove-remote' && root.confirm(`移除本地远程配置“${control.dataset.name}”？不会删除远程服务器上的仓库。`)) {
        await this.mutate(() => this.bridge.git.removeRemote(this.repoPath, control.dataset.name), '远程配置已移除');
      }
      if (action === 'checkout' && root.confirm(`切换到本地分支“${control.dataset.name}”？`)) {
        await this.mutate(async () => {
          const result = await this.bridge.git.checkoutBranch(this.repoPath, control.dataset.name);
          if (result.success) await this.refreshRepository();
          return result;
        }, '已切换分支');
      }
      if (action === 'apply-tags') {
        const names = [...this.modal.querySelectorAll('[data-detected-tag]:checked:not(:disabled)')].map(input => input.dataset.detectedTag);
        if (!names.length) throw Error('请勾选要加入的标签');
        await this.mutate(async () => {
          const store = await this.bridge.tags.get();
          for (const name of names) {
            let tag = store.tags.find(item => item.name === name);
            if (!tag) {
              const updated = await this.bridge.tags.create(name, '#007AFF');
              tag = updated.tags.find(item => item.name === name);
            }
            if (!store.tags.some(item => item.id === tag.id)) store.tags.push(tag);
            await this.bridge.tags.addRepo(tag.id, this.repoPath);
          }
          this.app._syncRepoTagsInState(this.repoPath, await this.bridge.tags.getRepoTags(this.repoPath));
          await this.app.loadTags();
          await this.refreshRepository();
          await this.app.renderContent();
        }, `已加入${names.length}个标签`);
      }
      if (action === 'restore') {
        await this.mutate(async () => {
          const info = await this.bridge.fs.getFileInfo(control.dataset.path);
          if (!info.isGitRepo) throw Error('原路径不是可用的Git仓库，请恢复目录后重试');
          const entry = await this.bridge.repos.restore(control.dataset.id);
          if (!entry) throw Error('登记已不存在');
          await this.bridge.repos.merge([{ path: entry.path, name: entry.name }]);
          await this.reloadRepos();
        }, '已恢复仓库登记');
      }
      if (action === 'purge' && root.confirm('清除这条归档登记及其仓库分组、标签关联？磁盘文件不会删除。')) {
        const archived = await this.bridge.repos.listArchived();
        if (!archived.some(entry => entry.id === control.dataset.id)) throw Error('该登记已不处于归档状态，请刷新');
        await this.mutate(async () => { await this.bridge.repos.purge(control.dataset.id); await this.app.loadTags(); await this.app.loadGroups(); }, '归档登记已清除');
      }
      if (action === 'repair-id' && root.confirm('重新计算仓库标识并迁移分组、标签关联？仅在本机标识异常时使用。')) {
        await this.mutate(async () => {
          const path = control.dataset.path;
          const info = await this.bridge.fs.getFileInfo(path);
          if (!info.isGitRepo) throw Error('仓库目录不可用');
          if (!await this.bridge.repos.regenerateId(path)) throw Error('登记已不存在');
          await this.bridge.repos.merge([{ path, name: info.name }]);
          await this.app.loadGroups(); await this.app.loadTags(); await this.reloadRepos();
        }, '仓库标识已重新计算');
      }
      if (action === 'preview-groups') {
        const { path, repos } = await this.directoryGroups();
        const names = [...new Set(repos.map(repo => repo.path.slice(path.replace(/[\\/]+$/, '').length + 1).split(/[\\/]/)).filter(parts => parts.length > 1).map(parts => parts[0]))];
        this.document.getElementById('directory-group-preview').innerHTML = `<p>${repos.length}个仓库 · 分组：${this.escape(names.join('、') || '无第一层子目录分组')}</p><button class="btn btn-primary" data-workspace-tool="apply-groups" ${!repos.length ? 'disabled' : ''}>生成仓库分组</button>`;
      }
      if (action === 'apply-groups') {
        const { path, repos } = await this.directoryGroups();
        if (!repos.length) throw Error('此位置尚无已扫描仓库');
        await this.mutate(async () => { await this.bridge.groups.autoDetect(path, repos); await this.app.loadGroups(); }, '仓库目录分组已生成');
      }
    }
  }
  return { Controller };
});
