const http = require('node:http');
const { createCasdoorClient } = require('./casdoorClient');

const REDIRECT_URI = 'http://127.0.0.1:43821/oauth/callback';
const DEFAULT_CONFIGURATION = { issuer: 'https://auth.oaktechz.com', clientId: '' };

function normalizeConfiguration(input) {
  const issuer = new URL(String(input?.issuer || '').trim());
  const clientId = String(input?.clientId || '').trim();
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash
    || issuer.href.length > 2048 || clientId.length > 256 || /\s/.test(clientId)) {
    throw new Error('请填写 HTTPS 认证地址及有效的 Client ID，不要填写 Client Secret。');
  }
  return { issuer: issuer.href.replace(/\/$/, ''), clientId };
}

function createAccountService({ store, openExternal, onChanged = () => {}, onSignedIn = () => {},
  createClient = createCasdoorClient, redirectUri = REDIRECT_URI, loginTimeoutMs = 180000 }) {
  let configuration = DEFAULT_CONFIGURATION;
  let session = null;
  let persistent = false;
  let pending = null;
  let error = '';
  const callback = new URL(redirectUri);

  function status() {
    return {
      configured: Boolean(configuration.clientId),
      configuration: { ...configuration, redirectUri },
      phase: pending ? 'signing-in' : session
        ? (session.expiresAt > Date.now() ? 'signed-in' : 'session-expired') : error ? 'error' : 'signed-out',
      user: session ? { ...session.user } : null,
      expiresAt: session?.expiresAt || 0, persistent, error,
    };
  }
  function publish() { const next = status(); onChanged(next); return next; }
  function stopAttempt() {
    if (!pending) return;
    const attempt = pending;
    pending = null;
    clearTimeout(attempt.timer);
    attempt.controller.abort();
    attempt.server?.close();
    attempt.server?.closeAllConnections();
  }
  function fail(attempt, message) {
    if (pending !== attempt) return status();
    stopAttempt();
    error = message;
    return publish();
  }
  function begin() {
    error = '';
    const attempt = { controller: new AbortController(), server: null, consumed: false };
    pending = attempt;
    attempt.timer = setTimeout(() => fail(attempt, '登录等待已超时，请重试。'), loginTimeoutMs);
    attempt.timer.unref?.();
    publish();
    return attempt;
  }
  function saveSession(next) {
    // Persist before advertising a successful session, so a failed write cannot restore an older account.
    persistent = store.write(configuration, next);
    session = next;
    error = persistent ? '' : '系统安全存储不可用，本次登录仅在退出应用前有效。';
  }
  function respond(response, code, text) {
    response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Connection': 'close' });
    response.end(text);
  }

  async function handleCallback(request, response, attempt, client, authorization) {
    // Ignore unrelated requests and forged callbacks without consuming a legitimate login.
    const url = new URL(request.url, redirectUri);
    if (request.method !== 'GET' || request.headers.host !== callback.host
      || url.origin !== callback.origin || url.pathname !== callback.pathname) {
      respond(response, 404, 'Not found'); return;
    }
    if (pending !== attempt || attempt.consumed || url.searchParams.getAll('state').length !== 1
      || url.searchParams.get('state') !== authorization.state) {
      respond(response, 400, '登录回调无效，请返回 GitFinder 重试。'); return;
    }
    attempt.consumed = true;
    try {
      const next = await client.exchange(url, authorization);
      if (pending !== attempt) { respond(response, 400, '本次登录已取消。'); return; }
      saveSession(next);
      respond(response, 200, 'GitFinder 登录成功，可以关闭此页面并返回应用。');
      stopAttempt();
      publish();
      onSignedIn();
    } catch (_) {
      respond(response, 400, '登录未完成，请返回 GitFinder 查看并重试。');
      fail(attempt, url.searchParams.has('error') ? '登录已取消或未获授权。' : '登录验证失败，请检查 Casdoor 应用配置后重试。');
    }
  }

  return {
    status,
    restore() {
      try {
        const saved = store.read();
        if (saved.configuration) configuration = normalizeConfiguration(saved.configuration);
        const candidate = saved.session;
        if (configuration.clientId && typeof candidate?.user?.id === 'string'
          && typeof candidate.accessToken === 'string' && Number.isFinite(candidate.expiresAt)) {
          session = candidate;
          persistent = true;
        }
      } catch (_) { error = '无法读取已保存的账户，请重新配置或登录；本地功能不受影响。'; }
      return status(); // Deliberately no network on startup, even for expired sessions.
    },
    configure(input) {
      const next = normalizeConfiguration(input);
      stopAttempt();
      store.write(next, null);
      configuration = next;
      session = null;
      persistent = false;
      error = '';
      return publish();
    },
    async signIn() {
      if (pending) return status();
      if (!configuration.clientId) { error = '请先配置 GitFinder 的 Casdoor Client ID。'; return publish(); }
      const attempt = begin();
      try {
        const client = await createClient({ ...configuration, redirectUri }, attempt.controller.signal);
        const authorization = await client.authorization();
        if (pending !== attempt) return status();
        attempt.server = http.createServer((req, res) => {
          handleCallback(req, res, attempt, client, authorization).catch(() => {
            if (!res.writableEnded) respond(res, 400, '无效请求');
          });
        });
        await new Promise((resolve, reject) => {
          attempt.server.once('error', reject);
          attempt.server.listen(Number(callback.port), '127.0.0.1', resolve);
        });
        if (pending !== attempt) { attempt.server.close(); return status(); }
        await openExternal(authorization.url);
        return status();
      } catch (cause) {
        return fail(attempt, cause?.code === 'EADDRINUSE'
          ? '本机登录回调端口被占用，请关闭其它登录窗口后重试。'
          : '无法连接认证服务或打开浏览器，请检查网络和 Casdoor 配置后重试。');
      }
    },
    cancel() { stopAttempt(); error = ''; return publish(); },
    signOut() {
      stopAttempt();
      store.write(configuration, null);
      session = null;
      persistent = false;
      error = '';
      return publish();
    },
    async refresh() {
      if (pending) return status();
      if (!session?.refreshToken) { error = '请重新登录以更新会话。'; return publish(); }
      const attempt = begin();
      try {
        const client = await createClient({ ...configuration, redirectUri }, attempt.controller.signal);
        const next = await client.refresh(session);
        if (pending !== attempt) return status();
        saveSession(next);
        stopAttempt();
        return publish();
      } catch (_) { return fail(attempt, '无法刷新会话，请检查网络或重新登录；本地功能仍可使用。'); }
    },
    dispose: stopAttempt,
  };
}

module.exports = { createAccountService, normalizeConfiguration, REDIRECT_URI };
