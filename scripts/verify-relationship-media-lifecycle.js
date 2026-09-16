#!/usr/bin/env node
// Dedicated-profile media regression. Real dialogs, renderer, file IPC and pixel checks;
// the native chooser result and delayed responses are injected at the bridge edge.
// node scripts/verify-relationship-media-lifecycle.js PORT PROFILE OUTPUT [--reopen]
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
  const fixture = JSON.parse(fs.readFileSync(path.join(profile, 'media-fixtures.json'), 'utf8'));
  for (const file of [fixture.a.path, fixture.b.path, fixture.attachment]) assert.ok(path.resolve(file).startsWith(profile + path.sep));
  const { unwrapRelationshipBoardFile } = require('../src/main/services/relationshipBoardFileFormat');
  const readStore = record => unwrapRelationshipBoardFile(JSON.parse(fs.readFileSync(record.path, 'utf8'))).store;
  const mediaId = 'entity_media001';
  const image = store => store.entities.find(item => item.id === mediaId);
  const assetFile = (record, entity) => {
    const file = path.resolve(record.projectDirectory, entity.details.assetPath);
    assert.ok(file.startsWith(profile + path.sep)); return file;
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(expression) {
    return evaluate(`(async()=>{for(let i=0;i<300;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,25));}throw new Error('Wait failed: '+${JSON.stringify(expression)});})()`);
  }
  async function check(name, expression) {
    const value = await evaluate(expression);
    results.push({ name, passed: value === true }); console.log(name, value); assert.equal(value, true, name);
  }
  async function idle() {
    await waitFor('!App.relationshipBoardController.documentBusy&&!App.relationshipBoardController.saveTimer');
    await evaluate('App.relationshipBoardController.saveChain'); await sleep(180);
  }
  const pixelExpression = `(()=>{const img=document.querySelector('.react-flow__node[data-id="${mediaId}"] .gf-flow-media-element img');if(!img?.complete||!img.naturalWidth)return null;const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.drawImage(img,0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)})()`;
  async function checkPixel(name, rgb) {
    await waitFor(`JSON.stringify(${pixelExpression})===${JSON.stringify(JSON.stringify(rgb))}`);
    const pixel = await evaluate(pixelExpression);
    results.push({ name, passed: JSON.stringify(pixel) === JSON.stringify(rgb), pixel }); console.log(name, pixel);
    assert.deepEqual(pixel, rgb);
  }
  async function click(selector) {
    await waitFor(`document.querySelector(${JSON.stringify(selector)})`);
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(e.disabled)throw new Error('Disabled button');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
  async function editDialog() {
    await evaluate(`window.__mediaEdit=App.relationshipBoardController._editCanvasElement('${mediaId}');void 0`);
    await waitFor("document.querySelector('.relationship-dialog select[name=replace]')");
    await evaluate(`(()=>{const f=document.querySelector('.relationship-dialog');f.elements.replace.value='replace';f.elements.caption.value='媒体保存回归-Alpha192';f.elements.replace.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('.relationship-dialog button[type=submit]');
  }
  async function screenshot(name) {
    const captured = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, name), Buffer.from(captured.data, 'base64'));
  }
  let movedAsset = null;
  try {
    await send('Page.bringToFront'); await send('Runtime.enable');
    await evaluate(`(async()=>{for(let i=0;i<450;i++){if(document.readyState==='complete'&&typeof App!=='undefined'&&App.switchView)return;await new Promise(r=>setTimeout(r,30));}throw new Error('Startup not ready');})()`);
    await evaluate("App.switchView('relationships')");
    await waitFor('App.relationshipBoardController?.root?.isConnected');
    await evaluate(`window.__mediaOriginalBridge=App.relationshipBoardController.bridge;void 0`);
    await evaluate(`App.relationshipBoardController._openDocument(${JSON.stringify(fixture.a.id)})`);
    await check('真实IPC打开隔离图片项目', `App.relationshipBoardController.documentRecord.id===${JSON.stringify(fixture.a.id)}`);
    if (!reopen) {
      await evaluate(`(async()=>{const c=App.relationshipBoardController;c.store=${JSON.stringify(fixture.aInitial)};c._resetDocumentSelection();await c._persistNow();await c._refreshDocumentAssets();c.render();})()`);
      await checkPixel('原始红色图片实际解码显示', [220, 60, 60]);
      await evaluate(`(()=>{const c=App.relationshipBoardController,b=__mediaOriginalBridge;window.__pickResolve=null;window.__releaseMediaSave=null;let saved=false;c.bridge={...b,relationshipBoards:{...b.relationshipBoards,pickImage:()=>new Promise(r=>{window.__pickResolve=r}),saveDocument:async r=>{if(!saved){saved=true;await new Promise(done=>{window.__releaseMediaSave=done})}return b.relationshipBoards.saveDocument(r)}}};})()`);
      await editDialog(); await waitFor("typeof __pickResolve==='function'");
      await evaluate(`(()=>{const c=App.relationshipBoardController;c.store.entities.find(e=>e.type==='text').details.content='保留其他编辑-Alpha192';c._persistSoon(10000);__pickResolve({data:${JSON.stringify(fixture.blue)},name:'blue.png',width:64,height:64});})()`);
      await evaluate('__mediaEdit'); await waitFor("typeof __releaseMediaSave==='function'");
      await check('图片选择期间的其他文字修改保留', "App.relationshipBoardController.store.entities.find(e=>e.type==='text').details.content==='保留其他编辑-Alpha192'");
      await checkPixel('尚未落盘的新蓝图不被旧红图缓存覆盖', [30, 90, 230]);
      await screenshot('new-image-before-save.png');
      await evaluate('__releaseMediaSave()'); await idle();
      await evaluate('App.relationshipBoardController.bridge=__mediaOriginalBridge;void 0');
      await checkPixel('保存并加载真实附件后仍显示蓝图', [30, 90, 230]);
      let saved = readStore(fixture.a);
      assert.equal(fs.readFileSync(assetFile(fixture.a, image(saved))).toString('base64'), fixture.blue.split(',')[1]);
      assert.equal(saved.entities.find(e=>e.type==='text').details.content, '保留其他编辑-Alpha192');
      assert.equal(image(saved).details.imageData, undefined);
      results.push({ name: '真实PNG附件与白板文件读回一致', passed: true });

      await click('[data-relationship-action="undo"]'); await idle();
      await checkPixel('实际撤销按钮恢复旧图片及对应预览', [220, 60, 60]);
      assert.equal(image(readStore(fixture.a)).details.assetPath, image(fixture.aInitial).details.assetPath);
      await click('[data-relationship-action="redo"]'); await idle();
      await checkPixel('实际重做按钮恢复新图片及对应预览', [30, 90, 230]);

      await evaluate(`(()=>{const c=App.relationshipBoardController,b=__mediaOriginalBridge;window.__beforeCancel=JSON.stringify(c.store.entities);c.bridge={...b,relationshipBoards:{...b.relationshipBoards,pickImage:async()=>({cancelled:true})}};})()`);
      await editDialog(); await evaluate('__mediaEdit'); await idle();
      await check('受控取消图片选择保留原图片和其他内容', '__beforeCancel===JSON.stringify(App.relationshipBoardController.store.entities)');
      await evaluate('App.relationshipBoardController.bridge=__mediaOriginalBridge;void 0');

      await evaluate(`window.__addMedia=App.relationshipBoardController._addFiles([${JSON.stringify(fixture.attachment)}],{x:40,y:300});void 0`);
      await click('.relationship-dialog button[type=submit]'); await evaluate('__addMedia'); await idle();
      saved = readStore(fixture.a);
      const attachment = saved.entities.find(e=>e.type==='attachment'); assert.ok(attachment);
      assert.equal(fs.readFileSync(assetFile(fixture.a, attachment),'utf8'), fs.readFileSync(fixture.attachment,'utf8'));
      await check('实际文件确认表单复制附件并保留可见卡片', "document.querySelector('.gf-flow-attachment-element strong')?.textContent==='fixture-note.txt'");
      results.push({ name: '附件复制字节一致且原文件保留', passed: true });

      await evaluate(`App.relationshipBoardController._openDocument(${JSON.stringify(fixture.b.id)})`);
      await checkPixel('同实体ID的另一白板显示自己的绿图', [30, 170, 80]);
      const missing = assetFile(fixture.b, image(readStore(fixture.b)));
      movedAsset = { original: missing, temporary: missing + '.test-missing' };
      assert.ok(!fs.existsSync(movedAsset.temporary)); fs.renameSync(missing, movedAsset.temporary);
      await evaluate('App.relationshipBoardController._refreshDocumentAssets()');
      await waitFor("document.querySelector('.react-flow__node[data-id=entity_media001] .gf-flow-media-placeholder')");
      await check('附件缺失时保留图片元素及占位，不伪装成旧图', "App.relationshipBoardController.documentAssets.get('entity_media001')?.state==='missing'&&App.relationshipBoardController.store.entities.some(e=>e.id==='entity_media001')&&!document.querySelector('.react-flow__node[data-id=entity_media001] img')");
      await screenshot('missing-image-placeholder.png');
      fs.renameSync(movedAsset.temporary, movedAsset.original); movedAsset = null;
      await evaluate('App.relationshipBoardController._refreshDocumentAssets()');
      await checkPixel('附件恢复后重新读取真实绿图', [30, 170, 80]);

      await evaluate(`(()=>{const c=App.relationshipBoardController,b=__mediaOriginalBridge;window.__pickResolve=null;c.bridge={...b,relationshipBoards:{...b.relationshipBoards,pickImage:()=>new Promise(r=>{window.__pickResolve=r})}};})()`);
      await editDialog(); await waitFor("typeof __pickResolve==='function'");
      await evaluate(`App.relationshipBoardController._openDocument(${JSON.stringify(fixture.a.id)})`);
      await evaluate('window.__targetAfterSwitch=JSON.stringify(App.relationshipBoardController.store.entities);void 0');
      await evaluate(`__pickResolve({data:${JSON.stringify(fixture.green)},name:'stale.png',width:64,height:64})`);
      await evaluate('__mediaEdit');
      await check('切换白板后旧图片选择结果被丢弃', '__targetAfterSwitch===JSON.stringify(App.relationshipBoardController.store.entities)');
      await evaluate('App.relationshipBoardController.bridge=__mediaOriginalBridge;void 0');
      await checkPixel('新目标白板保持自己的蓝图', [30, 90, 230]);

      await evaluate(`(()=>{const c=App.relationshipBoardController,b=__mediaOriginalBridge;let count=0;window.__oldAssetsRelease=null;c.bridge={...b,relationshipBoards:{...b.relationshipBoards,getAssets:async id=>{const n=++count,assets=await b.relationshipBoards.getAssets(id);if(n!==1)return assets;assets.find(a=>a.entityId==='${mediaId}').imageData=${JSON.stringify(fixture.green)};await new Promise(r=>{window.__oldAssetsRelease=r});return assets}}};window.__oldAssetsRead=c._refreshDocumentAssets();})()`);
      await waitFor("typeof __oldAssetsRelease==='function'");
      await evaluate('App.relationshipBoardController._refreshDocumentAssets()');
      await evaluate('__oldAssetsRelease()'); await evaluate('__oldAssetsRead');
      await checkPixel('受控迟到媒体响应不能覆盖较新预览', [30, 90, 230]);
      await evaluate('App.relationshipBoardController.bridge=__mediaOriginalBridge;void 0');
      await evaluate("App.switchView('tree')"); await sleep(200);
      await evaluate("App.switchView('relationships')"); await idle();
      await checkPixel('退出再进入白板仍显示正确图片', [30, 90, 230]);
    } else {
      await checkPixel('重启打开后蓝色图片从真实附件恢复', [30, 90, 230]);
      await check('重启后保留并发编辑文字与附件卡片', "App.relationshipBoardController.store.entities.find(e=>e.type==='text').details.content==='保留其他编辑-Alpha192'&&!!document.querySelector('.gf-flow-attachment-element')");
    }
    const saved = readStore(fixture.a);
    assert.equal(fs.readFileSync(assetFile(fixture.a, image(saved))).toString('base64'), fixture.blue.split(',')[1]);
    assert.doesNotMatch(fs.readFileSync(fixture.a.path,'utf8'), /sourceKey/);
    results.push({ name: '最终文件为正确PNG且无运行时缓存字段', passed: true });
    await screenshot(reopen ? 'reopened-media.png' : 'media-final.png');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, renderer: page.url, results, errors }, null, 2));
  } finally {
    if (movedAsset && fs.existsSync(movedAsset.temporary)) fs.renameSync(movedAsset.temporary, movedAsset.original);
    try { await evaluate(`(()=>{const c=App.relationshipBoardController;if(window.__mediaOriginalBridge)c.bridge=__mediaOriginalBridge;window.__pickResolve?.({cancelled:true});window.__releaseMediaSave?.();window.__oldAssetsRelease?.();})()`); } catch (_) {}
    try { await screenshot('final-observation.png'); } catch (_) {}
    fs.writeFileSync(path.join(output, reopen ? 'reopen-result.json' : 'result.json'), JSON.stringify({ renderer: page.url, profile, results, errors }, null, 2));
    for (const request of pending.values()) clearTimeout(request.timer);
    socket.close();
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
