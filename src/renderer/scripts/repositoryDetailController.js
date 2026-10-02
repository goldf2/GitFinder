(function exposeRepositoryDetailController(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RepositoryDetailController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRepositoryDetailControllerApi(root) {
  class Controller {
    constructor(options = {}) {
      this.app = options.app;
      this.state = options.state;
      this.bridge = options.bridge;
      this.document = options.document || root?.document || null;
      this.terminal = options.terminal || root?.Terminal || null;
      this.selectionRequestId = 0;
    }

    cancel() {
      this.selectionRequestId += 1;
      const preview = this._element('repository-preview');
      if (preview) preview.hidden = true;
    }

    async select(repoPath) {
      const requestId = ++this.selectionRequestId;
      const preview = this._element('repository-preview');
      if (preview) preview.hidden = true;
      const previewOnly = this.app.contentCollectionKind?.() === 'repositories' && !this.state.workspaceRepository;
      const project = this.state.localProjects?.find(item => item.path === repoPath);
      this.app.fileSelectionDetailController?.setContext({
        path: repoPath, name: project?.name || repoPath.split(/[\\/]/).pop(), type: 'directory',
        isProject: Boolean(project), project, isGitRepo: true
      }, 'repository');
      this.app.panelDeploymentController?.cancel();
      this.state.selectedRepo = null;
      const empty = this._element('detail-empty');
      const content = this._element('detail-content');
      if (content) content.style.display = 'none';
      if (empty) {
        empty.style.display = 'flex';
        empty.innerHTML = '<div class="detail-empty-text">正在读取 Git 仓库详情…</div>';
      }
      try {
        const [info, status, readme, tags, controlFiles, markdownDocs, savedSelections, savedDocSelections, localProject, architectureSnapshots] = await Promise.all([
          this.bridge.fs.getFileInfo(repoPath),
          this.bridge.git.getStatus(repoPath, { autoFetch: false }),
          this.bridge.fs.getReadmePreview(repoPath),
          this.bridge.tags.getRepoTags(repoPath),
          previewOnly ? [] : this.bridge.fs.listProjectControlFiles(repoPath),
          previewOnly ? [] : this.bridge.fs.listMarkdownDocuments(repoPath),
          previewOnly ? {} : this.bridge.config.get('projectControlSelections'),
          previewOnly ? {} : this.bridge.config.get('markdownDocumentSelections'),
          this.bridge.localProjects.describe(repoPath).catch(() => ({ isProject: false, project: null })),
          previewOnly ? [] : (this.bridge.architectureSnapshots?.list?.(repoPath).catch(() => []) || Promise.resolve([]))
        ]);
        const groups = this.app._findRepoGroups(repoPath);
        const [projectControl, projectDocs] = await Promise.all([
          previewOnly ? null : this.app.loadProjectControl(repoPath, controlFiles, savedSelections?.[repoPath]),
          previewOnly ? null : this.app.loadMarkdownDocuments(repoPath, markdownDocs, savedDocSelections?.[repoPath])
        ]);
        if (requestId !== this.selectionRequestId) return false;

        this.app.fileSelectionDetailController?.setContext({
          ...info, path: repoPath, type: 'directory', isGitRepo: true,
          name: localProject.project?.name || info.name,
          isProject: localProject.isProject, project: localProject.project
        }, 'repository');

        this.state.controlSlot = 'progress';
        this.state.documentMode = 'preview';
        this.state.selectedRepo = {
          ...info,
          gitStatus: status,
          readme,
          tags,
          groups,
          projectControl,
          projectDocs,
          localProject,
          architectureSnapshots
        };
        this.terminal?.setCwd?.(repoPath);
        await this.render();
        if (info.isGitRepo) void this.app.projectShortcutsController?.recordRepositoryVisit(repoPath);
        return true;
      } catch (error) {
        if (requestId !== this.selectionRequestId) return false;
        this.state.selectedRepo = null;
        const missing = this.app.isMissingProjectPathError(error);
        this.showError(
          missing ? '项目目录不存在' : '项目读取失败',
          repoPath,
          missing
            ? '该仓库路径可能已移动或删除，请重新扫描或从仓库列表中清理。'
            : (error.message || String(error))
        );
        return false;
      }
    }

    showError(title, pathValue, message) {
      const empty = this._element('detail-empty');
      const content = this._element('detail-content');
      if (content) content.style.display = 'none';
      if (!empty) return;
      empty.style.display = 'flex';
      empty.innerHTML = `
        <div class="detail-empty-icon">⚠</div>
        <div class="detail-empty-text">${this.app.escapeHtml(title)}</div>
        <div class="detail-empty-path">${this.app.escapeHtml(pathValue || '')}</div>
        <div class="detail-empty-subtext">${this.app.escapeHtml(message || '')}</div>
      `;
    }

    updateSections() {
      this.document.querySelectorAll('.detail-content [data-section-id]').forEach(section => {
        const id = section.dataset.sectionId;
        const visible = this.state.detailSections[id] !== false;
        section.style.display = visible ? '' : 'none';
      });
    }

    applySectionOrder() {
      if (!this.state.detailSectionOrder) return;
      const container = this.document.querySelector('.detail-content');
      if (!container) return;
      const sections = {};
      container.querySelectorAll('[data-section-id]').forEach(section => {
        sections[section.dataset.sectionId] = section;
      });
      this.state.detailSectionOrder.forEach(id => {
        if (sections[id]) container.appendChild(sections[id]);
      });
    }

    async saveSectionOrder() {
      const order = [];
      this.document.querySelectorAll('.detail-content [data-section-id]').forEach(section => {
        order.push(section.dataset.sectionId);
      });
      this.state.detailSectionOrder = order;
      await this.bridge.config.set('detailSectionOrder', order);
    }

    setupSectionDrag() {
      const sections = this.document.querySelectorAll('.detail-section[data-section-id]');
      let draggedSection = null;

      sections.forEach(section => {
        if (section.dataset.dragInit) return;
        section.dataset.dragInit = '1';

        const heading = section.querySelector('h4, .section-toggle');
        if (heading && !heading.querySelector('.drag-handle')) {
          const handle = this.document.createElement('span');
          handle.className = 'drag-handle';
          handle.textContent = '⋮⋮';
          handle.title = '拖拽排序';
          heading.insertBefore(handle, heading.firstChild);
        }

        section.addEventListener('mousedown', event => {
          if (event.target.classList.contains('drag-handle')) section.draggable = true;
        });
        section.addEventListener('dragstart', event => {
          draggedSection = section;
          section.classList.add('dragging');
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', '');
        });
        section.addEventListener('dragend', () => {
          section.classList.remove('dragging');
          section.draggable = false;
          draggedSection = null;
          this.saveSectionOrder();
        });
        section.addEventListener('dragover', event => {
          event.preventDefault();
          if (!draggedSection || draggedSection === section) return;
          const rect = section.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          if (event.clientY < midY) section.parentNode.insertBefore(draggedSection, section);
          else section.parentNode.insertBefore(draggedSection, section.nextSibling);
        });
      });
    }

    async render() {
      const repo = this.state.selectedRepo;
      if (!repo) return false;
      this.renderPreview(repo);
      if (this.app.contentCollectionKind?.() === 'repositories' && !this.state.workspaceRepository) {
        this._element('detail-empty').style.display = 'none';
        this._element('detail-content').style.display = 'none';
        return true;
      }

      this._element('detail-empty').style.display = 'none';
      this._element('detail-content').style.display = 'flex';
      this._element('detail-name').textContent = repo.name;
      this._element('detail-path').textContent = repo.path;

      const projectSettingsButton = this._element('detail-project-settings');
      if (projectSettingsButton) {
        projectSettingsButton.style.display = '';
        projectSettingsButton.textContent = repo.localProject?.isProject ? '项目属性' : '添加项目属性…';
      }
      const relationshipButton = this._element('detail-relationship-board');
      if (relationshipButton) {
        const projectId = repo.localProject?.isProject ? repo.localProject.project?.projectId : '';
        relationshipButton.style.display = '';
        relationshipButton.dataset.relationshipKind = projectId ? 'project' : 'repository';
        relationshipButton.dataset.relationshipRef = projectId || '';
        relationshipButton.dataset.relationshipPath = repo.path || '';
      }
      const architectureButton = this._element('detail-architecture');
      if (architectureButton) {
        architectureButton.style.display = '';
        architectureButton.dataset.architecturePath = repo.path || '';
        architectureButton.textContent = repo.architectureSnapshots?.length ? '更新架构' : '导入架构';
      }
      const architectureSection = this._element('detail-architecture-section');
      if (architectureSection) architectureSection.hidden = false;

      this.updateSections();
      this.applySectionOrder();
      this.setupSectionDrag();

      const toggleButton = this._element('toggle-assignments-btn');
      if (toggleButton) {
        toggleButton.textContent = this.state.showAllAssignments ? '隐藏未选' : '显示全部';
        toggleButton.classList.toggle('active', !this.state.showAllAssignments);
      }

      const tags = repo.tags || [];

      const status = repo.gitStatus || {};
      const statusMap = {
        clean: { label: '已同步', cls: 'clean' },
        dirty: { label: '未提交', cls: 'dirty' },
        ahead: { label: '未推送', cls: 'ahead' },
        behind: { label: '需拉取', cls: 'behind' }
      };
      const statusInfo = statusMap[status.overallStatus || 'clean'] || statusMap.clean;
      const upstreamText = this.app.escapeHtml(status.upstream || (status.hasRemote ? '未设置跟踪分支' : '未添加远端'));
      const remoteUrlText = this.app.escapeHtml(status.remoteUrl || '');

      this._element('detail-status').innerHTML = `
        <span class="detail-status-badge ${statusInfo.cls}">${statusInfo.label}</span>
        ${status.branch ? `<span class="detail-status-badge" style="background:rgba(0,0,0,0.06);color:#1d1d1f;">${this.app.escapeHtml(status.branch)}</span>` : ''}
      `;

      const readme = repo.readme || {};
      this._element('detail-readme').innerHTML = `
        <div class="detail-readme-title">${this.app.escapeHtml(readme.title || repo.name)}</div>
        <div>${this.app.escapeHtml(readme.description || '暂无描述')}</div>
      `;

      this.app.renderMarkdownDocuments();
      this.app.renderProjectProgress();

      this._element('detail-git-info').innerHTML = `
        <div class="git-stats-row">
          <div class="git-stat ${status.modified > 0 ? 'dirty' : ''}">
            <span class="git-stat-value">${status.modified || 0}</span>
            <span class="git-stat-label">修改</span>
          </div>
          <div class="git-stat ${status.ahead > 0 ? 'ahead' : ''}">
            <span class="git-stat-value">${status.ahead || 0}</span>
            <span class="git-stat-label">未推送</span>
          </div>
          <div class="git-stat ${status.behind > 0 ? 'behind' : ''}">
            <span class="git-stat-value">${status.behind || 0}</span>
            <span class="git-stat-label">需拉取</span>
          </div>
          <div class="git-stat ${!status.hasRemote ? 'no-remote' : ''}">
            <span class="git-stat-value">${status.hasRemote ? '已添加' : '未添加'}</span>
            <span class="git-stat-label">远程仓库</span>
          </div>
        </div>
        <div class="git-remote-row">
          <span class="git-info-label">同步远端</span>
          <div class="git-remote-value">
            <span>${upstreamText}</span>
            ${status.remoteUrl ? `<span class="git-remote-url" title="${remoteUrlText}">${remoteUrlText}</span>` : ''}
          </div>
        </div>
        ${status.lastCommit ? `
          <div class="detail-last-commit">
            <div class="last-commit-hash">${this.app.escapeHtml(status.lastCommit.hash)}</div>
            <div class="last-commit-message">${this.app.escapeHtml(status.lastCommit.message)}</div>
            <div class="last-commit-meta">
              <span>${this.app.escapeHtml(status.lastCommit.author)}</span>
              <span>${this.app.formatTime(status.lastCommit.timestamp)}</span>
            </div>
          </div>
        ` : ''}
      `;

      this._renderArchitectureSnapshots(repo);

      this._renderGroups(repo);
      this._renderTags(repo, tags);
      this.app.panelDeploymentController?.showRepository(repo);
      return true;
    }

    renderPreview(repo) {
      const panel = this._element('repository-preview');
      if (!panel) return;
      const e = value => this.app.escapeHtml(String(value ?? ''));
      const status = repo.gitStatus || {}, project = repo.localProject?.project;
      const labels = {clean:'工作区干净',dirty:'工作区有变更',ahead:'有待推送提交',behind:'有待拉取提交'};
      panel.hidden = false;
      panel.innerHTML = `<header class="repository-preview-heading"><span class="preview-eyebrow">仓库预览</span><h2>${e(project?.name || repo.name)}</h2><p class="preview-description">${e(project?.description || repo.readme?.description || '还没有项目简介。可在项目属性中添加，方便以后快速辨认。')}</p><div class="preview-primary-actions"><button class="btn btn-primary" data-preview-open="project">进入工作区</button><button class="btn" data-preview-reveal title="在访达中显示此仓库">访达中显示</button></div></header>
        <section><h3>当前状态</h3><p class="preview-git-state"><span class="status-indicator status-${e(status.overallStatus || 'none')}"></span>${e(status.error ? '状态读取不完整' : labels[status.overallStatus] || '尚未读取状态')}</p><dl class="preview-properties"><dt>分支</dt><dd>${e(status.branch || '尚无提交')}</dd><dt>文件变更</dt><dd>${Number(status.modified)||0} 修改 · ${Number(status.staged)||0} 暂存 · ${Number(status.untracked)||0} 未跟踪</dd><dt>远端同步</dt><dd>↑ ${Number(status.ahead)||0} · ↓ ${Number(status.behind)||0}<small>基于本地远端缓存</small></dd><dt>远程仓库</dt><dd>${status.hasRemote ? '已配置' : '未配置'}</dd></dl></section>
        <section><h3>最近提交</h3>${status.lastCommit ? `<p class="preview-commit">${e(status.lastCommit.message)}</p><small>${e(status.lastCommit.hash)} · ${e(this.app.formatTime(status.lastCommit.timestamp))}</small>` : '<p class="preview-muted">暂无提交记录</p>'}</section>
        <section><h3>项目资料</h3><div class="preview-destinations"><button class="btn" data-preview-open="planning">资料与规划</button><button class="btn" data-preview-open="tasks">开发任务</button><button class="btn" data-preview-open="files">浏览文件</button><button class="btn" data-preview-properties>项目属性</button></div></section>
        <section><h3>属性标签</h3><div class="preview-tags">${(repo.tags||[]).map(tag=>`<span>${e(tag.name)}</span>`).join('')||'<p class="preview-muted">尚未添加标签</p>'}</div></section>
        <section><h3>所在位置</h3><p class="preview-path">${e(repo.path)}</p></section>`;
      panel.querySelectorAll('[data-preview-open]').forEach(button => button.addEventListener('click',()=>this.app.workspaceController.openRepository(repo.path,button.dataset.previewOpen)));
      panel.querySelector('[data-preview-properties]').addEventListener('click',()=>this.app.openLocalProjectDialog(repo.path));
      panel.querySelector('[data-preview-reveal]').addEventListener('click',()=>this.bridge.fs.showInFinder(repo.path).catch(error=>this.app._showStatusMessage(error.message,'error')));
    }

    _renderGroups(repo) {
      const groupsElement = this._element('detail-groups');
      const repoGroups = repo.groups || [];
      const repoGroupIds = new Set(repoGroups.map(group => group.id));
      const allGroups = this.state.groups.groups || [];
      const visibleGroups = (this.state.showAllAssignments || repoGroupIds.size === 0)
        ? allGroups
        : allGroups.filter(group => repoGroupIds.has(group.id));
      if (!visibleGroups.length) {
        groupsElement.innerHTML = '<div style="font-size:12px;color:#86868b;">暂无分类,点击下方按钮新建</div>';
        return;
      }

      groupsElement.innerHTML = visibleGroups.map(group => {
        const assigned = repoGroupIds.has(group.id);
        const color = this.app.safeColor(group.color);
        const style = assigned
          ? `background:${color};color:#fff;border:1px solid ${color};`
          : 'background:rgba(0,0,0,0.04);color:#86868b;border:1px solid rgba(0,0,0,0.1);';
        return `<span class="detail-tag toggle" data-group-id="${this.app.escapeHtml(group.id)}" style="${style}" title="${assigned ? '点击移除' : '点击加入'}">${this.app.escapeHtml(group.name)}</span>`;
      }).join('');
      groupsElement.querySelectorAll('.detail-tag.toggle[data-group-id]').forEach(element => {
        element.addEventListener('click', async () => {
          const groupId = element.dataset.groupId;
          if (repoGroupIds.has(groupId)) await this.bridge.groups.removeRepo(groupId, repo.path);
          else await this.bridge.groups.addRepo(groupId, repo.path);
          this.state.groups = await this.bridge.groups.get();
          repo.groups = this.app._findRepoGroups(repo.path);
          this.app._syncRepoGroupsInState(repo.path, repo.groups);
          await this.render();
          this.app.renderSidebarGroups();
          this.app.renderContent();
        });
      });
    }

    _renderTags(repo, tags) {
      const tagsElement = this._element('detail-tags');
      const repoTagIds = new Set(tags.map(tag => tag.id));
      const allTags = this.state.tags.tags || [];
      const visibleTags = this.state.showAllAssignments
        ? allTags
        : allTags.filter(tag => repoTagIds.has(tag.id));
      if (!visibleTags.length) {
        tagsElement.innerHTML = '<div style="font-size:12px;color:#86868b;">暂无标签,点击下方按钮新建</div>';
        return;
      }

      tagsElement.innerHTML = visibleTags.map(tag => {
        const assigned = repoTagIds.has(tag.id);
        const color = this.app.safeColor(tag.color);
        const style = assigned
          ? `background:${color};color:#fff;border:1px solid ${color};`
          : 'background:rgba(0,0,0,0.04);color:#86868b;border:1px solid rgba(0,0,0,0.1);';
        return `<span class="detail-tag toggle" data-tag-id="${this.app.escapeHtml(tag.id)}" style="${style}" title="${assigned ? '点击移除' : '点击赋值'}">${this.app.escapeHtml(tag.name)}</span>`;
      }).join('');
      tagsElement.querySelectorAll('.detail-tag.toggle[data-tag-id]').forEach(element => {
        element.addEventListener('click', async () => {
          const tagId = element.dataset.tagId;
          if (repoTagIds.has(tagId)) await this.bridge.tags.removeRepo(tagId, repo.path);
          else await this.bridge.tags.addRepo(tagId, repo.path);
          this.state.tags = await this.bridge.tags.get();
          repo.tags = await this.bridge.tags.getRepoTags(repo.path);
          this.app._syncRepoTagsInState(repo.path, repo.tags);
          await this.render();
          this.app.renderSidebarTags();
          this.app.renderContent();
        });
      });
    }

    _renderArchitectureSnapshots(repo) {
      const container = this._element('detail-architecture-content');
      if (!container) return;
      const snapshots = Array.isArray(repo.architectureSnapshots) ? repo.architectureSnapshots : [];
      if (!snapshots.length) {
        container.innerHTML = '<div class="detail-architecture-empty">暂无 Archify 架构快照。可从右上角导入 JSON；快照保存在仓库的 .gitfinder/architecture/ 中。</div>';
        return;
      }
      container.innerHTML = snapshots.map(snapshot => `
        <article class="detail-architecture-item">
          <div class="detail-architecture-item-copy">
            <strong>${this.app.escapeHtml(snapshot.title || snapshot.diagramType)}</strong>
            <small>${this.app.escapeHtml(snapshot.diagramType)} · ${this.app.escapeHtml(snapshot.repositoryHead || '未关联提交')}</small>
            <small>${this.app.escapeHtml(this.app.formatTime(snapshot.generatedAt))}${snapshot.htmlPath ? ' · 有 HTML 预览' : ''}</small>
          </div>
          <div class="detail-architecture-item-actions">
            <button class="btn btn-tiny" type="button" data-architecture-open="json" data-snapshot-id="${this.app.escapeHtml(snapshot.snapshotId)}">JSON</button>
            ${snapshot.htmlPath ? `<button class="btn btn-tiny" type="button" data-architecture-open="html" data-snapshot-id="${this.app.escapeHtml(snapshot.snapshotId)}">预览</button>` : ''}
          </div>
        </article>
      `).join('');
      container.querySelectorAll('[data-architecture-open]').forEach(button => {
        button.addEventListener('click', async () => {
          try {
            await this.bridge.architectureSnapshots.open({
              repoPath: repo.path,
              snapshotId: button.dataset.snapshotId,
              format: button.dataset.architectureOpen
            });
          } catch (error) {
            this.app._showStatusMessage(`打开架构快照失败：${error.message || error}`, 'error');
          }
        });
      });
    }

    _element(id) {
      return this.document?.getElementById?.(id) || null;
    }
  }

  return { Controller };
});
