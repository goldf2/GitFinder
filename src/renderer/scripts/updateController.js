(function exposeUpdateController(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.UpdateController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createUpdateController() {
  const REASON_COPY = Object.freeze({
    development: ['开发模式', '开发模式不会请求在线更新'],
    disabled: ['已关闭更新', '在线更新已被关闭'],
    'invalid-configuration': ['更新配置无效', '在线更新配置无效'],
    unavailable: ['更新不可用', '当前环境不支持在线更新'],
  });

  function presentationForState(state = {}) {
    if (!state.enabled) {
      const [label, title] = REASON_COPY[state.reason] || REASON_COPY.unavailable;
      return { label, title, disabled: true, tone: 'disabled' };
    }
    if (state.phase === 'checking') {
      return { label: '正在检查…', title: '正在检查软件更新', disabled: true, tone: 'checking' };
    }
    if (state.phase === 'available') {
      const version = state.availableVersion ? ` ${state.availableVersion}` : '';
      return { label: `下载${version}`, title: '下载可用更新', disabled: false, tone: 'has-update' };
    }
    if (state.phase === 'downloading') {
      const progress = Math.max(0, Math.min(100, Math.round(Number(state.progress) || 0)));
      return { label: `下载中 ${progress}%`, title: '正在下载更新', disabled: true, tone: 'checking' };
    }
    if (state.phase === 'downloaded') {
      return { label: '重启并安装', title: '更新已下载，重启应用完成安装', disabled: false, tone: 'ready-install' };
    }
    if (state.phase === 'up-to-date') {
      return { label: '已是最新', title: '当前已是最新版本', disabled: false, tone: 'success' };
    }
    if (state.phase === 'error') {
      return { label: '重新检查', title: state.error || '检查更新失败', disabled: false, tone: 'error' };
    }
    return { label: '检查更新', title: '手动检查软件更新', disabled: false, tone: '' };
  }

  class Controller {
    constructor({ bridge, document, onStatusMessage }) {
      this.bridge = bridge;
      this.document = document;
      this.onStatusMessage = onStatusMessage || (() => {});
      this.state = {
        enabled: false,
        reason: 'unavailable',
        currentVersion: '',
        feedHost: '',
        automaticChecks: true,
        phase: 'idle',
        availableVersion: '',
        progress: 0,
        error: '',
      };
      this.bound = false;
      this.resetTimer = null;
    }

    async setup() {
      if (this.bound) return;
      this.bound = true;
      this.document.addEventListener('click', event => {
        const button = event.target.closest?.('[data-update-action="primary"]');
        if (!button) return;
        event.preventDefault();
        this.performPrimaryAction();
      });
      this.document.addEventListener('change', event => {
        const toggle = event.target.closest?.('[data-update-auto-check]');
        if (!toggle) return;
        this.setAutomaticChecks(toggle.checked === true);
      });
      this.document.getElementById('app-version')?.addEventListener('click', () => this.check());

      this.bridge.updater.onAvailable(info => {
        this.setState({ phase: 'available', availableVersion: info?.version || '', error: '' });
        this.onStatusMessage('发现新版本，可在“软件更新”中下载安装', 'info');
      });
      this.bridge.updater.onUpToDate(() => {
        this.setState({ phase: 'up-to-date', availableVersion: '', error: '' });
        this.scheduleIdleReset();
      });
      this.bridge.updater.onDownloading(() => this.setState({ phase: 'downloading', progress: 0, error: '' }));
      this.bridge.updater.onProgress(data => this.setState({ phase: 'downloading', progress: data?.percent || 0 }));
      this.bridge.updater.onDownloaded(() => this.setState({ phase: 'downloaded', progress: 100 }));
      this.bridge.updater.onError(message => {
        const error = String(message || '检查更新失败');
        this.setState({ phase: 'error', error });
        this.onStatusMessage(`更新失败：${error}`, 'error');
      });
      this.bridge.updater.onPolicyChanged?.(status => {
        this.setState({ automaticChecks: status?.automaticChecks !== false });
      });

      try {
        const [version, status] = await Promise.all([
          this.bridge.app.getVersion(),
          this.bridge.updater.getStatus(),
        ]);
        this.setState({
          currentVersion: version || '',
          enabled: status?.enabled === true,
          reason: status?.reason || null,
          feedHost: status?.feedHost || '',
          automaticChecks: status?.automaticChecks !== false,
        });
      } catch (error) {
        this.setState({ enabled: false, reason: 'unavailable', error: error?.message || String(error) });
      }
    }

    settingsMarkup() {
      return `<section class="app-settings-section" id="settings-updates" role="tabpanel" aria-labelledby="settings-navigation-updates">
        <div class="app-settings-section-heading">
          <h2 id="settings-updates-title">软件更新</h2>
          <p>你可以手动检查；开启自动检查后，启动时发现新版本只会提醒，不会自动下载安装。</p>
        </div>
        <div class="app-settings-controls">
          <div class="app-settings-row software-update-row">
            <span><strong id="settings-update-summary">正在读取更新状态…</strong><small id="settings-update-detail">当前版本与更新源</small></span>
            <button class="btn btn-primary" data-update-action="primary" type="button">检查更新</button>
          </div>
          <label class="app-settings-row" for="settings-update-auto-check">
            <span><strong>启动时自动检查</strong><small>关闭后不进行启动联网检查；手动检查仍可使用，下载前会再次征求确认</small></span>
            <input class="app-settings-toggle" id="settings-update-auto-check" data-update-auto-check type="checkbox">
          </label>
        </div>
      </section>`;
    }

    setState(patch) {
      Object.assign(this.state, patch);
      this.render();
    }

    scheduleIdleReset() {
      clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => this.setState({ phase: 'idle' }), 3000);
    }

    async performPrimaryAction() {
      if (!this.state.enabled) return;
      if (this.state.phase === 'downloaded') return this.bridge.updater.install();
      if (this.state.phase === 'available') {
        try {
          const confirmed = await this.bridge.updater.download();
          if (confirmed && this.state.phase === 'available') {
            this.setState({ phase: 'downloading', progress: 0 });
          }
          return confirmed;
        } catch (error) {
          this.setState({ phase: 'error', error: error?.message || String(error) });
          return false;
        }
      }
      return this.check();
    }

    async setAutomaticChecks(enabled) {
      const toggle = this.document.getElementById('settings-update-auto-check');
      if (toggle) toggle.disabled = true;
      try {
        const status = await this.bridge.updater.setAutomaticChecks(enabled);
        this.setState({ automaticChecks: status?.automaticChecks !== false });
        this.onStatusMessage(enabled ? '已开启启动时自动检查更新' : '已关闭启动时自动检查更新', 'success');
        return status;
      } catch (error) {
        const message = error?.message || String(error);
        this.setState({ automaticChecks: !enabled, error: message });
        this.onStatusMessage(`保存更新设置失败：${message}`, 'error');
        return false;
      } finally {
        if (toggle) toggle.disabled = !this.state.enabled;
      }
    }

    async check() {
      if (!this.state.enabled || this.state.phase === 'checking' || this.state.phase === 'downloading') return false;
      this.setState({ phase: 'checking', error: '' });
      try {
        const result = await this.bridge.updater.check();
        if (result?.available) {
          this.setState({ phase: 'available', availableVersion: result.version || '', error: '' });
        } else if (result?.reason) {
          this.setState({ enabled: false, reason: result.reason, phase: 'idle' });
        } else if (result?.error) {
          this.setState({ phase: 'error', error: result.error });
          this.onStatusMessage(`检查更新失败：${result.error}`, 'error');
        } else {
          this.setState({ phase: 'up-to-date', availableVersion: '', error: '' });
          this.scheduleIdleReset();
        }
        return result;
      } catch (error) {
        const message = error?.message || String(error);
        this.setState({ phase: 'error', error: message });
        this.onStatusMessage(`检查更新失败：${message}`, 'error');
        return false;
      }
    }

    render() {
      const presentation = presentationForState(this.state);
      const version = this.state.currentVersion || '-';
      const versionElement = this.document.getElementById('app-version');
      if (versionElement) versionElement.textContent = `v${version}`;

      this.document.querySelectorAll('[data-update-action="primary"]').forEach(button => {
        button.textContent = presentation.label;
        button.title = presentation.title;
        button.disabled = presentation.disabled;
        button.dataset.updateTone = presentation.tone;
        button.classList.remove('checking', 'has-update', 'ready-install');
        if (presentation.tone === 'checking') button.classList.add('checking');
        if (presentation.tone === 'has-update') button.classList.add('has-update');
        if (presentation.tone === 'ready-install') button.classList.add('ready-install');
      });

      const summary = this.document.getElementById('settings-update-summary');
      const detail = this.document.getElementById('settings-update-detail');
      const automaticChecks = this.document.getElementById('settings-update-auto-check');
      if (summary) {
        if (!this.state.enabled) summary.textContent = presentation.label;
        else if (this.state.phase === 'available') summary.textContent = `发现新版本 ${this.state.availableVersion}`;
        else if (this.state.phase === 'downloaded') summary.textContent = '更新已准备完成';
        else if (this.state.phase === 'error') summary.textContent = '检查更新失败';
        else summary.textContent = `当前版本 ${version}`;
      }
      if (detail) {
        detail.textContent = this.state.error
          ? this.state.error
          : `更新源：${this.state.feedHost || '官方发布源'}`;
      }
      if (automaticChecks) {
        automaticChecks.checked = this.state.automaticChecks !== false;
        automaticChecks.disabled = !this.state.enabled;
      }
    }
  }

  return Object.freeze({ Controller, presentationForState });
});
