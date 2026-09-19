const test = require('node:test');
const assert = require('node:assert/strict');
const Adapter = require('../src/shared/relationshipFlowAdapter');
const Layout = require('../src/shared/responsiveContainerLayout');
const host='entity_header_host',group='entity_panel_projectgroup_header',card='entity_header_card';
function graph() { return { entities:[{id:host,type:'server',name:'con01'},{id:group,type:'group',name:'con01 · 在线工具'},{id:card,type:'deployment',name:'应用'}], relationships:[{id:'relationship_header_host',sourceId:card,targetId:host,type:'runs_on'}], placements:[{entityId:host,x:100,y:100,groupWidth:1000,groupHeight:600,containerLayout:'wrap'},{entityId:group,x:160,y:100,groupWidth:650,groupHeight:400,groupLayout:'manual',containerLayout:'wrap'},{entityId:card,x:184,y:180,groupId:group}] }; }
function absolute(nodes,id) { const n=nodes.find(n=>n.id===id); const p=n.parentId?absolute(nodes,n.parentId):{x:0,y:0};return {x:p.x+n.position.x,y:p.y+n.position.y}; }
const flow=g=>Adapter.toFlowModel(g,{hostContainers:true,layout:'free',showRelationshipLines:false});
test('截图同顶边布局：主机向上补标题区，不移动Project和已保存的部署',()=>{
 const g=graph(),before=JSON.stringify(g),f=flow(g),h=f.nodes.find(n=>n.type==='hostBubble'),p=f.nodes.find(n=>n.id===group);
 assert.ok(p.position.y>=88,`Project enters host title band: ${p.position.y}`);
 assert.deepEqual(absolute(f.nodes,card),{x:184,y:180}); assert.deepEqual(absolute(f.nodes,group),{x:160,y:100});
 assert.equal(h.position.y+h.style.height,700); assert.equal(JSON.stringify(g),before);
});
test('新大字号与嵌套标题使用同一预留区，不跳过手调wrap边界',()=>{
 const g=graph(),f=Adapter.toFlowModel(g,{hostContainers:true,layout:'free',groupTitleFontSize:96,containerHeaderHeight:208,containerTitleMinWidth:700});
 const p=f.nodes.find(n=>n.id===group),c=f.nodes.find(n=>n.id===card);
 assert.ok(p.position.y>=208); assert.ok(c.position.y>=208); assert.deepEqual(absolute(f.nodes,card),{x:184,y:180});
});
test('重复计算标题保护与Flow往返不累积位移',()=>{
 let g=graph(),f=flow(g);const repaired=Adapter.toPlacements(f.nodes,g.placements);
 g={...g,placements:repaired};let next=flow(g);
 assert.deepEqual(Adapter.toPlacements(next.nodes,g.placements),repaired);
 assert.ok(next.nodes.find(n=>n.id===group).position.y>=88);
});
test('正常留白与锁定成员坐标保留，只有旧重叠外框修正',()=>{
 const g=graph();g.placements[0].y=0;g.placements[0].groupHeight=700;g.placements[2].locked=true;
 const f=flow(g);assert.deepEqual(absolute(f.nodes,card),{x:184,y:180});
 assert.equal(f.nodes.find(n=>n.type==='hostBubble').position.y,0);
});
test('Project拖到主机顶端时受标题安全区约束，不再仅依赖extent零边界',()=>{
 const f=flow(graph()),p=f.nodes.find(n=>n.id===group);p.position.y=0;
 const next=Adapter.constrainProjectNodes(f.nodes);assert.ok(next.find(n=>n.id===group).position.y>=88);
});
test('联动拖动遇到标题区整体限位，保持嵌套成员相对位置',()=>{
 const f=flow(graph()),p=f.nodes.find(n=>n.id===group),start=Object.fromEntries(f.nodes.map(n=>[n.id,{...n.position}]));
 const next=Adapter.applyLinkedDrag(f.nodes,{primaryId:group,linkedIds:[group,card],startPositions:start,delta:{x:0,y:-1000}});
 assert.ok(next.find(n=>n.id===group).position.y>=88);assert.deepEqual(next.find(n=>n.id===card).position,start[card]);
});
test('调整主机宽度时首行Project必须位于主机标题区下方',()=>{
 const f=flow(graph()),h=f.nodes.find(n=>n.type==='hostBubble');
 const out=Layout.resize(f.nodes,h.id,{edge:'right',dx:40,dy:0},{headerHeight:72});
 assert.ok(out.nodes.find(n=>n.id===group).position.y>=88);
});
test('普通群组嵌套也保护内嵌标题，不把子组标题放入父组标题行',()=>{
 const n=[{id:'outer',type:'relationshipGroup',position:{x:0,y:0},style:{width:800,height:600},data:{nestedContainer:true,entity:{type:'group'}}},{id:'inner',type:'relationshipGroup',parentId:'outer',position:{x:24,y:0},style:{width:500,height:400},data:{nestedContainer:true,entity:{type:'group'}}}];
 const result=Adapter.constrainProjectNodes(n);assert.ok(result[1].position.y>=72);
});
test('中等字号也按实际补偿留白，36px不沿用旧72px固定标题区',()=>{
 globalThis.RelationshipGraphModel=require('../src/shared/relationshipGraphModel');
 const {Controller}=require('../src/renderer/scripts/relationshipBoardController');
 const c=new Controller({bridge:{},notify(){}});
 const metrics=c._textLayoutMetrics({groupTitleFontSize:36,memberLabelFontSize:12});
 assert.ok(metrics.containerHeaderHeight>=83);
 assert.equal(c._textLayoutMetrics({groupTitleFontSize:20,memberLabelFontSize:12}).containerHeaderHeight,72);
});
test('三级嵌套逐层补标题区，锁定最内层卡片仍保持世界坐标',()=>{
 const g=graph(),inner='entity_header_inner';
 g.entities.push({id:inner,type:'group',name:'内部组件'});
 g.placements.push({entityId:inner,x:170,y:110,groupId:group,groupWidth:500,groupHeight:300,groupLayout:'manual',containerLayout:'wrap'});
 const c=g.placements.find(p=>p.entityId===card);c.groupId=inner;c.locked=true;
 // Model the host->Project summary produced by the topology projection;
 // immediate deployment ownership alone does not identify a grandparent.
 g.relationships.push({id:'visual_header_summary',sourceId:host,targetId:group,visualOnly:true});
 const before=JSON.stringify(g),f=flow(g);
 for(const id of [group,inner,card])assert.ok(f.nodes.find(n=>n.id===id).position.y>=72);
 assert.deepEqual(absolute(f.nodes,card),{x:184,y:180});assert.equal(JSON.stringify(g),before);
});
test('默认标题下修复是幂等的，显式宽高只增加必要留白而非强制全局重排',()=>{
 const f=flow(graph()),once=Adapter.reserveContainerHeaders(f.nodes),twice=Adapter.reserveContainerHeaders(once);
 assert.deepEqual(twice,once);
 assert.equal(once.find(n=>n.id===group).style.width,650);
 assert.deepEqual(absolute(once,card),{x:184,y:180});
});
test('标题安全区随保存的容器尺寸往返，不增加模型字段',()=>{
 const Model=require('../src/shared/relationshipGraphModel');const g=graph();
 const placements=Adapter.toPlacements(flow(g).nodes,g.placements);
 const raw={schemaVersion:1,activeBoardId:'board_header_roundtrip',entities:g.entities.map(e=>({...e,details:{}})),relationships:g.relationships,boards:[{id:'board_header_roundtrip',name:'标题测试',placements,view:Model.defaultBoardView(),viewport:{x:0,y:0,zoom:1}}]};
 const saved=Model.assertValidStore(raw),loaded={entities:saved.entities,relationships:saved.relationships,placements:saved.boards[0].placements};
 assert.deepEqual(Adapter.toPlacements(flow(loaded).nodes,loaded.placements),loaded.placements);
});

test('嵌套长标题使用自身容器宽度，不沿用悬浮标题的280px上限',()=>{
 const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/renderer/relationship-canvas/relationshipCanvas.css'),'utf8');
 assert.match(css,/\.gf-flow-nested-header \.gf-flow-group-title-toolbar\.is-overview strong \{ max-width: 100%; \}/);
});
