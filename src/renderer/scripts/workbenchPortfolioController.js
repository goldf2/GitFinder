(function(root){
  const QUEUES={open:'待推进',next:'接下来可推进',blocked:'需要解除阻塞',review:'待验收 / 交付',overdue:'已经逾期',completed:'已完成 / 交付',deferred:'暂缓',all:'全部任务'};
  const STATES={planned:'计划中',ready:'可开始',todo:'未开始',in_progress:'开发中',blocked:'受阻',verified:'已验证',in_review:'待验收',delivered:'已交付',done:'已完成',deferred:'暂缓'};
  class Controller{
    constructor(app,state,bridge){this.app=app;this.state=state;this.bridge=bridge;this.filters={projectId:'all',queue:'open',query:''};this.selectedKey=null;this.request=0;}
    e(value){return this.app.escapeHtml(String(value??''));}
    status(task){return STATES[task.sourceStatus]||STATES[task.status]||task.status||'未设置';}
    badge(task){return `<span class="workflow-status" data-status="${this.e(task.sourceStatus||task.status)}">${this.e(this.status(task))}</span>`;}
    async enter(mode='dashboard'){
      if(this.app.isExperimentalViewEnabled(mode)===false){const flags=await this.bridge.config.setExperimentalFeature(mode,true);this.app.applyExperimentalFeatures(flags);}
      this.state.searchQuery='';const search=document.getElementById('search-input');if(search)search.value='';this.app.switchView(mode);
    }
    async render(mode,forceRefresh=true,portfolio=null){
      const content=document.getElementById('content-area'),token=++this.request;
      const current=()=>token===this.request&&this.state.currentMode===mode&&this.app.isExperimentalViewEnabled(mode)!==false;
      if(!current())return;
      this.mode=mode;document.getElementById('empty-state').style.display='none';
      document.getElementById('filter-bar').style.display='none';
      if(!portfolio)content.innerHTML='<section class="workflow-page"><div class="workflow-state" role="status"><span class="workflow-state-symbol" aria-hidden="true">◌</span><h3>正在汇总项目进度</h3><p>读取各项目的原始任务台账。</p></div></section>';
      let timer;
      try{
        this.portfolio=portfolio||await Promise.race([this.app.readProjectProgressPortfolio(forceRefresh),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('汇总读取超时，可重试或回到仓库处理本地任务')),20000);})]);
        if(!current())return;
        this.draw(content);this.app.ensureProjectProgressPolling();this.app.updateStatusBar();
      }catch(error){if(current()){content.innerHTML=`<section class="workflow-page"><div class="workflow-state"><h3>无法汇总进度</h3><p role="alert">${this.e(error.message)}</p><button class="btn" data-portfolio-retry>重新读取</button></div></section>`;content.querySelector('button').onclick=()=>this.render(mode,true);}}
      finally{clearTimeout(timer);}
    }
    draw(content){
      const portfolio=this.portfolio||{},projects=portfolio.projects||[];
      const scope=root.WorkbenchPortfolioModel.scope(portfolio,{...this.filters,query:this.state.searchQuery||this.filters.query});
      const inspector=document.getElementById('workspace-inspector');
      if(inspector)inspector.innerHTML=`<header><small>全局协调</small><h3>同一任务，一处维护</h3><p>在项目内编辑原台账，全局视图汇总当前事实。</p></header><section><h4>统计范围</h4><p>${projects.length} 个已发现任务源；当前搜索范围 ${scope.counts.all} 项任务。</p><p>普通目录或没有台账的仓库不会自动生成任务。</p></section><section><h4>如何使用</h4><p>先查看阻塞与逾期，再选择可以推进的任务。进入项目后可以编辑，返回列表会恢复全局视角。</p><p>技术验证、交付与用户验收分别记录。</p></section>`;
      const queueButtons=Object.entries(QUEUES).map(([id,label])=>`<button class="portfolio-queue" aria-pressed="${id===this.filters.queue}" data-portfolio-queue="${id}"><span>${label}</span><b>${scope.counts[id]}</b></button>`).join('');
      content.innerHTML=`<section class="workflow-page portfolio-page"><header class="workflow-heading"><div><h2>${this.mode==='dashboard'?'全局总览':'全部项目任务'}</h2><p>跨项目查看优先事项，进入工作区继续处理。</p></div><div class="workflow-actions"><div class="workflow-mode-control" aria-label="全局显示方式"><button class="btn btn-small" data-portfolio-mode="dashboard" aria-pressed="${this.mode==='dashboard'}">总览</button><button class="btn btn-small" data-portfolio-mode="tasks" aria-pressed="${this.mode==='tasks'}">任务清单</button></div><button class="btn btn-small" data-portfolio-refresh>刷新</button></div></header>
        <div class="portfolio-filterbar"><label><span>项目范围</span><select data-portfolio-project aria-label="全局项目范围"><option value="all">全部项目 (${projects.length})</option>${projects.map(p=>`<option value="${this.e(p.projectId)}" ${p.projectId===this.filters.projectId?'selected':''}>${this.e(p.name)}</option>`).join('')}</select></label><input type="search" data-portfolio-search aria-label="搜索全局任务" placeholder="搜索任务、项目或负责人" value="${this.e(this.filters.query)}"></div>
        <div class="portfolio-queues" role="group" aria-label="按推进状态筛选">${queueButtons}</div>
        <div class="portfolio-source-note"><span>当前显示 ${scope.tasks.length} 项任务 · ${this.e(QUEUES[this.filters.queue])}</span><small title="数量按当前项目和搜索范围计算，只统计叶任务，不代表软件完成率。">${this.e(portfolio.refreshedAt?`更新于 ${new Date(portfolio.refreshedAt).toLocaleTimeString()}`:'来自项目原始台账')}</small></div>
        ${portfolio.error?`<p class="workflow-notice" role="alert">${this.e(portfolio.error)}</p>`:''}${(portfolio.warnings||[]).length?`<details class="workflow-help"><summary>${portfolio.warnings.length} 条数据源提醒</summary><p>不可读取的项目不按已完成处理。</p>${portfolio.warnings.map(w=>`<p>${this.e(w.message)}</p>`).join('')}</details>`:''}<div data-portfolio-body></div></section>`;
      const body=content.querySelector('[data-portfolio-body]');
      if(this.mode==='dashboard'){
        const selectedProjects=projects.filter(p=>this.filters.projectId==='all'||p.projectId===this.filters.projectId);
        body.innerHTML=`<div class="portfolio-project-grid">${selectedProjects.map(p=>{
          const all=scope.scoped.filter(t=>t.projectId===p.projectId),visible=scope.tasks.filter(t=>t.projectId===p.projectId);
          if(this.filters.query&&!all.length)return '';
          if(this.filters.queue!=='all'&&!visible.length&&!p.sourceError)return '';
          const next=visible.find(t=>t.taskId===p.nextTaskId)||visible.find(t=>root.WorkbenchPortfolioModel.qualifies(t,'next',portfolio.tasks||[]))||visible[0];
          return `<article class="workflow-card portfolio-project-card"><div class="workflow-card-heading"><h3>${this.e(p.name)}</h3><span class="workflow-count">${visible.length}</span></div><p class="portfolio-project-stats">${p.sourceError?this.e(p.sourceError):`未完成 ${all.filter(t=>!root.WorkbenchPortfolioModel.completed(t)&&!root.WorkbenchPortfolioModel.deferred(t)).length} · 已完成 ${all.filter(root.WorkbenchPortfolioModel.completed).length}`}</p>${next?`<div class="portfolio-next-task"><span class="workflow-eyebrow">${root.WorkbenchPortfolioModel.blocked(next,portfolio.tasks||[])?'需要处理':'接下来推进'}</span><strong>${this.e(next.title)}</strong><p>${this.e(next.nextAction||'尚未填写下一步')}</p></div>`:'<p class="workflow-quiet-state">当前队列没有任务。</p>'}<footer class="workflow-actions"><button class="btn btn-small" data-portfolio-list="${this.e(p.projectId)}">全部任务</button>${next?`<button class="btn btn-small" data-portfolio-task="${this.e(next.key)}">${root.WorkbenchPortfolioModel.blocked(next,portfolio.tasks||[])?'查看阻塞':'进入任务'} →</button>`:''}</footer></article>`;
        }).join('')||'<div class="workflow-state"><h3>当前范围没有项目任务</h3><p>尝试其他筛选，或在仓库工作区建立任务后刷新。</p></div>'}</div>`;
      }else{
        body.innerHTML=`<div class="workflow-split"><nav class="workflow-list" aria-label="跨项目任务">${scope.tasks.map(t=>`<button class="workflow-list-item" data-portfolio-select="${this.e(t.key)}"><span class="workflow-task-meta">${this.badge(t)}<small>${this.e(t.priority)}</small></span><strong>${this.e(t.title)}</strong><small>${this.e(t.projectName)}</small></button>`).join('')||'<p>没有符合当前条件的任务。</p>'}</nav><section class="workflow-reader" data-portfolio-detail></section></div>`;
        const selected=scope.tasks.find(t=>t.key===this.selectedKey)||scope.tasks[0];if(selected)this.detail(content,selected);else content.querySelector('[data-portfolio-detail]').innerHTML='<div class="workflow-state"><h3>没有符合条件的任务</h3><p>调整项目或推进状态，继续查看其他任务。</p></div>';
        content.querySelectorAll('[data-portfolio-select]').forEach(b=>b.onclick=()=>this.detail(content,scope.tasks.find(t=>t.key===b.dataset.portfolioSelect)));
      }
      content.querySelectorAll('[data-portfolio-mode]').forEach(b=>b.onclick=()=>this.enter(b.dataset.portfolioMode));
      content.querySelector('[data-portfolio-refresh]').onclick=()=>this.render(this.mode,true);
      content.querySelector('[data-portfolio-project]').onchange=event=>{this.filters.projectId=event.target.value;this.draw(content);};
      content.querySelector('[data-portfolio-search]').oninput=event=>{this.filters.query=event.target.value;this.state.searchQuery='';this.draw(content);const input=content.querySelector('[data-portfolio-search]');input.focus();};
      content.querySelectorAll('[data-portfolio-queue]').forEach(b=>b.onclick=()=>{this.filters.queue=b.dataset.portfolioQueue;this.draw(content);});
      content.querySelectorAll('[data-portfolio-list]').forEach(b=>b.onclick=()=>{this.filters.projectId=b.dataset.portfolioList;this.enter('tasks');});
      this.bindOpen(content);this.app.updateStatusBar();
    }
    detail(content,task){
      this.selectedKey=task.key;const panel=content.querySelector('[data-portfolio-detail]');
      content.querySelectorAll('[data-portfolio-select]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.portfolioSelect===task.key)));
      panel.innerHTML=`<header class="workflow-document-heading"><div><small>${this.e(task.projectName)} · ${this.e(task.taskId)}</small><h3>${this.e(task.title)}</h3></div>${this.badge(task)}</header><section class="portfolio-detail-section portfolio-next-action"><h4>下一步</h4><p>${this.e(task.nextAction||'尚未填写下一步')}</p><button class="btn btn-primary" data-portfolio-task="${this.e(task.key)}">进入项目处理任务 →</button></section><section class="portfolio-detail-section"><h4>阻塞与依赖</h4>${(task.blockers||[]).map(x=>`<p class="portfolio-blocker">${this.e(x)}</p>`).join('')}${(task.predecessors||[]).map(x=>`<p>${this.e(x.title)} · ${this.e(STATES[x.status]||x.status)}</p>`).join('')||'<p class="workflow-quiet-state">没有记录前置依赖。</p>'}</section><section class="portfolio-detail-section"><h4>验收标准</h4>${(task.acceptance||[]).length?`<ul class="portfolio-acceptance">${task.acceptance.map(x=>`<li>${this.e(typeof x==='string'?x:x.criterion)}</li>`).join('')}</ul>`:'<p class="workflow-quiet-state">尚未填写验收标准。</p>'}</section><details class="workflow-help portfolio-provenance"><summary>事实来源与更新时间</summary><p class="workflow-path">${this.e(task.source?.relativePath||task.source?.projectionPath||'未记录')}</p><p>${this.e(task.updatedAt||'未记录更新时间')}</p><p>在项目内编辑原台账，全局视图读取同一份事实。</p></details>`;
      this.bindOpen(panel);
    }
    bindOpen(content){content.querySelectorAll('[data-portfolio-task]').forEach(b=>b.onclick=()=>{
      const task=(this.portfolio.tasks||[]).find(t=>t.key===b.dataset.portfolioTask);if(!task)return;
      if(task.source?.kind==='repository-ledger')this.app.workspaceController.openRepository(task.projectRoot,'tasks',task.taskId);
      else {this.app.workspaceController.openRepository(task.projectRoot,'files');this.app._showStatusMessage('此任务来自旧连接器，请在原任务源维护；全局汇总保持只读。','info');}
    });}
  }
  root.WorkbenchPortfolioController={Controller};
})(window);
