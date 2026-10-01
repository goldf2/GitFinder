const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {WorkspaceRecordService}=require('../src/main/services/workspaceRecordService');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-records-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const service=new WorkspaceRecordService({fileService:{_assertProjectDirectory(value){if(value!==root)throw Error('非受管目录');return root;}}});
 const put=(relative,content)=>{const p=path.join(root,relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof content==='string'?content:JSON.stringify(content));return p;};
 return {root,service,put};
}
const book=()=>({schemaVersion:1,updatedAt:'2026-10-02T00:00:00Z',nextTaskId:'ONE',custom:{keep:true},tasks:[{id:'ONE',title:'First',status:'ready',owner:'Human',acceptance:['Works'],evidence:[],dependsOn:[],sourcePaths:['src/a.js'],userAcceptance:'pending'}]});
test('new document read does not seed directories, save and reread are lossless',t=>{
 const {root,service}=fixture(t);const doc=service.read(root,'docs/02-requirements/REQUIREMENTS.md');assert.equal(doc.exists,false);assert.equal(fs.existsSync(path.join(root,'docs')),false);
 const saved=service.write(root,doc.relative,'# 需求\n\n中文 <text>\n',null);assert.equal(service.read(root,doc.relative).content,saved.content);assert.ok(saved.revision);
});
test('stale revision rejects overwrite and preserves the external change',t=>{
 const {root,service,put}=fixture(t);put('README.md','# Before');const old=service.read(root,'README.md');put('README.md','# External');assert.throws(()=>service.write(root,'README.md','# Draft',old.revision),/其他程序/);assert.equal(service.read(root,'README.md').content,'# External');assert.equal(fs.readdirSync(root).length,1);
});
test('path boundary rejects traversal, links, hardlinks and generated/rule documents',t=>{
 const {root,service,put}=fixture(t);const p=put('README.md','safe');fs.symlinkSync(p,path.join(root,'linked.md'));fs.linkSync(p,path.join(root,'hard.md'));
 for(const relative of ['../private.md','/tmp/x.md','docs/../x.md','docs/.hidden.md','linked.md','hard.md','package.json','outside/x.md'])assert.throws(()=>service.read(root,relative));
 for(const relative of ['AGENTS.md','docs/00-handoff/PROGRESS.md'])assert.throws(()=>service.write(root,relative,'new',null));
 assert.throws(()=>service.documents('/tmp/unmanaged'),/非受管/);
});
test('documents expose meaningful headings and group development records and archives',t=>{
 const {root,service,put}=fixture(t);put('docs/03-design/architecture.md','# 系统架构\nText');put('docs/DEVELOPMENT_LOG.md','# Work');put('docs/ai-context/conversations/a.md','# 会话一');put('docs/00-handoff/CURRENT_STATE.md','# Current');
 const docs=service.documents(root).documents;assert.equal(docs.find(d=>d.relative.endsWith('architecture.md')).title,'系统架构');assert.equal(docs.find(d=>d.relative.endsWith('DEVELOPMENT_LOG.md')).category,'开发日志');assert.equal(docs.find(d=>d.relative.endsWith('/a.md')).category,'会话存档');assert.equal(docs[0].title,'当前状态');
});
test('tasks are local to the selected repository and readable without project metadata',t=>{
 const {root,service,put}=fixture(t);put('nested/management/development-tasks.json',book());assert.equal(service.tasks(root).exists,false);put('management/development-tasks.json',book());assert.equal(service.tasks(root).tasks.length,1);
});
test('task edits preserve unedited metadata and enforce revision conflicts',t=>{
 const {root,service,put}=fixture(t);const p=put('management/development-tasks.json',book());let data=service.tasks(root);
 const result=service.saveTask(root,{id:'ONE',revision:data.revision,values:{title:'Updated',status:'in_progress',acceptance:'Works\nStill works',nextAction:'Verify'}});
 const saved=JSON.parse(fs.readFileSync(p));assert.deepEqual(saved.custom,{keep:true});assert.deepEqual(saved.tasks[0].sourcePaths,['src/a.js']);assert.equal(saved.tasks[0].owner,'Human');assert.equal(result.tasks[0].acceptance.length,2);assert.throws(()=>service.saveTask(root,{id:'ONE',revision:data.revision,values:{title:'Old',status:'done'}}),/台账已更新/);
});
test('create first task yields a valid ledger consumable by existing adapter',t=>{
 const {root,service}=fixture(t);const result=service.saveTask(root,{revision:null,values:{title:'First new task',status:'planned',acceptance:'Verify'}});assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].userAcceptance,'pending');assert.equal(result.tasks[0].owner,'unassigned');assert.ok(result.exists);
});
test('invalid ledger and conflicting sources produce errors, never an empty healthy task list',t=>{
 for(const mutate of [b=>b.tasks=[null],b=>b.tasks.push(b.tasks[0]),b=>b.tasks[0].dependsOn=['NONE'],b=>b.schemaVersion=9,b=>b.tasks[0].status='unknown']){
  const {root,service,put}=fixture(t);const b=book();mutate(b);put('management/development-tasks.json',b);assert.throws(()=>service.tasks(root));
 }
 const {root,service,put}=fixture(t);put('management/development-tasks.json',book());put('docs/00-handoff/TASKS.json',book());assert.throws(()=>service.tasks(root),/多个任务台账/);
});
test('task dependency validation prevents invalid updates without altering the ledger',t=>{
 const {root,service,put}=fixture(t);const p=put('management/development-tasks.json',book()),before=fs.readFileSync(p,'utf8'),data=service.tasks(root);assert.throws(()=>service.saveTask(root,{id:'ONE',revision:data.revision,values:{title:'First',status:'ready',acceptance:'Works',dependsOn:'ONE'}}),/循环/);assert.equal(fs.readFileSync(p,'utf8'),before);
});
