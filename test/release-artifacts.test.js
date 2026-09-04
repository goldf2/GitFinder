const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { collectReleaseArtifacts, createStoreRelease } = require('../scripts/release-artifacts');

test('商店发布描述只收集可识别制品并绑定同一版本', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-release-bundle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const version = '2.0.0-alpha.88';
  for (const name of [
    `GitFinder-2-${version}-arm64-mac.zip`,
    `GitFinder-2-${version}-x64-win-setup.exe`,
    `GitFinder-2-${version}-x64-win-setup.exe.blockmap`,
    `GitFinder-2-${version}-x64-win.zip`,
    'latest.yml',
  ]) fs.writeFileSync(path.join(directory, name), name);

  const artifacts = collectReleaseArtifacts(directory, version);
  assert.deepEqual(artifacts.map((item) => item.packageKind).sort(), ['blockmap', 'nsis', 'portable', 'zip']);
  assert.ok(artifacts.every((item) => item.sha512.length === 128 && item.sizeBytes > 0));
});

test('发布描述拒绝缺少平台包、错误 commit 和版本混用', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-release-invalid-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'GitFinder-2-2.0.0-alpha.87-arm64-mac.zip'), 'mac');
  assert.throws(() => collectReleaseArtifacts(directory, '2.0.0-alpha.88'), /版本/);
  assert.throws(() => createStoreRelease({
    version: '2.0.0-alpha.88', channel: 'alpha', sourceCommit: 'dirty',
    title: { en: 'Release', zh: '发布' }, notes: { en: 'Notes', zh: '说明' }, artifacts: [],
  }), /commit/);
});
