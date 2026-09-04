#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function hashFile(filePath, algorithm = 'sha512', encoding = 'base64') {
  const hash = crypto.createHash(algorithm);
  const handle = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead;
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest(encoding);
}

function normalizeArtifactUrl(artifactPath, artifactUrl) {
  const value = String(artifactUrl || path.basename(artifactPath)).trim();
  if (/^https:/i.test(value)) {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('更新产物 URL 不能携带凭据、查询参数或片段');
    }
    return parsed.toString();
  }
  if (!/^[0-9A-Za-z._-]+$/.test(value)) throw new Error('更新产物 URL 不安全');
  return value;
}

function normalizeReleaseDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('releaseDate 必须是有效日期');
  return date.toISOString();
}

function createUpdateManifest({
  version,
  artifactPath,
  artifactUrl,
  releaseDate = new Date().toISOString(),
  releaseNotes = '',
}) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version || ''))) {
    throw new Error('version 必须是语义版本');
  }
  const downloadUrl = normalizeArtifactUrl(artifactPath, artifactUrl);
  const normalizedReleaseDate = normalizeReleaseDate(releaseDate);
  const size = fs.statSync(artifactPath).size;
  const sha512 = hashFile(artifactPath);
  const notes = String(releaseNotes || '');
  return [
    `version: ${version}`,
    'files:',
    `  - url: ${downloadUrl}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${downloadUrl}`,
    `sha512: ${sha512}`,
    `releaseDate: '${normalizedReleaseDate}'`,
    ...(notes ? [`releaseNotes: ${JSON.stringify(notes)}`] : []),
    '',
  ].join('\n');
}

function writeUpdateManifest(options) {
  const manifest = createUpdateManifest(options);
  fs.writeFileSync(options.outputPath, manifest, 'utf8');
  return manifest;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

if (require.main === module) {
  try {
    const version = readArgument('--version');
    const artifactPath = path.resolve(readArgument('--artifact'));
    const outputPath = path.resolve(readArgument('--output'));
    if (!version || !readArgument('--artifact') || !readArgument('--output')) {
      throw new Error('用法: generate-update-manifest --version <version> --artifact <file> --output <file>');
    }
    const releaseNotesFile = readArgument('--release-notes-file');
    writeUpdateManifest({
      version,
      artifactPath,
      outputPath,
      artifactUrl: readArgument('--artifact-url') || undefined,
      releaseDate: readArgument('--release-date') || undefined,
      releaseNotes: releaseNotesFile
        ? fs.readFileSync(path.resolve(releaseNotesFile), 'utf8')
        : '',
    });
    console.log(`已生成更新清单: ${outputPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  createUpdateManifest,
  hashFile,
  normalizeArtifactUrl,
  normalizeReleaseDate,
  writeUpdateManifest,
};
