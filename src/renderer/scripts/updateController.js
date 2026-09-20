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
      return { label: '没有可用更新', title: '更新源没有更高版本', disabled: false, tone: 'success' };
    }
    if (state.phase === 'error') {
      return { label: '重新检查', title: state.error || '检查更新失败', disabled: false, tone: 'error' };
    }
    return { label: '检查更新', title: '手动检查软件更新', disabled: false, tone: '' };
  }

  function detailForState(state = {}) {
    if (state.error) return state.errorCode ? `[${state.errorCode}] ${state.error}` : state.error;
    const source = `更新源：${state.feedHost || '官方发布源'}`;
    if (!state.remoteVersion) return source;
    return `${source} · 线上版本 v${state.remoteVersion}`;
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
        prerelease: true,
        autoInstall: false,
        canAutoInstall: false,
        phase: 'idle',
        availableVersion: '',
        remoteVersion: '',
        progress: 0,
        errorCode: '',
        error: '',
      };
      this.bound = false;
      this.resetTimer = null;
    }

    async setup() {
      if (this.bound) return;
      this.bound = true;
      this.document.addEventListener('click', event => {
        if (event.target.closest?.('[data-update-feedback]')) {
          void this.bridge.updater.feedback().catch(() => this.onStatusMessage('无法打开反馈页面', 'error'));
          return;
        }
        const button = event.target.closest?.('[data-update-action="primary"]');
        if (!button) return;
        event.preventDefault();
        this.performPrimaryAction();
      });
      this.document.addEventListener('change', event => {
        const policy = event.target.closest?.('[data-update-policy]');
        if (policy) { void this.setPolicy(policy.dataset.updatePolicy, policy.checked === true); return; }
        const toggle = event.target.closest?.('[data-update-auto-check]');
        if (!toggle) return;
        this.setAutomaticChecks(toggle.checked === true);
      });
      this.document.getElementById('app-version')?.addEventListener('click', () => this.check());

      this.bridge.updater.onAvailable(info => {
        this.setState({ phase: 'available', availableVersion: info?.version || '', remoteVersion: info?.version || '', errorCode: '', error: '' });
        this.onStatusMessage('发现新版本，可在“软件更新”中下载安装', 'info');
      });
      this.bridge.updater.onUpToDate((_event, info) => {
        this.setState({ phase: 'up-to-date', availableVersion: '', remoteVersion: info?.version || '', errorCode: '', error: '' });
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
        this.setState({ automaticChecks: status?.automaticChecks !== false, prerelease: status?.prerelease !== false, autoInstall: status?.autoInstall === true, canAutoInstall: status?.canAutoInstall === true,
          ...(status?.resetResult ? { phase: 'idle', availableVersion: '', remoteVersion: '', error: '' } : {}) });
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
          prerelease: status?.prerelease !== false,
          autoInstall: status?.autoInstall === true,
          canAutoInstall: status?.canAutoInstall === true,
        });
      } catch (error) {
        this.setState({ enabled: false, reason: 'unavailable', error: error?.message || String(error) });
      }
    }

    settingsMarkup() {
      return `<section class="app-settings-section" id="settings-updates" role="tabpanel" aria-labelledby="settings-navigation-updates">
        <div class="app-settings-section-heading">
          <h2 id="settings-updates-title">软件更新</h2>
          <p>默认接收版本通知，由你确认安装；自动下载安装需要单独开启。</p>
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
          <label class="app-settings-row"><span><strong>接收测试版更新</strong><small>默认开启；关闭后只接收正式版，不自动降级</small></span><input class="app-settings-toggle" data-update-policy="prerelease" type="checkbox"></label>
          <label class="app-settings-row"><span><strong>自动下载并在退出时安装</strong><small id="settings-update-install-help">默认关闭，不强制重启</small></span><input class="app-settings-toggle" data-update-policy="autoInstall" type="checkbox"></label>
          <div class="app-settings-row"><span><strong>反馈问题 / 建议</strong><small>打开GitHub公开反馈页，需要登录；不会上传工程或日志</small></span><button class="btn" data-update-feedback type="button">反馈问题 / 建议</button></div>
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

    async setPolicy(key, enabled) {
      const method = key === 'prerelease' ? 'setPrerelease' : key === 'autoInstall' ? 'setAutoInstall' : null;
      if (!method) return;
      try {
        const status = await this.bridge.updater[method](enabled);
        this.setState({ ...status, ...(key === 'prerelease' ? { phase: 'idle', availableVersion: '', remoteVersion: '', error: '' } : {}) });
      } catch (error) { this.onStatusMessage(error?.message || '保存失败', 'error'); this.render(); }
    }

    async check() {
      if (!this.state.enabled || this.state.phase === 'checking' || this.state.phase === 'downloading') return false;
      this.setState({ phase: 'checking', errorCode: '', error: '' });
      try {
        const result = await this.bridge.updater.check();
        if (['downloading', 'downloaded'].includes(this.state.phase)) return result;
        if (result?.available) {
          this.setState({ phase: 'available', availableVersion: result.version || '', remoteVersion: result.version || '', errorCode: '', error: '' });
        } else if (result?.reason) {
          this.setState({ enabled: false, reason: result.reason, phase: 'idle' });
        } else if (result?.error) {
          this.setState({ phase: 'error', errorCode: result.errorCode || '', error: result.error });
          this.onStatusMessage(`检查更新失败：${result.error}`, 'error');
        } else {
          this.setState({ phase: 'up-to-date', availableVersion: '', remoteVersion: result?.version || '', errorCode: '', error: '' });
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
        detail.textContent = detailForState(this.state);
      }
      if (automaticChecks) {
        automaticChecks.checked = this.state.automaticChecks !== false;
        automaticChecks.disabled = !this.state.enabled;
      }
      this.document.querySelectorAll('[data-update-policy]').forEach(toggle => {
        toggle.checked = this.state[toggle.dataset.updatePolicy] === true;
        toggle.disabled = !this.state.enabled || ['checking', 'downloading'].includes(this.state.phase);
      });
      const installHelp = this.document.getElementById('settings-update-install-help');
      if (installHelp) installHelp.textContent = this.state.canAutoInstall ? '开启后正常退出时安装；默认关闭，不强制重启' : '当前开发包未正式签名：可保存偏好，但仍需手动安装';
    }
  }

  return Object.freeze({ Controller, detailForState, presentationForState });
});
