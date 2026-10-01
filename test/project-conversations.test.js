const test = require('node:test');
const assert = require('node:assert/strict');
const { ProjectConversationService } = require('../src/main/services/projectConversationService');
const projectId = 'project_11111111-1111-4111-8111-111111111111';
const idA = '11111111-1111-4111-8111-111111111111';
const idB = '22222222-2222-4222-8222-222222222222';
const idC = '33333333-3333-4333-8333-333333333333';
const chat = (source, threadId, role = 'primary') => ({ source, threadId, title: `测试 ${source}`, role });

function fixture() {
  const configService = { config: {}, get(key) { return this.config[key]; }, set(key, value) { this.config[key] = value; } };
  const opened = [];
  const service = new ProjectConversationService({ configService, listProjects: async () => [{ projectId }], openExternal: async url => opened.push(url) });
  return { service, configService, opened };
}

test('Codex 与 ChatGPT 分别保留主会话，只能打开已登记会话', async () => {
  const { service, opened } = fixture();
  await service.save(projectId, [chat('codex', idA), chat('chatgpt', idB)]);
  await service.open(projectId, 'codex');
  await service.open(projectId, 'chatgpt');
  assert.deepEqual(opened, [`codex://threads/${idA}`, `https://chatgpt.com/c/${idB}`]);
  await assert.rejects(service.open(projectId, 'codex', idC), /尚未关联/);
  assert.equal(opened.length, 2);
});

test('导入只替换同源主会话并合并旧历史，重复导入幂等', async () => {
  const { service } = fixture();
  await service.save(projectId, [chat('codex', idA), chat('chatgpt', idB)]);
  const input = { schemaVersion: 1, projects: [{ projectId, conversations: [chat('codex', idC)] }] };
  await service.import(input);
  const result = await service.import(input);
  assert.deepEqual(result.projects[0].conversations.map(item => [item.source, item.threadId, item.role]), [['codex', idA, 'history'], ['chatgpt', idB, 'primary'], ['codex', idC, 'primary']]);
});

test('跨项目关联讨论保留 related，空来源可选择该讨论为主会话', async () => {
  const { service } = fixture();
  await service.save(projectId, [chat('chatgpt', idB)]);
  const result = await service.import({ schemaVersion: 1, projects: [{ projectId, conversations: [chat('chatgpt', idC, 'related'), chat('codex', idA, 'related')] }] });
  assert.equal(result.projects[0].conversations.find(item => item.threadId === idC).role, 'related');
  assert.equal(result.projects[0].conversations.find(item => item.threadId === idA).role, 'primary');
});

test('URL 校验拒绝其它域、参数与执行协议，失败不覆盖已有关联', async () => {
  const { service } = fixture();
  await service.save(projectId, [chat('codex', idA)]);
  for (const url of ['javascript:alert(1)', `https://chatgpt.com.evil.test/c/${idA}`, `https://user@chatgpt.com/c/${idA}`, `codex://threads/${idA}?prompt=hi`, `codex://new/${idA}`, `codex://threads/c/${idA}`]) {
    await assert.rejects(service.save(projectId, [{ url, title: '错误链接', role: 'primary' }]));
  }
  assert.equal(service.list().projects[0].conversations[0].threadId, idA);
  await service.save(projectId, [{ url: `https://chatgpt.com/c/${idB}`, title: '云会话', role: 'primary' }]);
  assert.equal(service.list().projects[0].conversations[0].source, 'chatgpt');
});

test('未知项目、重复会话与同源多个主会话不会产生部分导入', async () => {
  const { service } = fixture();
  await assert.rejects(service.save(projectId, [chat('codex', idA), chat('codex', idC)]), /各只能设置一个主会话/);
  await assert.rejects(service.save(projectId, [chat('codex', idA), chat('codex', idA, 'history')]), /重复关联/);
  await assert.rejects(service.import({ schemaVersion: 1, projects: [{ projectId, conversations: [chat('codex', idA)] }, { projectId: 'project_22222222-2222-4222-8222-222222222222', conversations: [chat('chatgpt', idB)] }] }), /未扫描到/);
  assert.deepEqual(service.list().projects, []);
});

test('磁盘写入失败恢复内存，清空关联不会更改项目文件', async () => {
  const { service, configService } = fixture();
  await service.save(projectId, [chat('codex', idA)]);
  const original = configService.set;
  configService.set = function(key, value) { this.config[key] = value; throw new Error('磁盘失败'); };
  await assert.rejects(service.save(projectId, [chat('codex', idC)]), /磁盘失败/);
  assert.equal(service.list().projects[0].conversations[0].threadId, idA);
  configService.set = original;
  await service.save(projectId, []);
  assert.deepEqual(service.list().projects, []);
});

function collaborationFixture() {
  const { configService, opened } = fixture();
  const projectPath = '/managed/project';
  let reads = 0;
  const service = new ProjectConversationService({
    configService, openExternal: async url => opened.push(url),
    listProjects: async () => [{ projectId, path: projectPath, repositories: [{ path: projectPath, relativePath: '.' }] }],
    getRemotes: () => [{ name: 'origin', fetchUrl: 'git@github.com:owner/repo.git' }],
    readLocalTasks: () => ({ projects: [], tasks: [{ taskId: 'TASK-1', projectRoot: projectPath, title: '原始台账任务', sourceStatus: 'in_progress' }] }),
    readGithub: async () => { reads++; return [{ html_url: 'https://github.com/owner/repo/issues/3', title: '现有 Issue', state: 'open' }, { html_url: 'https://github.com/owner/repo/pull/4', title: '现有 PR', state: 'open' }]; }
  });
  return { service, opened, reads: () => reads };
}

test('协作板复用本地任务与仓库；仅显式刷新读取 GitHub Issue 和 PR', async () => {
  const { service, reads } = collaborationFixture();
  const initial = await service.workspace(projectId);
  assert.equal(initial.tasks[0].taskId, 'TASK-1');
  assert.equal(initial.repositories[0].repository, 'owner/repo');
  assert.equal(initial.github, null);
  assert.equal(reads(), 0);
  const refreshed = await service.workspace(projectId, { refreshGithub: true });
  assert.deepEqual(refreshed.github.items.map(item => item.type), ['Issue', 'PR']);
  assert.equal(reads(), 1);
  await service.workspace(projectId);
  assert.equal(reads(), 1);
});

test('会话保留任务ID和 GitHub引用，拒绝其它仓库和不存在的本地任务', async () => {
  const { service, opened } = collaborationFixture();
  const refs = [{ kind: 'local', taskId: 'TASK-1' }, { kind: 'github', url: 'https://github.com/owner/repo/issues/3' }];
  await service.save(projectId, [{ ...chat('codex', idA), taskRefs: refs }]);
  assert.deepEqual(service.list().projects[0].conversations[0].taskRefs, refs);
  await service.import({ schemaVersion: 1, projects: [{ projectId, conversations: [chat('codex', idA)] }] });
  assert.deepEqual(service.list().projects[0].conversations[0].taskRefs, refs);
  await service.openGithubTask(projectId, refs[1].url);
  await service.openRepository(projectId, 'owner/repo', 'pulls');
  assert.deepEqual(opened, [refs[1].url, 'https://github.com/owner/repo/pulls']);
  await assert.rejects(service.save(projectId, [{ ...chat('codex', idA), taskRefs: [{ kind: 'github', url: 'https://github.com/other/repo/issues/3' }] }]), /现有 GitHub 仓库/);
  await assert.rejects(service.save(projectId, [{ ...chat('codex', idA), taskRefs: [{ kind: 'local', taskId: 'ABSENT' }] }]), /未在该项目台账/);
  await assert.rejects(service.openGithubTask(projectId, 'https://github.com/owner/repo/issues/999'), /尚未关联或刷新/);
  assert.deepEqual(service.list().projects[0].conversations[0].taskRefs, refs);
});

test('GitHub读取失败可见且不泄露CLI stderr，不修改台账任务状态', async () => {
  const { service } = collaborationFixture();
  service.readGithub = async () => { throw Error('private-auth-token-must-not-leak'); };
  const result = await service.workspace(projectId, { refreshGithub: true });
  assert.equal(result.githubErrors.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-auth-token/);
  assert.equal(result.tasks[0].sourceStatus, 'in_progress');
});

test('GitHub 返回不同仓库身份时明确提示，不能误当空列表或跨仓库关联', async () => {
  const { service } = collaborationFixture();
  service.readGithub = async () => [{ html_url: 'https://github.com/new-owner/repo/issues/3', title: '迁移后的任务', state: 'open' }];
  const result = await service.workspace(projectId, { refreshGithub: true });
  assert.equal(result.github.items.length, 0);
  assert.match(result.githubErrors[0], /改名或转移/);
  assert.deepEqual((await service.workspace(projectId)).githubErrors, result.githubErrors);
});
