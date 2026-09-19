const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RepositoryTaskLedgerService } = require('../src/main/services/repositoryTaskLedgerService');
const { ProjectTaskProjectionService } = require('../src/main/services/projectTaskProjectionService');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-ledger-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const configService={getTreeRoots:()=>[{path:root}],get:()=>undefined,getRepos:()=>({repos:[]})};
  const roots=[{path:root,realPath:fs.realpathSync(root)}];
  return {root,roots,configService,service:new RepositoryTaskLedgerService({now:()=>new Date('2026-09-16T08:00:00Z')})};
}
function write(root,relative,book){const p=path.join(root,relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(book));return p;}
const snake=()=>({schema_version:1,project:'store',revision:1,updated_at:'2026-09-16T07:00:00Z',current_next_task:'ADM-01',tasks:[
{id:'PLAN-01',title:'Plan',kind:'documentation',status:'done',priority:'P0',owner:'AI',milestone:'M0',depends_on:[],acceptance:['Docs reviewed'],evidence:[{path:'docs/report.md',kind:'verification',result:'passed'}],next_action:'Continue',implementation:'documentation_only',deployment:'not_applicable'},
{id:'ADM-01',title:'Roles',kind:'feature',status:'blocked',priority:'P0',owner:null,milestone:'M1',depends_on:['PLAN-01'],acceptance:['Real login'],evidence:[],blockers:['No authorized account'],next_action:'Prepare fixture',implementation:'not_started',deployment:'not_started'}]});
const camel=()=>({schemaVersion:1,updatedAt:'2026-09-16T07:00:00Z',nextTaskId:'GF-ONE',milestones:[{id:'M1',title:'Desktop'}],tasks:[
{id:'GF-ONE',title:'Delivered',status:'delivered',priority:'P1',owner:'AI',milestone:'M1',dependsOn:[],acceptance:['Installed'],evidence:['docs/install.md'],nextAction:'Wait for feedback',userAcceptance:'pending',delivery:{version:'1.0',sourceCommit:'a'.repeat(40)}},
{id:'GF-TWO',title:'Verified',status:'verified',priority:'P0',owner:'AI',milestone:'M1',dependsOn:['GF-ONE'],acceptance:['Build'],evidence:[],nextAction:'Install',userAcceptance:'not_required'}]});
test('both repository formats appear without LPM and preserve source semantics',async t=>{
 const f=fixture(t);const a=write(f.root,'store/docs/00-handoff/TASKS.json',snake());write(f.root,'desktop/management/development-tasks.json',camel());
 const before=fs.readFileSync(a);
 const result=await new ProjectTaskProjectionService({configService:f.configService}).getPortfolio({forceRefresh:true});
 assert.equal(result.success,true,result.error);assert.equal(result.projects.length,2);assert.equal(result.tasks.length,4);
 const planned=result.tasks.find(x=>x.taskId==='PLAN-01'),delivered=result.tasks.find(x=>x.taskId==='GF-ONE'),verified=result.tasks.find(x=>x.taskId==='GF-TWO');
 assert.equal(planned.completed,true);assert.equal(delivered.completed,true);assert.equal(delivered.userAcceptance,'pending');assert.notEqual(delivered.status,'已验收完成');assert.equal(verified.completed,false);
 assert.equal(planned.acceptancePassed,0);assert.equal(planned.source.kind,'repository-ledger');assert.equal(planned.source.writebackAllowed,false);assert.equal(planned.kind,'documentation');
 assert.equal(result.tasks.find(x=>x.taskId==='ADM-01').predecessors[0].taskId,'PLAN-01');
 assert.deepEqual(fs.readFileSync(a),before);assert.equal(fs.existsSync(path.join(f.root,'store/management/exports')),false);
});
test('force refresh reads changed source and does not retain removed tasks',async t=>{
 const f=fixture(t);const p=write(f.root,'store/docs/00-handoff/TASKS.json',snake());
 const service=new ProjectTaskProjectionService({configService:f.configService});await service.getPortfolio();
 const b=snake();b.tasks[1].title='New title';b.revision=2;fs.writeFileSync(p,JSON.stringify(b));
 const fresh=await service.getPortfolio({forceRefresh:true});assert.equal(fresh.tasks.find(x=>x.taskId==='ADM-01').title,'New title');
 fs.unlinkSync(p);const removed=await service.getPortfolio({forceRefresh:true});assert.equal(removed.tasks.length,0);
});
test('invalid, duplicate, unknown and cyclic tasks produce visible errors not false empty success',t=>{
 for(const mutate of [b=>b.tasks.push(b.tasks[0]),b=>b.tasks[1].depends_on=['MISSING'],b=>b.tasks[0].depends_on=['ADM-01'],b=>b.schema_version=99,b=>b.tasks[0].status='invented']){
  const f=fixture(t);const b=snake();mutate(b);write(f.root,'store/docs/00-handoff/TASKS.json',b);
  const r=f.service.readPortfolio(f.roots);assert.equal(r.tasks.length,0);assert.equal(r.projects.length,1);assert.ok(r.projects[0].sourceError);assert.ok(r.warnings.length);
 }
});
test('malformed JSON never leaks source contents and is not reinterpreted as no ledger',t=>{
 const f=fixture(t);const p=write(f.root,'store/docs/00-handoff/TASKS.json',snake());fs.writeFileSync(p,'secret-private-field {');
 const r=f.service.readPortfolio(f.roots);assert.ok(r.projects[0].sourceError);assert.doesNotMatch(JSON.stringify(r),/secret-private-field/);
});
test('two candidate ledgers are a conflict, not two copies or silent precedence',t=>{
 const f=fixture(t);write(f.root,'store/docs/00-handoff/TASKS.json',snake());write(f.root,'store/management/development-tasks.json',camel());
 const r=f.service.readPortfolio(f.roots);assert.equal(r.projects.length,1);assert.equal(r.tasks.length,0);assert.ok(r.warnings.some(x=>x.code==='ledger-conflict'));
});
test('same basename in distinct directories is never merged; overlapping roots deduplicate',t=>{
 const f=fixture(t);write(f.root,'a/store/docs/00-handoff/TASKS.json',snake());write(f.root,'b/store/docs/00-handoff/TASKS.json',snake());
 const r=f.service.readPortfolio([...f.roots,{path:path.join(f.root,'a'),realPath:path.join(f.root,'a')}]);assert.equal(r.projects.length,2);assert.equal(new Set(r.projects.map(x=>x.projectId)).size,2);
});
test('links outside the owning project and linked project directories are not followed',t=>{
 const f=fixture(t);const p=write(f.root,'other/docs/00-handoff/TASKS.json',snake());const root=path.join(f.root,'store');fs.mkdirSync(path.join(root,'docs/00-handoff'),{recursive:true});fs.symlinkSync(p,path.join(root,'docs/00-handoff/TASKS.json'));fs.symlinkSync(path.join(f.root,'other'),path.join(f.root,'linked'));
 const r=f.service.readPortfolio(f.roots);assert.equal(r.tasks.length,2);assert.ok(r.projects.find(x=>x.projectRoot===fs.realpathSync(root))?.sourceError);assert.equal(r.projects.some(x=>x.projectRoot.endsWith('/linked')),false);
});
test('oversized and evidence traversal are bounded without following references',t=>{
 const f=fixture(t);const b=snake();b.tasks[0].evidence=[{path:'../../private.txt',result:'passed'}];write(f.root,'store/docs/00-handoff/TASKS.json',b);
 assert.ok(f.service.readPortfolio(f.roots).projects[0].sourceError);
 const small=new RepositoryTaskLedgerService({maxBytes:10});assert.ok(small.readPortfolio(f.roots).projects[0].sourceError);
});
test('empty ledger is a valid existing source, not a prompt to seed control files',t=>{
 const f=fixture(t);const b=snake();b.tasks=[];b.current_next_task='';write(f.root,'store/docs/00-handoff/TASKS.json',b);
 const r=f.service.readPortfolio(f.roots);assert.equal(r.projects.length,1);assert.equal(r.tasks.length,0);assert.equal(r.projects[0].sourceError,'');assert.equal(r.projects[0].leafTaskCount,0);
});

test('canonical authority supersedes legacy exports even when the ledger is broken', async t => {
  const f=fixture(t), root=path.join(f.root,'store'), connector=path.join(f.root,'local-project-manager');
  const p=write(f.root,'store/docs/00-handoff/TASKS.json',snake());
  write(f.root,'store/management/exports/progress-summary.json',{schema_version:'1.1',project:{project_id:'OLD'},progress:{}});
  write(f.root,'store/cards/progress-overview/data/data.json',{project:[],tasks:[],meta:{}});
  fs.mkdirSync(path.join(connector,'portfolio'),{recursive:true});
  fs.writeFileSync(path.join(connector,'portfolio/projects.csv'),`project_id,path,enabled\nOLD,${root},true\n`);
  const service=new ProjectTaskProjectionService({configService:f.configService});
  const first=await service.getPortfolio({forceRefresh:true});
  assert.equal(first.projects.length,1);assert.equal(first.tasks.length,2);assert.ok(first.warnings.some(w=>w.code==='legacy-source-superseded'));
  fs.writeFileSync(p,'{broken');
  const broken=await service.getPortfolio({forceRefresh:true});
  assert.equal(broken.projects.length,1);assert.equal(broken.tasks.length,0);assert.ok(broken.projects[0].sourceError);
});

test('repository tasks cannot enter legacy create/update/status writeback', async t => {
  const f=fixture(t);write(f.root,'store/docs/00-handoff/TASKS.json',snake());
  const projected=await new ProjectTaskProjectionService({configService:f.configService}).getPortfolio({forceRefresh:true});
  projected.connector={name:'Local Project Manager',root:path.join(f.root,'connector')};
  const {ProjectTaskWritebackService}=require('../src/main/services/projectTaskWritebackService');
  let writes=0;
  const writer=new ProjectTaskWritebackService({configService:f.configService,projectionService:{getPortfolio:async()=>projected},runAuthority:()=>{writes++;}});
  await assert.rejects(writer.previewTaskCreate(projected.projects[0].projectId,{title:'New'}),/只读/);
  await assert.rejects(writer.previewStatusChange(projected.tasks[0].key,'未开始'),/来源不允许写回/);
  await assert.rejects(writer.previewTaskUpdate(projected.tasks[0].key,{owner:'X'}),/来源不允许写回/);
  assert.equal(writes,0);
});
