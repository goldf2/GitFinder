const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createUpdateManifest,
  writeUpdateManifest,
} = require('../scripts/generate-update-manifest');

test('更新清单使用产物文件名、大小和 Base64 SHA-512', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-update-manifest-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const artifactPath = path.join(directory, 'GitFinder-2-2.0.0-alpha.86-x64-win-setup.exe');
  const outputPath = path.join(directory, 'latest.yml');
  fs.writeFileSync(artifactPath, Buffer.from('verified installer'));
  const expectedHash = crypto.createHash('sha512').update('verified installer').digest('base64');

  const manifest = createUpdateManifest({
    version: '2.0.0-alpha.86',
    artifactPath,
    releaseDate: '2026-09-03T12:00:00.000Z',
  });
  assert.match(manifest, /^version: 2\.0\.0-alpha\.86$/m);
  assert.match(manifest, /url: GitFinder-2-2\.0\.0-alpha\.86-x64-win-setup\.exe/);
  assert.equal(manifest.includes(`sha512: ${expectedHash}`), true);
  assert.match(manifest, /size: 18/);

  writeUpdateManifest({
    version: '2.0.0-alpha.86',
    artifactPath,
    outputPath,
    releaseDate: '2026-09-03T12:00:00.000Z',
  });
  assert.equal(fs.readFileSync(outputPath, 'utf8'), manifest);
});

test('后台发布记录可管理 HTTPS 下载 URL、发布时间和更新说明', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-update-record-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const artifactPath = path.join(directory, 'GitFinder-2-2.0.0-alpha.86-arm64-mac.zip');
  fs.writeFileSync(artifactPath, 'zip');

  const manifest = createUpdateManifest({
    version: '2.0.0-alpha.86',
    artifactPath,
    artifactUrl: 'https://oaktechz.com/releases/gitfinder-2/alpha/GitFinder-2-2.0.0-alpha.86-arm64-mac.zip',
    releaseDate: '2026-09-03T12:00:00Z',
    releaseNotes: '新增在线更新\n保留本地数据',
  });

  assert.match(manifest, /url: https:\/\/oaktechz\.com\/releases\/gitfinder-2\/alpha\//);
  assert.match(manifest, /releaseDate: '2026-09-03T12:00:00\.000Z'/);
  assert.match(manifest, /releaseNotes: "新增在线更新\\n保留本地数据"/);
});

test('更新清单拒绝非语义版本或会破坏 YAML 的文件名', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-update-manifest-invalid-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const artifactPath = path.join(directory, 'artifact.zip');
  fs.writeFileSync(artifactPath, 'zip');
  assert.throws(() => createUpdateManifest({ version: 'alpha 86', artifactPath }), /version/i);

  const unsafePath = path.join(directory, 'artifact:name.zip');
  fs.writeFileSync(unsafePath, 'zip');
  assert.throws(() => createUpdateManifest({ version: '2.0.0-alpha.86', artifactPath: unsafePath }), /URL/);
  assert.throws(() => createUpdateManifest({
    version: '2.0.0-alpha.86',
    artifactPath,
    artifactUrl: 'https://user:secret@oaktechz.com/update.zip',
  }), /URL/);
  assert.throws(() => createUpdateManifest({
    version: '2.0.0-alpha.86',
    artifactPath,
    releaseDate: 'not-a-date',
  }), /releaseDate/);
});
