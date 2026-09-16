const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scripts } = require('../package.json');

test('npm test 只发现当前 test 目录，忽略 dist 内旧构建的同名测试', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-test-discovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'test'));
  fs.mkdirSync(path.join(root, 'dist', 'old-build', 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test', 'current.test.js'), "require('node:test')('current checkout', () => {});\n");
  fs.writeFileSync(path.join(root, 'dist', 'old-build', 'test', 'current.test.js'), "throw new Error('STALE_BUILD_MUST_NOT_RUN');\n");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // Run an independent test discovery, not a nested test worker.
  const result = spawnSync(scripts.test, { cwd: root, shell: true, env, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stdout, /STALE_BUILD_MUST_NOT_RUN/);
  assert.match(result.stdout, /tests 1\b/);
});
