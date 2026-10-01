const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitOverview } = require('../src/renderer/scripts/workspacePresentation');
const ProjectKinds = require('../src/shared/projectKinds');
const review = { stagedCount: 0, unstagedCount: 3, totalCount: 3, files: Array.from({ length: 3 }, (_, i) => ({ path: `src/file-${i}.js`, unstaged: true })) };
const status = { branch: 'main', ahead: 0, behind: 0, hasRemote: true, upstream: 'origin/main' };
const log = Array.from({ length: 12 }, (_, i) => ({ hash: `abc000${i}`, message: `Commit ${i}`, author: 'Fixture' }));

test('summary hides zero counters and keeps every remote operation in a native disclosure', () => {
  const html = gitOverview({ status, review, log });
  assert.doesNotMatch(html, /已暂存 0|未暂存 0|领先 0|落后 0|<h2>/);
  assert.match(html, /3 未暂存/);
  assert.equal((html.match(/class="workspace-more"/g) || []).length, 1);
  for (const action of ['review', 'fetch', 'pull', 'push', 'tools']) assert.match(html, new RegExp(`data-workspace-git="${action}"`));
  assert.match(html, /class="workspace-more">/);
});

test('all fetched commits survive compact first-five presentation and escaped text is never markup', () => {
  const html = gitOverview({ status, review, log: [...log.slice(0, 11), { hash: 'abc123', message: '<script>bad()</script>', author: '" onclick="bad' }] });
  assert.equal((html.match(/class="workspace-commit"/g) || []).length, 12);
  assert.equal((html.split('class="workspace-history-more"')[0].match(/class="workspace-commit"/g) || []).length, 5);
  assert.match(html, /展开其余 7 条最近提交/);
  assert.doesNotMatch(html, /<script>|title="" onclick/);
  assert.match(html, /&lt;script&gt;/);
});

test('collapsed files retain absolute review indices, staged state, and the service-limit warning', () => {
  const files = Array.from({ length: 11 }, (_, i) => ({ path: `src/${i}.js`, staged: true, unstaged: i === 9 }));
  const html = gitOverview({ status, log: [], review: { ...review, stagedCount: 11, totalCount: 30, files, limited: true } });
  assert.match(html, /展开其余 3 个文件/);
  for (let i = 0; i < 11; i++) assert.match(html, new RegExp(`data-workspace-diff="${i}"`));
  assert.match(html, /已暂存 · 未暂存/); assert.match(html, /部分结果/);
  assert.match(html, /id="workspace-diff-panel"[^>]*hidden/);
});

test('clean, no-remote and locally cached ahead/behind states are distinct', () => {
  const clean = { ...review, stagedCount: 0, unstagedCount: 0, totalCount: 0, files: [] };
  assert.match(gitOverview({ status: { ...status, hasRemote: false }, review: clean, log: [] }), /未配置远端/);
  const diverged = gitOverview({ status: { ...status, ahead: 2, behind: 4 }, review: clean, log: [] });
  assert.match(diverged, /↑ 2 待推送/); assert.match(diverged, /↓ 4 待拉取/); assert.match(diverged, /本地远端缓存/);
  assert.doesNotMatch(diverged, /已同步/);
});

test('project kinds remain distinct from custom groups and are loaded before workspace rendering', () => {
  assert.equal(ProjectKinds.normalize(undefined), 'unclassified');
  assert.equal(ProjectKinds.label('app'), 'App 项目'); assert.equal(ProjectKinds.label('web'), 'Web 项目');
  assert.equal(ProjectKinds.label('mixed'), 'App + Web'); assert.throws(() => ProjectKinds.normalize('constructor'));
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  assert.ok(html.indexOf('shared/projectKinds.js') < html.indexOf('scripts/workspaceController.js'));
  assert.match(html, /id="local-project-kind"/); assert.match(html, /id="local-project-types"/);
});
