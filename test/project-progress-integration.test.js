const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../src/renderer/scripts/projectProgressModel');
const ProjectTaskRelations = require('../src/renderer/scripts/projectTaskRelations');
const source = { kind: 'repository-ledger', authority: '项目内任务台账', relativePath: 'docs/00-handoff/TASKS.json', ledgerPath: '/managed/store/docs/00-handoff/TASKS.json', generatedAt: '2026-09-16T08:00:00Z', writebackAllowed: false };
function portfolio() {
  return { success: true, projects: [{ projectId: 'store', name: 'Store', projectRoot: '/managed/store', updatedAt: source.generatedAt, source, nextTaskId: 'A' }], tasks: [
    { key: 'store:D', projectId: 'store', projectName: 'Store', projectRoot: '/managed/store', taskId: 'D', title: '<unsafe> Docs', status: '已完成', sourceStatus: 'done', completed: true, kind: 'documentation', isLeaf: true, priority: 'P0', owner: 'AI', acceptance: [{ criterion: 'Review' }], evidence: [], userAcceptance: 'pending', source },
    { key: 'store:A', projectId: 'store', projectName: 'Store', projectRoot: '/managed/store', taskId: 'A', title: 'Auth', status: '阻塞', sourceStatus: 'blocked', completed: false, kind: 'feature', isLeaf: true, priority: 'P0', blockers: ['Waiting'], acceptance: [], evidence: [], source }
  ], milestones: [], timeline: [], dependencies: [], warnings: [], contentRevision: 'one' };
}
function loadUI(overrides = {}) {
  const AppState = { currentMode: 'tasks', taskPortfolio: portfolio(), taskFilters: { projectId: 'all', status: 'all', priority: 'all', leafOnly: true }, taskGitEvidenceByKey: new Map(), taskGitEvidenceLoading: new Set() };
  const App = { escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'), updateStatusBar() {} };
  const document = { visibilityState: 'visible', activeElement: null, getElementById: () => ({}), querySelector: () => null };
  const window = { gitFinder: { projectTasks: { getPortfolio: async () => AppState.taskPortfolio } }, setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} };
  const context = { App, AppState, document, window, ProjectTaskRelations, console, ...overrides };
  for (const file of ['projectProgress.js', 'projectTasks.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/scripts', file), 'utf8'), context);
  return context;
}

test('dashboard counts the same source tasks without converting document completion to feature acceptance', () => {
  const p = portfolio();
  const stats = Model.aggregate([Model.fromTaskProject({path:'/managed/store'},p.projects[0],p,new Date(source.generatedAt))]);
  assert.equal(stats.taskCount,2);assert.equal(stats.taskCompletedCount,1);assert.equal(stats.taskBlockedCount,1);assert.equal(stats.documentationTaskCount,1);
  assert.equal(stats.missingControlProjects.length,0);assert.equal(stats.sourceProjects.length,1);
  assert.equal(Model.isComplete({status:'已验证，待交付'}),false);assert.equal(Model.isComplete({status:'已验收完成'}),true);
});
test('canonical source errors/empty ledgers never trigger parallel CSV initialization', () => {
  const p=portfolio();p.projects[0].sourceError='Invalid JSON';p.tasks=[];
  const s=Model.aggregate([Model.fromTaskProject({},p.projects[0],p)]);
  assert.equal(s.unavailableProjects.length,1);assert.equal(s.missingControlProjects.length,0);assert.equal(s.tracked,0);assert.equal(s.untrackedProjects.length,0);
  delete p.projects[0].sourceError;
  const empty=Model.aggregate([Model.fromTaskProject({},p.projects[0],p)]);
  assert.equal(empty.initialized,1);assert.equal(empty.tracked,0);assert.equal(empty.missingControlProjects.length,0);
});
test('project scope deduplicates child repositories and respects segment boundaries and category scope', () => {
  const projects=[{projectId:'a',projectRoot:'/p/app',name:'App'},{projectId:'b',projectRoot:'/p/app-two',name:'App Two'},{projectId:'c',projectRoot:'/p/docs',name:'Docs'}];
  const repos=[{path:'/p/app/front'},{path:'/p/app/back'},{path:'/p/app-two'}];
  assert.equal(Model.scopeRepositories(repos,projects).length,2);
  assert.equal(Model.scopeRepositories(repos,projects,{includeUnlisted:true}).length,3);
  assert.equal(Model.scopeRepositories([],projects,{includeUnlisted:true,knownRepositories:repos}).length,1, 'Filtered-out Git projects must not be added back as unlisted');
  assert.equal(Model.matchProject('/p/app-other',projects),null);
  assert.equal(Model.matchProject('C:\\DEV\\APP\\front',[{projectRoot:'c:/dev/app'}]).projectRoot,'c:/dev/app');
});
test('dashboard source precedence does not read or seed legacy control files', async () => {
  const p=portfolio();let reads=0;
  const raw=fs.readFileSync(path.join(__dirname,'../src/renderer/scripts/app.js'),'utf8');
  const method=raw.slice(raw.indexOf('  async collectDashboardStats('),raw.indexOf('\n  percent(value, total)'));
  const context = {
    AppState: { taskPortfolio: p }, ProjectProgressModel: Model,
    window: { gitFinder: { config: { get: async () => ({}) }, fs: {
      listProjectControlFiles: async () => { reads++; throw new Error('not expected'); }
    } } }
  };
  vm.runInNewContext(`App={${method}}`,context);
  const stats=await context.App.collectDashboardStats([{path:'/managed/store',name:'Store'}],p);
  assert.equal(reads,0);assert.equal(stats.taskCount,2);
});
test('repository task detail is escaped, source-linked and cannot preview LPM writeback', () => {
  const {App,AppState}=loadUI();const task=AppState.taskPortfolio.tasks[0];
  const html=App.getProjectTaskDetailHtml(task);
  assert.match(html,/&lt;unsafe&gt;/);assert.doesNotMatch(html,/<unsafe>/);
  assert.match(html,/待用户确认/);assert.match(html,/定位原始台账/);assert.match(html,/不会自动勾选/);
  assert.doesNotMatch(html,/data-task-edit=|data-task-status-preview=|data-task-create-child=/);
  AppState.taskFilters.status='open';assert.equal(App.getFilteredProjectTasks().length,1);
});
test('dashboard project drilldown selects tasks without corrupting appearance settings', async () => {
  const {App,AppState}=loadUI();let target='';App.switchView=view=>{target=view;};App.setMode=()=>{throw new Error('appearance must not change');};
  await App.openProgressProjectTasks('store');assert.equal(target,'tasks');assert.equal(AppState.taskFilters.projectId,'store');assert.equal(AppState.taskFilters.status,'all');
});
test('foreground refresh skips editing/background and deduplicates concurrent reads', async () => {
  const {App,AppState,window,document}=loadUI();let reads=0,renders=0;
  window.gitFinder.projectTasks.getPortfolio=async()=>{reads++;return {...portfolio(),contentRevision:`new${reads}`};};
  App.renderProjectTasksView=()=>{renders++;};App.ensureProjectProgressPolling();
  AppState.taskEditTaskKey='store:A';await App._refreshProjectProgress();assert.equal(reads,0);
  AppState.taskEditTaskKey=null;document.visibilityState='hidden';await App._refreshProjectProgress();assert.equal(reads,0);
  document.visibilityState='visible';AppState.currentMode='tree';await App._refreshProjectProgress();assert.equal(reads,0);
  AppState.currentMode='tasks';await App._refreshProjectProgress();assert.equal(reads,1);assert.equal(renders,1);
  await Promise.all([App.readProjectProgressPortfolio(true),App.readProjectProgressPortfolio(true)]);assert.equal(reads,2);
});
test('late refresh never repaints a different view and unchanged revision avoids rerender', async () => {
  const {App,AppState,window}=loadUI();let renders=0;
  App.renderProjectTasksView=()=>{renders++;};App.ensureProjectProgressPolling();
  await App._refreshProjectProgress();assert.equal(renders,0);
  window.gitFinder.projectTasks.getPortfolio=async()=>{AppState.currentMode='tree';return {...portfolio(),contentRevision:'new'};};
  await App._refreshProjectProgress();assert.equal(renders,0);
});
