(() => {
  'use strict';

  const nodes = [
    {
      id: 'repo-mes', type: 'repository', typeLabel: 'Git 仓库', icon: '⑂', title: 'mes-lite',
      status: 'synced', statusLabel: '已同步', summary: 'main · a24c7e1', updated: '2 分钟前',
      x: 40, y: 360, todos: 0, reminders: 0, overdue: 0,
      metrics: [['分支', 'main'], ['提交', 'a24c7e1'], ['工作区', '干净'], ['远端', '已同步']],
      facts: [['本地目录', '/Volumes/project/开发中/mes-lite'], ['远程仓库', 'goldf2/mes-lite'], ['最近提交', '修复库存一致性检查']],
      note: '生产 MES 主仓库；由多个部署资源引用。',
    },
    {
      id: 'deploy-primary', type: 'deployment', typeLabel: '部署', icon: '◆', title: 'mes-lite · 生产集群',
      status: 'running', statusLabel: '运行中', summary: 'production · running:healthy', updated: '3 分钟前',
      x: 355, y: 100, todos: 2, reminders: 1, overdue: 0,
      todoItems: [
        { title: '核对库存列表与就绪探针', meta: '今天 18:00', kind: 'todo' },
        { title: '检查数据库挂载与备份', meta: '部署完成后', kind: 'todo' },
        { title: '完成生产回归检查', meta: '提醒 · 今天', kind: 'reminder' },
      ],
      metrics: [['状态', '运行中'], ['延迟', '42 ms'], ['最近部署', '3 分钟前'], ['最近失败', '否']],
      facts: [['代码来源', 'mes-lite · main'], ['提交版本', 'a24c7e1'], ['实例数量', '2 个主机'], ['部署方式', '自动部署']],
      note: '部署后核对库存列表、就绪探针和数据库挂载。',
    },
    {
      id: 'deploy-standby', type: 'deployment', typeLabel: '部署', icon: '◆', title: 'mes-lite · 灰度实例',
      status: 'stopped', statusLabel: '已停止', summary: 'staging · exited', updated: '昨天 23:40',
      x: 355, y: 610, todos: 0, reminders: 0, overdue: 0,
      metrics: [['状态', '已停止'], ['环境', 'staging'], ['停止时间', '昨天'], ['最近失败', '否']],
      facts: [['代码来源', 'mes-lite · main'], ['提交版本', '9b44d20'], ['运行主机', 'con02'], ['访问策略', '内部访问']],
      note: '灰度验证完成后手动停止，暂不占用运行资源。',
    },
    {
      id: 'host-con01', type: 'server', typeLabel: '主机', icon: '▰', title: 'con01',
      status: 'running', statusLabel: '在线', summary: '4 核 · 7.1 GiB · 负载正常', updated: '18 秒前',
      x: 690, y: 55, todos: 0, reminders: 0, overdue: 0,
      metrics: [['状态', '在线'], ['CPU', '31%'], ['内存', '4.2 GiB'], ['延迟', '18 ms']],
      facts: [['部署数量', '12'], ['运行中', '10'], ['故障', '0'], ['最近更新', '18 秒前']],
      note: '主生产节点，当前无待办事项。',
    },
    {
      id: 'host-con02', type: 'server', typeLabel: '主机', icon: '▰', title: 'con02',
      status: 'fault', statusLabel: '故障', summary: '健康检查失败 · 连接波动', updated: '1 分钟前',
      x: 690, y: 575, todos: 1, reminders: 0, overdue: 1,
      todoItems: [
        { title: '检查主机网络与容器运行时', meta: '逾期 1 小时', kind: 'overdue' },
      ],
      metrics: [['状态', '故障'], ['CPU', '未知'], ['内存', '未知'], ['离线', '1 分钟']],
      facts: [['部署数量', '4'], ['受影响部署', '2'], ['最近错误', '连接超时'], ['负责人', '未分配']],
      note: '检查主机网络和容器运行时；该待办已经逾期。',
    },
    {
      id: 'endpoint-web', type: 'endpoint', typeLabel: '访问点', icon: '↗', title: 'mes.csyufeng.com',
      status: 'running', statusLabel: '可访问', summary: 'HTTPS · 200 OK · 42 ms', updated: '25 秒前',
      x: 1015, y: 80, todos: 0, reminders: 0, overdue: 0,
      metrics: [['状态', '可访问'], ['HTTP', '200'], ['延迟', '42 ms'], ['证书', '有效']],
      facts: [['协议', 'HTTPS'], ['公开域名', 'mes.csyufeng.com'], ['部署来源', '生产集群'], ['检测频率', '60 秒']],
      note: '面向生产用户的主访问入口。',
    },
    {
      id: 'endpoint-api', type: 'endpoint', typeLabel: '访问点', icon: '↗', title: 'api.mes.csyufeng.com',
      status: 'running', statusLabel: '可访问', summary: 'HTTPS · 200 OK · 58 ms', updated: '26 秒前',
      x: 1015, y: 355, todos: 1, reminders: 1, overdue: 0,
      todoItems: [
        { title: '确认 TLS 证书自动续期', meta: '12 天后到期', kind: 'todo' },
        { title: '复查外部 API 健康检查', meta: '提醒 · 明天', kind: 'reminder' },
      ],
      metrics: [['状态', '可访问'], ['HTTP', '200'], ['延迟', '58 ms'], ['证书', '12 天']],
      facts: [['协议', 'HTTPS'], ['公开域名', 'api.mes.csyufeng.com'], ['部署来源', '生产集群'], ['证书续期', '12 天后']],
      note: '提醒：确认自动续期任务和外部 API 健康检查。',
    },
  ];

  const edges = [
    ['repo-mes', 'deploy-primary', '代码来源'],
    ['repo-mes', 'deploy-standby', '代码来源'],
    ['deploy-primary', 'host-con01', '运行于'],
    ['deploy-primary', 'host-con02', '共同部署'],
    ['deploy-standby', 'host-con02', '运行于'],
    ['deploy-primary', 'endpoint-web', '提供访问'],
    ['deploy-primary', 'endpoint-api', '提供访问'],
  ];

  const specimens = [
    { caption: '运行中的', type: 'deployment', typeLabel: '部署', icon: '◆', title: '生产部署', status: 'running', statusLabel: '运行中', summary: 'production · healthy', todos: 0, reminders: 0, overdue: 0 },
    { caption: '停止中的', type: 'deployment', typeLabel: '部署', icon: '◆', title: '灰度实例', status: 'stopped', statusLabel: '已停止', summary: 'staging · exited', todos: 0, reminders: 0, overdue: 0 },
    { caption: '故障的', type: 'server', typeLabel: '主机', icon: '▰', title: 'con02', status: 'fault', statusLabel: '故障', summary: '健康检查失败', todos: 0, reminders: 0, overdue: 0 },
    { caption: '有待办的', type: 'endpoint', typeLabel: '访问点', icon: '↗', title: 'api.mes.csyufeng.com', status: 'running', statusLabel: '可访问', summary: 'HTTPS · 200 OK', todos: 2, reminders: 1, overdue: 0 },
    { caption: '无待办的', type: 'repository', typeLabel: 'Git 仓库', icon: '⑂', title: 'mes-lite', status: 'synced', statusLabel: '已同步', summary: 'main · a24c7e1', todos: 0, reminders: 0, overdue: 0 },
  ];

  const nodeLayer = document.querySelector('#node-layer');
  const edgeLayer = document.querySelector('#edge-layer');
  const canvas = document.querySelector('#overview-canvas');
  const specimenGrid = document.querySelector('#specimen-grid');
  const toggleAllDetails = document.querySelector('#toggle-all-details');
  const themeToggle = document.querySelector('#theme-toggle');
  const visualSettingsToggle = document.querySelector('#visual-settings-toggle');
  const visualSettingsPanel = document.querySelector('#visual-settings');
  const visualSettingsClose = document.querySelector('#visual-settings-close');
  const doneVisualSettings = document.querySelector('#done-visual-settings');
  const resetVisualSettings = document.querySelector('#reset-visual-settings');
  const visualSettingInputs = [...document.querySelectorAll('[data-visual-setting]')];
  const visualPresetButtons = [...document.querySelectorAll('[data-visual-preset]')];
  const filterMenu = document.querySelector('#filter-menu');
  const filterTrigger = document.querySelector('#filter-trigger');
  const filterPopover = document.querySelector('#filter-popover');
  const filterOptions = [...document.querySelectorAll('.filter-popover input[type="checkbox"]')];
  const clearFilters = document.querySelector('#clear-filters');
  const closeFilters = document.querySelector('#close-filters');
  const filterSummary = document.querySelector('#filter-summary');
  const unmatchedDisplayOptions = [...document.querySelectorAll('input[name="unmatched-display"]')];
  const selectedFilters = new Set(filterOptions.filter(option => option.checked).map(option => option.value));
  const filterLabels = new Map(filterOptions.map(option => [option.value, option.parentElement.textContent.trim()]));
  const filterGroups = new Map(filterOptions.map(option => [option.value, option.closest('fieldset').dataset.filterGroup]));
  const compactHeights = new Map();
  const visualStorageKey = 'gitfinder-relationship-visual-settings';
  const unmatchedDisplayStorageKey = 'gitfinder-relationship-unmatched-display';
  const visualDefaults = {
    contextOpacity: 34,
    mutedOpacity: 7,
    mutedSaturation: 12,
    contextEdgeOpacity: 28,
    mutedEdgeOpacity: 4,
    matchHaloOpacity: 30,
    statusTintOpacity: 8,
  };
  const visualPresets = {
    soft: { contextOpacity: 56, mutedOpacity: 20, mutedSaturation: 42, contextEdgeOpacity: 48, mutedEdgeOpacity: 14, matchHaloOpacity: 20, statusTintOpacity: 4 },
    focus: { ...visualDefaults },
    contrast: { contextOpacity: 24, mutedOpacity: 3, mutedSaturation: 0, contextEdgeOpacity: 18, mutedEdgeOpacity: 1, matchHaloOpacity: 44, statusTintOpacity: 13 },
  };
  const visualCssProperties = {
    contextOpacity: '--filter-context-opacity',
    mutedOpacity: '--filter-muted-opacity',
    mutedSaturation: '--filter-muted-saturation',
    contextEdgeOpacity: '--filter-context-edge-opacity',
    mutedEdgeOpacity: '--filter-muted-edge-opacity',
    matchHaloOpacity: '--filter-match-halo-opacity',
    statusTintOpacity: '--status-tint-opacity',
  };
  let currentVisualSettings = { ...visualDefaults };
  let unmatchedDisplayMode = 'dim';
  try {
    const storedMode = window.localStorage.getItem(unmatchedDisplayStorageKey);
    if (storedMode === 'hide') unmatchedDisplayMode = 'hide';
  } catch { /* 原型仍可在无本地存储时工作 */ }
  const laneLayout = {
    repository: { start: 360, gap: 110 },
    deployment: { start: 100, gap: 150 },
    server: { start: 55, gap: 155 },
    endpoint: { start: 80, gap: 110 },
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function attentionMarkup(node) {
    const segments = [];
    if (node.todos > 0) segments.push('<span data-kind="todo" title="有未完成待办"></span>');
    if (node.reminders > 0) segments.push('<span data-kind="reminder" title="有到期提醒"></span>');
    if (node.overdue > 0) segments.push('<span data-kind="overdue" title="有逾期待办"></span>');
    return segments.length ? `<span class="attention-rail" aria-label="关注状态">${segments.join('')}</span>` : '';
  }

  function attentionChips(node) {
    const chips = [];
    if (node.todos > 0) chips.push(`<span class="attention-chip todo">待办 ${node.todos}</span>`);
    if (node.reminders > 0) chips.push(`<span class="attention-chip reminder">提醒 ${node.reminders}</span>`);
    if (node.overdue > 0) chips.push(`<span class="attention-chip overdue">逾期 ${node.overdue}</span>`);
    if (!chips.length) chips.push('<span class="attention-chip neutral">无待办</span>');
    return chips.join('');
  }

  function todoItemsMarkup(node) {
    const items = node.todoItems || [];
    if (!items.length) return '';
    const kindLabels = { todo: '待办', reminder: '提醒', overdue: '逾期' };
    return `
      <section class="todo-section" aria-label="${escapeHtml(node.title)} 的待办与提醒">
        <header><h2>待办与提醒</h2><span>${items.length}</span></header>
        <ul>
          ${items.map(item => `
            <li data-kind="${escapeHtml(item.kind)}">
              <span class="todo-check" aria-hidden="true"></span>
              <span class="todo-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.meta)}</small></span>
              <span class="todo-kind">${escapeHtml(kindLabels[item.kind] || '待办')}</span>
            </li>`).join('')}
        </ul>
      </section>`;
  }

  function renderSpecimen(node) {
    return `
      <article class="specimen" data-type="${escapeHtml(node.type)}" data-status="${escapeHtml(node.status)}">
        <span class="specimen-caption">${escapeHtml(node.caption)}</span>
        <div class="specimen-card">
          ${attentionMarkup(node)}
          <header class="card-header">
            <span class="resource-icon" aria-hidden="true">${escapeHtml(node.icon)}</span>
            <span class="identity"><span>${escapeHtml(node.typeLabel)}</span><strong>${escapeHtml(node.title)}</strong></span>
            <span class="status-pill"><i></i><b>${escapeHtml(node.statusLabel)}</b></span>
          </header>
          <div class="card-summary"><span>${escapeHtml(node.summary)}</span><small>刚刚更新</small></div>
          <div class="attention-row">${attentionChips(node)}</div>
        </div>
      </article>`;
  }

  function renderNode(node) {
    return `
      <article class="overview-card" id="node-${escapeHtml(node.id)}" data-node-id="${escapeHtml(node.id)}" data-type="${escapeHtml(node.type)}" data-status="${escapeHtml(node.status)}" data-mode="compact" style="left:${node.x}px;top:${node.y}px">
        ${attentionMarkup(node)}
        <span class="connection-port input" aria-hidden="true"></span>
        <span class="connection-port output" aria-hidden="true"></span>
        <header class="card-header">
          <span class="resource-icon" aria-hidden="true">${escapeHtml(node.icon)}</span>
          <span class="identity"><span>${escapeHtml(node.typeLabel)}</span><strong>${escapeHtml(node.title)}</strong></span>
          <span class="status-pill"><i></i><b>${escapeHtml(node.statusLabel)}</b></span>
          <button class="expand-button" type="button" data-toggle-node="${escapeHtml(node.id)}" aria-expanded="false" aria-controls="detail-${escapeHtml(node.id)}" title="展开详情">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8"/></svg><span class="sr-only">展开 ${escapeHtml(node.title)} 详情</span>
          </button>
        </header>
        <div class="card-summary"><span>${escapeHtml(node.summary)}</span><small>${escapeHtml(node.updated)}</small></div>
        <div class="attention-row">${attentionChips(node)}</div>
        <div class="detail-clip" id="detail-${escapeHtml(node.id)}" aria-hidden="true">
          <div class="detail-content">
            <section class="metric-grid" aria-label="${escapeHtml(node.title)} 指标">
              ${node.metrics.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}
            </section>
            ${todoItemsMarkup(node)}
            <section class="fact-section">
              <h2>资源详情</h2>
              <dl>${node.facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`).join('')}</dl>
            </section>
            <section class="note-section"><h2>备注</h2><p>${escapeHtml(node.note)}</p></section>
          </div>
        </div>
        <button class="bottom-toggle" type="button" data-toggle-node="${escapeHtml(node.id)}" aria-expanded="false" aria-controls="detail-${escapeHtml(node.id)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8"/></svg><span>展开详情</span></button>
      </article>`;
  }

  function syncToggleAllDetails() {
    const allExpanded = nodes.every(node => document.querySelector(`#node-${CSS.escape(node.id)}`)?.dataset.mode === 'detail');
    toggleAllDetails.textContent = allExpanded ? '收起全部' : '展开全部';
    toggleAllDetails.setAttribute('aria-pressed', String(allExpanded));
  }

  function setNodeMode(id, mode, reflow = true) {
    const card = document.querySelector(`#node-${CSS.escape(id)}`);
    if (!card) return;
    const expanded = mode === 'detail';
    card.dataset.mode = expanded ? 'detail' : 'compact';
    const detail = card.querySelector('.detail-clip');
    detail.setAttribute('aria-hidden', String(!expanded));
    card.querySelectorAll('[data-toggle-node]').forEach(button => {
      button.setAttribute('aria-expanded', String(expanded));
      button.title = expanded ? '收起详情' : '展开详情';
    });
    const bottomLabel = card.querySelector('.bottom-toggle span');
    if (bottomLabel) bottomLabel.textContent = expanded ? '收起详情' : '展开详情';
    if (reflow) reflowGraph();
    syncToggleAllDetails();
  }

  function setAllNodeModes(mode) {
    nodes.forEach(node => setNodeMode(node.id, mode, false));
    reflowGraph();
    syncToggleAllDetails();
  }

  function targetCardHeight(card) {
    const compactHeight = compactHeights.get(card.dataset.nodeId) || card.offsetHeight;
    if (card.dataset.mode !== 'detail') return compactHeight;
    return compactHeight + card.querySelector('.detail-content').scrollHeight;
  }

  function layoutGraph() {
    let canvasBottom = 920;
    Object.entries(laneLayout).forEach(([type, config]) => {
      const cards = [...document.querySelectorAll(`.overview-card[data-type="${type}"]`)]
        .sort((left, right) => Number(left.dataset.order) - Number(right.dataset.order));
      let y = config.start;
      cards.forEach(card => {
        card.style.top = `${y}px`;
        y += targetCardHeight(card) + config.gap;
      });
      canvasBottom = Math.max(canvasBottom, y + 70);
    });
    canvas.style.height = `${canvasBottom}px`;
  }

  function reflowGraph() {
    layoutGraph();
    const startedAt = performance.now();
    const followMovement = now => {
      drawEdges();
      if (now - startedAt < 380) window.requestAnimationFrame(followMovement);
    };
    window.requestAnimationFrame(followMovement);
  }

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function drawEdges() {
    edgeLayer.querySelectorAll('.edge-group').forEach(element => element.remove());
    edges.forEach(([sourceId, targetId, label]) => {
      const source = document.querySelector(`#node-${CSS.escape(sourceId)}`);
      const target = document.querySelector(`#node-${CSS.escape(targetId)}`);
      if (!source || !target) return;
      const canvasRect = canvas.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const x1 = sourceRect.right - canvasRect.left;
      const y1 = sourceRect.top - canvasRect.top + 59;
      const x2 = targetRect.left - canvasRect.left;
      const y2 = targetRect.top - canvasRect.top + 59;
      const bend = Math.max(70, Math.abs(x2 - x1) * 0.46);
      const pathData = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
      const group = svgElement('g', { class: 'edge-group', 'data-source-id': sourceId, 'data-target-id': targetId });
      group.appendChild(svgElement('path', { class: 'edge-hit', d: pathData }));
      group.appendChild(svgElement('path', { class: 'edge-line', d: pathData, 'marker-end': 'url(#edge-arrow)' }));
      const text = svgElement('text', { x: String((x1 + x2) / 2), y: String((y1 + y2) / 2 - 8) });
      text.textContent = label;
      group.appendChild(text);
      edgeLayer.appendChild(group);
    });
    applyFilter();
  }

  function matchesFilter(node, filter) {
    if (filter === 'running') return ['running', 'synced', 'healthy', 'online'].includes(node.status);
    if (filter === 'fault') return ['warning', 'fault', 'error'].includes(node.status);
    if (filter === 'stopped') return ['stopped', 'invalid', 'unknown'].includes(node.status);
    if (filter === 'todo') return node.todos > 0;
    if (filter === 'reminder') return node.reminders > 0;
    if (filter === 'overdue') return node.overdue > 0;
    if (filter === 'no-todo') return node.todos === 0 && node.reminders === 0 && node.overdue === 0;
    return node.type === filter;
  }

  function matchesSelectedFilters(node) {
    const grouped = new Map();
    selectedFilters.forEach(filter => {
      const group = filterGroups.get(filter);
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(filter);
    });
    return [...grouped.values()].every(filters => filters.some(filter => matchesFilter(node, filter)));
  }

  function updateFilterTrigger() {
    const labels = [...selectedFilters].map(filter => filterLabels.get(filter));
    filterTrigger.textContent = labels.length === 0
      ? '全部资源'
      : labels.length === 1
        ? labels[0]
        : `${labels[0]} +${labels.length - 1}`;
    filterTrigger.classList.toggle('has-filters', labels.length > 0);
  }

  function setFilterMenuOpen(open) {
    filterMenu.classList.toggle('is-open', open);
    filterPopover.hidden = !open;
    filterTrigger.setAttribute('aria-expanded', String(open));
  }

  function setUnmatchedDisplayMode(mode, persist = true) {
    unmatchedDisplayMode = mode === 'hide' ? 'hide' : 'dim';
    canvas.dataset.unmatchedMode = unmatchedDisplayMode;
    unmatchedDisplayOptions.forEach(option => { option.checked = option.value === unmatchedDisplayMode; });
    if (persist) {
      try { window.localStorage.setItem(unmatchedDisplayStorageKey, unmatchedDisplayMode); } catch { /* 原型仍可在无本地存储时工作 */ }
    }
    applyFilter();
  }

  function normalizeVisualSettings(settings) {
    return Object.fromEntries(visualSettingInputs.map(input => {
      const key = input.dataset.visualSetting;
      const fallback = visualDefaults[key];
      const value = Number(settings?.[key]);
      const normalized = Number.isFinite(value) ? Math.min(Number(input.max), Math.max(Number(input.min), value)) : fallback;
      return [key, normalized];
    }));
  }

  function matchingPreset(settings) {
    return Object.entries(visualPresets).find(([, preset]) =>
      Object.keys(visualDefaults).every(key => preset[key] === settings[key]))?.[0];
  }

  function applyVisualSettings(settings, persist = true) {
    currentVisualSettings = normalizeVisualSettings(settings);
    Object.entries(currentVisualSettings).forEach(([key, value]) => {
      document.documentElement.style.setProperty(visualCssProperties[key], String(value / 100));
      const input = document.querySelector(`[data-visual-setting="${key}"]`);
      if (!input) return;
      input.value = String(value);
      input.setAttribute('aria-valuetext', `${value}%`);
      const output = document.querySelector(`output[for="${input.id}"]`);
      if (output) output.textContent = `${value}%`;
    });
    const presetName = matchingPreset(currentVisualSettings);
    visualPresetButtons.forEach(button => button.classList.toggle('active', button.dataset.visualPreset === presetName));
    if (persist) {
      try { window.localStorage.setItem(visualStorageKey, JSON.stringify(currentVisualSettings)); } catch { /* 原型仍可在无本地存储时工作 */ }
    }
  }

  function loadVisualSettings() {
    try { return normalizeVisualSettings(JSON.parse(window.localStorage.getItem(visualStorageKey) || 'null')); }
    catch { return { ...visualDefaults }; }
  }

  function setVisualSettingsOpen(open) {
    visualSettingsPanel.hidden = !open;
    visualSettingsToggle.setAttribute('aria-expanded', String(open));
    if (open) visualSettingsClose.focus({ preventScroll: true });
    else visualSettingsToggle.focus({ preventScroll: true });
  }

  function applyFilter() {
    const active = selectedFilters.size > 0;
    const matches = new Set(nodes.filter(matchesSelectedFilters).map(node => node.id));
    const context = new Set();
    if (active) {
      edges.forEach(([sourceId, targetId]) => {
        if (matches.has(sourceId) && !matches.has(targetId)) context.add(targetId);
        if (matches.has(targetId) && !matches.has(sourceId)) context.add(sourceId);
      });
    }

    canvas.dataset.filterActive = String(active);
    nodes.forEach(node => {
      const card = document.querySelector(`#node-${CSS.escape(node.id)}`);
      const hiddenByFilter = active && unmatchedDisplayMode === 'hide' && !matches.has(node.id);
      card.classList.toggle('filter-match', active && matches.has(node.id));
      card.classList.toggle('filter-context', active && !matches.has(node.id) && context.has(node.id));
      card.classList.toggle('filter-muted', active && !matches.has(node.id) && !context.has(node.id));
      card.setAttribute('aria-hidden', String(hiddenByFilter));
    });

    edgeLayer.querySelectorAll('.edge-group').forEach(group => {
      const sourceMatch = matches.has(group.dataset.sourceId);
      const targetMatch = matches.has(group.dataset.targetId);
      const sourceContext = context.has(group.dataset.sourceId);
      const targetContext = context.has(group.dataset.targetId);
      group.classList.toggle('filter-match', active && sourceMatch && targetMatch);
      group.classList.toggle('filter-context', active && (sourceMatch || targetMatch || sourceContext || targetContext) && !(sourceMatch && targetMatch));
      group.classList.toggle('filter-muted', active && !sourceMatch && !targetMatch && !sourceContext && !targetContext);
    });

    updateFilterTrigger();
    filterSummary.textContent = active
      ? unmatchedDisplayMode === 'hide'
        ? `${selectedFilters.size} 条件 · 命中 ${matches.size} · 隐藏 ${nodes.length - matches.size}`
        : `${selectedFilters.size} 条件 · 命中 ${matches.size} · 关联 ${context.size}`
      : `全部 ${nodes.length}`;
  }

  specimenGrid.innerHTML = specimens.map(renderSpecimen).join('');
  nodeLayer.innerHTML = nodes.map(renderNode).join('');
  nodes.forEach((node, order) => {
    const card = document.querySelector(`#node-${CSS.escape(node.id)}`);
    card.dataset.order = String(order);
    compactHeights.set(node.id, card.offsetHeight);
  });
  nodeLayer.addEventListener('click', event => {
    const button = event.target.closest('[data-toggle-node]');
    if (!button) return;
    const card = button.closest('.overview-card');
    setNodeMode(button.dataset.toggleNode, card.dataset.mode === 'detail' ? 'compact' : 'detail');
  });
  toggleAllDetails.addEventListener('click', () => {
    const allExpanded = nodes.every(node => document.querySelector(`#node-${CSS.escape(node.id)}`).dataset.mode === 'detail');
    setAllNodeModes(allExpanded ? 'compact' : 'detail');
  });
  themeToggle.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    themeToggle.setAttribute('aria-pressed', String(dark));
  });
  visualSettingsToggle.addEventListener('click', () => setVisualSettingsOpen(visualSettingsPanel.hidden));
  visualSettingsClose.addEventListener('click', () => setVisualSettingsOpen(false));
  doneVisualSettings.addEventListener('click', () => setVisualSettingsOpen(false));
  resetVisualSettings.addEventListener('click', () => applyVisualSettings(visualDefaults));
  visualSettingInputs.forEach(input => input.addEventListener('input', () => {
    applyVisualSettings({ ...currentVisualSettings, [input.dataset.visualSetting]: Number(input.value) });
  }));
  visualPresetButtons.forEach(button => button.addEventListener('click', () => {
    applyVisualSettings(visualPresets[button.dataset.visualPreset]);
  }));
  filterOptions.forEach(option => option.addEventListener('change', () => {
    if (option.checked) selectedFilters.add(option.value);
    else selectedFilters.delete(option.value);
    applyFilter();
  }));
  unmatchedDisplayOptions.forEach(option => option.addEventListener('change', () => {
    if (option.checked) setUnmatchedDisplayMode(option.value);
  }));
  clearFilters.addEventListener('click', () => {
    filterOptions.forEach(option => { option.checked = false; });
    selectedFilters.clear();
    applyFilter();
  });
  filterTrigger.addEventListener('click', () => setFilterMenuOpen(filterPopover.hidden));
  closeFilters.addEventListener('click', () => setFilterMenuOpen(false));
  document.addEventListener('click', event => {
    if (!filterPopover.hidden && !filterMenu.contains(event.target)) setFilterMenuOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setFilterMenuOpen(false);
      if (!visualSettingsPanel.hidden) setVisualSettingsOpen(false);
    }
  });
  window.addEventListener('resize', reflowGraph);
  new ResizeObserver(drawEdges).observe(canvas);
  applyVisualSettings(loadVisualSettings(), false);
  setUnmatchedDisplayMode(unmatchedDisplayMode, false);
  syncToggleAllDetails();
  reflowGraph();
})();
