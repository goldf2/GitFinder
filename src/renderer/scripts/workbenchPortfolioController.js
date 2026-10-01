(function(root){
  const QUEUES={open:'待推进',next:'接下来可推进',blocked:'需要解除阻塞',review:'待验收 / 交付',overdue:'已经逾期',completed:'已完成 / 交付',deferred:'暂缓',all:'全部任务'};
  class Controller{
    constructor(app,state,bridge){this.app=app;this.state=state;this.bridge=bridge;this.filters={projectId:'all',queue:'open',query:''};this.selectedKey=null;this.request=0;}
    e(value){return this.app.escapeHtml(String(value??''));}
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
      if(!portfolio)content.innerHTML='<section class="workflow-page"><p role="status">正在汇总项目原始台账…</p></section>';
      let timer;
      try{
        this.portfolio=portfolio||await Promise.race([this.app.readProjectProgressPortfolio(forceRefresh),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('汇总读取超时，可重试或回到仓库处理本地任务')),20000);})]);
        if(!current())return;
        this.draw(content);this.app.ensureProjectProgressPolling();this.app.updateStatusBar();
      }catch(error){if(current()){content.innerHTML=`<section class="workflow-page"><h2>无法汇总进度</h2><p role="alert">${this.e(error.message)}</p><button class="btn" data-portfolio-retry>重试</button></section>`;content.querySelector('button').onclick=()=>this.render(mode,true);}}
      finally{clearTimeout(timer);}
    }
    draw(content){
      const portfolio=this.portfolio||{},projects=portfolio.projects||[];
      const scope=root.WorkbenchPortfolioModel.scope(portfolio,{...this.filters,query:this.state.searchQuery||this.filters.query});
      const inspector=document.getElementById('workspace-inspector');
      if(inspector)inspector.innerHTML=`<header><small>全局协调</small><h3>同一任务，一处维护</h3><p>在项目内编辑原台账，全局视图汇总当前事实。</p></header><section><h4>统计范围</h4><p>${projects.length} 个已发现任务源；当前搜索范围 ${scope.counts.all} 项任务。</p><p>普通目录或没有台账的仓库不会自动生成任务。</p></section><section><h4>如何使用</h4><p>先查看阻塞与逾期，再选择可以推进的任务。进入项目后可以编辑，返回列表会恢复全局视角。</p><p>技术验证、交付与用户验收分别记录。</p></section>`;
      const queueButtons=Object.entries(QUEUES).map(([id,label])=>`<button class="btn btn-small ${id===this.filters.queue?'btn-primary':''}" data-portfolio-queue="${id}">${label} ${scope.counts[id]}</button>`).join('');
      content.innerHTML=`<section class="workflow-page portfolio-page"><header class="workflow-heading"><div><h2>${this.mode==='dashboard'?'全局总览':'全部项目任务'}</h2><p>项目内负责执行，全局负责协调；两处读取同一台账。${this.e(portfolio.refreshedAt?`读取于 ${new Date(portfolio.refreshedAt).toLocaleTimeString()}`:'')}</p></div><div class="workflow-actions"><button class="btn" data-portfolio-mode="dashboard">总览</button><button class="btn" data-portfolio-mode="tasks">任务清单</button><button class="btn" data-portfolio-refresh>刷新</button></div></header><div class="workflow-actions"><label>项目范围 <select data-portfolio-project aria-label="全局项目范围"><option value="all">全部有台账的项目 (${projects.length})</option>${projects.map(p=>`<option value="${this.e(p.projectId)}" ${p.projectId===this.filters.projectId?'selected':''}>${this.e(p.name)}</option>`).join('')}</select></label><input type="search" data-portfolio-search aria-label="搜索全局任务" placeholder="搜索任务、项目或负责人" value="${this.e(this.filters.query)}"></div><div class="workflow-actions portfolio-queues">${queueButtons}</div><p class="workflow-notice">数量按当前项目和搜索范围计算，只统计叶任务；“待推进”不含已完成和暂缓，不代表软件完成率。</p>${portfolio.error?`<p role="alert">${this.e(portfolio.error)}</p>`:''}${(portfolio.warnings||[]).length?`<details class="workflow-help"><summary>${portfolio.warnings.length} 条数据源提醒（不可读取的项目不按已完成处理）</summary>${portfolio.warnings.map(w=>`<p>${this.e(w.message)}</p>`).join('')}</details>`:''}<div data-portfolio-body></div></section>`;
      const body=content.querySelector('[data-portfolio-body]');
      if(this.mode==='dashboard'){
        const selectedProjects=projects.filter(p=>this.filters.projectId==='all'||p.projectId===this.filters.projectId);
        body.innerHTML=`<div class="portfolio-project-grid">${selectedProjects.map(p=>{
          const all=scope.scoped.filter(t=>t.projectId===p.projectId),visible=scope.tasks.filter(t=>t.projectId===p.projectId);
          if(this.filters.query&&!all.length)return '';
          if(this.filters.queue!=='all'&&!visible.length&&!p.sourceError)return '';
          const next=visible.find(t=>t.taskId===p.nextTaskId)||visible.find(t=>root.WorkbenchPortfolioModel.qualifies(t,'next',portfolio.tasks||[]))||visible[0];
          return `<article class="workflow-card"><h3>${this.e(p.name)}</h3><p>${p.sourceError?this.e(p.sourceError):`未完成 ${all.filter(t=>!root.WorkbenchPortfolioModel.completed(t)&&!root.WorkbenchPortfolioModel.deferred(t)).length} · 已完成 ${all.filter(root.WorkbenchPortfolioModel.completed).length} · 当前队列 ${visible.length}`}</p><p class="workflow-notice">${this.e(p.source?.authority||'项目任务源')}</p>${next?`<strong>${this.e(next.title)}</strong><p>${this.e(next.nextAction||'尚未填写下一动作')}</p><button class="btn btn-primary" data-portfolio-task="${this.e(next.key)}">${root.WorkbenchPortfolioModel.blocked(next,portfolio.tasks||[])?'查看阻塞':'进入任务'}</button>`:'<p>当前队列没有任务。</p>'}<button class="btn" data-portfolio-list="${this.e(p.projectId)}">查看项目任务</button></article>`;
        }).join('')||'<p>当前范围没有项目台账。在仓库工作区建立任务后，再刷新这里。</p>'}</div>`;
      }else{
        body.innerHTML=`<div class="workflow-split"><nav class="workflow-list" aria-label="跨项目任务">${scope.tasks.map(t=>`<button class="workflow-list-item" data-portfolio-select="${this.e(t.key)}"><strong>${this.e(t.title)}</strong><small>${this.e(t.projectName)} · ${this.e(t.status)} · ${this.e(t.priority)}</small></button>`).join('')||'<p>没有符合当前条件的任务。</p>'}</nav><section class="workflow-reader" data-portfolio-detail></section></div>`;
        const selected=scope.tasks.find(t=>t.key===this.selectedKey)||scope.tasks[0];if(selected)this.detail(content,selected);
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
      panel.innerHTML=`<h3>${this.e(task.title)}</h3><p>${this.e(task.projectName)} · ${this.e(task.taskId)} · ${this.e(task.status)}</p><h4>下一步</h4><p>${this.e(task.nextAction||'未填写')}</p><h4>阻塞与依赖</h4>${(task.blockers||[]).map(x=>`<p>${this.e(x)}</p>`).join('')}${(task.predecessors||[]).map(x=>`<p>${this.e(x.title)} · ${this.e(x.status)}</p>`).join('')||'<p>没有记录前置依赖。</p>'}<h4>验收标准</h4>${(task.acceptance||[]).map(x=>`<p>· ${this.e(x.criterion)}</p>`).join('')||'<p>未填写</p>'}<h4>事实来源</h4><p class="workflow-path">${this.e(task.source?.relativePath||task.source?.projectionPath||'')}</p><p>更新时间：${this.e(task.updatedAt||'未记录')}</p><button class="btn btn-primary" data-portfolio-task="${this.e(task.key)}">进入项目处理这项任务</button>`;
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
