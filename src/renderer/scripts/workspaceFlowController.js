(function(root) {
  const STATES = {planned:'计划中',ready:'可开始',todo:'未开始',in_progress:'开发中',blocked:'受阻',verified:'已验证',in_review:'待验收',delivered:'已交付',done:'已完成',deferred:'暂缓'};
  const TEMPLATES = {
    sources:['资料登记','docs/01-discovery/SOURCES.md','# 资料登记\n\n## SRC-001\n\n标题：\n来源与时间：\n事实：\n假设：\n待确认：\n关联需求：\n访问限制：\n'],
    brief:['项目说明','docs/00-handoff/PROJECT_BRIEF.md','# 项目方案\n\n## 要解决的问题\n\n## 用户与使用场景\n\n## 目标与成功标准\n\n## 本期范围\n\n## 暂不包含\n\n## 技术方案与约束\n'],
    requirements:['需求说明','docs/02-requirements/REQUIREMENTS.md','# 需求说明\n\n## 使用流程\n\n## 功能需求\n\n## 验收标准\n\n## 未决问题\n'],
    plan:['方案与计划','docs/03-design/DEVELOPMENT_PLAN.md','# 开发计划\n\n## 阶段与里程碑\n\n## 实施步骤\n\n## 依赖与风险\n\n## 下一步\n'],
    test:['测试与验收','docs/04-validation/TEST_PLAN.md','# 测试与验收\n\n## 验收标准\n\n## 测试环境\n\n## 验证记录\n\n## 已知问题\n'],
    release:['交付清单','docs/05-delivery/RELEASE_CHECKLIST.md','# 交付清单\n\n## 版本与提交\n\n## 构建与测试证据\n\n## 发布环境与结果\n\n## 回退方案\n\n## 用户验收\n'],
    log:['开发日志','docs/00-handoff/SESSION_LOG.md','# 开发日志\n\n## '+new Date().toLocaleDateString('sv-SE')+'\n\n### 完成内容\n\n### 验证结果\n\n### 遗留问题与下一步\n']
  };
  class Controller {
    constructor(app,state,bridge) { this.app=app;this.state=state;this.bridge=bridge;this.api=bridge.workspaceRecords;this.drafts=new Map(); }
    e(value) { return this.app.escapeHtml(String(value??'')); }
    async call(promise) { let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('读取超时，请重试；其他页面仍可使用')),15000);})]);}finally{clearTimeout(timer);} }
    inspector(repo) {
      const panel=document.getElementById('workspace-inspector');if(!panel)return;
      const project=this.state.localProjects.find(p=>p.path===repo.path);const ids=this.state.tags.repoTags?.[repo.path]||[];
      const tags=(this.state.tags.tags||[]).filter(t=>ids.includes(t.id));
      panel.innerHTML=`<header><small>辅助资料</small><h3>${this.e(project?.name||repo.path.split(/[\\/]/).pop())}</h3><p>${this.e(project?.description||'尚未填写项目简介')}</p></header><section><h4>项目属性</h4><p>${this.e(({active:'开发中',planned:'已规划',paused:'已暂停',archived:'已归档',maintenance:'维护中'})[project?.lifecycle]||'未设置状态')}</p><button class="btn btn-small" data-flow-properties>编辑项目属性</button></section><section><h4>属性标签</h4><div class="workflow-tags">${tags.map(t=>`<span>${this.e(t.name)}</span>`).join('')||'<p>暂无标签</p>'}</div><button class="btn btn-small" data-flow-tags>管理标签与仓库</button></section><section><h4>本地位置</h4><p class="workflow-path">${this.e(repo.path)}</p><button class="btn btn-small" data-flow-finder>在访达中显示</button></section><section><h4>工作方式</h4><p>主区处理当前阶段，资料栏保留项目背景。计划、任务与记录保存在项目目录中。</p></section>`;
      panel.querySelector('[data-flow-properties]').onclick=()=>this.app.openLocalProjectDialog(repo.path);
      panel.querySelector('[data-flow-tags]').onclick=()=>this.app.workspaceToolsController.openRepository(repo.path);
      panel.querySelector('[data-flow-finder]').onclick=()=>this.bridge.fs.showInFinder(repo.path);
    }
    context(repo,title,notes,paths=[]) {
      const panel=document.getElementById('workspace-inspector');if(!panel)return;
      panel.querySelector('[data-flow-context]')?.remove();
      const section=document.createElement('section');section.dataset.flowContext='';
      section.innerHTML=`<h4>${this.e(title)}</h4>${notes.map(note=>`<p>${this.e(note)}</p>`).join('')}${paths.filter(p=>typeof p==='string').map(p=>`<button class="workflow-list-item" data-flow-context-path="${this.e(p)}">${this.e(p)}</button>`).join('')}`;
      panel.querySelector('header').after(section);
      section.querySelectorAll('[data-flow-context-path]').forEach(button=>button.onclick=()=>{
        const relative=button.dataset.flowContextPath;
        if(relative.startsWith('/')||relative.includes('\\')||relative.split('/').includes('..'))return;
        this.app.openQuickLook({path:`${repo.path}/${relative}`,name:relative.split('/').pop(),type:'file'});
      });
    }
    async render(container,repo,current) {
      this.repo=repo;this.inspector(repo);
      container.innerHTML='<section class="workflow-page"><p role="status">正在读取本地项目资料…</p></section>';
      try {
        if(repo.view==='tasks'){await this.tasks(container,repo,current,repo.focusTaskId);return;}
        if(repo.view==='chats'){await this.chats(container,repo,current);return;}
        const result=await this.call(this.api.list(repo.path));if(!current())return;
        if(repo.view==='project'){await this.overview(container,repo,result.documents,current);return;}
        let docs=result.documents.filter(d=>d.category!=='会话存档');
        const quality=d=>/TEST|QA[-_.]|验收|测试/i.test(d.relative);
        const views={planning:['项目规划','资料 → 需求 → 方案。保留已有文件的位置，创建前先检查同类文档。',['sources','brief','requirements','plan']],quality:['测试验收','对照验收标准记录测试结果和遗留问题。',['test']],release:['版本交付','核对版本、验证证据、发布结果和回退方案。',['release']],records:['维护记录','记录开发过程、决策和下一轮迭代。',['log']]};
        const [title,subtitle,templates]=views[repo.view]||views.records;
        if(repo.view==='planning')docs=docs.filter(d=>['项目说明','需求与计划'].includes(d.category));
        if(repo.view==='quality')docs=docs.filter(quality);
        if(repo.view==='release')docs=docs.filter(d=>/RELEASE|CHANGELOG|发布|交付/i.test(d.relative));
        this.documentList(container,repo,docs,{title,subtitle,templates,limited:result.limited},current);
        if(repo.view==='release')this.releaseLinks(container,repo,current);
      }catch(error){if(current())this.error(container,error);}
    }
    releaseLinks(container,repo,current) {
      const section=document.createElement('section');section.className='workflow-remote';
      section.innerHTML='<h3>远端构建与发布</h3><p>本地交付文档不代表已经发布。读取仓库关联后，可前往远端查看实际结果。</p><button class="btn btn-small" data-flow-remote>读取远端关联</button><div data-flow-remotes></div>';
      container.querySelector('.workflow-page').append(section);
      section.querySelector('button').onclick=async event=>{
        const button=event.target,output=section.querySelector('[data-flow-remotes]');button.disabled=true;output.textContent='正在读取本地 Git 远程配置…';
        try {
          const remotes=await this.call(this.bridge.git.getRemotes(repo.path));if(!current()||!section.isConnected)return;
          const repositories=[...new Set(remotes.map(remote=>{
            const match=(remote.fetchUrl||remote.pushUrl||'').match(/^(?:git@github\.com:|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/i);return match?.[1];
          }).filter(Boolean))];
          output.innerHTML=repositories.map(repository=>`<div class="workflow-actions"><span>${this.e(repository)}</span>${[['actions','构建结果'],['releases','发布版本']].map(([kind,label])=>`<button class="btn btn-small" data-flow-remote-url="https://github.com/${this.e(repository)}/${kind}">${label} ↗</button>`).join('')}</div>`).join('')||'<p>没有可识别的 GitHub 关联。可在代码页的仓库工具查看其他远程配置。</p>';
          output.querySelectorAll('[data-flow-remote-url]').forEach(b=>b.onclick=()=>this.bridge.panel.openExternal(b.dataset.flowRemoteUrl).catch(error=>this.app._showStatusMessage(error.message,'error')));
        }catch(error){if(current())output.textContent=error.message;}finally{button.disabled=false;}
      };
    }
    error(container,error) {container.innerHTML=`<section class="workflow-page"><h2>暂时无法读取</h2><p role="alert">${this.e(error.message)}</p><button class="btn" data-flow-retry>重新读取</button></section>`;container.querySelector('[data-flow-retry]').onclick=()=>this.app.renderContent();}
    documentList(container,repo,docs,options,current) {
      const groups=[...new Set(docs.map(d=>d.category))];
      container.innerHTML=`<section class="workflow-page"><header class="workflow-heading"><div><h2>${options.title}</h2><p>${options.subtitle}</p></div><div class="workflow-actions">${options.templates.map(key=>`<button class="btn btn-small" data-flow-template="${key}">＋ ${TEMPLATES[key][0]}</button>`).join('')}</div></header><div class="workflow-split"><nav class="workflow-list" aria-label="分类记录"><input type="search" data-flow-search placeholder="搜索标题或文件名" aria-label="搜索记录">${groups.map(group=>`<section><h3>${this.e(group)}</h3>${docs.filter(d=>d.category===group).map(d=>`<button class="workflow-list-item" data-flow-doc="${this.e(d.relative)}" title="${this.e(d.relative)}"><strong>${this.e(d.title)}</strong><small>${this.e(d.relative)}</small></button>`).join('')}</section>`).join('')||'<p class="workflow-empty">还没有此阶段的记录，可从上方创建。</p>'}${options.limited?'<p>记录较多，当前展示部分文档，其余可在文件视图查看。</p>':''}</nav><section class="workflow-reader" data-flow-reader aria-live="polite"><h3>开始记录</h3><p>选择左侧文档，或创建阶段文档。</p></section></div></section>`;
      container.querySelector('[data-flow-search]').oninput=event=>{const query=event.target.value.toLowerCase();container.querySelectorAll('[data-flow-doc]').forEach(button=>{button.hidden=!button.textContent.toLowerCase().includes(query);});};
      container.querySelectorAll('[data-flow-doc]').forEach(button=>button.onclick=()=>this.document(container,repo,button.dataset.flowDoc,current));
      container.querySelectorAll('[data-flow-template]').forEach(button=>button.onclick=()=>this.document(container,repo,this.templatePath(button.dataset.flowTemplate,docs),current,TEMPLATES[button.dataset.flowTemplate][2]));
      if(docs.length)void this.document(container,repo,docs[0].relative,current);
    }
    templatePath(key,docs) {
      const aliases={sources:['SOURCES.md'],brief:['PROJECT_BRIEF.md','CONTEXT.md'],requirements:['REQUIREMENTS.md'],plan:['DEVELOPMENT_PLAN.md'],test:['TEST_PLAN.md'],release:['RELEASE_CHECKLIST.md'],log:['SESSION_LOG.md','DEVELOPMENT_LOG.md']};
      for(const name of aliases[key]||[]) { const existing=docs.find(d=>d.relative.split('/').pop()===name);if(existing)return existing.relative; }
      return TEMPLATES[key][1];
    }
    draftKey(repo,relative){return `gitfinder-workspace-draft:${repo.path}:${relative}`;}
    async document(container,repo,relative,current,template='') {
      const panel=container.querySelector('[data-flow-reader]');if(!panel)return;
      const token=this.docToken=(this.docToken||0)+1;
      panel.innerHTML='<p role="status">正在读取文档…</p>';
      container.querySelectorAll('[data-flow-doc]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.flowDoc===relative)));
      try {
        const doc=await this.call(this.api.read(repo.path,relative));if(!current()||token!==this.docToken||!panel.isConnected)return;
        this.context(repo,'当前文档',[doc.editable?'本地文件，可编辑并保存':'规则或生成文件，仅供阅读',`来源：${relative}`]);
        const key=this.draftKey(repo,relative);let draft=this.drafts.get(key);
        if(!draft){try{draft=JSON.parse(localStorage.getItem(key)||'null');}catch{}}
        let content=draft?.content??(doc.exists?doc.content:template);let baseRevision=draft?draft.revision:doc.revision;
        panel.innerHTML=`<header class="workflow-document-heading"><div><h3>${this.e(content.match(/^#\s+(.+)$/m)?.[1]||relative.split('/').pop())}</h3><small>${this.e(relative)}</small></div><div class="workflow-actions"><button class="btn btn-small" data-flow-edit ${doc.editable?'':'disabled'}>编辑</button><button class="btn btn-small" data-flow-preview>预览</button></div></header><p class="workflow-notice" data-flow-doc-status role="status">${draft?'已恢复本机草稿，尚未写入项目文件':!doc.exists?'新文档，保存后写入项目目录':doc.editable?'':'此文件由规则或进度工具维护，仅供阅读'}</p><article class="markdown-preview" data-flow-preview-body></article><div data-flow-editor hidden><textarea aria-label="编辑项目文档" spellcheck="false"></textarea><div class="workflow-actions"><button class="btn btn-primary" data-flow-save>保存到项目</button><button class="btn" data-flow-discard>放弃草稿，重新读取</button></div></div>`;
        const editor=panel.querySelector('[data-flow-editor]'),textarea=panel.querySelector('textarea'),preview=panel.querySelector('[data-flow-preview-body]'),status=panel.querySelector('[data-flow-doc-status]');
        textarea.value=content;preview.innerHTML=this.app.renderMarkdown(content);
        const mode=edit=>{editor.hidden=!edit;preview.hidden=edit;panel.querySelector('[data-flow-edit]').setAttribute('aria-pressed',String(edit));if(edit)textarea.focus();};
        const retain=()=>{const value={content:textarea.value,revision:baseRevision};this.drafts.set(key,value);try{localStorage.setItem(key,JSON.stringify(value));status.textContent='草稿已保存在本机，尚未写入项目文件';}catch{status.textContent='草稿仅保留在当前窗口，请保存后退出';}};
        textarea.oninput=retain;
        panel.querySelector('[data-flow-edit]').onclick=()=>mode(true);
        panel.querySelector('[data-flow-preview]').onclick=()=>{preview.innerHTML=this.app.renderMarkdown(textarea.value);mode(false);};
        panel.querySelector('[data-flow-save]').onclick=async event=>{event.target.disabled=true;status.textContent='正在保存…';try{const saved=await this.api.save(repo.path,relative,textarea.value,baseRevision);baseRevision=saved.revision;this.drafts.delete(key);localStorage.removeItem(key);status.textContent='已保存到项目';preview.innerHTML=this.app.renderMarkdown(saved.content);mode(false);if(current()&&![...container.querySelectorAll('[data-flow-doc]')].some(b=>b.dataset.flowDoc===relative)){const nav=container.querySelector('.workflow-list'),b=document.createElement('button');b.className='workflow-list-item';b.dataset.flowDoc=relative;b.innerHTML=`<strong>${this.e(saved.content.match(/^#\s+(.+)$/m)?.[1]||relative.split('/').pop())}</strong><small>${this.e(relative)}</small>`;b.onclick=()=>this.document(container,repo,relative,current);nav.append(b);}}catch(error){status.textContent=error.message;}finally{event.target.disabled=false;}};
        panel.querySelector('[data-flow-discard]').onclick=()=>{if(!confirm('放弃本机未保存的草稿，并重新读取项目文件？'))return;this.drafts.delete(key);localStorage.removeItem(key);void this.document(container,repo,relative,current);};
        if(doc.editable&&(!doc.exists&&template||draft))mode(true);
      }catch(error){if(current()&&token===this.docToken&&panel.isConnected){panel.innerHTML=`<p role="alert">${this.e(error.message)}</p><button class="btn" data-flow-quicklook>在快速查看中打开</button>`;panel.querySelector('[data-flow-quicklook]').onclick=()=>this.app.openQuickLook({path:`${repo.path}/${relative}`,name:relative.split('/').pop(),type:'file'});}}
    }
    async tasks(container,repo,current,selectedId='') {
      const data=await this.call(this.api.tasks(repo.path));if(!current())return;container.scrollTop=0;
      const tasks=data.tasks;const counts={active:tasks.filter(t=>t.status==='in_progress').length,blocked:tasks.filter(t=>t.status==='blocked').length,done:tasks.filter(t=>['done','delivered'].includes(t.status)).length};
      container.innerHTML=`<section class="workflow-page"><header class="workflow-heading"><div><h2>开发任务</h2><p>选择任务查看目标、验收条件与下一步。状态由你维护，不按提交数量推断完成。</p></div><button class="btn btn-primary" data-flow-new-task ${data.editable?'':'disabled'}>＋ 新建任务</button></header><div class="workflow-metrics"><span>全部 <b>${tasks.length}</b></span><span>开发中 <b>${counts.active}</b></span><span>受阻 <b>${counts.blocked}</b></span><span>已交付 / 完成 <b>${counts.done}</b></span></div><div class="workflow-split"><nav class="workflow-list" aria-label="任务列表"><input type="search" data-flow-task-search placeholder="搜索任务" aria-label="搜索任务"><select data-flow-task-filter aria-label="任务状态"><option value="active">未完成</option><option value="all">全部任务</option>${Object.entries(STATES).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select><div data-flow-task-list></div></nav><section class="workflow-reader" data-flow-task-detail></section></div></section>`;
      const list=container.querySelector('[data-flow-task-list]'),filter=container.querySelector('[data-flow-task-filter]'),search=container.querySelector('[data-flow-task-search]');
      const renderList=()=>{const visible=tasks.filter(t=>(filter.value==='all'||filter.value==='active'&&!['done','delivered','deferred'].includes(t.status)||t.status===filter.value)&&`${t.id} ${t.title}`.toLowerCase().includes(search.value.toLowerCase()));list.innerHTML=visible.map(t=>`<button class="workflow-list-item" data-flow-task="${this.e(t.id)}"><strong>${this.e(t.title)}</strong><small>${this.e(STATES[t.status]||t.status)} · ${this.e(t.owner||'未分配')} · ${this.e(t.id)}</small></button>`).join('')||'<p class="workflow-empty">没有符合条件的任务，可切换“全部任务”或新建。</p>';list.querySelectorAll('[data-flow-task]').forEach(b=>b.onclick=()=>this.taskDetail(container,repo,data,tasks.find(t=>t.id===b.dataset.flowTask),current));};
      if(selectedId&&tasks.some(t=>t.id===selectedId&&['done','delivered','deferred'].includes(t.status)))filter.value='all';filter.onchange=renderList;search.oninput=renderList;renderList();
      container.querySelector('[data-flow-new-task]').onclick=()=>this.taskDetail(container,repo,data,null,current);
      const selected=tasks.find(t=>t.id===(selectedId||data.nextTaskId))||tasks.find(t=>!['done','delivered','deferred'].includes(t.status));
      if(selected)this.taskDetail(container,repo,data,selected,current);else container.querySelector('[data-flow-task-detail]').innerHTML='<h3>任务进度</h3><p>当前没有待推进任务。可以查看全部任务，或为下一轮迭代新建任务。</p>';
    }
    taskDetail(container,repo,data,task,current) {
      repo.focusTaskId=task?.id||'';
      const key=this.draftKey(repo,`task:${task?.id||'new'}`);let draft=this.drafts.get(key);if(!draft){try{draft=JSON.parse(localStorage.getItem(key)||'null');}catch{}}
      this.context(repo,'任务关联资料',[`任务：${task?.id||'待创建'}`,`来源：${data.relative}`],[...(task?.sourcePaths||[]),...(task?.evidence||[]).map(x=>typeof x==='string'?x:x.path)]);
      const originalId=task?.id;const originalRevision=draft?draft.revision:data.revision;
      if(draft)task={...task,...draft.values,id:originalId,acceptance:draft.values.acceptance.split('\n')};
      const panel=container.querySelector('[data-flow-task-detail]');const field=(name,label,value,area=false)=>`<label>${label}${area?`<textarea name="${name}" rows="3">${this.e(value)}</textarea>`:`<input name="${name}" value="${this.e(value)}">`}</label>`;
      panel.innerHTML=`<h3>${task?'任务详情':'新建任务'}</h3><p class="workflow-notice">${this.e(task?.id||'保存后生成任务编号')} · ${this.e(data.relative)}</p><form data-flow-task-form>${field('title','任务目标',task?.title||'')}<div class="workflow-form-row"><label>状态<select name="status">${Object.entries(STATES).map(([id,label])=>`<option value="${id}" ${id===(task?.status||'planned')?'selected':''}>${label}</option>`).join('')}</select></label>${field('owner','负责人',task?.owner||'')}</div>${field('nextAction','下一步',task?.nextAction||task?.next_action||'',true)}<details class="workflow-task-section" open><summary>验收与证据</summary>${field('acceptance','验收标准（每行一项）',(task?.acceptance||[]).join('\n'),true)}${field('evidence','证据路径（每行一项）',Array.isArray(task?.evidence)?task.evidence.map(x=>typeof x==='string'?x:x.path).join('\n'):task?.evidence||'',true)}<label>用户验收<select name="userAcceptance">${[['pending','待用户确认'],['confirmed','用户已明确确认'],['not_required','此任务不需要']].map(([id,label])=>`<option value="${id}" ${id===(task?.userAcceptance||'pending')?'selected':''}>${label}</option>`).join('')}</select></label></details><details class="workflow-task-section"><summary>计划与依赖</summary>${field('blocker','阻碍与风险',task?.blocker||'',true)}${field('milestone','里程碑',task?.milestone||'')}${field('priority','优先级',task?.priority||'P1')}${field('sourcePaths','关联需求 / 方案路径（每行一项）',Array.isArray(task?.sourcePaths)?task.sourcePaths.join('\n'):task?.sourcePaths||'',true)}${field('dependsOn','依赖任务编号（每行一项）',Array.isArray(task?.dependsOn)?task.dependsOn.join('\n'):task?.dependsOn||'',true)}</details><p role="status" data-flow-task-feedback></p><button type="submit" class="btn btn-primary" ${data.editable?'':'disabled'}>保存任务</button><button type="button" class="btn" data-flow-task-discard>放弃草稿</button></form>`;
      container.querySelectorAll('[data-flow-task]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.flowTask===task?.id)));
      const form=panel.querySelector('form'),feedback=panel.querySelector('[data-flow-task-feedback]');
      if(draft)feedback.textContent='已恢复未保存草稿；台账有变化时需要合并。';
      if(!data.editable){form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);feedback.textContent='此台账按兼容格式只读展示，请通过原维护工具编辑。';}
      form.oninput=()=>{const value={values:Object.fromEntries(new FormData(form)),revision:originalRevision};this.drafts.set(key,value);try{localStorage.setItem(key,JSON.stringify(value));feedback.textContent='任务草稿已保存在本机，尚未写入台账';}catch{feedback.textContent='草稿保留在当前窗口，请保存后退出';}};
      panel.querySelector('[data-flow-task-discard]').onclick=()=>{if(!confirm('放弃这项任务的未保存修改？'))return;this.drafts.delete(key);localStorage.removeItem(key);void this.tasks(container,repo,current,originalId);};
      panel.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{const values=Object.fromEntries(new FormData(event.target));const result=await this.api.saveTask(repo.path,{id:originalId,revision:originalRevision,values});this.drafts.delete(key);localStorage.removeItem(key);this.app.invalidateProjectProgress?.();if(current())await this.tasks(container,repo,current,result.selectedId);}catch(error){panel.querySelector('[data-flow-task-feedback]').textContent=error.message;}finally{button.disabled=false;}};
    }
    async chats(container,repo,current) {
      const result=await this.call(this.api.list(repo.path));if(!current())return;
      const docs=result.documents.filter(d=>d.category==='会话存档');const owner=this.state.localProjects.find(p=>p.path===repo.path);const chats=owner?this.app.projectConversationsController.conversations(owner.projectId):[];
      this.documentList(container,repo,docs,{title:'项目会话',subtitle:'左侧选择会话，右侧阅读摘要或本地存档；继续对话时再打开对应应用。',templates:[]},current);
      const nav=container.querySelector('.workflow-list');const section=document.createElement('section');section.innerHTML=`<h3>关联会话</h3>${chats.map((chat,i)=>`<button class="workflow-list-item" data-flow-chat="${i}"><strong>${this.e(chat.title)}</strong><small>${this.e(chat.source)} · ${chat.role==='primary'?'主会话':'关联会话'}</small></button>`).join('')||'<p>暂无关联会话</p>'}${owner?`<button class="btn btn-small" data-chat-action="edit" data-chat-project="${this.e(owner.projectId)}">关联 / 编辑会话</button>`:''}`;nav.prepend(section);
      section.querySelectorAll('[data-flow-chat]').forEach(button=>button.onclick=async()=>{const chat=chats[Number(button.dataset.flowChat)];const doc=docs.find(d=>chat.threadId&&d.relative.includes(chat.threadId));section.querySelectorAll('[data-flow-chat]').forEach(b=>b.setAttribute('aria-current',String(b===button)));if(doc){await this.document(container,repo,doc.relative,current);if(current()){const action=document.createElement('button');action.className='btn btn-small';action.textContent=`在 ${chat.source==='codex'?'Codex':'ChatGPT'} 中继续 ↗`;Object.assign(action.dataset,{chatAction:'open',chatProject:owner.projectId,chatSource:chat.source,chatThread:chat.threadId});container.querySelector('.workflow-document-heading .workflow-actions')?.append(action);}return;}this.docToken=(this.docToken||0)+1;container.querySelector('[data-flow-reader]').innerHTML=`<h3>${this.e(chat.title)}</h3><p>${this.e(chat.summary||'暂无保存的摘要或本地正文。')}</p><button class="btn" data-chat-action="open" data-chat-project="${this.e(owner.projectId)}" data-chat-source="${this.e(chat.source)}" data-chat-thread="${this.e(chat.threadId)}">在 ${chat.source==='codex'?'Codex':'ChatGPT'} 中继续 ↗</button>`;});
    }
    async overview(container,repo,docs,current) {
      const [taskResult,statusResult]=await Promise.allSettled([this.call(this.api.tasks(repo.path)),this.call(this.bridge.git.getStatus(repo.path,{autoFetch:false}))]);if(!current())return;
      const tasks=taskResult.status==='fulfilled'?taskResult.value.tasks:[];const next=tasks.find(t=>t.id===taskResult.value?.nextTaskId)||tasks.find(t=>t.status==='in_progress')||tasks.find(t=>['ready','planned','todo'].includes(t.status));
      const project=this.state.localProjects.find(p=>p.path===repo.path);const status=statusResult.value;
      const stages=[['planning','1 · 项目规划','方案、需求、范围与里程碑'],['tasks','2 · 开发执行',`${tasks.filter(t=>t.status==='in_progress').length} 项进行中`],['quality','3 · 测试验收',`${tasks.filter(t=>['verified','in_review'].includes(t.status)).length} 项待交付或验收`],['release','4 · 版本交付','发布记录、构建证据与回退方案'],['records','5 · 维护迭代','日志、决策和下一轮改进']];
      container.innerHTML=`<section class="workflow-page"><header class="workflow-heading"><div><h2>${this.e(project?.name||repo.path.split(/[\\/]/).pop())}</h2><p>${this.e(project?.description||'从项目方案开始，逐步推进开发、验收与交付。')}</p></div></header><details class="workflow-help"><summary>第一次使用：如何推进一个开发任务</summary><ol><li>在“资料与规划”记录资料来源、目标、需求与验收标准。</li><li>安排开发任务，填写负责人、依赖和下一动作。</li><li>开发时使用代码、文件与会话；记录实际改动。</li><li>在测试验收中留下结果，版本交付中记录实际交付环境。</li><li>结束前更新任务和维护日志。没有完成也可以如实交接。</li></ol><p>已有文档直接读取；创建模板时优先打开已有同名文档。任务与文档分别保存在当前仓库，不生成第二套进度。</p></details><div class="workflow-stages">${stages.map(([id,title,note])=>`<button data-flow-view="${id}"><strong>${title}</strong><span>${note}</span></button>`).join('')}</div><div class="workflow-overview-grid"><section class="workflow-card"><h3>下一步</h3>${next?`<strong>${this.e(next.title)}</strong><p>${this.e(next.nextAction||next.next_action||'尚未填写下一步')}</p><button class="btn" data-flow-view="tasks">推进任务</button>`:'<p>尚未安排下一项任务。</p><button class="btn" data-flow-view="tasks">安排开发任务</button>'}${taskResult.status==='rejected'?`<p role="alert">${this.e(taskResult.reason.message)}</p>`:''}</section><section class="workflow-card"><h3>代码与交付</h3>${statusResult.status==='rejected'?`<p role="alert">${this.e(statusResult.reason.message)}</p>`:''}<p>${this.e(status?.branch||'尚无分支')} · ${status?.isGitRepo?'Git 仓库':'普通项目目录'}</p><p>提交、验证和发布分别记录，提交成功不等于交付完成。</p><div class="workflow-actions"><button class="btn" data-flow-view="git">查看代码</button><button class="btn" data-flow-view="release">核对交付</button></div></section><section class="workflow-card"><h3>项目资料</h3>${docs.filter(d=>['项目说明','需求与计划'].includes(d.category)).slice(0,5).map(d=>`<p>${this.e(d.title)}</p>`).join('')||'<p>尚未建立项目方案与需求资料。</p>'}<button class="btn" data-flow-view="planning">阅读与编辑方案</button></section><section class="workflow-card"><h3>需要关注</h3>${tasks.filter(t=>t.status==='blocked').slice(0,4).map(t=>`<p><strong>${this.e(t.title)}</strong><br>${this.e(t.blocker||'待补充阻碍原因')}</p>`).join('')||(taskResult.status==='rejected'?'<p>任务读取失败，暂时无法判断阻塞情况。</p>':'<p>任务台账中没有标记为受阻的任务。</p>')}<button class="btn" data-flow-view="chats">查看项目会话</button></section></div></section>`;
      container.querySelectorAll('[data-flow-view]').forEach(button=>button.onclick=()=>{repo.view=button.dataset.flowView;this.app.renderContent();});
    }
  }
  root.WorkspaceFlowController={Controller};
})(window);
