#!/usr/bin/env node

const path = require('node:path');
const {
  flipFuses,
  FuseVersion,
  FuseV1Options,
} = require('@electron/fuses');

const projectRoot = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const configuredFuses = pkg.build.electronFuses;

const ignoredSource = /^\/(?:dist|\.git|\.github|\.trae|test|docs|scripts|resources|prototypes)(?:$|\/)|^\/(?:AGENTS\.md|ARCHITECTURE\.md|CODEX_MEMORY\.md|CODEX_RELEASE_VALIDATION\.md|CONTEXT\.md|README\.md|\.gitignore|\.git-monitor-cache\.json)$|^\/public\/icon-master\.png$|(?:^|\/)\.DS_Store$/;

async function hardenElectron({ buildPath }) {
  const stagedAppPath = path.resolve(buildPath, '..', '..', '..');
  await flipFuses(stagedAppPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: configuredFuses.runAsNode,
    [FuseV1Options.EnableCookieEncryption]: configuredFuses.enableCookieEncryption,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: configuredFuses.enableNodeOptionsEnvironmentVariable,
    [FuseV1Options.EnableNodeCliInspectArguments]: configuredFuses.enableNodeCliInspectArguments,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: configuredFuses.enableEmbeddedAsarIntegrityValidation,
    [FuseV1Options.OnlyLoadAppFromAsar]: configuredFuses.onlyLoadAppFromAsar,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: configuredFuses.loadBrowserProcessSpecificV8Snapshot,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: configuredFuses.grantFileProtocolExtraPrivileges,
  });
}

function createPackagerOptions(environment = process.env) {
  const official = environment.GITFINDER_RELEASE_MODE === 'official';
  const options = {
    dir: projectRoot,
    name: pkg.productName,
    platform: 'darwin',
    arch: 'arm64',
    out: path.join(projectRoot, 'dist'),
    asar: true,
    overwrite: true,
    prune: true,
    icon: path.join(projectRoot, 'public', 'icon.icns'),
    extraResource: path.join(projectRoot, 'resources', 'app-update.yml'),
    appBundleId: pkg.build.appId,
    appVersion: pkg.version,
    ignore: ignoredSource,
    afterAsar: [hardenElectron],
  };

  if (environment.ELECTRON_ZIP_DIR) {
    options.electronZipDir = environment.ELECTRON_ZIP_DIR;
  }
  if (official) {
    options.osxSign = {
      identity: environment.GITFINDER_CODESIGN_IDENTITY,
      hardenedRuntime: true,
      continueOnError: false,
      ...(environment.GITFINDER_CODESIGN_KEYCHAIN
        ? { keychain: environment.GITFINDER_CODESIGN_KEYCHAIN }
        : {}),
    };
    options.osxNotarize = {
      keychainProfile: environment.GITFINDER_NOTARY_KEYCHAIN_PROFILE,
      ...(environment.GITFINDER_CODESIGN_KEYCHAIN
        ? { keychain: environment.GITFINDER_CODESIGN_KEYCHAIN }
        : {}),
    };
  }
  return options;
}

async function main() {
  const { packager } = await import('@electron/packager');
  await packager(createPackagerOptions());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`macOS 打包失败：${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  createPackagerOptions,
  hardenElectron,
  ignoredSource,
};
