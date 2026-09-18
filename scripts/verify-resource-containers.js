#!/usr/bin/env node
// Owned synthetic topology/profile only. Successful saves and reopen use real IPC and disk.
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
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||!e.getClientRects().length)throw Error('Control unavailable');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  const close = () => {for(const p of pending.values()) clearTimeout(p.timer);pending.clear();socket.close();};
  await send('Runtime.enable');
  return {send,evaluate,wait,click,close,page};
}

async function main() {
  fs.mkdirSync(path.join(root,'dist'),{recursive:true});
  const output=fs.mkdtempSync(path.join(root,'dist','resource-containers-ui-'));
  console.log('Evidence:',output);
  const profile=path.join(output,'profile'),managed=path.join(profile,'projects');
  fs.mkdirSync(managed,{recursive:true});
  const Model=require('../src/shared/relationshipGraphModel');
  const {WhiteboardDocumentService}=require('../src/main/services/whiteboardDocumentService');
  const {unwrapRelationshipBoardFile}=require('../src/main/services/relationshipBoardFileFormat');
  const empty=()=>Model.assertValidStore({schemaVersion:1,activeBoardId:'board_ui_fixture',entities:[],relationships:[],boards:[{id:'board_ui_fixture',name:'容器验证',viewport:{x:80,y:80,zoom:1},view:{...Model.defaultBoardView(),layout:'free'},placements:[]}]});
  const service=new WhiteboardDocumentService({baseDirectory:profile});
  const document=await service.createProject({store:empty()},path.join(managed,'容器验证.gitfinder-board'));
  fs.writeFileSync(path.join(profile,'relationship-boards.json'),JSON.stringify(empty()));
  fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({treeRoots:[{path:managed,name:'隔离验证',expanded:true}],defaultScanPath:managed,lastPath:managed,automaticUpdateChecks:false,autoRefresh:false,sidebarHidden:false,detailPanelHidden:true}));
  const topology={state:'ready',provider:{providerId:'fixture',label:'测试'},topology:{generatedAt:'2026-09-17T00:00:00Z',servers:['a','b','empty'].map(nodeId=>({nodeId,name:nodeId,providerId:'fixture',status:'online'})),deployments:[{resourceUuid:'app-a',name:'应用 A',nodeId:'a',projectUuid:'same-project',projectName:'共享 Project',domains:['https://a.example.invalid','https://shared.example.invalid']},{resourceUuid:'app-b',name:'应用 B',nodeId:'b',projectUuid:'same-project',projectName:'共享 Project',domains:['https://b.example.invalid','https://shared.example.invalid']}].map(d=>({...d,providerId:'fixture',status:'running'}))}};
  const Projection=require('../src/shared/panelTopologyProjection');
  const seedHost=Projection.buildProjection(topology).entities.find(e=>e.type==='server'&&e.runtime.nodeId==='a');
  const legacyStore=empty();legacyStore.entities=[{id:seedHost.id,type:'server',name:seedHost.name,source:'observed',details:{hostLabel:'a'}}];
  legacyStore.boards[0].placements=[{entityId:seedHost.id,x:720,y:540,note:'旧主机备注'}];
  const legacy=await service.createProject({store:legacyStore},path.join(managed,'旧主机快照.gitfinder-board'));
  const appIndex=process.argv.indexOf('--app'),executable=appIndex>=0?path.resolve(process.argv[appIndex+1]):require('electron');
  assert.ok(fs.existsSync(executable));
  const results=[],exceptions=[];let child,log,client,port;
  async function launch() {
    const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;await new Promise(r=>server.close(r));
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    log=fs.openSync(path.join(output,'electron.log'),'a');
    child=spawn(executable,[...(appIndex<0?[root]:[]),`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{cwd:root,env,stdio:['ignore',log,log]});
    let page;
    for(let i=0;i<160;i++){if(child.exitCode!==null)throw Error(`Test app exited ${child.exitCode}`);try{page=(await(await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(2000)})).json()).find(p=>p.type==='page'&&p.url.endsWith('/src/renderer/index.html'));if(page)break;}catch{}await delay(150);}
    assert.ok(page);client=await connect(page,exceptions);
    await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await client.wait("typeof App!=='undefined'&&App._treeRoots?.length===1&&document.readyState==='complete'");
    await client.evaluate("App.switchView('relationships')");
    await client.wait("App.relationshipBoardController?.root?.isConnected&&!App.relationshipBoardController.panelRefreshInFlight");await delay(500);
    await client.evaluate("window.__c=App.relationshipBoardController;clearTimeout(__c.panelRefreshTimer);__c._schedulePanelRefresh=()=>{};__c.collapsedResourceSections=new Set();__c._renderResources();");
  }
  async function stop() {
    if(client){client.close();client=null;}
    if(child&&child.exitCode===null){child.kill('SIGTERM');for(let i=0;i<50&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null){child.kill('SIGKILL');throw Error('Owned test app required forced exit');}}
    if(log!==undefined){fs.closeSync(log);log=undefined;}
  }
  const inject=async()=>{await client.evaluate(`__c._setPanelTopology(${JSON.stringify(topology)});__c._renderResources();__c._renderGraph();`);await delay(120);};
  const idle=async()=>{await client.evaluate('__c._persistNow()');await client.evaluate('__c.saveChain');await delay(200);};
  const check=async(name,expression)=>{const actual=await client.evaluate(expression);assert.equal(actual,true,name);results.push({name,passed:true});console.log(name);};
  const screenshot=async(name)=>{const shot=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name),Buffer.from(shot.data,'base64'));};
  const keyFor=async(type,node)=>client.evaluate(`(()=>{const entity=__c.panelProjection.entities.find(e=>e.type===${JSON.stringify(type)}&&(e.runtime?.nodeId===${JSON.stringify(node)}||e.name===${JSON.stringify(node)}));if(!entity)throw Error('Fixture source missing');return 'entity:'+entity.id})()`);
  const add=async key=>{await client.click(`[data-add-resource="${key}"]`);await idle();};
  const fit=async()=>{
    // Wait for React Flow to commit and measure the new model before fitting.
    await delay(400);
    await client.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await client.evaluate('__c.flowCanvas.fitView({padding:.16,minZoom:.03,maxZoom:1.5,duration:0})');
    await delay(200);
  };
  try {
    await launch();await inject();
    await check('空白本机白板默认未注入远端节点',"__c.store.boards.find(b=>b.id===__c.store.activeBoardId).placements.length===0");
    await client.evaluate('window.__creating=__c._createBoard();void 0');await client.wait("!!document.querySelector('.relationship-dialog [name=name]')");
    await client.evaluate("document.querySelector('.relationship-dialog [name=name]').value='新建主机容器验证'");
    await client.click('.relationship-dialog button[type=submit]');await client.evaluate('__creating');await inject();
    await check('新建白板保持自身结构和空成员',"__c.store.boards.find(b=>b.id===__c.store.activeBoardId).name==='新建主机容器验证'&&__c.store.boards.find(b=>b.id===__c.store.activeBoardId).placements.length===0");
    const hostA=await keyFor('server','a'),hostB=await keyFor('server','b'),hostEmpty=await keyFor('server','empty');
    await add(hostA);await fit();
    await check('主机加号得到容器、Project和本机部署，不加入另一主机',"document.querySelectorAll('.gf-flow-host-bubble').length===1&&document.querySelectorAll('.gf-flow-group').length===1&&__c.store.entities.filter(e=>e.type==='deployment').length===1&&__c.store.entities.filter(e=>e.type==='endpoint').length===2&&!__c.flowRenderOptions.model.nodes.some(n=>n.type==='relationshipCard'&&n.data.entity.type==='server')");
    await check('Project标题与自动工作区使用同一嵌套容器样式',"__c.flowRenderOptions.model.nodes.filter(n=>n.type==='relationshipGroup').every(n=>n.data.nestedContainer===true)&&document.querySelectorAll('.gf-flow-group .gf-flow-nested-header').length===1");
    await screenshot('host-container.png');
    await client.evaluate('window.__beforeDuplicate=JSON.stringify(__c.store.entities);window.__historyCount=__c.undoStack.length');await add(hostA);
    await check('补全按钮重复点击不复制实体或增加撤销步骤',"JSON.stringify(__c.store.entities)===__beforeDuplicate&&__c.undoStack.length===__historyCount");
    await client.evaluate('__c.undo()');await idle();
    await check('一次撤销完整撤回组合和关系',"__c.store.boards.find(b=>b.id===__c.store.activeBoardId).placements.length===0&&__c.store.relationships.length===0");
    await client.evaluate('__c.redo()');await idle();
    await check('重做恢复完整容器',"__c.flowRenderOptions.model.nodes.some(n=>n.type==='hostBubble')&&__c.store.relationships.length===3");
    // HTML resource drag dispatch goes through the same registered drop handler.
    await client.evaluate(`window.__dragKey=${JSON.stringify(hostB)}`);
    await check('实时主机资源行允许拖拽',`document.querySelector('[data-resource-key="${hostB}"]').draggable===true`);
    const drop=await client.evaluate("(()=>{const r=__c.root.querySelector('.relationship-canvas').getBoundingClientRect();return{x:r.x+r.width*.65,y:r.y+r.height*.5}})()");
    const dragData={items:[{mimeType:'application/x-gitfinder-relationship-resource',data:hostB}],dragOperationsMask:1};
    for(const type of ['dragEnter','dragOver','drop'])await client.send('Input.dispatchDragEvent',{type,...drop,data:dragData});await idle();await fit();
    await check('拖入另一主机生成独立Project且共享端点不重复',"__c.store.entities.filter(e=>e.type==='server').length===2&&__c.store.entities.filter(e=>e.type==='group').length===2&&__c.store.entities.filter(e=>e.type==='endpoint').length===3&&document.querySelectorAll('.gf-flow-host-bubble').length===2");
    await screenshot('two-hosts-shared-project.png');
    await client.evaluate(`__c._openDocument(${JSON.stringify(legacy.record.id)})`);await inject();
    await check('旧文件中单个主机快照直接使用容器显示',"__c.store.entities.length===1&&document.querySelectorAll('.gf-flow-host-bubble').length===1");
    await add(hostA);await fit();
    await check('旧主机补全只增加缺失下级并保留原位置备注',`(()=>{const p=__c.store.boards[0].placements.find(p=>p.entityId===${JSON.stringify(seedHost.id)});return p.x===720&&p.y===540&&p.note==='旧主机备注'&&__c.store.entities.filter(e=>e.type==='server').length===1&&__c.store.entities.filter(e=>e.type==='deployment').length===1})()`);
    await screenshot('legacy-host-completed.png');
    await client.evaluate(`__c._openDocument(${JSON.stringify(document.record.id)})`);await inject();
    await add(hostEmpty);await fit();
    const bubble='.react-flow__node-hostBubble';
    const start=await client.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(bubble)}).getBoundingClientRect();window.__emptyBefore={...__c.store.boards[0].placements[0]};window.__dragZoom=new DOMMatrixReadOnly(getComputedStyle(__c.root.querySelector('.react-flow__viewport')).transform).a;window.__hostBefore=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__node-hostBubble')).transform).toJSON();return{x:r.x+r.width/2,y:r.y+r.height*.6}})()`);
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',...start});
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...start});
    // Cross the pointer activation threshold with small real movement first;
    // XYFlow establishes the drag origin at activation, not at mousedown.
    for(const distance of [1,2,3])await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:start.x+distance,y:start.y+distance/2});
    for(let i=1;i<=6;i++)await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:start.x+i*12,y:start.y+i*6});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:start.x+72,y:start.y+36});await idle();
    await check('空主机容器真实指针移动后写入独立文件坐标',"__c.store.boards[0].placements[0].x!==__emptyBefore.x&&__c.store.boards[0].placements[0].y!==__emptyBefore.y");
    fs.writeFileSync(path.join(output,'empty-host-drag.json'),JSON.stringify(await client.evaluate('({before:__emptyBefore,after:__c.store.boards[0].placements[0],zoom:__dragZoom,storedZoom:__c.store.boards[0].viewport.zoom,hostBefore:__hostBefore,hostAfter:new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".react-flow__node-hostBubble")).transform).toJSON(),screenDelta:{x:72,y:36}})'),null,2));
    await check('空主机保存位移与实际画布一致，不随事件累计放大',"(()=>{const p=__c.store.boards[0].placements[0],m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__node-hostBubble')).transform);return Math.abs((p.x-__emptyBefore.x)-72/__dragZoom)<3&&Math.abs((p.y-__emptyBefore.y)-36/__dragZoom)<3&&Math.abs((p.x-__emptyBefore.x)-(m.m41-__hostBefore.m41))<.05&&Math.abs((p.y-__emptyBefore.y)-(m.m42-__hostBefore.m42))<.05})()");
    // Add a populated host to the independent project through its real palette.
    await add(hostA);await fit();
    await check('独立白板通过同一资源加号加入完整组成',"__c.documentRecord.id==="+JSON.stringify(document.record.id)+"&&__c.store.entities.filter(e=>e.type==='group').length===1&&__c.store.entities.filter(e=>e.type==='deployment').length===1");
    await client.evaluate("const d=__c.store.boards[0].placements.find(p=>__c.store.entities.find(e=>e.id===p.entityId)?.type==='deployment');d.note='重开保留的备注';__c._persistSoon(0)");await idle();
    const saved=unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(document.record.path,'utf8'))).store;
    assert.equal(saved.entities.filter(e=>e.type==='server').length,2);assert.equal(saved.relationships.length,3);
    const emptyId=hostEmpty.slice('entity:'.length),emptyPosition=saved.boards[0].placements.find(p=>p.entityId===emptyId);
    fs.writeFileSync(path.join(output,'expected-offline.json'),JSON.stringify(saved,null,2));
    results.push({name:'独立文件经真实IPC保存的成员和关系已从磁盘读回',passed:true});
    await stop();await launch();
    await client.evaluate(`__c._openDocument(${JSON.stringify(document.record.id)})`);await client.evaluate("__c._setPanelTopology({state:'unconfigured'});__c._renderGraph();__c._renderResources()");await fit();
    await check('进程重启并离线后保留主机容器、Project与原备注',"__c.panelProjection.entities.length===0&&document.querySelectorAll('.gf-flow-host-bubble').length===2&&document.querySelectorAll('.gf-flow-group').length===1&&__c.store.boards[0].placements.some(p=>p.note==='重开保留的备注')");
    await check('空容器重启后没有回弹到旧坐标',`(()=>{const p=__c.store.boards[0].placements.find(p=>p.entityId===${JSON.stringify(emptyId)});return p.x===${emptyPosition.x}&&p.y===${emptyPosition.y}})()`);
    await check('仪表盘与开发进度测试开关仍默认关闭',"AppState.experimentalFeatures.tasks===false&&AppState.experimentalFeatures.dashboard===false");
    await screenshot('offline-reopened.png');

    // Offline Project actions must retain source ownership, not become manual-group actions.
    const projectId=await client.evaluate("__c.store.entities.find(e=>e.type==='group').id");
    const deploymentId=await client.evaluate("__c.store.entities.find(e=>e.type==='deployment').id");
    const compositionBefore=await client.evaluate("JSON.stringify({entities:__c.store.entities,relationships:__c.store.relationships,placements:__c.store.boards[0].placements})");
    await client.click('.gf-flow-group .gf-flow-more');
    await client.wait("!!document.querySelector('.gf-flow-container-actions-portal [role=toolbar]')");
    await check('离线Project标题菜单只提供隐藏而不是解散来源容器',"(()=>{const e=document.querySelector('.gf-flow-container-actions-portal');return e.textContent.includes('从白板隐藏')&&!e.textContent.includes('解散容器')})()");
    await screenshot('offline-project-actions.png');
    await client.click('.gf-flow-container-actions-portal [role=toolbar] button:last-child');await idle();
    await check('实际点击隐藏后Project和成员消失，原实体关系与位置不变',`document.querySelectorAll('.gf-flow-group').length===0&&__c.store.boards[0].hiddenResourceIds.includes(${JSON.stringify(projectId)})&&JSON.stringify({entities:__c.store.entities,relationships:__c.store.relationships,placements:__c.store.boards[0].placements})===${JSON.stringify(compositionBefore)}`);
    await client.evaluate('__c.undo()');await idle();
    await check('离线Project隐藏可完整撤销并恢复画布',"document.querySelectorAll('.gf-flow-group').length===1");
    await client.evaluate('__c.redo()');await idle();
    await check('重做恢复隐藏，磁盘记录的成员仍完整',`document.querySelectorAll('.gf-flow-group').length===0&&__c.store.boards[0].placements.some(p=>p.entityId===${JSON.stringify(deploymentId)})`);
    const hiddenStore=unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(document.record.path,'utf8'))).store;
    assert.ok(hiddenStore.boards[0].hiddenResourceIds.includes(projectId));
    assert.equal(JSON.stringify({entities:hiddenStore.entities,relationships:hiddenStore.relationships,placements:hiddenStore.boards[0].placements}),compositionBefore);
    await stop();await launch();
    await client.evaluate(`__c._openDocument(${JSON.stringify(document.record.id)})`);await client.evaluate("__c._setPanelTopology({state:'unconfigured'});__c._renderGraph();__c._renderResources()");await fit();
    await check('隐藏状态在进程重启离线重开后保留，不自动删除源成员',`__c.store.boards[0].hiddenResourceIds.includes(${JSON.stringify(projectId)})&&document.querySelectorAll('.gf-flow-group').length===0&&__c.store.boards[0].placements.some(p=>p.entityId===${JSON.stringify(deploymentId)})`);
    await add('entity:'+projectId);await fit();
    await check('资源库加号可以恢复隐藏Project及成员，不重建实体',`document.querySelectorAll('.gf-flow-group').length===1&&!(__c.store.boards[0].hiddenResourceIds||[]).includes(${JSON.stringify(projectId)})&&JSON.stringify({entities:__c.store.entities,relationships:__c.store.relationships,placements:__c.store.boards[0].placements})===${JSON.stringify(compositionBefore)}`);
    await client.evaluate(`__c._selectOnlyEntity(${JSON.stringify(deploymentId)});__c.root.querySelector('.relationship-canvas').focus()`);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'G',code:'KeyG',windowsVirtualKeyCode:71,modifiers:12});
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'G',code:'KeyG',windowsVirtualKeyCode:71,modifiers:12});await idle();
    await check('离线部署快捷键不能移出来源Project，菜单与属性不提供改归属入口',`__c.store.boards[0].placements.find(p=>p.entityId===${JSON.stringify(deploymentId)}).groupId===${JSON.stringify(projectId)}&&!__c._contextMenuItems('node').filter(Boolean).some(i=>i.action==='remove-selection-group')&&!__c._groupAppearanceEditorHtml(${JSON.stringify(projectId)}).includes('name="parentGroup"')`);
    await client.evaluate(`__c._selectOnlyEntity(${JSON.stringify(projectId)});__c.root.querySelector('.relationship-canvas').focus()`);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});await idle();
    await check('Backspace与标题隐藏一致，不解散离线Project或丢失内容',`__c.store.boards[0].hiddenResourceIds.includes(${JSON.stringify(projectId)})&&JSON.stringify({entities:__c.store.entities,relationships:__c.store.relationships,placements:__c.store.boards[0].placements})===${JSON.stringify(compositionBefore)}`);
    await client.evaluate('__c.undo()');await idle();await fit();await screenshot('offline-restored-lifecycle.png');
    await client.click('[data-layout-menu="topology"]');
    await client.wait("!!document.querySelector('[data-board-topology-visible=\"false\"]')");
    await client.click('[data-board-topology-visible="false"]');await idle();
    await check('关闭整个运行层只改变显示，不从内存或磁盘删除组成',`__c.store.boards[0].view.showTopology===false&&document.querySelectorAll('.gf-flow-group').length===0&&JSON.stringify({entities:__c.store.entities,relationships:__c.store.relationships,placements:__c.store.boards[0].placements})===${JSON.stringify(compositionBefore)}`);
    const layerHidden=unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(document.record.path,'utf8'))).store;
    assert.equal(JSON.stringify({entities:layerHidden.entities,relationships:layerHidden.relationships,placements:layerHidden.boards[0].placements}),compositionBefore);
    await stop();await launch();await client.evaluate(`__c._openDocument(${JSON.stringify(document.record.id)})`);
    await check('运行层隐藏状态重启保持，原节点与关系仍在独立文件',`__c.store.boards[0].view.showTopology===false&&__c.store.entities.length===${saved.entities.length}&&__c.store.relationships.length===3`);
    await client.click('[data-layout-menu="topology"]');await client.wait("!!document.querySelector('[data-board-topology-visible=\"true\"]')");
    await client.click('[data-board-topology-visible="true"]');await idle();await fit();
    await check('重开运行层恢复原容器，不需要重新从资源库添加',"document.querySelectorAll('.gf-flow-group').length===1&&document.querySelectorAll('.gf-flow-host-bubble').length===2&&__c.store.boards[0].placements.some(p=>p.note==='重开保留的备注')");
    await screenshot('layer-toggle-reopened.png');
    // Reproduce the existing workspace format: only observed host anchors and
    // display preferences are persisted, not a complete imported snapshot.
    const observedHosts=Projection.buildProjection(topology).entities.filter(e=>e.type==='server').map(e=>({id:e.id,type:e.type,name:e.name,details:{hostLabel:e.details?.hostLabel||''},source:'observed'}));
    const anchors=empty();anchors.entities=observedHosts;anchors.boards[0].view.structure='server-tree';
    anchors.boards[0].placements=observedHosts.map((e,i)=>({entityId:e.id,x:i*500,y:80,resourceDisplayLevels:['host','project','deployment','endpoint']}));
    await stop();
    fs.writeFileSync(path.join(profile,'relationship-boards.json'),JSON.stringify(anchors));
    await launch();await inject();await fit();
    await check('旧版observed主机锚点按原偏好继续展开实时Project和部署',"__c.localWorkspaceMode&&!__c.documentRecord&&__c.flowRenderOptions.model.nodes.filter(n=>n.data.entity.type==='deployment').length===2&&document.querySelectorAll('.gf-flow-group').length===2");
    await check('旧自动工作区展开不擅自固化源节点和关系',"__c.store.boards[0].placements.length===3&&__c.store.relationships.length===0");
    await check('旧工作区主机与部署实际位于可见画布内',"(()=>{const canvas=__c.root.querySelector('.relationship-canvas').getBoundingClientRect();const nodes=[...__c.root.querySelectorAll('.react-flow__node-hostBubble,.react-flow__node-relationshipCard')];return nodes.length>=5&&nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>canvas.left&&r.left<canvas.right&&r.bottom>canvas.top&&r.top<canvas.bottom})})()");
    await screenshot('legacy-live-workspace.png');
    assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checkedAt:new Date().toISOString(),executable,results,exceptions,scope:'Synthetic provider input only; actual app renderer, pointer/HTML drag, file IPC and process restart. No real user board writes or Coolify requests.'},null,2));
    console.log(JSON.stringify({output,passed:true,checks:results.length}));
  }catch(error){try{await screenshot('failure.png')}catch{}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,error:error.stack},null,2));throw error;}
  finally{await stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
