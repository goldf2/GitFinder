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
  const output = fs.mkdtempSync(path.join(root, 'dist', 'project-cards-ui-'));
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
    const wait = async expression => { for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); } throw Error(`Condition timeout: ${expression}`); };
    const check = async (name, expression) => { assert.equal(await evaluate(expression), true, name); results.push(name); console.log('PASS', name); };
    const click = async (selector, button = 'left') => { const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Control missing');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`); await send('Input.dispatchMouseEvent', { type: 'mousePressed', button, clickCount: 1, ...point }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button, clickCount: 1, ...point }); };
    const shot = async name => { await delay(300); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name), Buffer.from(r.data, 'base64')); };
    await wait("typeof App!=='undefined'&&typeof AppState!=='undefined'&&AppState.localProjects.length===3");
    await evaluate("App.applyContentPreset('all-projects')"); await wait("!AppState.localProjectsLoading&&document.querySelectorAll('.local-project-card').length===3");
    const aligned = `(()=>{const cards=[...document.querySelectorAll('.local-project-card')];const rows=cards.map(e=>({card:e.getBoundingClientRect(),desc:e.querySelector('p').getBoundingClientRect(),repo:e.querySelector('.local-project-repo-heading').getBoundingClientRect(),footer:e.querySelector('footer').getBoundingClientRect()}));return Math.max(...rows.map(r=>r.card.height))-Math.min(...rows.map(r=>r.card.height))<1&&rows.every(r=>r.card.width<=document.documentElement.clientWidth)&&rows.every(r=>[...cards[rows.indexOf(r)].querySelectorAll('footer button')].every(b=>b.scrollWidth<=b.clientWidth+1))&&rows.every(r=>rows.filter(v=>Math.abs(v.card.top-r.card.top)<1).every(v=>Math.abs(v.desc.top-r.desc.top)<1&&Math.abs(v.repo.top-r.repo.top)<1&&Math.abs(v.footer.top-r.footer.top)<1));})()`;
    for (const width of [1560, 900, 620]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 980, deviceScaleFactor: 1, mobile: false });
      for (const size of ['small', 'medium', 'large']) {
        await evaluate(`(()=>{document.querySelector('[data-project-card-size="'+${JSON.stringify(size)}+'"]').click();})()`); await delay(60);
        await check(`${width}px ${size}: cards, descriptions and actions align without clipped buttons`, aligned);
        if (width === 1560 && size === 'medium') await shot('cards-medium.png');
      }
    }
    await send('Emulation.clearDeviceMetricsOverride');
    await check('长简介保持完整，可通过悬停标题查看', "[...document.querySelectorAll('.local-project-card p')].some(e=>e.title.length>500)");
    await check('仓库列表预览保留总数和剩余数量', "[...document.querySelectorAll('.local-project-card')].some(e=>e.querySelector('.local-project-repo-heading strong').textContent==='3'&&e.querySelectorAll('.local-project-repositories li').length===3&&e.textContent.includes('另有 1 个仓库'))");
    await click(`[data-project-id="${ids[0]}"] h3`, 'right');
    await wait("!document.querySelector('#file-context-menu').hidden");
    await click('[data-context-action="project-types"]');
    await wait("!!AppState.projectDialog&&!document.querySelector('#local-project-save-btn').disabled");
    await check('右键类型入口显示已有归属', `document.querySelector('[data-local-project-type="${groups[0]}"]').checked&&!document.querySelector('[data-local-project-type="${groups[1]}"]').checked`);
    await click(`[data-local-project-type="${groups[0]}"]`); await click(`[data-local-project-type="${groups[1]}"]`); await shot('type-settings.png');
    await click('#local-project-save-btn'); await wait('AppState.projectDialog===null');
    await check('改变当前项目类型时保留其他项目成员', `(async()=>{const s=await gitFinder.projectGroups.list();return JSON.stringify(s.groups[0].projectIds)===JSON.stringify([${JSON.stringify(ids[1])}])&&s.groups[1].projectIds.includes(${JSON.stringify(ids[0])})&&s.groups[1].projectIds.includes(${JSON.stringify(ids[2])});})()`);
    await evaluate(`App.openLocalProjectDialog(${JSON.stringify(directories[0])})`); await wait('!!AppState.projectDialog');
    await check('重新打开恢复刚保存的类型', `!document.querySelector('[data-local-project-type="${groups[0]}"]').checked&&document.querySelector('[data-local-project-type="${groups[1]}"]').checked`);
    await click(`[data-local-project-type="${groups[0]}"]`); await click('#local-project-cancel-btn');
    await check('取消不改变类型归属', `(async()=>!(await gitFinder.projectGroups.list()).groups[0].projectIds.includes(${JSON.stringify(ids[0])}))()`);
    const plain = path.join(managed, 'plain'); fs.mkdirSync(plain);
    await evaluate(`App.openLocalProjectDialog(${JSON.stringify(plain)},{focusTypes:true})`); await wait('!!AppState.projectDialog');
    await click(`[data-local-project-type="${groups[0]}"]`); await click('#local-project-save-btn'); await wait('AppState.projectDialog===null');
    await check('普通文件夹保存时创建身份并归类', `(async()=>{const p=await gitFinder.localProjects.get(${JSON.stringify(plain)});return (await gitFinder.projectGroups.list()).groups[0].projectIds.includes(p.projectId);})()`);
    assert.equal(fs.existsSync(path.join(plain, '.git')), false, 'Classification must not initialize Git');
    assert.ok(directories.every(directory => fs.existsSync(directory)), 'Classification must not move folders');
    results.push('分类不初始化Git，不移动文件夹');
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
