const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Model = globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const Adapter = require('../src/shared/relationshipFlowAdapter');
let Layout; try { Layout = require('../src/shared/responsiveContainerLayout'); } catch (_) {}
const node = (id, type, x, y, w, h, parentId) => ({ id, type, position: { x,y }, style: {width:w,height:h}, ...(parentId?{parentId}:{}), data:{entity:{id,type:type==='hostBubble'?'server':type==='relationshipGroup'?'group':'deployment',name:id,details:{}},placement:{entityId:id,x,y}} });
function fixture() { return [node('g','relationshipGroup',100,100,1000,700),...Array.from({length:5},(_,i)=>node('c'+i,'relationshipCard',24+(i%3)*300,80+Math.floor(i/3)*170,280,143,'g')),node('outside','relationshipCard',2200,80,280,143)]; }
const resize=(nodes,edge,dx=0,dy=0,id='g')=>{assert.ok(Layout,'Shared responsive resize module required');return Layout.resize(nodes,id,{edge,dx,dy},{horizontalSpacing:24,verticalSpacing:24,headerHeight:80});};
test('拉宽增加列数、收窄换行，内容不会按比例缩小，原图不可变',()=>{
 const n=fixture(),before=JSON.stringify(n); const narrow=resize(n,'right',-600),wide=resize(n,'right',600);
 assert.equal(new Set(narrow.nodes.filter(x=>x.parentId==='g').map(x=>x.position.y)).size,5);
 assert.equal(new Set(wide.nodes.filter(x=>x.parentId==='g').map(x=>x.position.y)).size,1);
 assert.equal(narrow.nodes.find(x=>x.id==='c0').style.width,280); assert.equal(JSON.stringify(n),before);
 assert.deepEqual(narrow.nodes.find(x=>x.id==='outside'),n.at(-1));
});
test('四边四角遵守固定对边锚点，过小尺寸按内容最小边界钳制',()=>{
 for(const edge of ['left','right','top','bottom','top-left','top-right','bottom-left','bottom-right']){
  const n=fixture(),r=resize(n,edge,-40,-20),g=r.nodes[0]; assert.ok(Number.isFinite(g.position.x));
  if(edge.includes('left'))assert.equal(g.position.x+g.style.width,1100);else assert.equal(g.position.x,100);
  if(edge.includes('top'))assert.equal(g.position.y+g.style.height,800);else assert.equal(g.position.y,100);
  assert.ok(g.style.width>=328&&g.style.height>=180);
 }
});
test('重复同一鼠标坐标幂等，缩小到底不会把成员放出边框',()=>{
 const n=fixture(),a=resize(n,'bottom-right',-5000,-5000),b=resize(n,'bottom-right',-5000,-5000);
 assert.deepEqual(a,b);const g=a.nodes[0];
 for(const c of a.nodes.filter(x=>x.parentId==='g')){assert.ok(c.position.x>=0&&c.position.y>=80);assert.ok(c.position.x+c.style.width<=g.style.width);assert.ok(c.position.y+c.style.height<=g.style.height);}
});
test('锁定容器、后代或祖先时禁止缩放，非法输入不改变图',()=>{
 const n=fixture(); n[1].data.placement.locked=true;
 assert.ok(Layout); assert.equal(Layout.canResize(n,'g'),false);assert.equal(resize(n,'right',30).changed,false);
 delete n[1].data.placement.locked;n[0].data.placement.locked=true;assert.equal(Layout.canResize(n,'g'),false);
 assert.equal(resize(fixture(),'unknown',30).changed,false);assert.equal(resize(fixture(),'right',Infinity).changed,false);
});
test('主机内嵌套Project整体换行，Project内部相对坐标和关系不变',()=>{
 const n=[node('h','hostBubble',0,0,1100,700),node('g1','relationshipGroup',30,100,450,400,'h'),node('g2','relationshipGroup',530,100,450,400,'h'),node('d1','relationshipCard',24,80,280,143,'g1')];
 n[0].data.memberIds=['g1','g2'];
 const r=resize(n,'right',-500,0,'h');assert.ok(r.nodes[2].position.y>r.nodes[1].position.y);
 assert.deepEqual(r.nodes[3],n[3]);assert.equal(r.nodes[1].parentId,'h');assert.equal(r.nodes[1].style.width,450);
});
test('多边形布局为切角留出内边距，空容器也能保持尺寸',()=>{
 const n=fixture();n[0].data.placement.groupShape='polygon';const r=resize(n,'right',300),g=r.nodes[0];
 for(const c of r.nodes.filter(x=>x.parentId==='g'))assert.ok(c.position.x>=g.style.width*.12);
 const empty=resize([fixture()[0]],'bottom-right',200,100);assert.equal(empty.nodes[0].style.width,1200);assert.equal(empty.nodes[0].style.height,800);
});
test('容器显式尺寸和排列标志通过模型验证及Flow双向转换保留',()=>{
 const raw={schemaVersion:1,activeBoardId:'board_wrap0001',entities:[{id:'entity_host0001',type:'server',name:'H',details:{}}],relationships:[],boards:[{id:'board_wrap0001',name:'W',viewport:{x:0,y:0,zoom:1},placements:[{entityId:'entity_host0001',x:100,y:200,containerLayout:'wrap',groupWidth:920,groupHeight:600}],view:Model.defaultBoardView()}]};
 const s=Model.assertValidStore(raw),p=s.boards[0].placements;
 const flow=Adapter.toFlowModel({entities:s.entities,placements:p,relationships:[]},{hostContainers:true});
 const host=flow.nodes.find(x=>x.type==='hostBubble');assert.equal(host.position.x,100);assert.equal(host.style.width,920);
 const out=Adapter.toPlacements(flow.nodes,p);assert.deepEqual(out,p);
});
test('框选资源不会提前改布局；React挂载共享八方向手柄而非仅Project控制器',()=>{
 const source=fs.readFileSync(require.resolve('../src/renderer/relationship-canvas/index.jsx'),'utf8');
 assert.match(source,/ContainerResizer/);assert.match(source,/container-resize-commit/);
 const count=(source.match(/<ContainerResizer/g)||[]).length;assert.equal(count,2);
});

const {Controller}=require('../src/renderer/scripts/relationshipBoardController');
function liveFixture() {
 const c=new Controller({bridge:{},notify(){}});
 c.store=Model.assertValidStore({schemaVersion:1,activeBoardId:'board_wraptest',entities:[],relationships:[],boards:[{id:'board_wraptest',name:'Live',viewport:{x:0,y:0,zoom:1},placements:[],view:{...Model.defaultBoardView(),structure:'coolify-projects',layout:'free',topologyScopeMode:'all'}}]});
 c.localWorkspaceMode=true;
 c._persistSoon=c._persistDynamicLayoutsSoon=c._renderGraph=c.render=c._refreshHistoryButtons=()=>{};
 const topology={state:'ready',provider:{providerId:'wrapfixture'},topology:{servers:[{nodeId:'host001',name:'Host',providerId:'wrapfixture'}],deployments:Array.from({length:5},(_,i)=>({resourceUuid:'wrapapp'+i,name:'App '+i,nodeId:'host001',projectUuid:'wrapproject',projectName:'Project',providerId:'wrapfixture',status:'running',domains:[]}))}};
 c._setPanelTopology(topology); return {c,topology};
}
function liveFlow(c){return Adapter.toFlowModel(c._flowGraphInput(c._filteredGraph(),[]),{hostContainers:true,layout:'free',linkedNodeIds:{}});}
test('实时Project手动宽高在同源刷新后仍保留，原自动布局不强行覆盖',()=>{
 const {c,topology}=liveFixture();const p=c.panelProjection.placements.find(p=>c.panelProjection.entities.find(e=>e.id===p.entityId)?.type==='group');
 Object.assign(p,{containerLayout:'wrap',groupLayout:'manual',groupWidth:960,groupHeight:900,x:111,y:222});c._saveDynamicPlacementOverrides([p.entityId]);
 c._setPanelTopology(topology);
 const out=c._combinedPlacements().find(x=>x.entityId===p.entityId);
 assert.equal(out.containerLayout,'wrap');assert.equal(out.groupLayout,'manual');assert.equal(out.groupWidth,960);assert.equal(out.groupHeight,900);assert.equal(out.x,111);
});
test('已保存的预览锚点保留wrap意图，不受重复实时Project替换',()=>{
 const {c,topology}=liveFixture();const g=c.panelProjection.entities.find(e=>e.type==='group');
 c.store.entities.push({...c._portableEntity(g)});c.store.boards[0].placements.push({entityId:g.id,x:50,y:80,containerLayout:'wrap',groupLayout:'manual',groupWidth:960,groupHeight:700});
 c._setPanelTopology(topology);const p=c._combinedPlacements().find(p=>p.entityId===g.id);
 assert.equal(p.groupWidth,960);assert.equal(p.groupLayout,'manual');assert.equal(p.containerLayout,'wrap');
});
test('显式主机容器不被服务器树的自动碰撞整理改写位置',()=>{
 const entities=['0001','0002'].map(x=>({id:'entity_host'+x,type:'server',name:x,details:{}}));
 const placements=entities.map((e,i)=>({entityId:e.id,x:i*20,y:0,containerLayout:'wrap',groupWidth:700,groupHeight:600}));
 const flow=Adapter.toFlowModel({entities,placements,relationships:[]},{hostContainerOnly:true,layout:'free'});
 assert.deepEqual(Adapter.toPlacements(flow.nodes,placements),placements);
});
test('wrap标志缺少宽高或在普通卡片上出现应拒绝，旧文件不受影响',()=>{
 const raw={schemaVersion:1,activeBoardId:'board_wraptest',entities:[{id:'entity_host0001',type:'server',name:'H',details:{}}],relationships:[],boards:[{id:'board_wraptest',name:'W',viewport:{x:0,y:0,zoom:1},placements:[{entityId:'entity_host0001',x:100,y:200,containerLayout:'wrap'}]}]};
 assert.throws(()=>Model.assertValidStore(raw),/尺寸/);
 delete raw.boards[0].placements[0].containerLayout;assert.doesNotThrow(()=>Model.assertValidStore(raw));
});

test('控制器一次缩放仅一次撤销，取消没有记录，独立文件往返不丢尺寸', async t=>{
 const previous=globalThis.RelationshipCanvasEngine;globalThis.RelationshipCanvasEngine={toPlacements:Adapter.toPlacements};t.after(()=>{globalThis.RelationshipCanvasEngine=previous});
 const {c}=liveFixture();const base=liveFlow(c),g=base.nodes.find(n=>n.type==='relationshipGroup');
 const raw=Layout.resize(base.nodes,g.id,{edge:'right',dx:300,dy:0},{headerHeight:80});
 assert.equal(c._handleFlowAction('container-resize-start',g.data.entity),true);
 c._handleFlowAction('container-resize-cancel',g.data.entity);assert.equal(c.undoStack.length,0);
 c._handleFlowAction('container-resize-start',g.data.entity);
 assert.equal(c._handleFlowAction('container-resize-commit',g.data.entity,{nodes:raw.nodes,edges:base.edges,resizeBaseline:base.nodes}),true);
 assert.equal(c.undoStack.length,1);const after=c._buildActiveBoardExportStore();assert.equal(after.boards[0].placements.find(p=>p.entityId===g.id).containerLayout,'wrap');
 c.undo();assert.equal(c._placementForEntity(g.id).containerLayout,undefined);c.redo();assert.equal(c._placementForEntity(g.id).containerLayout,'wrap');
 const os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gf-container-size-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const {WhiteboardDocumentService}=require('../src/main/services/whiteboardDocumentService');const service=new WhiteboardDocumentService({baseDirectory:dir});
 const saved=await service.createProject({store:after},path.join(dir,'container.gitfinder-board'));const opened=await service.open(saved.record.id);
 assert.deepEqual(opened.store.boards[0].placements,after.boards[0].placements);
});
test('缩放事务遇到文档切换或已取消时，不允许旧结果写入当前白板',t=>{
 const previous=globalThis.RelationshipCanvasEngine;globalThis.RelationshipCanvasEngine={toPlacements:Adapter.toPlacements};t.after(()=>{globalThis.RelationshipCanvasEngine=previous});
 const {c}=liveFixture();const base=liveFlow(c),g=base.nodes.find(n=>n.type==='relationshipGroup');const result=Layout.resize(base.nodes,g.id,{edge:'right',dx:100,dy:0});
 c._handleFlowAction('container-resize-start',g.data.entity);c.store=JSON.parse(JSON.stringify(c.store));
 assert.equal(c._handleFlowAction('container-resize-commit',g.data.entity,{nodes:result.nodes,resizeBaseline:base.nodes}),false);assert.equal(c.undoStack.length,0);
});
test('隐藏的锁定成员仍禁止来源Project和主机缩放，不被可见过滤绕过',()=>{
 const {c}=liveFixture();const d=c.panelProjection.placements.find(p=>c.panelProjection.entities.find(e=>e.id===p.entityId)?.type==='deployment');
 d.locked=true;c.store.boards[0].hiddenResourceIds=[d.entityId];const host=c.panelProjection.entities.find(e=>e.type==='server');
 assert.equal(c._containerResizeAllowed(d.groupId),false);assert.equal(c._containerResizeAllowed(host.id),false);
});
test('节点操作不能伪造wrap为缺尺寸的空对象，普通部件不能带容器标志',()=>{
 const raw={schemaVersion:1,activeBoardId:'board_wraptest',entities:[{id:'entity_app00001',type:'deployment',name:'D',details:{}}],relationships:[],boards:[{id:'board_wraptest',name:'W',viewport:{x:0,y:0,zoom:1},placements:[{entityId:'entity_app00001',x:100,y:200,containerLayout:'wrap',groupWidth:500,groupHeight:400}]}]};
 assert.throws(()=>Model.assertValidStore(raw),/containerLayout/);
});

test('主机纵列和服务器树重新获取来源后仍保留显式Project宽高',()=>{
 for(const structure of ['coolify-projects','server-tree']){
  const {c,topology}=liveFixture();c.store.boards[0].view.structure=structure;c.store.boards[0].view.layout='project-columns';c._setPanelTopology(topology);
  const p=c.panelProjection.placements.find(p=>c.panelProjection.entities.find(e=>e.id===p.entityId)?.type==='group');assert.ok(p);
  Object.assign(p,{containerLayout:'wrap',groupLayout:'manual',groupWidth:960,groupHeight:900,x:111,y:222});c._saveDynamicPlacementOverrides([p.entityId]);
  c._setPanelTopology(topology);const out=c._combinedPlacements().find(x=>x.entityId===p.entityId);
  assert.equal(out.groupWidth,960);assert.equal(out.groupHeight,900);assert.equal(out.containerLayout,'wrap');assert.equal(out.groupLayout,'manual');
 }
});
test('重复将已经缩放的Flow返回控制器不会累积主机位置和尺寸',t=>{
 const previous=globalThis.RelationshipCanvasEngine;globalThis.RelationshipCanvasEngine={toPlacements:Adapter.toPlacements};t.after(()=>{globalThis.RelationshipCanvasEngine=previous});
 const {c}=liveFixture();const base=liveFlow(c),host=base.nodes.find(n=>n.type==='hostBubble');const r=Layout.resize(base.nodes,host.id,{edge:'top-left',dx:-100,dy:-60});
 c._handleFlowAction('container-resize-start',host.data.entity);c._handleFlowAction('container-resize-commit',host.data.entity,{nodes:r.nodes,resizeBaseline:base.nodes});
 const first=JSON.stringify(c._placementForEntity(host.data.entity.id));const rerender=liveFlow(c);c.flowMutationActive=true;c._handleFlowModelChange(rerender);c.flowMutationActive=false;
 assert.equal(JSON.stringify(c._placementForEntity(host.data.entity.id)),first);
});
