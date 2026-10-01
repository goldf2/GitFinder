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
  const appIndex = process.argv.indexOf('--app');
  const executable = appIndex < 0 ? require('electron') : process.argv[appIndex + 1];
  const child = spawn(executable, [...(appIndex < 0 ? [root] : []), `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: root, env, stdio: ['ignore', log, log] });
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
    const drag = async (selector, destination) => {
      const from = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent', { type:'mouseMoved', ...from });
      await send('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', buttons:1, clickCount:1, ...from });
      for(let i=1;i<=12;i++) { await send('Input.dispatchMouseEvent', { type:'mouseMoved', button:'left', buttons:1, x:from.x+(destination.x-from.x)*i/12, y:from.y+(destination.y-from.y)*i/12 }); await delay(16); }
      await send('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', clickCount:1, ...destination });
    };
    await wait("typeof App!=='undefined'&&App.projectConversationsController&&AppState.localProjects.length>=2");
    return { close, evaluate, wait, click, fill, shot, drag, send };
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
  const click = selector => app.click(selector);
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
    await app.evaluate(`App.projectShortcutsController.recentRepositoryPaths=[${JSON.stringify(explicit)},${JSON.stringify(automatic)}];App.projectShortcutsController.render()`);
    await click('[data-tag-id=tag-1]');
    await app.wait("document.querySelectorAll('.repo-card').length===1");
    await check('多标签同时满足且最近仓库和分类成员同步', `AppState.selectedTags.length===2&&document.querySelector('.repo-card').dataset.path===${JSON.stringify(explicit)}&&[...document.querySelectorAll('#repository-shortcuts-list [data-repository-shortcut-path]')].every(e=>e.dataset.repositoryShortcutPath===${JSON.stringify(explicit)})`);
    await check('显示多选规则及清除入口', "document.querySelector('#sidebar-tag-selection-summary').textContent==='已选 2 项 · 同时满足'&&!document.querySelector('#sidebar-tag-clear').disabled");
    await click('#sidebar-tag-clear');
    await app.wait("document.querySelectorAll('.repo-card').length===37");
    await check('清除标签恢复完整列表', "AppState.selectedTags.length===0&&document.querySelector('#sidebar-tag-clear').disabled");
    await app.evaluate(`App.openWorkspaceRepository(${JSON.stringify(automatic)})`);
    await app.wait("!!document.querySelector('#git-workspace-view')");
    await check('仓库详情保留可见标签入口', "getComputedStyle(document.querySelector('#tags-sidebar-section')).display!=='none'");
    await app.evaluate("AppState.filterEnabled.tag=false");
    await click('[data-tag-id=tag-1]');
    await app.wait("!AppState.workspaceRepository&&document.querySelectorAll('.repo-card').length===1");
    await check('仓库详情点击标签直接进入有效筛选列表', `AppState.filterEnabled.tag&&document.querySelector('.repo-card').dataset.path===${JSON.stringify(explicit)}`);
    await click('#sidebar-tag-clear');
    await app.evaluate("(async()=>{await gitFinder.tags.update('tag-0',{name:'形态:APP'});await gitFinder.tags.update('tag-1',{name:'平台:macOS'});await App.loadTags()})()");
    await check('现有标签按形态平台等维度分区', "[...document.querySelectorAll('.sidebar-tag-dimension')].map(e=>e.textContent).join(',')==='形态,平台,技术'");
    await check('维度分组下标签不重复前缀', "document.querySelector('[data-tag-id=tag-0] .sidebar-item-name').textContent==='APP'&&document.querySelector('[data-tag-id=tag-1] .sidebar-item-name').textContent==='macOS'");
    await click('[data-tag-id=tag-0]');
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
    await app.wait("document.querySelector('.sidebar-section-resize')!==null");
    const beforeResize = await app.evaluate("document.querySelector('#tags-sidebar-section').getBoundingClientRect().height");
    const resizeTo = await app.evaluate("(()=>{const r=document.querySelector('.sidebar-section-resize').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2-60}})()");
    await app.drag('.sidebar-section-resize',resizeTo);
    await app.wait("!!App.sidebarLayoutController.sizes.tags");
    await check('分隔线真实拖动调整两个区域高度', `document.querySelector('#tags-sidebar-section').getBoundingClientRect().height>${beforeResize+50}&&document.querySelector('#repository-shortcuts-list').clientHeight>40`);
    const moveTo = await app.evaluate("(()=>{const r=document.querySelector('#repository-shortcuts-sidebar-section .sidebar-title').getBoundingClientRect();return{x:r.x+20,y:r.y+3}})()");
    await app.drag('#tags-sidebar-section .sidebar-drag-handle',moveTo);
    await check('标题手柄真实拖动将属性标签移到仓库上方', "App.sidebarLayoutController.visibleSections()[0].dataset.sectionId==='tags'&&document.querySelectorAll('.sidebar-section-resize').length===1");
    await click('.sidebar-section-resize');
    await app.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
    await app.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
    await check('调整后上下区域及添加按钮保持可达', "document.querySelector('#repository-shortcuts-list').clientHeight>40&&document.querySelector('#tags-filter-list').clientHeight>60&&document.querySelector('#add-tag-bottom-btn').getBoundingClientRect().bottom<document.querySelector('#repository-shortcuts-sidebar-section').getBoundingClientRect().top");
    const savedSizes=await app.evaluate("JSON.stringify(App.sidebarLayoutController.sizes)");
    await app.wait(`(async()=>JSON.stringify(await gitFinder.config.get('sidebarSectionSizes'))===${JSON.stringify(savedSizes)})()`);
    await click('#tags-sidebar-section .sidebar-title-text');
    await check('自定高度后折叠标签，仓库填满剩余空间', "document.querySelector('#sidebar').getBoundingClientRect().bottom-document.querySelector('#repository-shortcuts-sidebar-section').getBoundingClientRect().bottom<25");
    await click('#tags-sidebar-section .sidebar-title-text');
    await click('#sidebar-navigation-directories');
    await app.wait("AppState.sidebarNavigationMode==='directories'");
    await check('切换文件浏览不显示隐藏区域的分隔线', "document.querySelectorAll('.sidebar-section-resize').length===0&&!document.querySelector('#locations-sidebar-section').hidden");
    await click('#sidebar-navigation-projects');
    await app.wait("document.querySelectorAll('.sidebar-section-resize').length===1");
    await check('回到仓库恢复自定顺序与高度偏好', `App.sidebarLayoutController.visibleSections()[0].dataset.sectionId==='tags'&&JSON.stringify(App.sidebarLayoutController.sizes)===${JSON.stringify(savedSizes)}`);
    await app.shot('sidebar-custom-layout.png');
    await app.close();app=null;
    app=await start(profile,output);
    await app.wait("!!App.sidebarLayoutController");
    await check('重开保留分类修改和原始标签', `AppState.projectGroups.find(g=>g.groupId==='${groupId}').name==='研发更新'&&AppState.tags.tags.length===80`);
    await check('重开保留侧栏顺序和高度偏好', `App.sidebarLayoutController.visibleSections()[0].dataset.sectionId==='tags'&&Object.entries(${savedSizes}).every(([id,size])=>App.sidebarLayoutController.sizes[id]===size)`);
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({version:require('../package.json').version,checks,passed:checks.length},null,2));
    console.log('PASSED',checks.length);
  } catch(error) { if(app)await app.shot('failure.png').catch(()=>{}); throw error; }
  finally { if(app)await app.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
