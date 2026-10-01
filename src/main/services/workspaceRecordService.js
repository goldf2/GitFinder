const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fileService = require('./fileService');
const { LEDGER_PATHS, RepositoryTaskLedgerService } = require('./repositoryTaskLedgerService');
const LIMIT = 2 * 1024 * 1024;
const revision = text => crypto.createHash('sha256').update(text).digest('hex');
const statuses = ['planned','ready','todo','in_progress','blocked','verified','in_review','delivered','done','deferred'];
const labels = {'README.md':'项目简介','PROJECT_BRIEF.md':'项目简介','REQUIREMENTS.md':'项目需求','CURRENT_STATE.md':'当前状态','NEXT_ACTIONS.md':'下一步计划','DEVELOPMENT_PLAN.md':'开发计划','SESSION_LOG.md':'开发日志','RELEASE_LOG.md':'发布记录','DECISIONS.md':'决策记录','INDEX.md':'接续索引'};
class WorkspaceRecordService {
  constructor(options = {}) { this.files = options.fileService || fileService; }
  root(root) { return this.files._assertProjectDirectory(root); }
  resolve(root, relative, create = false) {
    root = this.root(root);
    if (typeof relative !== 'string' || relative.includes('\\') || relative.includes('\0') || path.isAbsolute(relative) || relative.split('/').some(p => !p || p === '..' || p === '.' || p.startsWith('.'))) throw Error('请选择项目内的普通文档');
    if (!/\.md$/i.test(relative) && !LEDGER_PATHS.includes(relative)) throw Error('此入口仅支持项目文档与任务台账');
    if (relative.includes('/') && !relative.startsWith('docs/') && !LEDGER_PATHS.includes(relative)) throw Error('文档应放在项目根目录或 docs 中');
    let target = root; const parts = relative.split('/');
    for (let i=0;i<parts.length;i++) {
      target = path.join(target,parts[i]);
      if (fs.existsSync(target) || (()=>{try{fs.lstatSync(target);return true;}catch{return false;}})()) {
        const stat=fs.lstatSync(target);
        if(stat.isSymbolicLink() || (i<parts.length-1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink>1)) throw Error('文档路径包含链接或非常规文件');
      } else if(i<parts.length-1) { if(create) fs.mkdirSync(target); /* Missing parents are a new document, without creating directories on read. */ }
    }
    return target;
  }
  read(root, relative) {
    const target=this.resolve(root,relative); const exists=fs.existsSync(target);
    if(exists && fs.statSync(target).size>LIMIT) throw Error('文档超过 2 MB，请在文件视图中查看');
    const content=exists?fs.readFileSync(target,'utf8'):'';
    return {relative,content,exists,revision:exists?revision(content):null,editable:!/^(AGENTS|PROGRESS)\.md$/i.test(path.basename(relative))};
  }
  write(root,relative,content,expectedRevision) {
    if(typeof content!=='string'||Buffer.byteLength(content)>LIMIT) throw Error('文档内容应小于 2 MB');
    if(/^(AGENTS|PROGRESS)\.md$/i.test(path.basename(relative))) throw Error('规则与生成的进度文档请通过对应维护入口更新');
    const target=this.resolve(root,relative,true);const before=this.read(root,relative);
    if(before.revision!==expectedRevision) throw Error('文件已被其他程序修改，请重新读取后合并；你的草稿仍保留');
    const temporary=`${target}.gitfinder-${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary,content,{flag:'wx',mode:fs.existsSync(target)?fs.statSync(target).mode&0o777:0o600});fs.renameSync(temporary,target); }
    finally { if(fs.existsSync(temporary))fs.unlinkSync(temporary); }
    return this.read(root,relative);
  }
  documents(root) {
    root=this.root(root);const queue=[{relative:'',depth:0},{relative:'docs',depth:0}],documents=[];let visited=0;
    while(queue.length && visited++<150 && documents.length<500) {
      const dir=queue.shift(); const full=path.join(root,dir.relative);
      try { if(fs.lstatSync(full).isSymbolicLink())continue;
        for(const item of fs.readdirSync(full,{withFileTypes:true})) {
          const relative=dir.relative?`${dir.relative}/${item.name}`:item.name;
          if(item.isDirectory() && dir.relative && dir.depth<3 && !item.name.startsWith('.') && item.name!=='node_modules')queue.push({relative,depth:dir.depth+1});
          if(!item.isFile() || !/\.md$/i.test(item.name) || documents.length>=500)continue;
          try {
            const target=this.resolve(root,relative);const buffer=Buffer.alloc(4096),fd=fs.openSync(target,'r');let text;
            try{text=buffer.subarray(0,fs.readSync(fd,buffer,0,buffer.length,0)).toString('utf8');}finally{fs.closeSync(fd);}
            const title=labels[item.name] || text.match(/^#\s+(.+)$/m)?.[1]?.trim() || item.name.replace(/\.md$/i,'');
            const category=relative.includes('/conversations/')?'会话存档':/RELEASE|CHANGELOG|TEST|QA[-_.]|验收|发布/i.test(item.name)||/docs\/04-validation\//.test(relative)?'验收与发布':/SESSION|DEVELOPMENT_LOG|DEBUG|DECISION|日志|决策/i.test(item.name)?'开发日志':/PLAN|NEXT_ACTION|REQUIREMENT|SOURCE|需求|规划/i.test(item.name)||/docs\/(01-discovery|02-requirements|03-design)\//.test(relative)?'需求与计划':/README|BRIEF|CURRENT_STATE|CONTEXT|INDEX/i.test(item.name)?'项目说明':'参考文档';
            documents.push({relative,title:title.slice(0,160),category,size:fs.statSync(target).size,editable:!/^(AGENTS|PROGRESS)\.md$/i.test(item.name)});
          } catch { /* Unreadable files remain accessible through the file browser. */ }
        }
      } catch { /* Optional documentation directories may not exist. */ }
    }
    const order=['项目说明','需求与计划','开发日志','验收与发布','参考文档','会话存档'];
    return {documents:documents.sort((a,b)=>order.indexOf(a.category)-order.indexOf(b.category)||(a.relative.endsWith('CURRENT_STATE.md')?-1:b.relative.endsWith('CURRENT_STATE.md')?1:0)||a.title.localeCompare(b.title,'zh-CN')),limited:queue.length>0||documents.length>=500};
  }
  tasks(root) {
    const present=LEDGER_PATHS.filter(relative=>{try{return this.read(root,relative).exists;}catch(error){if(error.message==='文档目录不存在')return false;throw error;}});
    if(present.length>1)throw Error('项目有多个任务台账，请先明确唯一台账');
    if(!present.length)return {relative:LEDGER_PATHS[0],revision:null,tasks:[],nextTaskId:'',exists:false,editable:true};
    const doc=this.read(root,present[0]);let book;try{book=JSON.parse(doc.content);}catch{throw Error('任务台账格式错误，请先修复 JSON 文件');}
    new RepositoryTaskLedgerService()._normalize(book, {projectId:'workspace',name:'workspace'}, this.root(root), {}, doc.revision);
    return {relative:present[0],revision:doc.revision,tasks:book.tasks,nextTaskId:book.nextTaskId||book.current_next_task||'',exists:true,editable:book.schemaVersion===1};
  }
  saveTask(root,request) {
    if(!request || typeof request!=='object')throw Error('无效的任务修改');
    const current=this.tasks(root);
    if(!current.editable)throw Error('此台账格式暂不支持表单编辑');
    if(current.revision!==request.revision)throw Error('任务台账已更新，请刷新列表后合并修改');
    const values=request.values||{};const title=String(values.title||'').trim();
    if(!title||title.length>500||!statuses.includes(values.status))throw Error('请填写任务标题并选择有效状态');
    const book=current.exists?JSON.parse(this.read(root,current.relative).content):{schemaVersion:1,tasks:[]};
    let task=book.tasks.find(t=>t.id===request.id);
    if(request.id&&!task)throw Error('该任务已不存在，请刷新');
    if(!task){task={id:`TASK-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,dependsOn:[],evidence:[],acceptance:[]};book.tasks.push(task);}
    for(const field of ['title','owner','nextAction','blocker','milestone','priority'])if(Object.hasOwn(values,field))task[field]=String(values[field]||'').slice(0,field==='title'?500:8000);
    task.title=title;
    if(!task.owner)task.owner='unassigned';
    if(!task.priority)task.priority='P1';
    if(!task.userAcceptance)task.userAcceptance='pending';
    for(const field of ['evidence','dependsOn','sourcePaths'])if(Object.hasOwn(values,field))task[field]=String(values[field]||'').split(/\r?\n/).map(t=>t.trim()).filter(Boolean).slice(0,100).map(value=>field==='evidence'?(task.evidence.find(item=>typeof item==='object'&&item?.path===value)||value):value);
    if(Object.hasOwn(values,'userAcceptance')){if(!['pending','confirmed','not_required'].includes(values.userAcceptance))throw Error('请选择有效的用户验收状态');task.userAcceptance=values.userAcceptance;}
    task.status=values.status;task.acceptance=String(values.acceptance||'').split(/\r?\n/).map(t=>t.trim()).filter(Boolean).slice(0,100);
    task.updatedAt=new Date().toISOString();book.updatedAt=task.updatedAt;
    new RepositoryTaskLedgerService()._normalize(book, {projectId:'workspace',name:'workspace'}, this.root(root), {}, '');
    this.write(root,current.relative,JSON.stringify(book,null,2)+'\n',current.revision);
    return {...this.tasks(root),selectedId:task.id};
  }
}
module.exports={WorkspaceRecordService,statuses};
