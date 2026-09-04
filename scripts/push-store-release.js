#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashFile } = require('./release-artifacts');

const CHUNK_BYTES = 8 * 1024 * 1024;

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function releaseBaseUrl(value) {
  const parsed = new URL(value);
  const allowedLocal = process.env.OAKTECH_RELEASE_ALLOW_INSECURE_LOCAL === '1'
    && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !allowedLocal) throw new Error('OakTech 发布地址必须使用 HTTPS');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('OakTech 发布地址不能包含凭据或查询参数');
  return parsed.toString().replace(/\/$/, '');
}

async function responseJson(response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `HTTP_${response.status}`);
  return result;
}

function sameArtifact(left, right) {
  return left.platform === right.platform
    && left.architecture === right.architecture
    && left.packageKind === right.packageKind
    && left.fileName === right.fileName
    && Number(left.sizeBytes) === Number(right.sizeBytes)
    && left.sha512.toLowerCase() === right.sha512.toLowerCase();
}

async function uploadArtifact({ baseUrl, token, releaseId, rootDirectory, artifact }) {
  const filePath = path.resolve(rootDirectory, artifact.relativePath);
  if (!filePath.startsWith(`${path.resolve(rootDirectory)}${path.sep}`)) throw new Error(`制品路径越界: ${artifact.relativePath}`);
  const details = fs.statSync(filePath);
  if (details.size !== artifact.sizeBytes || hashFile(filePath) !== artifact.sha512) {
    throw new Error(`推送前制品校验失败: ${artifact.fileName}`);
  }
  const uploadId = crypto.randomUUID();
  const handle = fs.openSync(filePath, 'r');
  try {
    for (let offset = 0; offset < details.size; offset += CHUNK_BYTES) {
      const length = Math.min(CHUNK_BYTES, details.size - offset);
      const chunk = Buffer.allocUnsafe(length);
      fs.readSync(handle, chunk, 0, length, offset);
      const query = new URLSearchParams({
        releaseId,
        platform: artifact.platform,
        architecture: artifact.architecture,
        packageKind: artifact.packageKind,
        uploadId,
        offset: String(offset),
        final: String(offset + length === details.size),
      });
      const response = await fetch(`${baseUrl}/api/admin/releases/upload?${query}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': artifact.contentType,
          'x-file-name': encodeURIComponent(artifact.fileName),
        },
        body: chunk,
      });
      const result = await responseJson(response);
      process.stdout.write(`\r${artifact.fileName}: ${Math.round(((offset + length) / details.size) * 100)}%`);
      if (offset + length === details.size
        && (Number(result.sizeBytes) !== artifact.sizeBytes || result.sha512 !== artifact.sha512)) {
        throw new Error(`服务端制品校验不一致: ${artifact.fileName}`);
      }
    }
  } finally {
    fs.closeSync(handle);
  }
  process.stdout.write('\n');
}

async function main() {
  const descriptorPath = path.resolve(argument('--descriptor', 'release-bundle/store-release.json'));
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
  const baseUrl = releaseBaseUrl(argument('--base-url', process.env.OAKTECH_RELEASE_BASE_URL || 'https://oaktechz.com'));
  const token = String(process.env.OAKTECH_RELEASE_WRITE_TOKEN || '').trim();
  if (token.length < 32) throw new Error('缺少有效的 OAKTECH_RELEASE_WRITE_TOKEN');

  const imported = await responseJson(await fetch(`${baseUrl}/api/admin/releases/import`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(descriptor),
  }));
  const existing = imported.artifacts || [];
  for (const artifact of descriptor.artifacts) {
    const slot = existing.find((item) => item.platform === artifact.platform
      && item.architecture === artifact.architecture && item.packageKind === artifact.packageKind);
    if (slot) {
      if (!sameArtifact(slot, artifact)) throw new Error(`商店已有不同制品占用槽位: ${artifact.platform}/${artifact.architecture}/${artifact.packageKind}`);
      console.log(`跳过已验证制品: ${artifact.fileName}`);
      continue;
    }
    if (imported.status === 'published') throw new Error(`发布版本缺少制品且已经锁定: ${artifact.fileName}`);
    await uploadArtifact({
      baseUrl,
      token,
      releaseId: imported.releaseId,
      rootDirectory: path.dirname(descriptorPath),
      artifact,
    });
  }
  console.log(`OakTech 草稿已就绪: ${descriptor.productSlug} ${descriptor.version}`);
  console.log(`${baseUrl}/admin/releases`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
