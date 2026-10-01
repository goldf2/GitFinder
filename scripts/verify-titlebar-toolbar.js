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
  for (let i = 2; i <= 12; i++) execFileSync('git', ['-C', changedRepo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', `Fixture commit ${i}`]);
  fs.writeFileSync(path.join(changedRepo, 'z-details.txt'), 'untracked fixture');
  fs.writeFileSync(path.join(changedRepo, 'z-notes.txt'), 'another fixture');
  const originalGit = execFileSync('git', ['-C', changedRepo, 'status', '--porcelain'], { encoding: 'utf8' });
  const originalHead = execFileSync('git', ['-C', changedRepo, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ treeRoots: [{ path: managed, name: '隔离项目', expanded: true }], lastPath: managed, defaultScanPath: managed, autoRefresh: false, automaticUpdateChecks: false, detailPanelHidden: true, projectCardSize: 'medium', themeMode: 'light', projectGroups: { version: 1, groups: [{ groupId: groups[0], name: '管理类', color: 'blue', projectIds: [ids[0], ids[1]] }, { groupId: groups[1], name: '工具类', color: 'purple', projectIds: [ids[2]] },{groupId:parentId,name:'在线商城',kind:'collection',color:'blue',categoryId:groups[0],projectIds:[ids[2]],collectionIds:[childId]},{groupId:childId,name:'商城子项目',kind:'collection',projectIds:[ids[0],ids[1]],collectionIds:[]}] } }));

  for (const base of [standalone, directories[2]]) {
    fs.mkdirSync(path.join(base,'docs/00-handoff'),{recursive:true});
    fs.mkdirSync(path.join(base,'docs/ai-context/conversations'),{recursive:true});
    fs.writeFileSync(path.join(base,'README.md'),'# Workspace README\n\nInternal overview documentation');
    fs.writeFileSync(path.join(base,'docs/00-handoff/CURRENT_STATE.md'),'# Current state\n\nInternal record body A');
    fs.writeFileSync(path.join(base,'docs/00-handoff/RELEASE_LOG.md'),'# Release log\n\nVersion fixture 1.2.3');
    fs.writeFileSync(path.join(base,'docs/ai-context/conversations/test.md'),'# Saved conversation\n\nConversation body inside GitFinder');
  }
  fs.mkdirSync(path.join(directories[2],'management'),{recursive:true});
  fs.writeFileSync(path.join(directories[2],'management/development-tasks.json'),JSON.stringify({schemaVersion:1,updatedAt:'2026-10-02T00:00:00Z',tasks:[{id:'TASK-1',title:'Local fixture task',status:'in_progress',owner:'Fixture',nextAction:'Read inline detail',acceptance:['Internal task body'],evidence:[],dependsOn:[]}]}));
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const appIndex = process.argv.indexOf('--app'), executable = appIndex >= 0 ? path.resolve(process.argv[appIndex + 1]) : require('electron');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(output, 'electron.log'), 'a');
  const launchArgs = [...(appIndex < 0 ? [root] : []), `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'];
  let child = spawn(executable, launchArgs, { cwd: root, env, stdio: ['ignore', log, log] });
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
    const check = async (name, expression) => {
      const actual = await evaluate(expression);
      if (actual !== true) {
        await shot('failure.png');
        console.log('CHECK_DIAGNOSTICS', JSON.stringify(await evaluate("({headings:document.querySelectorAll('#git-workspace-view h2').length,commits:[...document.querySelectorAll('.workspace-commit')].map(e=>({rects:e.getClientRects().length,closed:!!e.closest('details:not([open])')})),kind:document.querySelector('[data-workspace-kind]')?.textContent})")));
      }
      assert.equal(actual, true, name); results.push(name); console.log('PASS', name);
    };
    const click = async (selector, button = 'left') => { const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Control missing');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`); await send('Input.dispatchMouseEvent', { type: 'mousePressed', button, clickCount: 1, ...point }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button, clickCount: 1, ...point }); };
    const shot = async name => { await delay(300); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name), Buffer.from(r.data, 'base64')); };
    await wait("typeof App!=='undefined'&&typeof AppState!=='undefined'&&AppState.localProjects.length===3");
    await evaluate("App.applyContentPreset('all-repositories')");
    await wait("!AppState.repoScanning&&AppState.visibleItems.length===5");
    for (const width of [1280,800]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
      await check(`${width}px标题与工具条分层且不重叠`, `(()=>{const title=document.querySelector('.window-titlebar'), toolbar=document.querySelector('.toolbar'), tabs=document.querySelector('.workspace-tab-strip');return title.getBoundingClientRect().bottom<=toolbar.getBoundingClientRect().top&&toolbar.getBoundingClientRect().bottom<=tabs.getBoundingClientRect().top&&title.querySelector('#current-path')&&!title.querySelector('button,input');})()`);
      await check(`${width}px工具条按钮与搜索框不挤压`, `(()=>{const selectors=['.toolbar-left','.toolbar-center','.toolbar-right'];const rects=selectors.map(s=>document.querySelector(s).getBoundingClientRect());return rects.every(r=>r.width>0&&r.left>=0&&r.right<=innerWidth)&&rects[0].right<=rects[1].left&&rects[1].right<=rects[2].left&&document.documentElement.scrollWidth===innerWidth;})()`);
      await click('#sort-menu-trigger');
      await wait("!document.querySelector('#sort-menu').hidden");
      await check(`${width}px显示菜单可见且未超出窗口`,"(()=>{const r=document.querySelector('#sort-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=document.querySelector('.window-titlebar').getBoundingClientRect().bottom;})()");
      await shot(`toolbar-${width}-menu.png`);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await wait("document.querySelector('#sort-menu').hidden");
      await shot(`toolbar-${width}.png`);
    }
    await click('#search-input');await send('Input.insertText',{text:'independent'});
    await wait("AppState.visibleItems.length===1");
    await check('工具条搜索仍筛选仓库',"AppState.searchQuery==='independent'");
    await click(`.repo-card[data-path="${standalone}"]`);await wait("!!document.querySelector('#git-workspace-view')");
    await check('进入仓库后标题更新，导航仍可用',"document.querySelector('.window-titlebar #current-path').textContent.includes('independent')&&!document.querySelector('#btn-back').disabled");
    await click('[data-workspace-back]');await wait("!AppState.workspaceRepository&&AppState.visibleItems.length===1");
    await check('返回列表后保留搜索',"document.querySelector('#search-input').value==='independent'");
    await click('#view-menu-trigger');await wait("!document.querySelector('#view-menu').hidden");
    await check('工作区视图菜单在工具条正常打开',"document.querySelector('#view-menu').getBoundingClientRect().left>=0");
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:results.length,checks:results},null,2));
    console.log('PASSED',results.length);
  } finally {
    for (const request of pending.values()) clearTimeout(request.timer);
    if (socket) socket.close();
    if (child.exitCode === null) { child.kill('SIGTERM'); for (let i = 0; i < 60 && child.exitCode === null; i++) await delay(100); if (child.exitCode === null) child.kill('SIGKILL'); }
    fs.closeSync(log);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
