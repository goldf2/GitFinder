// Production markup and controllers, deterministic in-memory data; no user files or sessions.
(async () => {
  const source = await (await fetch('../../src/renderer/index.html?v=36-density', { cache: 'no-store' })).text();
  const sidebar = new DOMParser().parseFromString(source, 'text/html').querySelector('#sidebar');
  document.querySelector('.fixture-workspace').prepend(sidebar);
  sidebar.querySelector('#sidebar-tree').innerHTML = '<div class="tree-node is-root">▾ 📁 project</div><div class="tree-node">　📁 开发中</div><div class="tree-node">　📁 已部署</div>';
  const project = { projectId: 'project_fixture', name: 'MES 项目', path: '/fixture/mes' };
  const repository = { id: 'repo_fixture', name: 'mes-lite', path: '/fixture/mes' };
  const preferences = {};
  let store = RelationshipGraphModel.normalizeStore({ schemaVersion: 1, activeBoardId: 'board_fixture001', entities: [
    { id: 'entity_note0001', type: 'text', name: '发布说明', details: { content: '白板保留在中间，侧栏可以独立切换。', width: '340', height: '160' } },
    { id: 'entity_host0001', type: 'server', name: '生产主机', details: {} },
    { id: 'entity_host0002', type: 'server', name: '备用主机', details: {} },
    { id: 'entity_group001', type: 'group', name: '生产环境', details: {} },
    { id: 'entity_repo0001', type: 'repository', refId: 'missing', name: '缺失的仓库', details: {} }
  ], relationships: [], boards: [{ id: 'board_fixture001', name: '部署关系', viewport: { x: 0, y: 20, zoom: 0.8 }, placements: [
    { entityId: 'entity_note0001', x: 70, y: 40 }, { entityId: 'entity_group001', x: 70, y: 270 },
    { entityId: 'entity_host0001', x: 95, y: 315, groupId: 'entity_group001' }, { entityId: 'entity_host0002', x: 520, y: 330, groupId: 'entity_group001' }, { entityId: 'entity_repo0001', x: 510, y: 40 }
  ] }] }).value;
  const notify = message => { document.querySelector('#notice').textContent = message; };
  const bridge = {
    config: { get: async key => preferences[key], set: async (key, value) => { preferences[key] = value; } },
    localProjects: { list: async () => [project] }, repos: { getRegistry: async () => ({ repos: [repository] }) },
    relationshipBoards: {
      get: async () => ({ store }), save: async value => { store = value; return { store }; },
      listDocuments: async () => [{ id: 'doc_density', name: '白板文件密度验收', path: '/fixture/board/board.json', nodeCount: 5 }]
    }
  };
  const navigation = new ProjectShortcutsController.Controller({ document, bridge,
    state: { currentPath: '', localProjects: [project], projectShortcuts: ProjectShortcuts.defaultStore() },
    app: { escapeHtml: value => String(value), getItemKindIconHtml: () => '<span>▣</span>', isContentCollection: () => false,
      contentCollectionKind: () => '', applyContentPreset: () => notify('所有项目导航入口'), openLocalProject: path => notify(path), _showStatusMessage: notify }
  });
  navigation.bind(); await navigation.load(); await navigation.refresh();
  document.querySelector('#reload-navigation').addEventListener('click', async () => { await navigation.load(); notify('已恢复保存的导航偏好'); });
  const board = new RelationshipBoardController.Controller({ bridge, notify });
  await board.open(document.querySelector('#board'));
  const changeDisplay = (name, value) => {
    const field = document.querySelector(`[data-relationship-display-form] [name="${name}"]`);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  };
  document.querySelectorAll('[data-test-width]').forEach(button => button.addEventListener('click', () => changeDisplay('cardWidth', button.dataset.testWidth)));
  document.querySelector('#test-spacing').addEventListener('click', () => changeDisplay('horizontalSpacing', '120'));
})();
