const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns').promises;
const { isIP, BlockList } = require('node:net');

const CACHE_MS = 60_000;
const blockedIPv4 = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blockedIPv4.addSubnet(address, prefix);
const publicIPv6 = new BlockList();
publicIPv6.addSubnet('2000::', 3, 'ipv6');
const blockedIPv6 = new BlockList();
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) blockedIPv6.addSubnet(address, prefix, 'ipv6');

function isPublicAddress(address) {
  const family = isIP(address);
  return family === 4 ? !blockedIPv4.check(address)
    : family === 6 && publicIPv6.check(address, 'ipv6') && !blockedIPv6.check(address, 'ipv6');
}

function blocked(message) { return Object.assign(new Error(message), { code: 'PROBE_BLOCKED' }); }

function probeUrl(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw blocked('访问地址无效，未检测'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw blocked('仅检测不含凭据的 HTTP/HTTPS 地址');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || (isIP(host) && !isPublicAddress(host))) throw blocked('内网、回环或保留地址，未检测');
  url.hash = '';
  return url;
}

const MAX_TITLE_BODY_BYTES = 64 * 1024;

function decodeHtmlEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (match, token) => {
    if (token[0] !== '#') return named[token.toLowerCase()] || match;
    const codePoint = token[1].toLowerCase() === 'x'
      ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
    try { return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match; } catch (_) { return match; }
  });
}

function extractPageTitle(body, contentType = '') {
  if (!body?.length) return '';
  const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType)?.[1] || 'utf-8';
  let html;
  try { html = new TextDecoder(charset).decode(body); } catch (_) { html = body.toString('utf8'); }
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return match ? decodeHtmlEntities(match[1].replace(/<[^>]*>/g, ' '))
    .replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : '';
}

function readResponse(url, addresses, method, signal, requestImpl) {
  return new Promise((resolve, reject) => {
    const request = requestImpl || (url.protocol === 'https:' ? https.request : http.request);
    const req = request(url, {
      method, signal, agent: false, rejectUnauthorized: true, maxHeaderSize: 16384,
      headers: { 'User-Agent': 'GitFinder-Endpoint-Check', Accept: method === 'GET' ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' : '*/*', 'Cache-Control': 'no-cache' },
      // Pin the validated DNS result, including dual-stack connection attempts.
      lookup: (_host, options, callback) => options.all
        ? callback(null, addresses)
        : callback(null, addresses[0].address, addresses[0].family)
    }, res => {
      const contentType = String(res.headers['content-type'] || '');
      const html = /^(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)
        && !res.headers['content-encoding'];
      const result = { status: res.statusCode, location: res.headers.location, contentType, body: Buffer.alloc(0) };
      if (method !== 'GET' || !html) { res.destroy(); resolve(result); return; }
      const chunks = [];
      let bytes = 0, settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        res.destroy();
        resolve({ ...result, body: Buffer.concat(chunks, bytes) });
      };
      res.on('data', chunk => {
        if (settled) return;
        const buffer = Buffer.from(chunk);
        const remaining = MAX_TITLE_BODY_BYTES - bytes;
        if (remaining > 0) { const part = buffer.subarray(0, remaining); chunks.push(part); bytes += part.length; }
        if (bytes >= MAX_TITLE_BODY_BYTES || /<\/title\s*>/i.test(Buffer.concat(chunks, bytes).toString('utf8'))) finish();
      });
      res.on('end', finish);
      res.on('error', error => { if (!settled) { settled = true; reject(error); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function probeEndpoint(value, options = {}) {
  const controller = new AbortController();
  const started = performance.now();
  const timeout = setTimeout(() => controller.abort(Object.assign(new Error('timeout'), { code: 'PROBE_TIMEOUT' })), options.timeoutMs || 6000);
  const cancel = () => controller.abort(Object.assign(new Error('cancelled'), { code: 'PROBE_CANCELLED' }));
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  let abortListener;
  const aborted = new Promise((_, reject) => {
    abortListener = () => reject(controller.signal.reason);
    if (controller.signal.aborted) abortListener();
    else controller.signal.addEventListener('abort', abortListener, { once: true });
  });
  const result = (status, values = {}) => ({ status, httpStatus: null, latencyMs: null, checkedAt: new Date().toISOString(), message: '', pageTitle: '', ...values });
  try {
    return await Promise.race([aborted, (async () => {
      let url = probeUrl(value);
      let method = 'HEAD';
      let redirects = 0;
      while (true) {
        controller.signal.throwIfAborted();
        const host = url.hostname.replace(/^\[|\]$/g, '');
        const addresses = isIP(host) ? [{ address: host, family: isIP(host) }]
          : await (options.lookup || dns.lookup)(host, { all: true, verbatim: true });
        controller.signal.throwIfAborted();
        if (!addresses.length) throw Object.assign(new Error('dns'), { code: 'ENOTFOUND' });
        if (addresses.some(item => !isPublicAddress(item.address))) throw blocked('域名解析到内网或保留地址，未检测');
        let response = await readResponse(url, addresses, method, controller.signal, options.request);
        if (method === 'HEAD' && [405, 501].includes(response.status)) { method = 'GET'; continue; }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.location || ++redirects > 5) return result('redirect_error', { httpStatus: response.status, message: '重定向缺少地址或超过 5 次' });
          const next = probeUrl(new URL(response.location, url));
          if (url.protocol === 'https:' && next.protocol === 'http:') throw blocked('重定向降级为 HTTP，已停止检测');
          url = next;
          continue;
        }
        if (method === 'HEAD' && response.status >= 200 && response.status < 300
          && response.status !== 204 && /^(?:text\/html|application\/xhtml\+xml)\b/i.test(response.contentType)) {
          response = { ...response, ...(await readResponse(url, addresses, 'GET', controller.signal, options.request)) };
        }
        const status = response.status >= 200 && response.status < 400 ? 'reachable'
          : [401, 403].includes(response.status) ? 'restricted' : 'http_error';
        return result(status, { httpStatus: response.status, latencyMs: Math.round(performance.now() - started),
          pageTitle: extractPageTitle(response.body, response.contentType),
          message: status === 'restricted' ? '站点已响应，但需要认证或拒绝访问' : status === 'http_error' ? `HTTP ${response.status}` : '' });
      }
    })()]);
  } catch (error) {
    const code = controller.signal.aborted ? controller.signal.reason?.code : error?.code;
    if (code === 'PROBE_BLOCKED') return result('blocked', { message: error.message });
    if (code === 'PROBE_TIMEOUT') return result('timeout', { message: '检测超时（包含 DNS、连接及重定向）' });
    if (code === 'PROBE_CANCELLED') return result('unknown', { message: '检测已取消' });
    if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL'].includes(code)) return result('dns_error', { message: '域名解析失败' });
    if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code || '')) return result('tls_error', { message: 'HTTPS 证书或 TLS 校验失败' });
    return result('unreachable', { message: '无法连接访问点' });
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', abortListener);
    options.signal?.removeEventListener('abort', cancel);
  }
}

class EndpointHealthService {
  constructor(options = {}) {
    this.probe = options.probe || probeEndpoint;
    this.now = options.now || Date.now;
    this.concurrency = options.concurrency || 4;
    this.providers = new Map();
    this.entries = new Map();
    this.queue = [];
    this.active = 0;
  }

  setTargets(providerId, urls) {
    const targets = new Map();
    for (const url of new Set(urls)) {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) continue;
        parsed.hash = '';
        targets.set(url, parsed.href);
        if (!this.entries.has(parsed.href)) this.entries.set(parsed.href, { url: parsed.href, result: null, checking: false, completedAt: 0 });
      } catch (_) {}
    }
    this.providers.set(providerId, targets);
    this._prune();
  }

  retainProviders(ids) {
    for (const id of this.providers.keys()) if (!ids.includes(id)) this.providers.delete(id);
    this._prune();
  }

  _prune() {
    const used = new Set([...this.providers.values()].flatMap(targets => [...targets.values()]));
    for (const [url, entry] of this.entries) if (!used.has(url)) { entry.controller?.abort(); this.entries.delete(url); }
    this.queue = this.queue.filter(entry => used.has(entry.url));
  }

  start(values = {}) {
    let urls;
    if (values.url) {
      const url = this.providers.get(values.providerId)?.get(values.url);
      if (!url) throw new Error('访问点不存在，请先刷新 Coolify 数据');
      urls = [url];
    } else urls = [...this.entries.keys()];
    for (const url of urls) {
      const entry = this.entries.get(url);
      if (entry.checking || (entry.result && this.now() - entry.completedAt < (values.force === true ? 5000 : CACHE_MS))) continue;
      entry.checking = true;
      this.queue.push(entry);
    }
    this._drain();
    return this.snapshot();
  }

  _drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const entry = this.queue.shift();
      entry.controller = new AbortController();
      this.active++;
      Promise.resolve().then(() => this.probe(entry.url, { signal: entry.controller.signal }))
        .catch(() => ({ status: 'unreachable', httpStatus: null, latencyMs: null, checkedAt: new Date(this.now()).toISOString(), message: '检测失败', pageTitle: '' }))
        .then(result => { entry.result = result; entry.completedAt = this.now(); })
        .finally(() => { entry.checking = false; this.active--; this._drain(); });
    }
  }

  snapshot() {
    const checks = [...this.providers].flatMap(([providerId, targets]) => [...targets].map(([url, key]) => {
      const entry = this.entries.get(key);
      return { providerId, url, ...(entry.result || { status: 'unknown', httpStatus: null, latencyMs: null, checkedAt: null, message: '', pageTitle: '' }), checking: entry.checking };
    }));
    return { checks, pending: [...this.entries.values()].filter(entry => entry.checking).length };
  }
}

module.exports = { EndpointHealthService, probeEndpoint, isPublicAddress };
