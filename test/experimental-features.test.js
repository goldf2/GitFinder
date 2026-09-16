const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Features = require('../src/shared/experimentalFeatures');

const off = { dashboard: false, tasks: false };
test('新安装、旧配置和非布尔输入都默认关闭测试功能', () => {
  for (const input of [undefined, null, {}, true, ['tasks'], { tasks: 'true', dashboard: 1 }]) {
    assert.deepEqual(Features.normalize(input), off);
  }
  assert.deepEqual(Features.normalize({ tasks: true, dashboard: false, unknown: true }), { ...off, tasks: true });
});
test('测试开关独立，基础视图不被关闭', () => {
  assert.equal(Features.isViewEnabled({}, 'tasks'), false);
  assert.equal(Features.isViewEnabled({ dashboard: true }, 'tasks'), false);
  assert.equal(Features.isViewEnabled({ dashboard: true }, 'dashboard'), true);
  for (const view of ['tree', 'relationships', 'panel', 'settings']) assert.equal(Features.isViewEnabled({}, view), true);
});
test('旧标签与关闭标签恢复为文件浏览，保留路径、ID和历史且不改原对象', () => {
  const session = { activeTabId: 'a', tabs: [{ id: 'a', mode: 'tasks', path: '/project', history: ['/a','/project'] }, { id: 'b', mode: 'panel' }], closedTabs: [{ id: 'c', mode: 'dashboard', path: '/other' }] };
  const before = structuredClone(session), next = Features.gateSession(session, {});
  assert.deepEqual(session, before);
  assert.equal(next.tabs[0].mode, 'tree'); assert.equal(next.closedTabs[0].mode, 'tree');
  assert.equal(next.activeTabId, 'a'); assert.equal(next.tabs[1].mode, 'panel');
  assert.deepEqual(next.tabs[0].history, before.tabs[0].history);
  assert.equal(Features.gateSession(session, { tasks:true }).tabs[0].mode, 'tasks');
});
test('本机配置独立持久化且保存失败不改变内存开关', t => {
  const Config = require('../src/main/services/configService').constructor;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-labs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const c = new Config(); c.configDir = dir;
  assert.deepEqual(Features.normalize(c.get('experimentalFeatures')), off);
  c.setExperimentalFeature('tasks', true); c.setExperimentalFeature('dashboard', true);
  c.setExperimentalFeature('tasks', false);
  const reopen = new Config(); reopen.configDir = dir;
  assert.deepEqual(reopen.get('experimentalFeatures'), { dashboard:true, tasks:false });
  for (const [key, value] of [['unknown',true], ['tasks','true'], ['tasks',1]]) assert.throws(() => c.setExperimentalFeature(key, value));
  assert.throws(() => c.setRendererPreference('experimentalFeatures', { tasks:true }));
  c.saveConfig = () => { throw new Error('disk failed'); };
  assert.throws(() => c.setExperimentalFeature('tasks', true), /disk failed/);
  assert.equal(c.get('experimentalFeatures').tasks, false);
});
function ui(flags = off) {
  let calls = 0, intervals = 0, cleared = 0; const listeners = new Map();
  const AppState = { currentMode:'tasks', experimentalFeatures: flags, taskPortfolio:null };
  const document = { visibilityState:'visible', activeElement:null, getElementById:() => ({}), querySelector:() => null };
  const window = { ExperimentalFeatures:Features, gitFinder:{ projectTasks:{ getPortfolio:async () => { calls++; return { contentRevision:'new', tasks:[{ id:1 }] }; } } }, setInterval:() => ++intervals, clearInterval:() => cleared++, addEventListener:(name,fn) => listeners.set(name,fn), removeEventListener:(name) => listeners.delete(name) };
  const App = { isExperimentalViewEnabled:view => Features.isViewEnabled(AppState.experimentalFeatures,view), updateStatusBar() {}, renderProjectTasksView() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/scripts/projectProgress.js'),'utf8'), { App, AppState, window, document, console });
  return { App, AppState, window, listeners, counts:() => ({ calls, intervals, cleared }) };
}
test('测试区全关时不读取台账、不创建刷新定时器', async () => {
  const c=ui(); await c.App.readProjectProgressPortfolio(true); c.App.ensureProjectProgressPolling();
  assert.deepEqual(c.counts(), { calls:0, intervals:0, cleared:0 });
});
test('仅启用仪表盘时不在开发任务页启动刷新', () => {
  const c=ui({dashboard:true,tasks:false});c.App.ensureProjectProgressPolling();
  assert.equal(c.counts().intervals,0);
  c.AppState.currentMode='dashboard';c.App.ensureProjectProgressPolling();
  assert.equal(c.counts().intervals,1);
});
test('关闭或离开测试页清理定时器和focus监听，可重新启用', async () => {
  const c=ui({tasks:true});c.App.ensureProjectProgressPolling();c.App.ensureProjectProgressPolling();
  assert.equal(c.counts().intervals,1);
  c.App.stopProjectProgressPolling();assert.equal(c.counts().cleared,1);assert.equal(c.listeners.has('focus'),false);
  c.App.ensureProjectProgressPolling();assert.equal(c.counts().intervals,2);
  c.AppState.experimentalFeatures=off;await c.App._refreshProjectProgress();assert.equal(c.counts().calls,0);
});
test('开关关闭后的迟到台账读取不重新填充缓存', async () => {
  const c=ui({tasks:true});let finish;
  c.window.gitFinder.projectTasks.getPortfolio=() => new Promise(resolve => finish=resolve);
  const request=c.App.readProjectProgressPortfolio(true);await Promise.resolve();
  c.AppState.experimentalFeatures=off;c.App.stopProjectProgressPolling();c.App.invalidateProjectProgress();
  finish({contentRevision:'old',tasks:[{id:'stale'}]});await request;
  assert.equal(c.AppState.taskPortfolio,null);
});
test('无变化和输入中不重绘，停用后的任务跳转被拦截', async () => {
  const c=ui();let switches=0;c.App.switchView=() => switches++;
  await c.App.openProgressProjectTasks('example');assert.equal(switches,0);
});
test('主入口默认隐藏且加载统一门禁模块', () => {
  const html=fs.readFileSync(path.join(__dirname,'../src/renderer/index.html'),'utf8');
  for(const id of ['btn-dashboard','btn-project-tasks']) assert.match(html,new RegExp(`<button[^>]*id="${id}"[^>]*hidden`));
  assert.ok(html.indexOf('shared/experimentalFeatures.js')<html.indexOf('scripts/app.js'));
  assert.ok(html.includes('scripts/experimentalFeaturesController.js'));
});

function mainHandlers(flags) {
  const handlers = {}, calls = [];
  const service = new Proxy({}, {get: (_, key) => async () => { calls.push(key); return { tasks:[1] }; }});
  const context = { module:{exports:{}}, require: id => id === './security' ? {registerTrustedHandler:(n,h) => handlers[n]=h} : id.includes('experimentalFeatures') ? Features : id.includes('configService') ? {get:() => flags} : service };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main/ipc/projectTasks.js'),'utf8'), context);
  context.module.exports.registerProjectTasksIPC();
  return {handlers,calls};
}
test('主进程全关阻止台账读取和所有任务操作；仅仪表盘允许汇总但不允许写回', async () => {
  const flags={...off}, {handlers,calls}=mainHandlers(flags);
  assert.equal((await handlers['projectTasks:getPortfolio']({})).disabled,true);
  for(const [name,handler] of Object.entries(handlers)) if(!name.endsWith('getPortfolio')) await assert.rejects(handler({},'task'),/未启用/);
  assert.equal(calls.length,0);
  flags.dashboard=true;assert.equal((await handlers['projectTasks:getPortfolio']({})).tasks[0],1);
  await assert.rejects(handlers['projectTasks:applyStatusChange']({},'task'),/未启用/);
  flags.tasks=true;await handlers['projectTasks:getGitEvidence']({},'task');assert.equal(calls.at(-1),'getTaskEvidence');
});
test('跨窗口通知同步入口和旧标签，当前受限页退出且数据源不被修改', () => {
  const elements=[{dataset:{},setAttribute(){}}];let switches=[],persist=0;
  const AppState={experimentalFeatures:{dashboard:true,tasks:true},currentMode:'tasks',workspaceSession:{tabs:[{id:'a',mode:'tasks',path:'/project'}],closedTabs:[]}};
  const App={invalidateProjectProgress(){},renderWorkspaceTabs(){},scheduleWorkspaceTabsPersist(){persist++;},switchView:view=>switches.push(view)};
  const document={querySelectorAll:()=>elements,getElementById:()=>null};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/scripts/experimentalFeaturesController.js'),'utf8'),{App,AppState,document,window:{ExperimentalFeatures:Features}});
  App.applyExperimentalFeatures(off);assert.deepEqual(switches,['tree']);assert.equal(persist,1);
  assert.equal(AppState.workspaceSession.tabs[0].path,'/project');assert.equal(AppState.workspaceSession.tabs[0].mode,'tree');assert.equal(elements[0].hidden,true);
});
test('设置保存失败回退开关，显示错误且不应用新状态', async () => {
  let listener,applied=0;const input={checked:true,dataset:{experimentalFeature:'tasks'},addEventListener:(_,fn)=>listener=fn};const feedback={};
  const AppState={experimentalFeatures:off};const App={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/scripts/experimentalFeaturesController.js'),'utf8'),{App,AppState,document:{querySelectorAll:()=>[input],getElementById:()=>feedback},window:{ExperimentalFeatures:Features,gitFinder:{config:{setExperimentalFeature:async()=>{throw Error('disk full')}}}}});
  App.applyExperimentalFeatures=()=>applied++;App.bindExperimentalFeatureSettings();await listener();
  assert.equal(input.checked,false);assert.equal(input.disabled,false);assert.equal(applied,0);assert.match(feedback.textContent,/保存失败.*disk full/);
});
test('快速关闭再开启时，旧任务页面请求不能覆盖新缓存', async () => {
  const c=ui({tasks:true});let finish;
  c.App.readProjectProgressPortfolio=()=>new Promise(resolve=>finish=resolve);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/renderer/scripts/projectTasks.js'),'utf8'),{App:c.App,AppState:c.AppState,document:{getElementById:()=>({style:{}})},window:c.window,console});
  let paints=0;c.App.renderProjectTasksView=()=>paints++;
  const old=c.App.renderProjectTasks();c.App.invalidateProjectProgress();
  c.AppState.taskPortfolio={tasks:['fresh']};finish({tasks:['old']});await old;
  assert.deepEqual(c.AppState.taskPortfolio.tasks,['fresh']);assert.equal(paints,0);
});
test('配置IPC只有保存成功后才刷新原生菜单并广播所有窗口', async () => {
  const handlers={},items={dashboard:{visible:false},tasks:{visible:false}},events=[];let fail=false;
  const context={module:{exports:{}},require:id=>id.includes('configService')?{setExperimentalFeature:(key,value)=>{if(fail)throw Error('disk');return {...off,[key]:value};}}:id==='electron'?{
    Menu:{getApplicationMenu:()=>({getMenuItemById:id=>items[id.replace('experimental-view-','')]})},
    BrowserWindow:{getAllWindows:()=>[1,2].map(id=>({isDestroyed:()=>false,webContents:{send:(channel,flags)=>events.push({id,channel,flags})}}))}
  }:id==='./security'?{registerTrustedHandler:(key,handler)=>handlers[key]=handler}:{} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/main/ipc/config.js'),'utf8'),context);context.module.exports.registerConfigIPC();
  await handlers['config:setExperimentalFeature']({},'tasks',true);
  assert.equal(items.tasks.visible,true);assert.equal(items.dashboard.visible,false);assert.equal(events.length,2);
  fail=true;await assert.rejects(handlers['config:setExperimentalFeature']({},'tasks',false),/disk/);
  assert.equal(items.tasks.visible,true);assert.equal(events.length,2);
});

test('测试区窄窗口不为小开关预留130px宽度，说明保留可读空间', () => {
  const html=fs.readFileSync(path.join(__dirname,'../src/renderer/index.html'),'utf8');
  assert.match(html, /#settings-testing \.app-settings-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
});
