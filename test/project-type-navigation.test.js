const test = require('node:test');
const assert = require('node:assert/strict');
const Projects = require('../src/shared/projectShortcuts');
const Query = require('../src/renderer/scripts/contentQuery');
const type = 'project_group_11111111-1111-4111-8111-111111111111';

test('异步目录渲染完成后无选择时显示当前项目，选中文件优先', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/scripts/app.js'), 'utf8');
  const body = source.match(/  directoryDetailItems\(\) \{([\s\S]*?)\n  \},/)[1];
  const project = { projectId: 'parent', name: '父项目', path: '/work/app' };
  const state = { currentPath: '/work/app', localProjects: [project] };
  const getDetails = vm.runInNewContext(`(function() {${body}})`, { AppState: state });
  assert.equal(getDetails.call({ getSelectedFileItems: () => [] })[0].project, project);
  const file = { path: '/work/app/readme.md' };
  assert.equal(getDetails.call({ getSelectedFileItems: () => [file] })[0], file);
  state.currentPath = '/work/app/docs';
  assert.equal(getDetails.call({ getSelectedFileItems: () => [] }).length, 0);
});

test('项目类型查询可保存重开、区分相邻类型，并在返回目录时清除', () => {
  const query = Query.normalize({ ...Query.queryForPreset('all-projects'), projectType: type });
  assert.equal(query.projectType, type);
  assert.deepEqual(Query.normalize(JSON.parse(JSON.stringify(query))), query);
  assert.equal(Query.equals(query, Query.queryForPreset('all-projects')), false);
  assert.equal(Query.normalize({ ...query, scope: 'current' }).projectType, '');
  assert.equal(Query.normalize({ ...query, projectType: '<script>' }).projectType, '');
});

test('类型过滤只匹配成员，不隐式包含子项目，未分类可筛选', () => {
  const projects = [{ projectId: 'parent' }, { projectId: 'child' }, { projectId: 'other' }];
  const groups = [{ groupId: type, projectIds: ['parent', 'other', 'missing'] }];
  assert.deepEqual(Projects.projectsForType(projects, groups, type), [projects[0], projects[2]]);
  assert.deepEqual(Projects.projectsForType(projects, groups, 'unclassified'), [projects[1]]);
  assert.deepEqual(Projects.projectsForType(projects, groups, ''), projects);
});

test('项目层级选择最近的真实父目录，不混淆同名前缀或中间普通文件夹', () => {
  const projects = [
    { projectId: 'a', path: '/work/app' },
    { projectId: 'b', path: '/work/app/packages/api' },
    { projectId: 'c', path: '/work/app/packages/api/plugin' },
    { projectId: 'd', path: '/work/app-other' }
  ];
  assert.deepEqual(Projects.projectChildren(projects).map(p => p.projectId), ['a', 'd']);
  assert.deepEqual(Projects.projectChildren(projects, 'a').map(p => p.projectId), ['b']);
  assert.deepEqual(Projects.projectChildren(projects, 'b').map(p => p.projectId), ['c']);
});
