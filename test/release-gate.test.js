const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  evaluateMacSignature,
  parseLatestMacManifest,
  validateElectronFuses,
  validateMacManifest,
  validatePackagedContents,
  validateSourceConfiguration,
} = require('../scripts/verify-release');

function validSource(overrides = {}) {
  return {
    packageJson: {
      version: '2.0.0-alpha.1',
      productName: 'GitFinder 2 Alpha',
      build: {
        appId: 'com.gitfinder.app.v2',
        productName: 'GitFinder 2 Alpha',
        electronFuses: {
          runAsNode: false,
          enableCookieEncryption: false,
          enableNodeOptionsEnvironmentVariable: false,
          enableNodeCliInspectArguments: false,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          loadBrowserProcessSpecificV8Snapshot: false,
          grantFileProtocolExtraPrivileges: true,
        },
        mac: {
          icon: 'public/icon.icns',
          target: ['dmg', 'zip'],
        },
        win: { icon: 'public/icon.ico' },
        linux: { icon: 'public/icon.png' },
      },
    },
    lockJson: {
      version: '2.0.0-alpha.1',
      packages: { '': { version: '2.0.0-alpha.1' } },
    },
    appUpdateText: '',
    mode: 'official',
    expectedTag: 'v2.0.0-alpha.1',
    iconHeaders: {
      png: Buffer.from('89504e470d0a1a0a', 'hex'),
      icns: Buffer.from('69636e73', 'hex'),
      ico: Buffer.from('00000100', 'hex'),
    },
    ...overrides,
  };
}

test('正式发布源门禁要求版本、标签、独立 Bundle ID 和图标完全一致', () => {
  const result = validateSourceConfiguration(validSource());
  assert.deepEqual(result.issues, []);

  const broken = validateSourceConfiguration(validSource({
    expectedTag: 'v2.0.0-alpha.0',
    lockJson: {
      version: '2.0.0-alpha.0',
      packages: { '': { version: '2.0.0-alpha.1' } },
    },
  }));
  assert.deepEqual(
    broken.issues.map((issue) => issue.code),
    ['version.lock', 'tag.version'],
  );
});

test('开发构建不要求 Git 标签，但仍执行固定产品身份检查', () => {
  const result = validateSourceConfiguration(validSource({
    mode: 'development',
    expectedTag: '',
  }));
  assert.deepEqual(result.issues, []);

  const broken = validateSourceConfiguration(validSource({
    mode: 'development',
    expectedTag: '',
    packageJson: {
      ...validSource().packageJson,
      build: {
        ...validSource().packageJson.build,
        appId: 'example.unstable.app',
      },
    },
  }));
  assert.equal(broken.issues[0].code, 'bundle.id');
});

test('发布源门禁拒绝恢复 Electron 的高风险默认开关', () => {
  const source = validSource();
  source.packageJson.build.electronFuses.runAsNode = true;
  source.packageJson.build.electronFuses.enableEmbeddedAsarIntegrityValidation = false;

  const result = validateSourceConfiguration(source);
  assert.deepEqual(result.issues.map((entry) => entry.code), ['fuses.config']);
});

test('应用自有 Panel 会话构建不得启用会访问系统钥匙串的 Cookie 加密 Fuse', () => {
  const source = validSource();
  source.packageJson.build.electronFuses.enableCookieEncryption = true;
  const result = validateSourceConfiguration(source);
  assert.deepEqual(result.issues.map((entry) => entry.code), ['fuses.config']);
});

test('产物门禁要求危险 Electron 入口关闭且 ASAR 校验开启', () => {
  const expected = {
    RunAsNode: false,
    EnableCookieEncryption: false,
    EnableNodeOptionsEnvironmentVariable: false,
    EnableNodeCliInspectArguments: false,
    EnableEmbeddedAsarIntegrityValidation: true,
    OnlyLoadAppFromAsar: true,
    LoadBrowserProcessSpecificV8Snapshot: false,
    GrantFileProtocolExtraPrivileges: true,
  };
  assert.deepEqual(validateElectronFuses(expected).issues, []);

  const broken = { ...expected, RunAsNode: true, OnlyLoadAppFromAsar: false };
  assert.deepEqual(validateElectronFuses(broken).issues.map((entry) => entry.code), ['fuses.artifact']);
});

test('macOS 应用包不应夹带测试、内部上下文或本地缓存', () => {
  assert.deepEqual(validatePackagedContents([
    '/main.js',
    '/package.json',
    '/src/renderer/index.html',
  ]).issues, []);

  const broken = validatePackagedContents([
    '/main.js',
    '/test/release-gate.test.js',
    '/CONTEXT.md',
    '/.git-monitor-cache.json',
  ]);
  assert.deepEqual(broken.issues.map((entry) => entry.code), ['app.asar-contents']);
});

test('升级清单必须绑定精确文件名、大小和 Base64 SHA-512', () => {
  const sha512 = Buffer.alloc(64, 7).toString('base64');
  const manifest = parseLatestMacManifest(`version: 1.25.0
files:
  - url: GitFinder-1.25.0-arm64-mac.zip
    sha512: ${sha512}
    size: 12345
path: GitFinder-1.25.0-arm64-mac.zip
sha512: ${sha512}
releaseDate: '2026-08-27T00:00:00.000Z'
`);

  const valid = validateMacManifest({
    manifest,
    version: '1.25.0',
    zipName: 'GitFinder-1.25.0-arm64-mac.zip',
    zipSize: 12345,
    zipSha512Base64: sha512,
  });
  assert.deepEqual(valid.issues, []);

  const broken = validateMacManifest({
    manifest,
    version: '1.25.1',
    zipName: 'GitFinder-1.25.1-arm64-mac.zip',
    zipSize: 12346,
    zipSha512Base64: Buffer.alloc(64, 8).toString('base64'),
  });
  assert.deepEqual(
    broken.issues.map((issue) => issue.code),
    ['manifest.version', 'manifest.url', 'manifest.path', 'manifest.size', 'manifest.sha512'],
  );
});

test('开发门禁允许 ad-hoc 签名但明确标记为不可分发', () => {
  const result = evaluateMacSignature({
    mode: 'development',
    details: 'Identifier=com.gitfinder.app\nSignature=adhoc\nTeamIdentifier=not set\nflags=0x2(adhoc,linker-signed)',
    entitlements: '',
    codesignValid: true,
    gatekeeperAccepted: false,
    stapleValid: false,
    expectedTeamId: '',
  });

  assert.deepEqual(result.issues, []);
  assert.equal(result.eligibleForDistribution, false);
  assert.equal(result.signatureType, 'adhoc');
  assert.ok(result.warnings.some((warning) => warning.code === 'signature.adhoc'));
});

test('正式发布拒绝 ad-hoc、缺少 Hardened Runtime、时间戳与公证票据', () => {
  const result = evaluateMacSignature({
    mode: 'official',
    details: 'Identifier=com.gitfinder.app\nSignature=adhoc\nTeamIdentifier=not set\nflags=0x2(adhoc,linker-signed)',
    entitlements: '',
    codesignValid: true,
    gatekeeperAccepted: false,
    stapleValid: false,
    expectedTeamId: 'ABCDE12345',
  });

  assert.equal(result.eligibleForDistribution, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    [
      'signature.developerId',
      'signature.team',
      'signature.runtime',
      'signature.timestamp',
      'notarization.gatekeeper',
      'notarization.staple',
    ],
  );
});

test('正式发布只在 Developer ID、团队、Hardened Runtime、时间戳和公证全部通过时放行', () => {
  const details = [
    'Identifier=com.gitfinder.app',
    'Authority=Developer ID Application: Example Company (ABCDE12345)',
    'Authority=Developer ID Certification Authority',
    'TeamIdentifier=ABCDE12345',
    'Timestamp=Aug 27, 2026 at 08:00:00',
    'flags=0x10000(runtime)',
  ].join('\n');

  const result = evaluateMacSignature({
    mode: 'official',
    details,
    entitlements: '<?xml version="1.0"?><plist><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>',
    codesignValid: true,
    gatekeeperAccepted: true,
    stapleValid: true,
    expectedTeamId: 'ABCDE12345',
  });

  assert.deepEqual(result.issues, []);
  assert.equal(result.eligibleForDistribution, true);
  assert.equal(result.signatureType, 'developer-id');
  assert.equal(result.teamIdentifier, 'ABCDE12345');
});

test('正式发布拒绝调试 get-task-allow 权限', () => {
  const result = evaluateMacSignature({
    mode: 'official',
    details: [
      'Authority=Developer ID Application: Example Company (ABCDE12345)',
      'TeamIdentifier=ABCDE12345',
      'Timestamp=Aug 27, 2026 at 08:00:00',
      'flags=0x10000(runtime)',
    ].join('\n'),
    entitlements: '<key>com.apple.security.get-task-allow</key><true/>',
    codesignValid: true,
    gatekeeperAccepted: true,
    stapleValid: true,
    expectedTeamId: 'ABCDE12345',
  });

  assert.deepEqual(result.issues.map((issue) => issue.code), ['entitlements.get-task-allow']);
  assert.equal(result.eligibleForDistribution, false);
});

test('Alpha 验证工作流只手动构建并且不继承 1.x 发布目标', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const workflow = fs.readFileSync(path.join(projectRoot, '.github/workflows/release.yml'), 'utf8');
  const buildScript = fs.readFileSync(path.join(projectRoot, 'scripts/build-mac.sh'), 'utf8');
  const packageScript = fs.readFileSync(path.join(projectRoot, 'scripts/package-mac.js'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:\s*[\s\S]*tags:/);
  assert.match(workflow, /run: npm run check/);
  assert.match(workflow, /run: npm run pack/);
  assert.match(workflow, /dist\/release-verification\.json/);
  assert.doesNotMatch(workflow, /softprops\/action-gh-release/);

  assert.match(buildScript, /node scripts\/package-mac\.js/);
  assert.doesNotMatch(packageScript, /app-update\.yml/);
  assert.match(packageScript, /continueOnError:\s*false/);
  assert.match(packageScript, /keychainProfile:\s*environment\.GITFINDER_NOTARY_KEYCHAIN_PROFILE/);
  assert.match(buildScript, /--phase artifact/);
  assert.match(packageScript, /afterAsar:\s*\[hardenElectron\]/);
  assert.match(packageScript, /FuseV1Options\.EnableEmbeddedAsarIntegrityValidation/);
  assert.match(packageScript, /\.github\|\\\.trae\|test\|docs/);
  assert.doesNotMatch(packageScript, /appleIdPassword/);
  assert.equal(fs.existsSync(path.join(projectRoot, 'resources/app-update.yml')), false);
  assert.equal(packageJson.productName, 'GitFinder 2 Alpha');
  assert.equal(packageJson.build.appId, 'com.gitfinder.app.v2');
  assert.equal(packageJson.build.publish, undefined);
  assert.equal(packageJson.scripts.publish, undefined);
  assert.equal(packageJson.scripts['dist:builder'], undefined);
});

test('Packager 将正式签名开关解析为布尔值而不是字符串', async () => {
  const cliPath = path.resolve(__dirname, '../node_modules/@electron/packager/dist/cli.js');
  const { parseArgs } = await import(pathToFileURL(cliPath).href);
  const options = parseArgs([
    '.',
    'GitFinder',
    '--osx-sign.identity=Developer ID Application: Example (ABCDE12345)',
    '--osx-sign.hardenedRuntime',
    '--no-osx-sign.continueOnError',
    '--osx-notarize.keychainProfile=gitfinder-notary',
    '--osx-notarize.keychain=/tmp/gitfinder.keychain-db',
  ]);

  assert.equal(options.osxSign.hardenedRuntime, true);
  assert.equal(options.osxSign.continueOnError, false);
  assert.equal(options.osxNotarize.keychainProfile, 'gitfinder-notary');
  assert.equal(options.osxNotarize.keychain, '/tmp/gitfinder.keychain-db');
});

function normalizeForTest(value) {
  return String(value).replace(/\r\n/g, '\n').trim();
}
