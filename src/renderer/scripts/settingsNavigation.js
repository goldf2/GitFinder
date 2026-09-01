(function exposeSettingsNavigation(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SettingsNavigation = api;
})(typeof window !== 'undefined' ? window : globalThis, function createSettingsNavigation() {
  const ITEMS = Object.freeze([
    Object.freeze({ id: 'settings-browsing', label: '目录显示', summary: '视图、排列与隐藏项目', glyph: '▦' }),
    Object.freeze({ id: 'settings-sidebar', label: '侧边栏', summary: '项目快捷入口', glyph: '▤' }),
    Object.freeze({ id: 'settings-appearance', label: '外观', summary: '主题与语义色彩', glyph: '◐' }),
    Object.freeze({ id: 'settings-panel-provider', label: 'Coolify 数据源', summary: '服务器与部署连接', glyph: '⌁' }),
    Object.freeze({ id: 'settings-developer-tools', label: '开发工具', summary: '终端、Git 与编辑器', glyph: '⌘' }),
    Object.freeze({ id: 'settings-projects', label: '项目身份', summary: '本地项目初始化', glyph: '◇' })
  ]);
  const IDS = new Set(ITEMS.map(item => item.id));

  function normalizeSection(value) {
    return IDS.has(value) ? value : ITEMS[0].id;
  }

  function sectionFromKey(currentSection, key) {
    const currentIndex = ITEMS.findIndex(item => item.id === normalizeSection(currentSection));
    if (key === 'Home') return ITEMS[0].id;
    if (key === 'End') return ITEMS.at(-1).id;
    if (key === 'ArrowDown') return ITEMS[(currentIndex + 1) % ITEMS.length].id;
    if (key === 'ArrowUp') return ITEMS[(currentIndex - 1 + ITEMS.length) % ITEMS.length].id;
    return null;
  }

  return Object.freeze({ ITEMS, normalizeSection, sectionFromKey });
});
