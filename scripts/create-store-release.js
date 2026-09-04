#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { collectReleaseArtifacts, createStoreRelease } = require('./release-artifacts');

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

try {
  const packageJson = require('../package.json');
  const artifactsDirectory = path.resolve(argument('--artifacts-dir', 'release-bundle'));
  const outputPath = path.resolve(argument('--output', path.join(artifactsDirectory, 'store-release.json')));
  const descriptor = createStoreRelease({
    version: packageJson.version,
    channel: argument('--channel', 'alpha'),
    sourceCommit: argument('--source-commit', process.env.GITHUB_SHA || ''),
    title: {
      en: String(process.env.RELEASE_TITLE_EN || '').trim(),
      zh: String(process.env.RELEASE_TITLE_ZH || '').trim(),
    },
    notes: {
      en: String(process.env.RELEASE_NOTES_EN || '').trim(),
      zh: String(process.env.RELEASE_NOTES_ZH || '').trim(),
    },
    artifacts: collectReleaseArtifacts(artifactsDirectory, packageJson.version),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(descriptor, null, 2)}\n`, 'utf8');
  console.log(`已生成 OakTech 发布描述: ${outputPath}`);
  console.log(`版本 ${descriptor.version}，共 ${descriptor.artifacts.length} 个制品。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
