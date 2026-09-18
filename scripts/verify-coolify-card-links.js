#!/usr/bin/env node
// Owned synthetic profile/topology. Link clicks record the renderer external-open boundary;
// main-process allowlist and URL construction are separately exercised by unit tests.
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
  const output=fs.mkdtempSync(path.join(root,'dist','coolify-links-ui-'));
  console.log('Evidence:',output);
  const profile=path.join(output,'profile'),managed=path.join(profile,'projects');
  fs.mkdirSync(managed,{recursive:true});
  const Model=require('../src/shared/relationshipGraphModel');
  const {normalizeCoolifyResource}=require('../src/main/services/coolifyProviderService');
  const providers=[{providerId:'fixture_one',label:'实例一',baseUrl:'https://one.example.invalid'},{providerId:'fixture_two',label:'实例二',baseUrl:'https://two.example.invalid'}];
  const topology={state:'ready',providers,topology:{generatedAt:new Date().toISOString(),servers:providers.map(p=>({providerId:p.providerId,providerLabel:p.label,nodeId:'server-1',name:'同名主机',status:'online',coolifyUrl:p.baseUrl+'/server/server-1'})),deployments:providers.map(p=>({...normalizeCoolifyResource({uuid:'app-1',project_uuid:'project-1',environment_uuid:'env-1',server_uuid:'server-1',name:'部署应用',fqdn:'https://workload.example.invalid'},'application',{baseUrl:p.baseUrl}),projectName:'业务 Project',providerId:p.providerId,providerLabel:p.label}))}};
  const store=Model.assertValidStore({schemaVersion:1,activeBoardId:'board_coolifyui',entities:[],relationships:[],boards:[{id:'board_coolifyui',name:'管理入口验证',view:{...Model.defaultBoardView(),structure:'coolify-projects',layout:'free'},viewport:{x:60,y:60,zoom:1},placements:[]}]});
  fs.writeFileSync(path.join(profile,'relationship-boards.json'),JSON.stringify(store));
  fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({treeRoots:[{path:managed,name:'隔离验证',expanded:true}],defaultScanPath:managed,lastPath:managed,automaticUpdateChecks:false,autoRefresh:false,sidebarHidden:true,detailPanelHidden:true}));
  const appIndex=process.argv.indexOf('--app'),executable=appIndex>=0?path.resolve(process.argv[appIndex+1]):require('electron');
  assert.ok(fs.existsSync(executable));
  const results=[],exceptions=[];let child,log,client,port;
  async function launch() {
    const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;await new Promise(r=>server.close(r));
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    log=fs.openSync(path.join(output,'electron.log'),'a');
    child=spawn(executable,[...(appIndex<0?[root]:[]),`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{cwd:root,env,stdio:['ignore',log,log]});
    let page;for(let i=0;i<160;i++){if(child.exitCode!==null)throw Error(`Test app exited ${child.exitCode}`);try{page=(await(await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(2000)})).json()).find(p=>p.type==='page'&&p.url.endsWith('/src/renderer/index.html'));if(page)break;}catch{}await delay(150);}
    assert.ok(page);client=await connect(page,exceptions);await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await client.wait("typeof App!=='undefined'&&App._treeRoots?.length===1&&document.readyState==='complete'");
    await client.evaluate("App.switchView('relationships')");
    await client.wait("App.relationshipBoardController?.root?.isConnected&&!App.relationshipBoardController.panelRefreshInFlight");await delay(400);
    await client.evaluate("window.__c=App.relationshipBoardController;clearTimeout(__c.panelRefreshTimer);__c._schedulePanelRefresh=()=>{};window.__opened=[];window.__notices=[];__c.notify=(message)=>__notices.push(message);__c.bridge={...__c.bridge,panel:{...__c.bridge.panel,openExternal:async url=>{__opened.push(url);return true}}};");
  }
  async function stop(){if(client){client.close();client=null;}if(child&&child.exitCode===null){child.kill('SIGTERM');for(let i=0;i<50&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null){child.kill('SIGKILL');throw Error('Owned fixture required forced exit');}}if(log!==undefined){fs.closeSync(log);log=undefined;}}
  const inject=async()=>{await client.evaluate(`__c._setPanelTopology(${JSON.stringify(topology)});__c.render();`);await delay(250);};
  const idle=async()=>{await client.evaluate('__c._persistNow()');await client.evaluate('__c.saveChain');await delay(250);};
  const check=async(name,expression)=>{assert.equal(await client.evaluate(expression),true,name);results.push({name,passed:true});console.log(name);};
  const shot=async name=>{const s=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name),Buffer.from(s.data,'base64'));};
  const fit=async()=>{await delay(400);await client.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await client.evaluate('__c.flowCanvas.fitView({padding:.2,minZoom:.1,maxZoom:1,duration:0})');await idle();};
  const host=async provider=>client.evaluate(`__c.panelProjection.entities.find(e=>e.type==='server'&&e.runtime.providerId===${JSON.stringify(provider)}).id`);
  const clickLinks=async()=>{
    const links=await client.evaluate("[...document.querySelectorAll('[data-coolify-entity]:not(:disabled)')].map(e=>({id:e.dataset.coolifyEntity,title:e.title}))");
    for(const link of links){const before=await client.evaluate('__opened.length');await client.click(`[data-coolify-entity="${link.id}"]`);await client.wait(`__opened.length===${before+1}`);assert.ok(link.title.endsWith(await client.evaluate('__opened.at(-1)')));}
    return links.length;
  };
  try{
    await launch();await inject();const first=await host('fixture_one');
    await client.evaluate(`__c._addResource({entityId:${JSON.stringify(first)},kind:'server'});`);await fit();
    await check('主机及Project标题与部署卡片均有直接可见Coolify入口',"document.querySelectorAll('.gf-flow-host-bubble [data-coolify-entity]:not(:disabled)').length===1&&document.querySelectorAll('.gf-flow-group [data-coolify-entity]:not(:disabled)').length===1&&document.querySelectorAll('.resource-deployment footer [data-coolify-entity]:not(:disabled)').length===1");
    await check('按钮位于画布内，可点击且不依赖展开更多菜单',"[...document.querySelectorAll('[data-coolify-entity]')].every(e=>{const r=e.getBoundingClientRect();return r.width>15&&r.height>8&&r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&e.textContent.includes('Coolify')})");
    await shot('direct-coolify-links.png');
    await client.evaluate('window.__before={store:JSON.stringify(__c.store),history:__c.undoStack.length,selection:[...__c._entitySelectionIds()].join()};');
    assert.equal(await clickLinks(),3);
    await check('真实指针点击三个入口分别选中正确管理URL，不打开网站',"__opened.includes('https://one.example.invalid/server/server-1')&&__opened.includes('https://one.example.invalid/project/project-1')&&__opened.includes('https://one.example.invalid/project/project-1/environment/env-1/application/app-1')&&!__opened.includes('https://workload.example.invalid')");
    await check('点击入口不移动布局、不改变节点选择、不增加撤销记录',"JSON.stringify(__c.store)===__before.store&&__c.undoStack.length===__before.history&&[...__c._entitySelectionIds()].join()===__before.selection");
    const second=await host('fixture_two');await client.evaluate(`__c._addResource({entityId:${JSON.stringify(second)},kind:'server'});`);await fit();
    assert.equal(await clickLinks(),6);
    await check('同名主机和相同Project UUID按实例打开，不串源',"['one','two'].every(p=>['/server/server-1','/project/project-1','/project/project-1/environment/env-1/application/app-1'].every(route=>__opened.includes('https://'+p+'.example.invalid'+route)))");
    await shot('two-instances.png');
    await client.send('Emulation.setDeviceMetricsOverride',{width:900,height:760,deviceScaleFactor:1,mobile:false});await fit();
    await check('窄窗仍可直接看到管理入口',"document.querySelectorAll('[data-coolify-entity]:not(:disabled)').length===6&&[...document.querySelectorAll('[data-coolify-entity]')].every(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.right<=innerWidth&&r.x>=0})");
    await shot('links-narrow.png');await client.send('Emulation.clearDeviceMetricsOverride');await fit();
    await check('便携白板不持久化管理地址、运行时数据或凭据',"!/(coolifyUrl|coolifyProjectUrl|coolifyManagementUrl|one.example.invalid|two.example.invalid)/.test(JSON.stringify(__c.store))");
    await idle();await stop();await launch();
    await client.wait("document.querySelectorAll('[data-coolify-entity]').length===6");
    await check('无来源离线重开保留容器，Coolify入口禁用并说明原因',"document.querySelectorAll('[data-coolify-entity]:disabled').length===6&&document.querySelectorAll('.gf-flow-host-bubble').length===2&&[...document.querySelectorAll('[data-coolify-entity]')].every(e=>e.title.includes('无可用管理地址'))");
    await inject();await fit();
    await check('对应来源重新加载后恢复管理入口，无需重建白板',"document.querySelectorAll('[data-coolify-entity]:not(:disabled)').length===6");
    const group=await client.evaluate("__c.flowRenderOptions.model.nodes.find(n=>n.type==='relationshipGroup').data.entity.id");
    await client.evaluate(`document.querySelector('[data-coolify-entity="${group}"]').focus()`);
    const count=await client.evaluate('__opened.length');
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await client.wait(`__opened.length===${count+1}`);
    await check('键盘Enter可使用Project管理入口',"__opened.at(-1).endsWith('/project/project-1')");
    await client.evaluate("__c.bridge.panel.openExternal=async()=>{throw Error('fixture allowlist rejection')}");
    await client.click(`[data-coolify-entity="${group}"]`);await client.wait("__notices.some(x=>x.includes('无法打开 Coolify'))");
    await check('管理地址被拒绝时显示明确错误，不静默成功',"__notices.some(x=>x.includes('fixture allowlist rejection'))");
    await check('仪表盘和开发进度仍默认关闭',"AppState.experimentalFeatures.dashboard===false&&AppState.experimentalFeatures.tasks===false");
    assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checkedAt:new Date().toISOString(),executable,results,exceptions,scope:'Actual renderer pointer/keyboard and local persistence. Synthetic topology, external-open boundary recorded; OS browser launching, real account login and remote availability are not verified here.'},null,2));
    console.log(JSON.stringify({output,passed:true,checks:results.length}));
  }catch(error){try{await shot('failure.png')}catch{}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,error:error.stack},null,2));throw error;}
  finally{await stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
