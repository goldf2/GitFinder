#!/usr/bin/env node
// Owned synthetic typography fixture only. UI form changes and saves use real app handlers and IPC.
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
  const output=fs.mkdtempSync(path.join(root,'dist','text-ranges-ui-'));
  console.log('Evidence:',output);
  const profile=path.join(output,'profile'),managed=path.join(profile,'projects');fs.mkdirSync(managed,{recursive:true});
  const Model=require('../src/shared/relationshipGraphModel');
  const {WhiteboardDocumentService}=require('../src/main/services/whiteboardDocumentService');
  const {unwrapRelationshipBoardFile}=require('../src/main/services/relationshipBoardFileFormat');
  const seed=Model.assertValidStore({schemaVersion:1,activeBoardId:'board_font_test',entities:[{id:'entity_font_text',type:'text',name:'文字',details:{content:'字号',fontSize:'24',width:'1200',height:'800'},source:'manual'}],relationships:[],boards:[{id:'board_font_test',name:'字号范围验证',viewport:{x:0,y:0,zoom:1},view:{...Model.defaultBoardView(),layout:'free'},placements:[{entityId:'entity_font_text',x:1200,y:100}]}]});
  const service=new WhiteboardDocumentService({baseDirectory:profile});
  const document=await service.createProject({store:seed},path.join(managed,'字号验证.gitfinder-board'));
  fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({treeRoots:[{path:managed,name:'隔离验证',expanded:true}],defaultScanPath:managed,lastPath:managed,automaticUpdateChecks:false,autoRefresh:false,sidebarHidden:false,detailPanelHidden:true}));
  const topology={state:'ready',provider:{providerId:'font_fixture',label:'测试'},topology:{generatedAt:new Date().toISOString(),servers:[{nodeId:'host_one',name:'主机',providerId:'font_fixture'}],deployments:[{resourceUuid:'app_one',name:'应用',nodeId:'host_one',projectUuid:'project_one',projectName:'项目',providerId:'font_fixture',status:'running',domains:['https://app.example.invalid']}]}};
  const appIndex=process.argv.indexOf('--app'),executable=appIndex>=0?path.resolve(process.argv[appIndex+1]):require('electron');
  const results=[],exceptions=[];let child,log,client;
  async function launch() {
    const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    log=fs.openSync(path.join(output,'electron.log'),'a');
    child=spawn(executable,[...(appIndex<0?[root]:[]),`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{cwd:root,env,stdio:['ignore',log,log]});
    let page;for(let i=0;i<180;i++){if(child.exitCode!==null)throw Error(`App exited ${child.exitCode}`);try{page=(await(await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(2000)})).json()).find(p=>p.type==='page'&&p.url.endsWith('/src/renderer/index.html'));if(page)break;}catch{}await delay(150);}
    assert.ok(page);client=await connect(page,exceptions);await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await client.wait("typeof App!=='undefined'&&App._treeRoots?.length===1&&document.readyState==='complete'");await delay(350);
    await client.evaluate("App.switchView('relationships')");await client.wait("App.relationshipBoardController?.root?.isConnected&&!App.relationshipBoardController.panelRefreshInFlight");
    await client.evaluate("window.__c=App.relationshipBoardController;clearTimeout(__c.panelRefreshTimer);__c._schedulePanelRefresh=()=>{};");
    await client.evaluate(`__c._openDocument(${JSON.stringify(document.record.id)})`);await delay(350);
  }
  async function stop() {
    if(client){client.close();client=null;}
    if(child&&child.exitCode===null){child.kill('SIGTERM');for(let i=0;i<80&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null){child.kill('SIGKILL');throw Error('Owned app required forced exit');}}
    if(log!==undefined){fs.closeSync(log);log=undefined;}
  }
  const check=async(name,expression)=>{assert.equal(await client.evaluate(expression),true,name);results.push({name,passed:true});console.log(name)};
  const idle=async()=>{await client.evaluate('__c._persistNow()');await client.evaluate('__c.saveChain');await delay(250)};
  const shot=async(name)=>{const image=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name),Buffer.from(image.data,'base64'))};
  const fit=async()=>{await delay(300);await client.evaluate('__c.flowCanvas.fitView({padding:.16,maxZoom:1,duration:0})');await delay(150)};
  const setRange=async(key,value)=>{await client.evaluate(`(()=>{const input=document.querySelector('[data-relationship-display-form] [name=${key}]');if(!input)throw Error('Missing control');input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(80)};
  const geometry=()=>client.evaluate(`(()=>{const out={};for(const [key,selector] of Object.entries({host:'.gf-flow-host-bubble',hostTitle:'.gf-flow-host-bubble .gf-flow-group-title-toolbar',project:'.gf-flow-group',projectTitle:'.gf-flow-group .gf-flow-group-title-toolbar',card:'.gf-flow-card.resource-deployment',heading:'.gf-flow-card.resource-deployment .gf-flow-card-heading strong',footer:'.gf-flow-card.resource-deployment footer',text:'.gf-flow-text-element'})){const e=document.querySelector(selector);if(e){out[key]={...e.getBoundingClientRect().toJSON(),font:getComputedStyle(e).fontSize,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight}}}return out})()`);
  try {
    await launch();await client.evaluate(`__c._setPanelTopology(${JSON.stringify(topology)});__c.collapsedResourceSections=new Set();__c._renderResources()`);
    const hostKey=await client.evaluate("'entity:'+__c.panelProjection.entities.find(e=>e.type==='server').id");
    await client.click(`[data-add-resource="${hostKey}"]`);await idle();await fit();
    await client.click('[data-relationship-action=toggle-display-menu]');
    await check('四类文字控件显示扩大后的最小与最大范围',`Object.entries({textScale:[.5,3],groupTitleFontSize:[8,96],edgeLabelFontSize:[6,48],memberLabelFontSize:[6,48]}).every(([key,[min,max]])=>{const e=document.querySelector('[data-relationship-display-form] [name='+key+']');return +e.min===min&&+e.max===max})`);
    await shot('display-controls.png');
    for(const [key,value] of Object.entries({textScale:3,groupTitleFontSize:96,edgeLabelFontSize:48,memberLabelFontSize:48}))await setRange(key,value);
    await check('滑块的表单处理保留300%和最大字号',"__c.store.boards[0].view.textScale===3&&__c.store.boards[0].view.groupTitleFontSize===96&&__c.store.boards[0].view.edgeLabelFontSize===48&&__c.store.boards[0].view.memberLabelFontSize===48");
    await client.click('.relationship-display-done');await idle();await fit();
    const high=await geometry();fs.writeFileSync(path.join(output,'maximum-geometry.json'),JSON.stringify(high,null,2));await shot('maximum-fonts.png');
    await check('卡片标题实际渲染42px而非旧上限，主机和Project采用96px',"getComputedStyle(document.querySelector('.gf-flow-card.resource-deployment .gf-flow-card-heading strong')).fontSize==='42px'&&parseFloat(getComputedStyle(document.querySelector('.gf-flow-host-bubble strong')).fontSize)>=96&&parseFloat(getComputedStyle(document.querySelector('.gf-flow-group strong')).fontSize)>=96");
    assert.ok(high.hostTitle.bottom<=high.project.top+1,'大主机标题不遮挡Project');
    assert.ok(high.projectTitle.bottom<=high.card.top+1,'大Project标题不遮挡部署');
    assert.ok(high.footer.bottom<=high.card.bottom+1,'300%字号下卡片操作仍在卡片内');
    results.push({name:'最大字号下主机/Project标题与部署卡片操作不重叠',passed:true});
    await client.evaluate("__c._focusEntityOnBoard(__c.store.entities.find(e=>e.type==='deployment').id)");await delay(400);
    await check('放大至可读视图后卡片操作实际可见且未溢出',"(()=>{const card=document.querySelector('.gf-flow-card.resource-deployment'),footer=card.querySelector('footer'),a=card.getBoundingClientRect(),b=footer.getBoundingClientRect();return getComputedStyle(footer).visibility==='visible'&&b.bottom<=a.bottom+1})()");
    await shot('maximum-readable-card.png');
    await client.evaluate("window.__edit=__c._editCanvasElement('entity_font_text');void 0");await client.wait("!!document.querySelector('.relationship-dialog [name=fontSize]')");
    await check('独立文字字号输入支持8至256',"document.querySelector('.relationship-dialog [name=fontSize]').min==='8'&&document.querySelector('.relationship-dialog [name=fontSize]').max==='256'");
    await client.evaluate("document.querySelector('.relationship-dialog [name=fontSize]').value='256'");await client.click('.relationship-dialog button[type=submit]');await client.evaluate('__edit');await idle();
    await check('独立文字真实渲染256px',"getComputedStyle(document.querySelector('.gf-flow-text-element')).fontSize==='256px'");
    const saved=unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(document.record.path,'utf8'))).store;
    assert.equal(saved.boards[0].view.textScale,3);assert.equal(saved.entities.find(e=>e.type==='text').details.fontSize,'256');
    await stop();await launch();await fit();
    await check('独立进程重启离线重开仍保留最大字号和完整组成',"__c.store.boards[0].view.textScale===3&&__c.store.boards[0].view.groupTitleFontSize===96&&__c.store.entities.find(e=>e.type==='text').details.fontSize==='256'&&document.querySelectorAll('.gf-flow-host-bubble').length===1");
    await shot('max-reopened.png');
    await client.click('[data-relationship-action=toggle-display-menu]');
    for(const [key,value] of Object.entries({textScale:.5,groupTitleFontSize:8,edgeLabelFontSize:6,memberLabelFontSize:6}))await setRange(key,value);
    await check('最小字号可保存，不被旧的下限夹回',"__c.store.boards[0].view.textScale===.5&&__c.store.boards[0].view.groupTitleFontSize===8&&__c.store.boards[0].view.edgeLabelFontSize===6&&__c.store.boards[0].view.memberLabelFontSize===6");
    await client.click('[data-relationship-action=reset-display-settings]');
    await check('恢复默认回到原100%及20/10/12px，没有改变默认值',"__c.store.boards[0].view.textScale===1&&__c.store.boards[0].view.groupTitleFontSize===20&&__c.store.boards[0].view.edgeLabelFontSize===10&&__c.store.boards[0].view.memberLabelFontSize===12");
    await client.click('.relationship-display-done');await idle();
    await check('默认关闭的实验功能和应用面板名称继续保留',"AppState.experimentalFeatures.tasks===false&&AppState.experimentalFeatures.dashboard===false&&document.querySelector('[data-view=panel]').textContent.includes('应用面板')");
    assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,scope:'Synthetic source, owned profile, actual form/renderer/file IPC/restart; no real Coolify requests or user layout writes.'},null,2));
    console.log(JSON.stringify({output,passed:true,checks:results.length}));
  }catch(error){try{await shot('failure.png')}catch{}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,error:error.stack},null,2));throw error}
  finally{await stop()}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
