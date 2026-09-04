const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ARTIFACT_PATTERNS = [
  {
    pattern: /^GitFinder-2-(.+)-arm64-mac\.zip$/,
    platform: 'macos', architecture: 'arm64', packageKind: 'zip', contentType: 'application/zip',
  },
  {
    pattern: /^GitFinder-2-(.+)-x64-win-setup\.exe$/,
    platform: 'windows', architecture: 'x64', packageKind: 'nsis', contentType: 'application/vnd.microsoft.portable-executable',
  },
  {
    pattern: /^GitFinder-2-(.+)-x64-win-setup\.exe\.blockmap$/,
    platform: 'windows', architecture: 'x64', packageKind: 'blockmap', contentType: 'application/octet-stream',
  },
  {
    pattern: /^GitFinder-2-(.+)-x64-win\.zip$/,
    platform: 'windows', architecture: 'x64', packageKind: 'portable', contentType: 'application/zip',
  },
];

function hashFile(filePath, algorithm = 'sha512', encoding = 'hex') {
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

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath];
  });
}

function artifactFromFile(filePath, version, rootDirectory) {
  const fileName = path.basename(filePath);
  const definition = ARTIFACT_PATTERNS.find(({ pattern }) => pattern.test(fileName));
  if (!definition) return null;
  const matchedVersion = fileName.match(definition.pattern)?.[1];
  if (matchedVersion !== version) {
    throw new Error(`制品版本与 package.json 不一致: ${fileName}`);
  }
  return {
    platform: definition.platform,
    architecture: definition.architecture,
    packageKind: definition.packageKind,
    fileName,
    relativePath: path.relative(rootDirectory, filePath).split(path.sep).join('/'),
    sizeBytes: fs.statSync(filePath).size,
    sha512: hashFile(filePath),
    contentType: definition.contentType,
  };
}

function collectReleaseArtifacts(directory, version) {
  const root = path.resolve(directory);
  const artifacts = walkFiles(root)
    .map((filePath) => artifactFromFile(filePath, version, root))
    .filter(Boolean)
    .sort((left, right) => left.fileName.localeCompare(right.fileName));
  const requiredSlots = ['macos/arm64/zip', 'windows/x64/nsis', 'windows/x64/blockmap'];
  const slots = new Set(artifacts.map((item) => `${item.platform}/${item.architecture}/${item.packageKind}`));
  const missing = requiredSlots.filter((slot) => !slots.has(slot));
  if (missing.length) throw new Error(`发布包缺少必要制品: ${missing.join(', ')}`);
  return artifacts;
}

function createStoreRelease({ version, channel, sourceCommit, title, notes, artifacts }) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('版本号不是有效语义版本');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(channel)) throw new Error('发布渠道无效');
  if (!/^[a-f0-9]{7,64}$/i.test(sourceCommit)) throw new Error('源码提交必须是 Git commit SHA');
  if (!title.en || !title.zh || !notes.en || !notes.zh) throw new Error('中英文标题和发布说明不能为空');
  return {
    schemaVersion: 1,
    productSlug: 'gitfinder-2',
    version,
    channel,
    sourceCommit,
    title,
    notes,
    artifacts,
  };
}

module.exports = {
  artifactFromFile,
  collectReleaseArtifacts,
  createStoreRelease,
  hashFile,
};
