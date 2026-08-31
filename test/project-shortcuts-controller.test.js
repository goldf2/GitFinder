const test = require('node:test');
const assert = require('node:assert/strict');

const { Controller } = require('../src/renderer/scripts/projectShortcutsController');
const ProjectShortcuts = require('../src/shared/projectShortcuts');

const project = {
  projectId: 'project_11111111-1111-4111-8111-111111111111',
  name: 'Alpha',
  path: '/workspace/alpha',
  rootIsGitRepo: true
};

function createHarness() {
  const section = { hidden: true };
  const locations = { hidden: false };
  const tabs = Object.fromEntries(['projects', 'directories'].map(mode => [mode, {
    dataset: { sidebarNavigation: mode }, attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; }
  }]));
  const container = {
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
    projectShortcutPreferences: ProjectShortcuts.defaultPreferences()
  };
  const controller = new Controller({
    state,
    platform: 'darwin',
    document: {
      getElementById(id) {
        if (id === 'project-shortcuts-sidebar-section') return section;
        if (id === 'project-shortcuts-list') return container;
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
      openLocalProject() {},
      _showStatusMessage() {}
    }
  });
  return { controller, state, section, locations, tabs, container, writes };
}

test('项目快捷控制器加载本机偏好并按设置隐藏侧边栏', async () => {
  const { controller, state, section, container } = createHarness();

  await controller.load();

  assert.equal(state.projectShortcutPreferences.visible, false);
  assert.equal(section.hidden, true);
  assert.match(container.innerHTML, /所有项目/);
  assert.doesNotMatch(container.innerHTML, /project-shortcut-heading">最近/);
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

test('项目与目录只切换侧栏，记住选择且空项目保留所有项目入口', async () => {
  const { controller, state, section, locations, tabs, container, writes } = createHarness();
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
  await controller.load();
  assert.equal(state.sidebarNavigationMode, 'projects');
  assert.ok(writes.some(([key, value]) => key === 'sidebarNavigationMode' && value === 'projects'));
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
