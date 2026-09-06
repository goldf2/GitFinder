const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ActionRouter = require('../src/renderer/scripts/relationshipBoardActionRouter');
const controllerSource = fs.readFileSync(path.join(__dirname, '../src/renderer/scripts/relationshipBoardController.js'), 'utf8');
const actionRouterSource = fs.readFileSync(path.join(__dirname, '../src/renderer/scripts/relationshipBoardActionRouter.js'), 'utf8');
globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

function clickTarget(action, calls) {
  const button = { dataset: { relationshipAction: action } };
  return { closest: selector => {
    calls?.push(selector);
    return selector.includes('[data-relationship-action]') ? button : null;
  } };
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
  const calls = [], selectors = [];
  controller.root = { querySelector: selector => selector === '.relationship-layout-trigger'
    ? { focus: () => calls.push(['focus']) } : null };
  controller._closeContextMenu = controller._closeLayoutMenu = () => {};
  controller._arrangeByCategory = () => calls.push(['arrange']);
  controller.render = () => calls.push(['render']);
  controller._handleClick({ target: clickTarget('arrange-by-category', selectors) });
  assert.deepEqual(calls, [['arrange'], ['focus']]);
  assert.equal(selectors.filter(selector => selector.includes('[data-relationship-action]')).length, 1);

  controller._saveDocument = value => calls.push(['save', value]);
  controller._handleClick({ target: clickTarget('save-document-as') });
  assert.deepEqual(calls.at(-1), ['save', true]);
});

test('运行拓扑范围加入白板动作映射到控制器', () => {
  assert.deepEqual(ActionRouter.resolve('add-topology-scope'), ['_addTopologyScopeToBoard']);
});

test('控制器只保留兼容入口，DOM 事件由动作路由统一分发', () => {
  for (const [suffix, method] of Object.entries({ Click: 'handleClick', Keydown: 'handleKeydown' })) {
    const handler = controllerSource.match(new RegExp(`    _handle${suffix}\\(event\\) \\{[\\s\\S]*?\\n    \\}`))?.[0] || '';
    assert.match(handler, new RegExp(`return ActionRouter\\.${method}\\(this, event\\)`));
    assert.doesNotMatch(handler, /data-|querySelector|closest/);
    assert.equal(typeof ActionRouter[method], 'function');
  }
  for (const method of ['handleChange', 'handleInput', 'handleSubmit', 'handleDragStart', 'handleDragOver', 'handleDrop']) {
    assert.match(controllerSource, new RegExp(`ActionRouter\\.${method}\\(this, event\\)`));
    assert.equal(typeof ActionRouter[method], 'function');
  }

  const controller = new Controller({ bridge: {} });
  const calls = [];
  controller._setPanelSide = (...args) => calls.push(['side', ...args]);
  controller._handleClick({ target: { closest: selector => selector.includes('[data-panel-side]')
    ? { dataset: { panelKey: 'library', panelSide: 'right' } } : null } });
  assert.deepEqual(calls.pop(), ['side', 'library', 'right']);

  controller._closeContextMenu = controller._closeLayoutMenu = () => {};
  controller.resourceMap.set('project:one', { key: 'project:one' });
  controller._addResource = resource => calls.push(['resource', resource.key]);
  controller._handleClick({ target: { closest: selector => selector.includes('[data-add-resource]')
    ? { dataset: { addResource: 'project:one' } } : null } });
  assert.deepEqual(calls.pop(), ['resource', 'project:one']);
});

test('资源按钮从完整资源目录解析动态实体键和已放置项目键', () => {
  const controller = new Controller({ bridge: {} });
  const calls = [];
  controller._closeContextMenu = () => {};
  controller._resourceCatalog = () => [
    { key: 'entity:deployment_1', kind: 'deployment', entityId: 'entity_deployment_1', name: '部署' },
    { key: 'project:one', kind: 'project', refId: 'project_1', entityId: 'entity_project_1', placed: true, name: '项目' }
  ];
  controller.resourceMap.set('project:one', { key: 'project:one', kind: 'project', refId: 'project_1', name: '项目' });
  controller._addResource = resource => calls.push(['add', resource?.entityId]);
  controller._focusEntityOnBoard = entityId => calls.push(['locate', entityId]);

  const click = dataset => ActionRouter.handleClick(controller, { target: {
    closest: selector => selector.includes(dataset.addResource ? '[data-add-resource]' : '[data-locate-resource]')
      ? { dataset } : null
  } });
  click({ addResource: 'entity:deployment_1' });
  click({ locateResource: 'project:one' });

  controller._clientToWorld = () => ({ x: 40, y: 60 });
  ActionRouter.handleDrop(controller, {
    target: { closest: selector => selector === '.relationship-canvas' ? {} : null },
    dataTransfer: {
      files: [],
      getData: type => type === 'application/x-gitfinder-relationship-resource' ? 'entity:deployment_1' : '',
      types: ['application/x-gitfinder-relationship-resource']
    },
    clientX: 40,
    clientY: 60,
    preventDefault: () => {}
  });

  assert.deepEqual(calls, [['add', 'entity_deployment_1'], ['locate', 'entity_project_1'], ['add', 'entity_deployment_1']]);
});

test('变更、输入和提交事件复用同一动作路由边界', () => {
  const controller = new Controller({ bridge: {} });
  const calls = [];
  controller._setGroupShape = (...args) => calls.push(['shape', ...args]);
  ActionRouter.handleChange(controller, { target: {
    dataset: { selectedGroupShape: 'group-one' }, value: 'polygon',
    matches: selector => selector === 'select[data-selected-group-shape]'
  } });
  assert.deepEqual(calls.pop(), ['shape', 'group-one', 'polygon']);

  controller._renderResources = () => calls.push(['resources']);
  ActionRouter.handleInput(controller, { target: {
    value: 'panel',
    matches: selector => selector === '.relationship-resource-search input',
    closest: () => null
  } });
  assert.equal(controller.resourceSearch, 'panel');
  assert.deepEqual(calls.pop(), ['resources']);

  const form = { matches: selector => selector === '[data-relationship-annotation-form]' };
  controller._saveAnnotationForm = value => calls.push(['annotation', value]);
  let prevented = false;
  ActionRouter.handleSubmit(controller, { target: { closest: () => form }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(calls.pop(), ['annotation', form]);
});

test('点击资源库中的项目、仓库或白板文件会先显示右侧摘要', () => {
  const controller = new Controller({ bridge: {} });
  const calls = [];
  controller._closeContextMenu = () => {};
  controller._selectResourcePreview = resource => calls.push(resource.key);
  controller._resourceCatalog = () => [{ key: 'whiteboard:d1', kind: 'whiteboard', id: 'd1', name: '运行白板' }];
  controller.resourceMap.set('repository:r1', { key: 'repository:r1', kind: 'repository', name: '仓库' });

  const click = key => ActionRouter.handleClick(controller, { target: {
    closest: selector => selector.includes('[data-resource-key]')
      ? { dataset: { resourceKey: key } } : null
  } });

  click('whiteboard:d1');
  click('repository:r1');
  assert.deepEqual(calls, ['whiteboard:d1', 'repository:r1']);
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

test('大型显示设置打开后聚焦可循环控件并支持 Tab 与 Escape', () => {
  assert.match(actionRouterSource, /queueMicrotask\(\(\) => popover\.querySelector\('\[data-relationship-action="close-display-settings"\]'\)\?\.focus\(\)\)/);
  assert.match(actionRouterSource, /if \(event\.key === 'Tab'\)[\s\S]*?focusable\.at\(-1\)/);
  assert.match(actionRouterSource, /if \(event\.key === 'Escape'\)[\s\S]*?_closeDisplayPopover\(true\)/);
  assert.doesNotMatch(actionRouterSource, /queueMicrotask\(\(\) => popover\.querySelector\('#relationship-display-title'\)/);
});
