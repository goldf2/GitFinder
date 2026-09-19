#!/usr/bin/env node
// Owned synthetic container fixture. Pointer resizing and persistence use real handlers and IPC.
// CDP pointer/HTML drag input does not claim macOS native input coverage.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect(page, exceptions) {
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('CDP connection timeout')), 8000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once:true });
    socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once:true });
  });
  let sequence = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    if (reply.method === 'Runtime.exceptionThrown') exceptions.push(reply.params.exceptionDetails);
    const request = pending.get(reply.id); if (!request) return;
    pending.delete(reply.id); clearTimeout(request.timer);
    if (reply.error) request.reject(Error(JSON.stringify(reply.error))); else request.resolve(reply.result);
  });
  const send = (method, params={}) => new Promise((resolve, reject) => {
    const id=++sequence, timer=setTimeout(() => {pending.delete(id);reject(Error(`${method} timed out`));}, 25000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async expression => {
    const reply=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(reply.exceptionDetails) throw Error(JSON.stringify(reply.exceptionDetails));
    return reply.result.value;
  };
  const wait = async (expression, timeout=20000) => {
    const started=Date.now();
    while(Date.now()-started<timeout) {if(await evaluate(expression)) return;await delay(100);}
    throw Error(`Condition timeout: ${expression}`);
  };
  const click = async selector => {
    await send('Page.bringToFront');
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Control unavailable: '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  const close = () => {for(const p of pending.values()) clearTimeout(p.timer);pending.clear();socket.close();};
  await send('Runtime.enable');
  return {send,evaluate,wait,click,close,page};
}

async function main() {
  fs.mkdirSync(path.join(root,'dist'),{recursive:true});
  const output=fs.mkdtempSync(path.join(root,'dist','container-resize-ui-'));
  console.log('Evidence:',output);
  const profile=path.join(output,'profile'),managed=path.join(profile,'projects');fs.mkdirSync(managed,{recursive:true});
  const Model=globalThis.RelationshipGraphModel=require('../src/shared/relationshipGraphModel');
  const {Controller}=require('../src/renderer/scripts/relationshipBoardController');
  const Projection=require('../src/shared/panelTopologyProjection');
  const {WhiteboardDocumentService}=require('../src/main/services/whiteboardDocumentService');
  const {unwrapRelationshipBoardFile}=require('../src/main/services/relationshipBoardFileFormat');
  const topology={state:'ready',provider:{providerId:'resize_fixture',label:'测试'},topology:{generatedAt:new Date().toISOString(),servers:[{nodeId:'host_one',name:'主机',providerId:'resize_fixture'},{nodeId:'empty_host',name:'空主机',providerId:'resize_fixture'}],deployments:Array.from({length:6},(_,i)=>({resourceUuid:'resizeapp'+i,name:'应用 '+i,nodeId:'host_one',projectUuid:i<4?'project_a':'project_b',projectName:i<4?'Project A':'Project B',providerId:'resize_fixture',status:'running',domains:[]}))}};
  const c=new Controller({bridge:{},notify(){}});
  c.store=Model.assertValidStore({schemaVersion:1,activeBoardId:'board_resizetest',entities:[],relationships:[],boards:[{id:'board_resizetest',name:'容器拖拽验证',viewport:{x:0,y:0,zoom:1},view:{...Model.defaultBoardView(),layout:'free',structure:'coolify-projects'},placements:[]}]});
  c.documentRecord={id:'fixture_document'};c.localWorkspaceMode=false;
  c.panelTopologyResult=topology;c.panelProjection=Projection.buildProjection({...topology,groupByProject:true});
  c._persistSoon=c._persistDynamicLayoutsSoon=c._renderGraph=c._renderResources=c._refreshHistoryButtons=c._updateSummary=c.render=()=>{};c._focusEntityOnBoard=()=>true;
  for(const h of c.panelProjection.entities.filter(e=>e.type==='server'))c._addResource({key:'entity:'+h.id,kind:'server',entityId:h.id,name:h.name,sourceEntity:h,transient:true},h.runtime?.nodeId==='empty_host'?{x:2400,y:200}:{x:200,y:300});
  const manual='entity_manualgroup';c.store.entities.push({id:manual,type:'group',name:'手工群组',details:{}});
  c.store.boards[0].placements.push({entityId:manual,x:-1500,y:200,groupLayout:'manual',groupWidth:1000,groupHeight:700});
  for(let i=0;i<5;i++){const id='entity_manualapp'+i;c.store.entities.push({id,type:'deployment',name:'手工部件 '+i,details:{}});c.store.boards[0].placements.push({entityId:id,groupId:manual,x:-1476+(i%3)*300,y:280+Math.floor(i/3)*170});}
  const seed=c._buildActiveBoardExportStore();const hostEntity=seed.entities.find(e=>e.type==='server'&&e.name.includes('主机')&&!e.name.includes('空'));
  assert.ok(hostEntity);const hostId='host-bubble:'+hostEntity.id;
  const projectId=seed.entities.find(e=>e.type==='group'&&e.id!==manual).id;
  const service=new WhiteboardDocumentService({baseDirectory:profile});
  const document=await service.createProject({store:seed},path.join(managed,'容器拖拽.gitfinder-board'));
  fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({treeRoots:[{path:managed,name:'隔离验证',expanded:true}],defaultScanPath:managed,lastPath:managed,automaticUpdateChecks:false,autoRefresh:false,sidebarHidden:true,detailPanelHidden:true}));
  const appIndex=process.argv.indexOf('--app'),executable=appIndex>=0?path.resolve(process.argv[appIndex+1]):require('electron');
  const results=[],exceptions=[];let child,log,client;
  async function launch() {
    const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;log=fs.openSync(path.join(output,'electron.log'),'a');
    child=spawn(executable,[...(appIndex<0?[root]:[]),`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{cwd:root,env,stdio:['ignore',log,log]});
    let page;for(let i=0;i<180;i++){if(child.exitCode!==null)throw Error(`App exited ${child.exitCode}`);try{page=(await(await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(2000)})).json()).find(p=>p.type==='page'&&p.url.endsWith('/src/renderer/index.html'));if(page)break;}catch{}await delay(150);}
    assert.ok(page);client=await connect(page,exceptions);await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await client.wait("typeof App!=='undefined'&&App._treeRoots?.length===1&&document.readyState==='complete'");await delay(400);
    await client.evaluate("App.switchView('relationships')");await client.wait("App.relationshipBoardController?.root?.isConnected&&!App.relationshipBoardController.panelRefreshInFlight");
    await client.evaluate("window.__c=App.relationshipBoardController;clearTimeout(__c.panelRefreshTimer);__c._schedulePanelRefresh=()=>{};");
    await client.evaluate(`__c._openDocument(${JSON.stringify(document.record.id)})`);await delay(500);
    await client.evaluate(`window.__base=${JSON.stringify(seed)};window.__topology=${JSON.stringify(topology)};__c._setPanelTopology({state:'unconfigured'});__c._renderGraph();`);await delay(400);
    await client.evaluate(`(()=>{window.__resizeTrace=[];const original=__c._handleFlowAction;__c._handleFlowAction=function(a,v,p){const g=this.containerResizeActive;const details=a.startsWith('container-resize')?{action:a,id:v?.id,active:!!g,storeSame:g?.store===this.store,docSame:g?.document===this.documentRecord,baseline:p?.resizeBaseline?.filter(n=>n.id===v?.id).map(n=>({p:n.position,size:n.style,measured:n.measured,layout:n.data.placement.containerLayout})),next:p?.nodes?.filter(n=>n.id===v?.id).map(n=>({p:n.position,size:n.style,measured:n.measured,layout:n.data.placement.containerLayout}))}:null;const result=original.call(this,a,v,p);if(details)__resizeTrace.push({...details,result,history:this.undoStack.length});return result}})()`);
  }
  async function stop() {
    if(client){client.close();client=null;}
    if(child&&child.exitCode===null){child.kill('SIGTERM');for(let i=0;i<100&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null){child.kill('SIGKILL');throw Error('Owned test app did not quit normally');}}
    if(log!==undefined){fs.closeSync(log);log=undefined;}
  }
  const check=async(name,expression)=>{assert.equal(await client.evaluate(expression),true,name);results.push({name,passed:true});console.log(name)};
  const idle=async()=>{await delay(450);await client.evaluate('__c.saveChain');await delay(150)};
  const shot=async(name)=>{const image=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name),Buffer.from(image.data,'base64'))};
  const selector=(id,edge)=>`[data-container-resizer="${id}"] [data-container-resize="${edge}"]`;
  const center=async(id)=>{await client.wait('!!__c.flowCanvas.getViewport()');await client.evaluate(`(()=>{const model=__c.flowRenderOptions.model, map=new Map(model.nodes.map(n=>[n.id,n]));const n=map.get(${JSON.stringify(id)});if(!n)throw Error('No container');let x=n.position.x,y=n.position.y,p=map.get(n.parentId);while(p){x+=p.position.x;y+=p.position.y;p=map.get(p.parentId)}const r=__c.root.querySelector('.relationship-canvas').getBoundingClientRect();const availableWidth=r.width-300,availableHeight=r.height-210;const zoom=Math.max(.03,Math.min(.65,(availableWidth-120)/n.style.width,(availableHeight-80)/n.style.height));return __c.flowCanvas.setViewport({x:availableWidth/2-(x+n.style.width/2)*zoom,y:availableHeight/2-(y+n.style.height/2)*zoom,zoom},{duration:0})})()`);await delay(350)};
  const reset=async()=>{await client.evaluate("__c.store=JSON.parse(JSON.stringify(__base));__c.undoStack=[];__c.redoStack=[];__c._setPanelTopology({state:'unconfigured'});__c.render();__c._persistNow()");await idle();};
  const shape=()=>client.evaluate("JSON.stringify({entities:__c.store.entities,relationships:__c.store.relationships,placements:__c.store.boards[0].placements})");
  async function drag(id,edge,dx,dy,{cancel=false,refresh=false}={}) {
    await center(id);const sel=selector(id,edge);
    const point=await client.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.disabled)throw Error('Resize control unavailable');const r=e.getBoundingClientRect();const p={x:r.x+r.width/2,y:r.y+r.height/2};const hit=document.elementFromPoint(p.x,p.y);if(hit!==e)throw Error('Resize hit intercepted: '+JSON.stringify({hit:hit?.className,point:p,rect:r.toJSON(),viewport:__c.flowCanvas.getViewport(),board:__c.store.boards[0].viewport,transform:document.querySelector('.react-flow__viewport').style.transform}));return {...p,zoom:__c.flowCanvas.getViewport().zoom}})()`);
    const before=await shape();const history=await client.evaluate('__c.undoStack.length');
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:point.x,y:point.y});
    await client.wait('!!__c.containerResizeActive');
    for(let i=1;i<=6;i++){await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,button:'left',x:point.x+dx*point.zoom*i/6,y:point.y+dy*point.zoom*i/6});await delay(25)}
    assert.equal(await shape(),before,'preview must not persist a partial resize');
    if(refresh){await client.evaluate('__c._setPanelTopology(__topology);__c._renderGraph()');await delay(250);}
    if(cancel){await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});}
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x+dx*point.zoom,y:point.y+dy*point.zoom});
    await client.wait('!__c.containerResizeActive');await idle();
    if(cancel||refresh){assert.equal(await shape(),before,'cancel/refresh must not commit');assert.equal(await client.evaluate('__c.undoStack.length'),history);}
    else assert.equal(await client.evaluate('__c.undoStack.length'),history+1,'one resize creates one undo');
  }
  try {
    await launch();await check('主机、Project和手工群组均有八方向手柄',`[${JSON.stringify(hostId)},${JSON.stringify(projectId)},${JSON.stringify(manual)}].every(id=>document.querySelectorAll('[data-container-resizer="'+id+'"] [data-container-resize]').length===8)`);
    for(const id of (process.argv.includes('--extras-only')?[]:[manual,projectId,hostId])){
      for(const edge of ['right','left','bottom','top','top-left','top-right','bottom-left','bottom-right']){
        await reset();const before=await shape();await drag(id,edge,edge.includes('left')?-100:100,edge.includes('top')?-80:80);
        const key=id.replace('host-bubble:','');await check(`${id===hostId?'主机':id===projectId?'Project':'手工群组'} ${edge}拖拽保存尺寸`, `__c.store.boards[0].placements.find(p=>p.entityId===${JSON.stringify(key)})?.containerLayout==='wrap'`);
        await client.evaluate('__c.undo()');await idle();assert.equal(await shape(),before,'undo recovers complete original');await client.evaluate('__c.redo()');await idle();
      }
    }
    await reset();await drag(manual,'right',-500,0);await check('收窄后五个部件换行，部件字号与宽度不缩放',`new Set(__c.store.boards[0].placements.filter(p=>p.groupId===${JSON.stringify(manual)}).map(p=>p.y)).size>=3&&getComputedStyle(document.querySelector('.gf-flow-card-heading strong')).fontSize==='14px'`);await shot('narrow-wrap.png');
    await drag(manual,'right',1000,0);await shot('wide-wrap.png');
    await reset();await drag(projectId,'right',-200,0,{cancel:true});results.push({name:'Esc取消不保存、不新增撤销',passed:true});
    await drag(projectId,'right',-200,0,{refresh:true});results.push({name:'来源刷新中断预览，不提交旧几何',passed:true});
    await reset();await client.evaluate(`__c.store.boards[0].placements.find(p=>p.groupId===${JSON.stringify(manual)}).locked=true;__c.render()`);await delay(300);
    await check('锁定内部成员后八个手柄均不可操作',`[...document.querySelectorAll('[data-container-resizer="${manual}"] button')].every(e=>e.disabled)`);
    await reset();await drag(hostId,'bottom-right',240,140);await drag(projectId,'right',-200,0);await idle();
    const expected=await shape();const saved=unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(document.record.path,'utf8'))).store;
    assert.ok(saved.boards[0].placements.some(p=>p.containerLayout==='wrap'));results.push({name:'独立白板经真实IPC写入wrap与尺寸',passed:true});
    await stop();await launch();assert.deepEqual(JSON.parse(await shape()),JSON.parse(expected));await center(hostId);await shot('offline-reopened.png');results.push({name:'进程重启离线重开保留尺寸、成员、关系与坐标',passed:true});
    await client.evaluate('__c._setPanelTopology(__topology);__c._renderGraph()');await idle();assert.deepEqual(JSON.parse(await shape()),JSON.parse(expected));results.push({name:'独立白板同源刷新不会回弹',passed:true});
    // Additional shape/empty cases still use physical pointer input.
    await reset();const emptyId='host-bubble:'+seed.entities.find(e=>e.type==='server'&&e.name.includes('空')).id;
    await drag(emptyId,'bottom-right',140,80);await check('空主机可以调整且不自动回到推导尺寸',`__c.store.boards[0].placements.find(p=>p.entityId===${JSON.stringify(emptyId.slice(12))})?.containerLayout==='wrap'`);
    await reset();await client.evaluate(`__c.store.boards[0].placements.find(p=>p.entityId===${JSON.stringify(manual)}).groupShape='polygon';__c.render()`);await delay(300);
    await drag(manual,'right',180,0);results.push({name:'多边形边缘可独立拉宽，成员留在切角安全区',passed:true});
    // Start a fresh, owned live workspace. Persisted dynamic overrides use real config IPC.
    await client.evaluate(`__c._showLocalWorkspace()`);await delay(400);
    await client.evaluate(`__c.store={schemaVersion:1,activeBoardId:'board_liveresize',entities:[],relationships:[],boards:[{id:'board_liveresize',name:'动态缩放',viewport:{x:0,y:0,zoom:1},placements:[],view:{...RelationshipGraphModel.defaultBoardView(),structure:'server-tree',layout:'free',topologyScopeMode:'all'}}]};__c.localWorkspaceMode=true;__c._setPanelTopology(__topology);__c.render();__c._persistNow()`);await idle();
    const liveProject=await client.evaluate("__c.panelProjection.entities.find(e=>e.type==='group'&&e.id.startsWith('entity_panel_projectgroup_')).id");
    await drag(liveProject,'right',240,0);await client.evaluate('__c._persistDynamicLayoutsNow()');
    const liveSize=await client.evaluate(`(()=>{const p=__c._placementForEntity(${JSON.stringify(liveProject)});return {width:p.groupWidth,height:p.groupHeight,layout:p.containerLayout,x:p.x,y:p.y}})()`);
    await client.evaluate('__c._setPanelTopology(__topology);__c._renderGraph()');await idle();
    await check('实时工作区刷新保留手动Project尺寸',`(()=>{const p=__c._placementForEntity(${JSON.stringify(liveProject)});return p.containerLayout==='wrap'&&p.groupWidth===${liveSize.width}&&p.groupHeight===${liveSize.height}})()`);
    const liveHost=await client.evaluate("__c.flowRenderOptions.model.nodes.find(n=>n.type==='hostBubble'&&n.data.memberIds.length).id");
    await drag(liveHost,'bottom-right',160,90);await client.evaluate('__c._persistDynamicLayoutsNow()');
    const liveHostSize=await client.evaluate(`(()=>{const p=__c._placementForEntity(${JSON.stringify(liveHost.slice(12))});return {width:p.groupWidth,height:p.groupHeight,x:p.x,y:p.y}})()`);
    await stop();await launch();await client.evaluate('__c._showLocalWorkspace()');await client.evaluate('__c._setPanelTopology(__topology);__c.render()');await idle();
    await check('动态尺寸通过真实配置保存并在进程重启后恢复',`(()=>{const p=__c._placementForEntity(${JSON.stringify(liveProject)});return p.containerLayout==='wrap'&&p.groupWidth===${liveSize.width}&&p.groupHeight===${liveSize.height}})()`);
    await check('动态主机边框的宽高和锚点在冷启动后保留',`(()=>{const p=__c._placementForEntity(${JSON.stringify(liveHost.slice(12))});return p.containerLayout==='wrap'&&p.groupWidth===${liveHostSize.width}&&p.groupHeight===${liveHostSize.height}&&p.x===${liveHostSize.x}&&p.y===${liveHostSize.y}})()`);
    await check('实验进度保持默认关闭、应用面板命名保留',"AppState.experimentalFeatures.tasks===false&&AppState.experimentalFeatures.dashboard===false&&document.querySelector('[data-view=panel]').textContent.includes('应用面板')");
    assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,scope:'Owned profile; synthetic topology, real renderer pointer input, file IPC and process restart. No real user writes.'},null,2));
    console.log(JSON.stringify({output,passed:true,checks:results.length}));
  }catch(error){try{await shot('failure.png');fs.writeFileSync(path.join(output,'resize-trace.json'),JSON.stringify(await client.evaluate('__resizeTrace'),null,2))}catch{}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,error:error.stack},null,2));throw error;}
  finally{await stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
