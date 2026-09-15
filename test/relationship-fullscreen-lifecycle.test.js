const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

test('工作区重绘重复绑定事件时，一次点击只执行一次动作', () => {
  const controller = new Controller({ bridge: {} });
  controller.root = new EventTarget();
  let calls = 0;
  controller._handleClick = () => { calls += 1; };
  for (let i = 0; i < 10; i += 1) controller._bindRootEvents();
  controller.root.dispatchEvent(new Event('click'));
  assert.equal(calls, 1);
});

test('重绑定后事件仍使用当前控制器方法，不保留旧动作', () => {
  const controller = new Controller({ bridge: {} });
  controller.root = new EventTarget();
  controller._handleClick = () => assert.fail('不应调用已替换的方法');
  controller._bindRootEvents();
  let calls = 0;
  controller._handleClick = () => { calls += 1; };
  controller._bindRootEvents();
  controller.root.dispatchEvent(new Event('click'));
  assert.equal(calls, 1);
});

function dockFixture() {
  const controller = new Controller({ bridge: {} });
  const left = { dock: 'left' }, right = { dock: 'right' }, external = { dock: 'external' };
  const doc = { fullscreenElement: null };
  controller.root = {
    ownerDocument: doc,
    querySelector: selector => selector.includes('"left"') ? left : right
  };
  controller.panelSidebarRoot = external;
  controller.panelLayout = { library: { side: 'left', order: 0 } };
  return { controller, doc, left, right, external };
}

test('白板全屏时资源库使用工作区内停靠区，退出后恢复外部侧栏', () => {
  const { controller, doc, left, right, external } = dockFixture();
  const preferences = structuredClone(controller.panelLayout);
  assert.deepEqual(controller._panelDocks(), [external, right]);
  doc.fullscreenElement = controller.root;
  assert.deepEqual(controller._panelDocks(), [left, right]);
  doc.fullscreenElement = null;
  assert.deepEqual(controller._panelDocks(), [external, right]);
  assert.deepEqual(controller.panelLayout, preferences, '全屏不能改写用户停靠偏好');
});

test('没有外部侧栏或其他元素全屏时，停靠区仍有正确回退', () => {
  const { controller, doc, left, right, external } = dockFixture();
  doc.fullscreenElement = {};
  assert.deepEqual(controller._panelDocks(), [external, right]);
  controller.panelSidebarRoot = null;
  assert.deepEqual(controller._panelDocks(), [left, right]);
});

test('重绘或 Esc 退出后，全屏按钮文字和辅助状态与实际状态同步', () => {
  const controller = new Controller({ bridge: {} });
  const attributes = {};
  const label = {};
  const button = { setAttribute: (key, value) => { attributes[key] = value; }, querySelector: () => label };
  const doc = { fullscreenElement: null };
  controller.root = { ownerDocument: doc, querySelector: () => button };
  for (const active of [false, true, true, false]) {
    doc.fullscreenElement = active ? controller.root : null;
    controller._syncFullscreenButton();
    assert.equal(attributes['aria-pressed'], String(active));
    assert.equal(attributes['aria-label'], active ? '退出白板全屏' : '白板全屏');
    assert.equal(label.textContent, active ? '退出全屏' : '全屏');
  }
});
