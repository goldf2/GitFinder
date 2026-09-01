const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,179}$/i;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function cleanText(value, maximum = 240, fallback = '') {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, maximum);
}

function normalizeIdentifier(value, label, { required = true, fallback = '' } = {}) {
  const identifier = cleanText(value || fallback, 180);
  if (!identifier && !required) return '';
  if (!ID_PATTERN.test(identifier)) throw new Error(`${label} 无效`);
  return identifier;
}

function normalizeBaseUrl(value, {
  label = 'Provider', allowedPaths = ['', '/'], trimTrailingSlash = false, rootDescription = '站点根地址'
} = {}) {
  const input = String(value || '').trim();
  if (!input || input.length > 2048 || /[\u0000-\u001f\u007f]/.test(input)) throw new Error(`${label} 地址无效`);
  let parsed;
  try { parsed = new URL(input); } catch (_) { throw new Error(`${label} 地址必须是完整 URL`); }
  const hostname = parsed.hostname.toLowerCase();
  const loopback = LOOPBACK_HOSTS.has(hostname) || hostname.startsWith('127.');
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error(`${label} 必须使用 HTTPS；仅本机 localhost 允许 HTTP`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} 地址不能包含凭据、查询参数或片段`);
  }
  const pathname = trimTrailingSlash ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
  if (!allowedPaths.includes(pathname)) throw new Error(`${label} 地址只填写${rootDescription}`);
  return parsed.origin;
}

function normalizeToken(value, invalidMessage = 'Provider 访问令牌无效') {
  const token = String(value || '').trim();
  if (token.length < 8 || token.length > 4096 || /[\u0000-\u0020\u007f]/.test(token)) throw new Error(invalidMessage);
  return token;
}

function normalizeExternalUrl(value, { providerLabel = 'Provider', optional = true } = {}) {
  const input = cleanText(value, 2048);
  if (!input && optional) return '';
  let parsed;
  try { parsed = new URL(input); } catch (_) { throw new Error(`${providerLabel} 返回了无效跳转地址`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(`${providerLabel} 返回了不安全的跳转地址`);
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let handle = null;
  try {
    handle = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = null;
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (handle !== null) try { fs.closeSync(handle); } catch (_) {}
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

module.exports = { cleanText, normalizeIdentifier, normalizeBaseUrl, normalizeToken, normalizeExternalUrl, writeJsonAtomic };
