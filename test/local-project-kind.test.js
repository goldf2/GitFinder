const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const LocalProjectService = require('../src/main/services/localProjectService').constructor;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-kind-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const configService = { getTreeRoots: () => [{ path: root }] };
  const service = new LocalProjectService({ configService });
  const project = path.join(root, 'sample'); fs.mkdirSync(project);
  return { root, project, service, configService, manifest: path.join(project, '.gitfinder', 'project.json') };
}

test('old manifests remain unclassified without being rewritten on read', t => {
  const f = fixture(t); f.service.initializeProject(f.project);
  const data = JSON.parse(fs.readFileSync(f.manifest)); delete data.projectKind;
  fs.writeFileSync(f.manifest, JSON.stringify(data)); const before = fs.readFileSync(f.manifest);
  assert.equal(f.service.getProject(f.project).projectKind, 'unclassified');
  assert.deepEqual(fs.readFileSync(f.manifest), before);
});

test('App, Web and mixed project kinds persist, survive service restart and preserve identity', async t => {
  const f = fixture(t);
  const initial = f.service.initializeProject(f.project, { name: 'Fixture', color: 'purple', lifecycle: 'maintenance', projectKind: 'app', excludedRepositories: ['vendor'] }).project;
  assert.equal(initial.projectKind, 'app');
  fs.writeFileSync(path.join(f.project, 'source.txt'), 'unchanged source');
  for (const kind of ['web', 'mixed', 'unclassified', 'app']) {
    const updated = f.service.updateProject(f.project, { projectKind: kind });
    assert.equal(updated.projectKind, kind); assert.equal(updated.projectId, initial.projectId);
    assert.equal(updated.name, initial.name); assert.equal(updated.color, initial.color);
    assert.equal(updated.lifecycle, initial.lifecycle); assert.deepEqual(updated.repositories, initial.repositories);
    const reopened = new LocalProjectService({ configService: f.configService });
    assert.equal(reopened.getProject(f.project).projectKind, kind);
    assert.equal((await reopened.listProjects())[0].projectKind, kind);
  }
  f.service.updateProject(f.project, { description: 'updated copy' });
  assert.equal(f.service.getProject(f.project).projectKind, 'app', 'old callers that omit kind preserve it');
  assert.equal(fs.readFileSync(path.join(f.project, 'source.txt'), 'utf8'), 'unchanged source');
  assert.equal(fs.existsSync(path.join(f.project, '.git')), false, 'classification never initializes Git');
});

test('invalid kinds and unmanaged paths cannot mutate project files', t => {
  const f = fixture(t); f.service.initializeProject(f.project, { projectKind: 'web' });
  const before = fs.readFileSync(f.manifest);
  for (const bad of [null, 'desktop', 'WEB', '<script>', [], {}, 1]) {
    assert.throws(() => f.service.updateProject(f.project, { projectKind: bad }), /项目形态/);
    assert.deepEqual(fs.readFileSync(f.manifest), before);
  }
  assert.throws(() => f.service.updateProject(path.dirname(f.root), { projectKind: 'app' }), /受管/);
});
