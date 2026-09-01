const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

test('检测计数只更新提示，不改变工具栏图标内容与宽度', () => {
  const button = { textContent: '◉', setAttribute(name, value) { this[name] = value; } };
  const controller = new Controller({ bridge: { panel: { checkEndpoints() {} } } });
  controller.root = { querySelector: () => button };
  controller.panelProjection.entities = [{ runtime: { dynamicKind: 'panel-endpoint' } }];
  for (const pending of [99, 18, 9, 1, 0]) {
    controller.endpointChecksPending = pending;
    controller._updateEndpointCheckStatus();
    assert.equal(button.textContent, '◉');
    assert.equal(button.disabled, pending > 0);
    assert.equal(button['aria-label'], pending ? `正在检测 ${pending} 个访问点` : '重新检测全部访问点（本机 HTTP 检测）');
  }
});

test('画布绘制局限在可视区，不为每张卡片长期创建合成层', () => {
  const css = fs.readFileSync(require.resolve('../src/renderer/styles/relationships.css'), 'utf8');
  const flowCss = fs.readFileSync(require.resolve('../src/renderer/relationship-canvas/relationshipCanvas.css'), 'utf8');
  const canvas = css.match(/^\.relationship-canvas\s*\{([^}]+)\}/m)[1];
  const toolbar = css.match(/\.relationship-toolbar\s*\{([^}]+)\}/)[1];
  const save = css.match(/\.relationship-save-state\s*\{([^}]+)\}/)[1];
  assert.match(canvas, /contain:\s*paint/);
  assert.match(canvas, /isolation:\s*isolate/);
  assert.doesNotMatch(flowCss, /will-change/);
  assert.match(toolbar, /flex-shrink:\s*0/);
  assert.match(save, /flex:\s*0 0 9em/);
});
