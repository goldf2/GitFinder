const DEFAULT_UPDATE_FEED_URL = 'https://oaktechz.com/releases/gitfinder-2/alpha/';
const DEFAULT_RELEASE_PAGE_URL = 'https://oaktechz.com/products/gitfinder-2';

function normalizeWebUrl(value, { directory = false, allowInsecureLocalhost = false } = {}) {
  const parsed = new URL(String(value || '').trim());
  const localHttp = parsed.protocol === 'http:'
    && allowInsecureLocalhost
    && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !localHttp) throw new Error('必须使用 HTTPS 更新源');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('更新地址不能携带凭据、查询参数或片段');
  }
  if (directory && !parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed.toString();
}

function resolveUpdateConfiguration({
  isPackaged,
  env = process.env,
  defaultFeedUrl = DEFAULT_UPDATE_FEED_URL,
  defaultReleasePageUrl = DEFAULT_RELEASE_PAGE_URL,
} = {}) {
  const releasePageUrl = normalizeWebUrl(defaultReleasePageUrl);
  if (!isPackaged) return { enabled: false, reason: 'development', feedUrl: null, releasePageUrl };
  if (env.GITFINDER_2_UPDATE_ENABLED === '0') {
    return { enabled: false, reason: 'disabled', feedUrl: null, releasePageUrl };
  }

  try {
    const allowInsecureLocalhost = env.GITFINDER_2_UPDATE_ALLOW_INSECURE_LOCAL === '1';
    const feedUrl = normalizeWebUrl(env.GITFINDER_2_UPDATE_URL || defaultFeedUrl, {
      directory: true,
      allowInsecureLocalhost,
    });
    return { enabled: true, reason: null, feedUrl, releasePageUrl };
  } catch (error) {
    return {
      enabled: false,
      reason: 'invalid-configuration',
      feedUrl: null,
      releasePageUrl,
      error: error.message,
    };
  }
}

function parseVersion(value) {
  const match = String(value || '').trim().replace(/^v/, '').match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
  );
  if (!match) return null;
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareIdentifiers(left, right) {
  const leftNumber = /^\d+$/.test(left);
  const rightNumber = /^\d+$/.test(right);
  if (leftNumber && rightNumber) return Number(left) - Number(right);
  if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
  return left.localeCompare(right);
}

function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }
  if (!left.prerelease.length || !right.prerelease.length) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length ? -1 : 1;
  }
  const count = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    if (left.prerelease[index] == null) return -1;
    if (right.prerelease[index] == null) return 1;
    const difference = compareIdentifiers(left.prerelease[index], right.prerelease[index]);
    if (difference) return difference;
  }
  return 0;
}

function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

function createUpdateService({
  app,
  autoUpdater,
  configuration,
  dialog,
  Notification,
  getMainWindow,
  getAutomaticChecks = () => true,
  setAutomaticChecks: persistAutomaticChecks = () => {},
  schedule = setTimeout,
  logger = console,
}) {
  let setupComplete = false;
  let checkPromise = null;
  let downloadPromise = null;
  let promptedVersion = null;
  let availableVersion = null;

  const getWindow = () => {
    const window = getMainWindow?.();
    return window && !window.isDestroyed?.() ? window : null;
  };
  const send = (channel, payload) => getWindow()?.webContents.send(channel, payload);
  const disabledReason = () => configuration?.reason || 'unavailable';
  const automaticChecksEnabled = () => {
    try {
      return getAutomaticChecks() !== false;
    } catch (error) {
      logger.warn('读取自动更新偏好失败:', error?.message || error);
      return true;
    }
  };

  function focusUpdateSettings() {
    const window = getWindow();
    if (!window) return;
    if (window.isMinimized?.()) window.restore();
    window.show?.();
    window.focus?.();
    window.webContents.send('app:shortcut', 'open-update-settings');
  }

  function showUpdateNotification(version) {
    if (!Notification || (typeof Notification.isSupported === 'function' && !Notification.isSupported())) {
      return false;
    }
    try {
      const notification = new Notification({
        title: 'GitFinder 2 有可用更新',
        body: `版本 ${version} 已可下载。点击查看软件更新。`,
        silent: true,
      });
      notification.on('click', focusUpdateSettings);
      notification.show();
      return true;
    } catch (error) {
      logger.warn('显示更新通知失败:', error?.message || error);
      return false;
    }
  }

  function status() {
    return {
      enabled: Boolean(configuration?.enabled && autoUpdater),
      reason: configuration?.enabled && autoUpdater ? null : disabledReason(),
      currentVersion: app.getVersion(),
      automaticChecks: automaticChecksEnabled(),
      releasePageUrl: configuration?.releasePageUrl || null,
      feedHost: configuration?.feedUrl ? new URL(configuration.feedUrl).host : null,
    };
  }

  async function downloadUpdate() {
    if (!configuration?.enabled || !autoUpdater) return false;
    if (!dialog?.showMessageBox || downloadPromise) return downloadPromise || false;
    const version = availableVersion || '可用版本';
    const options = {
      type: 'question',
      title: '确认下载更新',
      message: `下载 GitFinder 2 ${version}？`,
      detail: '下载完成后仍由你决定何时重启安装；取消不会修改当前版本。',
      buttons: ['下载更新', '取消'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const window = getWindow();
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    if (result.response !== 0) return false;
    send('updater:downloading');
    downloadPromise = autoUpdater.downloadUpdate()
      .then(() => true)
      .finally(() => { downloadPromise = null; });
    return downloadPromise;
  }

  function installUpdate() {
    if (!configuration?.enabled || !autoUpdater) return false;
    autoUpdater.quitAndInstall();
    return true;
  }

  function bindEvents() {
    autoUpdater.on('update-available', (info = {}) => {
      const version = info.version || '新版本';
      availableVersion = version;
      send('updater:available', {
        version,
        releaseNotes: info.releaseNotes || null,
        releaseDate: info.releaseDate || null,
      });
      const window = getWindow();
      if (!window || promptedVersion === version) return;
      promptedVersion = version;
      showUpdateNotification(version);
    });

    autoUpdater.on('update-not-available', () => send('updater:up-to-date'));
    autoUpdater.on('download-progress', (progress = {}) => send('updater:progress', {
      percent: Number(progress.percent) || 0,
      transferred: Number(progress.transferred) || 0,
      total: Number(progress.total) || 0,
    }));
    autoUpdater.on('update-downloaded', () => {
      send('updater:downloaded');
      const window = getWindow();
      if (!window) return;
      dialog.showMessageBox(window, {
        type: 'info',
        title: '更新已下载',
        message: '更新已下载完成',
        detail: '重启前请先保存正在编辑的内容。',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) installUpdate();
      }).catch((error) => logger.warn('处理安装提示失败:', error?.message || error));
    });
    autoUpdater.on('error', (error) => {
      logger.error('自动升级错误:', error);
      send('updater:error', error?.message || String(error));
    });
  }

  function setup() {
    if (setupComplete || !configuration?.enabled || !autoUpdater) return false;
    setupComplete = true;
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: configuration.feedUrl,
      channel: 'latest',
    });
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    bindEvents();
    if (automaticChecksEnabled()) {
      schedule(() => {
        if (!automaticChecksEnabled()) return;
        checkForUpdates().catch((error) => logger.warn('检查更新失败:', error?.message || error));
      }, 10_000);
    }
    return true;
  }

  function setAutomaticChecks(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('自动检查设置无效');
    persistAutomaticChecks(enabled);
    const next = status();
    send('updater:policy-changed', next);
    return next;
  }

  async function checkForUpdates() {
    if (!configuration?.enabled || !autoUpdater) {
      return { available: false, currentVersion: app.getVersion(), reason: disabledReason() };
    }
    if (checkPromise) return checkPromise;
    checkPromise = autoUpdater.checkForUpdates()
      .then((result) => {
        const info = result?.updateInfo || {};
        const available = typeof result?.isUpdateAvailable === 'boolean'
            ? result.isUpdateAvailable
            : isNewerVersion(info.version, app.getVersion());
        availableVersion = available ? (info.version || availableVersion) : null;
        return {
          available,
          currentVersion: app.getVersion(),
          version: info.version || null,
          releaseNotes: info.releaseNotes || null,
          releaseDate: info.releaseDate || null,
        };
      })
      .catch((error) => ({
        available: false,
        currentVersion: app.getVersion(),
        error: error?.message || String(error),
      }))
      .finally(() => { checkPromise = null; });
    return checkPromise;
  }

  return { checkForUpdates, downloadUpdate, installUpdate, setAutomaticChecks, setup, status };
}

module.exports = {
  DEFAULT_RELEASE_PAGE_URL,
  DEFAULT_UPDATE_FEED_URL,
  compareVersions,
  createUpdateService,
  isNewerVersion,
  resolveUpdateConfiguration,
};
