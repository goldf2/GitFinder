const crypto = require('node:crypto');

const WorkspaceTabs = require('../../renderer/scripts/workspaceTabs');

const MAX_TAB_SNAPSHOT_BYTES = 128 * 1024;

function createDetachedTabContext(rawTab, options = {}) {
  if (!rawTab || typeof rawTab !== 'object' || Array.isArray(rawTab)) {
    throw new Error('标签页快照无效');
  }
  let serialized;
  try {
    serialized = JSON.stringify(rawTab);
  } catch (_) {
    throw new Error('标签页快照无法序列化');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_TAB_SNAPSHOT_BYTES) {
    throw new Error('标签页快照超过安全限制');
  }
  const fallbackPath = typeof rawTab.path === 'string' ? rawTab.path : '';
  const normalized = WorkspaceTabs.normalizeSession({
    tabs: [rawTab],
    activeTabId: rawTab.id,
    closedTabs: []
  }, fallbackPath);
  const tab = normalized.tabs[0];
  const windowIdFactory = options.windowIdFactory || (() => `window_${crypto.randomUUID()}`);
  return {
    kind: 'detached-tab',
    windowId: windowIdFactory(),
    workspaceSession: {
      version: normalized.version,
      tabs: [tab],
      activeTabId: tab.id,
      closedTabs: []
    }
  };
}

function primaryWindowContext() {
  return { kind: 'primary' };
}

module.exports = {
  MAX_TAB_SNAPSHOT_BYTES,
  createDetachedTabContext,
  primaryWindowContext
};
