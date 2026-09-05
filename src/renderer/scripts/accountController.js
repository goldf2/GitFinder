(function exposeAccountController(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AccountController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createAccountController() {
  const CALLBACK_URL = 'http://127.0.0.1:43821/oauth/callback';
  const PHASES = new Set(['signed-out', 'signing-in', 'signed-in', 'session-expired', 'error']);
  const ACTION_METHODS = Object.freeze({
    'sign-in': 'signIn',
    cancel: 'cancel',
    refresh: 'refresh',
    'sign-out': 'signOut',
  });
  const SUCCESS_MESSAGES = Object.freeze({
    'sign-in': '已在系统浏览器打开登录 / 注册',
    cancel: '已取消本次登录',
    refresh: '账户会话已刷新',
    'sign-out': '已退出本机登录；其他网站的会话未受影响',
  });

  function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeIssuer(value) {
    try {
      const url = new URL(cleanText(value));
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password
        || url.search || url.hash || url.href.length > 2048) return '';
      const normalized = url.toString();
      return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    } catch (_) {
      return '';
    }
  }

  function normalizeState(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const rawConfiguration = source.configuration && typeof source.configuration === 'object'
      ? source.configuration
      : {};
    const rawUser = source.user && typeof source.user === 'object' ? source.user : null;
    const expiresAt = Number(source.expiresAt);
    return {
      configured: source.configured === true,
      configuration: {
        issuer: cleanText(rawConfiguration.issuer),
        clientId: cleanText(rawConfiguration.clientId),
        redirectUri: cleanText(rawConfiguration.redirectUri) || CALLBACK_URL,
      },
      phase: PHASES.has(source.phase) ? source.phase : 'signed-out',
      user: rawUser ? {
        id: cleanText(rawUser.id),
        name: cleanText(rawUser.name),
        email: cleanText(rawUser.email),
      } : null,
      persistent: source.persistent === true,
      expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : 0,
      error: cleanText(source.error),
    };
  }

  function presentationForState(value = {}, options = {}) {
    const state = normalizeState(value);
    if (options.available === false) {
      return { summary: '账户登录不可用', detail: '此运行环境未提供登录；本地功能不受影响。' };
    }
    if (state.phase === 'signing-in') {
      if (options.action === 'refresh') {
        return { summary: '正在刷新会话', detail: '正在更新本机会话；需要时可取消。' };
      }
      return { summary: '等待浏览器登录', detail: '请在系统浏览器完成登录；需要时可取消本次登录。' };
    }
    if (state.phase === 'signed-in') {
      const summary = state.user?.name || state.user?.email || '已登录';
      const details = [];
      if (state.user?.email && state.user.email !== summary) details.push(state.user.email);
      details.push(state.error || (state.persistent ? '登录会话保存在此设备' : '当前应用会话有效'));
      return { summary, detail: details.join(' · ') };
    }
    if (state.phase === 'session-expired') {
      return { summary: '会话已过期', detail: state.error || '可以重新登录、刷新会话或退出本机登录；本地功能不受影响。' };
    }
    if (state.phase === 'error') {
      return { summary: '账户操作失败', detail: state.error || '请稍后重试；本地功能不受影响。' };
    }
    if (!state.configured) {
      return { summary: '尚未配置登录服务', detail: '在高级设置中配置后即可登录；本地功能始终可用。' };
    }
    return { summary: '未登录', detail: '登录是可选操作；继续离线使用不受影响。' };
  }

  class Controller {
    constructor({ bridge, document, onStatusMessage } = {}) {
      this.auth = bridge?.auth || null;
      this.document = document || null;
      this.onStatusMessage = onStatusMessage || (() => {});
      this.state = normalizeState();
      this.bound = false;
      this.unsubscribe = null;
      this.pendingAction = '';
      this.operationSequence = 0;
      this.configurationDirty = false;
      this.configurationInput = null;
      this.configurationFeedback = { message: '', tone: '' };
    }

    isAvailable() {
      return Boolean(this.auth && typeof this.auth.getStatus === 'function');
    }

    async setup() {
      if (this.bound) return this.state;
      this.bound = true;
      this.bindEvents();
      if (!this.isAvailable()) {
        this.render();
        return this.state;
      }

      if (typeof this.auth.onChanged === 'function') {
        try {
          const unsubscribe = this.auth.onChanged(state => this.acceptState(state));
          if (typeof unsubscribe === 'function') this.unsubscribe = unsubscribe;
        } catch (_) {
          // getStatus remains usable when a web mock does not implement subscriptions correctly.
        }
      }
      await this.refreshStatus();
      return this.state;
    }

    dispose() {
      this.unsubscribe?.();
      this.unsubscribe = null;
    }

    bindEvents() {
      this.document?.addEventListener?.('click', event => {
        const button = event.target?.closest?.('[data-account-action]');
        if (!button) return;
        event.preventDefault();
        void this.performAction(button.dataset.accountAction);
      });
      this.document?.addEventListener?.('input', event => {
        const input = event.target?.closest?.('[data-account-config]');
        if (!input) return;
        this.configurationDirty = true;
        this.setConfigurationFeedback('填写后应用配置，登录服务会立即切换。');
      });
    }

    settingsMarkup() {
      return `<section class="app-settings-section" id="settings-account" role="tabpanel" aria-labelledby="settings-navigation-account">
        <div class="app-settings-section-heading">
          <h2 id="settings-account-title">账户</h2>
          <p>登录是可选功能，将在系统浏览器完成；未登录时，本地文件、项目和白板仍可正常使用。</p>
        </div>
        <div class="app-settings-controls">
          <div class="app-settings-row">
            <span><strong id="settings-account-summary">正在读取账户状态…</strong><small id="settings-account-detail" aria-live="polite">本地功能不依赖登录。</small></span>
            <div class="developer-tool-picker">
              <button class="btn btn-primary" data-account-action="sign-in" type="button">登录 / 注册…</button>
              <button class="btn" data-account-action="cancel" type="button" hidden>取消登录</button>
              <button class="btn" data-account-action="refresh" type="button" hidden>刷新会话</button>
              <button class="btn" data-account-action="sign-out" type="button" hidden>退出本机登录</button>
            </div>
          </div>
        </div>
        <details class="semantic-lifecycle-details">
          <summary>高级：登录服务配置</summary>
          <p>仅填写 HTTPS 服务地址和公开 Client ID。不要在此填写客户端密钥。</p>
          <div class="app-settings-controls">
            <div class="app-settings-row app-settings-picker-row">
              <label for="settings-account-issuer"><strong>服务地址</strong><small>Casdoor Issuer，必须使用 HTTPS</small></label>
              <div class="developer-tool-picker">
                <input id="settings-account-issuer" data-account-config="issuer" type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://login.example.com">
              </div>
            </div>
            <div class="app-settings-row app-settings-picker-row">
              <label for="settings-account-client-id"><strong>公开 Client ID</strong><small>桌面应用使用的公开标识，不是客户端密钥</small></label>
              <div class="developer-tool-picker">
                <input id="settings-account-client-id" data-account-config="client-id" type="text" autocomplete="off" spellcheck="false" placeholder="gitfinder-desktop">
              </div>
            </div>
            <div class="app-settings-row app-settings-picker-row">
              <label for="settings-account-callback"><strong>本机回调地址</strong><small>在 Casdoor 应用中登记为 Redirect URI</small></label>
              <div class="developer-tool-picker">
                <input id="settings-account-callback" type="url" value="${CALLBACK_URL}" readonly aria-readonly="true">
              </div>
            </div>
            <div class="app-settings-row">
              <span><strong>应用服务配置</strong><small id="settings-account-config-feedback" role="status" aria-live="polite">保存后立即生效；更换服务会清除此应用中的旧登录会话。</small></span>
              <button class="btn" data-account-action="configure" type="button">应用配置</button>
            </div>
          </div>
          <p>“退出本机登录”只清除此应用的本机会话，不会退出其他网站。</p>
        </details>
      </section>`;
    }

    acceptState(value) {
      const source = value && typeof value === 'object' ? value : {};
      const configuration = source.configuration && typeof source.configuration === 'object'
        ? { ...this.state.configuration, ...source.configuration }
        : this.state.configuration;
      const phase = source.error && !source.phase ? 'error' : source.phase;
      this.state = normalizeState({
        ...this.state,
        ...source,
        ...(phase ? { phase } : {}),
        configuration,
      });
      this.render();
      return this.state;
    }

    recordError(error) {
      const message = cleanText(error?.message || error) || '账户操作失败';
      this.acceptState({ phase: 'error', error: message });
      this.onStatusMessage(`账户操作失败：${message}`, 'error');
      return false;
    }

    async refreshStatus() {
      if (!this.isAvailable()) {
        this.render();
        return false;
      }
      try {
        const state = await this.auth.getStatus();
        this.acceptState(state);
        return this.state;
      } catch (error) {
        return this.recordError(error);
      }
    }

    canCancel() {
      return ['sign-in', 'refresh'].includes(this.pendingAction) || this.state.phase === 'signing-in';
    }

    async performAction(action) {
      if (action === 'configure') return this.configure();
      const method = ACTION_METHODS[action];
      if (!method || !this.isAvailable() || typeof this.auth[method] !== 'function') return false;
      if (action === 'sign-in' && !this.state.configured) return false;
      const canInterrupt = action === 'cancel' && this.canCancel();
      if (this.pendingAction && !canInterrupt) return false;

      const operation = ++this.operationSequence;
      this.pendingAction = action;
      if (action === 'sign-in') this.acceptState({ phase: 'signing-in', error: '' });
      this.render();
      try {
        const result = await this.auth[method]();
        if (operation !== this.operationSequence) return false;
        this.acceptState(result);
        const failed = this.state.phase === 'error'
          || (action === 'refresh' && this.state.phase !== 'signed-in' && Boolean(this.state.error));
        if (failed) {
          this.onStatusMessage(`账户操作失败：${this.state.error}`, 'error');
          return false;
        }
        if (this.state.error) this.onStatusMessage(this.state.error, 'info');
        else if (SUCCESS_MESSAGES[action]) this.onStatusMessage(SUCCESS_MESSAGES[action], 'success');
        return result || this.state;
      } catch (error) {
        if (operation !== this.operationSequence) return false;
        return this.recordError(error);
      } finally {
        if (operation === this.operationSequence) this.pendingAction = '';
        this.render();
      }
    }

    setConfigurationFeedback(message, tone = '') {
      this.configurationFeedback = { message, tone };
      this.renderConfiguration();
    }

    async configure() {
      if (!this.isAvailable() || typeof this.auth.configure !== 'function' || this.pendingAction) return false;
      const raw = {
        issuer: cleanText(this.document?.getElementById?.('settings-account-issuer')?.value),
        clientId: cleanText(this.document?.getElementById?.('settings-account-client-id')?.value),
      };
      this.configurationDirty = true;
      const issuer = normalizeIssuer(raw.issuer);
      if (!issuer) {
        this.setConfigurationFeedback('服务地址必须是有效的 HTTPS URL。', 'error');
        this.document?.getElementById?.('settings-account-issuer')?.focus?.();
        return false;
      }
      if (!raw.clientId || raw.clientId.length > 256 || /\s/.test(raw.clientId)) {
        this.setConfigurationFeedback('请填写不含空格的公开 Client ID。', 'error');
        this.document?.getElementById?.('settings-account-client-id')?.focus?.();
        return false;
      }

      const operation = ++this.operationSequence;
      this.pendingAction = 'configure';
      this.setConfigurationFeedback('正在应用登录服务配置…');
      this.render();
      try {
        const result = await this.auth.configure({ issuer, clientId: raw.clientId });
        if (operation !== this.operationSequence) return false;
        this.configurationDirty = false;
        this.acceptState(result);
        if (this.state.error) {
          this.setConfigurationFeedback(this.state.error, 'error');
          this.onStatusMessage(`保存登录服务配置失败：${this.state.error}`, 'error');
          return false;
        }
        this.setConfigurationFeedback('配置已生效；旧本机会话已清除。', 'success');
        this.onStatusMessage('登录服务配置已生效；旧本机会话已清除', 'success');
        return result || this.state;
      } catch (error) {
        if (operation !== this.operationSequence) return false;
        const message = cleanText(error?.message || error) || '保存配置失败';
        this.setConfigurationFeedback(message, 'error');
        return this.recordError(error);
      } finally {
        if (operation === this.operationSequence) this.pendingAction = '';
        this.render();
      }
    }

    renderConfiguration() {
      const issuer = this.document?.getElementById?.('settings-account-issuer');
      const clientId = this.document?.getElementById?.('settings-account-client-id');
      const callback = this.document?.getElementById?.('settings-account-callback');
      if (issuer && issuer !== this.configurationInput) {
        this.configurationInput = issuer;
        this.configurationDirty = false;
      }
      if (!this.configurationDirty) {
        if (issuer) issuer.value = this.state.configuration.issuer;
        if (clientId) clientId.value = this.state.configuration.clientId;
      }
      if (callback) callback.value = CALLBACK_URL;

      const configurationDisabled = !this.isAvailable() || this.pendingAction === 'configure';
      if (issuer) issuer.disabled = configurationDisabled;
      if (clientId) clientId.disabled = configurationDisabled;
      const feedback = this.document?.getElementById?.('settings-account-config-feedback');
      if (feedback) {
        feedback.textContent = this.configurationFeedback.message
          || '保存后立即生效；更换服务会清除此应用中的旧登录会话。';
        feedback.dataset.accountTone = this.configurationFeedback.tone;
      }
    }

    render() {
      const available = this.isAvailable();
      const presentation = presentationForState(this.state, { available, action: this.pendingAction });
      const summary = this.document?.getElementById?.('settings-account-summary');
      const detail = this.document?.getElementById?.('settings-account-detail');
      const section = this.document?.getElementById?.('settings-account');
      if (summary) summary.textContent = presentation.summary;
      if (detail) detail.textContent = presentation.detail;
      if (section) section.setAttribute('aria-busy', String(Boolean(this.pendingAction)));

      const hasSession = Boolean(this.state.user);
      const signedOut = this.state.phase === 'signed-out'
        || this.state.phase === 'session-expired'
        || (this.state.phase === 'error' && !hasSession);
      const signingIn = this.canCancel();
      const sessionAvailable = this.state.phase === 'signed-in'
        || this.state.phase === 'session-expired'
        || (this.state.phase === 'error' && hasSession);
      this.document?.querySelectorAll?.('[data-account-action]').forEach(button => {
        const action = button.dataset.accountAction;
        const visible = {
          'sign-in': signedOut,
          cancel: signingIn,
          refresh: sessionAvailable,
          'sign-out': sessionAvailable,
        };
        const method = ACTION_METHODS[action] || action;
        const canInterrupt = action === 'cancel' && this.canCancel();
        if (action !== 'configure') button.hidden = !visible[action];
        button.disabled = !available || typeof this.auth?.[method] !== 'function'
          || (action === 'sign-in' && !this.state.configured)
          || (Boolean(this.pendingAction) && !canInterrupt);
      });
      this.renderConfiguration();
    }
  }

  return Object.freeze({
    CALLBACK_URL,
    Controller,
    normalizeIssuer,
    normalizeState,
    presentationForState,
  });
});
