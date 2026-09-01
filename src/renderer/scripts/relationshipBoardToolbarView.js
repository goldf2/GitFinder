(function exposeRelationshipBoardToolbarView(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipBoardToolbarView = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipBoardToolbarView() {
  const TASK_FILTERS = [['has-todos', '有待办'], ['no-todos', '无待办'], ['open', '未完成'], ['overdue', '已逾期'], ['due-today', '今天截止'], ['reminder-today', '今天提醒'], ['completed', '已完成']];
  const RUNTIME_STATES = [['normal', '正常'], ['warning', '预警 / 故障'], ['inactive', '停止 / 无效']];
  const option = (value, label, selected, escape) => `<option value="${escape(value)}"${selected === value ? ' selected' : ''}>${escape(label)}</option>`;
  const checks = (name, items, selected, escape) => items.map(([value, label]) => `<label><input name="${name}" type="checkbox" value="${escape(value)}"${selected.has(value) ? ' checked' : ''}><span>${escape(label)}</span></label>`).join('');
  const slider = ({ key, label, value, output, min, max, step, data, aria = label }, escape) => `<label class="relationship-display-slider"><span><b>${label}</b><output data-${data}>${escape(output)}</output></span><input name="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${escape(value)}" aria-label="${aria}"></label>`;
  const select = (name, label, value, items, escape) => `<label class="relationship-display-select"><span>${label}</span><select name="${name}">${items.map(item => option(item[0], item[1], value, escape)).join('')}</select></label>`;

  function displayPopover({ view, boardView, serverTree, icon, escapeHtml: escape }) {
    const percent = value => `${Math.round(value * 100)}%`;
    const px = value => `${Math.round(value)} px`;
    const sliders = [
      { key: 'cardScale', label: '卡片大小', value: view.cardScale, output: percent(view.cardScale), min: .8, max: 1.4, step: .05, data: 'display-card-scale' },
      { key: 'textScale', label: '文字大小', value: view.textScale, output: percent(view.textScale), min: .85, max: 1.3, step: .05, data: 'display-text-scale' },
      { key: 'groupTitleFontSize', label: '群组标题字号', value: view.groupTitleFontSize, output: px(view.groupTitleFontSize), min: 14, max: 36, step: 1, data: 'display-group-title-size' },
      { key: 'cardWidth', label: '卡片基础宽度', value: view.cardWidth, output: px(view.cardWidth), min: 220, max: 600, step: 10, data: 'display-card-width', aria: '卡片宽度' },
      { key: 'cardHeight', label: '简略卡片最小高度', value: view.cardHeight, output: px(view.cardHeight), min: 143, max: 420, step: 1, data: 'display-card-height', aria: '卡片高度' },
      { key: 'horizontalSpacing', label: '横向间距', value: view.horizontalSpacing, output: px(view.horizontalSpacing), min: 16, max: 180, step: 4, data: 'display-horizontal-spacing', aria: '卡片横向间距' },
      { key: 'verticalSpacing', label: '纵向间距', value: view.verticalSpacing, output: px(view.verticalSpacing), min: 16, max: 140, step: 4, data: 'display-vertical-spacing', aria: '卡片纵向间距' },
      { key: 'statusTintOpacity', label: '状态底色', value: view.statusTintOpacity, output: percent(view.statusTintOpacity), min: 0, max: .18, step: .01, data: 'display-status-tint', aria: '状态底色强度' },
      { key: 'filterContextOpacity', label: '一跳上下文', value: view.filterContextOpacity, output: percent(view.filterContextOpacity), min: .15, max: .8, step: .01, data: 'display-context-opacity', aria: '一跳上下文可视度' },
      { key: 'filterMutedOpacity', label: '其他未命中项', value: view.filterMutedOpacity, output: percent(view.filterMutedOpacity), min: .03, max: .4, step: .01, data: 'display-muted-opacity', aria: '其他未命中项可视度' },
      { key: 'filterMatchHaloOpacity', label: '命中高亮', value: view.filterMatchHaloOpacity, output: percent(view.filterMatchHaloOpacity), min: 0, max: .6, step: .01, data: 'display-match-halo', aria: '筛选命中高亮强度' }
    ];
    return `<div class="relationship-display-host">
      <button class="relationship-tool-button relationship-display-trigger relationship-icon-tool" data-relationship-action="toggle-display-menu" type="button" aria-label="显示设置" title="显示设置：卡片大小、间距与颜色" aria-haspopup="dialog" aria-expanded="false">${icon}</button>
      <div class="relationship-display-popover" role="dialog" aria-label="调整白板显示" hidden><form data-relationship-display-form>
        <header><strong>白板显示</strong><small>只影响当前白板，不修改资源数据</small></header>
        ${select('mode', '信息密度', view.mode, [['full', '完整'], ['compact', '精简']], escape)}
        ${sliders.slice(0, 5).map(item => slider(item, escape)).join('')}<small>宽高随卡片缩放比例变化；详情按内容增高，文字和图片元素单独调节。</small>
        ${sliders.slice(5, 7).map(item => slider(item, escape)).join('')}<small>调整尺寸或间距时，列间距与群组边界同步适配；手动群组保留排列顺序和额外留白。</small>
        ${sliders.slice(7).map(item => slider(item, escape)).join('')}
        ${select('cardAppearance', '卡片层次', view.cardAppearance, [['elevated', '层次阴影'], ['flat', '简洁平面']], escape)}
        ${select('projectGroupShape', 'Project 容器形状', view.projectGroupShape, [['rounded', '矩形'], ['polygon', '多边形']], escape)}
        <small>只改变容器外观，不改变 Project 归属或当前布局方式。</small>
        ${select('cardTitleSource', '默认标题内容', view.cardTitleSource, [['name', '资源名称'], ['note', '卡片备注']], escape)}
        <div class="relationship-display-toggles">
          ${serverTree ? `<label><input name="projectGroupIncludesEndpoints" data-project-endpoints type="checkbox"${boardView.projectGroupIncludesEndpoints ? ' checked' : ''}><span>项目组包含访问点</span></label><small>开启后独占访问点放入项目容器；关闭后位于容器外。共享访问点保持独立。</small>` : ''}
          <label><input name="showGrid" type="checkbox"${view.showGrid ? ' checked' : ''}><span>显示画布网格</span></label>
          <label><input name="showEdgeLabels" type="checkbox"${view.showEdgeLabels ? ' checked' : ''}><span>显示关系文字</span></label>
          <label><input name="showRuntimeStatus" type="checkbox"${view.showRuntimeStatus ? ' checked' : ''}><span>显示服务状态</span></label>
        </div><footer><button type="button" data-relationship-action="reset-display-settings">恢复默认显示</button></footer>
      </form></div></div>`;
  }

  function filterPopover({ view, boardView, entityTypes, typeLabels, verificationFilters, verificationLabels, environmentOptions, labels, icon, escapeHtml: escape }) {
    const entityChecks = checks('entityTypes', entityTypes.map(type => [type, typeLabels[type]]), new Set(view.selectedEntityTypes), escape);
    const runtimeChecks = checks('runtimeStates', RUNTIME_STATES, new Set(view.selectedRuntimeStates), escape);
    const taskChecks = checks('taskFilters', TASK_FILTERS, new Set(view.selectedTaskFilters), escape);
    const verificationOptions = verificationFilters.map(value => option(value, verificationLabels[value], boardView.verification, escape)).join('');
    const labelOptions = labels.map(label => option(label, label, boardView.label, escape)).join('');
    return `<div class="relationship-filter-host">
      <button class="relationship-tool-button relationship-filter-trigger relationship-icon-tool" data-relationship-action="toggle-filter-menu" type="button" aria-label="筛选" title="筛选：可同时选择多个条件" aria-haspopup="dialog" aria-expanded="false">${icon}<span class="relationship-filter-count" hidden></span></button>
      <div class="relationship-filter-popover" role="dialog" aria-label="筛选白板内容" hidden><form data-relationship-filter-form>
        <header><strong>筛选白板内容</strong><small>匹配结果会保留一跳关系上下文</small></header>
        <label class="relationship-filter-search"><span aria-hidden="true">⌕</span><input name="query" type="search" maxlength="120" placeholder="搜索名称、环境或说明" value="${escape(boardView.query)}" autocomplete="off"></label>
        <div class="relationship-filter-grid"><input name="entityType" type="hidden" value="all"><input name="task" type="hidden" value="all">
          <fieldset class="relationship-filter-check-group"><legend>节点类型 · 可多选</legend><div>${entityChecks}</div></fieldset>
          <fieldset class="relationship-filter-check-group"><legend>运行状态 · 可多选</legend><div>${runtimeChecks}</div></fieldset>
          <fieldset class="relationship-filter-check-group relationship-filter-check-group-wide"><legend>待办 · 可多选</legend><div>${taskChecks}</div></fieldset>
          <label><span>环境</span><select name="environment">${environmentOptions}</select></label>
          <label><span>核验状态</span><select name="verification">${verificationOptions}</select></label>
          <label><span>注释</span><select name="annotation">${option('all', '全部', boardView.annotation, escape)}${option('has-note', '有备注', boardView.annotation, escape)}</select></label>
          <label><span>标签</span><select name="label"><option value="">全部标签</option>${labelOptions}</select></label>
          <label><span>未命中项</span><select name="unmatchedDisplay">${option('dim', '低可视保留', view.unmatchedDisplay, escape)}${option('hide', '隐藏', view.unmatchedDisplay, escape)}</select></label>
          <label><span>节点显示</span><select name="mode">${option('full', '完整', boardView.mode, escape)}${option('compact', '精简', boardView.mode, escape)}</select></label>
          <label><span>关系层级</span><select name="projection">${option('facts', '完整事实', boardView.projection, escape)}${option('deployment-summary', '部署摘要', boardView.projection, escape)}</select></label>
        </div><footer><span class="relationship-filter-summary" role="status"></span><button type="button" data-relationship-action="clear-filters">清除筛选</button></footer>
      </form></div></div>`;
  }

  function addMenu(icon) {
    return `<div class="relationship-menu-host"><button class="relationship-tool-button relationship-add-trigger relationship-icon-tool" data-relationship-action="toggle-add-menu" type="button" aria-label="添加节点" title="添加文字、图片、文件或关系节点" aria-haspopup="menu" aria-expanded="false">${icon}</button>
      <div class="relationship-add-menu" role="menu" hidden>
        <button type="button" role="menuitem" data-relationship-action="add-text"><span>T</span><span>文字</span><small>可编辑文字块</small></button>
        <button type="button" role="menuitem" data-relationship-action="add-image"><span>▧</span><span>图片…</span><small>图片随白板文件保存</small></button>
        <button type="button" role="menuitem" data-relationship-action="add-files"><span>▱</span><span>文件与媒体…</span><small>复制进项目或保留引用</small></button>
        <button type="button" role="menuitem" data-add-node-type="server"><span>▰</span><span>服务器</span><small>不保存登录凭据</small></button>
        <button type="button" role="menuitem" data-add-node-type="deployment"><span>◆</span><span>部署</span><small>环境与状态</small></button>
        <button type="button" role="menuitem" data-add-node-type="endpoint"><span>↗</span><span>访问端点</span><small>仅显示标签</small></button>
        <button type="button" role="menuitem" data-add-node-type="group"><span>▢</span><span>分组</span><small>视觉整理</small></button>
        <div class="relationship-menu-separator" role="separator"></div>
        <button type="button" role="menuitem" data-relationship-action="export-package"><span>⇧</span><span>导出白板包…</span><small>.gfb 标准 ZIP，包含媒体附件</small></button>
        <button type="button" role="menuitem" data-relationship-action="import-package"><span>⇩</span><span>导入白板包…</span><small>创建项目文件夹并加入资源库</small></button>
        <button type="button" role="menuitem" data-relationship-action="export-json"><span>⇧</span><span>导出白板 JSON…</span><small>仅关系快照，不包含附件文件</small></button>
        <button type="button" role="menuitem" data-relationship-action="import-json"><span>⇩</span><span>导入合并 JSON…</span><small>先预览差异再合并</small></button>
      </div></div>`;
  }

  return Object.freeze({ displayPopover, filterPopover, addMenu });
});
