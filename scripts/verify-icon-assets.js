#!/usr/bin/env node

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

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

function verifyTransparentBackground(buffer) {
  const { width, height } = pngInfo(buffer);
  assert.equal(buffer[28], 0, 'Icon PNG must not be interlaced');
  const chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    if (buffer.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const bytes = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  assert.equal(bytes.length, height * (stride + 1));
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = bytes[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= 4 ? pixels[i - 4] : 0;
      const above = y ? pixels[i - stride] : 0;
      const upperLeft = y && x >= 4 ? pixels[i - stride - 4] : 0;
      const p = left + above - upperLeft;
      const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - upperLeft);
      const paeth = a <= b && a <= c ? left : b <= c ? above : upperLeft;
      const prediction = [0, left, above, Math.floor((left + above) / 2), paeth][filter];
      pixels[i] = (bytes[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  const alpha = (x, y) => pixels[(Math.floor(y * height) * width + Math.floor(x * width)) * 4 + 3];
  for (const [x, y] of [[0, 0], [.5, .1], [.5, .23], [.5, .9]]) {
    assert.equal(alpha(x, y), 0, 'Background and top-ring opening must be transparent, not a checkerboard or plaque');
  }
  assert.equal(alpha(.25, .5), 255, 'Folder foreground must stay opaque');
}

const appPng = read('public/icon.png');
const masterPng = read('public/icon-master.png');
const icns = read('public/icon.icns');
const ico = read('public/icon.ico');
const appPngInfo = pngInfo(appPng);
const masterPngInfo = pngInfo(masterPng);

assert.deepEqual(appPngInfo, { width: 1024, height: 1024, bitDepth: 8, colorType: 6 });
assert.deepEqual(masterPngInfo, { width: 1254, height: 1254, bitDepth: 8, colorType: 6 });
verifyTransparentBackground(appPng);
verifyTransparentBackground(masterPng);
assert.equal(icns.subarray(0, 4).toString('ascii'), 'icns');
assert.equal(icns.readUInt32BE(4), icns.length);
assert.equal(ico.readUInt16LE(0), 0);
assert.equal(ico.readUInt16LE(2), 1);
assert.ok(ico.readUInt16LE(4) >= 1);
assert.equal(ico[6] || 256, 256);
assert.equal(ico[7] || 256, 256);

for (const relativePath of ['public/icon.png', 'public/icon.icns', 'public/icon.ico', 'public/icon-master.png']) {
  const buffer = read(relativePath);
  process.stdout.write(`${relativePath} ${buffer.length} bytes sha256=${crypto.createHash('sha256').update(buffer).digest('hex')}\n`);
}
