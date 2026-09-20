const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CoolifyProviderService, normalizeCoolifyResource, readCoolifyOverview } = require('../src/main/services/coolifyProviderService');
const Model = globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const Projection = require('../src/shared/panelTopologyProjection');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');
const base = 'https://coolify.example.invalid';
const resource = { uuid:'app-1', project_uuid:'project-1', environment_uuid:'env-1', name:'App', server_uuid:'server-1', fqdn:'https://app.example.invalid' };
const deployment = (url=base) => normalizeCoolifyResource(resource,'application',{baseUrl:url});
function graph() {
  return Projection.buildProjection({state:'ready',provider:{providerId:'one',label:'One',baseUrl:base},topology:{servers:[{nodeId:'server-1',providerId:'one',name:'Host',coolifyUrl:base+'/server/server-1'}],deployments:[{...deployment(),providerId:'one'}]},serverTree:true});
}
function controller() {
  const c=new Controller({bridge:{panel:{}},notify:()=>{}});
  c.store=Model.assertValidStore({schemaVersion:1,activeBoardId:'board_coolify01',entities:[],relationships:[],boards:[{id:'board_coolify01',name:'Test',viewport:{x:0,y:0,zoom:1},view:Model.defaultBoardView(),placements:[]}]});
  c.panelProjection=graph();return c;
}
test('部署来源包含详情URL和独立Project URL，网站地址不混用',()=>{
  const d=deployment();assert.equal(d.coolifyUrl,base+'/project/project-1/environment/env-1/application/app-1');
  assert.equal(d.coolifyProjectUrl,base+'/project/project-1');assert.equal(d.domains[0],'https://app.example.invalid');
});
test('身份不完整的部署不伪装为有详情入口，不回退首页',()=>{
  const d=normalizeCoolifyResource({uuid:'app-1'},'application',{baseUrl:base});
  assert.equal(d.coolifyUrl,'');assert.equal(d.coolifyProjectUrl,'');
});
test('应用、服务、数据库的管理页使用各自资源类型',()=>{
  for(const type of ['application','service','database'])assert.equal(normalizeCoolifyResource(resource,type,{baseUrl:base}).coolifyUrl,`${base}/project/project-1/environment/env-1/${type}/app-1`);
});
test('主机来源指向主机详情而不是Coolify首页',async()=>{
  const fetchImpl=async url=>{const data=new URL(url).pathname.endsWith('/servers')?[{uuid:'server-1',name:'Host'}]:[];return{ok:true,status:200,headers:{get:()=> 'application/json'},arrayBuffer:async()=>Buffer.from(JSON.stringify(data))};};
  const overview=await readCoolifyOverview({baseUrl:base,token:'fixture-token-for-isolated-test-only',fetchImpl});
  assert.equal(overview.servers[0].coolifyUrl,base+'/server/server-1');
});
test('Project分组保留管理入口，按provider分离同名同UUID项目',()=>{
  const g=graph();assert.equal(g.entities.find(e=>e.runtime?.dynamicKind==='coolify-project-group').runtime.coolifyUrl,base+'/project/project-1');
  const two=Projection.buildProjection({state:'ready',topology:{servers:[],deployments:[{...deployment(),providerId:'one'},{...deployment('https://two.example.invalid'),providerId:'two'}]},groupByProject:true});
  assert.deepEqual(two.entities.filter(e=>e.type==='group'&&e.runtime.projectUuid).map(e=>e.runtime.coolifyUrl).sort(),[base+'/project/project-1','https://two.example.invalid/project/project-1'].sort());
});
test('旧缓存重新激活重建受信管理路径，Project加入精确白名单',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gf-coolify-links-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const s=new CoolifyProviderService({configDirectory:dir});
  const snapshot={providers:[{providerId:'one',baseUrl:base}],topology:{servers:[{providerId:'one',nodeId:'server-1',coolifyUrl:base}],deployments:[{...deployment(),providerId:'one',coolifyUrl:base,coolifyProjectUrl:undefined}]}};
  s._activateTopology(snapshot);
  const panelRow = require('../src/shared/nativePanelModel').rows(snapshot)[0];
  assert.equal(s.resolveExternalUrl(panelRow.managementUrl), snapshot.topology.deployments[0].coolifyUrl);
  assert.equal(snapshot.topology.servers[0].coolifyUrl,base+'/server/server-1');
  assert.equal(s.resolveExternalUrl(base+'/project/project-1'),base+'/project/project-1');
  assert.throws(()=>s.resolveExternalUrl(base+'/project/other'));assert.throws(()=>s.resolveExternalUrl('https://untrusted.example.invalid'));
});
test('卡片点击经既有外链方法且不改变选择、历史或布局',async()=>{
  const c=controller(),e=c.panelProjection.entities.find(e=>e.type==='deployment');const opened=[];
  c.bridge.panel.openExternal=async url=>opened.push(url);
  c.selectedEntityId='keep';const before=JSON.stringify(c.store),count=c.undoStack.length;
  await c._handleFlowAction('open-coolify',e);
  assert.deepEqual(opened,[deployment().coolifyUrl]);assert.equal(c.selectedEntityId,'keep');assert.equal(c.undoStack.length,count);assert.equal(JSON.stringify(c.store),before);
});
test('无运行来源或伪造details/过期按钮不能绕过链接选择',async()=>{
  const c=controller(),opened=[],notices=[];c.bridge.panel.openExternal=async url=>opened.push(url);c.notify=msg=>notices.push(msg);
  await c._handleFlowAction('open-coolify',{id:'fake',type:'deployment',runtime:{coolifyUrl:base+'/project/fake'},details:{coolifyUrl:base}});
  assert.equal(opened.length,0);assert.ok(notices.length);
});
test('部署卡片和容器标题存在独立Coolify按钮而非仅在详情侧栏',()=>{
  const jsx=fs.readFileSync(path.join(__dirname,'../src/renderer/relationship-canvas/index.jsx'),'utf8');
  assert.match(jsx,/function CoolifyButton/);assert.ok((jsx.match(/<CoolifyButton/g)||[]).length>=2);
  assert.match(jsx,/data-coolify-entity/);assert.match(jsx,/action="open-coolify"/);
});

test('管理链接拒绝凭据、非网页协议、查询参数、路径穿越和占位身份',()=>{
  const L=require('../src/shared/coolifyManagementLinks');
  for(const base of ['javascript:alert(1)','file:///tmp/x','https://user:secret@cool.invalid','https://cool.invalid?token=secret','https://cool.invalid/#secret'])assert.equal(L.serverUrl(base,'valid-uuid'),'');
  for(const id of ['','..','a/b','a%2fb','project_unknown','environment_unknown'])assert.equal(L.projectUrl('https://cool.invalid',id),'');
  assert.equal(L.projectUrl('https://cool.invalid/subpath/','abc'),'https://cool.invalid/subpath/project/abc');
  assert.equal(L.entityUrl({type:'endpoint',runtime:{coolifyUrl:base+'/project/p'}}),'');
  assert.equal(L.entityUrl({type:'deployment',runtime:{coolifyUrl:base}}),'');
});
test('外链被拒绝时有明确提示，不伪造成功也不修改白板',async()=>{
  const c=controller(),e=c.panelProjection.entities.find(e=>e.type==='deployment'),notices=[];
  c.notify=message=>notices.push(message);c.bridge.panel.openExternal=async()=>{throw Error('not allowed')};
  const before=JSON.stringify(c.store);assert.equal(await c._handleFlowAction('open-coolify',e),false);
  assert.match(notices[0],/无法打开 Coolify/);assert.equal(JSON.stringify(c.store),before);
});
test('完整便携快照不写入管理地址，离线不会信任details中的链接',async()=>{
  const c=controller();const e=c.panelProjection.entities.find(e=>e.type==='deployment');
  c.store.entities.push(c._portableEntity(e));c.store.boards[0].placements.push({entityId:e.id,x:100,y:100});
  assert.doesNotMatch(JSON.stringify(c.store),/coolifyUrl|coolifyProjectUrl|coolifyManagementUrl/);
  c.panelProjection={entities:[],placements:[],relationships:[]};c.panelTopologyResult={state:'unconfigured'};let called=0;c.bridge.panel.openExternal=async()=>called++;
  assert.equal(await c._handleFlowAction('open-coolify',e),false);assert.equal(called,0);
});
test('运行来源与按钮捕获URL不同时重新解析当前实体，不能打开旧链接',async()=>{
  const c=controller(),e=c.panelProjection.entities.find(e=>e.type==='deployment');const old={...e,runtime:{...e.runtime}};
  const updated=base+'/project/project-2/environment/env-2/service/changed';e.runtime={...e.runtime,coolifyUrl:updated};
  const urls=[];c.bridge.panel.openExternal=async url=>urls.push(url);await c._handleFlowAction('open-coolify',old);assert.deepEqual(urls,[updated]);
});
test('同Project来源链接冲突时不选择任意地址',()=>{
  const d=deployment();const g=Projection.buildProjection({state:'ready',provider:{providerId:'one'},topology:{servers:[],deployments:[{...d,resourceUuid:'one'},{...d,resourceUuid:'two',coolifyProjectUrl:'https://other.invalid/project/project-1'}]},groupByProject:true});
  assert.equal(g.entities.find(e=>e.runtime?.dynamicKind==='coolify-project-group').runtime.coolifyUrl,'');
});
test('主页面及独立验证页面先装载管理链接辅助模块',()=>{
  const root=path.resolve(__dirname,'..');
  const files=[path.join(root,'src/renderer/index.html'),...fs.readdirSync(path.join(root,'scripts/visual-fixtures')).filter(f=>f.endsWith('.html')).map(f=>path.join(root,'scripts/visual-fixtures',f))];
  for(const file of files){const html=fs.readFileSync(file,'utf8');if(html.includes('panelTopologyProjection.js'))assert.ok(html.indexOf('coolifyManagementLinks.js')>=0&&html.indexOf('coolifyManagementLinks.js')<html.indexOf('panelTopologyProjection.js'),file);}
});
