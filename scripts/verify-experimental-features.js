#!/usr/bin/env node
// Disposable profiles only; never use this runner against a normal user instance.
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
  const output=fs.mkdtempSync(path.join(root,'dist','experimental-ui-'));
  console.log('Evidence:',output);
  const profile=path.join(output,'profile'), managed=path.join(profile,'projects'), project=path.join(managed,'sample');
  fs.mkdirSync(path.join(project,'management'),{recursive:true});
  const ledger=path.join(project,'management/development-tasks.json');
  const original=JSON.stringify({schemaVersion:1,updatedAt:new Date().toISOString(),nextTaskId:'GF-NEXT',milestones:[{id:'GF-M1',title:'测试'}],tasks:[{id:'GF-NEXT',title:'测试任务',status:'ready',owner:'unassigned',priority:'P1',milestone:'GF-M1',dependsOn:[],acceptance:['需真实验收'],evidence:[],nextAction:'等待确认',userAcceptance:'pending'}]},null,2);
  fs.writeFileSync(ledger,original);
  const session={version:2,activeTabId:'legacy-tasks',tabs:[{id:'legacy-tasks',mode:'tasks',path:managed},{id:'legacy-dashboard',mode:'dashboard',path:managed}],closedTabs:[{id:'closed-tasks',mode:'tasks',path:project}]};
  // Omit experimentalFeatures intentionally: this is both a new flag default and an old-session upgrade.
  fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({treeRoots:[{path:managed,name:'隔离测试',expanded:true}],defaultScanPath:managed,lastPath:managed,workspaceTabSession:session,automaticUpdateChecks:false,autoRefresh:false,themeMode:'light',sidebarHidden:false,detailPanelHidden:true}));
  const appIndex=process.argv.indexOf('--app');
  const executable=appIndex>=0?path.resolve(process.argv[appIndex+1]):require('electron');
  assert.ok(fs.existsSync(executable),'Electron executable missing');
  const results=[],exceptions=[],connections=[];let child,log,client,port;
  const pages=async()=> (await (await fetch(`http://127.0.0.1:${port}/json`,{signal:AbortSignal.timeout(3000)})).json()).filter(p=>p.type==='page'&&p.url.endsWith('/src/renderer/index.html'));
  async function launch() {
    const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;await new Promise(r=>server.close(r));
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    log=fs.openSync(path.join(output,'electron.log'),'a');
    child=spawn(executable,[...(appIndex<0?[root]:[]),`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{cwd:root,env,stdio:['ignore',log,log]});
    let page;
    for(let i=0;i<160;i++){if(child.exitCode!==null)throw Error(`Test app exited: ${child.exitCode}`);try{page=(await pages())[0];if(page)break;}catch{}await delay(150);}
    assert.ok(page,'Test renderer unavailable');client=await connect(page,exceptions);connections.push(client);
    await client.wait("typeof App!=='undefined'&&typeof AppState!=='undefined'&&App._treeRoots?.length===1&&document.readyState==='complete'");
  }
  async function stop() {
    for(const c of connections.splice(0))c.close();
    if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');for(let i=0;i<50&&child.exitCode===null&&child.signalCode===null;i++)await delay(100);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');throw Error('Fixture required forced exit');}}
    if(log!==undefined){fs.closeSync(log);log=undefined;}
  }
  const check=async(name,expression,c=client)=>{assert.equal(await c.evaluate(expression),true,name);results.push({name,passed:true});console.log(name);};
  const settings=async()=>{await client.evaluate("App.openSettingsPage('settings-testing')");await client.wait("document.querySelector('#settings-testing')?.hidden===false");};
  const toggle=async(key,enabled)=>{
    await client.click(`#settings-experimental-${key}`);
    await client.wait(`AppState.experimentalFeatures.${key}===${enabled}&&!document.querySelector('#settings-experimental-${key}').disabled`);
  };
  const shot=async name=>{const image=await client.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name),Buffer.from(image.data,'base64'));};
  try {
    await launch();
    await check('旧版活动/非活动/关闭标签均安全回到文件浏览',"AppState.currentMode==='tree'&&[...AppState.workspaceSession.tabs,...AppState.workspaceSession.closedTabs].every(t=>t.mode==='tree')&&AppState.workspaceSession.tabs.length===2");
    await check('首次启动两个入口默认隐藏且不轮询',"document.getElementById('btn-dashboard').hidden&&document.getElementById('btn-project-tasks').hidden&&!App._progressPollTimer");
    await check('主进程全关时不返回任务数据',"(async()=>{const p=await gitFinder.projectTasks.getPortfolio({forceRefresh:true});return p.disabled===true&&p.tasks.length===0})()");
    await client.evaluate("App.switchView('tasks');App.switchView('dashboard')");
    await check('直接路由或快捷入口不能绕过未启用开关',"AppState.currentMode==='tree'");
    await settings();
    await check('设置测试功能区默认关闭、说明即时保存并保留数据',"!document.querySelector('#settings-experimental-dashboard').checked&&!document.querySelector('#settings-experimental-tasks').checked&&document.querySelector('#settings-testing').textContent.includes('原台账和白板均保留')&&document.querySelector('.app-settings-footer').hidden");
    await shot('testing-default.png');
    await toggle('dashboard',true);await client.evaluate("App.switchView('dashboard')");
    await client.wait("AppState.dashboardStats?.taskCount===1");
    await check('单独开启仪表盘可读取汇总，开发任务仍关闭',"!document.querySelector('#btn-dashboard').hidden&&document.querySelector('#btn-project-tasks').hidden&&!!App._progressPollTimer&&[...document.querySelectorAll('[data-dashboard-task-project]')].every(e=>e.disabled)");
    await client.evaluate("App.openProgressProjectTasks('sample');App.switchView('tasks')");
    await check('仪表盘不能自动启用或跳入开发任务',"AppState.currentMode==='dashboard'&&AppState.experimentalFeatures.tasks===false");
    await settings();await toggle('dashboard',false);
    await check('关闭仪表盘后清理刷新定时器',"(async()=>!App._progressPollTimer&&(await gitFinder.projectTasks.getPortfolio()).disabled===true)()");
    await toggle('tasks',true);await client.evaluate("App.switchView('tasks')");await client.wait("!!document.querySelector('#task-refresh')");
    await check('单独开启开发任务可读台账，仪表盘不自动开启',"AppState.taskPortfolio.tasks.length===1&&!document.querySelector('#btn-project-tasks').hidden&&document.querySelector('#btn-dashboard').hidden&&!!App._progressPollTimer");
    await client.evaluate(`gitFinder.app.openTabWindow({path:${JSON.stringify(managed)},mode:'tasks'})`);
    let secondPage;for(let i=0;i<120;i++){secondPage=(await pages()).find(p=>p.id!==client.page.id);if(secondPage)break;await delay(100);}
    assert.ok(secondPage,'Detached test window missing');const other=await connect(secondPage,exceptions);connections.push(other);
    await other.wait("typeof AppState!=='undefined'&&AppState.currentMode==='tasks'&&!!document.querySelector('#task-refresh')");
    await settings();await toggle('tasks',false);
    await other.wait("AppState.currentMode==='tree'&&AppState.experimentalFeatures.tasks===false");
    await check('关闭开关同步其他窗口并停止其刷新',"AppState.currentMode==='tree'&&!App._progressPollTimer&&document.querySelector('#btn-project-tasks').hidden",other);
    await check('关闭不删除项目文件与导航历史',"AppState.workspaceSession.tabs.length===2&&AppState.workspaceSession.tabs.every(t=>t.path.length>0)");
    await toggle('tasks',true);await other.wait("AppState.experimentalFeatures.tasks===true");
    await check('重新启用只恢复入口，不强制打开另一窗口的测试页',"AppState.currentMode==='tree'&&!document.querySelector('#btn-project-tasks').hidden",other);
    await other.send('Page.close');other.close();
    await client.send('Emulation.setDeviceMetricsOverride',{width:800,height:780,deviceScaleFactor:1,mobile:false});await delay(250);
    await check('窄屏测试开关仍可见且不溢出内容区',"[...document.querySelectorAll('[data-experimental-feature]')].every(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.parentElement.querySelector('span').getBoundingClientRect().width>=120})");await shot('testing-narrow.png');
    await client.send('Emulation.clearDeviceMetricsOverride');
    await client.evaluate("App.switchView('tasks');App.persistWorkspaceTabs()");await client.wait("!!document.querySelector('#task-refresh')");
    await client.evaluate('App.persistWorkspaceTabs()');await stop();await launch();
    await client.wait("AppState.currentMode==='tasks'&&!!document.querySelector('#task-refresh')");
    await check('隔离进程重启后恢复已启用开关与任务页',"AppState.experimentalFeatures.tasks===true&&AppState.experimentalFeatures.dashboard===false&&!document.querySelector('#btn-project-tasks').hidden");
    await settings();await toggle('tasks',false);
    await check('关闭后的旧任务操作在主进程被拒绝',"(async()=>{try{await gitFinder.projectTasks.getGitEvidence('none');return false}catch(e){return String(e).includes('未启用')}})()");
    await check('非法开关参数被拒绝而不更改配置',"(async()=>{try{await gitFinder.config.setExperimentalFeature('tasks','true');return false}catch{const p=await gitFinder.config.get('experimentalFeatures');return p.tasks===false&&p.dashboard===false}})()");
    await client.evaluate("App.switchView('tree');App.persistWorkspaceTabs()");await stop();await launch();
    await check('再次重启仍全关，无旧标签绕过或后台刷新',"AppState.currentMode==='tree'&&!App._progressPollTimer&&document.querySelector('#btn-dashboard').hidden&&document.querySelector('#btn-project-tasks').hidden");
    await settings();await shot('testing-final-off.png');
    assert.equal(fs.readFileSync(ledger,'utf8'),original);results.push({name:'启用、关闭、跨窗口与重启全过程原台账字节不变',passed:true});
    assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checkedAt:new Date().toISOString(),executable,profile,results,exceptions,scope:'Owned disposable profile and synthetic ledger; native menu visibility covered by unit test, no real-user AI or account access.'},null,2));
    console.log(JSON.stringify({output,checks:results.length,passed:true}));
  } catch(error) {
    try{await shot('failure.png')}catch{}
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({executable,results,exceptions,error:error.stack},null,2));throw error;
  } finally { await stop(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
