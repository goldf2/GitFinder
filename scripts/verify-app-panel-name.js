#!/usr/bin/env node
// Owned synthetic topology/profile only. Successful saves and reopen use real IPC and disk.
// Navigation uses the application methods; controls use CDP input. Neither claims native macOS input coverage.
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
  const output=fs.mkdtempSync(path.join(root,'dist','app-panel-name-ui-'));
  console.log('Evidence:', output);
  const profile=path.join(output,'profile'), managed=path.join(profile,'projects');
  fs.mkdirSync(managed,{recursive:true});
  fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({
    treeRoots:[{path:managed,name:'隔离测试',expanded:true}],defaultScanPath:managed,lastPath:managed,
    automaticUpdateChecks:false,autoRefresh:false,detailPanelHidden:true,
    workspaceTabSession:{tabs:[{id:'fixture-tree',mode:'tree',path:managed},{id:'legacy-panel',mode:'panel',path:managed,title:'象数面板'}],activeTabId:'fixture-tree'}
  }));
  const appIndex=process.argv.indexOf('--app');
  const executable=appIndex>=0?path.resolve(process.argv[appIndex+1]):require('electron');
  const results=[],exceptions=[];let child,client,log;
  const snapshot={providers:[{providerId:'fixture',label:'测试主机',baseUrl:'https://fixture.invalid'}],topology:{generatedAt:new Date().toISOString(),deployments:[
    {providerId:'fixture',resourceUuid:'a',name:'示例 API',projectName:'示例项目',type:'application',status:'running',domains:['https://app.invalid']},
    {providerId:'fixture',resourceUuid:'b',name:'内部数据库',projectName:'示例项目',type:'database',status:'stopped',domains:[]}
  ]}};
  async function installFixture() {
    await client.evaluate(`(()=>{
      const snapshot=${JSON.stringify(snapshot)};
      window.__panelCalls={cache:0,sync:0,remote:0};
      const api={getCachedTopology:async()=>{__panelCalls.cache++;return snapshot},
        refreshTopology:async()=>{__panelCalls.sync++;return snapshot},
        getEndpointChecks:async()=>({checks:[]}),getRemoteObservations:async()=>{__panelCalls.remote++;return{checks:[],checkedAt:snapshot.topology.generatedAt}},
        openExternal:async()=>true};
      App.nativePanelController?.close();
      App.nativePanelController=new NativePanelController(document.getElementById('xiangshu-panel-view'),api,()=>{});
    })()`);
  }
  async function launch() {
    const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const port=server.address().port;await new Promise(r=>server.close(r));
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    log=fs.openSync(path.join(output,'electron.log'),'a');
    child=spawn(executable,[...(appIndex<0?[root]:[]),`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{cwd:root,env,stdio:['ignore',log,log]});
    let page;
    for(let i=0;i<160;i++){if(child.exitCode!==null)throw Error('Owned app exited');try{page=(await(await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(2000)})).json()).find(p=>p.type==='page'&&p.url.endsWith('/src/renderer/index.html'));if(page)break;}catch{}await delay(150);}
    assert.ok(page);client=await connect(page,exceptions);
    await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await client.wait("typeof App!=='undefined'&&App._treeRoots?.length===1&&document.readyState==='complete'");
    await installFixture();
    return port;
  }
  async function stop(){
    client?.close();client=null;
    if(child&&child.exitCode===null){child.kill('SIGTERM');for(let i=0;i<60&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null){child.kill('SIGKILL');throw Error('Owned test app failed to stop normally');}}
    if(log!==undefined){fs.closeSync(log);log=undefined;}
  }
  const check=async(name,expression)=>{assert.equal(await client.evaluate(expression),true,name);results.push({name,passed:true});console.log(name);};
  const shot=async name=>{const image=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name),Buffer.from(image.data,'base64'));};
  try {
    const port=await launch();
    fs.writeFileSync(path.join(output,'test-ui-discovery.json'),JSON.stringify(await client.evaluate("({methods:Object.keys(App).filter(k=>/WorkspaceTab|ClosedTab/.test(k)),tabs:[...document.querySelectorAll('[role=tab], [data-tab-id], [data-workspace-tab-id]')].map(e=>({tag:e.tagName,attrs:[...e.attributes].map(a=>[a.name,a.value]),text:e.textContent})),mode:AppState.currentMode})"),null,2));
    await client.evaluate("App.activateWorkspaceTab('legacy-panel')");
    await client.wait("AppState.currentMode==='panel'&&!App.nativePanelController.loading");
    await check('旧panel标签打开后菜单、面包屑和页面均显示应用面板',"document.getElementById('current-path').textContent==='应用面板'&&document.querySelector('.xiangshu-panel-toolbar strong').textContent==='应用面板'&&document.getElementById('xiangshu-panel-view').getAttribute('aria-label')==='应用面板'&&!document.body.innerText.includes('象数面板')&&!document.querySelector('[data-tab-id=legacy-panel]').getAttribute('aria-label').includes('panel.xiangshu.me')");
    await check('页面说明与来源分开，原资源仍可见',"document.querySelector('.native-panel-description').textContent==='查看已部署应用与服务，检查状态并快速访问。'&&document.querySelectorAll('.native-panel-content tbody tr').length===2&&__panelCalls.sync===0");
    await shot('app-panel-name.png');
    await client.click('.native-panel-search');
    await client.send('Input.insertText',{text:'API'});
    await client.evaluate("App.nativePanelController.layoutButton.dataset.panelQa='layout'");
    await client.click('[data-panel-qa="layout"]');
    await check('原搜索、卡片布局和偏好保存仍正常',"document.querySelectorAll('.native-panel-content article').length===1&&JSON.parse(localStorage.getItem('gitfinder.native-panel.v1')).filters.query==='API'&&JSON.parse(localStorage.getItem('gitfinder.native-panel.v1')).layout==='cards'");
    await client.evaluate('App.closeWorkspaceTab()');
    await client.wait("AppState.currentMode!=='panel'");
    await client.evaluate('App.restoreClosedWorkspaceTab()');
    await client.wait("AppState.currentMode==='panel'&&!App.nativePanelController.loading");
    await check('关闭并恢复标签保持新名称、筛选与布局',"document.getElementById('current-path').textContent==='应用面板'&&App.nativePanelController.search.value==='API'&&App.nativePanelController.layout==='cards'");
    await client.send('Emulation.setDeviceMetricsOverride',{width:800,height:780,deviceScaleFactor:1,mobile:false});
    await shot('app-panel-narrow.png');
    await check('窄窗页面标题和说明可见',"(()=>{const e=document.querySelector('.native-panel-description'),r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth+1})()");
    await client.send('Emulation.clearDeviceMetricsOverride');
    // Save with a normal directory active: fixture APIs can be installed before
    // re-opening the restored panel, without issuing live observation requests.
    await client.evaluate("App.activateWorkspaceTab('fixture-tree')");
    await client.wait("AppState.currentMode==='tree'");
    await client.evaluate('App.persistWorkspaceTabs()');
    await delay(400);await stop();await launch();
    await client.evaluate("App.activateWorkspaceTab('legacy-panel')");
    await client.wait("AppState.currentMode==='panel'&&!App.nativePanelController.loading");
    await check('独立进程重启后旧标签与原偏好继续可用',"document.getElementById('current-path').textContent==='应用面板'&&App.nativePanelController.search.value==='API'&&App.nativePanelController.layout==='cards'");
    await check('仪表盘和开发进度仍默认关闭',"AppState.experimentalFeatures.dashboard===false&&AppState.experimentalFeatures.tasks===false");
    assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,scope:'Isolated profile and fixture panel APIs; real renderer navigation, preferences and process restart; no live probes, user configuration, or server writes.'},null,2));
    console.log(JSON.stringify({output,passed:true,checks:results.length}));
  }catch(error){try{await shot('failure.png')}catch{}fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({results,exceptions,error:error.stack},null,2));throw error;}
  finally{await stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
