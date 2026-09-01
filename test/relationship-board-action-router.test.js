const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ActionRouter = require('../src/renderer/scripts/relationshipBoardActionRouter');
const controllerSource = fs.readFileSync(path.join(__dirname, '../src/renderer/scripts/relationshipBoardController.js'), 'utf8');
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

test('控制器只保留点击委托，数据目标由动作路由统一分发', () => {
  const handler = controllerSource.match(/    _handleClick\(event\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.match(handler, /return ActionRouter\.handleClick\(this, event\)/);
  assert.doesNotMatch(handler, /data-|querySelector|closest/);
  assert.equal(typeof ActionRouter.handleClick, 'function');

  const controller = new Controller({ bridge: {} });
  const calls = [];
  controller._setPanelSide = (...args) => calls.push(['side', ...args]);
  controller._handleClick({ target: { closest: selector => selector === '[data-panel-side]'
    ? { dataset: { panelKey: 'library', panelSide: 'right' } } : null } });
  assert.deepEqual(calls.pop(), ['side', 'library', 'right']);

  controller._closeContextMenu = controller._closeLayoutMenu = () => {};
  controller.resourceMap.set('project:one', { key: 'project:one' });
  controller._addResource = resource => calls.push(['resource', resource.key]);
  controller._handleClick({ target: { closest: selector => selector === '[data-add-resource]'
    ? { dataset: { addResource: 'project:one' } } : null } });
  assert.deepEqual(calls.pop(), ['resource', 'project:one']);
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
