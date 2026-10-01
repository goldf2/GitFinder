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
    await evaluate("App.applyContentPreset('all-repositories');App._detailPanelHidden=false;App._applyPanelVisibility()");
    await wait("!AppState.repoScanning&&AppState.visibleItems.length===5");
    await click(`.repo-card[data-path="${standalone}"]`);
    await wait(`AppState.selectedRepo?.path===${JSON.stringify(standalone)}`);
    await check('单击仓库仅选中和右侧预览',"!AppState.workspaceRepository&&document.querySelector('.repo-card.selected')?.getAttribute('aria-selected')==='true'&&getComputedStyle(document.querySelector('#detail-panel')).display!=='none'");
    await shot('repository-preview.png');
    await click(`.repo-card[data-path="${directories[2]}"]`);
    await wait(`AppState.selectedRepo?.path===${JSON.stringify(directories[2])}`);
    await check('连续选择另一个仓库不离开列表',"!AppState.workspaceRepository&&document.querySelectorAll('.repo-card').length===5");
    await click(`.repo-card[data-path="${standalone}"] [data-app-action="open-repository-workspace"]`);
    await wait("!!document.querySelector('#git-workspace-view')");
    await check('明确进入工作区且资料栏默认收起',"getComputedStyle(document.querySelector('#detail-panel')).display==='none'&&document.querySelector('#toggle-detail-panel').getAttribute('aria-expanded')==='false'");
    await shot('workspace-expanded.png');
    await click('[data-workspace-back]');
    await wait(`!AppState.workspaceRepository&&AppState.selectedRepo?.path===${JSON.stringify(standalone)}`);
    await check('返回恢复列表选中与预览',`document.querySelector('.repo-card.selected')?.dataset.path===${JSON.stringify(standalone)}&&getComputedStyle(document.querySelector('#detail-panel')).display!=='none'`);
    await evaluate("AppState.cardStyle='list';App.renderContent()");
    await wait("!!document.querySelector('.repo-list-item')");
    await click(`.repo-list-item[data-path="${directories[2]}"] .list-repo-name`);
    await wait(`AppState.selectedRepo?.path===${JSON.stringify(directories[2])}`);
    await check('列表行单击预览并保留显式进入按钮',"!AppState.workspaceRepository&&!!document.querySelector('.repo-list-item.selected [data-app-action=open-repository-workspace]')");
    await evaluate("AppState.cardStyle='card';App.applyContentPreset('all-repositories')");await wait("document.querySelectorAll('.repo-card').length===5");
    await evaluate(`document.querySelector('.repo-card[data-path="${standalone}"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
    await wait("!!document.querySelector('#git-workspace-view')");
    await click('[data-workspace-view="planning"]');
    await wait("!!document.querySelector('[data-flow-doc]')");
    await click('#toggle-detail-panel');
    await wait("!!document.querySelector('[data-flow-doc]')");
    await check('规划页面显示分类与内部文档',"document.querySelector('.workflow-list').textContent.includes('项目说明')");
    for(const view of ['planning','project','tasks','quality','release','records','chats','git']) {
      await click(`[data-workspace-view="${view}"]`);
      await wait("!!document.querySelector('.workflow-page,.workspace-git-overview')&&!document.querySelector('#content-area').textContent.includes('正在读取')");
      await check(`${view} 保留右侧资料栏`,"getComputedStyle(document.querySelector('#detail-panel')).display!=='none'&&document.querySelector('#workspace-inspector').getBoundingClientRect().height>50");
    }
    await click('[data-workspace-view="planning"]');await wait("!!document.querySelector('[data-flow-template=requirements]')");
    await click('[data-flow-template="requirements"]');await wait("!!document.querySelector('[data-flow-editor]:not([hidden])')");
    await evaluate("(()=>{let e=document.querySelector('[data-flow-editor] textarea');e.value='# 测试需求\\n\\nREQ-001: 本地文档编辑';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await click('[data-flow-save]');await wait("document.querySelector('[data-flow-doc-status]').textContent.includes('已保存')");
    assert.match(fs.readFileSync(path.join(standalone,'docs/02-requirements/REQUIREMENTS.md'),'utf8'),/REQ-001/);
    await check('新建文档保存后加入列表',"[...document.querySelectorAll('[data-flow-doc]')].some(e=>e.dataset.flowDoc.endsWith('REQUIREMENTS.md'))");
    await click('[data-flow-edit]');
    await evaluate("(()=>{let e=document.querySelector('[data-flow-editor] textarea');e.value+=' draft';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await click('[data-workspace-view="tasks"]');await wait("!!document.querySelector('[data-flow-new-task]')");
    await click('[data-workspace-view="planning"]');await wait("!!document.querySelector('[data-flow-doc]')");await click('[data-flow-doc="docs/02-requirements/REQUIREMENTS.md"]');await wait("document.querySelector('textarea')?.value.includes('draft')");
    await check('切换页面保留文档草稿',"document.querySelector('[data-flow-doc-status]').textContent.includes('恢复')");
    fs.writeFileSync(path.join(standalone,'docs/02-requirements/REQUIREMENTS.md'),'# External change');
    await click('[data-flow-save]');await wait("document.querySelector('[data-flow-doc-status]').textContent.includes('其他程序修改')");
    assert.equal(fs.readFileSync(path.join(standalone,'docs/02-requirements/REQUIREMENTS.md'),'utf8'),'# External change');
    await shot('document-conflict.png');
    await evaluate(`App.workspaceController.openRepository(${JSON.stringify(directories[2])},'tasks')`);await wait("!!document.querySelector('[data-flow-task-form]')");
    await check('任务表单读取本地台账',"document.querySelector('[name=title]').value==='Local fixture task'");
    await evaluate("(()=>{let e=document.querySelector('[name=nextAction]');e.value='Verify saved task';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await click('[data-workspace-view="quality"]');await wait("!!document.querySelector('[data-flow-template=test]')");
    await click('[data-workspace-view="tasks"]');await wait("document.querySelector('[name=nextAction]')?.value==='Verify saved task'");
    await check('切换页面保留任务草稿',"document.querySelector('[data-flow-task-feedback]').textContent.includes('恢复')");
    await click('[data-flow-task-form] button[type=submit]');await wait("!document.querySelector('[data-flow-task-feedback]')?.textContent.includes('恢复')");
    assert.equal(JSON.parse(fs.readFileSync(path.join(directories[2],'management/development-tasks.json'))).tasks[0].nextAction,'Verify saved task');
    await shot('tasks.png');
    await click('[data-workspace-view="records"]');await wait("!!document.querySelector('[data-flow-doc]')");await shot('records.png');
    await click('[data-workspace-view="chats"]');await wait("document.querySelector('[data-flow-reader]')?.textContent.includes('Conversation body inside GitFinder')");
    await check('会话正文内部展示',"!!document.querySelector('.workflow-split')");await shot('chats.png');
    await click('[data-workspace-view="files"]');await wait("AppState.visibleItems.some(i=>i.name==='README.md')");
    await check('文件浏览保留原有资料面板',"!document.body.classList.contains('workspace-flow-active')&&getComputedStyle(document.querySelector('#workspace-inspector')).display==='none'");
    await click('[data-workspace-view="project"]');await wait("!!document.querySelector('.workflow-stages')");await shot('overview.png');
    await send('Emulation.setDeviceMetricsOverride',{width:800,height:740,deviceScaleFactor:1,mobile:false});await shot('overview-800.png');
    await check('窄窗口没有横向溢出',"document.documentElement.scrollWidth<=800");
    await send('Emulation.clearDeviceMetricsOverride');
    await click('[data-workspace-global]');
    await wait("!!document.querySelector('[data-portfolio-project]')");
    await check('项目入口切换全局总览并保持默认由用户开启',"AppState.currentMode==='dashboard'&&AppState.experimentalFeatures.dashboard===true");
    await click('[data-portfolio-mode=tasks]');await wait("!!document.querySelector('[data-portfolio-select]')");
    await check('全局任务与项目原台账同源',"document.querySelector('[data-portfolio-detail]').textContent.includes('Verify saved task')");
    await click('[data-portfolio-task]');await wait("!!document.querySelector('[data-flow-task-form]')");
    await check('从全局定位具体项目任务',"AppState.workspaceRepository.focusTaskId==='TASK-1'&&document.querySelector('[name=title]').value==='Local fixture task'");
    await evaluate("(()=>{let e=document.querySelector('[name=nextAction]');e.value='Portfolio sync verified';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await click('[data-flow-task-form] button[type=submit]');await wait("document.querySelector('[name=nextAction]')?.value==='Portfolio sync verified'&&!document.querySelector('[data-flow-task-feedback]').textContent.includes('草稿')");
    await click('[data-workspace-back]');await wait("!!document.querySelector('[data-portfolio-detail]')");
    await check('项目保存后返回全局显示最新事实',"AppState.currentMode==='tasks'&&document.querySelector('[data-portfolio-detail]').textContent.includes('Portfolio sync verified')");
    await shot('portfolio-tasks.png');
    await click('[data-portfolio-mode=dashboard]');await wait("!!document.querySelector('.portfolio-project-grid')");
    await shot('portfolio-overview.png');
    assert.equal(fs.existsSync(path.join(standalone,'.gitfinder/project.json')),false);
    assert.equal(execFileSync('git',['-C',changedRepo,'status','--porcelain'],{encoding:'utf8'}),originalGit);
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
