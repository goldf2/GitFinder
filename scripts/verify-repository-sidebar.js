#!/usr/bin/env node
// Uses a disposable profile and project; --open-codex points only to an existing chat.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function start(profile, output) {
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(output, 'electron.log'), 'a');
  const child = spawn(require('electron'), [root, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: root, env, stdio: ['ignore', log, log] });
  let socket, sequence = 0; const pending = new Map();
  const close = async () => {
    socket?.close();
    for (const request of pending.values()) clearTimeout(request.timer);
    if (child.exitCode === null) { child.kill('SIGTERM'); for (let i = 0; i < 60 && child.exitCode === null; i++) await delay(100); }
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.closeSync(log);
  };
  try {
    let page;
    for (let i = 0; i < 150; i++) {
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(p => p.type === 'page' && p.url.endsWith('src/renderer/index.html')); if (page) break; } catch (_) {}
      if (child.exitCode !== null) throw Error('Fixture app exited'); await delay(100);
    }
    assert.ok(page, 'Renderer unavailable'); socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', j, { once: true }); });
    socket.addEventListener('message', event => { const reply = JSON.parse(event.data), request = pending.get(reply.id); if (!request) return; pending.delete(reply.id); clearTimeout(request.timer); reply.error ? request.reject(Error(JSON.stringify(reply.error))) : request.resolve(reply.result); });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timeout`)); }, 25000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (reply.exceptionDetails) throw Error(JSON.stringify(reply.exceptionDetails)); return reply.result.value; };
    const wait = async expression => { for (let i = 0; i < 700; i++) { if (await evaluate(expression)) return; await delay(100); } throw Error(`Condition timeout: ${expression}`); };
    const click = async selector => { const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Control missing');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`); for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...point }); };
    const fill = async (selector, value) => { const field = `#project-chat-modal ${selector}`; await click(field); await evaluate(`document.querySelector(${JSON.stringify(field)}).select()`); await send('Input.insertText', { text: value }); };
    const shot = async name => { const result = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name), Buffer.from(result.data, 'base64')); };
    await wait("typeof App!=='undefined'&&App.projectConversationsController&&AppState.localProjects.length>=2");
    return { close, evaluate, wait, click, fill, shot };
  } catch (error) { await close(); throw error; }
}

async function main() {
  const output = fs.mkdtempSync(path.join(root, 'dist', 'sidebar225-ui-'));
  const profile = path.join(output, 'profile'), managed = path.join(profile, 'projects');
  const explicit = path.join(managed, 'existing'), automatic = path.join(managed, 'automatic'), ordinary = path.join(managed, 'ordinary');
  for (const directory of [explicit, automatic, ordinary]) fs.mkdirSync(directory, { recursive: true });
  const explicitId = 'project_11111111-1111-4111-8111-111111111111', ordinaryId = 'project_22222222-2222-4222-8222-222222222222';
  for (const [directory, projectId, name] of [[explicit, explicitId, '原有项目'], [ordinary, ordinaryId, '规划项目']]) {
    fs.mkdirSync(path.join(directory, '.gitfinder'));
    fs.writeFileSync(path.join(directory, '.gitfinder', 'project.json'), JSON.stringify({ schemaVersion: 1, projectId, name, repositories: { excluded: [] } }));
  }
  for (const directory of [explicit, automatic]) {
    execFileSync('git', ['init', '--quiet', directory]);
    execFileSync('git', ['-C', directory, 'remote', 'add', 'origin', 'https://github.com/goldf2/GitFinder.git']);
    fs.writeFileSync(path.join(directory, 'README.md'), '# Project fixture');
  }
  fs.mkdirSync(path.join(automatic, 'management'));
  fs.writeFileSync(path.join(automatic, 'management/development-tasks.json'), JSON.stringify({ schemaVersion: 1, updatedAt: '2026-10-01T15:30:00+08:00', tasks: [{ id: 'TEST-001', title: '统一项目任务', status: 'in_progress', priority: 'P1', owner: 'Codex', dependsOn: [], acceptance: [], evidence: [], nextAction: '验证' }] }));
  fs.mkdirSync(path.join(automatic, 'docs/ai-context'), { recursive: true });
  fs.writeFileSync(path.join(automatic, 'docs/ai-context/INDEX.md'), '# 项目接续记录');
  fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ treeRoots: [{ path: managed, name: '验收' }], lastPath: managed, defaultScanPath: managed, autoRefresh: false, automaticUpdateChecks: false, detailPanelHidden: true, themeMode: 'light' }));
  execFileSync('git', ['-C', automatic, 'remote', 'set-url', 'origin', 'https://github.com/goldf2/sidebar-fixture.git']);
  for (let i=0;i<35;i++) {
    const directory=path.join(managed, `repo-${String(i).padStart(2,'0')}`);
    fs.mkdirSync(directory);execFileSync('git',['init','--quiet',directory]);
  }
  fs.writeFileSync(path.join(profile, 'tags.json'), JSON.stringify({version:2,tags:Array.from({length:80},(_,i)=>({id:`tag-${i}`,name:`技术：标签${String(i).padStart(2,'0')}`,color:'#3b82f6'})),repoTags:{}}));
  const manifest = fs.readFileSync(path.join(explicit, '.gitfinder/project.json'), 'utf8');
  const checks = []; let app;
  const check = async (name, expr) => { assert.equal(await app.evaluate(expr), true, name); checks.push(name); console.log('PASS', name); };
  // DOM clicks dispatch actual application handlers without relying on prior panel geometry.
  const click = selector => app.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});e.click()})()`);
  console.log('Evidence:', output);
  try {
    app = await start(profile, output);
    await app.evaluate("App.projectShortcutsController.setNavigationMode('projects')");
    await app.wait("AppState.allRepos.length===37&&document.querySelectorAll('.repo-card').length>0");
    await click('[data-new-repository-category]');
    await app.wait("document.querySelector('#project-group-modal').style.display==='flex'");
    await app.evaluate(`document.querySelector('#project-group-name').value='研发分类';document.querySelector('#project-group-projects').value=${JSON.stringify('repository:'+automatic)}`);
    await click('#project-group-save-btn');
    await app.wait("document.querySelector('#project-group-modal').style.display==='none'&&AppState.projectGroups.some(g=>g.name==='研发分类')");
    const groupId=await app.evaluate("AppState.projectGroups.find(g=>g.name==='研发分类').groupId");
    await check('新建分类可直接选择无属性仓库并绑定目录属性', `AppState.localProjects.some(p=>p.path===${JSON.stringify(automatic)}&&AppState.projectGroups.find(g=>g.groupId==='${groupId}').projectIds.includes(p.projectId))`);
    await click(`[data-repository-type="${groupId}"]`);
    await app.wait("document.querySelectorAll('.repo-card').length===1");
    await check('新分类筛选立即显示选择的仓库', `document.querySelector('.repo-card').dataset.path===${JSON.stringify(automatic)}`);
    await click(`[data-repository-category-edit="${groupId}"]`);
    await app.wait("!document.querySelector('#project-group-save-btn').disabled");
    await app.evaluate(`document.querySelector('#project-group-name').value='研发更新';document.querySelector('#project-group-projects').value='${explicitId}'`);
    await click('#project-group-save-btn');
    await app.wait(`document.querySelector('.repo-card')?.dataset.path===${JSON.stringify(explicit)}`);
    await check('编辑分类后当前筛选即时更新', `document.querySelector('[data-repository-type="${groupId}"]').textContent.includes('研发更新')`);
    await app.evaluate("App.applyContentPreset('all-repositories')");
    await app.evaluate(`(async()=>{await gitFinder.tags.addRepo('tag-0',${JSON.stringify(explicit)});await gitFinder.tags.addRepo('tag-0',${JSON.stringify(automatic)});await gitFinder.tags.addRepo('tag-1',${JSON.stringify(explicit)});await App.loadTags();await App._enrichReposAsync(true);})()`);
    await app.wait("document.querySelectorAll('.sidebar-tag-item').length===80");
    await check('热力图显示真实仓库计数及不同深浅', "document.querySelector('[data-tag-id=tag-0]').dataset.heat==='5'&&document.querySelector('[data-tag-id=tag-1]').dataset.heat==='3'&&document.querySelector('[data-tag-id=tag-2]').dataset.heat==='0'&&document.querySelector('[data-tag-id=tag-0] .sidebar-tag-count').textContent==='2'");
    await app.evaluate("document.querySelector('[data-tag-id=tag-0]').focus();document.querySelector('[data-tag-id=tag-0]').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}))");
    await app.wait("document.querySelectorAll('.repo-card').length===2");
    await check('键盘选择标签筛选仓库并显示选中状态', "AppState.selectedTags.includes('tag-0')&&document.querySelector('[data-tag-id=tag-0]').getAttribute('aria-pressed')==='true'");
    await click('[data-tag-id=tag-0]');
    await app.evaluate("const s=document.querySelector('#sidebar-tag-search');s.value='标签79';s.dispatchEvent(new Event('input',{bubbles:true}))");
    await check('大量标签可搜索定位', "document.querySelectorAll('.sidebar-tag-item').length===1&&document.querySelector('.sidebar-tag-item').dataset.tagId==='tag-79'");
    await app.evaluate("document.querySelector('#sidebar-tag-search').value='';document.querySelector('#sidebar-tag-search').dispatchEvent(new Event('input',{bubbles:true}))");
    await app.evaluate("document.querySelector('#tags-sidebar-section').classList.remove('collapsed')");
    await app.evaluate("document.querySelector('#app').style.height='620px';document.querySelector('#sidebar').style.width='300px'");
    await check('短窗口仓库与标签都有独立滚动空间及可见滚动条', "['repository-shortcuts-list','tags-filter-list'].every(id=>{const e=document.getElementById(id);return e.clientHeight>60&&e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==='scroll'&&getComputedStyle(e,'::-webkit-scrollbar').width==='9px'})");
    await check('标签网格每行多个色块，添加按钮不被挤出', "getComputedStyle(document.querySelector('#tags-filter-list')).gridTemplateColumns.split(' ').length>=2&&document.querySelector('#add-tag-bottom-btn').getBoundingClientRect().bottom<=document.querySelector('#sidebar').getBoundingClientRect().bottom+1");
    await check('两个区域可以分别滚动且互不带动', "(()=>{const r=document.querySelector('#repository-shortcuts-list'),t=document.querySelector('#tags-filter-list');r.scrollTop=100;t.scrollTop=150;return r.scrollTop===100&&t.scrollTop===150})()");
    await app.evaluate("document.querySelector('#repository-shortcuts-list').scrollTop=0;document.querySelector('#tags-filter-list').scrollTop=0");
    await app.shot('sidebar-light.png');
    await app.evaluate("document.documentElement.dataset.mode='dark';document.documentElement.dataset.effectiveMode='dark'");await app.shot('sidebar-dark.png');
    await click('#tags-sidebar-section .sidebar-title');
    await check('折叠标签区释放空间，展开恢复网格', "getComputedStyle(document.querySelector('#tags-filter-list')).display==='none'");
    await click('#tags-sidebar-section .sidebar-title');
    await app.close();app=null;
    app=await start(profile,output);
    await check('重开保留分类修改和原始标签', `AppState.projectGroups.find(g=>g.groupId==='${groupId}').name==='研发更新'&&AppState.tags.tags.length===80`);
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({version:require('../package.json').version,checks,passed:checks.length},null,2));
    console.log('PASSED',checks.length);
  } catch(error) { if(app)await app.shot('failure.png').catch(()=>{}); throw error; }
  finally { if(app)await app.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
