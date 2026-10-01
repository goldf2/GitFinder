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
  const output = fs.mkdtempSync(path.join(root, 'dist', 'repository224-ui-'));
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
  const manifest = fs.readFileSync(path.join(explicit, '.gitfinder/project.json'), 'utf8');
  const checks = []; let app;
  const check = async (name, expr) => { assert.equal(await app.evaluate(expr), true, name); checks.push(name); console.log('PASS', name); };
  // DOM clicks dispatch actual application handlers without relying on prior panel geometry.
  const click = selector => app.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});e.click()})()`);
  console.log('Evidence:', output);
  try {
    app = await start(profile, output);
    await app.evaluate("App.projectShortcutsController.setNavigationMode('projects')");
    await app.wait("AppState.allRepos.length===2&&document.querySelectorAll('.repo-card').length===2");
    await check('主列表只显示两个Git仓库，不显示普通文件夹和独立项目卡片', "App.contentCollectionKind()==='repositories'&&document.querySelectorAll('.repo-card').length===2&&!document.querySelector('.local-project-card')");
    await check('Git仓库主导航可见，项目导航隐藏', "document.querySelector('#project-shortcuts-sidebar-section').hidden&&!document.querySelector('#repository-shortcuts-sidebar-section').hidden&&document.querySelector('#sidebar-navigation-projects').textContent==='Git 仓库'&&!!document.querySelector('[data-content-preset=all-repositories]')&&!document.querySelector('[data-content-preset=all-projects]')");
    await check('扫描只发现已有属性，没有自动给裸仓库生成属性', `AppState.localProjects.length===2&&!AppState.localProjects.some(p=>p.path===${JSON.stringify(automatic)})`);
    await click(`.repo-card[data-path="${automatic}"]`);
    await app.wait("!!document.querySelector('#git-workspace-view')");
    await check('无项目属性仓库直接打开代码，保留七个入口', "document.querySelector('#repository-workspace-name').textContent.includes('automatic')&&[...document.querySelectorAll('[data-workspace-view]')].map(e=>e.textContent).join('|')==='概览|代码|文件|任务|会话|发布|记录'");
    await click('[data-workspace-view=files]');await app.wait("AppState.visibleItems.some(i=>i.name==='README.md')");
    await check('无项目属性仓库可直接浏览文件', `AppState.currentPath===${JSON.stringify(automatic)}&&AppState.workspaceRepository.view==='files'`);
    await click('[data-workspace-view=project]');
    await app.wait("!!document.querySelector('#content-area [data-app-action=file-project-settings]')");
    await check('概览提供当前目录的可选项目属性', "document.querySelector('#content-area').textContent.includes('添加项目属性')&&!document.querySelector('#content-area').textContent.includes('无法读取')");
    await click('#content-area [data-app-action=file-project-settings]');
    await app.wait("document.querySelector('#local-project-modal').style.display!=='none'&&!document.querySelector('#local-project-save-btn').disabled");
    await click('#local-project-save-btn');
    await app.wait(`document.querySelector('#local-project-modal').style.display==='none'&&AppState.localProjects.some(p=>p.path===${JSON.stringify(automatic)})`);
    const autoId = await app.evaluate(`AppState.localProjects.find(p=>p.path===${JSON.stringify(automatic)}).projectId`);
    await click('[data-workspace-view=tasks]');
    await app.wait("!!document.querySelector('#content-area [data-chat-task-id=TEST-001]')");
    await check('任务入口读取同一项目现有台账', "document.querySelector('#content-area').textContent.includes('统一项目任务')");
    await click('[data-workspace-view=chats]');
    await app.wait("!!document.querySelector('#content-area [data-project-chat-section]')");
    await check('会话页面保留Codex和ChatGPT独立分区', "[...document.querySelector('#content-area [data-project-chat-section]').querySelectorAll('h4')].map(e=>e.textContent).join('|')==='项目会话|Codex|ChatGPT'");
    await click('#content-area [data-chat-action=edit]');await click('#project-chat-add');
    await app.fill('[data-chat-title]', '接续会话');await app.fill('[data-chat-url]', 'codex://threads/11111111-1111-4111-8111-111111111111');
    await app.fill('[data-chat-task-refs]', 'TEST-001');await click('#project-chat-modal [data-chat-action=save]');
    await app.wait("document.querySelector('#project-chat-modal').style.display==='none'&&document.querySelector('#content-area').textContent.includes('接续会话')");
    await click('#content-area [data-chat-action=show-local-task]');await app.wait("document.querySelector('#project-chat-task-modal').style.display==='flex'");
    await check('添加属性后可保存会话并关联原任务', "document.querySelector('#project-chat-task-body').textContent.includes('统一项目任务')&&!!document.querySelector('#project-chat-task-body [data-chat-action=open]')");
    await click('[data-chat-action=close-task]');
    await app.shot('project-conversations.png');
    await click('[data-workspace-view=release]');await app.wait("!!document.querySelector('#content-area [data-chat-view=releases]')");
    await check('发布页使用本项目登记的GitHub远程', "document.querySelector('#content-area').textContent.includes('goldf2/GitFinder')&&!!document.querySelector('#content-area [data-chat-view=actions]')");
    await click('[data-workspace-view=records]');await app.wait("!!document.querySelector('[data-workspace-record]')");
    await check('记录页只显示项目内实际存在的文件', "document.querySelectorAll('[data-workspace-record]').length===1&&document.querySelector('[data-workspace-record]').textContent==='会话与接续索引'");
    await click('[data-workspace-view=files]');await app.wait("AppState.visibleItems.some(i=>i.name==='README.md')");
    await check('文件入口保持在当前项目目录', `AppState.currentPath===${JSON.stringify(automatic)}&&AppState.workspaceRepository.view==='files'`);
    await app.evaluate(`App.openWorkspaceProject(AppState.localProjects.find(p=>p.projectId==='${ordinaryId}'))`);
    await app.wait("!!document.querySelector('#content-area [data-app-action=file-project-settings]')");
    await check('未使用Git的规划项目仍可打开并管理任务会话', "!document.querySelector('[data-workspace-view=git]')&&!!document.querySelector('[data-workspace-view=tasks]')&&document.querySelector('#repository-workspace-name').textContent.includes('规划项目')");
    await app.evaluate("App.applyContentPreset('all-projects')");
    await app.wait("document.querySelectorAll('.repo-card').length===2");
    await check('旧所有项目入口迁移到仓库列表，普通文件夹仅保留属性', "App.contentCollectionKind()==='repositories'&&AppState.localProjects.some(p=>p.rootIsGitRepo===false)&&!document.querySelector('.local-project-card')");
    await app.shot('repository-list.png');
    await app.close();app=null;
    assert.equal(fs.existsSync(path.join(automatic, '.gitfinder/project.json')), true);
    assert.equal(fs.readFileSync(path.join(explicit, '.gitfinder/project.json'),'utf8'),manifest);
    app = await start(profile, output);
    await check('重开保留文件夹属性身份、会话与任务关联', `(async()=>{const p=AppState.localProjects.find(p=>p.path===${JSON.stringify(automatic)});const rows=(await gitFinder.projectConversations.list()).projects.find(v=>v.projectId===p.projectId).conversations;return p.projectId==='${autoId}'&&rows[0].title==='接续会话'&&rows[0].taskRefs[0].taskId==='TEST-001'})()`);
    checks.push('原属性清单保持不变，新增属性只写入选择的目录');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({version:require('../package.json').version,checks,passed:checks.length},null,2));
    console.log('PASSED',checks.length);
  } catch(error) { if(app)await app.shot('failure.png').catch(()=>{}); throw error; }
  finally { if(app)await app.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
