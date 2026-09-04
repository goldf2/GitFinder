const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gitService = require('../src/main/services/gitService');
const { startServer } = require('../server');

const projectRoot = path.resolve(__dirname, '..');
const cacheFile = path.join(projectRoot, '.git-monitor-cache.json');

function createScannedRepo(t, rootPath, name, readme = '') {
  const repoPath = path.join(rootPath, name);
  fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
  if (readme) fs.writeFileSync(path.join(repoPath, 'README.md'), readme);
  return repoPath;
}

async function postJson(port, route, body) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { response, payload: await response.json() };
}

test('Web 服务默认只监听本机且写操作默认关闭', async (t) => {
  const server = await startServer({ port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();

  assert.equal(address.address, '127.0.0.1');

  const response = await fetch(`http://127.0.0.1:${address.port}/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: '/tmp', action: 'status' })
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Web 写操作默认关闭，请在可信本机环境显式启用'
  });
});

test('Web 根页保留且旧桌面原型地址重定向到根页', async (t) => {
  const server = await startServer({ port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();

  const root = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /<title>Git状态监控<\/title>/);

  const legacy = await fetch(`http://127.0.0.1:${port}/desktop.html`, { redirect: 'manual' });
  assert.equal(legacy.status, 302);
  assert.equal(legacy.headers.get('location'), '/');
});

test('Web 状态接口保留 legacy 字段并强制读取最新 Git 状态', async (t) => {
  const previousCache = fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile) : null;
  t.after(() => previousCache ? fs.writeFileSync(cacheFile, previousCache) : fs.rmSync(cacheFile, { force: true }));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-web-status-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const repoPath = createScannedRepo(t, tempRoot, 'repo-a', '# Repo A\n\nWeb status preview.\n');
  const originalBatchStatus = gitService.batchStatus;
  const calls = [];
  gitService.batchStatus = async (repoPaths, options) => {
    calls.push({ repoPaths, options });
    return repoPaths.map(currentPath => ({
      path: currentPath,
      status: {
        isGitRepo: true,
        branch: 'main',
        ahead: 2,
        behind: 3,
        modified: 4,
        staged: 5,
        untracked: 6,
        lastCommit: {
          hash: 'abc1234',
          message: 'initial commit',
          timestamp: 1788220800,
          author: 'GitFinder Test',
          authoredAt: '2026-09-01T08:00:00+08:00'
        },
        remoteUrl: 'https://example.invalid/upstream.git',
        remoteUrlBackup: 'https://example.invalid/backup.git',
        remotes: [
          { name: 'origin', url: 'https://example.invalid/repo-a.git', type: 'fetch' },
          { name: 'origin', url: 'https://example.invalid/repo-a.git', type: 'push' },
          { name: 'backup', url: 'https://example.invalid/backup.git', type: 'fetch' }
        ]
      }
    }));
  };
  t.after(() => { gitService.batchStatus = originalBatchStatus; });

  const server = await startServer({ port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const { response, payload } = await postJson(port, '/api/status', {
    path: tempRoot,
    depth: 1,
    autoFetch: true
  });

  assert.equal(response.status, 200);
  assert.equal(payload.total, 1);
  assert.deepEqual(payload.statuses, [{
    name: 'repo-a',
    path: repoPath,
    branch: 'main',
    hasUncommitted: true,
    hasUnpushed: true,
    hasUnpulled: true,
    aheadCount: 2,
    behindCount: 3,
    modifiedCount: 4,
    stagedCount: 5,
    untrackedCount: 6,
    lastCommit: 'abc1234 - initial commit',
    lastCommitTime: '2026-09-01 08:00:00 +0800',
    remoteUrl: 'https://example.invalid/repo-a.git',
    remoteUrlBackup: 'https://example.invalid/backup.git',
    remotes: [
      { name: 'origin', url: 'https://example.invalid/repo-a.git', type: 'fetch' },
      { name: 'origin', url: 'https://example.invalid/repo-a.git', type: 'push' },
      { name: 'backup', url: 'https://example.invalid/backup.git', type: 'fetch' }
    ],
    readme: { title: 'Repo A', description: 'Web status preview.' },
    error: null
  }]);
  assert.match(payload.cachedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(calls, [{
    repoPaths: [repoPath],
    options: { autoFetch: true, forceRefresh: true }
  }]);
});

test('Web 刷新接口保留输入顺序和重复路径，并将单仓失败留在对应项', async (t) => {
  const repoA = path.join(os.tmpdir(), 'gitfinder-web-refresh-a');
  const repoB = path.join(os.tmpdir(), 'gitfinder-web-refresh-b');
  const repoMissing = path.join(os.tmpdir(), 'gitfinder-web-refresh-missing');
  const originalBatchStatus = gitService.batchStatus;
  const calls = [];
  gitService.batchStatus = async (repoPaths, options) => {
    calls.push({ repoPaths, options });
    return repoPaths.filter(repoPath => repoPath !== repoMissing).map(repoPath => repoPath === repoA
      ? { path: repoPath, status: { isGitRepo: true, branch: 'feature/a', modified: 1 } }
      : { path: repoPath, status: { isGitRepo: false }, error: '仓库读取失败' });
  };
  t.after(() => { gitService.batchStatus = originalBatchStatus; });

  const server = await startServer({ port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const { response, payload } = await postJson(port, '/api/refresh', {
    paths: [repoB, repoA, repoMissing, repoB],
    autoFetch: false
  });

  assert.equal(response.status, 200);
  assert.deepEqual(payload.statuses.map(status => status.path), [repoB, repoA, repoMissing, repoB]);
  assert.equal(payload.statuses[0].error, '仓库读取失败');
  assert.equal(payload.statuses[1].branch, 'feature/a');
  assert.equal(payload.statuses[1].hasUncommitted, true);
  assert.equal(payload.statuses[2].error, 'Git 状态结果缺失');
  assert.equal(payload.statuses[3].error, '仓库读取失败');
  assert.deepEqual(calls, [{
    repoPaths: [repoB, repoA, repoMissing],
    options: { autoFetch: false, forceRefresh: true }
  }]);
});

test('Electron 只使用正式渲染器且不携带旧桌面原型资源', () => {
  const mainSource = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');
  assert.match(mainSource, /loadFile\(path\.join\(__dirname, 'src', 'renderer', 'index\.html'\)\)/);

  for (const relativePath of [
    'public/desktop.html',
    'public/scripts/app.js',
    'public/scripts/content.js',
    'public/scripts/detail.js',
    'public/scripts/git.js',
    'public/scripts/sidebar.js',
    'public/styles/content.css',
    'public/styles/detail.css',
    'public/styles/main.css',
    'public/styles/sidebar.css'
  ]) assert.equal(fs.existsSync(path.join(projectRoot, relativePath)), false, `${relativePath} 应已移除`);
});
