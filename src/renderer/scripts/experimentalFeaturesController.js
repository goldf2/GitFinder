// Device preferences only. Disabling a feature never removes project ledgers or boards.
Object.assign(App, {
  isExperimentalViewEnabled(view) {
    return window.ExperimentalFeatures.isViewEnabled(AppState.experimentalFeatures, view);
  },

  async loadExperimentalFeatures() {
    window.gitFinder.config.onExperimentalFeaturesChanged?.(flags => this.applyExperimentalFeatures(flags));
    const flags = await window.gitFinder.config.get('experimentalFeatures').catch(() => null);
    this.applyExperimentalFeatures(flags);
  },

  applyExperimentalFeatures(value) {
    const flags = window.ExperimentalFeatures.normalize(value);
    const changed = JSON.stringify(flags) !== JSON.stringify(AppState.experimentalFeatures);
    AppState.experimentalFeatures = flags;
    if (changed) this.invalidateProjectProgress?.();
    for (const view of window.ExperimentalFeatures.KEYS) {
      document.querySelectorAll(`[data-view="${view}"], [data-mode="${view}"]`).forEach(element => {
        element.hidden = !flags[view];
        element.setAttribute('aria-hidden', String(!flags[view]));
      });
      const input = document.getElementById(`settings-experimental-${view}`);
      if (input) input.checked = flags[view];
    }
    const session = AppState.workspaceSession;
    if (session) {
      const gated = window.ExperimentalFeatures.gateSession(session, flags);
      if (JSON.stringify(gated) !== JSON.stringify(session)) {
        AppState.workspaceSession = gated;
        this.renderWorkspaceTabs();
        this.scheduleWorkspaceTabsPersist();
      }
    }
    if (!this.isExperimentalViewEnabled(AppState.currentMode)) {
      // Includes notifications received by other open windows.
      this.switchView('tree');
    } else if (!['tasks', 'dashboard'].includes(AppState.currentMode)) {
      this.stopProjectProgressPolling?.();
    } else if (changed) {
      this.renderContent();
    }
  },

  experimentalFeaturesMarkup() {
    const flags = window.ExperimentalFeatures.normalize(AppState.experimentalFeatures);
    return `<section class="app-settings-section" id="settings-testing" role="tabpanel" aria-labelledby="settings-navigation-testing">
      <div class="app-settings-section-heading"><h2>测试功能</h2>
        <p>未完善功能，默认关闭。仅在本机手动启用，不影响文件、项目、Git 和关系白板。</p></div>
      <div class="app-settings-controls">
        <label class="app-settings-row" for="settings-experimental-dashboard">
          <span><strong>仪表盘 <small>测试中</small></strong><small>显示项目任务汇总。任务计数不代表软件完成率，尚不适合作为正式进度结论。</small></span>
          <input class="app-settings-toggle" id="settings-experimental-dashboard" data-experimental-feature="dashboard" type="checkbox"${flags.dashboard ? ' checked' : ''}>
        </label>
        <label class="app-settings-row" for="settings-experimental-tasks">
          <span><strong>开发进度（开发任务） <small>测试中</small></strong><small>读取项目内台账、依赖和证据；不会自动判断完成，也不会将代码或台账上传给 AI。</small></span>
          <input class="app-settings-toggle" id="settings-experimental-tasks" data-experimental-feature="tasks" type="checkbox"${flags.tasks ? ' checked' : ''}>
        </label>
      </div>
      <p class="experimental-settings-note">开关立即保存，无需点击“保存设置”。关闭后隐藏对应入口并停止该功能自动刷新；已打开的相关标签回到文件浏览，原台账和白板均保留。</p>
      <p class="experimental-settings-note">AI 辅助进度识别仍待设计和验证；本区不是 AI 自动开发或验收开关。</p>
      <p id="experimental-settings-feedback" role="status" aria-live="polite"></p>
    </section>`;
  },

  bindExperimentalFeatureSettings() {
    document.querySelectorAll('[data-experimental-feature]').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.dataset.experimentalFeature;
        const enabled = input.checked;
        const feedback = document.getElementById('experimental-settings-feedback');
        input.disabled = true;
        if (feedback) feedback.textContent = '正在保存本机开关…';
        try {
          const flags = await window.gitFinder.config.setExperimentalFeature(key, enabled);
          this.applyExperimentalFeatures(flags);
          if (feedback) feedback.textContent = `${key === 'dashboard' ? '仪表盘' : '开发进度'}已${enabled ? '启用（测试）' : '关闭'}；原数据保留。`;
        } catch (error) {
          input.checked = this.isExperimentalViewEnabled(key);
          if (feedback) feedback.textContent = `保存失败，开关未改变：${error?.message || String(error)}`;
        } finally { input.disabled = false; }
      });
    });
  }
});
