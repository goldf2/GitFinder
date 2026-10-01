const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const localProjectServiceSingleton = require('../src/main/services/localProjectService');
const LocalProjectService = localProjectServiceSingleton.constructor;

function createFixture(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-project-'));
  const managedRoot = path.join(tempRoot, 'managed');
  fs.mkdirSync(managedRoot);
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const localConfig = {};
  const configService = { get: key => localConfig[key], set: (key, value) => { localConfig[key] = value; }, getTreeRoots: () => [{ path: managedRoot, name: 'managed' }] };
  return {
    tempRoot,
    managedRoot,
    service: new LocalProjectService({ configService })
  };
}

function createRepo(directory) {
  fs.mkdirSync(path.join(directory, '.git'), { recursive: true });
}

test('设为项目只创建便携 project.json，不初始化 Git，并保持稳定 projectId', (t) => {
  const { managedRoot, service } = createFixture(t);
  const projectRoot = path.join(managedRoot, '普通目录');
  fs.mkdirSync(projectRoot);

  const first = service.initializeProject(projectRoot, { color: 'purple', lifecycle: 'active' });
  const second = service.initializeProject(projectRoot, { name: '不会覆盖' });
  const manifestPath = path.join(projectRoot, '.gitfinder', 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.project.projectId, first.project.projectId);
  assert.match(first.project.projectId, /^project_[0-9a-f-]{36}$/);
  assert.equal(manifest.name, '普通目录');
  assert.equal(manifest.color, 'purple');
  assert.equal(manifest.lifecycle, 'active');
  assert.deepEqual(manifest.repositories, { excluded: [] });
  assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);
});

test('项目设置保留 projectId，只接受相对排除路径', (t) => {
  const { managedRoot, service } = createFixture(t);
  const projectRoot = path.join(managedRoot, 'workspace');
  fs.mkdirSync(projectRoot);
  const created = service.initializeProject(projectRoot, {});

  const updated = service.updateProject(projectRoot, {
    name: '统一工作区',
    description: '包含多个交付仓库',
    color: 'green',
    lifecycle: 'maintenance',
    excludedRepositories: ['vendor/reference', './examples/demo', 'vendor/reference']
  });

  assert.equal(updated.projectId, created.project.projectId);
  assert.equal(updated.name, '统一工作区');
  assert.deepEqual(updated.repositories.excluded, ['examples/demo', 'vendor/reference']);
  assert.throws(
    () => service.updateProject(projectRoot, { excludedRepositories: ['/tmp/outside'] }),
    /相对路径/
  );
  assert.throws(
    () => service.updateProject(projectRoot, { excludedRepositories: ['../outside'] }),
    /项目目录内部/
  );
});

test('项目可聚合零个或多个仓库，排除目录不会进入结果', async (t) => {
  const { managedRoot, service } = createFixture(t);
  const emptyProject = path.join(managedRoot, 'empty');
  const multiProject = path.join(managedRoot, 'multi');
  fs.mkdirSync(emptyProject);
  fs.mkdirSync(path.join(multiProject, 'apps', 'web'), { recursive: true });
  fs.mkdirSync(path.join(multiProject, 'services', 'api'), { recursive: true });
  fs.mkdirSync(path.join(multiProject, 'vendor', 'reference'), { recursive: true });
  service.initializeProject(emptyProject, {});
  service.initializeProject(multiProject, { excludedRepositories: ['vendor/reference'] });
  createRepo(path.join(multiProject, 'apps', 'web'));
  createRepo(path.join(multiProject, 'services', 'api'));
  createRepo(path.join(multiProject, 'vendor', 'reference'));

  const projects = await service.listProjects();
  const empty = projects.find(project => project.path === emptyProject);
  const multi = projects.find(project => project.path === multiProject);

  assert.deepEqual(empty.repositories, []);
  assert.deepEqual(multi.repositories.map(repo => repo.relativePath), ['apps/web', 'services/api']);
  assert.equal(multi.repositoryCount, 2);
  assert.equal(Number.isFinite(Date.parse(multi.modifiedTime)), true);
  assert.equal(multi.repositories.every(repo => !path.isAbsolute(repo.relativePath)), true);
});

test('嵌套 project.json 建立独立子项目并截断父项目仓库扫描', async (t) => {
  const { managedRoot, service } = createFixture(t);
  const parentRoot = path.join(managedRoot, 'parent');
  const parentRepo = path.join(parentRoot, 'packages', 'one');
  const childRoot = path.join(parentRoot, 'child');
  const childRepo = path.join(childRoot, 'repo');
  fs.mkdirSync(parentRepo, { recursive: true });
  fs.mkdirSync(childRepo, { recursive: true });
  service.initializeProject(parentRoot, { name: 'Parent' });
  service.initializeProject(childRoot, { name: 'Child' });
  createRepo(parentRepo);
  createRepo(childRoot);
  createRepo(childRepo);

  const projects = await service.listProjects();
  const parent = projects.find(project => project.path === parentRoot);
  const child = projects.find(project => project.path === childRoot);

  assert.deepEqual(parent.repositories.map(repo => repo.relativePath), ['packages/one']);
  assert.deepEqual(child.repositories.map(repo => repo.relativePath), ['.']);
  assert.ok(projects.some(project => project.path === childRepo && project.rootIsGitRepo));
  assert.equal(projects.filter(project => [parentRoot, childRoot].includes(project.path)).length, 2);
});

test('Git仓库自动成为项目，身份和设置重开保留且不改写仓库文件', async t => {
  const { managedRoot, service } = createFixture(t);
  const repo = path.join(managedRoot, 'clone'); createRepo(repo);
  const first = service.describeDirectory(repo);
  assert.equal(first.isProject, true);
  assert.match(first.project.projectId, /^project_[0-9a-f-]{36}$/);
  service.updateProject(repo, { name: '产品', color: 'orange', projectKind: 'app' });
  const restarted = new LocalProjectService({ configService: service.configService });
  const projects = await restarted.listProjects();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].projectId, first.project.projectId);
  assert.equal(projects[0].name, '产品');
  assert.equal(projects[0].color, 'orange');
  assert.equal(projects[0].projectKind, 'app');
  assert.equal(projects[0].rootIsGitRepo, true);
  assert.deepEqual(fs.readdirSync(repo), ['.git']);
});

test('已有Git项目的清单ID优先，扫描不会覆盖旧会话和分组的身份', async t => {
  const { managedRoot, service } = createFixture(t);
  const repo = path.join(managedRoot, 'existing'); fs.mkdirSync(repo);
  const initial = service.initializeProject(repo, { name: '已有项目' }).project;
  const bytes = fs.readFileSync(initial.manifestPath); createRepo(repo);
  const projects = await service.listProjects();
  assert.equal(projects[0].projectId, initial.projectId);
  assert.deepEqual(fs.readFileSync(initial.manifestPath), bytes);
  assert.equal(service.configService.get('repositoryProjects'), undefined);
});

test('项目清单不能通过符号链接写到受管根之外', (t) => {
  const { tempRoot, managedRoot, service } = createFixture(t);
  const outside = path.join(tempRoot, 'outside');
  const link = path.join(managedRoot, 'linked');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, link, 'dir');

  assert.throws(() => service.initializeProject(link, {}), /符号链接|受管开发目录/);
  assert.equal(fs.existsSync(path.join(outside, '.gitfinder')), false);
});

 test('项目扫描排除临时及备份副本，显式加入的位置仍可查看', async t => {
  const { managedRoot, service } = createFixture(t);
  const normal = path.join(managedRoot, '项目', 'real');
  const temporary = path.join(managedRoot, '临时文件', 'build-copy');
  const backup = path.join(managedRoot, '制品与备份', 'snapshot');
  for (const directory of [normal, temporary, backup]) { fs.mkdirSync(directory, { recursive: true }); service.initializeProject(directory); }
  assert.deepEqual((await service.listProjects()).map(item => item.path), [normal]);
  service.configService.getTreeRoots = () => [{ path: managedRoot }, { path: temporary }];
  assert.deepEqual(new Set((await service.listProjects()).map(item => item.path)), new Set([normal, temporary]));
  assert.equal(fs.existsSync(path.join(temporary, '.gitfinder', 'project.json')), true);
});
