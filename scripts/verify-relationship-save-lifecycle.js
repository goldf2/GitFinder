#!/usr/bin/env node
// Dedicated-profile installed-renderer regression. Successful writes use real IPC
// and fixture files; cancellation/failure/latency are injected at the bridge edge.
// node scripts/verify-relationship-save-lifecycle.js PORT PROFILE OUTPUT [--reopen]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

async function main() {
  const port = Number(process.argv[2]);
  const profile = path.resolve(process.argv[3] || '');
  const output = path.resolve(process.argv[4] || '');
  const reopen = process.argv.includes('--reopen');
  assert.ok(Number.isInteger(port) && port > 1024 && port < 65536, 'A loopback test port is required');
  assert.equal(path.basename(profile), 'panel-resize-test-profile');
  assert.ok(profile.startsWith(path.resolve(__dirname, '../dist') + path.sep));
  assert.ok(output.startsWith(path.resolve(__dirname, '../dist') + path.sep));
  fs.mkdirSync(output, { recursive: true });
  const pid = execFileSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
  assert.match(pid, /^\d+$/);
  const command = execFileSync('ps', ['-ww', '-p', pid, '-o', 'command='], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'en_US.UTF-8' } });
  assert.ok(command.includes(`--user-data-dir=${profile}`), 'Do not run against a normal user profile');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) })).json();
  const page = targets.find(item => item.type === 'page' && item.url.endsWith('/src/renderer/index.html'));
  assert.ok(page, 'GitFinder renderer required');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 5000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
  });
  let id = 0;
  const pending = new Map(), results = [], errors = [];
  socket.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    if (reply.method === 'Runtime.exceptionThrown') errors.push(reply.params.exceptionDetails.text);
    const request = pending.get(reply.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(reply.id);
    if (reply.error) request.reject(new Error(JSON.stringify(reply.error))); else request.resolve(reply.result);
  });
  function send(method, params = {}) {
    if (process.env.GITFINDER_TEST_TRACE === '1') console.error(method, String(params.expression || '').slice(0, 120));
    return new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => { pending.delete(key); reject(new Error(`${method} timeout`)); }, 20000);
      pending.set(key, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: key, method, params }));
    });
  }
  async function evaluate(expression, userGesture = false) {
    const reply = await send('Runtime.evaluate', { expression, userGesture, awaitPromise: true, returnByValue: true });
    if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
    return reply.result.value;
  }
  const fixture = JSON.parse(fs.readFileSync(path.join(profile, 'lifecycle-fixtures.json'), 'utf8'));
  for (const record of [fixture.a, fixture.b]) assert.ok(path.resolve(record.path).startsWith(profile + path.sep));
  const { unwrapRelationshipBoardFile } = require('../src/main/services/relationshipBoardFileFormat');
  const diskName = () => unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(fixture.a.path, 'utf8'))).store.entities[0].name;
  async function check(name, expression) {
    const value = await evaluate(expression);
    results.push({ name, passed: value === true });
    console.log(name, value); assert.equal(value, true, name);
  }
  async function idle() {
    await evaluate(`(async()=>{const c=App.relationshipBoardController;for(let i=0;i<400;i++){if(!c.documentBusy){await c.saveChain;return;}await new Promise(r=>setTimeout(r,25));}throw new Error('Save did not finish');})()`);
  }
  async function gate() {
    await evaluate(`(()=>{const c=App.relationshipBoardController;window.__saveBridge=c.bridge;window.__saveRequests=[];window.__releaseSave=null;c.bridge={...c.bridge,relationshipBoards:{...c.bridge.relationshipBoards,saveDocument:async request=>{__saveRequests.push(JSON.parse(JSON.stringify(request)));if(__saveRequests.length===1)await new Promise(resolve=>{window.__releaseSave=resolve});return __saveBridge.relationshipBoards.saveDocument(request)}}};})()`);
  }
  const restore = () => evaluate(`(()=>{const c=App.relationshipBoardController;if(window.__saveBridge){c.bridge=__saveBridge;window.__saveBridge=null;}})()`);
  async function waitForGate() {
    await evaluate(`(async()=>{for(let i=0;i<200;i++){if(typeof window.__releaseSave==='function')return;await new Promise(r=>setTimeout(r,25));}throw new Error('Save bridge was not reached');})()`);
  }
  async function edit(name) {
    await evaluate(`(()=>{const c=App.relationshipBoardController;c.store.entities[0].name=${JSON.stringify(name)};c.store.entities[0].details.content=${JSON.stringify(name)};c._persistSoon(10000);c._renderGraph();})()`);
  }
  async function click(selector) {
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing button');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
  async function screenshot(name) {
    const image = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, name), Buffer.from(image.data, 'base64'));
  }
  try {
    await send('Page.bringToFront'); await send('Runtime.enable');
    await evaluate(`(async()=>{for(let i=0;i<450;i++){if(document.readyState==='complete'&&typeof App!=='undefined'&&App.switchView)return;await new Promise(r=>setTimeout(r,30));}throw new Error('Startup not ready');})()`);
    await evaluate("App.switchView('relationships')");
    await evaluate(`(async()=>{for(let i=0;i<200;i++){if(App.relationshipBoardController?.root?.isConnected)return;await new Promise(r=>setTimeout(r,25));}throw new Error('Whiteboard not ready');})()`);
    await check('独立保存模块在实际 renderer 中已加载', "typeof RelationshipBoardPersistence.persistNow==='function'");
    await evaluate(`App.relationshipBoardController._openDocument(${JSON.stringify(fixture.a.id)})`);
    await check('通过真实 IPC 打开隔离文件', `App.relationshipBoardController.documentRecord?.id===${JSON.stringify(fixture.a.id)}`);
    if (reopen) {
      await check('重启后重新打开文件保留最终内容', "App.relationshipBoardController.store.entities[0].name==='重开保留-Alpha191'");
      assert.equal(diskName(), '重开保留-Alpha191');
    } else {
      await gate(); await edit('手动保存开始-Alpha191');
      await click('[data-relationship-action="save-document"]'); await waitForGate();
      await check('真实保存按钮进入正在保存状态', "App.relationshipBoardController.saveState==='saving'&&document.querySelector('.relationship-save-state').textContent.includes('正在保存')");
      await edit('保存期间的新编辑-Alpha191');
      await evaluate('void App.relationshipBoardController._persistNow()');
      await check('手动写入未完成时自动保存不并发写旧版本', '__saveRequests.length===1');
      await evaluate('__releaseSave()'); await idle();
      await check('新编辑保留并按新文件版本号续写', "__saveRequests.length===2&&__saveRequests[0].revision!==__saveRequests[1].revision&&App.relationshipBoardController.store.entities[0].name==='保存期间的新编辑-Alpha191'");
      assert.equal(diskName(), '保存期间的新编辑-Alpha191');
      results.push({ name: '真实磁盘文件读回包含保存期间的新编辑', passed: true });
      await restore();

      await edit('取消另存为后仍保存-Alpha191');
      await evaluate(`(async()=>{const c=App.relationshipBoardController,bridge=c.bridge;c.bridge={...bridge,relationshipBoards:{...bridge.relationshipBoards,saveDocument:r=>r.saveAs?Promise.resolve({cancelled:true}):bridge.relationshipBoards.saveDocument(r)}};try{await c._saveDocument(true);}finally{c.bridge=bridge;}})()`);
      assert.equal(diskName(), '取消另存为后仍保存-Alpha191');
      await check('受控取消另存为后待保存内容真实落盘', `!App.relationshipBoardController.documentBusy&&App.relationshipBoardController.saveState==='saved'&&App.relationshipBoardController.documentRecord.id===${JSON.stringify(fixture.a.id)}`);

      await gate();
      await evaluate('window.__switchPromise=App.relationshipBoardController._showLocalWorkspace();void 0');
      await waitForGate();
      await evaluate(`App.relationshipBoardController._openDocument(${JSON.stringify(fixture.b.id)})`);
      await check('返回本机工作区时阻止交错打开第二个文件', `App.relationshipBoardController.documentBusy&&App.relationshipBoardController.documentRecord.id===${JSON.stringify(fixture.a.id)}`);
      await evaluate('__releaseSave()'); await evaluate('__switchPromise'); await restore();
      await check('完成后回到原本机工作区且解锁', '!App.relationshipBoardController.documentRecord&&!App.relationshipBoardController.documentBusy');

      await evaluate(`App.relationshipBoardController._openDocument(${JSON.stringify(fixture.a.id)})`);
      await evaluate(`(async()=>{const c=App.relationshipBoardController,bridge=c.bridge,workspace=c.localWorkspace;c.localWorkspace=null;c.bridge={...bridge,relationshipBoards:{...bridge.relationshipBoards,get:async()=>{throw new Error('fixture workspace read failure')}}};try{await c._showLocalWorkspace();}finally{c.bridge=bridge;c.localWorkspace=workspace;}})()`);
      await check('受控读取失败保留当前文件身份并解除锁', `App.relationshipBoardController.documentRecord.id===${JSON.stringify(fixture.a.id)}&&!App.relationshipBoardController.documentBusy`);
      await evaluate('App.relationshipBoardController._showLocalWorkspace()');
      await check('读取失败后可正常重试返回本机工作区', '!App.relationshipBoardController.documentRecord');
      await evaluate(`(async()=>{const c=App.relationshipBoardController,bridge=c.bridge;window.__previewCalls=0;c.bridge={...bridge,relationshipBoards:{...bridge.relationshipBoards,save:async()=>{throw new Error('fixture save failure')},previewImport:async()=>{__previewCalls++;return{cancelled:true}}}};try{window.__importResult=await c._importRelationshipJson();}finally{c.bridge=bridge;}})()`);
      await check('受控保存失败阻止后续导入预览', '__importResult===false&&__previewCalls===0&&!App.relationshipBoardController.importInFlight');
      await evaluate('App.relationshipBoardController._persistNow()');
      await check('保存失败恢复后仍可真实保存', "App.relationshipBoardController.saveState==='saved'");

      await evaluate(`App.relationshipBoardController._openDocument(${JSON.stringify(fixture.a.id)})`);
      await edit('重开保留-Alpha191');
      await evaluate("App.switchView('tree')");
      await evaluate('App.relationshipBoardController.saveChain');
      assert.equal(diskName(), '重开保留-Alpha191');
      await evaluate("App.switchView('relationships')");
      await check('离开白板视图会保存待处理编辑，再打开仍保留', "App.relationshipBoardController.store.entities[0].name==='重开保留-Alpha191'&&App.relationshipBoardController.saveTimer===null");
    }
    await screenshot(reopen ? 'save-lifecycle-reopened.png' : 'save-lifecycle.png');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, renderer: page.url, results, errors }, null, 2));
  } finally {
    try { await evaluate("window.__releaseSave?.();if(window.__saveBridge){App.relationshipBoardController.bridge=__saveBridge;window.__saveBridge=null;}"); } catch (_) {}
    fs.writeFileSync(path.join(output, reopen ? 'reopen-result.json' : 'result.json'), JSON.stringify({ renderer: page.url, results, errors }, null, 2));
    for (const request of pending.values()) clearTimeout(request.timer);
    socket.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
