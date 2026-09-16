#!/usr/bin/env node
// Dedicated-profile layout regression with real renderer input and file IPC.
// Uses a sanitized copy of the topology; never attaches to the normal user profile.
// node scripts/verify-relationship-layout-options.js PORT PROFILE OUTPUT [--reopen]
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
  const fixture = JSON.parse(fs.readFileSync(path.join(profile, 'layout-fixtures.json'), 'utf8'));
  assert.ok(path.resolve(fixture.record.path).startsWith(profile + path.sep));
  const { unwrapRelationshipBoardFile } = require('../src/main/services/relationshipBoardFileFormat');
  const delay = ms => new Promise(r => setTimeout(r, ms));
  async function check(name, expression) { const value = await evaluate(expression); results.push({ name, passed: value === true }); console.log(name, value); assert.equal(value, true, name); }
  async function idle() { await evaluate(`(async()=>{const c=App.relationshipBoardController;for(let i=0;i<400;i++){if(!c.documentBusy&&!c.saveTimer){await c.saveChain;return;}await new Promise(r=>setTimeout(r,25));}throw new Error('Layout save timeout');})()`); await delay(300); }
  async function click(selector) {
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error('Missing enabled control');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }); await delay(80);
  }
  async function key(name, modifiers=0) { await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,modifiers}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,modifiers}); await delay(80); }
  async function menu() { await click('[data-layout-menu="layout"]'); }
  async function layout(mode) { await menu(); await click(`[data-board-layout="${mode}"]`); await idle(); }
  async function fit() { await click('[data-relationship-action="fit"]'); await delay(550); }
  async function screenshot(name) { const image=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name),Buffer.from(image.data,'base64')); }
  const geometryExpression = `(()=>{const c=App.relationshipBoardController;return c.flowRenderOptions.model.nodes.map(n=>[n.id,n.parentId||'',n.position.x,n.position.y,n.style.width,n.style.height]).sort((a,b)=>a[0].localeCompare(b[0]))})()`;
  async function metrics() { return evaluate(`(()=>{const c=App.relationshipBoardController,nodes=c.flowRenderOptions.model.nodes,hosts=nodes.filter(n=>n.type==='hostBubble');const boxes=hosts.map(n=>({...n.position,width:Number(n.style.width),height:Number(n.style.height)}));return{layout:c._boardView().layout,zoom:c.flowCanvas.getViewport().zoom,hosts:hosts.length,nodes:nodes.length,projects:nodes.filter(n=>n.data?.entity?.type==='group').length,width:Math.max(...boxes.map(r=>r.x+r.width))-Math.min(...boxes.map(r=>r.x)),height:Math.max(...boxes.map(r=>r.y+r.height))-Math.min(...boxes.map(r=>r.y)),boxes}})()`); }
  const menuBounds = `(()=>{const m=document.querySelector('[data-layout-panel="layout"]'),r=m.getBoundingClientRect(),w=App.relationshipBoardController.root.getBoundingClientRect();return !m.hidden&&r.left>=w.left-1&&r.right<=Math.min(innerWidth,w.right)+1&&r.top>=0&&r.bottom<=innerHeight+1})()`;
  try {
    await send('Page.bringToFront'); await send('Runtime.enable');
    await send('Emulation.clearDeviceMetricsOverride');
    if (process.argv.includes('--reload')) { await send('Page.reload'); await delay(500); }
    await evaluate(`(async()=>{for(let i=0;i<450;i++){if(document.readyState==='complete'&&typeof App!=='undefined'&&App.switchView)return;await new Promise(r=>setTimeout(r,30));}throw new Error('Startup not ready');})()`);
    await evaluate("App.switchView('relationships')");
    await evaluate(`(async()=>{for(let i=0;i<200;i++){if(App.relationshipBoardController?.root?.isConnected)return;await new Promise(r=>setTimeout(r,25));}throw new Error('Whiteboard not ready');})()`);
    await evaluate(`App.relationshipBoardController._openDocument(${JSON.stringify(fixture.record.id)})`);
    await evaluate(`(()=>{const c=App.relationshipBoardController;c._setPanelTopology(${JSON.stringify(fixture.topology)});c.panelResize.loadWidth(264);c._renderGraph()})()`); await idle();
    if (reopen) {
      await check('重启后真实文件恢复均衡总览选项', "App.relationshipBoardController._boardView().layout==='project-balanced'");
      const expected=JSON.parse(fs.readFileSync(path.join(profile,'layout-expected-geometry.json'),'utf8'));
      assert.deepEqual(await evaluate(geometryExpression),expected);results.push({name:'重启后主机/Project几何保持一致',passed:true});
      await fit(); await screenshot('layout-reopened.png');
    } else {
      await evaluate(`(async()=>{const c=App.relationshipBoardController;c.store=RelationshipGraphModel.assertValidStore(${JSON.stringify(fixture.initial)});c._resetDocumentSelection();c.render();await c._persistNow();c.panelResize.loadWidth(264);window.__layoutFacts=JSON.stringify({entities:c.store.entities,relationships:c.store.relationships,members:c.store.boards[0].placements.map(p=>[p.entityId,p.groupId])});})()`);
      await layout('project-columns'); await fit(); const before=await metrics(); await screenshot('layout-before-columns.png');
      await menu();
      await check('菜单按三组显示并保留十个布局选项', "document.querySelectorAll('[data-layout-panel=layout] .relationship-layout-section').length===3&&document.querySelectorAll('[data-layout-panel=layout] [data-board-layout]').length===10");
      await check('桌面菜单采用双列且不超出工作区', menuBounds+"&&getComputedStyle(document.querySelector('[data-layout-panel=layout] .relationship-layout-options')).gridTemplateColumns.split(' ').length===2");
      await screenshot('layout-menu.png');
      await click('[data-board-layout="project-balanced"]'); await idle(); await fit();
      const after=await metrics();fs.writeFileSync(path.join(output,'layout-metrics.json'),JSON.stringify({before,after},null,2));
      assert.equal(after.hosts,3); assert.equal(after.nodes,before.nodes);
      assert.ok(after.height<before.height*0.8,JSON.stringify({before,after}));
      assert.ok(after.zoom>before.zoom*1.2,JSON.stringify({before,after}));
      results.push({name:'相同画布下总览更紧凑，卡片显示比例提高',passed:true,before,after});
      for(let i=0;i<after.boxes.length;i++)for(const b of after.boxes.slice(i+1)){const a=after.boxes[i];assert.ok(a.x+a.width<=b.x+1||b.x+b.width<=a.x+1||a.y+a.height<=b.y+1||b.y+b.height<=a.y+1,'主机外框不能重叠');}
      results.push({name:'三台主机外框无重叠且数量不变',passed:true});
      await screenshot('layout-balanced.png'); const balanced=await evaluate(geometryExpression);
      await click('[data-relationship-action="undo"]');await idle();await check('一次撤销回到主机纵列',"App.relationshipBoardController._boardView().layout==='project-columns'");
      await click('[data-relationship-action="redo"]');await idle();assert.deepEqual(await evaluate(geometryExpression),balanced);results.push({name:'重做恢复同一均衡布局',passed:true});
      await layout('project-balanced');assert.deepEqual(await evaluate(geometryExpression),balanced);results.push({name:'重复应用不漂移或增长外框',passed:true});
      await menu();await key('Home');await key('ArrowRight');
      await check('右方向键只移动到主机纵列选项',"document.activeElement.dataset.boardLayout==='project-columns'&&App.relationshipBoardController._boardView().layout==='project-balanced'");
      await key('z',4);await key('Delete');await check('菜单内快捷键不撤销或删除画布',"App.relationshipBoardController._boardView().layout==='project-balanced'&&JSON.stringify({entities:App.relationshipBoardController.store.entities,relationships:App.relationshipBoardController.store.relationships,members:App.relationshipBoardController.store.boards[0].placements.map(p=>[p.entityId,p.groupId])})===__layoutFacts");
      await key('Escape');await check('Esc关闭菜单并恢复入口焦点',"document.querySelector('[data-layout-panel=layout]').hidden&&document.activeElement.dataset.layoutMenu==='layout'");
      await layout('free');assert.deepEqual(await evaluate(geometryExpression),balanced);results.push({name:'切换自由摆放保留当前位置',passed:true});
      await layout('project-balanced');
      await click('[data-relationship-action="fullscreen"]');await delay(700);await menu();await check('全屏菜单可见且未越界',menuBounds+"&&document.fullscreenElement===App.relationshipBoardController.root");await screenshot('layout-fullscreen-menu.png');await key('Escape');
      await evaluate('document.fullscreenElement?document.exitFullscreen():Promise.resolve()');await delay(600);
      await send('Emulation.setDeviceMetricsOverride',{width:640,height:560,deviceScaleFactor:1,mobile:false});await delay(250);await menu();
      await check('窄窗口菜单自动单列且可滚动',menuBounds+"&&getComputedStyle(document.querySelector('[data-layout-panel=layout] .relationship-layout-options')).gridTemplateColumns.split(' ').length===1");
      await key('End');await check('窄窗口可通过键盘到达底部操作',"document.activeElement.dataset.relationshipAction==='reset-dynamic-layout'&&document.activeElement.getBoundingClientRect().bottom<=innerHeight");await screenshot('layout-narrow-menu.png');await key('Escape');
      await send('Emulation.clearDeviceMetricsOverride');await delay(250);await layout('project-balanced');await fit();
      await check('布局切换始终不改变节点、连线与成员归属',"JSON.stringify({entities:App.relationshipBoardController.store.entities,relationships:App.relationshipBoardController.store.relationships,members:App.relationshipBoardController.store.boards[0].placements.map(p=>[p.entityId,p.groupId])})===__layoutFacts");
      await idle();const saved=unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(fixture.record.path,'utf8'))).store;
      assert.equal(saved.boards[0].view.layout,'project-balanced');assert.equal(saved.entities.length,fixture.initial.entities.length);results.push({name:'均衡选项与位置通过真实IPC保存到文件',passed:true});
      fs.writeFileSync(path.join(profile,'layout-expected-geometry.json'),JSON.stringify(await evaluate(geometryExpression)));
      await screenshot('layout-final.png');
    }
    assert.deepEqual(errors,[]); console.log(JSON.stringify({ok:true,renderer:page.url,results,errors},null,2));
  } finally {
    try{await screenshot('layout-last-state.png')}catch(_){}
    fs.writeFileSync(path.join(output,reopen?'reopen-result.json':'result.json'),JSON.stringify({renderer:page.url,results,errors},null,2));
    for(const request of pending.values())clearTimeout(request.timer);socket.close();
  }
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1});
