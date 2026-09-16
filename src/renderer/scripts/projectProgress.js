// Development Tasks and Dashboard share a portfolio; neither maintains another task store.
Object.assign(App, {
  async readProjectProgressPortfolio(forceRefresh = false) {
    if (this._progressReadPromise) return this._progressReadPromise;
    if (!window.gitFinder?.projectTasks?.getPortfolio) return AppState.taskPortfolio || { projects: [], tasks: [], warnings: [] };
    const request = Promise.resolve().then(() => window.gitFinder.projectTasks.getPortfolio({ forceRefresh })).then(result => {
      AppState.taskPortfolio = result;
      return result;
    }).catch(error => {
      const result = { success: false, readOnly: true, projects: [], tasks: [], dependencies: [], milestones: [], timeline: [], warnings: [], error: error?.message || String(error) };
      AppState.taskPortfolio = result;
      return result;
    });
    this._progressReadPromise = request;
    try { return await request; }
    finally { if (this._progressReadPromise === request) this._progressReadPromise = null; }
  },

  ensureProjectProgressPolling() {
    if (this._progressPollTimer || typeof window.setInterval !== 'function') return;
    const refresh = async () => {
      const mode = AppState.currentMode;
      if (!['tasks', 'dashboard'].includes(mode) || document.visibilityState === 'hidden' || this._progressReadPromise || this._progressPolling) return;
      if (AppState.taskEditTaskKey || AppState.taskCreateDraft || AppState.taskStatusPreview || AppState.milestoneEditKey || AppState.taskPortfolioLoading) return;
      if (document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
      this._progressPolling = true;
      try {
        const previous = AppState.taskPortfolio;
        const portfolio = await this.readProjectProgressPortfolio(true);
        if (AppState.currentMode !== mode) return;
        if (portfolio.contentRevision && portfolio.contentRevision === previous?.contentRevision) return;
        const content = document.getElementById('content-area');
        if (!content) return;
        const scroll = ['#content-area', '.task-list-pane', '.task-detail-scroll', '.task-board', '.task-timeline-scroll'].map(selector => {
          const element = document.querySelector(selector);
          return { selector, top: element?.scrollTop || 0, left: element?.scrollLeft || 0 };
        });
        if (mode === 'tasks') this.renderProjectTasksView();
        else await this.renderDashboardContent(this._prepareDisplayRepos(), content, { portfolio });
        if (AppState.currentMode !== mode) return;
        for (const item of scroll) { const element = document.querySelector(item.selector); if (element) { element.scrollTop = item.top; element.scrollLeft = item.left; } }
        this.updateStatusBar();
      } catch (error) { console.warn('项目进度读取失败', error?.message || error); }
      finally { this._progressPolling = false; }
    };
    this._refreshProjectProgress = refresh;
    this._progressPollTimer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('beforeunload', () => {
      window.clearInterval(this._progressPollTimer);
      window.removeEventListener('focus', refresh);
      this._progressPollTimer = null;
    }, { once: true });
  },

  async openProgressProjectTasks(projectId) {
    AppState.taskFilters = { projectId, status: 'all', priority: 'all', leafOnly: true };
    AppState.taskViewMode = 'list';
    AppState.selectedTaskKey = null;
    AppState.searchQuery = '';
    const search = document.getElementById('search-input'); if (search) search.value = '';
    this.switchView('tasks');
  },

  getRepositorySourceHtml(source) {
    return `<footer class="task-source-footer"><strong>唯一事实来源 · 只读</strong>
      <code>${this.escapeHtml(source?.relativePath || source?.projectionPath || '')}</code>
      <span>源更新：${this.escapeHtml(this.formatTaskTimestamp(source?.generatedAt))}</span>
      <span>请在项目内维护原台账；GitFinder不另存任务、不替代项目校验或人工验收。</span>
      <button type="button" class="btn btn-small" data-task-source-path="${this.escapeHtml(source?.ledgerPath || '')}">定位原始台账</button>
    </footer>`;
  },

  getRepositoryTaskDetailHtml(task) {
    const peerList = (peers, direction) => peers.length
      ? `<div class="task-relation-peers">${peers.map(peer => this.getProjectTaskRelationPeerHtml(peer, direction)).join('')}</div>`
      : '<div class="task-section-empty">无</div>';
    const userAcceptance = { pending: '待用户确认', confirmed: '用户已确认（源记录）', not_required: '不要求用户确认' }[task.userAcceptance] || '未单独记录';
    return `<div class="task-detail-scroll repository-task-detail">
      <div class="task-detail-kicker"><span>${this.escapeHtml(task.projectName)}</span><span>${this.escapeHtml(task.taskId)}</span></div>
      <h2>${this.escapeHtml(task.title)}</h2>
      <div class="task-detail-status task-tone-${this.escapeHtml(task.statusTone || 'info')}">${this.escapeHtml(task.status)} · 原始状态 ${this.escapeHtml(task.sourceStatus)}</div>
      <div class="task-detail-actions"><button class="btn" type="button" data-task-open-path="${this.escapeHtml(task.projectRoot)}">进入项目目录</button><button class="btn" type="button" data-task-terminal-path="${this.escapeHtml(task.projectRoot)}">打开终端</button></div>
      <dl class="task-facts-grid">
        <div><dt>阶段</dt><dd>${this.escapeHtml(task.stageName)}</dd></div><div><dt>负责人</dt><dd>${this.escapeHtml(task.owner)}</dd></div>
        <div><dt>优先级 / 类型</dt><dd>${this.escapeHtml(task.priority)} / ${this.escapeHtml(task.kind)}</dd></div><div><dt>更新时间</dt><dd>${this.escapeHtml(this.formatTaskTimestamp(task.updatedAt))}</dd></div>
        <div><dt>实现 / 部署</dt><dd>${this.escapeHtml(task.implementation || '未单独记录')} / ${this.escapeHtml(task.deployment || task.delivery?.version || '未单独记录')}</dd></div>
        <div><dt>用户验收</dt><dd>${this.escapeHtml(userAcceptance)}</dd></div>
      </dl>
      <section class="task-detail-section"><h3>下一步行动</h3><div class="task-next-action">${this.escapeHtml(task.nextAction || '未记录')}</div></section>
      ${(task.blockers || []).length ? `<section class="task-detail-section"><h3>阻塞与解除条件</h3>${task.blockers.map(item => `<p class="task-danger-text">${this.escapeHtml(item)}</p>`).join('')}</section>` : ''}
      <section class="task-detail-section"><h3>前置任务</h3>${peerList(task.predecessors || [], 'predecessor')}</section>
      <section class="task-detail-section"><h3>后继影响</h3>${peerList(task.successors || [], 'successor')}</section>
      <section class="task-detail-section"><h3>验收条件 · ${(task.acceptance || []).length} 项</h3><p class="task-section-empty">台账未提供逐项验收结果；任务完成不会自动勾选以下条件。</p>
        <ul class="task-fact-list">${(task.acceptance || []).map(item => `<li><span class="task-check">·</span><span>${this.escapeHtml(item.criterion)}</span></li>`).join('')}</ul>
      </section>
      <section class="task-detail-section"><h3>证据引用 · ${(task.evidence || []).length} 项</h3>
        ${(task.evidence || []).length ? `<ul class="task-evidence-list">${task.evidence.map(item => `<li><div>${this.escapeHtml(item.summary)}</div><code>${this.escapeHtml(item.reference)}</code></li>`).join('')}</ul>` : '<div class="task-section-empty">无完成证据；不由App补写。</div>'}
        ${task.delivery?.sourceCommit ? `<p>交付提交：<code>${this.escapeHtml(task.delivery.sourceCommit)}</code></p>` : ''}
      </section>
      ${this.getRepositorySourceHtml(task.source)}
    </div>`;
  },

  getRepositoryMilestoneDetailHtml(milestone) {
    return `<div class="task-detail-scroll"><div class="task-detail-kicker">${this.escapeHtml(milestone.projectName)}</div>
      <h2>${this.escapeHtml(milestone.name)}</h2><p class="task-next-action">${this.escapeHtml(milestone.acceptanceSummary)}</p>
      <p>这是原台账阶段的任务汇总，不是另建或自动完成的正式验收里程碑。</p>
      <button class="btn" type="button" data-task-open-path="${this.escapeHtml(milestone.projectRoot)}">进入项目目录</button>
      ${this.getRepositorySourceHtml(milestone.source)}</div>`;
  },

  getDashboardTaskSourcesHtml(stats, portfolio) {
    const sources = stats.sourceProjects || [];
    const warnings = portfolio?.warnings || [];
    return `
      <section class="dashboard-panel dashboard-task-progress" aria-label="开发任务进度">
        <div class="task-section-heading"><h2 class="dashboard-panel-title">开发任务 · 与任务页同源</h2><button class="btn btn-small" type="button" id="dashboard-progress-refresh">刷新进度</button></div>
        <p class="project-dashboard-subtitle">任务完成 ${stats.taskCompletedCount}/${stats.taskCount} · 开发中 ${stats.taskInProgressCount} · 阻塞 ${stats.taskBlockedCount} · 文档任务 ${stats.documentationTaskCount}。任务计数不是软件完成率或用户验收结果。</p>
        ${portfolio?.error ? `<p class="task-danger-text" role="status">${this.escapeHtml(portfolio.error)}</p>` : ''}
        ${warnings.length ? `<p class="task-danger-text" role="status">${warnings.length} 条数据源提醒：${warnings.slice(0, 3).map(item => this.escapeHtml(item.message || item.code)).join('；')}</p>` : ''}
        ${sources.length ? `<div class="dashboard-source-list">${sources.map(item => {
          const project = item.sourceProject;
          return `<button class="dashboard-source-item" type="button" data-dashboard-task-project="${this.escapeHtml(project.projectId)}">
            <span><strong>${this.escapeHtml(project.name)}</strong><small>${this.escapeHtml(project.source?.authority || 'Local Project Manager')} · ${project.source?.kind === 'repository-ledger' ? '原台账只读' : '连接器投影'}</small></span>
            <span>${item.unavailable ? `<strong class="task-danger-text">数据源异常</strong><small>${this.escapeHtml(item.sourceError)}</small>` : `<strong>${item.summary.progressDone}/${item.summary.progressTotal} 任务完成</strong><small>阻塞 ${item.summary.blockedCount}${project.nextTaskId ? ` · 下一项 ${this.escapeHtml(project.nextTaskId)}` : ''}</small>`}</span>
            <span><small>源更新 ${this.escapeHtml(this.formatTaskTimestamp(project.updatedAt || project.generatedAt))}</small><small>查看开发任务 →</small></span>
          </button>`;
        }).join('')}</div>` : '<div class="dashboard-empty">当前范围暂无项目台账。将项目目录加入受管位置后，自动发现 management/development-tasks.json 或 docs/00-handoff/TASKS.json；不自动创建另一份进度文件。</div>'}
        <p class="project-dashboard-subtitle">前台每15秒重读；回到App时刷新。台账修改仍在项目内完成，不自动提交、打包或部署。</p>
      </section>`;
  }
});
