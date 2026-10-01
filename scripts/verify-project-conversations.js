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
    await wait("typeof App!=='undefined'&&App.projectConversationsController&&AppState.localProjects.length===1");
    return { close, evaluate, wait, click, fill, shot };
  } catch (error) { await close(); throw error; }
}

async function main() {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const output = fs.mkdtempSync(path.join(root, 'dist', 'project-conversations-ui-'));
  const profile = path.join(output, 'profile'), directory = path.join(profile, 'projects', 'test-project');
  const projectId = 'project_11111111-1111-4111-8111-111111111111';
  const arg = process.argv.indexOf('--open-codex');
  const codexId = arg >= 0 ? process.argv[arg + 1] : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.match(codexId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const cloudId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  fs.mkdirSync(path.join(directory, '.gitfinder'), { recursive: true });
  const manifest = JSON.stringify({ schemaVersion: 1, projectId, name: '项目会话来源分离验收', description: '隔离本机测试项目', color: 'blue', lifecycle: 'active', repositories: { excluded: [] } });
  fs.writeFileSync(path.join(directory, '.gitfinder', 'project.json'), manifest);
  execFileSync('git', ['init', '--quiet', directory]);
  execFileSync('git', ['-C', directory, 'remote', 'add', 'origin', 'https://github.com/react/react.git']);
  fs.mkdirSync(path.join(directory, 'management'));
  const ledger = JSON.stringify({ schemaVersion: 1, updatedAt: '2026-10-01T10:00:00+08:00', nextTaskId: 'CHAT-TASK', milestones: [{ id: 'M1', title: '协作验收' }], tasks: [{ id: 'CHAT-TASK', title: '台账会话关联任务', status: 'in_progress', priority: 'P1', owner: 'Codex', milestone: 'M1', dependsOn: [], acceptance: ['会话与任务双向打开'], evidence: [], nextAction: '关联会话' }] });
  fs.writeFileSync(path.join(directory, 'management', 'development-tasks.json'), ledger);
  fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ treeRoots: [{ path: path.dirname(directory), name: '隔离项目', expanded: true }], lastPath: directory, defaultScanPath: path.dirname(directory), autoRefresh: false, automaticUpdateChecks: false, detailPanelHidden: false, themeMode: 'light' }));
  const results = []; let app;
  const check = async (name, expression) => { assert.equal(await app.evaluate(expression), true, name); results.push(name); console.log('PASS', name); };
  console.log('Evidence:', output);
  try {
    app = await start(profile, output);
    await app.evaluate("App.applyContentPreset('all-projects')");
    await app.wait("!AppState.localProjectsLoading&&document.querySelectorAll('.local-project-card').length===1");
    await app.click('.local-project-card [data-chat-action=edit]');
    await app.click('#project-chat-add');
    await app.fill('[data-chat-title]', 'Codex 主开发会话');
    await app.fill('[data-chat-url]', `codex://threads/${codexId}`);
    await app.click('[data-chat-action=save]');
    await app.wait("document.querySelector('#project-chat-modal').style.display==='none'&&!AppState.localProjectsLoading");
    await check('卡片立即展示 Codex 主会话入口', "!!document.querySelector('.local-project-card [data-chat-action=open][data-chat-source=codex]')");
    const incoming = { schemaVersion: 1, projects: [{ projectId, conversations: [{ source: 'chatgpt', threadId: cloudId, title: 'ChatGPT 独立规划会话', role: 'primary' }] }] };
    await app.evaluate(`(async()=>{App.projectConversationsController.store=await gitFinder.projectConversations.import(${JSON.stringify(incoming)});await App.renderProjectsView(false)})()`);
    await check('合并导入保留两个来源各自主会话', `App.projectConversationsController.conversations('${projectId}').filter(c=>c.role==='primary').length===2`);
    await app.click('.local-project-card h3');
    await app.wait("!document.querySelector('#detail-project-tab').hidden");
    await app.click('#detail-project-tab');
    await app.wait("!!document.querySelector('[data-project-chat-section]')");
    await check('详情分开显示 Codex 与 ChatGPT 分组', "(()=>{const s=document.querySelector('[data-project-chat-section]');return [...s.querySelectorAll('h4')].map(x=>x.textContent).join('|')==='项目会话|Codex|ChatGPT'&&s.querySelectorAll('[data-chat-action=open]').length===2})()");
    await app.wait("!!document.querySelector('[data-project-task-board] [data-chat-task-id=CHAT-TASK]')");
    await check('项目协作板复用台账与 GitHub remote', "document.querySelector('[data-project-task-board]').textContent.includes('react/react')&&document.querySelector('[data-project-task-board]').textContent.includes('台账会话关联任务')");
    await app.click('[data-project-task-board] [data-chat-action=link-task][data-chat-task-id=CHAT-TASK][data-chat-source=codex]');
    await app.click('[data-chat-action=save]');
    await app.wait("document.querySelector('#project-chat-modal').style.display==='none'&&!AppState.localProjectsLoading");
    await check('任务侧关联 Codex 会话并回显打开入口', `App.projectConversationsController.conversations('${projectId}')[0].taskRefs[0].taskId==='CHAT-TASK'&&!!document.querySelector('[data-project-task-board] [data-chat-action=open][data-chat-source=codex]')`);
    await app.click('[data-project-chat-section] [data-chat-action=show-local-task]');
    await app.wait("document.querySelector('#project-chat-task-modal').style.display==='flex'");
    await check('会话打开原任务详情，任务详情可回到关联会话', "document.querySelector('#project-chat-task-body').textContent.includes('台账会话关联任务')&&!!document.querySelector('#project-chat-task-body [data-chat-action=open][data-chat-source=codex]')");
    await app.click('[data-chat-action=close-task]');
    await app.click('[data-chat-action=refresh-github]');
    await app.wait(`!!App.projectConversationsController.workspaces.get('${projectId}').github&&!document.querySelector('[data-chat-action=refresh-github]').disabled`);
    const githubTasks = await app.evaluate(`App.projectConversationsController.workspaces.get('${projectId}').github.items`);
    assert.ok(githubTasks.length > 0, 'Live public GitHub repository has no readable open tasks');
    results.push(`真实 GitHub 只读读取 ${githubTasks.length} 个开放 Issue/PR`);
    const githubUrl = githubTasks[0].url;
    await app.click(`[data-chat-action=link-task][data-chat-source=chatgpt][data-chat-url="${githubUrl}"]`);
    await app.click('[data-chat-action=save]');
    await app.wait("document.querySelector('#project-chat-modal').style.display==='none'&&!AppState.localProjectsLoading");
    await check('GitHub任务与 ChatGPT 双向关联且主会话独立', `(()=>{const rows=App.projectConversationsController.conversations('${projectId}');return rows.every(c=>c.role==='primary')&&rows.find(c=>c.source==='chatgpt').taskRefs[0].url===${JSON.stringify(githubUrl)}&&!!document.querySelector('[data-project-chat-section] [data-chat-action=open-github-task]')})()`);
    await app.click('[data-project-chat-section] [data-chat-action=open-github-task]');
    results.push('真实点击登记的 GitHub 任务链接，shell.openExternal 返回成功');
    await app.shot('source-groups.png');
    await app.click('[data-project-chat-section] [data-chat-action=edit]');
    await app.fill('[data-chat-title]', 'Codex 保存重开验证');
    await app.click('[data-chat-action=save]');
    await app.wait("document.querySelector('#project-chat-modal').style.display==='none'&&!AppState.localProjectsLoading");
    await check('编辑后立即同步详情', "document.querySelector('[data-project-chat-section]').textContent.includes('Codex 保存重开验证')");
    await app.click('[data-project-chat-section] [data-chat-action=edit]');
    await app.fill('[data-chat-url]', 'javascript:alert(1)');
    await app.click('[data-chat-action=save]');
    await app.wait("document.querySelector('#project-chat-feedback').textContent.length>0");
    await check('非法链接保留编辑对话框和原有数据', `(async()=>document.querySelector('#project-chat-modal').style.display==='flex'&&(await gitFinder.projectConversations.list()).projects[0].conversations[0].threadId==='${codexId}')()`);
    await app.click('#project-chat-modal [data-chat-action=close]');
    if (arg >= 0) { await app.click('[data-project-chat-section] [data-chat-action=open][data-chat-source=codex]'); results.push('真实点击已有 Codex 主会话链接，shell.openExternal 返回成功'); }
    await app.close(); app = null;
    assert.equal(fs.readFileSync(path.join(directory, '.gitfinder', 'project.json'), 'utf8'), manifest);
    assert.equal(fs.readFileSync(path.join(directory, 'management', 'development-tasks.json'), 'utf8'), ledger);
    results.push('项目便携清单未改动');
    app = await start(profile, output);
    await check('退出重开恢复两个来源主会话、任务关联和编辑后的标题', `(()=>{const rows=App.projectConversationsController.conversations('${projectId}');return rows.length===2&&rows.every(c=>c.role==='primary')&&rows[0].title==='Codex 保存重开验证'&&rows[0].taskRefs[0].taskId==='CHAT-TASK'&&rows[1].taskRefs[0].url===${JSON.stringify(githubUrl)}})()`);
    await app.shot('reopened.png');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ sourceVersion: require('../package.json').version, profile, checks: results, passed: results.length }, null, 2));
    console.log('PASSED', results.length);
  } catch (error) {
    if (app) {
      await app.shot('failure.png').catch(() => {});
      fs.writeFileSync(path.join(output, 'failure-state.json'), JSON.stringify(await app.evaluate("({currentPath:AppState.currentPath,selectedRepo:AppState.selectedRepo?.path,detailItem:App.fileSelectionDetailController.item,activeTab:App.fileSelectionDetailController.activeTab,workspaces:[...App.projectConversationsController.workspaces.values()],detailHtml:document.querySelector('#detail-empty').innerHTML})").catch(() => null), null, 2));
    }
    throw error;
  } finally { if (app) await app.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
