#!/usr/bin/env node
// Synthetic same-top-edge regression. DOM header bounds, pointer movement and persistence use real handlers.
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
  const output=fs.mkdtempSync(path.join(root,'dist','container-headers-ui-'));
  console.log('Evidence:',output);
  const profile=path.join(output,'profile'),managed=path.join(profile,'projects');fs.mkdirSync(managed,{recursive:true});
  const Model=require('../src/shared/relationshipGraphModel');
  const {WhiteboardDocumentService}=require('../src/main/services/whiteboardDocumentService');
  const {unwrapRelationshipBoardFile}=require('../src/main/services/relationshipBoardFileFormat');
  const host='entity_header_host',a='entity_panel_projectgroup_headera',b='entity_panel_projectgroup_headerb';
  const entities=[{id:host,type:'server',name:'主机示例',details:{}},{id:a,type:'group',name:'主机示例 · 在线工具',details:{}},{id:b,type:'group',name:'主机示例 · 测试项目',details:{}}];
  const placements=[{entityId:host,x:100,y:100,groupWidth:2200,groupHeight:1100,containerLayout:'wrap'},
    {entityId:a,x:160,y:100,groupWidth:970,groupHeight:900,groupLayout:'manual',containerLayout:'wrap'},
    {entityId:b,x:1180,y:100,groupWidth:920,groupHeight:650,groupLayout:'manual',containerLayout:'wrap'}];
  const relationships=[];
  for(let i=0;i<10;i++){const id='entity_header_app'+i,owner=i<7?a:b,j=i<7?i:i-7;
    entities.push({id,type:'deployment',name:'示例应用 '+i,details:{status:'running'}});
    placements.push({entityId:id,groupId:owner,x:(i<7?184:1204)+(j%(i<7?3:2))*310,y:180+Math.floor(j/(i<7?3:2))*190});
    relationships.push({id:'relationship_header_app'+i,type:'runs_on',sourceId:id,targetId:host});
  }
  const seed=Model.assertValidStore({schemaVersion:1,activeBoardId:'board_header_test',entities,relationships,boards:[{id:'board_header_test',name:'标题边界验证',viewport:{x:0,y:0,zoom:.5},view:{...Model.defaultBoardView(),layout:'free',structure:'coolify-projects'},placements}]});
  const service=new WhiteboardDocumentService({baseDirectory:profile});
  const document=await service.createProject({store:seed},path.join(managed,'标题边界.gitfinder-board'));
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
    await client.evaluate("__c._setPanelTopology({state:'unconfigured'});__c._renderGraph()");await delay(350);
  }
  async function stop() {
    if(client){client.close();client=null;}
    if(child&&child.exitCode===null){child.kill('SIGTERM');for(let i=0;i<100&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null){child.kill('SIGKILL');throw Error('Owned test app did not quit normally');}}
    if(log!==undefined){fs.closeSync(log);log=undefined;}
  }
  const record=name=>{results.push({name,passed:true});console.log(name)};
  const idle=async()=>{await delay(500);await client.evaluate('__c.saveChain');await delay(100)};
  const shot=async(name)=>{const image=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name),Buffer.from(image.data,'base64'))};
  const select=id=>`.react-flow__node[data-id="${id}"]`;
  const center=async(id,requested=.5)=>{await client.wait('!!__c.flowCanvas.getViewport()');await client.evaluate(`(()=>{const map=new Map(__c.flowRenderOptions.model.nodes.map(n=>[n.id,n]));const n=map.get(${JSON.stringify(id)});let x=n.position.x,y=n.position.y,p=map.get(n.parentId);while(p){x+=p.position.x;y+=p.position.y;p=map.get(p.parentId)}const r=__c.root.querySelector('.relationship-canvas').getBoundingClientRect();const w=r.width-320,h=r.height-170;const z=Math.min(${requested},(w-60)/n.style.width,(h-30)/n.style.height);return __c.flowCanvas.setViewport({x:w/2-(x+n.style.width/2)*z,y:h/2-(y+n.style.height/2)*z,zoom:Math.max(.03,z)},{duration:0})})()`);await delay(300)};
  const rects=()=>client.evaluate(`(()=>{const nodes=__c.flowRenderOptions.model.nodes;return nodes.map(n=>{const el=document.querySelector('.react-flow__node[data-id="'+n.id+'"]');const title=el?.querySelector(':scope > section > .gf-flow-nested-header > .gf-flow-group-title-toolbar');return{id:n.id,parent:n.parentId,type:n.type,rect:el?.getBoundingClientRect().toJSON(),title:title?.getBoundingClientRect().toJSON()}})})()`);
  async function clearHeaders(name) {
    await delay(350); // Let React Flow consume dimensions and CSS typography together.
    const all=await rects(),byId=new Map(all.map(n=>[n.id,n]));
    for(const n of all){const p=byId.get(n.parent);if(p?.title){assert.ok(n.rect.top>=p.title.bottom+.2,`${name}: ${n.id} overlaps ${p.id}: ${n.rect.top} < ${p.title.bottom}`)}
      if(n.title){assert.ok(n.title.left>=n.rect.left-.5&&n.title.right<=n.rect.right+.5,`${name}: title outside frame`);}}
    fs.writeFileSync(path.join(output,`geometry-${results.length}.json`),JSON.stringify(all,null,2));record(name);
  }
  const state=()=>client.evaluate("({entities:__c.store.entities,relationships:__c.store.relationships,placements:__c.store.boards[0].placements})");
  async function changeRange(key,value) {
    await client.evaluate(`(()=>{const e=document.querySelector('[data-relationship-display-form] [name=${key}]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(120);
  }
  async function pointerDrag(id,{edge,dy=-400,dx=0}) {
    await center(id);await client.send('Page.bringToFront');
    const pos=await client.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(select(id))});const e=${edge?`n.querySelector('[data-container-resize="${edge}"]')`:'n'};const r=e.getBoundingClientRect();const x=${edge?'r.x+r.width/2':'r.right-35*__c.flowCanvas.getViewport().zoom'},y=${edge?'r.y+r.height/2':'r.bottom-35*__c.flowCanvas.getViewport().zoom'};const hit=document.elementFromPoint(x,y);if(!hit||${edge?'hit!==e':'!n.contains(hit)'})throw Error('Pointer target covered '+hit?.className);return{x,y,zoom:__c.flowCanvas.getViewport().zoom}})()`);
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x,y:pos.y});
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:pos.x,y:pos.y});
    for(let i=1;i<=8;i++){await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',buttons:1,button:'left',x:pos.x+dx*pos.zoom*i/8,y:pos.y+dy*pos.zoom*i/8});await delay(30)}
    await clearHeaders(edge ? '边缘拖动预览期间标题仍不重叠：'+edge : 'Project移动预览期间不侵入父标题');
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:pos.x+dx*pos.zoom,y:pos.y+dy*pos.zoom});await idle();
  }
  try {
    await launch();await center('host-bubble:'+host);await clearHeaders('同顶边旧布局打开后父子标题分层，所有名称保留');await shot('repaired-default.png');
    assert.deepEqual((await state()).placements,seed.boards[0].placements);record('首次显示不改写已存尺寸、成员坐标或关系');
    await client.click('[data-relationship-action=toggle-display-menu]');
    for(const font of [8,20,36,48,96]) {
      await changeRange('groupTitleFontSize',font);await changeRange('memberLabelFontSize',font===96?48:12);
      for(const zoom of [.15,.5,1]) {
        await client.evaluate(`__c.flowCanvas.zoomTo(${zoom},{duration:0})`);await delay(120);await clearHeaders(`${font}px标题在${zoom}倍缩放时不与下级重叠`);
      }
    }
    await client.click('.relationship-display-done');await center('host-bubble:'+host);await shot('repaired-large.png');
    await client.click('[data-relationship-action=toggle-display-menu]');await client.click('[data-relationship-action=reset-display-settings]');await client.click('.relationship-display-done');await idle();
    await pointerDrag(a,{dy:-500});await clearHeaders('实际拖动Project向上，到标题安全区停止');
    await pointerDrag(a,{edge:'top',dy:-160});await clearHeaders('实际拖动Project上边缘，父容器同步保留独立标题区');
    await pointerDrag('host-bubble:'+host,{edge:'right',dx:-300,dy:0});await clearHeaders('主机收窄自动换行后标题不重叠');
    const changed=await state();await client.evaluate('__c.undo()');await idle();await clearHeaders('撤销缩放仍保留标题安全区');await client.evaluate('__c.redo()');await idle();assert.deepEqual(await state(),changed);record('重做恢复同一成员、尺寸与关系');
    await client.evaluate('__c._persistNow()');await idle();const saved=unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(document.record.path,'utf8'))).store;
    assert.deepEqual(saved.boards[0].placements,changed.placements);record('实际IPC和磁盘读回保存最终容器几何');
    await stop();await launch();await center('host-bubble:'+host);assert.deepEqual(await state(),changed);await clearHeaders('进程重启离线重开标题分层且几何未回弹');await shot('reopened.png');
    for(let i=0;i<6;i++){await client.evaluate('__c._renderGraph()');await delay(60)}
    assert.deepEqual(await state(),changed);await clearHeaders('重复渲染不积累偏移');
    assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,scope:'Synthetic screenshot-equivalent fixture; actual DOM rectangles, CDP pointer input and real file IPC/restart. No production whiteboard writes.'},null,2));
    console.log(JSON.stringify({output,passed:true,checks:results.length}));
  }catch(error){try{await shot('failure.png');fs.writeFileSync(path.join(output,'failure-geometry.json'),JSON.stringify(await rects(),null,2))}catch{}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,error:error.stack},null,2));throw error;}
  finally{await stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
