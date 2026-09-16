#!/usr/bin/env node
// Isolated Electron acceptance; no real profile, repository ledger, or backend is modified.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const parent = fs.mkdtempSync(path.join(root, 'dist', 'progress-ui-'));
  const profile = path.join(parent, 'profile'), managed = path.join(profile, 'projects');
  fs.mkdirSync(managed, { recursive: true });
  const now = new Date().toISOString();
  const store = { schema_version: 1, project: 'store', revision: 1, updated_at: now, current_next_task: 'ADM-01', tasks: [
    { id: 'PLAN-01', title: '文档与接续方案', kind: 'documentation', status: 'done', owner: 'Test', priority: 'P0', milestone: 'M0', depends_on: [], acceptance: ['资料完整'], evidence: [{ path: 'docs/result.md', kind: 'verification', result: 'passed' }], next_action: '实施权限', implementation: 'documentation_only', deployment: 'not_applicable' },
    { id: 'ADM-01', title: '权限服务 <script>bad()</script>', kind: 'feature', status: 'blocked', owner: null, priority: 'P0', milestone: 'M1', depends_on: ['PLAN-01'], acceptance: ['真实账号验收'], evidence: [], blockers: ['等待部署确认'], next_action: '先完成隔离验证', implementation: 'not_started', deployment: 'not_started' }
  ] };
  const desktop = { schemaVersion: 1, updatedAt: now, nextTaskId: 'GF-NEXT', milestones: [{ id: 'GF-P0', title: '桌面进度' }], tasks: [
    { id: 'GF-DELIVERED', title: '历史交付', status: 'delivered', owner: 'Test', priority: 'P1', milestone: 'GF-P0', dependsOn: [], acceptance: ['安装验证'], evidence: ['docs/install.md'], nextAction: '等待反馈', userAcceptance: 'pending', delivery: { version: '1.0', sourceCommit: 'a'.repeat(40) } },
    { id: 'GF-NEXT', title: '下一任务', status: 'verified', owner: 'Test', priority: 'P1', milestone: 'GF-P0', dependsOn: ['GF-DELIVERED'], acceptance: ['正常安装'], evidence: [], nextAction: '打包', userAcceptance: 'not_required' }
  ] };
  const files = [[path.join(managed, 'store/docs/00-handoff/TASKS.json'), store], [path.join(managed, 'desktop/management/development-tasks.json'), desktop]];
  for (const [file, data] of files) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ experimentalFeatures: { dashboard: true, tasks: true }, treeRoots: [{ path: managed, name: '进度验收', expanded: true }], defaultScanPath: managed, lastPath: managed, automaticUpdateChecks: false, themeMode: 'light', themeScheme: 'github', sidebarHidden: false, detailPanelHidden: true }));
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const appIndex = process.argv.indexOf('--app');
  const executable = appIndex >= 0 ? path.resolve(process.argv[appIndex + 1]) : require('electron');
  assert.ok(fs.existsSync(executable), 'Electron executable missing');
  const args = [...(appIndex >= 0 ? [] : [root]), `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'];
  const log = fs.openSync(path.join(parent, 'electron.log'), 'a');
  const child = spawn(executable, args, { cwd: root, stdio: ['ignore', log, log] });
  const results = [], exceptions = [];
  let socket;
  try {
    let page;
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error(`Test Electron exited: ${child.exitCode}`);
      try { const pages = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1000) })).json(); page = pages.find(item => item.type === 'page' && item.url.endsWith('/src/renderer/index.html')); } catch {}
      if (page) break;
      await delay(250);
    }
    assert.ok(page, 'Isolated renderer not ready');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0; const pending = new Map();
    socket.addEventListener('message', event => {
      const reply = JSON.parse(event.data);
      if (reply.method === 'Runtime.exceptionThrown') exceptions.push(reply.params.exceptionDetails);
      const request = pending.get(reply.id); if (!request) return;
      pending.delete(reply.id); clearTimeout(request.timer);
      if (reply.error) request.reject(new Error(JSON.stringify(reply.error))); else request.resolve(reply.result);
    });
    function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 30000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
    async function evaluate(expression) { const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails)); return reply.result.value; }
    async function wait(expression, timeout = 20000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } const diagnostic = await evaluate("JSON.stringify({mode:AppState.currentMode,visibility:document.visibilityState,active:document.activeElement?.tagName,activeId:document.activeElement?.id,timer:App._progressPollTimer,polling:App._progressPolling,read:!!App._progressReadPromise,loading:AppState.taskPortfolioLoading,edit:AppState.taskEditTaskKey,create:AppState.taskCreateDraft,preview:AppState.taskStatusPreview,milestone:AppState.milestoneEditKey,flags:AppState.experimentalFeatures,stats:AppState.dashboardStats&&{count:AppState.dashboardStats.taskCount,blocked:AppState.dashboardStats.taskBlockedCount,progress:AppState.dashboardStats.taskInProgressCount},tasks:AppState.taskPortfolio?.tasks?.map(t=>({id:t.taskId,status:t.sourceStatus}))})"); fs.writeFileSync(path.join(parent,'timeout-diagnostic.json'),diagnostic); throw new Error(`Condition timeout: ${expression}`); }
    async function check(name, expression) { assert.equal(await evaluate(expression), true, name); results.push({ name, passed: true }); console.log(name); }
    async function click(selector) {
      const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error('Missing enabled element');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }); await delay(120);
    }
    async function screenshot(name) { const shot = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(parent, name), Buffer.from(shot.data, 'base64')); }
    await send('Runtime.enable'); await send('Page.bringToFront');
    await wait("typeof App!=='undefined' && typeof AppState!=='undefined' && App._treeRoots?.length===1 && document.readyState==='complete'");
    await evaluate("App.switchView('dashboard')");
    await wait("AppState.dashboardStats?.sourceProjects?.length===2 && document.querySelectorAll('[data-dashboard-task-project]').length===2");
    await check('无Git仓库的两种台账也进入仪表盘且首次进入即启用刷新', "!!App._progressPollTimer && AppState.dashboardStats.taskCount===4 && AppState.dashboardStats.taskCompletedCount===2 && AppState.dashboardStats.taskBlockedCount===1 && AppState.dashboardStats.documentationTaskCount===1");
    await check('已有台账不提示初始化另一份控制CSV', "!document.querySelector('#dashboard-init-missing-btn') && AppState.dashboardStats.missingControlProjects.length===0");
    await screenshot('dashboard.png');
    const projectId = await evaluate("AppState.taskPortfolio.projects.find(p=>p.name==='store').projectId");
    await click(`[data-dashboard-task-project="${projectId}"]`);
    await wait("AppState.currentMode==='tasks' && document.querySelector('#task-refresh')");
    await check('点击仪表盘项目定位同源开发任务而非更改主题', `AppState.taskFilters.projectId===${JSON.stringify(projectId)} && AppState.themeMode==='light' && App.getFilteredProjectTasks().length===2`);
    await click(`[data-task-key="${projectId}:ADM-01"]`);
    await wait("document.querySelector('.repository-task-detail')?.textContent.includes('等待部署确认')");
    await check('任务详情包含前置、阻塞、原状态和只读来源', "document.querySelector('.repository-task-detail').textContent.includes('PLAN-01') && document.querySelector('.repository-task-detail').textContent.includes('blocked') && !!document.querySelector('[data-task-source-path]')");
    await check('台账任务没有绕过验收的编辑或状态写回按钮', "!document.querySelector('[data-task-status-preview]') && !document.querySelector('[data-task-edit]') && !document.querySelector('#task-create') && !document.querySelector('.repository-task-detail script')");
    await screenshot('task-details.png');
    await evaluate("App.switchView('dashboard')"); await wait("document.querySelector('#dashboard-progress-refresh')");
    store.tasks[1].status='in_progress';store.tasks[1].owner='Fixture';store.tasks[1].blockers=[];store.tasks[1].title='权限服务：真实文件已更新';store.updated_at=new Date().toISOString();store.revision++;
    fs.writeFileSync(files[0][0],JSON.stringify(store,null,2));
    await send('Page.bringToFront');
    await wait("AppState.dashboardStats?.taskBlockedCount===0 && AppState.dashboardStats?.taskInProgressCount===1",25000);
    await check('外部修改源文件后前台定期刷新任务与仪表盘', "AppState.taskPortfolio.tasks.some(t=>t.title==='权限服务：真实文件已更新')");
    fs.writeFileSync(files[0][0],'{invalid');
    await click('#dashboard-progress-refresh');
    await wait("AppState.dashboardStats?.unavailableProjects?.length===1");
    await check('坏台账显示数据源异常且不回退为假正常', "AppState.dashboardStats.taskCount===2 && AppState.dashboardStats.missingControlProjects.length===0 && document.querySelector('.dashboard-source-list').textContent.includes('数据源异常')");
    fs.writeFileSync(files[0][0],JSON.stringify(store,null,2));
    await click('#dashboard-progress-refresh');await wait("AppState.dashboardStats?.taskCount===4 && AppState.dashboardStats.unavailableProjects.length===0");
    await send('Emulation.setDeviceMetricsOverride',{width:800,height:780,deviceScaleFactor:1,mobile:false});
    await check('窄屏任务源卡片保持在仪表盘容器内', "[...document.querySelectorAll('.dashboard-source-item')].every(e=>e.scrollWidth<=e.clientWidth+1)");
    await screenshot('dashboard-narrow.png');await send('Emulation.clearDeviceMetricsOverride');
    assert.deepEqual(JSON.parse(fs.readFileSync(files[1][0],'utf8')),desktop);
    assert.deepEqual(JSON.parse(fs.readFileSync(files[0][0],'utf8')),store);
    results.push({name:'App没有修改原台账字节或生成第二份任务源',passed:true});
    assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    const report={checkedAt:new Date().toISOString(),executable,profile,port,results,exceptions,scope:'Dedicated test profile and synthetic repository ledgers; no user acceptance inferred.'};
    fs.writeFileSync(path.join(parent,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output:parent,checks:results.length,passed:true}));
  } catch(error) {
    fs.writeFileSync(path.join(parent,'result.json'),JSON.stringify({checkedAt:new Date().toISOString(),executable,results,exceptions,error:error.stack},null,2));
    console.error('Evidence:',parent);throw error;
  } finally {
    if(socket)socket.close();child.kill('SIGTERM');await delay(400);if(child.exitCode===null)child.kill('SIGKILL');fs.closeSync(log);
  }
}
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
main().catch(error=>{console.error(error);process.exitCode=1;});
