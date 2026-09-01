const test = require('node:test');
const assert = require('node:assert/strict');
const { repositoryKey, matchRepository, resolveAssociation } = require('../src/shared/repositoryAssociation');
const fs = require('node:fs');
const path = require('node:path');
const flowSource = fs.readFileSync(path.join(__dirname, '../src/renderer/relationship-canvas/index.jsx'), 'utf8');
const repo = { id: 'repo_1', path: '/work/app', originUrl: 'git@github.com:owner/app.git' };
const deployment = { repositoryUrl: 'https://github.com/owner/app' };

test('源码身份统一 SSH、HTTPS、标准端口及 git 后缀，不包含凭据', () => {
  for (const value of ['git@github.com:Owner/App.git', 'ssh://git@github.com:22/owner/app.git', 'https://user:secret@GITHUB.com/owner/app.git/']) {
    assert.equal(repositoryKey(value), 'github.com/owner/app');
  }
  for (const value of ['owner/app', '/work/app', 'C:\\work\\app', 'file:///work/app', 'https://github.com/owner/app?token=secret']) assert.equal(repositoryKey(value), '');
  assert.notEqual(repositoryKey('https://git.example/Owner/App'), repositoryKey('https://git.example/owner/app'));
  assert.notEqual(repositoryKey('ssh://git@git.example:2222/owner/app'), repositoryKey('https://git.example/owner/app'));
});

test('唯一 origin 自动识别，多副本待确认；分支不能替代仓库身份', () => {
  assert.deepEqual(matchRepository(deployment, [repo]).repositoryIds, ['repo_1']);
  const result = matchRepository({ ...deployment, branch: 'main' }, [repo, { ...repo, id: 'repo_2', path: '/other/app', branch: 'main' }]);
  assert.equal(result.mode, 'ambiguous');
  assert.deepEqual(result.repositoryIds, []);
  assert.equal(result.candidateIds.length, 2);
  assert.equal(matchRepository(deployment, [{ ...repo, archived: true }, { ...repo, available: false }]).mode, 'unmatched');
  assert.equal(matchRepository(deployment, [{ ...repo, originUrl: 'git@github.com:other/app.git', upstreamUrl: deployment.repositoryUrl }]).mode, 'unmatched');
});

test('缺少 Git 主机时只推荐，不根据目录名或 Docker 镜像猜测', () => {
  assert.equal(matchRepository({ repositoryUrl: 'owner/app' }, [repo]).mode, 'suggested');
  assert.deepEqual(matchRepository({ repositoryUrl: 'owner/app' }, [repo]).repositoryIds, []);
  assert.equal(matchRepository({ name: 'app', imageReference: 'owner/app' }, [repo]).mode, 'no-source');
});

test('项目绑定和本机手工选择优先，解除后不会被自动刷新重新连接', () => {
  assert.deepEqual(resolveAssociation(deployment, [repo], [{ repositoryIds: ['missing_repo'] }], { mode: 'manual', repositoryIds: ['repo_1'] }).repositoryIds, ['missing_repo']);
  assert.equal(resolveAssociation(deployment, [repo], [{ repositoryIds: [] }], null).mode, 'project');
  assert.equal(resolveAssociation(deployment, [repo], [], { mode: 'manual', repositoryIds: ['missing_repo'] }).mode, 'manual');
  assert.equal(resolveAssociation(deployment, [repo], [], { mode: 'disabled' }).mode, 'disabled');
});

globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');

test('白板只扫描受管位置，合并而不覆盖仓库索引，扫描后刷新自动关联', async () => {
  const scanned = [], merged = [], notices = [];
  const c = new Controller({ notify: text => notices.push(text), bridge: {
    config: { getTreeRoots: async () => [{ path: '/managed' }, { path: '/offline' }] },
    fs: {
      inspectWorkspaceDirectories: async paths => ({ directories: paths.map(path => ({ path, available: path !== '/offline' })) }),
      findGitRepos: async (path, options) => { scanned.push(path); assert.equal(options.depth, Infinity); return [repo]; }
    },
    repos: { merge: async repos => merged.push(...repos) },
    panel: { getLocalRepositories: async () => [repo] }
  } });
  c._setPanelTopology = () => { c.panelProjection = { entities: [{ type: 'deployment', runtime: { repositoryIds: ['repo_1'] } }] }; };
  await c._scanManagedRepositories();
  assert.deepEqual(scanned, ['/managed']); assert.deepEqual(merged, [repo]);
  assert.equal(c.resourceMap.get('repository:repo_1').path, '/work/app');
  assert.match(notices[0], /1 个部署已关联/); assert.match(notices[0], /原关联已保留/);
  assert.equal(c.repositoryScanning, false);
});

test('部署简卡显示提交和关联信号，详情有路径和跳转，缺失与候选明确区分', () => {
  const c = new Controller({ bridge: {} });
  c._setResources([], [repo]);
  const entity = { id: 'entity_deploy01', type: 'deployment', name: 'App', details: {}, runtime: {
    commit: 'abcdef1234567890', commitSource: 'deployment-history', lastDeployment: { status: 'failed' },
    repositoryIds: ['repo_1'], repositoryAssociation: { mode: 'automatic' }
  } };
  assert.match(flowSource, /最近部署 \$\{commit\.slice\(0, 8\)\}/);
  assert.match(flowSource, /已关联本地/);
  const detail = c._repositoryAssociationHtml(entity) + c._runtimeInspectorRows(entity);
  assert.match(detail, /\/work\/app/); assert.match(detail, /data-panel-open-repository="repo_1"/);
  assert.match(detail, /最近部署结果/); assert.match(detail, /failed/);
  assert.match(flowSource, /本地目录缺失/);
  assert.match(flowSource, /待确认/);
  assert.match(flowSource, /提交未知/);
});

test('部署卡片只匹配当前部署，不扫描磁盘、不重新读取所有仓库、不改其他绑定', async () => {
  const notices = [];
  const unexpected = async () => { assert.fail('卡片匹配不能触发扫描或修改绑定'); };
  const c = new Controller({ notify: message => notices.push(message), bridge: {
    fs: { findGitRepos: unexpected }, panel: { getLocalRepositories: unexpected, setRepositoryAssociation: unexpected }
  } });
  c._setResources([], [repo]);
  const entity = { id: 'entity_deploy01', type: 'deployment', runtime: {
    providerId: 'coolify_fixture', resourceUuid: 'deploy_fixture', repositoryIds: ['repo_1'],
    repositoryAssociation: { mode: 'automatic', candidateIds: ['repo_1'] }
  } };
  c._allEntitiesById = () => new Map([[entity.id, entity]]);
  c._setPanelTopology = c._renderResources = c._renderGraph = c._updateSummary = c._renderInspector = () => {};
  c.repositoryAssociations = [{ providerId: 'other', resourceUuid: 'other', mode: 'manual', repositoryIds: ['repo_2'] }];
  const before = JSON.stringify(c.repositoryAssociations);
  const html = c._repositoryAssociationHtml(entity);
  assert.doesNotMatch(html, /scan-repositories|扫描受管目录并关联/);
  assert.match(html, /data-panel-association-action="match"/);
  assert.match(html, /匹配此部署/);
  await c._changeRepositoryAssociation(entity.id, 'match');
  assert.match(notices[0], /源码地址唯一匹配/);
  assert.equal(JSON.stringify(c.repositoryAssociations), before);
});

test('候选直接显示目录，无源码与未匹配有不同原因', () => {
  const c = new Controller({ bridge: {} });
  c._setResources([], [repo]);
  const entity = { id: 'entity_deploy01', type: 'deployment', runtime: { repositoryIds: [],
    repositoryAssociation: { mode: 'suggested', candidateIds: ['repo_1'] }
  } };
  assert.match(c._repositoryAssociationHtml(entity), /\/work\/app/);
  assert.match(c._repositoryAssociationHtml(entity), /确认候选仓库/);
  entity.runtime.repositoryAssociation = { mode: 'no-source', candidateIds: [] };
  assert.match(c._repositoryAssociationHtml(entity), /未提供 Git 源码地址/);
  entity.runtime.repositoryAssociation.mode = 'unmatched';
  assert.match(c._repositoryAssociationHtml(entity), /尚未找到相同源码地址/);
});
