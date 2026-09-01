(function exposeRelationshipBoardResourceView(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipBoardResourceView = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipBoardResourceView() {
  const RESOURCE_CATEGORY_DEFINITIONS = Object.freeze([
    Object.freeze({ id: 'whiteboard', label: '白板文件', icon: '▧' }),
    Object.freeze({ id: 'project', label: '项目', icon: '▣' }),
    Object.freeze({ id: 'repository', label: '仓库', icon: '⑂' }),
    Object.freeze({ id: 'server', label: '主机', icon: '▰' }),
    Object.freeze({ id: 'deployment', label: '站点与部署', icon: '◆' }),
    Object.freeze({ id: 'endpoint', label: '访问端点', icon: '↗' }),
    Object.freeze({ id: 'other', label: '其他', icon: '•••' })
  ]);

  function categoryFor(kind, categories = RESOURCE_CATEGORY_DEFINITIONS) {
    return categories.some(category => category.id === kind) ? kind : 'other';
  }

  function catalog({ resources = [], entities = [], placements = [], documents = [], categories = RESOURCE_CATEGORY_DEFINITIONS, displayName, displaySubtitle }) {
    const placedIds = new Set(placements.map(placement => placement.entityId));
    const byReference = new Map();
    for (const entity of entities.filter(item => item.refId)) {
      const key = `${entity.type}:${entity.refId}`;
      if (!byReference.has(key) || placedIds.has(entity.id)) byReference.set(key, entity);
    }
    const items = resources.map(resource => {
      const entity = byReference.get(`${resource.kind}:${resource.refId}`);
      return { ...resource, category: categoryFor(resource.kind, categories), ...(entity ? {
        entityId: entity.id, name: displayName(entity), transient: entity.transient === true, placed: placedIds.has(entity.id)
      } : {}) };
    });
    const representedIds = new Set(items.map(resource => resource.entityId).filter(Boolean));
    for (const entity of entities) {
      if (representedIds.has(entity.id)) continue;
      items.push({ key: `entity:${entity.id}`, kind: entity.type, category: categoryFor(entity.type, categories), entityId: entity.id,
        name: displayName(entity), path: '', secondary: displaySubtitle(entity), transient: entity.transient === true, placed: placedIds.has(entity.id) });
    }
    items.push(...documents.map(item => ({ ...item, key: `whiteboard:${item.id}`, kind: 'whiteboard', category: 'whiteboard',
      secondary: item.missing ? '文件缺失 · 可移除记录' : `${item.nodeCount} 个元素`, path: item.path })));
    const order = new Map(categories.map((category, index) => [category.id, index]));
    return items.sort((left, right) => (order.get(left.category) - order.get(right.category)) || left.name.localeCompare(right.name, 'zh-CN'));
  }

  function sections(items, categories = RESOURCE_CATEGORY_DEFINITIONS) {
    return categories.map(category => ({ ...category, key: category.id, items: items.filter(resource => resource.category === category.id) }));
  }

  function render({ items, query = '', collapsed = new Set(), categories = RESOURCE_CATEGORY_DEFINITIONS, typeIcons = {}, escapeHtml: escape, panelMoveControls }) {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    const filtered = items.filter(resource => !normalizedQuery
      || `${resource.name} ${resource.path} ${resource.secondary}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
    if (normalizedQuery && !filtered.length) return '<div class="relationship-resource-empty">没有匹配的资源</div>';
    const itemHtml = resource => {
      if (resource.kind === 'whiteboard') return `<article class="relationship-resource-item whiteboard-library-item">
        <button type="button" class="whiteboard-library-open" data-open-document="${escape(resource.id)}" title="${escape(resource.path)}"><strong>▧ ${escape(resource.name)}</strong><small>${escape(resource.secondary)}</small></button>
        <button type="button" data-remove-document="${escape(resource.id)}" title="仅从资源库移除" aria-label="移除 ${escape(resource.name)} 的资源库记录">×</button>
        <button type="button" data-trash-document="${escape(resource.id)}" title="移到废纸篓" aria-label="将 ${escape(resource.name)} 移到废纸篓">♲</button></article>`;
      const canLocate = resource.placed === true;
      const canDrag = !canLocate && (!resource.transient || ['project', 'repository'].includes(resource.kind));
      const action = canLocate
        ? `data-locate-resource="${escape(resource.key)}" title="在白板中定位" aria-label="在白板中定位 ${escape(resource.name)}">⌖`
        : `data-add-resource="${escape(resource.key)}" title="添加到白板" aria-label="将 ${escape(resource.name)} 添加到白板">＋`;
      return `<article class="relationship-resource-item" draggable="${canDrag}" data-resource-key="${escape(resource.key)}" data-resource-kind="${escape(resource.kind)}">
        <span class="relationship-resource-icon" data-kind="${escape(resource.kind)}">${typeIcons[resource.kind] || '•'}</span>
        <span class="relationship-resource-copy"><strong>${escape(resource.name)}</strong><small title="${escape(resource.path || resource.secondary)}">${escape(resource.path || resource.secondary)}</small></span>
        <button type="button" ${action}</button></article>`;
    };
    return sections(filtered, categories).filter(section => !normalizedQuery || section.items.length).map(section => {
      const isCollapsed = !normalizedQuery && collapsed.has(section.key);
      return `<section class="relationship-resource-section relationship-dock-component" data-panel-id="resource:${escape(section.key)}" data-resource-section="${escape(section.key)}">
        <div class="relationship-resource-component-heading"><button class="relationship-resource-section-trigger" type="button" data-resource-section-toggle="${escape(section.key)}" aria-expanded="${!isCollapsed}">
          <span class="relationship-resource-section-disclosure" aria-hidden="true">⌄</span><span class="relationship-resource-section-icon" aria-hidden="true">${section.icon}</span>
          <span class="relationship-resource-section-copy"><strong>${escape(section.label)}</strong></span><span class="relationship-resource-section-count">${section.items.length}</span>
        </button>${panelMoveControls(`resource:${section.key}`, section.label)}</div>
        <div class="relationship-resource-section-items"${isCollapsed ? ' hidden' : ''}>${section.items.length ? section.items.map(itemHtml).join('') : '<div class="relationship-resource-section-empty">暂无资源</div>'}</div>
      </section>`;
    }).join('');
  }

  return Object.freeze({ RESOURCE_CATEGORY_DEFINITIONS, categoryFor, catalog, sections, render });
});
