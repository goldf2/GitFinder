#!/usr/bin/env node
// Only use a disposable profile named panel-resize-test-profile. Uses the real
// renderer, PointerEvents, keyboard events and configuration IPC. The save-state
// case alone injects delayed writes, without modifying the real user profile.
// node scripts/verify-relationship-panel-resize.js PORT PROFILE OUTPUT [--reopen]
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
  const settle = () => new Promise(resolve => setTimeout(resolve, 150));
  const sample = () => evaluate(`(() => { const c=App.relationshipBoardController, r=c.panelResize, b=r.body, h=r.handle; return {width:Math.round(r.dock.getBoundingClientRect().width), preferred:r.preferredWidth, body:b.getBoundingClientRect().width, canvas:c.root.querySelector('.relationship-canvas').getBoundingClientRect().width, hidden:h.hidden, bounds:r.bounds(), aria:h.getAttribute('aria-valuenow'), fullscreen:document.fullscreenElement===c.root}; })()`);
  async function state() {
    const result = await sample();
    result.saved = await evaluate("App.relationshipBoardController.bridge.config.get('relationshipRightPanelWidth')");
    return result;
  }
  async function check(name, condition) { const result = await state(); results.push({ name, passed: Boolean(condition(result)), ...result }); console.error(name, JSON.stringify(result)); assert.ok(results.at(-1).passed, JSON.stringify(results.at(-1))); }
  async function point(selector) { return evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+Math.min(r.height/2,180)};})()`); }
  async function drag(delta) {
    const start = await point('[data-relationship-panel-resize]');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + delta, y: start.y, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x + delta, y: start.y, button: 'left', clickCount: 1 });
    await evaluate('App.relationshipBoardController.panelResize.saveChain'); await settle();
  }
  async function click(selector, count = 1) {
    const p = await point(selector);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: count });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: count });
    await settle();
  }
  async function key(key, modifiers = 0) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
    await evaluate('App.relationshipBoardController.panelResize.saveChain'); await settle();
  }
  async function screenshot(name) { const image = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name), Buffer.from(image.data, 'base64')); }
  try {
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Runtime.enable');
    await evaluate(`(async()=>{for(let i=0;i<450;i++){if(document.readyState==='complete' && typeof App!=='undefined' && typeof App.switchView==='function')return true;await new Promise(r=>setTimeout(r,30));}throw new Error('GitFinder startup not ready');})()`);
    await evaluate("App.switchView('relationships')");
    await evaluate(`(async()=>{for(let i=0;i<150;i++){if(App.relationshipBoardController?.root?.isConnected){return true;}await new Promise(r=>setTimeout(r,30));}throw new Error('Whiteboard not ready');})()`);
    await settle();
    if (reopen) {
      await check('退出应用后重新启动恢复 504px', value => value.width === 504 && value.saved === 504 && !value.hidden);
    } else {
      await evaluate(`(async()=>{const c=App.relationshipBoardController;c.panelResize.finishDrag(false);c.panelResize.loadWidth(264);c.panelLayout={library:{side:'right',order:0},inspector:{side:'right',order:1}};await c._savePanelLayout();c._placePanelComponents();window.__panelBefore=JSON.stringify(c.store);})()`);
      await settle();
      await check('右栏初始宽度 264px', value => value.width === 264 && !value.hidden);
      await drag(-160); await check('真实指针拖拽加宽并保存 424px', value => value.width === 424 && value.saved === 424);
      await key('ArrowLeft'); await check('方向键微调为 432px', value => value.width === 432 && value.saved === 432);
      await key('ArrowRight', 8); await check('Shift 方向键加速为 400px', value => value.width === 400);
      await click('[data-relationship-panel-resize]', 2);
      await evaluate('App.relationshipBoardController.panelResize.saveChain');
      await check('双击恢复默认 264px', value => value.width === 264 && value.saved === 264);
      await drag(-160);
      await evaluate('App.relationshipBoardController.render()'); await settle();
      await check('重绘保留 424px 和可拖分隔线', value => value.width === 424 && !value.hidden);
      await evaluate("App.relationshipBoardController._setPanelSide('library','left')"); await settle();
      await check('全部移出右栏后分隔线消失', value => value.hidden);
      await evaluate("App.relationshipBoardController._setPanelSide('library','right')"); await settle();
      await check('面板移回恢复原宽度', value => value.width === 424 && !value.hidden);
      await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 620, deviceScaleFactor: 1, mobile: false }); await settle();
      await check('窄窗口约束宽度但不覆盖偏好', value => value.width <= value.bounds.max && value.canvas > 0 && value.preferred === 424 && value.saved === 424);
      await drag(0);
      await check('窄窗口轻触分隔线不覆盖原宽度', value => value.preferred === 424 && value.saved === 424);
      await drag(-12);
      await check('窄窗口向边界外拖动不覆盖原宽度', value => value.preferred === 424 && value.saved === 424);
      await send('Emulation.clearDeviceMetricsOverride'); await settle();
      await check('窗口恢复后回到 424px', value => value.width === 424);
      await click('[data-relationship-action="fullscreen"]');
      await evaluate('new Promise(resolve=>setTimeout(resolve,600))'); await settle();
      await check('白板全屏保留右栏宽度', value => value.fullscreen && value.width === 424);
      await evaluate(`(()=>{window.__resizePointerTrace=[];window.__resizeTraceFn=e=>{const r=App.relationshipBoardController.panelResize;__resizePointerTrace.push({type:e.type,x:e.clientX,y:e.clientY,width:r.width,preferred:r.preferredWidth,drag:r.drag?{...r.drag}:null,fullscreen:!!document.fullscreenElement})};for(const t of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(t,__resizeTraceFn,true)})()`);
      await drag(-80);
      const trace=await evaluate(`(()=>{for(const t of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.removeEventListener(t,__resizeTraceFn,true);return __resizePointerTrace})()`);
      fs.writeFileSync(path.join(output,'fullscreen-pointer-trace.json'),JSON.stringify(trace,null,2));
      await check('全屏中拖拽调整为 504px', value => value.width === 504 && value.saved === 504);
      await screenshot('fullscreen-panel-504.png');
      await evaluate('document.exitFullscreen()'); await evaluate('new Promise(resolve=>setTimeout(resolve,500))'); await settle();
      await check('退出全屏后保留 504px', value => !value.fullscreen && value.width === 504);
      await evaluate("App.switchView('tree')"); await settle();
      await evaluate("App.switchView('relationships')"); await settle();
      await check('切换视图再打开恢复 504px', value => value.width === 504 && !value.hidden);
      // Only this isolated-profile case injects latency; width checks above use real IPC.
      const saving = await evaluate(`(async()=>{
        const c=App.relationshipBoardController;
        await new Promise(r=>setTimeout(r,300)); await c.saveChain;
        const bridge=c.bridge, requests=[];
        const label=()=>c.root.querySelector('.relationship-save-state')?.textContent;
        c.bridge={...bridge,relationshipBoards:{...bridge.relationshipBoards,
          save:()=>new Promise(resolve=>requests.push(resolve))}};
        try {
          const first=c._persistNow(); await new Promise(r=>setTimeout(r,0));
          const second=c._persistNow(); requests[0](); await first;
          await new Promise(r=>setTimeout(r,0));
          const pending={state:c.saveState,label:label()};
          requests[1](); await second;
          return {pending,complete:{state:c.saveState,label:label()}};
        } finally {
          for(const resolve of requests) resolve();
          await c.saveChain; c.bridge=bridge;
        }
      })()`);
      results.push({name:'安装版旧请求完成后仍显示正在保存',passed:saving.pending.state==='saving' && /正在保存/.test(saving.pending.label),...saving.pending});
      assert.ok(results.at(-1).passed,JSON.stringify(saving));
      results.push({name:'安装版最新请求完成后显示已保存',passed:saving.complete.state==='saved' && /已保存/.test(saving.complete.label),...saving.complete});
      assert.ok(results.at(-1).passed,JSON.stringify(saving));
      const unchanged = await evaluate('window.__panelBefore===JSON.stringify(App.relationshipBoardController.store)');
      results.push({ name: '调宽不改白板节点、关系、布局或视口', passed: unchanged }); assert.ok(unchanged);
    }
    await screenshot(reopen ? 'reopened-panel-504.png' : 'panel-504.png');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, renderer: page.url, profile, results, errors }, null, 2));
  } finally {
    fs.writeFileSync(path.join(output, reopen ? 'reopen-result.json' : 'result.json'), JSON.stringify({ results, errors }, null, 2));
    for (const request of pending.values()) clearTimeout(request.timer);
    socket.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
