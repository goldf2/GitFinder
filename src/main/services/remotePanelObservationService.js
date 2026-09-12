const SOURCE = 'https://panel.xiangshu.me/api/overview';
const { urlKey } = require('../../shared/nativePanelModel');

// Read the server's existing batch only. No remote credentials or force-scan calls.
class RemotePanelObservationService {
  constructor({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.cached = null;
    this.inflight = null;
  }

  async get() {
    if (this.cached && this.now() - this.cached.fetchedAt < 60000) return this.cached;
    if (this.inflight) return this.inflight;
    this.inflight = this.read().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async read() {
    try {
      const response = await this.fetch(SOURCE, { signal: AbortSignal.timeout(12000), redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 3 * 1024 * 1024) throw new Error('响应过大');
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(data.resources) || !Number.isFinite(Date.parse(data.checkedAt))) throw new Error('检测数据格式无效');
      const checks = data.resources.flatMap(resource => (Array.isArray(resource.webChecks) ? resource.webChecks : []).map(check => ({
        resourceUuid: String(resource.originalId || resource.id || '').slice(0, 200),
        nodeUrl: urlKey(resource.nodeUrl), url: urlKey(check.url),
        status: String(check.status || '').slice(0, 40), httpStatus: Number(check.statusCode) || null,
        latencyMs: Number.isFinite(check.latencyMs) ? check.latencyMs : null,
        checkedAt: data.checkedAt, stale: Boolean(data.cache?.stale || data.demo || (data.nodes || []).some(node => node.id === resource.nodeId && node.status !== 'online')),
        message: data.demo ? '网站为演示数据' : '远端批次结果（非逐项检测时间）'
      }))).filter(check => check.url && check.nodeUrl && check.resourceUuid);
      this.cached = { checks, checkedAt: data.checkedAt, fetchedAt: this.now(), source: SOURCE, error: '' };
      return this.cached;
    } catch (_) {
      return { ...(this.cached || { checks: [] }), source: SOURCE, error: '远端检测结果暂不可读取', checks: (this.cached?.checks || []).map(check => ({ ...check, stale: true })) };
    }
  }
}
module.exports = { RemotePanelObservationService, SOURCE };
