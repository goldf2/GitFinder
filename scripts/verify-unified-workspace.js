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
  const output = fs.mkdtempSync(path.join(root, 'dist', 'workspace-ui-'));
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
  const parentId='project_group_cccccccc-cccc-4ccc-8ccc-cccccccccccc', childId='project_group_dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const standalone=path.join(managed,'independent');fs.mkdirSync(standalone);
  execFileSync('git',['init','--quiet',standalone]);execFileSync('git',['init','--quiet',directories[2]]);
  fs.mkdirSync(path.join(directories[0],'design'));fs.writeFileSync(path.join(directories[0],'design','brief.txt'),'product design');
  const changedRepo=path.join(directories[0],'one');fs.writeFileSync(path.join(changedRepo,'note.txt'),'original\n');execFileSync('git',['-C',changedRepo,'add','note.txt']);execFileSync('git',['-C',changedRepo,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Initial']);fs.writeFileSync(path.join(changedRepo,'note.txt'),'updated\n');
  fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ treeRoots: [{ path: managed, name: '隔离项目', expanded: true }], lastPath: managed, defaultScanPath: managed, autoRefresh: false, automaticUpdateChecks: false, detailPanelHidden: true, projectCardSize: 'medium', themeMode: 'light', projectGroups: { version: 1, groups: [{ groupId: groups[0], name: '管理类', color: 'blue', projectIds: [ids[0], ids[1]] }, { groupId: groups[1], name: '工具类', color: 'purple', projectIds: [ids[2]] },{groupId:parentId,name:'在线商城',kind:'collection',color:'blue',categoryId:groups[0],projectIds:[ids[2]],collectionIds:[childId]},{groupId:childId,name:'商城子项目',kind:'collection',projectIds:[ids[0],ids[1]],collectionIds:[]}] } }));
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
    await click('#sidebar-navigation-projects');await wait("!AppState.localProjectsLoading&&!!document.querySelector('.project-collection-card')");
    await check('导航合并为工作区和文件浏览',"document.querySelectorAll('#sidebar-navigation [role=tab]').length===2&&document.querySelector('#sidebar-navigation-projects').textContent==='工作区'&&document.querySelector('#sidebar-navigation-directories').textContent==='文件浏览'");
    await check('统一树包含项目类别和所有仓库入口',`!!document.querySelector('#sidebar-project-list [data-project-collection="${parentId}"]')&&!!document.querySelector('#project-shortcuts-list [data-repository-shortcut-all]')&&document.querySelector('#repository-shortcuts-sidebar-section').hidden`);
    await click(`#sidebar-project-list [data-project-collection="${parentId}"]`);await wait("!AppState.localProjectsLoading&&document.querySelectorAll('.local-project-card').length===2");
    await click(`#sidebar-project-list [data-project-collection="${childId}"]`);await wait("!AppState.localProjectsLoading&&document.querySelectorAll('.local-project-card').length===2&&!document.querySelector('.project-collection-card')");
    await check('嵌套项目进入成员概览',`AppState.contentQuery.projectType==='${childId}'`);
    await click(`#sidebar-project-list [data-project-shortcut-id="${ids[0]}"]`);await wait("!!document.querySelector('[data-workspace-repository]')");
    await check('物理项目概览包含多个仓库和资料目录',"document.querySelectorAll('[data-workspace-repository]').length===3&&!!document.querySelector('[data-workspace-folder]')");
    const firstRepo=path.join(directories[0],'one');
    await click(`[data-workspace-repository="${firstRepo}"]`);await wait("!!document.querySelector('#git-workspace-view')");
    await check('Git概览不显示文件操作栏',"getComputedStyle(document.querySelector('#file-action-bar')).display==='none'&&!App.isFileBrowsingContext()");
    await check('点击仓库进入Git主视图',`AppState.workspaceRepository.path===${JSON.stringify(firstRepo)}&&document.querySelector('#git-workspace-view').textContent.includes('note.txt')&&document.querySelectorAll('[data-workspace-view]').length===3`);
    await wait(`AppState.selectedRepo?.path===${JSON.stringify(firstRepo)}`);
    await check('左侧定位仓库并同步右侧详情',`!!document.querySelector('#sidebar-project-list [data-project-repository-path="${firstRepo}"].active')&&AppState.selectedRepo.path===${JSON.stringify(firstRepo)}`);
    await click('[data-workspace-diff="0"]');await wait("!document.querySelector('#workspace-file-diff').hidden");
    await check('Git视图可读取实际文本差异',"document.querySelector('#workspace-file-diff').textContent.includes('+updated')");
    await click('[data-workspace-git="review"]');await wait("document.querySelector('#commit-modal').style.display==='flex'&&!!document.querySelector('[data-review-file]')");
    await check('复用提交审查入口并保留用户确认',"document.querySelector('#commit-modal').textContent.includes('note.txt')");await click('#commit-modal [data-modal="commit-modal"]');
    await click('[data-workspace-view="files"]');await wait("!document.querySelector('#git-workspace-view')&&AppState.visibleItems.some(i=>i.name==='note.txt')");
    await check('文件视图显示同一仓库的真实目录',`AppState.currentPath===${JSON.stringify(firstRepo)}&&!document.querySelector('#repository-workspace-tabs').hidden`);
    await click('[data-workspace-view="project"]');await wait("!!document.querySelector('[data-workspace-project]')");
    await check('所属项目显示完整嵌套路径',"document.querySelector('#content-area').textContent.includes('在线商城')&&document.querySelector('#content-area').textContent.includes('商城子项目')");
    await shot('repository-project-context.png');
    await click(`[data-workspace-project="${parentId}"]`);await wait("!AppState.localProjectsLoading&&!!document.querySelector('.project-collection-card')");
    await check('归属入口返回项目成员概览',"!AppState.workspaceRepository&&document.querySelector('#repository-workspace-tabs').hidden");
    await click('#sidebar-navigation-repositories');await wait("!AppState.repoScanning&&AppState.visibleItems.length===5");
    await check('所有仓库跨项目聚合',"App.contentCollectionKind()==='repositories'&&AppState.visibleItems.length===5");
    await click(`.repo-card[data-path="${standalone}"]`);await wait("!!document.querySelector('#git-workspace-view')");
    await check('独立仓库无需创建项目',"document.querySelector('#git-workspace-view').textContent.includes('未归属项目')");
    assert.equal(fs.existsSync(path.join(standalone,'.gitfinder','project.json')),false);
    await click('[data-workspace-view="project"]');await check('独立仓库所属项目为空',"document.querySelector('#content-area').textContent.includes('未归属项目')");
    await click('[data-workspace-view="git"]');await wait("!!document.querySelector('#git-workspace-view')");await shot('repository-git-view.png');
    await click('#sidebar-navigation-directories');await wait("!AppState.workspaceRepository&&App.isFileBrowsingContext()");
    await check('文件浏览返回真实目录且清除仓库专用视图',"!document.querySelector('#locations-sidebar-section').hidden&&document.querySelector('#repository-workspace-tabs').hidden");
    await click('#sidebar-navigation-projects');await wait("!AppState.localProjectsLoading");
    await click(`#sidebar-project-list [data-project-type="${groups[1]}"]`);await wait("!AppState.localProjectsLoading");
    await check('类别筛选同步左右空结果',"!document.querySelector('.local-project-card')&&!document.querySelector('#sidebar-project-list [data-project-collection]')");
    await click('#sidebar-navigation-projects');await wait("!AppState.localProjectsLoading");
    await click(`#sidebar-project-list [data-project-shortcut-id="${ids[1]}"]`);await wait(`AppState.currentPath===${JSON.stringify(directories[1])}&&App.isFileBrowsingContext()`);
    await check('无Git资料目录直接浏览',"!AppState.workspaceRepository&&!AppState.workspaceProject");
    await click('#sidebar-navigation-projects');await wait("!AppState.localProjectsLoading");await shot('unified-workspace.png');
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
