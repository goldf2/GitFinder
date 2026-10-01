(function exposeProjectConversations(root) {
  class Controller {
    constructor({ app, bridge, document }) {
      this.app = app;
      this.bridge = bridge.projectConversations;
      this.files = bridge.fs;
      this.document = document;
      this.store = { schemaVersion: 1, projects: [] };
      this.projectId = null;
      this.rows = [];
      this.workspaces = new Map();
    }

    async init() {
      this.document.addEventListener('click', event => {
        const button = event.target.closest?.('[data-chat-action]');
        if (!button) return;
        event.stopPropagation();
        this.run(button.dataset.chatAction, button).catch(error => this.feedback(error.message));
      });
      this.element('project-chat-import').addEventListener('change', async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
          if (file.size > 2 * 1024 * 1024) throw new Error('导入清单不能超过 2 MiB');
          this.store = await this.bridge.import(JSON.parse(await file.text()));
          this.refreshDetail();
          if (this.app.contentCollectionKind() === 'projects') await this.app.renderProjectsView(false);
          if (this.projectId) this.show(this.projectId);
          this.feedback(`已合并导入 ${this.store.projects.length} 个项目的会话`);
        } catch (error) { this.feedback(error.message); }
      });
      this.element('project-chat-modal').addEventListener('keydown', event => {
        if (event.key === 'Escape' && !this.busy) this.close();
      });
      this.element('project-chat-task-modal').addEventListener('keydown', event => { if (event.key === 'Escape') this.element('project-chat-task-modal').style.display = 'none'; });
      try { this.store = await this.bridge.list(); }
      catch (error) { this.app._showStatusMessage(error.message, 'error'); }
    }

    element(id) { return this.document.getElementById(id); }
    conversations(projectId) { return this.store.projects.find(item => item.projectId === projectId)?.conversations || []; }
    url(item) { return item.source === 'codex' ? `codex://threads/${item.threadId}` : `https://chatgpt.com/c/${item.threadId}`; }
    feedback(message) {
      if (this.element('project-chat-modal').style.display !== 'none') this.element('project-chat-feedback').textContent = message;
      else this.app._showStatusMessage(message, 'error');
    }

    detailMarkup(projectId, { includeTasks = true } = {}) {
      const escape = value => this.app.escapeHtml(String(value || ''));
      const rows = [...this.conversations(projectId)].sort((a, b) => Number(b.role === 'primary') - Number(a.role === 'primary'));
      return `<section class="project-detail-section" data-project-chat-section><h4>项目会话</h4>${['codex', 'chatgpt'].map(source => `<h4>${source === 'codex' ? 'Codex' : 'ChatGPT'}</h4><div class="project-detail-links">${rows.filter(item => item.source === source).map(item => `<div><button class="btn btn-small" data-chat-action="open" data-chat-project="${escape(projectId)}" data-chat-source="${source}" data-chat-thread="${escape(item.threadId)}" title="${escape(item.summary || item.title)}">${item.role === 'primary' ? '主会话' : item.role === 'related' ? '关联' : '历史'} · ${escape(item.title)}</button>${item.summary ? `<details class="project-chat-summary"><summary>会话摘要</summary><p>${escape(item.summary)}</p></details>` : ''}${(item.taskRefs || []).map(ref => this.referenceMarkup(projectId, ref)).join('')}</div>`).join('') || '<p>尚未关联会话</p>'}</div>`).join('')}<button class="btn btn-small" data-chat-action="edit" data-chat-project="${escape(projectId)}">关联 / 编辑会话</button></section>${includeTasks ? `<section class="project-detail-section" data-project-task-board="${escape(projectId)}">正在读取项目任务…</section>` : ''}`;
    }

    referenceMarkup(projectId, ref) {
      const escape = value => this.app.escapeHtml(String(value || ''));
      return ref.kind === 'github' ? `<button class="btn btn-small" data-chat-action="open-github-task" data-chat-project="${escape(projectId)}" data-chat-url="${escape(ref.url)}">GitHub · ${escape(ref.url.split('/').slice(-2).join(' #'))}</button>`
        : `<button class="btn btn-small" data-chat-action="show-local-task" data-chat-project="${escape(projectId)}" data-chat-task-id="${escape(ref.taskId)}">任务 · ${escape(ref.taskId)}</button>`;
    }

    linkedConversations(projectId, ref) {
      return this.conversations(projectId).filter(item => item.taskRefs?.some(value => value.kind === ref.kind && (ref.kind === 'github' ? value.url === ref.url : value.taskId === ref.taskId)));
    }

    taskLinksMarkup(projectId, ref) {
      const escape = value => this.app.escapeHtml(String(value || ''));
      return `<div class="project-detail-links">${this.linkedConversations(projectId, ref).map(item => `<button class="btn btn-small" data-chat-action="open" data-chat-project="${escape(projectId)}" data-chat-source="${item.source}" data-chat-thread="${escape(item.threadId)}">${item.source === 'codex' ? 'Codex' : 'ChatGPT'} · ${escape(item.title)}</button>`).join('')}<div class="project-chat-row-actions">${['codex', 'chatgpt'].map(source => `<button class="btn btn-small" data-chat-action="link-task" data-chat-project="${escape(projectId)}" data-chat-source="${source}" ${ref.kind === 'github' ? `data-chat-url="${escape(ref.url)}"` : `data-chat-task-id="${escape(ref.taskId)}"`}>关联 ${source === 'codex' ? 'Codex' : 'ChatGPT'} 会话</button>`).join('')}</div></div>`;
    }

    taskMarkup(task) {
      const project = this.app.projectShortcutsController?.state?.localProjects?.find(item => item.path === task.projectRoot);
      return project ? `<section class="task-detail-section"><h3>协作会话</h3>${this.taskLinksMarkup(project.projectId, { kind: 'local', taskId: task.taskId })}</section>` : '';
    }

    async loadWorkspace(projectId, refreshGithub = false) {
      const workspace = await this.bridge.workspace(projectId, { refreshGithub });
      this.workspaces.set(projectId, workspace);
      this.document.querySelectorAll(`[data-project-task-board="${projectId}"]`).forEach(section => { section.innerHTML = this.workspaceMarkup(workspace); });
      return workspace;
    }

    workspaceMarkup(workspace) {
      const escape = value => this.app.escapeHtml(String(value || ''));
      const { projectId } = workspace;
      const linked = this.conversations(projectId).flatMap(item => item.taskRefs || []).filter(item => item.kind === 'github');
      const github = new Map((workspace.github?.items || []).map(item => [item.url, item]));
      linked.forEach(item => { if (!github.has(item.url)) github.set(item.url, { ...item, title: item.url.split('/').slice(-2).join(' #'), state: '已关联，状态待刷新' }); });
      return `<h4>任务与协作</h4><button class="btn btn-small" data-chat-action="open-context" data-chat-project="${escape(projectId)}">项目接续记录</button><h4>GitHub 仓库（${workspace.repositories.length}）</h4><div class="project-detail-links">${workspace.repositories.map(repo => `<div><strong>${escape(repo.repository)}</strong><div class="project-chat-row-actions">${[['', '仓库'], ['issues', 'Issues'], ['pulls', 'PRs']].map(([view, label]) => `<button class="btn btn-small" data-chat-action="open-repository" data-chat-project="${escape(projectId)}" data-chat-repository="${escape(repo.repository)}" data-chat-view="${view}">${label}</button>`).join('')}</div></div>`).join('') || '<p>尚未发现 GitHub remote</p>'}</div><h4>项目台账任务（${workspace.tasks.length}）</h4>${workspace.tasks.map(task => `<article class="project-chat-task-card"><button class="btn btn-small" data-chat-action="show-local-task" data-chat-project="${escape(projectId)}" data-chat-task-id="${escape(task.taskId)}">${escape(task.taskId)} · ${escape(task.title)}</button><p>${escape(task.status)} · ${escape(task.owner)}</p>${this.taskLinksMarkup(projectId, { kind: 'local', taskId: task.taskId })}</article>`).join('') || '<p>该项目暂无台账任务</p>'}${workspace.localErrors.map(error => `<p>${escape(error)}</p>`).join('')}<h4>GitHub Issues / PRs</h4><button class="btn btn-small" data-chat-action="refresh-github" data-chat-project="${escape(projectId)}">读取开放的 Issues / PRs</button><p class="file-operation-hint">${workspace.github ? `读取于 ${escape(new Date(workspace.github.refreshedAt).toLocaleString())}` : '点击读取，通过本机 gh 登录访问 GitHub'} · 每个仓库最多 100 项</p>${workspace.githubErrors.map(error => `<p>${escape(error)}</p>`).join('')}${[...github.values()].map(task => `<article class="project-chat-task-card">${this.referenceMarkup(projectId, { kind: 'github', url: task.url })}<p>${escape(task.title)} · ${escape(task.state)}</p>${this.taskLinksMarkup(projectId, { kind: 'github', url: task.url })}</article>`).join('') || (workspace.github ? '<p>本次未读取到开放任务</p>' : '')}`;
    }

    refreshDetail() {
      const detail = this.app.fileSelectionDetailController;
      if (detail?.item?.isProject && detail.activeTab === 'project') detail.show([detail.item]);
      if (this.app.workspaceController?.state.workspaceRepository?.view === 'chats') this.app.renderContent();
    }

    show(projectId) {
      const project = this.app.projectShortcutsController?.state?.localProjects?.find(item => item.projectId === projectId);
      this.projectId = projectId;
      this.rows = this.conversations(projectId).map(item => ({ ...item, url: this.url(item) }));
      this.element('project-chat-title').textContent = `${project?.name || '项目'} · 会话`;
      this.element('project-chat-feedback').textContent = '';
      this.element('project-chat-modal').style.display = 'flex';
      this.renderRows();
      (this.element('project-chat-rows').querySelector('input') || this.element('project-chat-add')).focus();
    }

    readRows() {
      return [...this.element('project-chat-rows').querySelectorAll('[data-chat-row]')].map((row, index) => ({
        ...this.rows[index], source: row.querySelector('[data-chat-source-select]').value, threadId: undefined,
        title: row.querySelector('[data-chat-title]').value,
        url: row.querySelector('[data-chat-url]').value,
        taskRefs: row.querySelector('[data-chat-task-refs]').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean).map(value => value.startsWith('https://') ? { kind: 'github', url: value } : { kind: 'local', taskId: value }),
        role: row.querySelector('[data-chat-role]').value
      }));
    }

    renderRows() {
      const escape = value => this.app.escapeHtml(String(value || ''));
      this.element('project-chat-rows').innerHTML = this.rows.map((item, index) => `<fieldset class="project-chat-row" data-chat-row><legend>会话 ${index + 1}</legend><label>来源<select data-chat-source-select><option value="codex"${item.source === 'codex' ? ' selected' : ''}>Codex</option><option value="chatgpt"${item.source === 'chatgpt' ? ' selected' : ''}>ChatGPT</option></select></label><label>标题<input data-chat-title maxlength="500" value="${escape(item.title)}" autocomplete="off"></label><label>会话链接<input data-chat-url value="${escape(item.url)}" placeholder="codex://threads/… 或 https://chatgpt.com/c/…" autocomplete="off" spellcheck="false"></label><label>任务 ID 或 GitHub Issue/PR 链接（每行一项）<textarea data-chat-task-refs rows="2" spellcheck="false">${escape((item.taskRefs || []).map(ref => ref.kind === 'github' ? ref.url : ref.taskId).join('\n'))}</textarea></label><div class="project-chat-row-actions"><label>用途<select data-chat-role>${[['primary', '主会话'], ['history', '历史会话'], ['related', '关联会话']].map(([role, label]) => `<option value="${role}"${item.role === role ? ' selected' : ''}>${label}</option>`).join('')}</select></label><button class="btn btn-small" data-chat-action="remove" data-chat-row-index="${index}" type="button">移除关联</button></div></fieldset>`).join('') || '<p>点击“添加会话”关联已有对话，或导入项目会话清单。</p>';
      this.element('project-chat-rows').querySelectorAll('[data-chat-source-select]').forEach(select => select.addEventListener('change', () => { this.rows = this.readRows(); this.renderRows(); }));
    }

    close() {
      if (this.busy) return;
      this.element('project-chat-modal').style.display = 'none';
      this.projectId = null;
    }

    async run(action, button) {
      if (this.busy) return;
      if (action === 'edit') { this.show(button.dataset.chatProject); return; }
      if (action === 'close-task') { this.element('project-chat-task-modal').style.display = 'none'; return; }
      if (action === 'refresh-github') {
        button.disabled = true;
        try { await this.loadWorkspace(button.dataset.chatProject, true); } finally { button.disabled = false; }
        return;
      }
      if (action === 'open-repository') { await this.bridge.openRepository(button.dataset.chatProject, button.dataset.chatRepository, button.dataset.chatView); return; }
      if (action === 'open-context') {
        const workspace = this.workspaces.get(button.dataset.chatProject) || await this.loadWorkspace(button.dataset.chatProject);
        await this.files.openFile(`${workspace.projectPath}/docs/ai-context/INDEX.md`);
        return;
      }
      if (action === 'open-github-task') { await this.bridge.openGithubTask(button.dataset.chatProject, button.dataset.chatUrl); return; }
      if (action === 'show-local-task') {
        const workspace = this.workspaces.get(button.dataset.chatProject) || await this.loadWorkspace(button.dataset.chatProject);
        const task = workspace.tasks.find(item => item.taskId === button.dataset.chatTaskId);
        if (!task) throw new Error('该任务已不在项目台账中');
        const body = this.element('project-chat-task-body');
        body.innerHTML = this.app.getRepositoryTaskDetailHtml(task);
        this.app.bindProjectTaskEvents(body);
        this.element('project-chat-task-modal').style.display = 'flex';
        this.element('project-chat-task-modal').querySelector('[data-chat-action=close-task]').focus();
        return;
      }
      if (action === 'link-task') {
        this.element('project-chat-task-modal').style.display = 'none';
        this.show(button.dataset.chatProject);
        const source = button.dataset.chatSource;
        let row = this.rows.find(item => item.source === source && item.role === 'primary') || this.rows.find(item => item.source === source);
        if (!row) { row = { source, title: '', url: '', role: 'primary' }; this.rows.push(row); }
        const ref = button.dataset.chatUrl ? { kind: 'github', url: button.dataset.chatUrl } : { kind: 'local', taskId: button.dataset.chatTaskId };
        row.taskRefs = row.taskRefs || [];
        if (!row.taskRefs.some(item => item.kind === ref.kind && (ref.kind === 'github' ? item.url === ref.url : item.taskId === ref.taskId))) row.taskRefs.push(ref);
        this.renderRows();
        this.feedback('已填入任务关联，保存后生效');
        return;
      }
      if (action === 'close') { this.close(); return; }
      if (action === 'import') { this.element('project-chat-import').click(); return; }
      if (action === 'open') {
        await this.bridge.open(button.dataset.chatProject, button.dataset.chatSource, button.dataset.chatThread);
        return;
      }
      if (action === 'add' || action === 'remove') {
        this.rows = this.readRows();
        if (action === 'add') this.rows.push({ source: 'codex', title: '', url: '', role: this.rows.some(item => item.source === 'codex' && item.role === 'primary') ? 'history' : 'primary' });
        else this.rows.splice(Number(button.dataset.chatRowIndex), 1);
        this.renderRows();
        return;
      }
      if (action === 'save') {
        this.busy = true;
        button.disabled = true;
        try {
          this.store = await this.bridge.save(this.projectId, this.readRows());
          this.refreshDetail();
          if (this.app.contentCollectionKind() === 'projects') await this.app.renderProjectsView(false);
          this.busy = false;
          this.close();
          this.app._showStatusMessage('已保存项目会话关联', 'success');
        } finally { this.busy = false; button.disabled = false; }
      }
    }
  }
  root.ProjectConversationsController = { Controller };
})(window);
