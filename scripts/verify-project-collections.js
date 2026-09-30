#!/usr/bin/env node
// Project list and classification checks run only in a disposable profile.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const output = fs.mkdtempSync(path.join(root, 'dist', 'project-collections-ui-'));
  const profile = path.join(output, 'profile'), managed = path.join(profile, 'projects');
  fs.mkdirSync(managed, { recursive: true });
  const ids = [1, 2, 3].map(n => `project_${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`);
  const groups = ['project_group_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'project_group_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
  const directories = ['long', 'short', 'empty'].map(name => path.join(managed, name));
  directories.forEach((directory, i) => {
    fs.mkdirSync(path.join(directory, '.gitfinder'), { recursive: true });
    fs.writeFileSync(path.join(directory, '.gitfinder', 'project.json'), JSON.stringify({ schemaVersion: 1, projectId: ids[i], name: ['长简介与多个仓库的项目', '短简介项目', '空简介项目'][i], description: ['这是一段很长的简介，用于验证描述不会把同一行卡片和按钮撑到不同高度。'.repeat(30), '简单说明', ''][i], color: 'blue', lifecycle: 'active', repositories: { excluded: [] } }));
  });
  for (const name of ['one', 'two', 'three']) {
    const directory = path.join(directories[0], name); fs.mkdirSync(directory);
    execFileSync('git', ['init', '--quiet', directory]);
  }
  fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ treeRoots: [{ path: managed, name: '隔离项目', expanded: true }], lastPath: managed, defaultScanPath: managed, autoRefresh: false, automaticUpdateChecks: false, detailPanelHidden: true, projectCardSize: 'medium', themeMode: 'light', projectGroups: { version: 1, groups: [{ groupId: groups[0], name: '管理类', color: 'blue', projectIds: [ids[0], ids[1]] }, { groupId: groups[1], name: '工具类', color: 'purple', projectIds: [ids[2]] }] } }));
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const appIndex = process.argv.indexOf('--app'), executable = appIndex >= 0 ? path.resolve(process.argv[appIndex + 1]) : require('electron');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(output, 'electron.log'), 'a');
  const child = spawn(executable, [...(appIndex < 0 ? [root] : []), `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: root, env, stdio: ['ignore', log, log] });
  let socket; const pending = new Map(), results = []; let sequence = 0;
  console.log('Evidence:', output);
  try {
    let page;
    for (let i = 0; i < 150; i++) {
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(p => p.type === 'page' && p.url.endsWith('src/renderer/index.html')); if (page) break; } catch (_) {}
      if (child.exitCode !== null) throw Error('Fixture app exited'); await delay(100);
    }
    assert.ok(page, 'Renderer unavailable'); socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', j, { once: true }); });
    socket.addEventListener('message', e => { const reply = JSON.parse(e.data), request = pending.get(reply.id); if (!request) return; pending.delete(reply.id); clearTimeout(request.timer); reply.error ? request.reject(Error(JSON.stringify(reply.error))) : request.resolve(reply.result); });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timeout`)); }, 25000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (reply.exceptionDetails) throw Error(JSON.stringify(reply.exceptionDetails)); return reply.result.value; };
    const wait = async expression => { for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); } throw Error(`Condition timeout: ${expression}; state=${JSON.stringify(await evaluate("({query:AppState.contentQuery,visible:AppState.visibleItems.map(x=>x.path),filtered:App._filterByCategory(App._prepareDisplayRepos()).map(x=>x.path)})"))}`); };
    const check = async (name, expression) => { assert.equal(await evaluate(expression), true, name); results.push(name); console.log('PASS', name); };
    const click = async (selector, button = 'left') => { const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Control missing');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`); await send('Input.dispatchMouseEvent', { type: 'mousePressed', button, clickCount: 1, ...point }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button, clickCount: 1, ...point }); };
    const shot = async name => { await delay(300); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name), Buffer.from(r.data, 'base64')); };
    await wait("typeof App!=='undefined'&&typeof AppState!=='undefined'&&AppState.localProjects.length===3");
    await evaluate("App.applyContentPreset('all-projects')"); await wait("!AppState.localProjectsLoading&&document.querySelectorAll('.local-project-card').length===3");
    await click('#sidebar-navigation-projects');
    await wait("App.contentCollectionKind()==='projects'&&!AppState.localProjectsLoading");
    await check('项目入口同步主内容区，标题已在应用顶栏', "document.querySelector('.toolbar #current-path').textContent.includes('所有项目')&&document.querySelectorAll('.local-project-card').length===3");
    await check('取消独立标题行和设为项目按钮', "!document.querySelector('.local-project-view-toolbar')&&!document.querySelector('#content-area [data-app-action=choose-local-project]')");
    await check('显示控制位于顶部标题栏', "!!document.querySelector('.toolbar #sort-menu-trigger')");
    for (const width of [1560, 900, 620]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 980, deviceScaleFactor: 1, mobile: false });
      await click('#sort-menu-trigger');
      await check(`${width}px 标题与显示菜单可见`, "(()=>{const t=document.querySelector('#current-path').getBoundingClientRect(),m=document.querySelector('#sort-menu').getBoundingClientRect();return t.width>25&&m.left>=0&&m.right<=innerWidth+1&&!document.querySelector('#project-display-options').hidden&&document.querySelector('#directory-display-options').hidden;})()");
      await click('[data-project-card-size=small]');
    }
    await send('Emulation.clearDeviceMetricsOverride');
    for (const size of ['small','medium','large']) {
      await click('#sort-menu-trigger');await click(`[data-project-card-size=${size}]`);
      await wait(`document.querySelector('.local-project-grid').dataset.size==='${size}'`);
      await check(`菜单设置${size}立即生效并保存`, `(async()=>(await gitFinder.config.get('projectCardSize'))==='${size}')()`);
    }
    await evaluate('App.renderProjectsView()');await wait("!AppState.localProjectsLoading");
    await click('#sort-menu-trigger');await check('重绘后菜单记住卡片大小', "document.querySelector('[data-project-card-size=large]').getAttribute('aria-checked')==='true'");await click('#sort-menu-trigger');
    await evaluate(`(async()=>{await App.projectShortcutsController.recordVisit(${JSON.stringify(directories[0])});App.projectShortcutsController.render()})()`);
    await check('最近位于按类型之前', "document.querySelector('#project-shortcuts-list [data-recent-toggle]').getBoundingClientRect().top<document.querySelector('[data-project-types-toggle]').getBoundingClientRect().top");
    await click(`#project-shortcuts-list [data-type-toggle="${groups[0]}"]`);await wait("!AppState.localProjectsLoading&&document.querySelectorAll('.local-project-card').length===2");
    await check('展开类型同时筛选主区并在类型下显示项目', `document.querySelector('#current-path').textContent.includes('管理类')&&document.querySelector('#project-shortcuts-list [data-type-members="${groups[0]}"]').querySelectorAll('[data-project-shortcut-id]').length===2&&!document.querySelector('#project-shortcuts-list').textContent.includes('项目目录')`);
    await shot('projects-titlebar.png');
    await click(`#project-shortcuts-list [data-type-toggle="${groups[0]}"]`);await check('类型可折叠', `!document.querySelector('#project-shortcuts-list [data-type-members="${groups[0]}"]')`);
    await click('.local-project-card h3','right');await wait("!document.querySelector('#file-context-menu').hidden");await check('右键项目设置仍可使用', "!document.querySelector('[data-context-action=project]').disabled");await evaluate("document.querySelector('#file-context-menu').hidden=true");
    await evaluate("AppState.searchQuery='no-match';App.renderProjectsView()");await wait("!AppState.localProjectsLoading&&!!document.querySelector('.local-project-empty')");
    await check('空结果标题显示零且没有设为项目按钮', "document.querySelector('#current-path').textContent.endsWith('0')&&!document.querySelector('#content-area [data-app-action=choose-local-project]')");
    await evaluate("AppState.searchQuery=''");
    await click('#sidebar-navigation-repositories');await wait("App.contentCollectionKind()==='repositories'&&AppState.allRepos.length===3&&!AppState.repoScanning");
    await check('Git仓库入口同步主区并按类型显示', `AppState.visibleItems.length===3&&!!document.querySelector('#repository-shortcuts-list [data-repository-type="${groups[0]}"]')`);
    await click(`#repository-shortcuts-list [data-type-toggle="${groups[0]}"]`);await wait("AppState.visibleItems.length===3&&!AppState.repoScanning");
    await check('所属项目类型筛选同时作用于仓库左右列表', `AppState.contentQuery.projectType==='${groups[0]}'&&document.querySelector('#repository-shortcuts-list [data-type-members="${groups[0]}"]').querySelectorAll('[data-repository-shortcut-path]').length===3`);
    await click(`#repository-shortcuts-list [data-repository-type="${groups[1]}"]`);await wait("AppState.visibleItems.length===0");results.push('无仓库的类型显示空结果');
    await click('#sidebar-navigation-repositories');await wait("AppState.visibleItems.length===3");
    await evaluate(`App.selectRepo(${JSON.stringify(path.join(directories[0],'one'))})`);
    await wait("App.projectShortcutsController.recentRepositoryPaths.length===1");
    await check('最近仓库保存在本机并显示在类型之前', "(async()=>{return (await gitFinder.config.get('recentRepositoryPaths')).length===1&&document.querySelector('#repository-shortcuts-list [data-recent-toggle]').getBoundingClientRect().top<document.querySelector('#repository-shortcuts-list [data-repository-type]').getBoundingClientRect().top})()");
    await shot('repositories-types.png');
    await click('#sidebar-navigation-directories');await wait("App.isFileBrowsingContext()");await click('#sort-menu-trigger');
    await check('目录入口回到文件浏览，显示菜单保留目录视图控制', "document.querySelector('#project-display-options').hidden&&!document.querySelector('#directory-display-options').hidden&&!document.querySelector('[data-style=gallery]').disabled");
    await click('[data-style=gallery]');await wait("!!document.querySelector('.finder-gallery-browser')");
    results.push('目录显示控制可切换图库');
    await click('#sidebar-navigation-projects'); await wait("!AppState.localProjectsLoading&&document.querySelectorAll('.local-project-card').length===3");
    const fill = async (selector, value) => evaluate(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)}`);
    const members = async values => evaluate(`document.querySelectorAll('#project-group-projects option').forEach(o=>o.selected=${JSON.stringify(values)}.includes(o.value))`);
    const create = async (name, values, category = '') => {
      await click('[data-new-project-collection]');
      await fill('#project-group-name', name); await fill('#project-collection-category',category);await members(values);
      await click('#project-group-save-btn');await wait("document.querySelector('#project-group-modal').style.display==='none'&&!AppState.localProjectsLoading");
      return evaluate(`AppState.projectGroups.find(g=>g.name===${JSON.stringify(name)}).groupId`);
    };
    const childId = await create('商城子项目',[ids[0],ids[1]]);
    await check('合并两个目录后顶层显示大项目和未合并项目',"document.querySelectorAll('.local-project-card').length===2&&document.querySelectorAll('.project-collection-card').length===1&&AppState.visibleItems.every(i=>i.path)");
    const parentId = await create('在线商城',[childId,ids[2]],groups[0]);
    await check('父项目可包含子项目，顶层只保留一个入口',"document.querySelectorAll('.local-project-card').length===1&&App.projectEntries()[0].repositoryCount===3");
    await click('#content-area .project-collection-card h3');await wait(`AppState.contentQuery.projectType==='${parentId}'&&!AppState.localProjectsLoading`);
    await check('点击父项目直接显示子项目及成员目录',"document.querySelectorAll('.local-project-card').length===2&&document.querySelector('.project-collection-card h3').textContent==='商城子项目'");
    await shot('nested-projects.png');
    await click('#content-area .project-collection-card h3');await wait(`AppState.contentQuery.projectType==='${childId}'&&!AppState.localProjectsLoading`);
    await check('继续进入子项目显示实际目录',"document.querySelectorAll('.local-project-card').length===2&&!document.querySelector('.project-collection-card')");
    await click('#sidebar-navigation-projects');await wait("!AppState.localProjectsLoading");
    await click('[data-app-action=collection-repositories]');await wait("App.contentCollectionKind()==='repositories'&&AppState.visibleItems.length===3");
    await check('父项目汇总并筛选全部下级Git仓库',`AppState.contentQuery.projectType==='${parentId}'&&AppState.visibleItems.every(r=>r.path.includes('/long/'))`);
    await click('#sidebar-navigation-projects');await wait("!AppState.localProjectsLoading");
    await click(`#project-shortcuts-list [data-type-toggle="${groups[0]}"]`);
    await wait("!AppState.localProjectsLoading");
    await click(`[data-collection-toggle="${parentId}"]`);
    await click(`[data-collection-toggle="${childId}"]`);
    await check('侧栏按嵌套层级展开且实际目录仍可访问',`!!document.querySelector('[data-project-collection="${childId}"]')&&!!document.querySelector('[data-project-shortcut-id="${ids[0]}"]')`);
    await shot('nested-sidebar.png');
    await click(`[data-project-type-edit="${childId}"]`);await members([parentId]);await click('#project-group-save-btn');
    await wait("document.querySelector('#project-group-feedback').textContent.includes('自己的子项目')");
    await check('循环引用失败且既有成员不变',`(async()=>{const g=(await gitFinder.projectGroups.list()).groups.find(g=>g.groupId==='${childId}');return g.collectionIds.length===0&&g.projectIds.length===2})()`);
    await click('#project-group-close-btn');
    await click(`[data-project-type-edit="${childId}"]`);await fill('#project-group-name','商城前后台');await members([ids[1]]);await click('#project-group-save-btn');await wait("document.querySelector('#project-group-modal').style.display==='none'&&!AppState.localProjectsLoading");
    await click('#sidebar-navigation-projects');await wait("!AppState.localProjectsLoading");
    await check('移出成员恢复独立入口，名称与成员可编辑',`App.projectEntries().length===2&&AppState.projectGroups.find(g=>g.groupId==='${childId}').name==='商城前后台'`);
    await evaluate(`App.openProjectGroupDialog('${childId}');window.confirm=()=>false`);await click('#project-type-delete-btn');
    await check('取消解除合并保留层级',`AppState.projectGroups.some(g=>g.groupId==='${childId}')`);
    await evaluate('window.confirm=()=>true');await click('#project-type-delete-btn');await wait("document.querySelector('#project-group-modal').style.display==='none'&&!AppState.localProjectsLoading");
    await check('解除子项目合并后成员回到父项目',`(()=>{const g=AppState.projectGroups.find(g=>g.groupId==='${parentId}');return g.collectionIds.length===0&&g.projectIds.includes('${ids[1]}')&&g.projectIds.includes('${ids[2]}')})()`);
    await evaluate('AppState.projectGroups=[];App.loadProjectGroups()');await check('重读本机配置保留父项目和成员',`AppState.projectGroups.some(g=>g.groupId==='${parentId}'&&g.projectIds.length===2)`);
    await evaluate(`App.openProjectGroupDialog('${parentId}')`);await click('#project-type-delete-btn');await wait("document.querySelector('#project-group-modal').style.display==='none'&&!AppState.localProjectsLoading");
    await check('解除全部合并恢复三个独立项目和原路径',`App.projectEntries().length===3&&AppState.localProjects.every(p=>${JSON.stringify(directories)}.includes(p.path))`);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ executable, checks: results, passed: results.length }, null, 2));
    console.log('PASSED', results.length);
  } finally {
    for (const request of pending.values()) clearTimeout(request.timer);
    if (socket) socket.close();
    if (child.exitCode === null) { child.kill('SIGTERM'); for (let i = 0; i < 60 && child.exitCode === null; i++) await delay(100); if (child.exitCode === null) child.kill('SIGKILL'); }
    fs.closeSync(log);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
