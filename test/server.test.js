const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { startServer } = require('../server');

const projectRoot = path.resolve(__dirname, '..');

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
