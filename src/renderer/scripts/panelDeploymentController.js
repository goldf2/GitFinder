(function exposePanelDeploymentController(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PanelDeploymentController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPanelDeploymentControllerApi(root) {
  const HEALTHY_STATUSES = new Set(['running', 'healthy', 'online', 'available', 'ok']);
  const WARNING_STATUSES = new Set(['degraded', 'warning', 'starting', 'restarting', 'pending']);
  const FAILED_STATUSES = new Set(['failed', 'error', 'offline', 'stopped', 'unhealthy']);

  class Controller {
    constructor(options = {}) {
      this.app = options.app;
      this.bridge = options.bridge;
      this.document = options.document || root?.document || null;
      this.requestId = 0;
      this.currentPath = '';
      this.currentResult = null;
      this.dialogKeyHandler = null;
    }

    cancel() {
      this.requestId += 1;
      this.currentPath = '';
      this.currentResult = null;
      this.closeBindingDialog();
    }

    showRepository(repo) {
      const section = this._element('detail-deployments-section');
      const container = this._element('detail-deployments');
      const project = repo?.localProject?.isProject ? repo.localProject.project : null;
      if (!section || !container || !project) {
        if (section) section.hidden = true;
        return;
      }
      section.hidden = false;
      this._load(container, repo.path, project);
    }

    showDirectory(item) {
      if (!item?.isProject || item.type !== 'directory') return;
      const host = this._element('detail-empty');
      if (!host) return;
      let container = host.querySelector?.('#detail-directory-deployments');
      if (!container) {
        container = this.document.createElement('div');
        container.id = 'detail-directory-deployments';
        container.className = 'panel-deployments panel-deployments-directory';
        host.appendChild(container);
      }
      this._load(container, item.path, item.project || { projectId: '' });
    }

    async _load(container, directoryPath, project) {
      const requestId = ++this.requestId;
      this.currentPath = directoryPath;
      container.innerHTML = this._loadingMarkup();
      try {
        const result = await this.bridge.panel.getProjectDeployments(directoryPath);
        if (requestId !== this.requestId || directoryPath !== this.currentPath) return;
        this.currentResult = result;
        container.innerHTML = this._resultMarkup(result, project);
        this._bindContainer(container, directoryPath, project);
      } catch (error) {
        if (requestId !== this.requestId || directoryPath !== this.currentPath) return;
        container.innerHTML = this._errorMarkup(error);
        this._bindContainer(container, directoryPath, project);
      }
    }

    _loadingMarkup() {
      return '<div class="panel-deployment-state"><span class="panel-deployment-spinner" aria-hidden="true"></span><span>正在读取 Panel 部署信息…</span></div>';
    }

    _resultMarkup(result, project) {
      if (result.state === 'unconfigured') {
        return `<div class="panel-deployment-state panel-deployment-state-stacked">
          <strong>尚未连接 Xiangshu Panel</strong>
          <span>本地项目与 Git 功能不受影响。</span>
          <button class="btn btn-tiny" data-panel-action="open-settings" type="button">连接 Panel…</button>
        </div>`;
      }
      if (result.state === 'reauthentication-required') {
        return `<div class="panel-deployment-state panel-deployment-state-stacked">
          <strong>需要重新连接 Xiangshu Panel</strong>
          <span>GitFinder 不读取旧版钥匙串凭据；请重新输入只读令牌建立应用会话。</span>
          <button class="btn btn-tiny" data-panel-action="open-settings" type="button">前往设置…</button>
        </div>`;
      }
      if (result.state === 'unlinked') {
        return `<div class="panel-deployment-state panel-deployment-state-stacked">
          <strong>尚未关联部署资源</strong>
          <span>${this.app.escapeHtml(project?.name || '当前项目')} · ${this.app.escapeHtml(result.provider?.label || 'Panel')}</span>
          <button class="btn btn-tiny" data-panel-action="manage-binding" type="button">管理关联…</button>
        </div>`;
      }
      const resources = Array.isArray(result.resources) ? result.resources : [];
      if (!resources.length) {
        return '<div class="panel-deployment-state"><span>关联已保存，但当前快照没有资源。</span></div>';
      }
      return `<div class="panel-deployment-provider">
          <span>${this.app.escapeHtml(result.provider?.label || 'Xiangshu Panel')}</span>
          <button class="btn btn-tiny" data-panel-action="refresh" type="button">刷新</button>
        </div>
        <div class="panel-deployment-list">${resources.map(resource => this._resourceMarkup(resource)).join('')}</div>
        <div class="panel-deployment-footer">
          <button class="btn btn-tiny" data-panel-action="manage-binding" type="button">管理关联…</button>
          <button class="btn btn-tiny" data-panel-action="clear-binding" type="button">解除关联</button>
        </div>`;
    }

    _resourceMarkup(resource) {
      const tone = this._statusTone(resource.status);
      const domains = resource.domains || [];
      const actions = [
        resource.panelUrl ? `<button class="panel-resource-link" data-panel-action="open-external" data-panel-url="${this.app.escapeHtml(resource.panelUrl)}" type="button">Panel</button>` : '',
        resource.coolifyUrl ? `<button class="panel-resource-link" data-panel-action="open-external" data-panel-url="${this.app.escapeHtml(resource.coolifyUrl)}" type="button">Coolify</button>` : ''
      ].filter(Boolean).join('');
      return `<article class="panel-resource-card" data-panel-resource="${this.app.escapeHtml(resource.resourceUuid)}">
        <header>
          <div><strong>${this.app.escapeHtml(resource.name)}</strong><small>${this.app.escapeHtml(resource.type)}</small></div>
          <span class="panel-status-badge ${tone}">${this.app.escapeHtml(resource.status || 'unknown')}</span>
        </header>
        <dl>
          <div><dt>环境</dt><dd>${this.app.escapeHtml(resource.environmentName)}</dd></div>
          <div><dt>服务器</dt><dd>${this.app.escapeHtml(resource.serverName)}</dd></div>
          ${domains.length ? `<div><dt>域名</dt><dd>${domains.map(domain => `<button class="panel-domain-link" data-panel-action="open-external" data-panel-url="${this.app.escapeHtml(domain)}" type="button">${this.app.escapeHtml(this._domainLabel(domain))}</button>`).join('')}</dd></div>` : ''}
          <div><dt>延迟</dt><dd>${resource.latencyMs === null || resource.latencyMs === undefined ? '未知' : `${this.app.escapeHtml(resource.latencyMs)} ms${resource.latencyKind ? ` · ${this.app.escapeHtml(resource.latencyKind)}` : ''}`}</dd></div>
          <div><dt>最近部署失败</dt><dd class="${resource.recentFailure?.hasFailure ? 'panel-failure-yes' : ''}">${resource.recentFailure?.hasFailure ? `是${resource.recentFailure.occurredAt ? ` · ${this.app.escapeHtml(this._formatObservedAt(resource.recentFailure.occurredAt))}` : ''}` : '否'}</dd></div>
          ${resource.branch || resource.commit ? `<div><dt>部署源码</dt><dd title="${this.app.escapeHtml(resource.commit || '')}">${this.app.escapeHtml([resource.branch, resource.commit ? String(resource.commit).slice(0, 12) : ''].filter(Boolean).join(' · '))}</dd></div>` : ''}
          <div><dt>观测时间</dt><dd>${this.app.escapeHtml(this._formatObservedAt(resource.observedAt))}</dd></div>
        </dl>
        ${actions ? `<footer>${actions}</footer>` : ''}
      </article>`;
    }

    _errorMarkup(error) {
      return `<div class="panel-deployment-state panel-deployment-state-stacked panel-deployment-error">
        <strong>Panel 数据加载失败</strong>
        <span>${this.app.escapeHtml(error?.message || String(error))}</span>
        <button class="btn btn-tiny" data-panel-action="refresh" type="button">重试</button>
      </div>`;
    }

    _bindContainer(container, directoryPath, project) {
      if (container.dataset.panelBound === '1') return;
      container.dataset.panelBound = '1';
      container.addEventListener('click', event => {
        const button = event.target.closest?.('[data-panel-action]');
        const action = button?.dataset.panelAction;
        if (!action) return;
        if (action === 'refresh') this._load(container, directoryPath, project);
        if (action === 'open-settings') this.app.openSettingsPage('settings-panel-provider');
        if (action === 'manage-binding') this.openBindingDialog(directoryPath, container, project);
        if (action === 'clear-binding') this.clearBinding(directoryPath, container, project);
        if (action === 'open-external') this.bridge.panel.openExternal(button.dataset.panelUrl)
          .catch(error => this.app._showStatusMessage(error?.message || String(error), 'error'));
      });
    }

    settingsMarkup(connection = {}) {
      const connected = connection.configured === true;
      const reconnectRequired = connection.reconnectRequired === true;
      return `<section class="app-settings-section" id="settings-panel-provider" aria-labelledby="settings-panel-title">
        <div class="app-settings-section-heading">
          <h2 id="settings-panel-title">Xiangshu Panel</h2>
          <p>Panel 负责服务器端监控；GitFinder 只读取聚合状态和事件。</p>
        </div>
        <div class="app-settings-controls">
          <label class="app-settings-row" for="panel-provider-url">
            <span><strong>Panel 地址</strong><small>必须使用 HTTPS；Token 不写入项目便携配置</small></span>
            <input id="panel-provider-url" type="url" spellcheck="false" placeholder="https://panel.example.com" value="${this.app.escapeHtml(connection.baseUrl || '')}">
          </label>
          <label class="app-settings-row" for="panel-provider-label">
            <span><strong>连接名称</strong><small>用于项目详情和关联选择</small></span>
            <input id="panel-provider-label" type="text" maxlength="120" value="${this.app.escapeHtml(connection.label || 'Xiangshu Panel')}">
          </label>
          <label class="app-settings-row" for="panel-provider-token">
            <span><strong>只读访问令牌</strong><small>${connected ? '应用已保持登录；重新连接时需再次输入' : '需要 catalog:read、snapshots:read 和 topology:read'}</small></span>
            <input id="panel-provider-token" type="password" autocomplete="off" placeholder="${connected ? '应用会话已保留' : '输入只读令牌'}">
          </label>
          <div class="panel-settings-boundary">
            <strong>应用自有会话</strong>
            <span>GitFinder 不读取系统钥匙串，也不保存 Panel 密码。只读会话令牌保存在应用本机数据中，仅由当前系统用户的文件权限保护；请使用短期、最小权限且可随时撤销的令牌。</span>
          </div>
          <div class="app-settings-row">
            <span><strong>${connected ? '已连接' : (reconnectRequired ? '需要重新连接' : '尚未连接')}</strong><small>${connected ? `${this.app.escapeHtml(connection.apiVersion || '')} · ${this.app.escapeHtml(connection.connectedAt || '')}` : (reconnectRequired ? '旧版钥匙串密文不会被读取' : '连接时会先验证 API 版本与只读能力')}</small></span>
            <span class="panel-settings-actions">
              ${connected ? '<button class="btn" data-app-action="disconnect-panel" type="button">断开</button>' : ''}
              <button class="btn btn-primary" data-app-action="connect-panel" type="button">${connected || reconnectRequired ? '重新连接并验证' : '连接并验证'}</button>
            </span>
          </div>
          <div class="panel-settings-feedback" id="panel-settings-feedback" role="status" aria-live="polite"></div>
        </div>
      </section>`;
    }

    async connectFromSettings() {
      const baseUrl = this._element('panel-provider-url')?.value || '';
      const label = this._element('panel-provider-label')?.value || '';
      const token = this._element('panel-provider-token')?.value || '';
      const feedback = this._element('panel-settings-feedback');
      const button = this.document.querySelector('[data-app-action="connect-panel"]');
      if (feedback) feedback.textContent = '正在验证 Panel API 和只读权限…';
      if (button) button.disabled = true;
      try {
        if (!token) throw new Error('重新连接时也需要输入令牌，旧令牌不会显示在界面中');
        await this.bridge.panel.connect({ baseUrl, label, token });
        this.app._showStatusMessage('Panel 已连接并验证', 'success');
        await this.app.renderSettingsView();
      } catch (error) {
        if (feedback) feedback.textContent = error?.message || String(error);
        if (button) button.disabled = false;
      }
    }

    async disconnectFromSettings() {
      if (!root.confirm('断开 Panel 连接？项目中的非敏感关联文件会保留。')) return;
      await this.bridge.panel.disconnect();
      this.app._showStatusMessage('Panel 连接已断开', 'info');
      await this.app.renderSettingsView();
    }

    async openBindingDialog(directoryPath, container, project) {
      this.closeBindingDialog();
      const overlay = this.document.createElement('div');
      overlay.className = 'panel-binding-overlay';
      overlay.id = 'panel-binding-overlay';
      overlay.innerHTML = `<section class="panel-binding-dialog" role="dialog" aria-modal="true" aria-labelledby="panel-binding-title">
        <header><div><h2 id="panel-binding-title">关联部署资源</h2><p>${this.app.escapeHtml(directoryPath)}</p></div><button class="panel-binding-close" type="button" aria-label="关闭">×</button></header>
        <div class="panel-binding-body"><div class="panel-deployment-state"><span class="panel-deployment-spinner"></span><span>正在读取 Panel Catalog…</span></div></div>
      </section>`;
      this.document.body.appendChild(overlay);
      overlay.querySelector('.panel-binding-close')?.addEventListener('click', () => this.closeBindingDialog());
      this.dialogKeyHandler = event => {
        if (event.key === 'Escape') this.closeBindingDialog();
      };
      this.document.addEventListener('keydown', this.dialogKeyHandler);
      try {
        const [catalog, registry] = await Promise.all([
          this.bridge.panel.getCatalog(),
          this.bridge.repos?.getRegistry
            ? this.bridge.repos.getRegistry().catch(() => ({ repos: [] }))
            : Promise.resolve({ repos: [] })
        ]);
        if (!this.document.body.contains(overlay)) return;
        const resources = catalog.resources || [];
        const normalizedProjectPath = String(directoryPath || '').replaceAll('\\', '/').replace(/\/$/, '').toLocaleLowerCase('en');
        const repositories = (registry?.repos || []).filter(repository => {
          if (!repository?.id || repository.archived === true || !repository.path) return false;
          const candidate = String(repository.path).replaceAll('\\', '/').replace(/\/$/, '').toLocaleLowerCase('en');
          return candidate === normalizedProjectPath || candidate.startsWith(`${normalizedProjectPath}/`);
        });
        const existingBinding = this.currentResult?.bindings?.[0] || null;
        const existingRepositoryIds = new Set(existingBinding?.repositoryIds || []);
        const body = overlay.querySelector('.panel-binding-body');
        body.innerHTML = resources.length ? `
          <div class="panel-binding-resource-list" role="radiogroup" aria-label="部署资源">
            ${resources.map((resource, index) => `<label class="panel-binding-resource">
              <input type="radio" name="panel-binding-resource" value="${this.app.escapeHtml(resource.resourceUuid)}"${index === 0 ? ' checked' : ''}>
              <span><strong>${this.app.escapeHtml(resource.name)}</strong><small>${this.app.escapeHtml(resource.projectName || '未命名项目')} · ${this.app.escapeHtml(resource.environmentName)} · ${this.app.escapeHtml(resource.serverName)}</small></span>
              <span class="panel-status-badge ${this._statusTone(resource.status)}">${this.app.escapeHtml(resource.status)}</span>
            </label>`).join('')}
          </div>
          <section class="panel-binding-repositories" aria-labelledby="panel-binding-repositories-title">
            <div><strong id="panel-binding-repositories-title">关联本地 Git 仓库</strong><small>用稳定 repositoryId 建立源码与部署关系，可多选</small></div>
            ${repositories.length ? `<div class="panel-binding-repository-list">${repositories.map((repository, index) => `<label>
              <input type="checkbox" name="panel-binding-repository" value="${this.app.escapeHtml(repository.id)}"${existingRepositoryIds.has(repository.id) || (!existingRepositoryIds.size && index === 0) ? ' checked' : ''}>
              <span><strong>${this.app.escapeHtml(repository.name || repository.id)}</strong><small title="${this.app.escapeHtml(repository.path)}">${this.app.escapeHtml(repository.path)}</small></span>
            </label>`).join('')}</div>` : '<p>当前项目范围内尚未发现已注册的 Git 仓库；可以先只关联部署，稍后补充。</p>'}
          </section>
          <footer><span>只写入稳定 ID，不保存 Token 或服务器凭据。</span><button class="btn btn-primary" data-panel-binding-save type="button">保存关联</button></footer>`
          : '<div class="panel-deployment-state panel-deployment-state-stacked"><strong>Panel Catalog 没有可关联资源</strong><span>请先在 Panel 中确认只读 API 返回内容。</span></div>';
        body.querySelector('[data-panel-binding-save]')?.addEventListener('click', async event => {
          const selectedId = body.querySelector('input[name="panel-binding-resource"]:checked')?.value;
          const resource = resources.find(item => item.resourceUuid === selectedId);
          if (!resource) return;
          const repositoryIds = [...body.querySelectorAll('input[name="panel-binding-repository"]:checked')]
            .map(input => input.value)
            .slice(0, 8);
          event.currentTarget.disabled = true;
          try {
            await this.bridge.panel.saveProjectBinding(directoryPath, {
              ...resource,
              repositoryIds,
              ...(repositoryIds[0] ? { primaryRepositoryId: repositoryIds[0] } : {})
            });
            this.closeBindingDialog();
            this.app._showStatusMessage('部署资源关联已保存', 'success');
            await this._load(container, directoryPath, project);
          } catch (error) {
            event.currentTarget.disabled = false;
            this.app._showStatusMessage(error?.message || String(error), 'error');
          }
        });
      } catch (error) {
        const body = overlay.querySelector('.panel-binding-body');
        if (body) body.innerHTML = this._errorMarkup(error);
      }
    }

    closeBindingDialog() {
      this._element('panel-binding-overlay')?.remove();
      if (this.dialogKeyHandler) this.document.removeEventListener('keydown', this.dialogKeyHandler);
      this.dialogKeyHandler = null;
    }

    async clearBinding(directoryPath, container, project) {
      if (!root.confirm('解除当前项目与部署资源的关联？不会修改 Panel 或 Coolify。')) return;
      await this.bridge.panel.clearProjectBindings(directoryPath);
      this.app._showStatusMessage('部署资源关联已解除', 'info');
      await this._load(container, directoryPath, project);
    }

    _statusTone(status) {
      const normalized = String(status || '').toLowerCase();
      if (HEALTHY_STATUSES.has(normalized)) return 'healthy';
      if (WARNING_STATUSES.has(normalized)) return 'warning';
      if (FAILED_STATUSES.has(normalized)) return 'failed';
      return 'unknown';
    }

    _domainLabel(value) {
      try { return new URL(value).hostname; } catch (_) { return value; }
    }

    _formatObservedAt(value) {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return '未知';
      return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
      }).format(date);
    }

    _element(id) {
      return this.document?.getElementById?.(id) || null;
    }
  }

  return { Controller };
});
