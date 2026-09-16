const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Model = globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const Projection = require('../src/shared/panelTopologyProjection');
const Adapter = require('../src/shared/relationshipFlowAdapter');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');
const View = require('../src/renderer/scripts/relationshipBoardResourceView');

function topology() {
  return { state: 'ready', provider: { providerId: 'fixture', label: 'Fixture' }, topology: {
    generatedAt: '2026-09-17T00:00:00Z',
    servers: ['a', 'b', 'empty'].map(nodeId => ({ nodeId, name: nodeId, providerId: 'fixture' })),
    deployments: [
      { resourceUuid: 'app-a', name: 'App A', nodeId: 'a', projectUuid: 'same-project', projectName: 'Shared Project', domains: ['https://a.example.invalid', 'https://shared.example.invalid'] },
      { resourceUuid: 'app-b', name: 'App B', nodeId: 'b', projectUuid: 'same-project', projectName: 'Shared Project', domains: ['https://b.example.invalid', 'https://shared.example.invalid'] }
    ].map(item => ({ ...item, providerId: 'fixture', status: 'running' }))
  } };
}
function fixture(document = false) {
  const c = new Controller({ bridge: {}, notify() {} });
  c.store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: 'board_resource01', entities: [], relationships: [], boards: [{ id: 'board_resource01', name: 'Blank', view: { ...Model.defaultBoardView(), structure: 'coolify-projects', layout: 'free' }, viewport: { x: 0, y: 0, zoom: 1 }, placements: [] }] });
  c.localWorkspaceMode = !document;
  if (document) c.documentRecord = { id: 'document_fixture', revision: 1 };
  c.panelTopologyResult = topology();
  c.panelProjection = Projection.buildProjection({ ...c.panelTopologyResult, groupByProject: true });
  c._persistSoon = c._persistDynamicLayoutsSoon = c._renderGraph = c._renderResources = c._refreshHistoryButtons = c._updateSummary = c.render = () => {};
  c._focusEntityOnBoard = () => true;
  return c;
}
function source(c, type, name) {
  const e = c.panelProjection.entities.find(e => e.type === type && (e.runtime?.nodeId === name || e.name === name));
  assert.ok(e, `missing fixture ${type}/${name}`);
  return { key: `entity:${e.id}`, kind: e.type, entityId: e.id, name: e.name, sourceEntity: e, transient: true };
}
const board = c => c.store.boards[0];
const ids = c => new Set(board(c).placements.map(p => p.entityId));
const counts = c => Object.fromEntries(['server','group','deployment','endpoint'].map(type => [type,c.store.entities.filter(e => e.type===type&&ids(c).has(e.id)).length]));
const flow = c => Adapter.toFlowModel(c._flowGraphInput(c._filteredGraph(), []), { hostContainers: true, layout: 'free', showRelationshipLines: false });

test('新本机白板添加主机包含本机Project/部署/端点，不带入同Project另一主机', () => {
  const c = fixture(); c._addResource(source(c,'server','a'), { x: 200, y: 240 });
  assert.deepEqual(counts(c), { server:1, group:1, deployment:1, endpoint:2 });
  assert.ok(c.store.relationships.some(r => r.type==='runs_on'));
  assert.equal(c.store.relationships.filter(r => r.type==='exposes').length,2);
  assert.equal(c.store.entities.some(e => e.name==='App B'),false);
  assert.equal(board(c).view.structure,'coolify-projects');
  assert.ok(flow(c).nodes.some(n=>n.type==='hostBubble'));
  assert.equal(flow(c).nodes.some(n=>n.type==='relationshipCard'&&n.data.entity.type==='server'),false);
});

test('独立白板与本机白板走相同组合添加入口', () => {
  const c = fixture(true); c._addResource(source(c,'server','a'));
  assert.deepEqual(counts(c), { server:1, group:1, deployment:1, endpoint:2 });
  assert.ok(flow(c).nodes.some(n=>n.type==='hostBubble'));
});

test('重复添加不新增、不中断位置/备注/锁定，单次撤销撤回整个组合', () => {
  const c=fixture(true), before=JSON.stringify(c.store), resource=source(c,'server','a');
  c._addResource(resource); const snapshot=JSON.stringify(c.store), undoCount=c.undoStack.length;
  c._addResource(resource,{x:99999,y:99999}); assert.equal(JSON.stringify(c.store),snapshot); assert.equal(c.undoStack.length,undoCount);
  c.undo(); assert.equal(JSON.stringify(c.store),before);
});

test('旧主机卡片可补全而不复制主机，不动旧备注和手动位置', () => {
  const c=fixture(true), r=source(c,'server','a');
  c.store.entities.push(c._portableEntity(r.sourceEntity));
  board(c).placements.push({entityId:r.entityId,x:520,y:480,note:'keep',locked:true});
  c._addResource(r); assert.deepEqual(counts(c),{server:1,group:1,deployment:1,endpoint:2});
  assert.deepEqual(board(c).placements.find(p=>p.entityId===r.entityId),{entityId:r.entityId,x:520,y:480,note:'keep',locked:true});
});

test('保存序列化去除runtime后，离线保留Project容器和主机层级', () => {
  const c=fixture(true); c._addResource(source(c,'server','a'));
  const saved=Model.assertValidStore(c.store,{strict:true});
  c.store=JSON.parse(JSON.stringify(saved));c.panelProjection={entities:[],relationships:[],placements:[]};c.panelTopologyResult={state:'unconfigured'};
  const model=flow(c), host=model.nodes.find(n=>n.type==='hostBubble'), group=model.nodes.find(n=>n.type==='relationshipGroup');
  assert.ok(host);assert.ok(group?.data.isProjectContainer);assert.equal(group.parentId,host.id);
  assert.equal(model.nodes.filter(n=>n.data.entity.type==='deployment').length,1);
});

test('空主机也显示容器，移动后位置可持久化和重开', () => {
  const c=fixture(true);c._addResource(source(c,'server','empty'),{x:300,y:320});
  let model=flow(c);const h=model.nodes.find(n=>n.type==='hostBubble');assert.ok(h);
  const old=structuredClone(board(c).placements);
  h.position.x+=150;h.position.y+=90;
  model.nodes=Adapter.refreshHostBubbles(model.nodes);
  const saved=Adapter.toPlacements(model.nodes,old);
  assert.equal(saved[0].x,old[0].x+150);assert.equal(saved[0].y,old[0].y+90);
  board(c).placements=saved;const reopened=flow(c).nodes.find(n=>n.type==='hostBubble');
  assert.equal(reopened.position.x,h.position.x);assert.equal(reopened.position.y,h.position.y);
});

test('主机独立于全局结构显示为容器，不隐藏已有本地项目或仓库', () => {
  const graph={entities:[{id:'entity_hostabcd',type:'server',name:'Host'},{id:'entity_repoabcd',type:'repository',name:'Repo',refId:'repository_abc'}],placements:[{entityId:'entity_hostabcd',x:100,y:100},{entityId:'entity_repoabcd',x:800,y:400}],relationships:[]};
  const model=Adapter.toFlowModel(graph,{hostContainers:true});
  assert.ok(model.nodes.some(n=>n.type==='hostBubble'));assert.ok(model.nodes.some(n=>n.id==='entity_repoabcd'));
  assert.deepEqual(graph.placements,[{entityId:'entity_hostabcd',x:100,y:100},{entityId:'entity_repoabcd',x:800,y:400}]);
});

test('添加部署同时保存访问点和真实关系，单独端点不扩散到其它部署', () => {
  const c=fixture(true);c._addResource(source(c,'deployment','App A'));
  assert.deepEqual(counts(c),{server:0,group:0,deployment:1,endpoint:2});
  assert.equal(board(c).placements.some(p=>p.groupId),false);
  const one=fixture(true);one._addResource(source(one,'endpoint','a.example.invalid'));
  assert.deepEqual(counts(one),{server:0,group:0,deployment:0,endpoint:1});
});

test('先加部署再加主机时补齐父容器和关系，保留用户位移和备注', () => {
  const c=fixture(true);c._addResource(source(c,'deployment','App A'));
  const p=board(c).placements.find(p=>c.store.entities.find(e=>e.id===p.entityId)?.type==='deployment');p.x=777;p.y=888;p.note='annotation';
  c._addResource(source(c,'server','a'));
  assert.deepEqual(counts(c),{server:1,group:1,deployment:1,endpoint:2});
  const next=board(c).placements.find(i=>i.entityId===p.entityId);
  assert.equal(next.x,777);assert.equal(next.y,888);assert.equal(next.note,'annotation');assert.ok(next.groupId);
});

test('同Project跨主机分开容器，共享端点保持一个实体', () => {
  const c=fixture(true);c._addResource(source(c,'server','a'));c._addResource(source(c,'server','b'));
  assert.deepEqual(counts(c),{server:2,group:2,deployment:2,endpoint:3});
  const deploymentParents=board(c).placements.filter(p=>c.store.entities.find(e=>e.id===p.entityId)?.type==='deployment').map(p=>p.groupId);
  assert.equal(new Set(deploymentParents).size,2);
  assert.equal(new Set(c.store.relationships.map(r=>`${r.type}:${r.sourceId}:${r.targetId}`)).size,c.store.relationships.length);
});

test('云Project入口添加真实容器而非虚构本地项目卡片', () => {
  const c=fixture(true);const resource=c._resourceCatalog().find(r=>r.sourceEntity?.runtime?.dynamicKind==='panel-project');assert.ok(resource);
  c._addResource(resource);
  assert.deepEqual(counts(c),{server:0,group:2,deployment:2,endpoint:3});
  assert.equal(c.store.entities.some(e=>e.type==='project'),false);
});

test('资源库实时主机、部署、端点可以拖动，已放置容器有显式补全入口', () => {
  const items=['server','deployment','endpoint'].map(kind=>({key:kind,kind,category:kind,name:kind,transient:true,placed:false,composable:true}));
  const html=View.render({items,escapeHtml:x=>String(x),typeIcons:{},panelMoveControls:()=>'',collapsed:new Set()});
  for(const kind of ['server','deployment','endpoint'])assert.match(html,new RegExp(`draggable="true"[^>]*data-resource-key="${kind}"`));
  items[0].placed=true;const placed=View.render({items,escapeHtml:x=>String(x),typeIcons:{},panelMoveControls:()=>'',collapsed:new Set()});
  assert.match(placed,/data-add-resource="server"/);assert.match(placed,/补全/);
});

test('容量失败是原子操作，不留下半个主机及悬空关系', () => {
  const c=fixture(true);const r=source(c,'server','a');
  c.store.entities=Array.from({length:Model.MAX_ENTITIES-1},(_,i)=>({id:`entity_limit_${String(i).padStart(8,'0')}`,type:'text',name:'Text',details:{}}));
  const before=JSON.stringify(c.store);c._addResource(r);assert.equal(JSON.stringify(c.store),before);
});

test('资源库同一云Project在主机下展开和添加都只包含该主机', () => {
  const c=fixture(true), host=source(c,'server','a');
  c.expandedResourceKeys.add(host.key);
  const child=c._resourceCatalog().find(r=>r.key===host.key).children[0];
  assert.equal(child.scopeHostId,host.entityId);
  c.expandedResourceKeys.add(child.key);
  const expanded=c._resourceCatalog().find(r=>r.key===host.key).children[0];
  assert.equal(expanded.children.length,1);assert.equal(expanded.children[0].name,'App A');
  c._addResource(expanded);
  assert.deepEqual(counts(c),{server:0,group:1,deployment:1,endpoint:2});
  const placed=c._resourceCatalog().find(r=>r.key===host.key).children[0];
  assert.equal(placed.placed,true);assert.ok(placed.compositionRootId);
});

test('不同Coolify来源复用相同Project UUID不会合并或漏掉资源库条目', () => {
  const c=fixture(true);c.panelTopologyResult.topology.servers.push({nodeId:'a',name:'Other',providerId:'other'});
  c.panelTopologyResult.topology.deployments.push({resourceUuid:'app-a',name:'Other app',nodeId:'a',providerId:'other',projectUuid:'same-project',projectName:'Shared Project',domains:[]});
  c.panelProjection=Projection.buildProjection({...c.panelTopologyResult,groupByProject:true});
  const projects=c._resourceCatalog().filter(r=>r.sourceEntity?.runtime?.dynamicKind==='panel-project');
  assert.equal(projects.length,2);
  c._addResource(projects.find(r=>r.sourceEntity.runtime.providerId==='other'));
  assert.deepEqual(counts(c),{server:0,group:1,deployment:1,endpoint:0});
  assert.equal(c.store.entities.find(e=>e.type==='deployment').name,'Other app');
});

test('本地项目和Git仓库仍是引用卡片，不自动导入整个项目', () => {
  const c=fixture(true);
  c._addResource({key:'project:local',kind:'project',refId:'project_local',name:'Local'});
  c._addResource({key:'repository:local',kind:'repository',refId:'repository_local',name:'Repository'});
  assert.deepEqual(c.store.entities.map(e=>e.type),['project','repository']);
  assert.equal(c.store.relationships.length,0);
});

test('主机容器保留事实连线且锁定主机不可拖动', () => {
  const graph={entities:[{id:'entity_hostabcd',type:'server',name:'Host'},{id:'entity_deployabcd',type:'deployment',name:'Deployment'}],placements:[{entityId:'entity_hostabcd',x:100,y:100,locked:true},{entityId:'entity_deployabcd',x:900,y:500}],relationships:[{id:'relationship_fact01',type:'runs_on',sourceId:'entity_deployabcd',targetId:'entity_hostabcd'}]};
  const model=Adapter.toFlowModel(graph,{hostContainers:true,showRelationshipLines:true});
  const host=model.nodes.find(n=>n.type==='hostBubble');assert.equal(host.draggable,false);
  assert.equal(model.edges[0].target,host.id);assert.equal(model.edges[0].data.relationship.targetId,'entity_hostabcd');
});

test('添加只保存白名单事实，不持久化运行时凭据或全量远端响应', () => {
  const c=fixture(true),r=source(c,'server','a');
  r.sourceEntity.runtime.secret='fixture-never-persist';
  c._addResource(r);const json=JSON.stringify(c.store);
  assert.doesNotMatch(json,/fixture-never-persist|"(?:runtime|transient|dynamic)"\s*:/);
});

test('真实文件服务往返保留组成、关系和离线容器，不需要源服务在线', t => {
  const os=require('node:os');const {WhiteboardDocumentService}=require('../src/main/services/whiteboardDocumentService');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gf-composition-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const service=new WhiteboardDocumentService({baseDirectory:path.join(root,'profile')});
  const c=fixture(true);c._addResource(source(c,'server','a'));
  const saved=service.save({store:c.store},path.join(root,'one.gitfinder-board.json'));
  const reopened=service.open(saved.record.id);assert.deepEqual(reopened.store,c.store);
  c.store=reopened.store;c.panelProjection={entities:[],relationships:[],placements:[]};c.panelTopologyResult={state:'unconfigured'};
  const host=flow(c).nodes.find(n=>n.type==='hostBubble');assert.ok(host);assert.equal(host.data.projectCount,1);
});

test('先前放入手动群组的部署补全主机时不会被夺走', () => {
  const c=fixture(true);c._addResource(source(c,'deployment','App A'));
  c.store.entities.push({id:'entity_manualgrp',type:'group',name:'Manual',details:{}});
  board(c).placements.push({entityId:'entity_manualgrp',x:500,y:600,groupLayout:'manual'});
  const p=board(c).placements.find(p=>c.store.entities.find(e=>e.id===p.entityId)?.type==='deployment');p.groupId='entity_manualgrp';
  c._addResource(source(c,'server','a'));
  assert.equal(board(c).placements.find(i=>i.entityId===p.entityId).groupId,'entity_manualgrp');
});

test('资源层已隐藏时添加与撤销仍是同一个操作', () => {
  const c=fixture(true);board(c).view.showTopology=false;const before=JSON.stringify(c.store);
  const r=source(c,'server','a');c._addResource(r);assert.equal(board(c).view.showTopology,true);c.undo();assert.equal(JSON.stringify(c.store),before);
});


test('另一张空白板离线添加已保存主机时仍保留原Project组成', () => {
  const c=fixture(true);const r=source(c,'server','a');c._addResource(r);
  c.store=Model.assertValidStore(c.store);
  c.store.boards.push({id:'board_second001',name:'Second',view:Model.defaultBoardView(),viewport:{x:0,y:0,zoom:1},placements:[]});
  c.store.activeBoardId='board_second001';c.panelProjection={entities:[],relationships:[],placements:[]};c.panelTopologyResult={state:'unconfigured'};
  c._addResource({entityId:r.entityId,key:r.key,kind:'server'});
  const p=c.store.boards[1].placements, es=new Map(c.store.entities.map(e=>[e.id,e]));
  assert.equal(p.filter(i=>es.get(i.entityId)?.type==='group').length,1);
  assert.ok(p.find(i=>es.get(i.entityId)?.type==='deployment').groupId);
});


test('空主机持续拖动时重复读回不会累计位移', () => {
  const graph={entities:[{id:'entity_hostabcd',type:'server',name:'Host'}],placements:[{entityId:'entity_hostabcd',x:100,y:100}],relationships:[]};
  const m=Adapter.toFlowModel(graph,{hostContainers:true});const host=m.nodes.find(n=>n.type==='hostBubble');
  host.position.x+=20;host.position.y+=10;
  const first=Adapter.toPlacements(m.nodes,graph.placements);
  assert.deepEqual(Adapter.toPlacements(m.nodes,first),first);
  host.position.x+=20;
  assert.equal(Adapter.toPlacements(m.nodes,first)[0].x,140);
});

test('混合白板中的主机下Project使用和自动工作区相同的嵌套标题', () => {
  const c=fixture(true);c._addResource(source(c,'server','a'));
  const model=flow(c),group=model.nodes.find(n=>n.type==='relationshipGroup');
  assert.equal(group.data.nestedContainer,true);
});


test('正式页面和旧白板验证页面在控制器之前加载组合模块', () => {
  const root=path.resolve(__dirname,'..');
  for(const name of fs.readdirSync(path.join(root,'scripts/visual-fixtures')).filter(n=>n.endsWith('.html'))){
    const text=fs.readFileSync(path.join(root,'scripts/visual-fixtures',name),'utf8');
    if(text.includes('relationshipBoardController.js')) assert.ok(text.indexOf('relationshipResourceComposition.js')>=0&&text.indexOf('relationshipResourceComposition.js')<text.indexOf('relationshipBoardController.js'),name);
  }
});


test('画布关闭运行拓扑时资源库仍可选主机并展开所属部署', () => {
  const c=fixture(true);board(c).view.showTopology=false;
  const host=c._resourceCatalog().find(r=>r.kind==='server');assert.ok(host);assert.equal(host.expandable,true);
  c._addResource(host);assert.equal(board(c).view.showTopology,true);
});

test('本机其它白板已有的离线Project归属在资源库仍可展开', () => {
  const c=fixture();const r=source(c,'server','a');c._addResource(r);
  c.store=Model.assertValidStore(c.store);c.store.boards.push({id:'board_other0001',name:'Other',view:Model.defaultBoardView(),viewport:{x:0,y:0,zoom:1},placements:[]});c.store.activeBoardId='board_other0001';
  c.panelProjection={entities:[],relationships:[],placements:[]};c.panelTopologyResult={state:'unconfigured'};c.expandedResourceKeys.add(r.key);
  const host=c._resourceCatalog().find(i=>i.key===r.key);
  assert.ok(host.children.some(child=>child.kind==='group'));
});

test('旧工作区仅保存observed主机锚点时仍按显示偏好展开实时Project与部署', () => {
  const c=fixture();
  c.panelProjection=Projection.buildProjection({...c.panelTopologyResult,serverTree:true});
  c.store.entities=c.panelProjection.entities.filter(e=>e.type==='server').map(e=>c._portableEntity(e));
  board(c).view.structure='server-tree';
  board(c).placements=c.store.entities.map((e,i)=>({entityId:e.id,x:i*500,y:80,resourceDisplayLevels:['host','project','deployment','endpoint']}));
  const graph=c._filteredGraph();const map=new Map(c._combinedEntities().map(e=>[e.id,e]));
  assert.equal(graph.placements.filter(p=>map.get(p.entityId)?.type==='deployment').length,2);
  assert.equal(graph.placements.filter(p=>map.get(p.entityId)?.type==='group').length,2);
  assert.equal(board(c).placements.length,3);assert.equal(c.store.relationships.length,0);
});

test('完整手动组合快照的主机显示偏好不会再引入其它主机或重复Project', () => {
  const c=fixture();const r=source(c,'server','a');c._addResource(r);
  board(c).placements.find(p=>p.entityId===r.entityId).resourceDisplayLevels=['host','project','deployment','endpoint'];
  const graph=c._filteredGraph();const map=new Map(c._combinedEntities().map(e=>[e.id,e]));
  assert.equal(graph.placements.filter(p=>map.get(p.entityId)?.type==='deployment').length,1);
  assert.equal(graph.placements.filter(p=>map.get(p.entityId)?.type==='group').length,1);
});
