// Real renderer/DOM, with an in-memory bridge: no user files or remote requests.
const lifecyclePrefs = {};
let lifecycleStore = RelationshipGraphModel.normalizeStore({
  schemaVersion: 1, activeBoardId: 'board_lifecycle',
  entities: [
    { id: 'entity_lifecycle_text', type: 'text', name: '回归测试说明', details: { content: '重绘不退出全屏\n编辑中的内容应当保留', width: '360', height: '180' } },
    { id: 'entity_lifecycle_server', type: 'server', name: '隔离测试主机', details: {} }
  ], relationships: [],
  boards: [{ id: 'board_lifecycle', name: '隔离测试白板', viewport: { x: 30, y: 30, zoom: 1 }, placements: [
    { entityId: 'entity_lifecycle_text', x: 60, y: 60 },
    { entityId: 'entity_lifecycle_server', x: 460, y: 80 }
  ] }]
}).value;
const lifecycleStatus = document.querySelector('#fixture-status');
const lifecycleController = new RelationshipBoardController.Controller({
  bridge: {
    config: {
      get: async key => structuredClone(lifecyclePrefs[key] ?? null),
      set: async (key, value) => { lifecyclePrefs[key] = structuredClone(value); }
    },
    relationshipBoards: {
      get: async () => ({ store: structuredClone(lifecycleStore) }),
      save: async store => { lifecycleStore = structuredClone(store); return { saved: true }; },
      listDocuments: async () => []
    },
    repos: { getRegistry: async () => ({ repos: [] }) },
    localProjects: { list: async () => [] }
  },
  notify: message => { lifecycleStatus.textContent = message; }
});
window.lifecycleController = lifecycleController;
window.lifecycleErrors = [];
window.addEventListener('error', event => { window.lifecycleErrors.push(event.message); });
window.addEventListener('unhandledrejection', event => { window.lifecycleErrors.push(String(event.reason)); });
const lifecyclePaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function runLifecycleRegression() {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
  const controller = lifecycleController;
  const originalRoot = controller.root;
  const originalStore = JSON.stringify(controller.store);
  const originalPrefs = JSON.stringify(controller.panelLayout);
  let modal;
  try {
    await controller._toggleFullscreen();
    await lifecyclePaint();
    check('进入真实浏览器全屏', document.fullscreenElement === originalRoot);
    check('全屏资源库位于可见工作区内', originalRoot.contains(controller._panelElement('.relationship-resource-panel')));

    modal = document.createElement('div');
    modal.className = 'relationship-dialog-overlay';
    modal.innerHTML = '<form class="relationship-dialog" role="dialog" aria-label="隔离编辑测试"><header>保留未保存输入</header><div class="relationship-dialog-body"><input aria-label="测试输入"><button type="button" data-dialog-cancel>取消</button></div></form>';
    const settled = new Promise(resolve => controller._bindDialogLifecycle(modal, resolve));
    await lifecyclePaint();
    const input = modal.querySelector('input');
    input.value = '未保存的编辑内容'; input.focus(); input.setSelectionRange(2, 5);
    controller.render();
    await lifecyclePaint();
    check('全量重绘保留同一个根节点', controller.root === originalRoot);
    check('全量重绘后仍然全屏', document.fullscreenElement === originalRoot);
    check('全屏按钮保持正确状态', controller.root.querySelector('[data-relationship-action="fullscreen"]').getAttribute('aria-pressed') === 'true');
    check('编辑弹窗保持连接且输入不丢失', modal.isConnected && input.value === '未保存的编辑内容');
    check('编辑焦点与选区保留', document.activeElement === input && input.selectionStart === 2 && input.selectionEnd === 5);
    modal.querySelector('[data-dialog-cancel]').click();
    check('重绘后弹窗取消仍可完成', await settled === null && !modal.isConnected);

    const started = performance.now();
    for (let i = 0; i < 10; i += 1) controller.render();
    window.lifecycleRenderMs = Math.round(performance.now() - started);
    await lifecyclePaint();
    check('连续十次重绘仍保持全屏', document.fullscreenElement === originalRoot);
    let clicks = 0;
    const originalHandle = controller._handleClick;
    controller._handleClick = event => {
      if (event.target.id === 'lifecycle-click-probe') clicks += 1;
      else originalHandle.call(controller, event);
    };
    const probe = document.createElement('button'); probe.id = 'lifecycle-click-probe';
    controller.root.appendChild(probe); probe.click(); probe.remove();
    controller._handleClick = originalHandle;
    check('一次点击只派发一次动作', clicks === 1);
    controller.root.querySelector('[data-relationship-action="toggle-filter-menu"]').click();
    check('重绘后的筛选菜单可以打开', !controller.root.querySelector('.relationship-filter-popover').hidden);
    controller.root.querySelector('[data-relationship-action="toggle-filter-menu"]').click();
    check('筛选菜单可以关闭', controller.root.querySelector('.relationship-filter-popover').hidden);

    if (document.fullscreenElement) await document.exitFullscreen();
    await lifecyclePaint();
    check('退出全屏后资源库恢复原停靠区', controller.panelSidebarRoot.contains(controller._panelElement('.relationship-resource-panel')));
    check('退出后按钮状态同步', controller.root.querySelector('[data-relationship-action="fullscreen"]').getAttribute('aria-pressed') === 'false');
    check('未改变白板持久化内容', JSON.stringify(controller.store) === originalStore);
    check('未改变用户停靠偏好', JSON.stringify(controller.panelLayout) === originalPrefs);
    check('画布正常挂载', Boolean(controller.root.querySelector('.react-flow')));
    check('无脚本错误', window.lifecycleErrors.length === 0);
  } catch (error) {
    checks.push({ name: '测试执行异常', passed: false, error: String(error.stack || error) });
  } finally {
    modal?.querySelector('[data-dialog-cancel]')?.click();
    if (document.fullscreenElement) await document.exitFullscreen();
    window.lifecycleResult = { passed: checks.every(item => item.passed), checks, renderMs: window.lifecycleRenderMs, errors: window.lifecycleErrors };
    document.querySelector('#fixture-results').textContent = checks.map(item => `${item.passed ? 'PASS' : 'FAIL'} · ${item.name}${item.error ? ': ' + item.error : ''}`).join('\n');
    lifecycleStatus.textContent = `${checks.filter(item => item.passed).length}/${checks.length} 通过`;
    document.querySelector('#run-lifecycle').disabled = false;
  }
  return window.lifecycleResult;
}
window.runLifecycleRegression = runLifecycleRegression;
document.querySelector('#run-lifecycle').addEventListener('click', event => {
  event.currentTarget.disabled = true;
  void runLifecycleRegression();
});
window.lifecycleReady = lifecycleController.open(document.querySelector('#board')).then(() => {
  document.querySelector('#run-lifecycle').disabled = !lifecycleController.root;
  lifecycleStatus.textContent = lifecycleController.root ? '就绪' : '初始化失败';
});
