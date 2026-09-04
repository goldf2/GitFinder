const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const configServiceSingleton = require('../src/main/services/configService');
const ConfigService = configServiceSingleton.constructor;

function git(repoPath, args) {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim();
}

function createRepo(root, name = 'repo') {
  const repoPath = path.join(root, name);
  fs.mkdirSync(repoPath, { recursive: true });
  git(repoPath, ['init']);
  git(repoPath, ['config', 'user.email', 'gitfinder-test@example.invalid']);
  git(repoPath, ['config', 'user.name', 'GitFinder Test']);
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# test\n');
  git(repoPath, ['add', 'README.md']);
  git(repoPath, ['commit', '-m', 'initial']);
  return repoPath;
}

function createService(configDir) {
  const service = new ConfigService();
  service.configDir = configDir;
  return service;
}

test('自动更新检查默认开启并允许界面独立关闭', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-update-preference-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const service = createService(path.join(tempRoot, 'config'));

  assert.equal(service.get('automaticUpdateChecks'), true);
  service.setRendererPreference('automaticUpdateChecks', false);
  assert.equal(service.get('automaticUpdateChecks'), false);
});

test('仓库 ID 在新提交后保持稳定', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-identity-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const repoPath = createRepo(tempRoot);
  const service = createService(path.join(tempRoot, 'config'));

  const firstId = service.generateRepoId(repoPath);
  fs.writeFileSync(path.join(repoPath, 'second.txt'), 'second\n');
  git(repoPath, ['add', 'second.txt']);
  git(repoPath, ['commit', '-m', 'second']);
  const secondId = service.generateRepoId(repoPath);

  assert.equal(secondId, firstId);
});

test('仓库目录移动后重绑定原注册项并保留 ID', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-relocate-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const configDir = path.join(tempRoot, 'config');
  const oldPath = createRepo(tempRoot, 'old-name');
  const service = createService(configDir);

  service.setRepos([{ path: oldPath, name: 'old-name' }], 1);
  const oldId = service.getIdByPath(oldPath);
  const newPath = path.join(tempRoot, 'new-name');
  fs.renameSync(oldPath, newPath);
  service.setRepos([{ path: newPath, name: 'new-name' }], 2);

  const registry = service.getRegistry();
  assert.equal(registry.repos.length, 1);
  assert.equal(registry.repos[0].path, newPath);
  assert.equal(registry.repos[0].id, oldId);
  assert.equal(registry.repos[0].archived, false);
  assert.equal(service.getRepos().repos[0].id, oldId);
});

test('损坏的配置会保留备份并恢复为可写默认配置', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-corrupt-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const configDir = path.join(tempRoot, 'config');
  fs.mkdirSync(configDir);
  fs.writeFileSync(path.join(configDir, 'config.json'), '{broken json');
  const service = createService(configDir);

  const config = service.getConfig();
  const backups = fs.readdirSync(configDir).filter(name => name.startsWith('config.json.corrupt-'));

  assert.equal(config.viewMode, 'tree');
  assert.equal(backups.length, 1);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8')));
  assert.equal(fs.readdirSync(configDir).some(name => name.endsWith('.tmp')), false);
});

test('已撤下的文件标签与收藏配置在首次读取时原子移除且不影响受管位置', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-obsolete-file-labels-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const configDir = path.join(tempRoot, 'config');
  fs.mkdirSync(configDir);
  const configFile = path.join(configDir, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({
    autoRefresh: false,
    fileLabels: { version: 1, labels: [], assignments: {} },
    favorites: [{ id: '/legacy', path: '/legacy', name: '旧收藏' }],
    hiddenQuickLocations: ['/Users/demo/Downloads'],
    sidebarSectionOrder: ['favorites', 'projects', 'locations'],
    sidebarCollapsedSections: ['favorites', 'locations'],
    treeRoots: [{ path: '/managed', name: '受管位置', expanded: true }]
  }));
  const service = createService(configDir);

  const config = service.getConfig();
  const persisted = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.equal(config.autoRefresh, false);
  assert.equal(Object.hasOwn(config, 'fileLabels'), false);
  assert.equal(Object.hasOwn(config, 'favorites'), false);
  assert.equal(Object.hasOwn(config, 'hiddenQuickLocations'), false);
  assert.deepEqual(config.sidebarSectionOrder, ['projects', 'locations']);
  assert.deepEqual(config.sidebarCollapsedSections, ['locations']);
  assert.deepEqual(config.treeRoots, [{ path: '/managed', name: '受管位置', expanded: true }]);
  assert.equal(Object.hasOwn(persisted, 'fileLabels'), false);
  assert.equal(Object.hasOwn(persisted, 'favorites'), false);
  assert.equal(Object.hasOwn(persisted, 'hiddenQuickLocations'), false);
  assert.deepEqual(persisted.sidebarSectionOrder, ['projects', 'locations']);
  assert.deepEqual(persisted.sidebarCollapsedSections, ['locations']);
  assert.deepEqual(persisted.treeRoots, [{ path: '/managed', name: '受管位置', expanded: true }]);
});

test('目录移动、归档和恢复会同步仓库、分类、标签页与目录偏好', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-rebind-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const managedRoot = path.join(tempRoot, 'managed');
  const oldParent = path.join(managedRoot, 'old-parent');
  fs.mkdirSync(managedRoot);
  const repoPath = createRepo(oldParent, 'repo');
  const service = createService(path.join(tempRoot, 'config'));
  service.addTreeRoot(managedRoot, 'managed');
  service.setRepos([{ path: repoPath, name: 'repo' }], 1);
  const group = service.createGroup('Desktop', '#007AFF');
  const groupId = group.groups[0].id;
  service.addRepoToGroup(groupId, repoPath);
  const repoId = service.getIdByPath(repoPath);
  service.set('workspaceTabSession', {
    version: 1,
    activeTabId: 'tab-repo',
    tabs: [{
      id: 'tab-repo',
      path: repoPath,
      title: 'repo',
      mode: 'tree',
      history: [managedRoot, oldParent, repoPath],
      historyIndex: 2
    }],
    closedTabs: [{ id: 'closed-repo', path: repoPath, history: [repoPath], historyIndex: 0 }]
  });
  service.set('directoryViewPreferences', {
    [oldParent]: { style: 'list', sortBy: 'time', sortOrder: 'desc', columnWidth: 312, updatedAt: 100 },
    [repoPath]: { style: 'card', sortBy: 'name', sortOrder: 'asc', updatedAt: 200 }
  });
  const newParent = path.join(managedRoot, 'new-parent');
  fs.renameSync(oldParent, newParent);
  service.validateRebindPaths([{ from: oldParent, to: newParent }]);
  service.rebindPaths([{ from: oldParent, to: newParent }]);
  const newRepoPath = path.join(newParent, 'repo');

  assert.equal(service.getIdByPath(newRepoPath), repoId);
  assert.equal(service.getRepos().repos[0].path, newRepoPath);
  assert.deepEqual(service.getGroups().groups[0].repoPaths, [newRepoPath]);
  assert.equal(service.get('workspaceTabSession').tabs[0].path, newRepoPath);
  assert.deepEqual(service.get('workspaceTabSession').tabs[0].history, [managedRoot, newParent, newRepoPath]);
  assert.deepEqual(service.get('directoryViewPreferences'), {
    [newParent]: { style: 'list', sortBy: 'time', sortOrder: 'desc', columnWidth: 312, updatedAt: 100 },
    [newRepoPath]: { style: 'card', sortBy: 'name', sortOrder: 'asc', updatedAt: 200 }
  });
  const snapshot = service.archivePaths([newParent]);
  assert.equal(service.listActive().some(repo => repo.id === repoId), false);
  assert.equal(service.getRepos().repos.length, 0);
  assert.equal(service.get('workspaceTabSession').tabs[0].path, managedRoot);
  assert.equal(service.get('workspaceTabSession').closedTabs.length, 0);

  service.restoreArchivedPaths([newParent], snapshot);
  assert.equal(service.listActive().some(repo => repo.id === repoId), true);
  assert.equal(service.getRepos().repos[0].path, newRepoPath);
  assert.deepEqual(service.getGroups().groups[0].repoPaths, [newRepoPath]);
  assert.equal(service.get('workspaceTabSession').tabs[0].path, newRepoPath);
  assert.equal(service.get('workspaceTabSession').closedTabs[0].path, newRepoPath);
});

test('渲染层配置写入只允许偏好键，不能替换受管根或复活旧收藏配置', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-renderer-config-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const managedRoot = path.join(tempRoot, 'managed');
  fs.mkdirSync(managedRoot);
  const service = createService(path.join(tempRoot, 'config'));
  service.addTreeRoot(managedRoot, 'managed');

  service.setRendererPreference('cardStyle', 'list');
  assert.equal(service.get('cardStyle'), 'list');
  service.setRendererPreference('columnViewWidth', 320);
  assert.equal(service.get('columnViewWidth'), 320);
  service.setRendererPreference('sidebarNavigationMode', 'repositories');
  assert.equal(service.get('sidebarNavigationMode'), 'repositories');
  service.setRendererPreference('relationshipDynamicLayouts', {
    version: 1,
    boards: { board_test0001: { entity_panel_server_12345678: { x: 120, y: 80 } } }
  });
  assert.equal(service.get('relationshipDynamicLayouts').boards.board_test0001.entity_panel_server_12345678.x, 120);
  service.setRendererPreference('relationshipPanelLayout', { library: { side: 'left', collapsed: true }, inspector: { side: 'right' } });
  assert.equal(service.get('relationshipPanelLayout').library.collapsed, true);
  service.setRendererPreference('semanticColorProfile', {
    preset: 'custom',
    colors: { folder: '#ABCDEF', project: 'invalid', gitBadge: '#7654A1', gitMark: '#FFFFFF', extra: '#000000' },
    lifecycle: { active: '#123456', frozen: 'invalid', extra: '#000000' },
    extra: true
  });
  const semanticColors = service.get('semanticColorProfile');
  assert.equal(semanticColors.colors.folder, '#abcdef');
  assert.equal(semanticColors.colors.project, '#0a84ff');
  assert.equal(semanticColors.colors.gitBadge, '#7654a1');
  assert.equal(semanticColors.lifecycle.active, '#123456');
  assert.equal(Object.hasOwn(semanticColors.colors, 'extra'), false);
  assert.equal(Object.hasOwn(semanticColors, 'extra'), false);
  service.setRendererPreference('smartCollections', {
    version: 1,
    collections: [{ id: 'collection_one', name: '开发中项目', query: { scope: 'all', projectOnly: true } }]
  });
  assert.equal(service.get('smartCollections').collections[0].id, 'collection_one');
  service.setRendererPreference('projectShortcuts', {
    version: 1,
    pinned: [{
      projectId: 'project_11111111-1111-4111-8111-111111111111',
      name: 'Alpha',
      path: '/must-not-persist'
    }],
    recent: []
  });
  assert.deepEqual(service.get('projectShortcuts').pinned, [{
    projectId: 'project_11111111-1111-4111-8111-111111111111',
    name: 'Alpha'
  }]);
  service.setRendererPreference('projectShortcutPreferences', {
    visible: false,
    showRecent: true,
    recentLimit: '5',
    path: '/must-not-persist'
  });
  assert.deepEqual(service.get('projectShortcutPreferences'), {
    visible: false,
    showRecent: true,
    recentLimit: 5
  });
  assert.throws(() => service.setRendererPreference('treeRoots', []), /不允许/);
  assert.throws(() => service.setRendererPreference('favorites', []), /不允许/);
  assert.throws(() => service.setRendererPreference('themeMode', 'x'.repeat(2 * 1024 * 1024 + 1)), /大小限制/);
  assert.deepEqual(service.getTreeRoots(), [{ path: managedRoot, name: 'managed', expanded: true }]);
});

test('受管根必须是真实存在目录且界面更新不能改写路径', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-tree-root-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const directoryPath = path.join(tempRoot, 'workspace');
  const filePath = path.join(tempRoot, 'README.md');
  fs.mkdirSync(directoryPath);
  fs.writeFileSync(filePath, 'readme');
  const service = createService(path.join(tempRoot, 'config'));

  assert.throws(() => service.addTreeRoot('relative/path'), /绝对路径/);
  assert.throws(() => service.addTreeRoot(filePath), /必须是文件夹/);
  assert.throws(() => service.addTreeRoot(path.join(tempRoot, 'missing')), /不存在/);
  service.addTreeRoot(directoryPath, ' Workspace ');
  service.updateTreeRoot(directoryPath, { path: tempRoot, expanded: false, name: '开发目录' });
  assert.deepEqual(service.getTreeRoots(), [{ path: directoryPath, name: '开发目录', expanded: false }]);
  assert.throws(() => service.removeTreeRoot('relative/path'), /路径无效/);
  service.removeTreeRoot(directoryPath);
  assert.deepEqual(service.getTreeRoots(), []);
  assert.equal(fs.existsSync(directoryPath), true);
});

test('路径配置事务中途写入失败会恢复全部文件和内存快照', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-config-rollback-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const managedRoot = path.join(tempRoot, 'managed');
  const oldPath = createRepo(managedRoot, 'before');
  const newPath = path.join(managedRoot, 'after');
  const service = createService(path.join(tempRoot, 'config'));
  service.addTreeRoot(managedRoot, 'managed');
  service.setRepos([{ path: oldPath, name: 'before' }], 1);
  service.set('lastPath', oldPath);
  fs.renameSync(oldPath, newPath);

  const originalWrite = service._writeJsonFileAtomic.bind(service);
  let injected = false;
  service._writeJsonFileAtomic = (filePath, value) => {
    if (!injected && filePath === service.reposFile && value?.repos?.some(repo => repo.path === newPath)) {
      injected = true;
      throw new Error('injected config write failure');
    }
    return originalWrite(filePath, value);
  };

  assert.throws(
    () => service.rebindPaths([{ from: oldPath, to: newPath }]),
    /injected config write failure/
  );
  assert.equal(service.getRegistry().repos[0].path, oldPath);
  assert.equal(service.getRepos().repos[0].path, oldPath);
  assert.equal(service.get('lastPath'), oldPath);
  assert.equal(JSON.parse(fs.readFileSync(service.registryFile, 'utf8')).repos[0].path, oldPath);
  assert.equal(JSON.parse(fs.readFileSync(service.reposFile, 'utf8')).repos[0].path, oldPath);
  assert.equal(JSON.parse(fs.readFileSync(service.configFile, 'utf8')).lastPath, oldPath);
  assert.equal(fs.existsSync(service.transactionFile), false);
});

test('启动时会把中断的路径配置事务一致地向前恢复', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-config-recovery-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const managedRoot = path.join(tempRoot, 'managed');
  const oldPath = createRepo(managedRoot, 'before');
  const newPath = path.join(managedRoot, 'after');
  const configDir = path.join(tempRoot, 'config');
  const service = createService(configDir);
  service.addTreeRoot(managedRoot, 'managed');
  service.setRepos([{ path: oldPath, name: 'before' }], 1);
  service.set('lastPath', oldPath);
  const groupId = service.createGroup('Desktop', '#7357bd').groups[0].id;
  service.addRepoToGroup(groupId, oldPath);
  const keys = ['registry', 'repos', 'config'];
  const before = service._snapshotConfigTransactionFiles(keys);

  fs.renameSync(oldPath, newPath);
  service.rebindPaths([{ from: oldPath, to: newPath }]);
  const after = service._snapshotConfigTransactionFiles(keys);
  for (const item of before) {
    service._writeJsonFileAtomic(service._configTransactionFilePath(item.key), item.value);
  }
  service._writeJsonFileAtomic(service.registryFile, after.find(item => item.key === 'registry').value);
  const afterByKey = new Map(after.map(item => [item.key, item.value]));
  const journal = {
    version: 1,
    id: 'config_recovery_test',
    operation: 'rebind-paths',
    phase: 'prepared',
    createdAt: Date.now(),
    files: before.map(item => ({ key: item.key, before: item.value, after: afterByKey.get(item.key) }))
  };
  service._writeConfigTransactionJournal(journal);

  const restarted = createService(configDir);
  const recovery = restarted.getConfigTransactionRecoveryStatus();

  assert.equal(recovery.recovered, true);
  assert.equal(recovery.action, 'rolled-forward');
  assert.equal(recovery.operation, 'rebind-paths');
  assert.equal(restarted.getRegistry().repos[0].path, newPath);
  assert.equal(restarted.getRepos().repos[0].path, newPath);
  assert.equal(restarted.get('lastPath'), newPath);
  assert.deepEqual(restarted.getGroups().groups[0].repoPaths, [newPath]);
  assert.equal(fs.existsSync(path.join(configDir, 'config-transaction.json')), false);
});

test('损坏的配置事务记录会原样保留并拒绝后续路径修改', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-config-corrupt-transaction-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const configDir = path.join(tempRoot, 'config');
  const service = createService(configDir);
  service.getConfig();
  service.getRepos();
  service.getRegistry();
  const journalPath = path.join(configDir, 'config-transaction.json');
  fs.writeFileSync(journalPath, '{broken transaction', { mode: 0o600 });

  const restarted = createService(configDir);
  const recovery = restarted.getConfigTransactionRecoveryStatus();

  assert.equal(recovery.needsReview, true);
  assert.match(recovery.error, /JSON|Unexpected|position/i);
  assert.equal(fs.readFileSync(journalPath, 'utf8'), '{broken transaction');
  restarted.getConfig();
  restarted.getRepos();
  restarted.getRegistry();
  const snapshot = restarted._snapshotConfigTransactionFiles(['registry', 'repos', 'config']);
  assert.throws(
    () => restarted._commitConfigTransaction('test-refused', snapshot, snapshot),
    /存在未解决的配置事务/
  );
  assert.equal(fs.readFileSync(journalPath, 'utf8'), '{broken transaction');
});
