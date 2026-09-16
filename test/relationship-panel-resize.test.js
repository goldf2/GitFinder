const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Controller, normalizeWidth, widthBounds } = require('../src/renderer/scripts/relationshipPanelResize');

function node(width = 0) {
  const element = new EventTarget();
  const classes = new Set();
  Object.assign(element, {
    hidden: false, isConnected: true, children: [], attrs: {}, dataset: {},
    style: { values: {}, setProperty(key, value) { this.values[key] = value; } },
    classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) },
    width, getBoundingClientRect() { return { width: this.width }; },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    focus() {}, setPointerCapture() {}, releasePointerCapture() {}
  });
  return element;
}
function fixture(preferred = 264) {
  const root = node(), body = node(1200), left = node(0), right = node(264), handle = node(6);
  const doc = new EventTarget(), win = new EventTarget();
  const observers = [];
  win.ResizeObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  doc.defaultView = win;
  root.ownerDocument = doc;
  root.querySelector = selector => ({ '.relationship-body': body, '[data-panel-dock="left"]': left, '[data-panel-dock="right"]': right, '[data-relationship-panel-resize]': handle })[selector];
  right.children = [{ hidden: false }];
  const saves = [], notices = [];
  const controller = new Controller({ config: { set: async (key, value) => { saves.push([key, value]); } }, notify: message => notices.push(message) });
  controller.loadWidth(preferred);
  controller.mount(root);
  return { controller, root, body, left, right, handle, doc, win, saves, notices, observers };
}
function fire(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}
function frames(f) {
  const queue = new Map(); let id = 0;
  f.win.requestAnimationFrame = callback => { queue.set(++id, callback); return id; };
  f.win.cancelAnimationFrame = key => queue.delete(key);
  return { queue, flush() { const callbacks = [...queue.values()]; queue.clear(); for (const callback of callbacks) callback(); } };
}

const start = f => fire(f.handle, 'pointerdown', { button: 0, isPrimary: true, pointerId: 1, clientX: 800 });

test('同一帧的高频拖动合并为一次布局，使用最后一个坐标', async () => {
  const f = fixture(), clock = frames(f); let resizes = 0;
  f.controller.onResize = () => { resizes++; };
  start(f); for (let i = 1; i <= 100; i++) move(f, 800 - i);
  assert.equal(resizes, 0); assert.equal(clock.queue.size, 1);
  clock.flush(); assert.equal(resizes, 1); assert.equal(f.controller.width, 364);
  end(f); await f.controller.saveChain; assert.equal(f.saves[0][1], 364);
});

test('下一帧前松开或卸载会先应用最后坐标，且清除排队帧', async () => {
  for (const stop of ['pointerup', 'unmount', 'blur']) {
    const f = fixture(), clock = frames(f); start(f); move(f, 650);
    if (stop === 'unmount') f.controller.unmount(); else if (stop === 'blur') fire(f.win, 'blur'); else end(f);
    await f.controller.saveChain;
    assert.equal(f.saves[0][1], 414); assert.equal(clock.queue.size, 0);
  }
});

test('下一帧前取消拖动丢弃待处理坐标，不写配置也不残留回调', async () => {
  for (const cancel of ['Escape', 'pointercancel']) {
    const f = fixture(), clock = frames(f); start(f); move(f, 650);
    if (cancel === 'Escape') fire(f.doc, 'keydown', { key: 'Escape' }); else fire(f.doc, cancel, { pointerId: 1 });
    await f.controller.saveChain; assert.equal(clock.queue.size, 0); clock.flush();
    assert.equal(f.controller.width, 264); assert.equal(f.saves.length, 0);
  }
});

test('窄窗口点击、边界拖动或按键，不覆盖较宽的记忆偏好', async () => {
  for (const x of [800, 790, 'ArrowLeft', 'End']) {
    const f = fixture(600); f.body.width = 800; f.left.width = 264; f.controller.refresh();
    if (typeof x === 'string') fire(f.handle, 'keydown', { key: x });
    else { start(f); move(f, x); end(f); }
    await f.controller.saveChain;
    assert.equal(f.controller.preferredWidth, 600); assert.equal(f.saves.length, 0);
    f.body.width = 1500; f.controller.refresh(); assert.equal(f.controller.width, 600);
  }
});

test('键盘到达边界以及重复默认宽度操作不反复写配置', async () => {
  const f = fixture(); fire(f.handle, 'keydown', { key: 'End' }); await f.controller.saveChain;
  for (let i = 0; i < 100; i++) fire(f.handle, 'keydown', { key: 'ArrowLeft' });
  await f.controller.saveChain; assert.equal(f.saves.length, 1);
  fire(f.handle, 'dblclick'); await f.controller.saveChain;
  fire(f.handle, 'dblclick'); await f.controller.saveChain;
  assert.equal(f.saves.length, 2);
});
const move = (f, x, pointerId = 1) => fire(f.doc, 'pointermove', { pointerId, clientX: x });
const end = f => fire(f.doc, 'pointerup', { pointerId: 1 });

test('右栏宽度使用旧默认值，并归一化异常输入与上下界', () => {
  for (const value of [undefined, null, '', 'bad', {}, true, NaN, Infinity]) assert.equal(normalizeWidth(value), 264);
  assert.equal(normalizeWidth('420'), 420);
  assert.equal(normalizeWidth(12), 220);
  assert.equal(normalizeWidth(900), 640);
  assert.equal(normalizeWidth(420.7), 421);
});
test('宽度边界扣除左栏与分隔线，为窄窗口保留画布', () => {
  assert.deepEqual(widthBounds(1200, 264), { min: 220, max: 640 });
  assert.deepEqual(widthBounds(800, 264), { min: 220, max: 265 });
  assert.deepEqual(widthBounds(400, 264), { min: 65, max: 65 });
  assert.deepEqual(widthBounds(4, 0), { min: 0, max: 0 });
});
test('窗口变窄只临时约束显示宽度，不覆盖用户偏好', async () => {
  const f = fixture(600);
  f.body.width = 800; f.left.width = 264; f.controller.refresh();
  assert.equal(f.controller.width, 265); assert.equal(f.controller.preferredWidth, 600);
  assert.equal(f.handle.attrs['aria-valuenow'], '265');
  f.body.width = 1500; f.controller.refresh();
  assert.equal(f.controller.width, 600);
  await f.controller.saveChain; assert.equal(f.saves.length, 0);
});
test('空右栏隐藏分隔线，重新出现后恢复宽度', () => {
  const f = fixture(420);
  f.right.children[0].hidden = true; f.controller.refresh(); assert.equal(f.handle.hidden, true);
  f.right.children[0].hidden = false; f.controller.refresh(); assert.equal(f.handle.hidden, false);
  assert.equal(f.controller.width, 420);
});
test('向左拖宽、向右拖窄，松开时仅保存一次本机偏好', async () => {
  const f = fixture(); start(f); move(f, 650); assert.equal(f.controller.width, 414);
  move(f, 700); assert.equal(f.controller.width, 364); assert.equal(f.saves.length, 0);
  end(f); await f.controller.saveChain;
  assert.deepEqual(f.saves, [['relationshipRightPanelWidth', 364]]);
  assert.equal(f.root.classList.contains('is-panel-resizing'), false);
});
test('拖拽使用当前可见宽度起算，窄窗口下不会跳回宽偏好', async () => {
  const f = fixture(600); f.body.width = 800; f.left.width = 264; f.controller.refresh();
  start(f); move(f, 810); assert.equal(f.controller.width, 255); end(f); await f.controller.saveChain;
  assert.equal(f.saves[0][1], 255);
});
test('忽略右键、非主指针及其他指针的移动或结束', async () => {
  const f = fixture();
  fire(f.handle, 'pointerdown', { button: 2, pointerId: 1, clientX: 800 }); move(f, 700);
  assert.equal(f.controller.width, 264);
  start(f); move(f, 700, 2); fire(f.doc, 'pointerup', { pointerId: 2 });
  assert.equal(f.controller.width, 264); move(f, 750); end(f); await f.controller.saveChain;
  assert.equal(f.controller.width, 314); assert.equal(f.saves.length, 1);
});
test('Escape 和 pointercancel 取消拖拽并恢复原偏好，不写配置', async () => {
  for (const cancel of ['Escape', 'pointercancel']) {
    const f = fixture(); start(f); move(f, 650);
    if (cancel === 'Escape') fire(f.doc, 'keydown', { key: 'Escape' }); else fire(f.doc, cancel, { pointerId: 1 });
    await f.controller.saveChain; assert.equal(f.controller.width, 264); assert.equal(f.saves.length, 0);
    move(f, 600); assert.equal(f.controller.width, 264);
  }
});
test('失焦结束拖拽并清理样式，重绘卸载不会丢失已调整的宽度', async () => {
  for (const stop of ['blur', 'unmount']) {
    const f = fixture(); start(f); move(f, 700);
    if (stop === 'blur') fire(f.win, 'blur'); else f.controller.unmount();
    await f.controller.saveChain; assert.equal(f.saves[0][1], 364);
    assert.equal(f.root.classList.contains('is-panel-resizing'), false);
    move(f, 600); assert.equal(f.controller.preferredWidth, 364);
    if (stop === 'unmount') assert.ok(f.observers.every(item => item.disconnected));
  }
});
test('键盘左右微调、Shift 加速、Home/End 边界以及双击默认', async () => {
  const f = fixture();
  const event = fire(f.handle, 'keydown', { key: 'ArrowLeft' }); assert.equal(event.defaultPrevented, true); assert.equal(f.controller.width, 272);
  fire(f.handle, 'keydown', { key: 'ArrowRight', shiftKey: true }); assert.equal(f.controller.width, 240);
  fire(f.handle, 'keydown', { key: 'Home' }); assert.equal(f.controller.width, 220);
  fire(f.handle, 'keydown', { key: 'End' }); assert.equal(f.controller.width, 640);
  fire(f.handle, 'dblclick'); assert.equal(f.controller.width, 264);
  await f.controller.saveChain; assert.equal(f.saves.length, 5);
});
test('反复挂载不会累积监听器，旧分隔线卸载后不再生效', async () => {
  const f = fixture(); for (let i = 0; i < 5; i++) f.controller.mount(f.root);
  fire(f.handle, 'keydown', { key: 'ArrowLeft' }); await f.controller.saveChain;
  assert.equal(f.saves.length, 1); assert.equal(f.controller.width, 272);
  f.controller.unmount(); fire(f.handle, 'keydown', { key: 'ArrowLeft' }); assert.equal(f.controller.width, 272);
});
test('配置保存失败有提示且后续保存仍可成功', async () => {
  const f = fixture(); let attempt = 0;
  f.controller.config.set = async () => { if (++attempt === 1) throw new Error('disk full'); };
  fire(f.handle, 'keydown', { key: 'ArrowLeft' }); await f.controller.saveChain;
  assert.match(f.notices[0], /宽度保存失败/);
  fire(f.handle, 'keydown', { key: 'ArrowLeft' }); await f.controller.saveChain; assert.equal(attempt, 2);
});
test('多次保存串行执行，不让迟到请求覆盖新宽度', async () => {
  const f = fixture(); let finish; const values = [];
  f.controller.config.set = async (_key, value) => { values.push(value); if (values.length === 1) await new Promise(resolve => { finish = resolve; }); };
  fire(f.handle, 'keydown', { key: 'ArrowLeft' }); await Promise.resolve();
  fire(f.handle, 'keydown', { key: 'ArrowLeft' }); await Promise.resolve();
  assert.deepEqual(values, [272]); finish(); await f.controller.saveChain; assert.deepEqual(values, [272, 280]);
});
test('关闭再创建控制器可从真实配置文件恢复宽度且不更改普通详情栏', t => {
  const ConfigService = require('../src/main/services/configService').constructor;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-panel-width-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = new ConfigService(); service.configDir = dir;
  service.setRendererPreference('detailPanelWidth', 350);
  service.setRendererPreference('relationshipRightPanelWidth', 452);
  const reopened = new ConfigService(); reopened.configDir = dir;
  const f = fixture(reopened.get('relationshipRightPanelWidth'));
  assert.equal(f.controller.width, 452); assert.equal(reopened.get('detailPanelWidth'), 350);
});
test('正式入口和控制器接入新分隔线，键盘操作不会误改白板选择', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const source = read('src/renderer/scripts/relationshipBoardController.js');
  assert.match(source, /data-relationship-panel-resize/);
  assert.match(source, /panelResize\.unmount\(\)/);
  assert.match(source, /panelResize\.mount\(this\.root\)/);
  assert.match(source, /relationshipRightPanelWidth/);
  const html = read('src/renderer/index.html');
  assert.ok(html.indexOf('relationshipPanelResize.js') < html.indexOf('relationshipBoardController.js'));
  assert.match(read('src/renderer/scripts/relationshipBoardActionRouter.js'), /event\.target\?\.closest\?\.\('\[data-relationship-panel-resize\]'\)/);
});
