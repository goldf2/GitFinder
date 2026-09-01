const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ActionRouter = require('../src/renderer/scripts/relationshipBoardActionRouter');
globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function clickTarget(action) {
  const button = { dataset: { relationshipAction: action } };
  return { closest: selector => selector === '[data-relationship-action]' ? button : null };
}

test('关系白板直接动作集中映射到真实控制器方法', () => {
  assert.equal(ActionRouter.resolve('missing'), null);
  for (const [action, [method]] of Object.entries(ActionRouter.ACTIONS)) {
    assert.equal(typeof Controller.prototype[method], 'function', `${action} -> ${method}`);
  }
  assert.equal(ActionRouter.dismissesTransientMenus('undo'), true);
  assert.equal(ActionRouter.dismissesTransientMenus('save-document'), false);
});

test('直接动作复用参数路由且排列后不再额外整页重绘', () => {
  const controller = new Controller({ bridge: {} });
  const calls = [];
  controller.root = { querySelector: selector => selector === '.relationship-layout-trigger'
    ? { focus: () => calls.push(['focus']) } : null };
  controller._closeContextMenu = controller._closeLayoutMenu = () => {};
  controller._arrangeByCategory = () => calls.push(['arrange']);
  controller.render = () => calls.push(['render']);
  controller._handleClick({ target: clickTarget('arrange-by-category') });
  assert.deepEqual(calls, [['arrange'], ['focus']]);

  controller._saveDocument = value => calls.push(['save', value]);
  controller._handleClick({ target: clickTarget('save-document-as') });
  assert.deepEqual(calls.at(-1), ['save', true]);
});

test('正式页面和全部白板夹具均先加载动作路由再加载控制器', () => {
  const root = path.resolve(__dirname, '..');
  const files = ['src/renderer/index.html', 'scripts/visual-fixtures/endpoint-health.html',
    'scripts/visual-fixtures/whiteboard-documents.html', 'scripts/visual-fixtures/sidebar-navigation.html',
    'scripts/visual-fixtures/repository-association.html', 'scripts/visual-fixtures/relationship-groups.html'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(source.indexOf('relationshipBoardActionRouter.js') < source.indexOf('relationshipBoardController.js'), file);
  }
});
