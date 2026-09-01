#!/usr/bin/env node

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath));
}

function pngInfo(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25]
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const ORIGINAL_ICON_SHA256 = Object.freeze({
  'public/icon-master.png': '15a4d34983e7bf21f90d11c8e541cc0e9dbead0dd9557a0cabff733457f431c3',
  'public/icon.png': '47516c354e26327fe206db5c14d06dac8f9469adef65fe131381f748fc46faa1',
  'public/icon.icns': '387b7a838292943ac7cec9f6e03eb12635cf9c293c2f975298595f2f5d02ae77',
  'public/icon.ico': 'cee5e7b9f5007f54874ffef68cf8f19c88bfc21466b806fed3cbe96fbe969dca'
});

const appPng = read('public/icon.png');
const masterPng = read('public/icon-master.png');
const icns = read('public/icon.icns');
const ico = read('public/icon.ico');
const appPngInfo = pngInfo(appPng);
const masterPngInfo = pngInfo(masterPng);

assert.deepEqual(appPngInfo, { width: 1024, height: 1024, bitDepth: 8, colorType: 6 });
assert.deepEqual(masterPngInfo, { width: 1254, height: 1254, bitDepth: 8, colorType: 6 });
assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns');
assert.equal(icns.readUInt32BE(4), icns.length);
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
assert.ok(ico.readUInt16LE(4) >= 1);
assert.equal(ico[6] || 256, 256);
assert.equal(ico[7] || 256, 256);

for (const relativePath of ['public/icon.png', 'public/icon.icns', 'public/icon.ico', 'public/icon-master.png']) {
  const buffer = read(relativePath);
  const digest = sha256(buffer);
  assert.equal(digest, ORIGINAL_ICON_SHA256[relativePath], `${relativePath} must match the original GitFinder logo`);
  process.stdout.write(`${relativePath} ${buffer.length} bytes sha256=${digest}\n`);
}
