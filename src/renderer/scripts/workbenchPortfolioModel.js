(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.WorkbenchPortfolioModel=api;})(typeof window!=='undefined'?window:globalThis,function(){
  const completed=t=>t.completed===true||['delivered','done'].includes(t.sourceStatus);
  const deferred=t=>t.sourceStatus==='deferred'||t.status==='暂缓';
  function blocked(t,tasks){return t.sourceStatus==='blocked'||t.status==='阻塞'||(t.blockers||[]).length>0||(t.predecessors||[]).some(p=>{const predecessor=tasks.find(x=>x.key===p.taskKey);return !predecessor||!completed(predecessor);});}
  function qualifies(t,queue,tasks){
    if(queue==='all')return true;
    if(queue==='completed')return completed(t);
    if(queue==='deferred')return deferred(t);
    if(completed(t)||deferred(t))return false;
    if(queue==='blocked')return blocked(t,tasks);
    if(queue==='review')return ['verified','in_review'].includes(t.sourceStatus)||/待人工验收|待验收/.test(t.status);
    if(queue==='overdue')return t.overdue===true;
    if(queue==='next')return !blocked(t,tasks)&&(['ready','in_progress','todo'].includes(t.sourceStatus)||['开发中','进行中','可开始','未开始'].includes(t.status));
    return true;
  }
  function scope(portfolio,filters={}){
    const tasks=(portfolio.tasks||[]).filter(t=>t.isLeaf!==false);
    const query=String(filters.query||'').toLowerCase().trim();
    const scoped=tasks.filter(t=>(!filters.projectId||filters.projectId==='all'||t.projectId===filters.projectId)&&(!query||[t.title,t.taskId,t.projectName,t.owner,t.nextAction].join(' ').toLowerCase().includes(query)));
    const counts=Object.fromEntries(['all','open','next','blocked','review','overdue','completed','deferred'].map(q=>[q,scoped.filter(t=>qualifies(t,q,tasks)).length]));
    const selected=scoped.filter(t=>qualifies(t,filters.queue||'open',tasks));
    selected.sort((a,b)=>Number(Boolean(b.overdue))-Number(Boolean(a.overdue))||String(a.priority||'P9').localeCompare(String(b.priority||'P9'))||a.projectName.localeCompare(b.projectName)||a.taskId.localeCompare(b.taskId));
    return {tasks:selected,scoped,counts};
  }
  return {completed,deferred,blocked,qualifies,scope};
});
