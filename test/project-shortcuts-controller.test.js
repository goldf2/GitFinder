const test = require('node:test');
const assert = require('node:assert/strict');

const { Controller } = require('../src/renderer/scripts/projectShortcutsController');
const ProjectShortcuts = require('../src/shared/projectShortcuts');

const project = {
  projectId: 'project_11111111-1111-4111-8111-111111111111',
  name: 'Alpha',
  path: '/workspace/alpha',
  rootIsGitRepo: true,
  repositoryCount: 1,
  repositories: [{
    name: 'Alpha repo',
    path: '/workspace/alpha/repo',
    relativePath: 'repo',
    isGitRepo: true
  }]
};

function createHarness() {
  const section = { hidden: true };
  const repositories = { hidden: true };
  const locations = { hidden: false };
  const tabs = Object.fromEntries(['projects', 'repositories', 'directories'].map(mode => [mode, {
    dataset: { sidebarNavigation: mode }, attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; }
  }]));
  const container = {
    innerHTML: '',
    addEventListener() {}
  };
  const repositoryContainer = {
    innerHTML: '',
    addEventListener() {}
  };
  const writes = [];
  const values = {
    projectShortcuts: ProjectShortcuts.touchProject(null, project, 1_000),
    projectShortcutPreferences: { visible: false, showRecent: true, recentLimit: 3 }
  };
  const state = {
    currentPath: project.path,
    localProjects: [project],
    projectShortcuts: ProjectShortcuts.defaultStore(),
    projectShortcutPreferences: ProjectShortcuts.defaultPreferences(),
    allRepos: [{ name: 'Alpha repo', path: '/workspace/alpha/repo' }]
  };
  const controller = new Controller({
    state,
    platform: 'darwin',
    document: {
      getElementById(id) {
        if (id === 'project-shortcuts-sidebar-section') return section;
        if (id === 'project-shortcuts-list') return container;
        if (id === 'repository-shortcuts-sidebar-section') return repositories;
        if (id === 'repository-shortcuts-list') return repositoryContainer;
        if (id === 'locations-sidebar-section') return locations;
        if (id === 'sidebar-navigation') return { querySelectorAll: () => Object.values(tabs) };
        return null;
      }
    },
    bridge: {
      config: {
        get: async key => values[key],
        set: async (key, value) => {
          values[key] = value;
          writes.push([key, value]);
        }
      },
      localProjects: { list: async () => [project] }
    },
    app: {
      applyContentPreset() {},
      contentCollectionKind: () => '',
      escapeHtml: value => String(value),
      getItemKindIconHtml: () => '<span class="icon"></span>',
      isContentCollection: () => false,
      openLocalProject(path) { this.openedPath = path; },
      _showStatusMessage() {}
    }
  });
  return { controller, state, section, repositories, locations, tabs, container, repositoryContainer, writes };
}

test('项目快捷控制器加载本机偏好并按设置隐藏侧边栏', async () => {
  const { controller, state, section, container } = createHarness();

  await controller.load();

  assert.equal(state.projectShortcutPreferences.visible, false);
  assert.equal(section.hidden, true);
  assert.match(container.innerHTML, /所有项目/);
  assert.doesNotMatch(container.innerHTML, /project-shortcut-heading">最近/);
  assert.match(container.innerHTML, /Alpha/);
  assert.match(container.innerHTML, /data-project-tree-toggle/);
});

test('项目树显示全部项目，展开后显示现有关联仓库并可打开', async () => {
  const { controller, container } = createHarness();
  await controller.load();

  assert.equal(controller.toggleExpandedProject(project.projectId), true);
  assert.match(container.innerHTML, /aria-expanded="true"/);
  assert.match(container.innerHTML, /data-project-repository-path="\/workspace\/alpha\/repo"/);
  assert.match(container.innerHTML, />repo<\/span>/);
  assert.equal(controller.openRepository('/workspace/alpha/repo'), true);
  assert.equal(controller.app.openedPath, '/workspace/alpha/repo');

  assert.equal(controller.toggleExpandedProject(project.projectId), true);
  assert.doesNotMatch(container.innerHTML, /data-project-repository-path/);
  assert.equal(controller.toggleExpandedProject('missing'), false);
});

test('修改项目区偏好立即更新侧边栏，清除最近记录保留其他数据', async () => {
  const { controller, state, section, container, writes } = createHarness();
  await controller.load();

  await controller.savePreferences({ visible: true, showRecent: true, recentLimit: 3 });
  await controller.setNavigationMode('projects');
  assert.equal(section.hidden, false);
  assert.match(container.innerHTML, /所有项目/);
  assert.match(container.innerHTML, /最近/);
  assert.match(container.innerHTML, /Alpha/);

  assert.equal(await controller.clearRecent(), true);
  assert.deepEqual(state.projectShortcuts.recent, []);
  assert.ok(writes.some(([key]) => key === 'projectShortcutPreferences'));
  assert.ok(writes.some(([key]) => key === 'projectShortcuts'));
});

test('保存项目后可先局部更新侧边栏，不必等待全量项目扫描', async () => {
  const { controller, state, container } = createHarness();
  await controller.load();

  const updated = await controller.upsertLocalProject({
    ...project,
    name: 'Alpha 更新',
    description: '已保存的新摘要'
  });

  assert.equal(updated.name, 'Alpha 更新');
  assert.equal(state.localProjects[0].description, '已保存的新摘要');
  assert.match(container.innerHTML, /Alpha 更新/);
});

test('项目、Git 仓库与目录只切换侧栏，并记住选择', async () => {
  const { controller, state, section, repositories, locations, tabs, container, repositoryContainer, writes } = createHarness();
  await controller.load();
  assert.equal(state.sidebarNavigationMode, 'directories');
  assert.equal(locations.hidden, false);
  await controller.setNavigationMode('projects');
  assert.equal(section.hidden, false);
  assert.equal(locations.hidden, true);
  assert.equal(tabs.projects.attributes['aria-selected'], 'true');
  assert.equal(tabs.projects.tabIndex, 0);
  assert.equal(tabs.directories.tabIndex, -1);
  assert.equal(state.currentPath, project.path);
  await controller.setNavigationMode('repositories');
  assert.equal(section.hidden, true);
  assert.equal(repositories.hidden, false);
  assert.equal(locations.hidden, true);
  assert.equal(tabs.repositories.attributes['aria-selected'], 'true');
  assert.match(repositoryContainer.innerHTML, /所有 Git 仓库/);
  assert.match(repositoryContainer.innerHTML, /Alpha repo/);
  assert.equal(controller.openRepository('/workspace/alpha/repo'), true);
  assert.equal(controller.app.openedPath, '/workspace/alpha/repo');
  await controller.load();
  assert.equal(state.sidebarNavigationMode, 'repositories');
  assert.ok(writes.some(([key, value]) => key === 'sidebarNavigationMode' && value === 'repositories'));
  await controller.setNavigationMode('projects');
  state.localProjects = [];
  state.projectShortcuts = ProjectShortcuts.defaultStore();
  controller.render();
  assert.equal(section.hidden, false);
  assert.match(container.innerHTML, /所有项目/);
  await controller.setNavigationMode('directories');
  assert.equal(section.hidden, true);
  assert.equal(locations.hidden, false);
  await controller.setNavigationMode('invalid');
  assert.equal(state.sidebarNavigationMode, 'directories');
});
