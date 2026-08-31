(function exposeRelationshipBoardController(root, factory) {
  const projection = root?.PanelTopologyProjection
    || (typeof module !== 'undefined' && module.exports ? require('../../shared/panelTopologyProjection') : null);
  const scanner = root?.RepositoryRootScanner
    || (typeof module !== 'undefined' && module.exports ? require('./repositoryRootScanner') : null);
  const api = factory(root?.RelationshipGraphModel, projection, scanner);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipBoardController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipBoardController(Model, PanelTopologyProjection, RepositoryRootScanner) {
  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 143;
  const COMPACT_NODE_WIDTH = 236;
  const COMPACT_NODE_HEIGHT = 94;
  const GROUP_PADDING_X = 28;
  const GROUP_HEADER_HEIGHT = 54;
  const GROUP_PADDING_BOTTOM = 28;
  const GROUP_MIN_WIDTH = 320;
  const GROUP_MIN_HEIGHT = 180;
  const GRID_SIZE = 24;
  const HISTORY_LIMIT = 50;
  const PANEL_REFRESH_INTERVAL_MS = 30_000;
  const PANEL_STALE_AFTER_MS = 90_000;

  function toolbarIcon(name) {
    const paths = {
      display: 'M3 4h18v13H3zM8 21h8M12 17v4',
      filter: 'M3 4h18l-7 8v7l-4 2v-9z',
      add: 'M12 4v16M4 12h16',
      fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
      layout: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
      group: 'M3 3h18v18H3zM7 8h4v8H7zM15 8h2v8h-2z',
      expand: 'M5 9l7-6 7 6M5 15l7 6 7-6',
      collapse: 'M5 3l7 6 7-6M5 21l7-6 7 6'
    };
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
  }

  function edgePanVelocity(point, rect, reducedMotion = false) {
    if (!rect?.width || !rect?.height || point.x < rect.left || point.x > rect.left + rect.width
      || point.y < rect.top || point.y > rect.top + rect.height) return { x: 0, y: 0 };
    const speed = reducedMotion ? 280 : 560;
    const axis = (position, start, length) => {
      const margin = Math.min(56, length / 4);
      const near = position - start;
      const far = start + length - position;
      return near < margin ? -speed * (1 - near / margin) ** 2
        : far < margin ? speed * (1 - far / margin) ** 2 : 0;
    };
    return { x: axis(point.x, rect.left, rect.width), y: axis(point.y, rect.top, rect.height) };
  }
  const TYPE_LABELS = Object.freeze({
    server: '主机',
    deployment: '部署',
    project: '项目',
    repository: 'Git 仓库',
    endpoint: '访问点',
    group: '分组', text: '文字', image: '图片', attachment: '文件附件'
  });
  const TYPE_ICONS = Object.freeze({
    server: '▰',
    deployment: '◆',
    project: '▣',
    repository: '⑂',
    endpoint: '↗',
    group: '▢', text: 'T', image: '▧', attachment: '▱'
  });
  const RESOURCE_CATEGORY_DEFINITIONS = Object.freeze([
    Object.freeze({ id: 'whiteboard', label: '白板文件', icon: '▧' }),
    Object.freeze({ id: 'project', label: '项目', icon: TYPE_ICONS.project }),
    Object.freeze({ id: 'repository', label: '仓库', icon: TYPE_ICONS.repository }),
    Object.freeze({ id: 'server', label: '主机', icon: TYPE_ICONS.server }),
    Object.freeze({ id: 'deployment', label: '站点与部署', icon: TYPE_ICONS.deployment }),
    Object.freeze({ id: 'endpoint', label: '访问端点', icon: TYPE_ICONS.endpoint }),
    Object.freeze({ id: 'other', label: '其他', icon: '•••' })
  ]);
  const RELATIONSHIP_LABELS = Object.freeze({
    contains: '包含',
    belongs_to: '属于',
    source_of: '部署来源',
    deployed_from: '从仓库部署',
    runs_on: '运行于',
    hosts: '托管运行',
    exposes: '对外提供',
    exposed_by: '由部署提供',
    depends_on: '依赖',
    required_by: '被依赖',
    forked_from: 'Fork 来源于',
    fork_source_for: '作为 Fork 源',
    mirrors: '镜像',
    submodule_of: '作为子模块',
    has_submodule: '包含子模块',
    connects_to: '连接到',
    related_to: '关联'
  });
  const INVERSE_RELATIONSHIP_TYPES = Object.freeze({
    contains: 'belongs_to',
    belongs_to: 'contains',
    source_of: 'deployed_from',
    deployed_from: 'source_of',
    runs_on: 'hosts',
    hosts: 'runs_on',
    exposes: 'exposed_by',
    exposed_by: 'exposes',
    depends_on: 'required_by',
    required_by: 'depends_on',
    forked_from: 'fork_source_for',
    fork_source_for: 'forked_from',
    mirrors: 'mirrors',
    submodule_of: 'has_submodule',
    has_submodule: 'submodule_of',
    connects_to: 'connects_to',
    related_to: 'related_to'
  });
  const RELATIONSHIP_PRESET_GROUPS = Object.freeze([
    Object.freeze({
      label: '项目与部署',
      types: Object.freeze(['contains', 'belongs_to', 'source_of', 'deployed_from', 'runs_on', 'hosts', 'exposes', 'exposed_by'])
    }),
    Object.freeze({
      label: '依赖',
      types: Object.freeze(['depends_on', 'required_by'])
    }),
    Object.freeze({
      label: 'Git 仓库',
      types: Object.freeze(['forked_from', 'fork_source_for', 'mirrors', 'submodule_of', 'has_submodule'])
    }),
    Object.freeze({
      label: '通用',
      types: Object.freeze(['connects_to', 'related_to'])
    })
  ]);
  const FACT_SOURCE_LABELS = Object.freeze({
    manual: '人工声明',
    imported: '外部导入',
    observed: '只读观测',
    'gitfinder-registry': 'GitFinder 注册表'
  });
  const VERIFICATION_LABELS = Object.freeze({
    all: '全部状态',
    unverified: '待验证',
    verified: '已验证',
    stale: '待复核'
  });
  const DETAIL_FIELD_DEFINITIONS = Object.freeze({
    server: [
      { key: 'environment', label: '环境', maxLength: 240 },
      { key: 'hostLabel', label: '主机标签', maxLength: 240 },
      { key: 'notes', label: '备注', maxLength: 1000, multiline: true }
    ],
    deployment: [
      { key: 'environment', label: '环境', maxLength: 240 },
      { key: 'version', label: '版本', maxLength: 240 },
      { key: 'branch', label: '分支', maxLength: 240 },
      { key: 'revision', label: '提交', maxLength: 240 },
      { key: 'status', label: '声明状态', maxLength: 240 },
      { key: 'notes', label: '备注', maxLength: 1000, multiline: true }
    ],
    endpoint: [
      { key: 'urlLabel', label: '地址标签', maxLength: 240 },
      { key: 'notes', label: '备注', maxLength: 1000, multiline: true }
    ],
    group: [{ key: 'notes', label: '备注', maxLength: 1000, multiline: true }]
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizePlacementAnnotations(value = {}) {
    const titleMode = Model.PLACEMENT_TITLE_MODES.includes(value.titleMode) ? value.titleMode : 'original';
    const titleText = Model.cleanText(value.titleText, 160);
    const titleSource = Model.PLACEMENT_TITLE_SOURCES.includes(value.titleSource) ? value.titleSource : 'inherit';
    const statusVisibility = Model.PLACEMENT_STATUS_VISIBILITIES.includes(value.statusVisibility) ? value.statusVisibility : 'inherit';
    const labelMap = new Map();
    for (const rawLabel of Array.isArray(value.labels) ? value.labels : []) {
      const label = Model.cleanText(rawLabel, 24);
      const key = label.toLocaleLowerCase('zh-CN');
      if (label && !labelMap.has(key)) labelMap.set(key, label);
    }
    const labels = [...labelMap.values()].slice(0, 6);
    const note = Model.cleanText(value.note, 1000);
    const todos = (Array.isArray(value.todos) ? value.todos : []).slice(0, 20).map(todo => {
      const id = String(todo?.id || '');
      const title = Model.cleanText(todo?.title, 160);
      if (!/^todo_[a-zA-Z0-9_-]{1,220}$/.test(id) || !title) return null;
      const dueAt = todo?.dueAt ? localDateTimeToIso(todo.dueAt) : '';
      const reminderAt = todo?.reminderAt ? localDateTimeToIso(todo.reminderAt) : '';
      return {
        id,
        title,
        completed: todo?.completed === true,
        ...(dueAt ? { dueAt } : {}),
        ...(reminderAt ? { reminderAt } : {})
      };
    }).filter(Boolean);
    return {
      ...(titleText ? { titleMode, titleText } : {}),
      ...(titleSource !== 'inherit' ? { titleSource } : {}),
      ...(statusVisibility !== 'inherit' ? { statusVisibility } : {}),
      ...(labels.length ? { labels } : {}),
      ...(note ? { note } : {}),
      ...(todos.length ? { todos } : {}),
      ...(['auto', 'manual'].includes(value.groupLayout) ? { groupLayout: value.groupLayout } : {}),
      ...(Number.isFinite(Number(value.groupWidth)) && Number(value.groupWidth) >= GROUP_MIN_WIDTH ? { groupWidth: Math.min(100000, Math.round(Number(value.groupWidth))) } : {}),
      ...(Number.isFinite(Number(value.groupHeight)) && Number(value.groupHeight) >= GROUP_MIN_HEIGHT ? { groupHeight: Math.min(100000, Math.round(Number(value.groupHeight))) } : {}),
      ...(value.locked === true ? { locked: true } : {}), ...(value.expanded === true ? { expanded: true } : {})
    };
  }

  function resolveMagneticSnap(options = {}) {
    const mode = options.mode || 'smart';
    const moving = options.movingBounds || {};
    const gridSize = Number(options.gridSize) || GRID_SIZE;
    const threshold = Number(options.threshold) || 8;
    if (mode === 'off') return { dx: 0, dy: 0, guides: [] };
    if (mode === 'grid') {
      const dx = Math.round((Number(moving.left) || 0) / gridSize) * gridSize - (Number(moving.left) || 0);
      const dy = Math.round((Number(moving.top) || 0) / gridSize) * gridSize - (Number(moving.top) || 0);
      return {
        dx,
        dy,
        guides: [
          { axis: 'x', position: (Number(moving.left) || 0) + dx, kind: 'grid' },
          { axis: 'y', position: (Number(moving.top) || 0) + dy, kind: 'grid' }
        ]
      };
    }
    const axes = [
      ['x', ['left', 'centerX', 'right']],
      ['y', ['top', 'centerY', 'bottom']]
    ];
    const result = { dx: 0, dy: 0, guides: [] };
    for (const [axis, keys] of axes) {
      let best = null;
      for (const movingKey of keys) {
        const movingValue = Number(moving[movingKey]);
        if (!Number.isFinite(movingValue)) continue;
        for (const bounds of options.stationaryBounds || []) {
          for (const stationaryKey of keys) {
            const stationaryValue = Number(bounds?.[stationaryKey]);
            if (!Number.isFinite(stationaryValue)) continue;
            const delta = stationaryValue - movingValue;
            if (Math.abs(delta) > threshold || (best && Math.abs(delta) >= Math.abs(best.delta))) continue;
            best = { delta, position: stationaryValue };
          }
        }
      }
      if (best) {
        if (axis === 'x') result.dx = best.delta;
        else result.dy = best.delta;
        result.guides.push({ axis, position: best.position, kind: 'node' });
      }
    }
    return result;
  }

  function normalizeDynamicLayoutStore(value) {
    const normalized = { version: 1, boards: {} };
    if (!value || value.version !== 1 || !value.boards || typeof value.boards !== 'object') return normalized;
    const boardEntries = Object.entries(value.boards).slice(0, 32);
    for (const [boardId, placements] of boardEntries) {
      if (!/^board_[a-zA-Z0-9_-]{1,220}$/.test(boardId) || !placements || typeof placements !== 'object') continue;
      const boardLayout = {};
      for (const [entityId, placement] of Object.entries(placements).slice(0, 2000)) {
        if (!/^entity_[a-zA-Z0-9_-]{1,220}$/.test(entityId)) continue;
        const x = Number(placement?.x);
        const y = Number(placement?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000) continue;
        boardLayout[entityId] = {
          x: Math.round(x),
          y: Math.round(y),
          ...(placement.dissolved === true ? { dissolved: true } : {}),
          ...(/^entity_[a-zA-Z0-9_-]{1,220}$/.test(placement.groupId || '') ? { groupId: placement.groupId } : {}),
          ...normalizePlacementAnnotations(placement)
        };
      }
      if (Object.keys(boardLayout).length) normalized.boards[boardId] = boardLayout;
    }
    return normalized;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function makeId(prefix) {
    const random = globalThis.crypto?.randomUUID?.().replaceAll('-', '')
      || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
    return `${prefix}_${random}`;
  }

  function escapeSelectorValue(value) {
    if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value || ''));
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, character => `\\${character.codePointAt(0).toString(16)} `);
  }

  function activeBoard(store) {
    return store.boards.find(board => board.id === store.activeBoardId) || store.boards[0] || null;
  }

  function dateTimeLocalValue(value) {
    const date = new Date(value || '');
    if (!Number.isFinite(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function localDateTimeToIso(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    const date = new Date(input);
    if (!Number.isFinite(date.getTime())) throw new Error('验证时间无效');
    return date.toISOString();
  }

  function sameLocalDay(left, right) {
    const a = new Date(left);
    const b = new Date(right);
    return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())
      && a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  class Controller {
    constructor(options = {}) {
      if (!Model) throw new Error('RelationshipGraphModel 未加载');
      this.bridge = options.bridge;
      this.notify = options.notify || (() => {});
      this.onSummaryChanged = options.onSummaryChanged || (() => {});
      this.onOpenDirectory = options.onOpenDirectory;
      this.repositoryScanning = false;
      this.store = null;
      this.resources = [];
      this.resourceMap = new Map();
      this.container = null;
      this.root = null;
      this.loaded = false;
      this.loadingPromise = null;
      this.resourceLoadingPromise = null;
      this.undoStack = [];
      this.redoStack = [];
      this.selectedEntityId = '';
      this.selectedEntityIds = new Set();
      this.selectedRelationshipId = '';
      this.expandedCardIds = new Set();
      this.cardHeights = new Map();
      this.minimapNodes = [];
      this.minimapCollapsed = false;
      this.panelLayout = {};
      this.panelSidebarRoot = null;
      this._panelEvents = {
        click: event => this._handleClick(event), input: event => this._handleInput(event),
        change: event => this._handleChange(event), submit: event => this._handleSubmit(event),
        dragstart: event => this._handleDragStart(event), dragover: event => this._handleDragOver(event),
        drop: event => this._handleDrop(event), dragend: () => this._clearPanelDrag()
      };
      this.inspectorPinned = false;
      this.keyboardConnectSourceId = '';
      this.pointerAction = null;
      this.suppressedGroupToolbarId = '';
      this.edgePanFrame = null;
      this.edgePanLastTime = null;
      this.suppressNextNodeClick = false;
      this.saveTimer = null;
      this.saveChain = Promise.resolve();
      this.saveState = 'saved';
      this.resourceSearch = '';
      this.displayLayoutEdit = null;
      this.spacePan = false;
      this.resourcePanelVisible = true;
      this.resourcePanelPosition = { x: 12, y: 12 };
      this.collapsedResourceSections = new Set(['repository', 'server', 'deployment', 'endpoint', 'other']);
      this.importInFlight = false;
      this.exportInFlight = false;
      this.documentRecord = null;
      this.documentLibrary = [];
      this.openDocumentIds = new Set();
      this.localWorkspace = null;
      this.documentBusy = false;
      this.panelTopologyResult = { state: 'unconfigured', topology: { servers: [], deployments: [] }, bindings: [] };
      this.panelProjection = { entities: [], relationships: [], placements: [], metadata: { state: 'unconfigured' } };
      this.panelProjects = [];
      this.panelRepositories = [];
      this.repositoryAssociations = [];
      this.repositoryAssociationSaving = false;
      this.repositoryScanSummary = '';
      this.repositoryAssociationRevision = 0;
      this.panelRefreshTimer = null;
      this.panelRefreshInFlight = false;
      this.endpointCheckTimer = null;
      this.endpointCheckRequest = null;
      this.endpointChecksPending = 0;
      this.panelLastError = '';
      this.dynamicLayoutStore = { version: 1, boards: {} };
      this.dynamicLayoutSaveTimer = null;
      this.reminderTimer = null;
      this.remindedTodoKeys = new Set();
      this.openRequestId = 0;
      this.wheelPan = null;
      this.wheelPanFrame = null;
      this.documentAssets = new Map();
      this.now = options.now || (() => new Date());
      this._boundKeydown = event => this._handleKeydown(event);
      this._boundKeyup = event => {
        if (event.code === 'Space' || event.key === ' ') {
          this.spacePan = false;
          this.root?.classList?.remove('pan-ready');
        }
      };
      this._boundBlur = () => {
        this._stopWheelPan();
        this._closeContextMenu();
        this.spacePan = false;
        this.root?.classList?.remove('pan-ready', 'box-selecting');
        if (['box', 'node', 'resize', 'group-resize', 'pan'].includes(this.pointerAction?.type)) this._cancelPointerAction(false);
      };
      this._boundResize = () => { this._closeContextMenu(); this._applyResourcePanelPosition(); this._applyViewport(); };
      this._boundContextDismiss = event => {
        if (!event.target.closest?.('.relationship-context-menu')) this._closeContextMenu();
      };
    }

    async open(container, options = {}) {
      if (!container) return;
      if (this.container === container && this.root?.isConnected) return;
      const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
      this.close({ preserveContainer: true });
      const openRequestId = ++this.openRequestId;
      this.container = container;
      container.innerHTML = '<div class="relationship-loading"><div class="loading-spinner"></div><span>正在载入关系白板…</span></div>';
      try {
        await this._load();
        if (openRequestId !== this.openRequestId || this.container !== container || !isCurrent()) return;
        if (!this.store.boards.length) {
          const boardId = makeId('board');
          this.store.boards.push({
            id: boardId,
            name: '部署关系',
            viewport: { x: 120, y: 90, zoom: 1 },
            view: { ...Model.defaultBoardView(), topologyLayout: 'coolify-projects' },
            placements: []
          });
          this.store.activeBoardId = boardId;
          await this._persistNow();
          if (openRequestId !== this.openRequestId || this.container !== container || !isCurrent()) return;
        }
        this.render();
        if (this.bridge?.panel?.getTopology) this._refreshPanelTopology();
        else this._schedulePanelRefresh();
        document.addEventListener('keydown', this._boundKeydown, true);
        document.addEventListener('keyup', this._boundKeyup, true);
        document.addEventListener('pointerdown', this._boundContextDismiss, true);
        globalThis.window?.addEventListener('blur', this._boundBlur);
        globalThis.window?.addEventListener('resize', this._boundResize);
      } catch (error) {
        if (openRequestId !== this.openRequestId || this.container !== container || !isCurrent()) return;
        container.innerHTML = `
          <div class="relationship-error" role="alert">
            <strong>关系白板无法载入</strong>
            <span>${escapeHtml(error?.message || String(error))}</span>
            <button class="btn" data-relationship-retry type="button">重新载入</button>
          </div>`;
        container.querySelector('[data-relationship-retry]')?.addEventListener('click', () => {
          this.loaded = false;
          this.loadingPromise = null;
          this.open(container);
        });
      }
    }

    close(options = {}) {
      this._stopWheelPan();
      this.spacePan = false;
      this.displayLayoutEdit = null;
      this.openRequestId += 1;
      clearTimeout(this.endpointCheckTimer);
      this.endpointCheckTimer = null;
      this.endpointCheckRequest = null;
      document.removeEventListener('keydown', this._boundKeydown, true);
      document.removeEventListener('keyup', this._boundKeyup, true);
      document.removeEventListener('pointerdown', this._boundContextDismiss, true);
      this._closeContextMenu();
      globalThis.window?.removeEventListener('blur', this._boundBlur);
      globalThis.window?.removeEventListener('resize', this._boundResize);
      this._cancelPointerAction(true);
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
        if (this.store) this._persistNow();
      }
      if (this.panelRefreshTimer) {
        clearTimeout(this.panelRefreshTimer);
        this.panelRefreshTimer = null;
      }
      if (this.dynamicLayoutSaveTimer) {
        clearTimeout(this.dynamicLayoutSaveTimer);
        this.dynamicLayoutSaveTimer = null;
        this._persistDynamicLayoutsNow();
      }
      if (this.reminderTimer) {
        clearTimeout(this.reminderTimer);
        this.reminderTimer = null;
      }
      if (this.panelSidebarRoot) {
        for (const [type, handler] of Object.entries(this._panelEvents)) this.panelSidebarRoot.removeEventListener(type, handler);
        this.panelSidebarRoot.replaceChildren();
        this.panelSidebarRoot.closest('#relationship-resource-sidebar-section').hidden = true;
        this.panelSidebarRoot = null;
      }
      this.root = null;
      if (!options.preserveContainer) this.container = null;
    }

    async _load() {
      if (this.loaded) return;
      if (this.loadingPromise) return this.loadingPromise;
      const projectsPromise = this.bridge.localProjects.list().catch(() => []);
      this.loadingPromise = Promise.all([
        this.bridge.relationshipBoards.get(),
        this.bridge.repos.getRegistry().catch(() => ({ repos: [] })),
        this.bridge.config?.get
          ? this.bridge.config.get('relationshipDynamicLayouts').catch(() => null)
          : Promise.resolve(null),
        this.bridge.config?.get ? this.bridge.config.get('relationshipPanelLayout').catch(() => null) : Promise.resolve(null)
      ]).then(([result, registry, dynamicLayouts, panelLayout]) => {
        this.store = Model.normalizeStore(result?.store).value;
        this.dynamicLayoutStore = normalizeDynamicLayoutStore(dynamicLayouts);
        this.panelLayout = {};
        for (const [id, value] of Object.entries(panelLayout || {}).slice(0, 100)) {
          if (id !== 'library' && id !== 'inspector' && !id.startsWith('resource:')) continue;
          if (!value || !['left', 'right'].includes(value.side)) continue;
          this.panelLayout[id] = { side: value.side, collapsed: value.collapsed === true, detached: value.detached === true, order: Number(value.order) || 0 };
          if (id.startsWith('resource:')) {
            if (value.collapsed) this.collapsedResourceSections.add(id.slice(9));
            else this.collapsedResourceSections.delete(id.slice(9));
          }
        }
        this.resourcePanelVisible = !this.panelLayout.library?.collapsed;
        this.panelRepositories = Array.isArray(registry?.repos) ? registry.repos : [];
        this._setResources([], this.panelRepositories);
        this._setPanelTopology(this.panelTopologyResult);
        this.loaded = true;
        this.expandedCardIds = new Set((activeBoard(this.store)?.placements || []).filter(item => item.expanded).map(item => item.entityId));
        void this._refreshDocumentLibrary();
        this.resourceLoadingPromise = projectsPromise.then(async projects => {
          this.panelProjects = Array.isArray(projects) ? projects : [];
          this._setResources(this.panelProjects, this.panelRepositories);
          this.panelTopologyResult = await this._topologyWithProjectBindings(this.panelTopologyResult);
          this._setPanelTopology(this.panelTopologyResult);
          if (this.root?.isConnected) {
            this.render();
            this._schedulePanelRefresh();
          }
        }).finally(() => {
          this.resourceLoadingPromise = null;
        });
        if (result?.recovered) {
          const suffix = result.backupPath ? '；原文件已备份' : '';
          this.notify(`关系白板已从异常配置中恢复${suffix}`, 'warning');
        }
      }).finally(() => {
        this.loadingPromise = null;
      });
      return this.loadingPromise;
    }

    async _topologyWithProjectBindings(result = {}) {
      if (result?.state !== 'ready' || !this.bridge.panel?.getProjectBindings || !this.panelProjects.length) {
        return result;
      }
      const bindingResults = await Promise.all(this.panelProjects.map(project => (
        this.bridge.panel.getProjectBindings(project.path).catch(() => ({ bindings: [] }))
      )));
      return {
        ...result,
        bindings: bindingResults.flatMap(entry => entry?.bindings || [])
      };
    }

    _dynamicLayoutForActiveBoard() {
      const boardId = activeBoard(this.store)?.id;
      if (!boardId) return null;
      this.dynamicLayoutStore = normalizeDynamicLayoutStore(this.dynamicLayoutStore);
      this.dynamicLayoutStore.boards[boardId] ||= {};
      return this.dynamicLayoutStore.boards[boardId];
    }

    _applyDynamicLayoutOverrides() {
      if (this.documentRecord) return;
      const boardLayout = this._dynamicLayoutForActiveBoard();
      if (!boardLayout || !this.panelProjection?.placements) return;
      // Dissolve only local visual frames; live deployments/hosts are never deleted.
      const dissolved = new Set(this.panelProjection.entities
        .filter(item => item.type === 'group' && item.transient && boardLayout[item.id]?.dissolved)
        .map(item => item.id));
      this.panelProjection.entities = this.panelProjection.entities.filter(item => !dissolved.has(item.id));
      this.panelProjection.placements = this.panelProjection.placements.filter(item => !dissolved.has(item.entityId));
      const groupIds = new Set(this._combinedEntities().filter(item => item.type === 'group').map(item => item.id));
      const placedIds = new Set(this._combinedPlacements().map(item => item.entityId));
      this.panelProjection.placements = this.panelProjection.placements.map(placement => {
        const override = boardLayout[placement.entityId];
        if (override?.expanded) this.expandedCardIds.add(placement.entityId);
        const groupId = override ? override.groupId : placement.groupId;
        const validGroup = groupId && placedIds.has(groupId) && groupIds.has(groupId);
        delete placement.groupId;
        return override ? {
          ...placement,
          x: override.x,
          y: override.y,
          ...normalizePlacementAnnotations(override),
          ...(validGroup ? { groupId } : {}),
          userPositioned: true
        } : { ...placement, ...(validGroup ? { groupId } : {}) };
      });
    }

    _persistDynamicLayoutsNow() {
      if (!this.bridge?.config?.set) return Promise.resolve(false);
      this.dynamicLayoutStore = normalizeDynamicLayoutStore(this.dynamicLayoutStore);
      return this.bridge.config.set('relationshipDynamicLayouts', clone(this.dynamicLayoutStore))
        .then(() => true)
        .catch(error => {
          this.notify(`动态布局保存失败：${error?.message || String(error)}`, 'error');
          return false;
        });
    }

    _persistDynamicLayoutsSoon(delay = 160) {
      if (this.dynamicLayoutSaveTimer) clearTimeout(this.dynamicLayoutSaveTimer);
      this.dynamicLayoutSaveTimer = setTimeout(() => {
        this.dynamicLayoutSaveTimer = null;
        this._persistDynamicLayoutsNow();
      }, delay);
    }

    _saveDynamicPlacementOverrides(entityIds) {
      if (this.documentRecord) return false;
      const boardLayout = this._dynamicLayoutForActiveBoard();
      if (!boardLayout) return false;
      let changed = false;
      const ids = new Set(entityIds || []);
      for (const placement of this.panelProjection?.placements || []) {
        if (!placement.dynamic || !ids.has(placement.entityId)) continue;
        boardLayout[placement.entityId] = {
          x: Math.round(placement.x),
          y: Math.round(placement.y),
          ...(placement.groupId ? { groupId: placement.groupId } : {}),
          ...normalizePlacementAnnotations(placement)
        };
        placement.userPositioned = true;
        changed = true;
      }
      if (changed) this._persistDynamicLayoutsSoon();
      return changed;
    }

    _resetDynamicLayout() {
      if (!activeBoard(this.store)) return false;
      this._recordMutation();
      this._packCurrentLayout();
      this._renderGraph();
      this.fitContent({ minZoom: 0.25 });
      this._refreshHistoryButtons();
      this.notify('已按拓扑与原有位置整理，保留群组归属和组内相对位置', 'success');
      return true;
    }

    _packCurrentLayout(dynamicOnly = false) {
      const allPlacements = this._combinedPlacements();
      const placements = dynamicOnly ? allPlacements.filter(item => item.dynamic) : allPlacements;
      const geometry = this._displayGeometryMap(placements);
      const byId = new Map(placements.map(item => [item.entityId, item]));
      const roots = this._orderedLayoutItems(placements.filter(item => !byId.has(item.groupId)), placements);
      const bounds = roots.map(item => this._placementGeometry(item, placements, new Set(), geometry));
      const canvas = this.root?.querySelector('.relationship-canvas');
      const positions = PanelTopologyProjection.packRegions(bounds, canvas?.clientWidth / canvas?.clientHeight || 1.6);
      const fixed = dynamicOnly ? allPlacements.filter(item => !item.dynamic) : [];
      const offsetX = fixed.length ? Math.max(...fixed.map(item => item.x + this._nodeDimensions().width)) + 64 : 0;
      placements.forEach(item => {
        let root = item;
        const visited = new Set();
        while (byId.has(root.groupId) && !visited.has(root.groupId)) {
          visited.add(root.entityId);
          root = byId.get(root.groupId);
        }
        const index = roots.indexOf(root);
        if (index < 0 || root.locked) return;
        const original = geometry.get(item.entityId) || item;
        item.x = Math.round(original.x + positions[index].x + offsetX - bounds[index].x);
        item.y = Math.round(original.y + positions[index].y - bounds[index].y);
      });
      this._saveDynamicPlacementOverrides(placements.filter(item => item.dynamic).map(item => item.entityId));
      this._persistSoon(0);
    }

    _arrangeByCategory() {
      const board = activeBoard(this.store);
      const arrange = PanelTopologyProjection?.arrangeTopologyLanes;
      if (!board || typeof arrange !== 'function') return false;
      this._recordMutation();
      board.view = { ...this._boardView(), topologyLayout: 'lanes' };
      this._setPanelTopology(this.panelTopologyResult);
      const entitiesById = this._allEntitiesById();
      const placements = this._combinedPlacements(board)
        .filter(placement => entitiesById.get(placement.entityId)?.type !== 'group');
      if (!placements.length) return false;
      const display = this._displayViewSettings();
      arrange({
        entities: this._combinedEntities(),
        existingEntities: [],
        relationships: this._combinedRelationships(placements),
        placements
      }, {
        ...this._nodeDimensions(),
        horizontalSpacing: display.horizontalSpacing,
        verticalSpacing: display.verticalSpacing
      });
      this._persistSoon(0);
      const dynamicIds = placements.filter(placement => placement.dynamic).map(placement => placement.entityId);
      if (dynamicIds.length) this._saveDynamicPlacementOverrides(dynamicIds);
      this._renderGraph();
      this.fitContent({ minZoom: 1 });
      this._refreshHistoryButtons();
      this.notify('已按项目、仓库、部署、主机和访问点分列', 'success');
      return true;
    }

    _arrangeByCoolifyProjects() {
      const board = activeBoard(this.store);
      if (!board || !this.panelProjection.metadata?.deploymentCount) {
        this.notify('请先连接 Coolify 并载入部署数据', 'info');
        return false;
      }
      this._recordMutation();
      board.view = { ...this._boardView(), topologyLayout: 'coolify-projects' };
      if (this.documentRecord) {
        this._setPanelTopology(this.panelTopologyResult);
        const previous = new Map(board.placements.map(item => [item.entityId, item]));
        for (const placement of this.panelProjection.placements) Object.assign(placement, normalizePlacementAnnotations(previous.get(placement.entityId)));
        const generatedIds = new Set(this.panelProjection.placements.map(item => item.entityId));
        board.placements = board.placements.filter(item => !generatedIds.has(item.entityId));
        const record = this.documentRecord;
        try { this.documentRecord = null; this.store = this._buildActiveBoardExportStore(); }
        finally { this.documentRecord = record; }
        this._renderGraph(); this._packCurrentLayout(); this._renderGraph();
        this.fitContent({ minZoom: 0.25 }); this._refreshHistoryButtons();
        return true;
      }
      const previous = this._dynamicLayoutForActiveBoard();
      this.dynamicLayoutStore.boards[board.id] = {};
      this._setPanelTopology(this.panelTopologyResult);
      for (const placement of this.panelProjection.placements) {
        Object.assign(placement, normalizePlacementAnnotations(previous[placement.entityId]));
      }
      this._saveDynamicPlacementOverrides(this.panelProjection.placements.map(item => item.entityId));
      this._persistSoon(0);
      this._renderGraph();
      this._packCurrentLayout(true);
      this._renderGraph();
      this.fitContent({ minZoom: 0.25 });
      this._refreshHistoryButtons();
      this.notify('已按 Coolify Projects 分组，共享资源保持唯一节点', 'success');
      return true;
    }

    _arrangeAround(mode) {
      const board = activeBoard(this.store);
      if (!board) return false;
      const currentEntities = this._allEntitiesById();
      const selected = currentEntities.get(this.selectedEntityId);
      if (mode === 'selection-centered' && (!selected || !this._placementForEntity(selected.id) || (selected.type === 'group' && selected.transient))) {
        this.notify('请先选中要作为中心的卡片或手工群组', 'info');
        return false;
      }
      if (mode === 'server-centered' && !this._combinedPlacements().some(item => currentEntities.get(item.entityId)?.type === 'server')) {
        this.notify('当前白板没有主机节点', 'info');
        return false;
      }
      this._recordMutation();
      board.view = { ...this._boardView(), topologyLayout: mode };
      this._setPanelTopology(this.panelTopologyResult);
      const placements = this._combinedPlacements();
      const byId = new Map(placements.map(item => [item.entityId, item]));
      const roots = new Map();
      for (const item of placements) {
        let root = item;
        const seen = new Set([item.entityId]);
        while (root.groupId && byId.has(root.groupId) && !seen.has(root.groupId)) {
          seen.add(root.groupId);
          root = byId.get(root.groupId);
        }
        roots.set(item.entityId, root.entityId);
      }
      // Keep manual groups intact: arrange their bounding rectangles as units,
      // then translate every nested member by the same delta.
      const geometry = this._displayGeometryMap(placements);
      const units = [...new Set(roots.values())].map(id => ({
        entityId: id, ...this._placementGeometry(byId.get(id), placements, new Set(), geometry)
      }));
      const origins = new Map(units.map(item => [item.entityId, { x: item.x, y: item.y }]));
      const entities = this._allEntitiesById();
      const centerIds = mode === 'selection-centered' ? [roots.get(this.selectedEntityId)]
        : placements.filter(item => entities.get(item.entityId)?.type === 'server')
          .sort((a, b) => String(entities.get(a.entityId)?.name).localeCompare(String(entities.get(b.entityId)?.name)) || a.entityId.localeCompare(b.entityId))
          .map(item => roots.get(item.entityId));
      const relationships = this._combinedRelationships(placements).map(edge => ({
        sourceId: roots.get(edge.sourceId), targetId: roots.get(edge.targetId)
      }));
      PanelTopologyProjection.arrangeAroundCenters({ placements: units, relationships }, centerIds, {
        ...this._nodeDimensions(),
        horizontalSpacing: this._displayViewSettings().horizontalSpacing,
        verticalSpacing: this._displayViewSettings().verticalSpacing,
        keepCenter: mode === 'selection-centered'
      });
      const unitById = new Map(units.map(item => [item.entityId, item]));
      for (const item of placements) {
        const rootId = roots.get(item.entityId);
        const target = unitById.get(rootId);
        const origin = origins.get(rootId);
        item.x = Math.round(item.x + target.x - origin.x);
        item.y = Math.round(item.y + target.y - origin.y);
      }
      this._saveDynamicPlacementOverrides(placements.filter(item => item.dynamic).map(item => item.entityId));
      this._persistSoon(0);
      this._renderGraph();
      this.fitContent();
      this._refreshHistoryButtons();
      this.notify(mode === 'selection-centered' ? '已围绕选中节点排列，手工群组保持完整' : '已按服务器中心排列，共享节点与跨主机关系保留', 'success');
      return true;
    }

    _setPanelTopology(result = {}) {
      const providerIdentity = value => {
        const providers = Array.isArray(value?.providers) ? value.providers : [];
        if (providers.length) return providers.map(provider => provider?.providerId).filter(Boolean).sort().join('|');
        return value?.provider?.providerId || '';
      };
      const nextProviderIdentity = providerIdentity(result);
      const sameProvider = nextProviderIdentity
        && nextProviderIdentity === providerIdentity(this.panelTopologyResult);
      const bindings = Array.isArray(result.bindings)
        ? result.bindings
        : (sameProvider ? (this.panelTopologyResult?.bindings || []) : []);
      this.panelTopologyResult = { ...result, bindings };
      const providerErrors = Array.isArray(result.errors) ? result.errors.filter(entry => entry?.message) : [];
      this.panelLastError = providerErrors.length
        ? `${providerErrors.length} 个 Coolify 同步失败：${providerErrors[0].message}`
        : (result.state === 'error' ? String(result.error || 'Coolify 同步失败') : '');
      const canvas = this.root?.querySelector('.relationship-canvas');
      this.panelProjection = PanelTopologyProjection?.buildProjection?.({
        ...this.panelTopologyResult,
        projects: this.panelProjects,
        repositories: this.panelRepositories,
        repositoryAssociations: this.repositoryAssociations,
        existingEntities: this.store?.entities || [],
        groupByProject: this.store && activeBoard(this.store)?.view?.topologyLayout === 'coolify-projects',
        layout: {
          ...this._nodeDimensions(),
          viewportAspectRatio: canvas?.clientWidth && canvas?.clientHeight ? canvas.clientWidth / canvas.clientHeight : 1.6,
          horizontalSpacing: this._displayViewSettings().horizontalSpacing,
          verticalSpacing: this._displayViewSettings().verticalSpacing
        }
      }) || { entities: [], relationships: [], placements: [], metadata: { state: result.state || 'unconfigured' } };
      const board = this.store && activeBoard(this.store);
      if (board?.view?.topologyLayout === 'coolify-projects' && board.placements.length) {
        const right = Math.max(...board.placements.map(item => {
          const geometry = this._placementGeometry(item, board.placements);
          return geometry.x + geometry.width;
        }));
        for (const placement of this.panelProjection.placements) placement.x += right + 80;
      }
      this._applyDynamicLayoutOverrides();
    }

    _schedulePanelRefresh() {
      if (this.panelRefreshTimer) clearTimeout(this.panelRefreshTimer);
      this.panelRefreshTimer = null;
      if (!this.root?.isConnected || !this.bridge?.panel?.getTopology) return;
      if (!['ready', 'error'].includes(this.panelTopologyResult?.state)) return;
      this.panelRefreshTimer = setTimeout(() => this._refreshPanelTopology(), PANEL_REFRESH_INTERVAL_MS);
    }

    async _refreshPanelTopology(options = {}) {
      if (this.pointerAction) { this._schedulePanelRefresh(); return false; }
      if (this.panelRefreshInFlight || !this.bridge?.panel?.getTopology) return false;
      this.panelRefreshInFlight = true;
      const associationRevision = this.repositoryAssociationRevision;
      this._updatePanelStatus();
      try {
        const [topology, repositories] = await Promise.all([
          this.bridge.panel.getTopology(),
          this.bridge.panel.getLocalRepositories?.() || Promise.resolve(this.panelRepositories)
        ]);
        const result = await this._topologyWithProjectBindings(topology);
        const associations = await this.bridge.panel.getRepositoryAssociations?.() || [];
        if (associationRevision === this.repositoryAssociationRevision) this.repositoryAssociations = associations;
        this.panelRepositories = repositories;
        this._setResources(this.panelProjects, repositories);
        this._setPanelTopology(result);
        if (this.root?.isConnected) {
          this._renderResources();
          this._renderGraph();
          this._updateFilterSummary();
          this._updateSummary();
          this._updatePanelStatus();
          // The topology is visible before starting any public endpoint requests.
          void this._refreshEndpointChecks({ force: options.announce === true });
        }
        if (options.announce) this.notify('Coolify 动态拓扑已刷新', 'success');
        return true;
      } catch (error) {
        this.panelLastError = error?.message || String(error);
        if (!this.panelProjection?.entities?.length) {
          this.panelTopologyResult = { state: 'error', error: this.panelLastError };
          this.panelProjection = { entities: [], relationships: [], placements: [], metadata: { state: 'error' } };
        }
        this._updatePanelStatus();
        if (options.announce) this.notify(`Coolify 刷新失败：${this.panelLastError}`, 'error');
        return false;
      } finally {
        this.panelRefreshInFlight = false;
        this._updatePanelStatus();
        this._schedulePanelRefresh();
      }
    }

    async _scanManagedRepositories() {
      if (this.repositoryScanning || !RepositoryRootScanner || !this.bridge?.repos?.merge) return;
      this.repositoryScanning = true;
      const updateButtons = () => {
        for (const root of [this.root, this.panelSidebarRoot]) root?.querySelectorAll?.('[data-relationship-action="scan-repositories"]').forEach(button => {
          button.disabled = this.repositoryScanning;
          button.textContent = this.repositoryScanning ? '全局扫描中…' : '扫描本地仓库';
        });
        for (const root of [this.root, this.panelSidebarRoot]) root?.querySelectorAll?.('[data-repository-scan-result]').forEach(element => {
          element.textContent = this.repositoryScanning ? '正在扫描全部受管位置，完成后匹配所有部署。' : this.repositoryScanSummary;
        });
      };
      updateButtons();
      try {
        const roots = await this.bridge.config.getTreeRoots();
        if (!roots.length) { this.repositoryScanSummary = '请先在左侧添加受管位置，再扫描本地仓库'; this.notify(this.repositoryScanSummary, 'warning'); return; }
        const scan = await new RepositoryRootScanner.Scanner({ bridge: this.bridge }).scan(roots, [], { depth: Infinity });
        // Merge only: an unavailable disk must not archive or erase existing associations.
        await this.bridge.repos.merge(scan.repos);
        this.panelRepositories = await this.bridge.panel.getLocalRepositories();
        this._setResources(this.panelProjects, this.panelRepositories);
        this._setPanelTopology(this.panelTopologyResult);
        if (this.root?.isConnected && !this.pointerAction) {
          this._renderResources(); this._renderGraph(); this._updateSummary();
        }
        const deployments = this.panelProjection.entities.filter(entity => entity.type === 'deployment');
        const linked = deployments.filter(entity => entity.runtime?.repositoryIds?.length && !entity.runtime?.missingRepositoryIds?.length).length;
        const candidates = deployments.filter(entity => ['ambiguous', 'suggested'].includes(entity.runtime?.repositoryAssociation?.mode)).length;
        const noSource = deployments.filter(entity => entity.runtime?.repositoryAssociation?.mode === 'no-source').length;
        const unmatched = deployments.filter(entity => entity.runtime?.repositoryAssociation?.mode === 'unmatched').length;
        this.repositoryScanSummary = `发现 ${scan.repos.length} 个仓库，${linked} 个部署已关联${candidates ? `，${candidates} 个待确认` : ''}${unmatched ? `，${unmatched} 个未匹配` : ''}${noSource ? `，${noSource} 个无仓库来源` : ''}${scan.complete ? '' : `；${scan.unavailableRoots.length} 个位置未完成扫描，原关联已保留`}`;
        this.notify(this.repositoryScanSummary, scan.complete ? 'success' : 'warning');
      } catch (error) {
        this.repositoryScanSummary = `仓库扫描失败：${error.message}`;
        this.notify(this.repositoryScanSummary, 'error');
      } finally {
        this.repositoryScanning = false;
        updateButtons();
      }
    }

    async _refreshEndpointChecks(values = null) {
      const panel = this.bridge?.panel;
      if (!this.root?.isConnected || this.endpointCheckRequest || !panel?.checkEndpoints || !panel?.getEndpointChecks) return false;
      clearTimeout(this.endpointCheckTimer);
      const request = {};
      const openRequestId = this.openRequestId;
      this.endpointCheckRequest = request;
      try {
        const snapshot = await (values ? panel.checkEndpoints(values) : panel.getEndpointChecks());
        if (this.endpointCheckRequest !== request || openRequestId !== this.openRequestId || !this.root?.isConnected) return false;
        this.endpointChecksPending = snapshot.pending || 0;
        // Never interrupt an active drag, box selection or resize with a DOM rebuild.
        if (!this.pointerAction) this._applyEndpointChecks(snapshot.checks || []);
        if (snapshot.pending || this.pointerAction) this.endpointCheckTimer = setTimeout(() => this._refreshEndpointChecks(), 1500);
        return true;
      } catch (error) {
        if (values?.force && this.endpointCheckRequest === request && this.root?.isConnected) this.notify(`访问点检测失败：${error.message}`, 'error');
        return false;
      } finally {
        if (this.endpointCheckRequest === request) {
          this.endpointCheckRequest = null;
          this._updateEndpointCheckStatus();
        }
      }
    }

    _applyEndpointChecks(checks) {
      const byTarget = new Map(checks.map(check => [`${check.providerId}\u0000${check.url}`, check]));
      let changed = false;
      for (const entity of this.panelProjection.entities) {
        if (entity.runtime?.dynamicKind !== 'panel-endpoint') continue;
        const check = byTarget.get(`${entity.runtime.providerId}\u0000${entity.runtime.url}`);
        const fields = PanelTopologyProjection.endpointHealthFields(check);
        if (Object.entries(fields).some(([key, value]) => entity.runtime[key] !== value)) changed = true;
        Object.assign(entity.runtime, fields);
        entity.verifiedAt = check?.checkedAt || '';
      }
      if (this.panelTopologyResult.topology) this.panelTopologyResult.topology.endpointChecks = checks;
      if (changed) {
        this._renderGraph();
        this._updateFilterSummary();
        this._updateSummary();
      }
    }

    _updateEndpointCheckStatus() {
      const button = this.root?.querySelector('[data-relationship-action="check-endpoints"]');
      if (!button) return;
      button.disabled = Boolean(this.endpointChecksPending) || !this.bridge?.panel?.checkEndpoints
        || !this.panelProjection.entities.some(entity => entity.runtime?.dynamicKind === 'panel-endpoint');
      button.title = this.endpointChecksPending ? `正在检测 ${this.endpointChecksPending} 个访问点` : '重新检测全部访问点（本机 HTTP 检测）';
      button.setAttribute('aria-label', button.title);
      button.textContent = this.endpointChecksPending ? `◉ ${this.endpointChecksPending}` : '◉';
    }

    _setResources(projects, repositories) {
      const resources = [];
      for (const project of Array.isArray(projects) ? projects : []) {
        if (!project?.projectId) continue;
        resources.push({
          key: `project:${project.projectId}`,
          kind: 'project',
          refId: project.projectId,
          name: project.name || '未命名项目',
          path: project.path || '',
          secondary: project.lifecycle || '项目'
        });
      }
      for (const repository of Array.isArray(repositories) ? repositories : []) {
        if (!repository?.id || repository.archived === true) continue;
        resources.push({
          key: `repository:${repository.id}`,
          kind: 'repository',
          refId: repository.id,
          name: repository.name || String(repository.path || '').split(/[\\/]/).filter(Boolean).at(-1) || '未命名仓库',
          path: repository.path || '',
          secondary: 'Git 仓库'
        });
      }
      resources.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      this.resources = resources;
      this.resourceMap = new Map(resources.map(resource => [resource.key, resource]));
    }

    _resourceCategory(resource) {
      return RESOURCE_CATEGORY_DEFINITIONS.some(category => category.id === resource?.kind)
        ? resource.kind
        : 'other';
    }

    _resourceCatalog() {
      const entities = this._combinedEntities();
      const placements = this._combinedPlacements();
      const placedIds = new Set(placements.map(placement => placement.entityId));
      const entitiesByReference = new Map();
      for (const entity of entities.filter(item => item.refId)) {
        const key = `${entity.type}:${entity.refId}`;
        if (!entitiesByReference.has(key) || placedIds.has(entity.id)) entitiesByReference.set(key, entity);
      }
      const catalog = this.resources.map(resource => {
        const entity = entitiesByReference.get(`${resource.kind}:${resource.refId}`);
        return {
          ...resource,
          category: this._resourceCategory(resource),
          ...(entity ? { entityId: entity.id, name: this._entityDisplayName(entity), transient: entity.transient === true, placed: placedIds.has(entity.id) } : {})
        };
      });
      const representedIds = new Set(catalog.map(resource => resource.entityId).filter(Boolean));
      for (const entity of entities) {
        if (representedIds.has(entity.id)) continue;
        const key = `entity:${entity.id}`;
        const subtitle = this._entityDisplaySubtitle(entity, this._entitySubtitle(entity, null, false) || TYPE_LABELS[entity.type]);
        catalog.push({
          key,
          kind: entity.type,
          category: this._resourceCategory({ kind: entity.type }),
          entityId: entity.id,
          name: this._entityDisplayName(entity),
          path: '',
          secondary: subtitle,
          transient: entity.transient === true,
          placed: placedIds.has(entity.id)
        });
      }
      catalog.push(...this.documentLibrary.map(item => ({ ...item, key: `whiteboard:${item.id}`, kind: 'whiteboard', category: 'whiteboard', secondary: item.missing ? '文件缺失 · 可移除记录' : `${item.nodeCount} 个元素`, path: item.path })));
      return catalog.sort((left, right) => {
        const categoryOrder = RESOURCE_CATEGORY_DEFINITIONS.findIndex(category => category.id === left.category)
          - RESOURCE_CATEGORY_DEFINITIONS.findIndex(category => category.id === right.category);
        return categoryOrder || left.name.localeCompare(right.name, 'zh-CN');
      });
    }

    _resourceSections(catalog = this._resourceCatalog()) {
      return RESOURCE_CATEGORY_DEFINITIONS.map(category => ({
        ...category,
        key: category.id,
        items: catalog.filter(resource => resource.category === category.id)
      }));
    }

    _combinedEntities() {
      const live = new Map((this.panelProjection?.entities || []).map(item => [item.id, item]));
      const entities = (this.store?.entities || []).map(item => live.has(item.id) ? { ...item, runtime: live.get(item.id).runtime } : item);
      const ids = new Set(entities.map(entity => entity.id));
      for (const entity of this.panelProjection?.entities || []) {
        if (!ids.has(entity.id)) {
          ids.add(entity.id);
          entities.push(entity);
        }
      }
      return entities;
    }

    _combinedPlacements(board = activeBoard(this.store)) {
      const placements = [...(board?.placements || [])];
      if (this.documentRecord) return placements;
      const ids = new Set(placements.map(placement => placement.entityId));
      for (const placement of this.panelProjection?.placements || []) {
        if (!ids.has(placement.entityId)) {
          ids.add(placement.entityId);
          placements.push(placement);
        }
      }
      return placements;
    }

    _placementForEntity(entityId) {
      return activeBoard(this.store)?.placements.find(placement => placement.entityId === entityId)
        || this.panelProjection?.placements?.find(placement => placement.entityId === entityId)
        || null;
    }

    _combinedRelationships(placements = this._combinedPlacements()) {
      const placedIds = new Set(placements.map(placement => placement.entityId));
      const relationships = [];
      const facts = new Set();
      for (const relationship of [
        ...(this.store?.relationships || []),
        ...(this.panelProjection?.relationships || [])
      ]) {
        if (!placedIds.has(relationship.sourceId) || !placedIds.has(relationship.targetId)) continue;
        const factKey = `${relationship.type}\u0000${relationship.sourceId}\u0000${relationship.targetId}`;
        if (facts.has(factKey)) continue;
        facts.add(factKey);
        relationships.push(relationship);
      }
      return relationships;
    }

    _allEntitiesById() {
      return new Map(this._combinedEntities().map(entity => [entity.id, entity]));
    }

    _portableFactFields(fact) {
      const result = {};
      if (Model.FACT_SOURCES.includes(fact?.source)) result.source = fact.source;
      if (fact?.verifiedAt) result.verifiedAt = fact.verifiedAt;
      if (fact?.reviewIntervalDays) result.reviewIntervalDays = fact.reviewIntervalDays;
      if (fact?.evidenceSummary) result.evidenceSummary = fact.evidenceSummary;
      return result;
    }

    _portableEntity(entity) {
      const details = {};
      if (['text', 'image', 'attachment'].includes(entity.type)) Object.assign(details, entity.details);
      for (const field of DETAIL_FIELD_DEFINITIONS[entity.type] || []) {
        const value = entity.details?.[field.key];
        if (value !== undefined && value !== null && String(value).trim()) details[field.key] = value;
      }
      return {
        id: entity.id,
        type: entity.type,
        name: this._entityBaseName(entity),
        ...(entity.refId ? { refId: entity.refId } : {}),
        details,
        ...this._portableFactFields(entity)
      };
    }

    _portableRelationship(relationship) {
      const id = String(relationship.id || '').startsWith('relationship_')
        ? relationship.id
        : String(relationship.id || '').replace(/^relation_/, 'relationship_');
      return {
        id,
        type: relationship.type,
        sourceId: relationship.sourceId,
        targetId: relationship.targetId,
        ...(relationship.label ? { label: relationship.label } : {}),
        ...this._portableFactFields(relationship)
      };
    }

    _buildActiveBoardExportStore() {
      const board = activeBoard(this.store);
      if (!board) throw new Error('当前没有可导出的关系白板');
      const placements = this._combinedPlacements(board);
      const entitiesById = this._allEntitiesById();
      const entities = placements
        .map(placement => entitiesById.get(placement.entityId))
        .filter(Boolean)
        .map(entity => this._portableEntity(entity));
      const relationships = this._combinedRelationships(placements).map(relationship => (
        this._portableRelationship(relationship)
      ));
      return Model.assertValidStore({
        schemaVersion: Model.VERSION,
        activeBoardId: board.id,
        entities,
        relationships,
        boards: [{
          id: board.id,
          name: board.name,
          viewport: clone(board.viewport),
          view: clone(board.view || Model.defaultBoardView()),
          placements: placements.map(placement => ({
            entityId: placement.entityId,
            x: placement.x,
            y: placement.y,
            ...(placement.groupId ? { groupId: placement.groupId } : {}),
            ...(placement.groupBackground ? { groupBackground: placement.groupBackground } : {}),
            ...(placement.groupBorder ? { groupBorder: placement.groupBorder } : {}),
            ...normalizePlacementAnnotations(placement),
            ...(this.expandedCardIds.has(placement.entityId) ? { expanded: true } : { expanded: false })
          }))
        }]
      });
    }

    _entityAvailability(entity) {
      if (!entity || entity.transient || entity.type === 'group') return { missing: false, label: '', detail: '' };
      if (entity.refId && ['project', 'repository'].includes(entity.type)
        && !this.resourceMap.has(`${entity.type}:${entity.refId}`)) {
        if (this.resourceLoadingPromise) return { missing: false, label: '', detail: '' };
        return {
          missing: true,
          label: '本机资源缺失',
          detail: '稳定身份暂时无法解析 · 节点与关系仍保留'
        };
      }
      if (entity.source === 'observed'
        && /^entity_panel_/.test(entity.id)
        && ['server', 'deployment', 'endpoint'].includes(entity.type)
        && !(this.panelProjection?.entities || []).some(candidate => candidate.id === entity.id)) {
        return {
          missing: true,
          label: '实时资源缺失',
          detail: '当前 Coolify 未返回该资源 · 快照节点与关系仍保留'
        };
      }
      return { missing: false, label: '', detail: '' };
    }

    _panelSnapshotStale() {
      const generatedAt = new Date(this.panelProjection?.metadata?.generatedAt || 0);
      const now = new Date(this.now());
      return Number.isFinite(generatedAt.getTime())
        && Number.isFinite(now.getTime())
        && now.getTime() - generatedAt.getTime() > PANEL_STALE_AFTER_MS;
    }

    _relativeTime(value) {
      const date = new Date(value || 0);
      const now = new Date(this.now());
      if (!Number.isFinite(date.getTime()) || !Number.isFinite(now.getTime())) return '时间未知';
      const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
      if (seconds < 10) return '刚刚';
      if (seconds < 60) return `${seconds} 秒前`;
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return `${minutes} 分钟前`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `${hours} 小时前`;
      return `${Math.round(hours / 24)} 天前`;
    }

    _panelStatusView() {
      const state = this.panelTopologyResult?.state || this.panelProjection?.metadata?.state || 'unconfigured';
      const metadata = this.panelProjection?.metadata || {};
      if (this.panelRefreshInFlight) return { state: 'loading', label: 'Coolify 同步中…', title: '正在读取只读动态拓扑' };
      if (this.panelLastError && metadata.deploymentCount) {
        return {
          state: 'error',
          label: `Coolify ${metadata.deploymentCount} 个部署 · 同步失败`,
          title: `${this.panelLastError}；保留最后成功快照`
        };
      }
      if (state === 'ready') {
        const stale = this._panelSnapshotStale();
        const failure = metadata.failureCount ? ` · ${metadata.failureCount} 个最近失败` : '';
        const providerPrefix = metadata.providerCount > 1 ? `${metadata.providerCount} 个 Coolify · ` : 'Coolify ';
        return {
          state: stale ? 'stale' : (metadata.failureCount ? 'warning' : 'ready'),
          label: `${providerPrefix}${metadata.serverCount || 0} 台服务器 · ${metadata.deploymentCount || 0} 个部署${failure}`,
          title: `最后同步 ${this._relativeTime(metadata.generatedAt)}${stale ? '；数据已陈旧' : ''}`
        };
      }
      if (state === 'reauthentication-required') return { state, label: 'Coolify 需要重新连接', title: '请在设置中重新输入只读 API Token' };
      if (state === 'error') return { state, label: 'Coolify 同步失败', title: this.panelLastError || '无法读取动态拓扑' };
      return { state: 'unconfigured', label: 'Coolify 未连接', title: '可在设置中直接连接 Coolify' };
    }

    _updatePanelStatus() {
      this._updateEndpointCheckStatus();
      const element = this.root?.querySelector('[data-panel-topology-status]');
      const refresh = this.root?.querySelector('[data-relationship-action="refresh-panel"]');
      if (!element) return;
      const status = this._panelStatusView();
      element.parentElement.dataset.state = status.state;
      element.dataset.state = status.state;
      element.textContent = status.label;
      element.title = status.title;
      if (refresh) refresh.disabled = this.panelRefreshInFlight || !this.bridge?.panel?.getTopology;
    }

    revealResource(kind, refId) {
      if (!['project', 'repository'].includes(kind) || !refId || !this.store) return false;
      const resource = this.resourceMap.get(`${kind}:${refId}`);
      const board = activeBoard(this.store);
      if (!resource || !board) {
        this.notify('此项目或仓库已不在当前 GitFinder 注册表中', 'warning');
        return false;
      }

      let entity = this.store.entities.find(candidate => candidate.type === kind && candidate.refId === refId);
      let placement = entity && board.placements.find(candidate => candidate.entityId === entity.id);
      if (!placement) {
        if (!entity && this.store.entities.length >= Model.MAX_ENTITIES) {
          this.notify(`最多保存 ${Model.MAX_ENTITIES} 个关系节点`, 'warning');
          return false;
        }
        this._recordMutation();
        if (!entity) {
          entity = {
            id: makeId('entity'),
            type: kind,
            name: resource.name,
            refId,
            details: {},
            source: 'gitfinder-registry'
          };
          this.store.entities.push(entity);
        }
        const fallbackIndex = board.placements.length;
        placement = {
          entityId: entity.id,
          x: 80 + (fallbackIndex % 3) * 280,
          y: 80 + Math.floor(fallbackIndex / 3) * 140
        };
        board.placements.push(placement);
        this._refreshHistoryButtons();
      }

      if (this._hasActiveFilters(board.view)) {
        const { mode, projection, snapMode, topologyLayout } = this._boardView();
        board.view = {
          ...Model.defaultBoardView(),
          ...this._displayViewSettings(),
          mode,
          projection: projection || 'facts',
          snapMode, topologyLayout
        };
      }
      this._selectOnlyEntity(entity.id);
      this.keyboardConnectSourceId = '';
      const canvas = this.root?.querySelector('.relationship-canvas');
      const rect = canvas?.getBoundingClientRect();
      if (rect?.width && rect?.height) {
        const { width, height } = this._nodeDimensions();
        const zoom = board.viewport.zoom;
        board.viewport.x = rect.width / 2 - (placement.x + width / 2) * zoom;
        board.viewport.y = rect.height / 2 - (placement.y + height / 2) * zoom;
      }
      this._applyViewMode();
      this._persistSoon(0);
      this._renderGraph();
      this._updateFilterSummary();
      this._updateSummary();
      this._setCanvasAnnouncement(`已在白板中显示 ${resource.name}`);
      return true;
    }

    _environmentOptions(selectedValue = '') {
      const values = new Set();
      for (const entity of this._combinedEntities()) {
        const value = Model.cleanText(entity.details?.environment, 80);
        if (value) values.add(value);
      }
      if (selectedValue) values.add(selectedValue);
      const options = [...values].sort((left, right) => left.localeCompare(right, 'zh-CN'));
      return `<option value=""${selectedValue ? '' : ' selected'}>全部环境</option>` + options.map(value => (
        `<option value="${escapeHtml(value)}"${selectedValue === value ? ' selected' : ''}>${escapeHtml(value)}</option>`
      )).join('');
    }

    _boardView() {
      const board = activeBoard(this.store);
      if (!board) return Model.defaultBoardView();
      board.view = { ...Model.defaultBoardView(), ...(board.view || {}) };
      return board.view;
    }

    _displayViewSettings(view = this._boardView()) {
      const defaults = Model.defaultBoardView();
      const cardScale = Number(view.cardScale);
      const textScale = Number(view.textScale);
      const normalizedNumber = (value, fallback, min, max) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
      };
      return {
        mode: view.mode === 'compact' ? 'compact' : 'full',
        cardScale: Number.isFinite(cardScale) ? Math.min(1.4, Math.max(0.8, cardScale)) : defaults.cardScale,
        cardWidth: normalizedNumber(view.cardWidth, defaults.cardWidth, 220, 600),
        cardHeight: normalizedNumber(view.cardHeight, defaults.cardHeight, 143, 420),
        textScale: Number.isFinite(textScale) ? Math.min(1.3, Math.max(0.85, textScale)) : defaults.textScale,
        horizontalSpacing: normalizedNumber(view.horizontalSpacing, defaults.horizontalSpacing, 16, 180),
        verticalSpacing: normalizedNumber(view.verticalSpacing, defaults.verticalSpacing, 16, 140),
        cardAppearance: view.cardAppearance === 'flat' ? 'flat' : 'elevated',
        showGrid: view.showGrid !== false,
        showEdgeLabels: view.showEdgeLabels !== false,
        cardTitleSource: view.cardTitleSource === 'note' ? 'note' : 'name',
        showRuntimeStatus: view.showRuntimeStatus !== false,
        unmatchedDisplay: view.unmatchedDisplay === 'hide' ? 'hide' : 'dim',
        filterContextOpacity: normalizedNumber(view.filterContextOpacity, defaults.filterContextOpacity, 0.15, 0.8),
        filterMutedOpacity: normalizedNumber(view.filterMutedOpacity, defaults.filterMutedOpacity, 0.03, 0.4),
        filterMutedSaturation: normalizedNumber(view.filterMutedSaturation, defaults.filterMutedSaturation, 0, 0.8),
        filterContextEdgeOpacity: normalizedNumber(view.filterContextEdgeOpacity, defaults.filterContextEdgeOpacity, 0.1, 0.8),
        filterMutedEdgeOpacity: normalizedNumber(view.filterMutedEdgeOpacity, defaults.filterMutedEdgeOpacity, 0.01, 0.3),
        filterMatchHaloOpacity: normalizedNumber(view.filterMatchHaloOpacity, defaults.filterMatchHaloOpacity, 0, 0.6),
        statusTintOpacity: normalizedNumber(view.statusTintOpacity, defaults.statusTintOpacity, 0, 0.18)
      };
    }

    _nodeDimensions() {
      const display = this._displayViewSettings();
      const dimensions = display.mode === 'compact'
        ? { width: COMPACT_NODE_WIDTH, height: COMPACT_NODE_HEIGHT }
        : { width: NODE_WIDTH, height: NODE_HEIGHT };
      return {
        width: Math.round(dimensions.width * display.cardScale * display.cardWidth / NODE_WIDTH),
        height: Math.round(dimensions.height * display.cardScale * display.cardHeight / NODE_HEIGHT)
      };
    }

    _expandedNodeHeight(placement) {
      const { height } = this._nodeDimensions();
      const annotations = normalizePlacementAnnotations(placement || {});
      const todoCount = Math.min(4, (annotations.todos || []).length);
      const noteHeight = annotations.note ? 42 : 0;
      return height + Math.round((110 + todoCount * 42 + noteHeight) * this._displayViewSettings().cardScale);
    }

    _captureDisplayLayout() {
      const display = this._displayViewSettings();
      return { boardId: activeBoard(this.store)?.id, display, history: this._historySnapshot(),
        geometry: this._displayGeometryMap(this._combinedPlacements()) };
    }

    _reflowDisplayLayout(before) {
      if (before.boardId !== activeBoard(this.store)?.id) return;
      const placements = this._combinedPlacements();
      const entities = this._allEntitiesById();
      const spacing = this._displayViewSettings();
      const dimensions = this._nodeDimensions();
      const geometry = new Map();
      for (const item of placements) {
        const old = before.geometry.get(item.entityId);
        if (!old) continue;
        const card = !['group', 'text', 'image', 'attachment'].includes(entities.get(item.entityId)?.type);
        geometry.set(item.entityId, { ...old, ...(card ? { width: dimensions.width,
          height: this.cardHeights.get(item.entityId) || (this.expandedCardIds.has(item.entityId) ? this._expandedNodeHeight(item) : dimensions.height) } : {}) });
      }
      const bounds = item => geometry.get(item.entityId);
      const oldBounds = item => before.geometry.get(item.entityId);
      const shift = (item, dx, dy) => {
        for (const child of [item, ...this._groupDescendants(item.entityId, placements)]) {
          const rect = bounds(child);
          if (rect) { rect.x += dx; rect.y += dy; }
        }
      };
      // Keep the existing columns and staggered rows, using the start of the slider
      // gesture as the baseline. Repeated inputs must not accumulate displacement.
      const tracks = (items, axis, size) => {
        const result = [];
        for (const item of items.slice().sort((a, b) => oldBounds(a)[axis] - oldBounds(b)[axis])) {
          const last = result.at(-1);
          if (last && oldBounds(item)[axis] - oldBounds(last[0])[axis] < Math.min(oldBounds(item)[size], oldBounds(last[0])[size]) * 0.45) last.push(item);
          else result.push([item]);
        }
        return result;
      };
      const arrangeTracks = (list, axis, size, gap, oldGap) => {
        let previousEnd, previousOldEnd;
        for (const track of list) {
          const oldStart = Math.min(...track.map(item => oldBounds(item)[axis]));
          const start = previousEnd == null ? oldStart : previousEnd + gap + Math.max(0, oldStart - previousOldEnd - oldGap);
          for (const item of track) {
            const delta = start + oldBounds(item)[axis] - oldStart - bounds(item)[axis];
            shift(item, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
          }
          previousEnd = Math.max(...track.map(item => bounds(item)[axis] + bounds(item)[size]));
          previousOldEnd = Math.max(...track.map(item => oldBounds(item)[axis] + oldBounds(item)[size]));
        }
      };
      const arrange = items => {
        if (items.some(item => item.locked || this._groupDescendants(item.entityId, placements).some(child => child.locked))) return;
        const columns = tracks(items, 'x', 'width');
        for (const column of columns) arrangeTracks(tracks(column, 'y', 'height'), 'y', 'height', spacing.verticalSpacing, before.display.verticalSpacing);
        const previous = [];
        for (const column of columns) {
          const offsets = [];
          for (const item of column) for (const left of previous) {
            const old = oldBounds(item), oldLeft = oldBounds(left), rect = bounds(item), leftRect = bounds(left);
            const overlaps = (a, b) => a.y < b.y + b.height && a.y + a.height > b.y;
            if (!overlaps(old, oldLeft) && !overlaps(rect, leftRect)) continue;
            const extra = Math.max(0, old.x - oldLeft.x - oldLeft.width - before.display.horizontalSpacing);
            offsets.push(leftRect.x + leftRect.width + spacing.horizontalSpacing + extra - old.x);
          }
          const offset = offsets.length ? Math.max(...offsets) : 0;
          for (const item of column) shift(item, oldBounds(item).x + offset - bounds(item).x, 0);
          previous.push(...column);
        }
      };
      const groups = placements.filter(item => entities.get(item.entityId)?.type === 'group' && bounds(item))
        .sort((a, b) => this._groupDepth(b.entityId, placements) - this._groupDepth(a.entityId, placements));
      const blocked = new Set();
      for (const item of placements.filter(item => item.locked)) {
        blocked.add(item.entityId);
        this._groupDescendants(item.entityId, placements).forEach(child => blocked.add(child.entityId));
      }
      for (const group of groups) {
        if (blocked.has(group.entityId)) continue;
        const members = placements.filter(item => item.groupId === group.entityId && bounds(item));
        if (!members.length) continue;
        arrange(members);
        const old = oldBounds(group), rect = bounds(group);
        for (const [axis, size, padding, minimum] of [['x', 'width', GROUP_PADDING_X, GROUP_MIN_WIDTH], ['y', 'height', GROUP_PADDING_BOTTOM, GROUP_MIN_HEIGHT]]) {
          const oldEnd = Math.max(...members.map(item => oldBounds(item)[axis] + oldBounds(item)[size]));
          const extra = Math.max(0, old[axis] + old[size] - oldEnd - padding);
          rect[size] = Math.max(minimum, Math.max(...members.map(item => bounds(item)[axis] + bounds(item)[size])) - rect[axis] + padding + extra);
        }
      }
      arrange(placements.filter(item => !item.groupId && bounds(item)));
      for (const item of placements) {
        const rect = bounds(item);
        if (!rect || blocked.has(item.entityId)) continue;
        item.x = rect.x; item.y = rect.y;
        if (entities.get(item.entityId)?.type === 'group') {
          item.groupLayout ||= 'manual';
          item.groupWidth = Math.round(rect.width); item.groupHeight = Math.round(rect.height);
        }
      }
      this._saveDynamicPlacementOverrides(placements.filter(item => item.dynamic && !blocked.has(item.entityId)).map(item => item.entityId));
    }

    _displayGeometryMap(placements = []) {
      const allPlacements = this._combinedPlacements();
      if (placements.length < allPlacements.length && allPlacements.some(item => item.groupLayout === 'auto')) {
        const geometry = this._displayGeometryMap(allPlacements);
        return new Map(placements.filter(item => geometry.has(item.entityId)).map(item => [item.entityId, geometry.get(item.entityId)]));
      }
      if (this.pointerAction?.type === 'node' && this.pointerAction.geometry) {
        return new Map(placements.filter(item => this.pointerAction.geometry.has(item.entityId)).map(item => {
          const original = this.pointerAction.geometry.get(item.entityId);
          return [item.entityId, this.pointerAction.entityIds.includes(item.entityId) && this.pointerAction.moved
            ? { ...original, x: item.x, y: item.y } : original];
        }));
      }
      const entitiesById = this._allEntitiesById();
      const { width, height } = this._nodeDimensions();
      const spacing = this._displayViewSettings();
      const placementsById = new Map(placements.map(item => [item.entityId, item]));
      const regular = placements
        .filter(placement => entitiesById.get(placement.entityId)?.type !== 'group')
        .slice()
        .sort((left, right) => left.y - right.y || left.x - right.x);
      const resolved = [];
      const geometryById = new Map();
      for (const placement of regular) {
        const entity = entitiesById.get(placement.entityId);
        if (['text', 'image', 'attachment'].includes(entity?.type)) {
          geometryById.set(entity.id, { x: placement.x, y: placement.y, width: Number(entity.details.width) || 320, height: Number(entity.details.height) || 180 });
          continue;
        }
        let y = placement.y;
        const expanded = this.expandedCardIds.has(placement.entityId);
        const cardHeight = this.cardHeights.get(placement.entityId)
          || (expanded ? this._expandedNodeHeight(placement) : height);
        for (const previous of resolved) {
          if (placementsById.get(placement.groupId)?.groupLayout) break;
          if ((placement.groupId || '') !== previous.groupId) continue;
          const horizontalOverlap = placement.x < previous.x + width
            && placement.x + width > previous.x;
          const originallyBelow = placement.y >= previous.originalY + height * 0.45;
          if (horizontalOverlap && originallyBelow) y = Math.max(y, previous.y + previous.height + spacing.verticalSpacing);
        }
        const geometry = { x: placement.x, y, width, height: cardHeight, originalY: placement.y, groupId: placement.groupId || '' };
        resolved.push(geometry);
        geometryById.set(placement.entityId, geometry);
      }
      const groups = placements.filter(item => entitiesById.get(item.entityId)?.type === 'group')
        .sort((a, b) => this._groupDepth(b.entityId, placements) - this._groupDepth(a.entityId, placements));
      for (const group of groups) {
        const members = placements.filter(item => item.groupId === group.entityId);
        const descendants = this._groupDescendants(group.entityId, placements);
        if (group.groupLayout === 'auto' && !group.locked && !descendants.some(item => item.locked)) {
          const innerWidth = (group.groupWidth || GROUP_MIN_WIDTH) - GROUP_PADDING_X * 2;
          let x = 0, y = 0, rowHeight = 0;
          for (const member of this._orderedLayoutItems(members, placements)) {
            const bounds = geometryById.get(member.entityId);
            if (!bounds) continue;
            if (x > 0 && x + bounds.width > innerWidth) { x = 0; y += rowHeight + spacing.verticalSpacing; rowHeight = 0; }
            const dx = group.x + GROUP_PADDING_X + x - bounds.x;
            const dy = group.y + GROUP_HEADER_HEIGHT + y - bounds.y;
            for (const item of [member, ...this._groupDescendants(member.entityId, placements)]) {
              const child = geometryById.get(item.entityId);
              if (child) geometryById.set(item.entityId, { ...child, x: child.x + dx, y: child.y + dy });
            }
            x += bounds.width + spacing.horizontalSpacing;
            rowHeight = Math.max(rowHeight, bounds.height);
          }
        }
        const bounds = this._placementGeometry(group, placements, new Set(), geometryById);
        if (group.groupLayout === 'auto') {
          bounds.width = Math.max(bounds.width, ...members.map(item => (geometryById.get(item.entityId)?.x || group.x) + (geometryById.get(item.entityId)?.width || 0) - group.x + GROUP_PADDING_X));
          bounds.height = Math.max(bounds.height, ...members.map(item => (geometryById.get(item.entityId)?.y || group.y) + (geometryById.get(item.entityId)?.height || 0) - group.y + GROUP_PADDING_BOTTOM));
        }
        geometryById.set(group.entityId, bounds);
      }
      return geometryById;
    }

    _orderedLayoutItems(items, placements = this._combinedPlacements(), axis = 'y') {
      const ids = new Set(items.map(item => item.entityId));
      const byId = new Map(placements.map(item => [item.entityId, item]));
      const rootOf = id => {
        const seen = new Set();
        while (id && !ids.has(id) && !seen.has(id)) { seen.add(id); id = byId.get(id)?.groupId; }
        return ids.has(id) ? id : '';
      };
      const relationships = this._combinedRelationships(placements).map(edge => ({
        sourceId: rootOf(edge.sourceId), targetId: rootOf(edge.targetId)
      }));
      return PanelTopologyProjection.orderByTopologyAndPosition(items, relationships, axis);
    }

    _groupDescendants(groupId, placements = this._combinedPlacements()) {
      const ids = new Set([groupId]);
      const result = [];
      for (const id of ids) for (const item of placements) {
        if (item.groupId !== id || ids.has(item.entityId)) continue;
        ids.add(item.entityId); result.push(item);
      }
      return result;
    }

    _materializeGroupGeometry(groupId) {
      const placements = this._combinedPlacements();
      const group = this._placementForEntity(groupId);
      const geometry = this._displayGeometryMap(placements);
      const items = [group, ...this._groupDescendants(groupId, placements)].filter(Boolean);
      for (const item of items) {
        const bounds = geometry.get(item.entityId);
        if (!bounds) continue;
        item.x = bounds.x; item.y = bounds.y;
        if (this._allEntitiesById().get(item.entityId)?.type === 'group') {
          item.groupWidth = Math.round(bounds.width); item.groupHeight = Math.round(bounds.height);
        }
      }
      return items;
    }

    _toggleGroupLayout(groupId) {
      const group = this._placementForEntity(groupId);
      if (!group || group.locked || this._allEntitiesById().get(groupId)?.type !== 'group') return;
      const enabled = group.groupLayout !== 'auto';
      if (enabled && this._groupDescendants(groupId).some(item => item.locked)) {
        this.notify('群组中有锁定成员，请先解锁再开启自动排列', 'warning'); return;
      }
      this._recordMutation();
      const items = this._materializeGroupGeometry(groupId);
      group.groupLayout = enabled ? 'auto' : 'manual';
      this._saveDynamicPlacementOverrides(items.filter(item => item.dynamic).map(item => item.entityId));
      this._persistSoon(0); this._renderGraph(); this._refreshHistoryButtons(); this._updateSummary();
    }

    _placementGeometry(placement, placements = this._combinedPlacements(), ancestors = new Set(), displayGeometry = null) {
      const entitiesById = this._allEntitiesById();
      const entity = entitiesById.get(placement?.entityId);
      if (entity?.type !== 'group') {
        const { width, height } = this._nodeDimensions();
        return displayGeometry?.get(placement.entityId) || { x: placement.x, y: placement.y, width, height };
      }
      if ((placement.groupLayout === 'auto' || (placement.groupWidth && placement.groupHeight)) && displayGeometry?.has(placement.entityId)) return displayGeometry.get(placement.entityId);
      if (placement.groupWidth && placement.groupHeight) return { x: placement.x, y: placement.y, width: placement.groupWidth, height: placement.groupHeight };
      const visited = new Set([...ancestors, entity.id]);
      const members = placements.filter(item => item.groupId === entity.id && !visited.has(item.entityId));
      if (!members.length) {
        return { x: placement.x, y: placement.y, width: GROUP_MIN_WIDTH, height: GROUP_MIN_HEIGHT };
      }
      const bounds = members.map(item => this._placementGeometry(item, placements, visited, displayGeometry));
      const minX = Math.min(...bounds.map(item => item.x));
      const minY = Math.min(...bounds.map(item => item.y));
      const maxX = Math.max(...bounds.map(item => item.x + item.width));
      const maxY = Math.max(...bounds.map(item => item.y + item.height));
      return {
        x: minX - GROUP_PADDING_X,
        y: minY - GROUP_HEADER_HEIGHT,
        width: Math.max(GROUP_MIN_WIDTH, maxX - minX + GROUP_PADDING_X * 2),
        height: Math.max(GROUP_MIN_HEIGHT, maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING_BOTTOM)
      };
    }

    _movingEntityIds(entityId) {
      const board = activeBoard(this.store);
      if (!board) return [];
      const placements = this._combinedPlacements(board);
      const placedIds = new Set(placements.map(item => item.entityId));
      const selectedIds = this._entitySelectionIds();
      const movingIds = new Set(selectedIds.has(entityId) ? selectedIds : [entityId]);
      const entities = this._allEntitiesById();
      const groupIds = [...movingIds].filter(id => entities.get(id)?.type === 'group');
      for (const groupId of groupIds) {
        for (const placement of placements) {
          if (placement.groupId !== groupId || movingIds.has(placement.entityId)) continue;
          movingIds.add(placement.entityId);
          if (entities.get(placement.entityId)?.type === 'group') groupIds.push(placement.entityId);
        }
      }
      return [...movingIds].filter(id => placedIds.has(id));
    }

    _groupDepth(entityId, placements = this._combinedPlacements()) {
      const byId = new Map(placements.map(item => [item.entityId, item]));
      const seen = new Set([entityId]);
      let parent = byId.get(entityId)?.groupId;
      let depth = 0;
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        depth++;
        parent = byId.get(parent)?.groupId;
      }
      return depth;
    }

    _canJoinGroup(entityId, groupId) {
      if (!groupId) return true;
      if (activeBoard(this.store)?.placements.some(item => item.entityId === entityId)
        && this._allEntitiesById().get(groupId)?.transient) return false;
      const placements = new Map(this._combinedPlacements().map(item => [item.entityId, item]));
      if (this._allEntitiesById().get(groupId)?.type !== 'group' || !placements.has(groupId)) return false;
      const seen = new Set([entityId]);
      let parent = groupId;
      while (parent) {
        if (seen.has(parent)) return false;
        seen.add(parent);
        parent = placements.get(parent)?.groupId;
      }
      return true;
    }

    _entitySelectionIds() {
      const selected = new Set(this.selectedEntityIds || []);
      if (this.selectedEntityId) selected.add(this.selectedEntityId);
      return selected;
    }

    _selectOnlyEntity(entityId) {
      this.selectedEntityIds = entityId ? new Set([entityId]) : new Set();
      this.selectedEntityId = entityId || '';
      this.selectedRelationshipId = '';
    }

    _clearEntitySelection() {
      this.selectedEntityIds = new Set();
      this.selectedEntityId = '';
    }

    _setEntitySelection(entityIds, primaryId = '') {
      this.selectedEntityIds = new Set(entityIds || []);
      this.selectedEntityId = this.selectedEntityIds.has(primaryId)
        ? primaryId
        : (this.selectedEntityIds.values().next().value || '');
      this.selectedRelationshipId = '';
    }

    _pruneEntitySelection(visibleIds) {
      const selectedIds = this._entitySelectionIds();
      if (!selectedIds.size) return;
      if (this.inspectorPinned && this.selectedEntityId && this._allEntitiesById().has(this.selectedEntityId)) return;
      this._setEntitySelection(
        [...selectedIds].filter(entityId => visibleIds.has(entityId)),
        this.selectedEntityId
      );
    }

    _selectedEntityTypes(view = this._boardView()) {
      if (Array.isArray(view.entityTypes) && view.entityTypes.length) return view.entityTypes;
      return view.entityType && view.entityType !== 'all' ? [view.entityType] : [];
    }

    _selectedTaskFilters(view = this._boardView()) {
      if (Array.isArray(view.taskFilters) && view.taskFilters.length) return view.taskFilters;
      return view.task && view.task !== 'all' ? [view.task] : [];
    }

    _selectedRuntimeStates(view = this._boardView()) {
      return Array.isArray(view.runtimeStates) ? view.runtimeStates : [];
    }

    _entityRuntimeTone(entity) {
      const availability = this._entityAvailability(entity);
      if (availability.missing) return 'inactive';
      const status = this._entityRuntimeStatus(entity);
      if (!status) return ['project', 'repository'].includes(entity?.type) ? 'normal' : 'inactive';
      if (['deploy-failed', 'deploy-error', 'fault'].includes(status.state)) return 'warning';
      if (['stopped', 'offline', 'unknown'].includes(status.state)) return 'inactive';
      return 'normal';
    }

    _todosMatchAnyFilter(todos, filters, now) {
      if (!filters.length) return true;
      return filters.some(filter => {
        if (filter === 'has-todos') return todos.length > 0;
        if (filter === 'no-todos') return todos.length === 0;
        if (filter === 'open') return todos.some(todo => !todo.completed);
        if (filter === 'completed') return todos.some(todo => todo.completed);
        if (filter === 'overdue') return todos.some(todo => !todo.completed && todo.dueAt && new Date(todo.dueAt) < now);
        if (filter === 'due-today') return todos.some(todo => !todo.completed && todo.dueAt && sameLocalDay(todo.dueAt, now));
        if (filter === 'reminder-today') return todos.some(todo => !todo.completed && todo.reminderAt && sameLocalDay(todo.reminderAt, now));
        return false;
      });
    }

    _hasActiveFilters(view = this._boardView()) {
      return Boolean(view.query || this._selectedEntityTypes(view).length || view.environment || view.verification !== 'all'
        || view.annotation !== 'all' || this._selectedTaskFilters(view).length || this._selectedRuntimeStates(view).length || view.label);
    }

    _activeFilterCount(view = this._boardView()) {
      return [
        view.query,
        ...this._selectedEntityTypes(view),
        view.environment,
        view.verification !== 'all',
        view.annotation !== 'all',
        ...this._selectedTaskFilters(view),
        ...this._selectedRuntimeStates(view),
        view.label
      ].filter(Boolean).length;
    }

    _entityMatchesView(entity, view, resource, placement = {}) {
      const entityTypes = this._selectedEntityTypes(view);
      if (entityTypes.length && !entityTypes.includes(entity.type)) return false;
      const runtimeStates = this._selectedRuntimeStates(view);
      if (runtimeStates.length && !runtimeStates.includes(this._entityRuntimeTone(entity))) return false;
      if (view.environment && Model.cleanText(entity.details?.environment, 80) !== view.environment) return false;
      if (view.verification !== 'all') {
        const status = Model.verificationStatus(entity, { now: this.now() });
        if (status.state !== view.verification) return false;
      }
      const annotations = normalizePlacementAnnotations(placement);
      const todos = annotations.todos || [];
      const now = new Date(this.now());
      const taskFilters = this._selectedTaskFilters(view);
      if (view.annotation === 'has-note' && !annotations.note) return false;
      if (view.label && !(annotations.labels || []).some(label => label.toLocaleLowerCase('zh-CN') === view.label.toLocaleLowerCase('zh-CN'))) return false;
      if (!this._todosMatchAnyFilter(todos, taskFilters, now)) return false;
      const query = view.query.toLocaleLowerCase('zh-CN');
      if (!query) return true;
      const details = Object.values(entity.details || {}).join(' ');
      const haystack = [
        resource?.name,
        resource?.path,
        resource?.secondary,
        entity.name,
        entity.refId,
        TYPE_LABELS[entity.type],
        details,
        entity.evidenceSummary,
        annotations.titleText,
        (annotations.labels || []).join(' '),
        annotations.note,
        todos.map(todo => todo.title).join(' ')
      ].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
      return haystack.includes(query);
    }

    _summaryVerificationState(facts) {
      const states = facts.map(fact => Model.verificationStatus(fact, { now: this.now() }).state);
      if (states.includes('unverified')) return 'unverified';
      if (states.includes('stale')) return 'stale';
      return 'verified';
    }

    _deploymentSummaryProjection(graph, entitiesById) {
      if (this._boardView().projection !== 'deployment-summary') {
        return { ...graph, summaryRelationships: [] };
      }
      if (graph.filterActive) {
        return { ...graph, summaryRelationships: [] };
      }
      const contains = graph.relationships.filter(item => item.type === 'contains');
      const sourceOf = graph.relationships.filter(item => item.type === 'source_of');
      const runsOn = graph.relationships.filter(item => item.type === 'runs_on');
      const sourceByRepository = new Map();
      const runsByDeployment = new Map();
      for (const relationship of sourceOf) {
        if (!sourceByRepository.has(relationship.sourceId)) sourceByRepository.set(relationship.sourceId, []);
        sourceByRepository.get(relationship.sourceId).push(relationship);
      }
      for (const relationship of runsOn) {
        if (!runsByDeployment.has(relationship.sourceId)) runsByDeployment.set(relationship.sourceId, []);
        runsByDeployment.get(relationship.sourceId).push(relationship);
      }

      const chains = [];
      for (const projectToRepository of contains) {
        for (const repositoryToDeployment of sourceByRepository.get(projectToRepository.targetId) || []) {
          for (const deploymentToServer of runsByDeployment.get(repositoryToDeployment.targetId) || []) {
            chains.push({
              projectId: projectToRepository.sourceId,
              repositoryId: projectToRepository.targetId,
              deploymentId: repositoryToDeployment.targetId,
              serverId: deploymentToServer.targetId,
              facts: [projectToRepository, repositoryToDeployment, deploymentToServer]
            });
          }
        }
      }
      if (!chains.length) return { ...graph, summaryRelationships: [] };

      const relationshipsByEntity = new Map();
      for (const relationship of graph.relationships) {
        for (const entityId of [relationship.sourceId, relationship.targetId]) {
          if (!relationshipsByEntity.has(entityId)) relationshipsByEntity.set(entityId, []);
          relationshipsByEntity.get(entityId).push(relationship);
        }
      }
      const protectedIds = graph.filterActive ? graph.directIds : new Set();
      let deploymentIds = new Set(chains.map(chain => chain.deploymentId).filter(entityId => {
        if (protectedIds.has(entityId)) return false;
        const relationships = relationshipsByEntity.get(entityId) || [];
        return relationships.length > 0 && relationships.every(relationship => (
          (relationship.type === 'source_of' && relationship.targetId === entityId)
          || (relationship.type === 'runs_on' && relationship.sourceId === entityId)
        ));
      }));
      let repositoryIds = new Set(chains.map(chain => chain.repositoryId).filter(entityId => {
        if (protectedIds.has(entityId)) return false;
        const relationships = relationshipsByEntity.get(entityId) || [];
        return relationships.length > 0 && relationships.every(relationship => (
          (relationship.type === 'contains' && relationship.targetId === entityId)
          || (relationship.type === 'source_of' && relationship.sourceId === entityId && deploymentIds.has(relationship.targetId))
        ));
      }));

      let changed = true;
      while (changed) {
        changed = false;
        const nextDeployments = new Set([...deploymentIds].filter(entityId => (
          (relationshipsByEntity.get(entityId) || []).every(relationship => (
            relationship.type !== 'source_of' || repositoryIds.has(relationship.sourceId)
          ))
        )));
        const nextRepositories = new Set([...repositoryIds].filter(entityId => (
          (relationshipsByEntity.get(entityId) || []).every(relationship => (
            relationship.type !== 'source_of' || nextDeployments.has(relationship.targetId)
          ))
        )));
        if (nextDeployments.size !== deploymentIds.size || nextRepositories.size !== repositoryIds.size) changed = true;
        deploymentIds = nextDeployments;
        repositoryIds = nextRepositories;
      }

      const projectedChains = chains.filter(chain => (
        repositoryIds.has(chain.repositoryId) && deploymentIds.has(chain.deploymentId)
      ));
      if (!projectedChains.length) return { ...graph, summaryRelationships: [] };
      const collapsedIds = new Set([
        ...projectedChains.map(chain => chain.repositoryId),
        ...projectedChains.map(chain => chain.deploymentId)
      ]);
      const summaries = new Map();
      for (const chain of projectedChains) {
        const key = `${chain.projectId}\u0000${chain.serverId}`;
        if (!summaries.has(key)) {
          summaries.set(key, {
            id: `summary_${chain.projectId}_${chain.serverId}`,
            type: 'deployment_summary',
            sourceId: chain.projectId,
            targetId: chain.serverId,
            chains: []
          });
        }
        summaries.get(key).chains.push(chain);
      }
      const summaryRelationships = [...summaries.values()].map(summary => {
        const deployments = [...new Set(summary.chains.map(chain => chain.deploymentId))];
        const deploymentLabels = deployments.map(entityId => {
          const entity = entitiesById.get(entityId);
          return [
            entity?.name,
            entity?.details?.environment,
            entity?.details?.version,
            entity?.details?.branch,
            entity?.details?.revision
          ].filter(Boolean).join(' · ');
        }).filter(Boolean);
        const facts = summary.chains.flatMap(chain => chain.facts);
        return {
          ...summary,
          count: deployments.length,
          label: deployments.length > 1 ? `部署 ×${deployments.length}` : '部署',
          title: deploymentLabels.join('；'),
          verificationState: this._summaryVerificationState(facts)
        };
      });
      return {
        ...graph,
        placements: graph.placements.filter(placement => !collapsedIds.has(placement.entityId)),
        relationships: graph.relationships.filter(relationship => (
          !collapsedIds.has(relationship.sourceId) && !collapsedIds.has(relationship.targetId)
        )),
        summaryRelationships,
        directIds: new Set([...graph.directIds].filter(entityId => !collapsedIds.has(entityId))),
        contextualIds: new Set([...graph.contextualIds].filter(entityId => !collapsedIds.has(entityId))),
        mutedIds: new Set([...graph.mutedIds].filter(entityId => !collapsedIds.has(entityId)))
      };
    }

    _filteredGraph() {
      const board = activeBoard(this.store);
      if (!board) return { placements: [], relationships: [], summaryRelationships: [], directIds: new Set(), contextualIds: new Set(), mutedIds: new Set(), filterActive: false };
      const view = this._boardView();
      const entitiesById = this._allEntitiesById();
      const placements = this._combinedPlacements(board);
      const boardRelationships = this._combinedRelationships(placements);
      const filterActive = this._hasActiveFilters(view);
      const directIds = new Set();
      for (const placement of placements) {
        const entity = entitiesById.get(placement.entityId);
        if (!entity) continue;
        const resource = entity.refId ? this.resourceMap.get(`${entity.type}:${entity.refId}`) : null;
        if (!filterActive || this._entityMatchesView(entity, view, resource, placement)) directIds.add(entity.id);
      }
      const contextualIds = new Set();
      if (filterActive) {
        for (const relationship of boardRelationships) {
          if (directIds.has(relationship.sourceId) || directIds.has(relationship.targetId)) {
            if (!directIds.has(relationship.sourceId)) contextualIds.add(relationship.sourceId);
            if (!directIds.has(relationship.targetId)) contextualIds.add(relationship.targetId);
          }
        }
      }
      const allIds = new Set(placements.map(placement => placement.entityId));
      const mutedIds = new Set([...allIds].filter(entityId => !directIds.has(entityId) && !contextualIds.has(entityId)));
      const hideUnmatched = filterActive && this._displayViewSettings(view).unmatchedDisplay === 'hide';
      const visibleIds = hideUnmatched ? directIds : allIds;
      return this._deploymentSummaryProjection({
        placements: placements.filter(placement => visibleIds.has(placement.entityId)),
        relationships: boardRelationships.filter(relationship => (
          visibleIds.has(relationship.sourceId) && visibleIds.has(relationship.targetId)
        )),
        directIds,
        contextualIds,
        mutedIds,
        filterActive
      }, entitiesById);
    }

    render() {
      this._closeContextMenu();
      const board = activeBoard(this.store);
      if (!this.container || !board) return;
      board.view = { ...Model.defaultBoardView(), ...(board.view || {}) };
      const displayView = this._displayViewSettings(board.view);
      const boardOptions = this.store.boards.map(candidate => (
        `<option value="${escapeHtml(candidate.id)}"${candidate.id === board.id ? ' selected' : ''}>${escapeHtml(candidate.name)}</option>`
      )).join('');
      const environmentOptions = this._environmentOptions(board.view.environment);
      const selectedEntityTypes = new Set(this._selectedEntityTypes(board.view));
      const selectedTaskFilters = new Set(this._selectedTaskFilters(board.view));
      const selectedRuntimeStates = new Set(this._selectedRuntimeStates(board.view));
      const entityTypeChecks = Model.ENTITY_TYPES.map(type => (
        `<label><input name="entityTypes" type="checkbox" value="${type}"${selectedEntityTypes.has(type) ? ' checked' : ''}><span>${TYPE_LABELS[type]}</span></label>`
      )).join('');
      const taskChecks = [
        ['has-todos', '有待办'],
        ['no-todos', '无待办'],
        ['open', '未完成'],
        ['overdue', '已逾期'],
        ['due-today', '今天截止'],
        ['reminder-today', '今天提醒'],
        ['completed', '已完成']
      ].map(([value, label]) => (
        `<label><input name="taskFilters" type="checkbox" value="${value}"${selectedTaskFilters.has(value) ? ' checked' : ''}><span>${label}</span></label>`
      )).join('');
      const runtimeChecks = [
        ['normal', '正常'],
        ['warning', '预警 / 故障'],
        ['inactive', '停止 / 无效']
      ].map(([value, label]) => (
        `<label><input name="runtimeStates" type="checkbox" value="${value}"${selectedRuntimeStates.has(value) ? ' checked' : ''}><span>${label}</span></label>`
      )).join('');
      const verificationOptions = Model.VERIFICATION_FILTERS.map(value => (
        `<option value="${value}"${board.view.verification === value ? ' selected' : ''}>${VERIFICATION_LABELS[value]}</option>`
      )).join('');
      const labelOptions = [...new Set(this._combinedPlacements(board)
        .flatMap(placement => normalizePlacementAnnotations(placement).labels || []))]
        .sort((left, right) => left.localeCompare(right, 'zh-CN'))
        .map(label => `<option value="${escapeHtml(label)}"${board.view.label === label ? ' selected' : ''}>${escapeHtml(label)}</option>`)
        .join('');
      this.container.innerHTML = `
        <section class="relationship-workspace" aria-label="关系白板">
          <nav class="whiteboard-document-tabs" aria-label="白板文档标签页">
            <button type="button" class="whiteboard-new-button" data-relationship-action="new-document" title="新建独立白板项目">＋ 新建白板</button>
            <button type="button" data-document-home aria-current="${!this.documentRecord}">本机白板</button>
            ${this.documentLibrary.filter(item => this.openDocumentIds.has(item.id)).map(item => `<button type="button" data-open-document="${escapeHtml(item.id)}" aria-current="${this.documentRecord?.id === item.id}" title="${escapeHtml(item.path)}">▧ ${escapeHtml(item.name)}</button>`).join('')}
            <span></span><button type="button" data-relationship-action="open-document">打开…</button>
            <button type="button" data-relationship-action="save-document">保存</button><button type="button" data-relationship-action="save-document-as" title="另存为独立项目文件夹，复制项目内媒体">另存为…</button>
          </nav>
          <header class="relationship-toolbar">
            <div class="relationship-board-control">
              <label class="sr-only" for="relationship-board-select">当前白板</label>
              <select id="relationship-board-select" title="切换白板">${boardOptions}</select>
              <button class="relationship-tool-button" data-relationship-action="rename-board" type="button" title="重命名白板" aria-label="重命名白板">✎</button>
            </div>
            <button class="relationship-tool-button relationship-resource-trigger${this.resourcePanelVisible ? ' is-active' : ''}" data-relationship-action="toggle-resource-panel" type="button" aria-controls="relationship-resource-panel" aria-expanded="${this.resourcePanelVisible}" aria-pressed="${this.resourcePanelVisible}" title="显示或隐藏资源库">
              <span aria-hidden="true">▤</span><span>资源</span>
            </button>
            <label class="relationship-snap-control" title="按住 Option/Alt 临时关闭吸附">
              <span>吸附</span>
              <select data-relationship-snap-mode aria-label="吸附模式">
                <option value="smart"${board.view.snapMode === 'smart' ? ' selected' : ''}>智能</option>
                <option value="grid"${board.view.snapMode === 'grid' ? ' selected' : ''}>网格</option>
                <option value="off"${board.view.snapMode === 'off' ? ' selected' : ''}>关闭</option>
              </select>
            </label>
            <button class="relationship-tool-button" data-relationship-action="create-group-from-selection" type="button" title="将选中节点建立视觉分组 (⌘G)" disabled>群组</button>
            <div class="relationship-toolbar-spacer"></div>
            <div class="relationship-panel-status" data-state="${escapeHtml(this._panelStatusView().state)}">
              <span data-panel-topology-status title="${escapeHtml(this._panelStatusView().title)}">${escapeHtml(this._panelStatusView().label)}</span>
              <button class="relationship-tool-button" data-relationship-action="refresh-panel" type="button" title="刷新 Coolify 动态拓扑" aria-label="刷新 Coolify 动态拓扑">↻</button>
              <button class="relationship-tool-button" data-relationship-action="check-endpoints" type="button" title="重新检测全部访问点（本机 HTTP 检测）" aria-label="重新检测全部访问点（本机 HTTP 检测）">◉</button>
            </div>
            <div class="relationship-display-host">
              <button class="relationship-tool-button relationship-display-trigger relationship-icon-tool" data-relationship-action="toggle-display-menu" type="button" aria-label="显示设置" title="显示设置：卡片大小、间距与颜色" aria-haspopup="dialog" aria-expanded="false">
                ${toolbarIcon('display')}
              </button>
              <div class="relationship-display-popover" role="dialog" aria-label="调整白板显示" hidden>
                <form data-relationship-display-form>
                  <header><strong>白板显示</strong><small>只影响当前白板，不修改资源数据</small></header>
                  <label class="relationship-display-select"><span>信息密度</span><select name="mode"><option value="full"${displayView.mode === 'full' ? ' selected' : ''}>完整</option><option value="compact"${displayView.mode === 'compact' ? ' selected' : ''}>精简</option></select></label>
                  <label class="relationship-display-slider">
                    <span><b>卡片大小</b><output data-display-card-scale>${Math.round(displayView.cardScale * 100)}%</output></span>
                    <input name="cardScale" type="range" min="0.8" max="1.4" step="0.05" value="${displayView.cardScale}" aria-label="卡片大小">
                  </label>
                  <label class="relationship-display-slider">
                    <span><b>文字大小</b><output data-display-text-scale>${Math.round(displayView.textScale * 100)}%</output></span>
                    <input name="textScale" type="range" min="0.85" max="1.3" step="0.05" value="${displayView.textScale}" aria-label="文字大小">
                  </label>
                  <label class="relationship-display-slider"><span><b>卡片基础宽度</b><output data-display-card-width>${displayView.cardWidth} px</output></span><input name="cardWidth" type="range" min="220" max="600" step="10" value="${displayView.cardWidth}" aria-label="卡片宽度"></label>
                  <label class="relationship-display-slider"><span><b>简略卡片最小高度</b><output data-display-card-height>${displayView.cardHeight} px</output></span><input name="cardHeight" type="range" min="143" max="420" step="1" value="${displayView.cardHeight}" aria-label="卡片高度"></label>
                  <small>宽高随卡片缩放比例变化；详情按内容增高，文字和图片元素单独调节。</small>
                  <label class="relationship-display-slider">
                    <span><b>横向间距</b><output data-display-horizontal-spacing>${Math.round(displayView.horizontalSpacing)} px</output></span>
                    <input name="horizontalSpacing" type="range" min="16" max="180" step="4" value="${displayView.horizontalSpacing}" aria-label="卡片横向间距">
                  </label>
                  <label class="relationship-display-slider">
                    <span><b>纵向间距</b><output data-display-vertical-spacing>${Math.round(displayView.verticalSpacing)} px</output></span>
                    <input name="verticalSpacing" type="range" min="16" max="140" step="4" value="${displayView.verticalSpacing}" aria-label="卡片纵向间距">
                  </label>
                  <small>调整尺寸或间距时，列间距与群组边界同步适配；手动群组保留排列顺序和额外留白。</small>
                  <label class="relationship-display-slider">
                    <span><b>状态底色</b><output data-display-status-tint>${Math.round(displayView.statusTintOpacity * 100)}%</output></span>
                    <input name="statusTintOpacity" type="range" min="0" max="0.18" step="0.01" value="${displayView.statusTintOpacity}" aria-label="状态底色强度">
                  </label>
                  <label class="relationship-display-slider">
                    <span><b>一跳上下文</b><output data-display-context-opacity>${Math.round(displayView.filterContextOpacity * 100)}%</output></span>
                    <input name="filterContextOpacity" type="range" min="0.15" max="0.8" step="0.01" value="${displayView.filterContextOpacity}" aria-label="一跳上下文可视度">
                  </label>
                  <label class="relationship-display-slider">
                    <span><b>其他未命中项</b><output data-display-muted-opacity>${Math.round(displayView.filterMutedOpacity * 100)}%</output></span>
                    <input name="filterMutedOpacity" type="range" min="0.03" max="0.4" step="0.01" value="${displayView.filterMutedOpacity}" aria-label="其他未命中项可视度">
                  </label>
                  <label class="relationship-display-slider">
                    <span><b>命中高亮</b><output data-display-match-halo>${Math.round(displayView.filterMatchHaloOpacity * 100)}%</output></span>
                    <input name="filterMatchHaloOpacity" type="range" min="0" max="0.6" step="0.01" value="${displayView.filterMatchHaloOpacity}" aria-label="筛选命中高亮强度">
                  </label>
                  <label class="relationship-display-select"><span>卡片层次</span><select name="cardAppearance"><option value="elevated"${displayView.cardAppearance === 'elevated' ? ' selected' : ''}>层次阴影</option><option value="flat"${displayView.cardAppearance === 'flat' ? ' selected' : ''}>简洁平面</option></select></label>
                  <label class="relationship-display-select"><span>默认标题内容</span><select name="cardTitleSource"><option value="name"${displayView.cardTitleSource === 'name' ? ' selected' : ''}>资源名称</option><option value="note"${displayView.cardTitleSource === 'note' ? ' selected' : ''}>卡片备注</option></select></label>
                  <div class="relationship-display-toggles">
                    <label><input name="showGrid" type="checkbox"${displayView.showGrid ? ' checked' : ''}><span>显示画布网格</span></label>
                    <label><input name="showEdgeLabels" type="checkbox"${displayView.showEdgeLabels ? ' checked' : ''}><span>显示关系文字</span></label>
                    <label><input name="showRuntimeStatus" type="checkbox"${displayView.showRuntimeStatus ? ' checked' : ''}><span>显示服务状态</span></label>
                  </div>
                  <footer><button type="button" data-relationship-action="reset-display-settings">恢复默认显示</button></footer>
                </form>
              </div>
            </div>
            <button class="relationship-tool-button relationship-icon-tool" data-relationship-action="toggle-all-card-details" type="button" aria-label="展开全部" aria-pressed="false" title="展开全部卡片详情">${toolbarIcon('expand')}</button>
            <div class="relationship-filter-host">
              <button class="relationship-tool-button relationship-filter-trigger relationship-icon-tool" data-relationship-action="toggle-filter-menu" type="button" aria-label="筛选" title="筛选：可同时选择多个条件" aria-haspopup="dialog" aria-expanded="false">
                ${toolbarIcon('filter')}<span class="relationship-filter-count" hidden></span>
              </button>
              <div class="relationship-filter-popover" role="dialog" aria-label="筛选白板内容" hidden>
                <form data-relationship-filter-form>
                  <header><strong>筛选白板内容</strong><small>匹配结果会保留一跳关系上下文</small></header>
                  <label class="relationship-filter-search">
                    <span aria-hidden="true">⌕</span>
                    <input name="query" type="search" maxlength="120" placeholder="搜索名称、环境或说明" value="${escapeHtml(board.view.query)}" autocomplete="off">
                  </label>
                  <div class="relationship-filter-grid">
                    <input name="entityType" type="hidden" value="all">
                    <input name="task" type="hidden" value="all">
                    <fieldset class="relationship-filter-check-group"><legend>节点类型 · 可多选</legend><div>${entityTypeChecks}</div></fieldset>
                    <fieldset class="relationship-filter-check-group"><legend>运行状态 · 可多选</legend><div>${runtimeChecks}</div></fieldset>
                    <fieldset class="relationship-filter-check-group relationship-filter-check-group-wide"><legend>待办 · 可多选</legend><div>${taskChecks}</div></fieldset>
                    <label><span>环境</span><select name="environment">${environmentOptions}</select></label>
                    <label><span>核验状态</span><select name="verification">${verificationOptions}</select></label>
                    <label><span>注释</span><select name="annotation"><option value="all"${board.view.annotation === 'all' ? ' selected' : ''}>全部</option><option value="has-note"${board.view.annotation === 'has-note' ? ' selected' : ''}>有备注</option></select></label>
                    <label><span>标签</span><select name="label"><option value="">全部标签</option>${labelOptions}</select></label>
                    <label><span>未命中项</span><select name="unmatchedDisplay"><option value="dim"${displayView.unmatchedDisplay === 'dim' ? ' selected' : ''}>低可视保留</option><option value="hide"${displayView.unmatchedDisplay === 'hide' ? ' selected' : ''}>隐藏</option></select></label>
                    <label><span>节点显示</span><select name="mode"><option value="full"${board.view.mode === 'full' ? ' selected' : ''}>完整</option><option value="compact"${board.view.mode === 'compact' ? ' selected' : ''}>精简</option></select></label>
                    <label><span>关系层级</span><select name="projection"><option value="facts"${board.view.projection === 'facts' ? ' selected' : ''}>完整事实</option><option value="deployment-summary"${board.view.projection === 'deployment-summary' ? ' selected' : ''}>部署摘要</option></select></label>
                  </div>
                  <footer><span class="relationship-filter-summary" role="status"></span><button type="button" data-relationship-action="clear-filters">清除筛选</button></footer>
                </form>
              </div>
            </div>
            <div class="relationship-menu-host">
              <button class="relationship-tool-button relationship-add-trigger relationship-icon-tool" data-relationship-action="toggle-add-menu" type="button" aria-label="添加节点" title="添加文字、图片、文件或关系节点" aria-haspopup="menu" aria-expanded="false">
                ${toolbarIcon('add')}
              </button>
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
              </div>
            </div>
            <span class="relationship-toolbar-divider" aria-hidden="true"></span>
            <button class="relationship-tool-button" data-relationship-action="undo" type="button" title="撤销 (⌘Z)" ${this.undoStack.length ? '' : 'disabled'}>↶</button>
            <button class="relationship-tool-button" data-relationship-action="redo" type="button" title="重做 (⇧⌘Z)" ${this.redoStack.length ? '' : 'disabled'}>↷</button>
            <button class="relationship-tool-button relationship-icon-tool" data-relationship-action="fit" type="button" aria-label="适合内容" title="适合内容：将整个白板放入视图">${toolbarIcon('fit')}</button>
            <button class="relationship-tool-button relationship-icon-tool" data-relationship-action="reset-dynamic-layout" type="button" aria-label="整理布局" title="按拓扑与原有位置整理，保留群组归属与组内相对位置">${toolbarIcon('layout')}</button>
            <button class="relationship-tool-button relationship-icon-tool" data-relationship-action="arrange-by-coolify-projects" type="button" aria-label="初始化分组" title="按 Coolify Projects 初始化分组并保存；一次性操作，再次点击会重新整理，支持撤销">${toolbarIcon('group')}</button>
            <select class="relationship-layout-select" data-relationship-layout aria-label="整理操作" title="执行一次整理并保存结果，不是持续显示模式">
              <option value="" selected disabled>整理…</option>
              <option value="lanes">按类别分列</option>
              <option value="coolify-projects">初始化 Coolify Projects 分组</option>
              <option value="selection-centered">围绕我（选中卡片）</option>
              <option value="server-centered">服务器为中心</option>
            </select>
            <span class="relationship-save-state" data-state="${this.saveState}" role="status">${this._saveLabel()}</span>
          </header>
          <div class="relationship-body">
            <div class="relationship-panel-dock relationship-inline-left-dock" data-panel-dock="left"></div>
            <aside class="relationship-resource-panel relationship-dock-component" data-panel-id="library" id="relationship-resource-panel" aria-label="白板资源库">
              <div class="relationship-resource-heading">
                <button class="relationship-resource-library-trigger" type="button" data-panel-collapse="library" aria-label="折叠或展开资源库"><span>资源库</span><span class="relationship-library-disclosure" aria-hidden="true">▼</span></button>
                <div class="relationship-resource-heading-actions">
                  <span data-resource-total>${this._resourceCatalog().length}</span>
                  ${this._panelMoveControls('library', '资源库')}
                </div>
              </div>
              <div class="relationship-library-body">
              <label class="relationship-resource-search">
                <span aria-hidden="true">⌕</span>
                <input type="search" placeholder="搜索资源名称或路径" value="${escapeHtml(this.resourceSearch)}" aria-label="搜索资源名称或路径">
              </label>
              <div class="relationship-resource-list"></div>
              <button class="relationship-secondary-button relationship-repository-scan" type="button" data-relationship-action="scan-repositories" title="全局操作：扫描全部受管位置并匹配所有部署；不 fetch、不修改 Git" ${this.repositoryScanning || !this.bridge?.repos?.merge ? 'disabled' : ''}>${this.repositoryScanning ? '全局扫描中…' : '扫描本地仓库'}</button>
              <div class="relationship-boundary-note" data-repository-scan-result role="status">${escapeHtml(this.repositoryScanSummary)}</div>
              <div class="relationship-boundary-note">本机目录只用于定位；云端资源使用稳定身份。不会部署、连接服务器或修改 Git。</div>
              </div>
            </aside>
            <div class="relationship-canvas" tabindex="0" aria-label="关系画布。滚轮或双指移动视图，Ctrl/Cmd 加滚轮或双指捏合缩放。拖动元素或群组空白移动，点击群组标题显示工具条，拖动画布空白框选；空格加拖动或中键拖动平移。WASD 或方向键平移，Shift 加速；Alt/Option 加方向键移动选中节点。" aria-keyshortcuts="W A S D ArrowUp ArrowLeft ArrowDown ArrowRight Space">
              <div class="relationship-world">
                <svg class="relationship-edge-layer" aria-label="节点关系"></svg>
                <div class="relationship-guide-layer" aria-hidden="true"></div>
                <div class="relationship-node-layer"></div>
                <div class="relationship-selection-box" hidden></div>
              </div>
              <div class="relationship-selection-toolbar" role="toolbar" aria-label="白板元素快捷工具条" hidden></div>
              <aside class="relationship-navigator" aria-label="全景导航">
                <header><button type="button" data-relationship-action="toggle-minimap" aria-expanded="${!this.minimapCollapsed}" title="展开或收起全景导航">▧ <span>全景导航</span> <span data-minimap-toggle>${this.minimapCollapsed ? '⌃' : '⌄'}</span></button><button type="button" data-relationship-action="fit" title="适合全部内容" aria-label="适合全部内容">⛶</button></header>
                <svg data-relationship-minimap viewBox="0 0 220 128" role="img" aria-label="白板全景，点击或拖动定位视图"${this.minimapCollapsed ? ' hidden' : ''}></svg>
                <footer><button type="button" data-relationship-action="zoom-out" aria-label="缩小视图">−</button><button type="button" data-relationship-action="zoom-reset" title="恢复 100%" data-zoom-label>100%</button><button type="button" data-relationship-action="zoom-in" aria-label="放大视图">＋</button></footer>
              </aside>
              <div class="relationship-canvas-help">画布空白拖动框选 · 群组空白拖动 · 组标题工具条 · 滚轮平移 · Ctrl/⌘+滚轮缩放 · 空格/中键平移 · ⌘/Ctrl+G 成组</div>
              <div class="relationship-projection-note" hidden>部署摘要 · 派生显示，不修改关系事实</div>
            </div>
            <aside class="relationship-inspector-panel relationship-dock-component" data-panel-id="inspector" aria-label="关系详情" hidden></aside>
            <div class="relationship-panel-dock relationship-right-dock" data-panel-dock="right"></div>
          </div>
          <div class="relationship-context-menu" role="menu" aria-label="白板右键菜单" hidden></div>
        </section>`;
      this.root = this.container.querySelector('.relationship-workspace');
      this.panelSidebarRoot = this.root.ownerDocument.querySelector('#relationship-resource-sidebar-content');
      if (this.panelSidebarRoot) {
        this.panelSidebarRoot.replaceChildren();
        this.panelSidebarRoot.closest('#relationship-resource-sidebar-section').hidden = false;
        for (const [type, handler] of Object.entries(this._panelEvents)) {
          this.panelSidebarRoot.removeEventListener(type, handler);
          this.panelSidebarRoot.addEventListener(type, handler);
        }
      }
      this._bindRootEvents();
      this._applyViewMode();
      this._renderResources();
      this._renderGraph();
      this._updateFilterSummary();
      this._updateSummary();
      this._updatePanelStatus();
      this._applyResourcePanelPosition();
      this._placePanelComponents();
      this._scheduleTaskReminders();
    }

    _scheduleTaskReminders() {
      if (this.reminderTimer) clearTimeout(this.reminderTimer);
      this.reminderTimer = null;
      if (!this.root?.isConnected) return;
      const now = new Date(this.now());
      if (!Number.isFinite(now.getTime())) return;
      const entities = this._allEntitiesById();
      let nextAt = Infinity;
      for (const placement of this._combinedPlacements()) {
        for (const todo of normalizePlacementAnnotations(placement).todos || []) {
          if (todo.completed || !todo.reminderAt) continue;
          const reminderAt = new Date(todo.reminderAt).getTime();
          if (!Number.isFinite(reminderAt)) continue;
          const key = `${placement.entityId}:${todo.id}:${todo.reminderAt}`;
          if (reminderAt <= now.getTime()) {
            if (!this.remindedTodoKeys.has(key)) {
              this.remindedTodoKeys.add(key);
              this.notify(`待办提醒：${this._entityDisplayName(entities.get(placement.entityId))} · ${todo.title}`, 'info');
            }
          } else nextAt = Math.min(nextAt, reminderAt);
        }
      }
      if (Number.isFinite(nextAt)) {
        this.reminderTimer = setTimeout(() => this._scheduleTaskReminders(), Math.min(2_147_000_000, Math.max(250, nextAt - now.getTime())));
        this.reminderTimer.unref?.();
      }
    }

    _panelElement(selector) {
      return this.root?.querySelector(selector) || this.panelSidebarRoot?.querySelector(selector);
    }

    _panelDocks() {
      return [this.panelSidebarRoot || this.root?.querySelector('[data-panel-dock="left"]'), this.root?.querySelector('[data-panel-dock="right"]')];
    }

    _panelMoveControls(key, label) {
      const side = this.panelLayout[key]?.side || (key === 'inspector' ? 'right' : this.panelLayout.library?.side || 'left');
      const destination = side === 'left' ? 'right' : 'left';
      return `<span class="relationship-panel-move-controls">
        <button type="button" draggable="true" data-panel-drag="${escapeHtml(key)}" aria-label="拖动${escapeHtml(label)}组件" title="拖到左侧或右侧停靠区">⠿</button>
        <button type="button" data-panel-key="${escapeHtml(key)}" data-panel-side="${destination}" aria-label="将${escapeHtml(label)}移到${destination === 'left' ? '左' : '右'}侧" title="移到${destination === 'left' ? '左' : '右'}侧">${destination === 'left' ? '⇤' : '⇥'}</button>
      </span>`;
    }

    _savePanelLayout() {
      return this.bridge?.config?.set?.('relationshipPanelLayout', clone(this.panelLayout))?.catch(error => {
        this.notify(`面板布局保存失败：${error?.message || error}`, 'error');
      });
    }

    _setPanelSide(key, side, beforeKey) {
      if (!['left', 'right'].includes(side) || (key !== 'library' && key !== 'inspector' && !key.startsWith('resource:'))) return false;
      const previous = this.panelLayout[key] || {};
      this.panelLayout[key] = { ...previous, side, ...(key.startsWith('resource:') ? { detached: true } : {}) };
      const dock = this._panelDocks()[side === 'left' ? 0 : 1];
      const keys = [...dock?.children || []].map(item => item.dataset.panelId).filter(id => id && id !== key);
      const before = keys.indexOf(beforeKey);
      keys.splice(before < 0 ? keys.length : before, 0, key);
      keys.forEach((id, order) => { this.panelLayout[id] = { ...this.panelLayout[id], side, order }; });
      this._placePanelComponents();
      this._savePanelLayout();
      return true;
    }

    _togglePanelCollapsed(key) {
      const side = this.panelLayout[key]?.side || (key === 'inspector' ? 'right' : 'left');
      this.panelLayout[key] = { ...this.panelLayout[key], side, collapsed: !this.panelLayout[key]?.collapsed };
      if (key === 'library') {
        this.resourcePanelVisible = !this.panelLayout[key].collapsed;
        this._syncResourcePanelVisibility();
      }
      this._placePanelComponents();
      this._savePanelLayout();
    }

    _placePanelComponents() {
      const docks = this._panelDocks();
      if (!docks[0] || !docks[1]) return;
      const all = [...this.root.querySelectorAll('[data-panel-id]'), ...this.panelSidebarRoot?.querySelectorAll('[data-panel-id]') || []];
      const components = all.filter(panel => !panel.dataset.panelId.startsWith('resource:') || this.panelLayout[panel.dataset.panelId]?.detached);
      for (const [index, dock] of docks.entries()) {
        const side = index ? 'right' : 'left';
        const ordered = components.filter(panel => (this.panelLayout[panel.dataset.panelId]?.side || (panel.dataset.panelId === 'inspector' ? 'right' : 'left')) === side)
          .sort((a, b) => (this.panelLayout[a.dataset.panelId]?.order || 0) - (this.panelLayout[b.dataset.panelId]?.order || 0));
        ordered.forEach((panel, order) => {
          if (dock.children[order] !== panel) dock.insertBefore(panel, dock.children[order] || null);
          if (!panel.dataset.panelId.startsWith('resource:')) panel.classList.toggle('is-collapsed', this.panelLayout[panel.dataset.panelId]?.collapsed === true);
          panel.querySelector('[data-panel-collapse]')?.setAttribute('aria-expanded', String(!panel.classList.contains('is-collapsed')));
        });
      }
      for (const area of [this.root, this.panelSidebarRoot].filter(Boolean)) {
        area.querySelectorAll('[data-panel-side]').forEach(button => {
          const key = button.dataset.panelKey;
          const side = this.panelLayout[key]?.side || (key === 'inspector' ? 'right' : this.panelLayout.library?.side || 'left');
          const next = side === 'left' ? 'right' : 'left';
          button.dataset.panelSide = next;
          button.textContent = next === 'left' ? '⇤' : '⇥';
          button.title = `移到${next === 'left' ? '左' : '右'}侧`;
          const label = button.getAttribute('aria-label')?.replace(/移到[左右]侧$/, '') || '将组件';
          button.setAttribute('aria-label', `${label}移到${next === 'left' ? '左' : '右'}侧`);
        });
      }
      this._applyViewport();
    }

    _clearPanelDrag() {
      this.draggedPanelKey = '';
      this.root?.classList.remove('panel-drag-active');
      this.panelSidebarRoot?.classList.remove('panel-drag-active');
    }

    _syncResourcePanelVisibility() {
      const panel = this._panelElement('.relationship-resource-panel');
      const trigger = this.root?.querySelector('.relationship-resource-trigger');
      if (panel) panel.classList.toggle('is-collapsed', !this.resourcePanelVisible);
      if (trigger) {
        trigger.classList.toggle('is-active', this.resourcePanelVisible);
        trigger.setAttribute('aria-expanded', String(this.resourcePanelVisible));
        trigger.setAttribute('aria-pressed', String(this.resourcePanelVisible));
      }
      if (this.resourcePanelVisible) this._applyResourcePanelPosition();
    }

    _applyResourcePanelPosition(nextPosition = this.resourcePanelPosition) {
      const body = this.root?.querySelector('.relationship-body');
      const canvas = this.root?.querySelector('.relationship-canvas');
      const panel = this.root?.querySelector('.relationship-resource-panel');
      if (!body || !canvas || !panel || panel.hidden) return;
      const inset = 8;
      const maxX = Math.max(inset, canvas.clientWidth - panel.offsetWidth - inset);
      const maxY = Math.max(inset, body.clientHeight - panel.offsetHeight - inset);
      this.resourcePanelPosition = {
        x: Math.round(Math.min(maxX, Math.max(inset, Number(nextPosition?.x) || inset))),
        y: Math.round(Math.min(maxY, Math.max(inset, Number(nextPosition?.y) || inset)))
      };
      panel.style.setProperty('--relationship-resource-x', `${this.resourcePanelPosition.x}px`);
      panel.style.setProperty('--relationship-resource-y', `${this.resourcePanelPosition.y}px`);
    }

    _bindRootEvents() {
      this.root.addEventListener('contextmenu', event => this._handleContextMenu(event));
      this.root.addEventListener('click', event => this._handleClick(event));
      this.root.addEventListener('change', event => this._handleChange(event));
      this.root.addEventListener('input', event => this._handleInput(event));
      this.root.addEventListener('submit', event => this._handleSubmit(event));
      this.root.addEventListener('dragstart', event => this._handleDragStart(event));
      this.root.addEventListener('dragover', event => this._handleDragOver(event));
      this.root.addEventListener('drop', event => this._handleDrop(event));
      this.root.addEventListener('dragend', () => this._clearPanelDrag());
      this.root.addEventListener('pointerdown', event => this._handlePointerDown(event));
      this.root.addEventListener('dblclick', event => {
        const element = event.target.closest('.whiteboard-free-element');
        if (element && !event.target.closest('button')) void this._editCanvasElement(element.dataset.entityId);
      });
      this.root.addEventListener('pointermove', event => this._handlePointerMove(event));
      this.root.addEventListener('pointerup', event => this._handlePointerUp(event));
      this.root.addEventListener('pointercancel', () => this._cancelPointerAction(false));
      this.root.addEventListener('lostpointercapture', event => {
        if (event.pointerId === this.pointerAction?.pointerId) this._cancelPointerAction(false);
      });
      this.root.querySelector('.relationship-canvas')?.addEventListener('wheel', event => this._handleWheel(event), { passive: false });
    }

    _contextMenuItems(kind) {
      const items = [];
      const command = (label, action, disabled = false) => ({ label, action, disabled });
      const context = (label, contextAction, disabled = false) => ({ label, contextAction, disabled });
      if (kind === 'relationship') {
        const editable = this.store.relationships.some(item => item.id === this.selectedRelationshipId);
        items.push(context(editable ? '编辑关系…' : '查看关系详情', 'inspector'));
        if (editable) items.push(command('反转方向', 'reverse-relationship'), context('删除关系', 'delete'));
      } else if (kind === 'node') {
        const entities = this._allEntitiesById();
        const selected = [...this._entitySelectionIds()].map(id => entities.get(id)).filter(Boolean);
        const single = selected.length === 1 ? selected[0] : null;
        const cards = selected.filter(item => !['group', 'text', 'image', 'attachment'].includes(item.type));
        const allExpanded = cards.length > 0 && cards.every(item => this.expandedCardIds.has(item.id));
        items.push(context(single?.type === 'group' ? '群组设置…' : '查看属性…', 'inspector'));
        if (single && ['text', 'image', 'attachment'].includes(single.type)) items.push(context('编辑内容 / 名称…', 'edit-element'));
        else if (single) items.push(context(single.type === 'group' ? '重命名群组…' : '重命名 / 显示别名…', 'rename'), context('备注、标签与待办…', 'annotations'));
        if (single && !(single.type === 'group' && single.transient)) items.push(command('围绕我布局', 'arrange-around-selection'));
        if (cards.length) items.push(context(allExpanded ? '收起所选卡片详情' : '展开所选卡片详情', 'details'));
        items.push(null, command('将所选卡片组成群组…', 'create-group-from-selection', this._selectedMemberPlacements().length < 2));
        if (this._selectedMemberPlacements().some(item => item.groupId)) items.push(command('移出所属群组', 'remove-selection-group'));
        // Live topology is read-only: never offer a partially effective mixed-selection deletion.
        if (selected.every(item => item.type === 'group' || !item.transient && activeBoard(this.store).placements.some(placement => placement.entityId === item.id))) items.push(context(selected.every(item => item.type === 'group') ? '解散群组（保留成员）' : '从白板移除', 'delete'));
      } else {
        items.push(context('全选当前可见节点', 'select-all'), null,
          { label: '添加文字…', nodeType: 'text' },
          { label: '添加图片…', nodeType: 'image' },
          { label: '添加群组…', nodeType: 'group' },
          { label: '添加服务器…', nodeType: 'server' },
          { label: '添加部署…', nodeType: 'deployment' },
          { label: '添加访问点…', nodeType: 'endpoint' }, null,
          command('展开 / 收起全部详情', 'toggle-all-card-details'),
          command('适合画布', 'fit'), command('按类别分列', 'arrange-by-category'), command('初始化分组（Coolify Projects）', 'arrange-by-coolify-projects'), command('服务器为中心', 'arrange-around-servers'));
      }
      items.push(null, command('撤销', 'undo', !this.undoStack.length), command('重做', 'redo', !this.redoStack.length));
      return items;
    }

    _handleContextMenu(event) {
      const target = event.target;
      if (!target.closest?.('.relationship-canvas')
        || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.pointerAction) this._cancelPointerAction(false);
      this.keyboardConnectSourceId = '';
      const node = target.closest('.relationship-node');
      const edge = target.closest('[data-relationship-id]');
      if (node) {
        if (!this._entitySelectionIds().has(node.dataset.entityId)) this._selectOnlyEntity(node.dataset.entityId);
      } else {
        this._clearEntitySelection();
        this.selectedRelationshipId = edge?.dataset.relationshipId || '';
      }
      this._updateSelectionCss({ preserveDirtyInspector: true });
      this._updateSummary();
      this._closeFilterPopover();
      this._closeDisplayPopover();
      this._closeAddMenu();
      const menu = this.root.querySelector('.relationship-context-menu');
      if (!menu) return;
      this.contextMenuPoint = this._clientToWorld(event.clientX, event.clientY);
      menu.innerHTML = this._contextMenuItems(node ? 'node' : edge ? 'relationship' : 'canvas').map(item => {
        if (!item) return '<div class="relationship-menu-separator" role="separator"></div>';
        const attribute = item.contextAction ? `data-board-context-action="${item.contextAction}"`
          : item.nodeType ? `data-add-node-type="${item.nodeType}"` : `data-relationship-action="${item.action}"`;
        return `<button role="menuitem" type="button" ${attribute}${item.disabled ? ' disabled' : ''}${item.contextAction === 'delete' ? ' class="is-destructive"' : ''}>${escapeHtml(item.label)}</button>`;
      }).join('');
      menu.hidden = false;
      const view = this.root.ownerDocument.defaultView;
      menu.style.left = `${Math.max(8, Math.min(event.clientX, view.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(event.clientY, view.innerHeight - menu.offsetHeight - 8))}px`;
      menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    }

    _closeContextMenu(restoreFocus = false) {
      const menu = this.root?.querySelector('.relationship-context-menu');
      if (!menu || menu.hidden) return;
      menu.hidden = true;
      this.contextMenuPoint = null;
      if (restoreFocus) this.root.querySelector('.relationship-canvas')?.focus({ preventScroll: true });
    }

    _runContextAction(action) {
      this._closeContextMenu(true);
      if (action === 'edit-element') return this._editCanvasElement([...this._entitySelectionIds()][0]);
      if (action === 'delete') return this._deleteSelection();
      if (action === 'select-all') {
        this._setEntitySelection(new Set(this._filteredGraph().placements.map(item => item.entityId)));
        this._updateSelectionCss();
        this._updateSummary();
        return;
      }
      if (action === 'details') {
        const entities = this._allEntitiesById();
        const ids = [...this._entitySelectionIds()].filter(id => !['group', 'text', 'image', 'attachment'].includes(entities.get(id)?.type));
        const collapse = ids.every(id => this.expandedCardIds.has(id));
        ids.forEach(id => collapse ? this.expandedCardIds.delete(id) : this.expandedCardIds.add(id));
        this._persistExpandedCards(ids);
        this._renderGraph();
        return;
      }
      this._updateSelectionCss({ preserveDirtyInspector: true });
      const panel = this._panelElement('.relationship-inspector-panel');
      const fact = this._selectedFact()?.value;
      const group = fact?.type === 'group' && !fact.transient;
      const selector = action === 'rename' ? (group ? '[name="name"]' : '[name="placementTitleText"]')
        : action === 'annotations' ? '[name="placementNote"]' : 'input, select, button';
      const field = panel?.querySelector(selector);
      const details = field?.closest('details');
      if (details) details.open = true;
      field?.scrollIntoView({ block: 'nearest' });
      field?.focus({ preventScroll: true });
    }

    _handleContextMenuKeydown(event) {
      const menu = this.root.querySelector('.relationship-context-menu');
      if (!menu || menu.hidden) return false;
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        this._closeContextMenu(true);
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
        const current = buttons.indexOf(this.root.ownerDocument.activeElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[index]?.focus();
      } else if (!['Enter', ' '].includes(event.key)) event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }

    _handleClick(event) {
      this._stopWheelPan();
      const endpointCheck = event.target.closest('[data-endpoint-check]');
      if (endpointCheck) {
        const entity = this._allEntitiesById().get(endpointCheck.dataset.endpointCheck);
        if (!endpointCheck.disabled && entity?.runtime?.dynamicKind === 'panel-endpoint') {
          void this._refreshEndpointChecks({ providerId: entity.runtime.providerId, url: entity.runtime.url, force: true });
        }
        return;
      }
      const move = event.target.closest('[data-panel-side]');
      if (move) { this._setPanelSide(move.dataset.panelKey, move.dataset.panelSide); return; }
      const collapse = event.target.closest('[data-panel-collapse]');
      if (collapse) { this._togglePanelCollapsed(collapse.dataset.panelCollapse); return; }
      const contextItem = event.target.closest('[data-board-context-action]');
      if (contextItem) {
        if (!contextItem.disabled) this._runContextAction(contextItem.dataset.boardContextAction);
        return;
      }
      const contextPoint = event.target.closest('.relationship-context-menu') ? this.contextMenuPoint : null;
      this._closeContextMenu(Boolean(contextPoint));
      const action = event.target.closest('[data-relationship-action]')?.dataset.relationshipAction;
      const documentButton = event.target.closest('[data-open-document]');
      if (documentButton) { void this._openDocument(documentButton.dataset.openDocument); return; }
      if (event.target.closest('[data-document-home]')) { void this._showLocalWorkspace(); return; }
      const removeDocument = event.target.closest('[data-remove-document], [data-trash-document]');
      if (removeDocument) { void this._removeDocument(removeDocument.dataset.removeDocument || removeDocument.dataset.trashDocument, Boolean(removeDocument.dataset.trashDocument)).catch(error => this.notify(error.message, 'error')); return; }
      if (action === 'open-document') { void this._openDocument(); return; }
      if (action === 'import-package') { this._closeAddMenu(); void this._openDocument(null, true); return; }
      if (action === 'export-package') { this._closeAddMenu(); void this._exportPackage(); return; }
      if (action === 'new-document') { void this._newDocument(); return; }
      if (action === 'add-files') { void this._addFiles(); return; }
      const reveal = event.target.closest('[data-reveal-asset]');
      if (reveal && this.documentRecord) { void this.bridge.relationshipBoards.revealAsset({ id: this.documentRecord.id, entityId: reveal.dataset.revealAsset }).catch(error => this.notify(error.message, 'error')); return; }
      if (action === 'save-document' || action === 'save-document-as') { void this._saveDocument(action.endsWith('-as')); return; }
      if (action === 'add-text' || action === 'add-image') { void this._createCanvasElement(action === 'add-text' ? 'text' : 'image'); return; }
      const editElement = event.target.closest('[data-edit-canvas-element]');
      if (editElement) { void this._editCanvasElement(editElement.dataset.editCanvasElement); return; }
      const lockElement = event.target.closest('[data-lock-canvas-element]');
      if (lockElement) {
        this._recordMutation();
        const placement = this._placementForEntity(lockElement.dataset.lockCanvasElement);
        if (placement.locked) delete placement.locked; else placement.locked = true;
        this._persistSoon(0); this._renderGraph(); return;
      }
      if (action === 'check-endpoints') {
        void this._refreshEndpointChecks({ force: true });
        return;
      }
      if (action === 'scan-repositories') {
        void this._scanManagedRepositories();
        return;
      }
      if (action === 'toggle-minimap') {
        this.minimapCollapsed = !this.minimapCollapsed;
        const svg = this.root.querySelector('[data-relationship-minimap]');
        svg.toggleAttribute('hidden', this.minimapCollapsed);
        this.root.querySelector('[data-minimap-toggle]').textContent = this.minimapCollapsed ? '⌃' : '⌄';
        event.target.closest('button').setAttribute('aria-expanded', String(!this.minimapCollapsed));
        this._updateMinimap();
        return;
      }
      if (['zoom-in', 'zoom-out', 'zoom-reset'].includes(action)) {
        const canvas = this.root.querySelector('.relationship-canvas');
        const zoom = activeBoard(this.store).viewport.zoom;
        this._zoomViewport(action === 'zoom-reset' ? 1 : zoom * (action === 'zoom-in' ? 1.2 : 1 / 1.2), canvas.clientWidth / 2, canvas.clientHeight / 2);
        return;
      }
      if (action === 'toggle-filter-menu') {
        const popover = this.root.querySelector('.relationship-filter-popover');
        const trigger = this.root.querySelector('.relationship-filter-trigger');
        const addMenu = this.root.querySelector('.relationship-add-menu');
        const addTrigger = this.root.querySelector('.relationship-add-trigger');
        popover.hidden = !popover.hidden;
        trigger.setAttribute('aria-expanded', popover.hidden ? 'false' : 'true');
        if (!popover.hidden) {
          addMenu.hidden = true;
          addTrigger.setAttribute('aria-expanded', 'false');
          this._closeDisplayPopover();
          requestAnimationFrame(() => popover.querySelector('input')?.focus());
        }
        return;
      }
      if (action === 'clear-filters') {
        const board = activeBoard(this.store);
        const { mode, projection, snapMode, topologyLayout } = this._boardView();
        board.view = {
          ...Model.defaultBoardView(),
          ...this._displayViewSettings(),
          mode,
          projection: projection || 'facts',
          snapMode, topologyLayout
        };
        const form = this.root.querySelector('[data-relationship-filter-form]');
        if (form) {
          form.elements.namedItem('query').value = '';
          form.elements.namedItem('entityType').value = 'all';
          form.querySelectorAll('[name="entityTypes"], [name="taskFilters"], [name="runtimeStates"]').forEach(input => { input.checked = false; });
          form.elements.namedItem('environment').value = '';
          form.elements.namedItem('verification').value = 'all';
          form.elements.namedItem('annotation').value = 'all';
          form.elements.namedItem('task').value = 'all';
          form.elements.namedItem('label').value = '';
        }
        this._persistSoon(0);
        this._renderGraph();
        this._scheduleTaskReminders();
        this._updateFilterSummary();
        this._updateSummary();
        return;
      }
      if (action === 'toggle-add-menu') {
        const menu = this.root.querySelector('.relationship-add-menu');
        const trigger = this.root.querySelector('.relationship-add-trigger');
        const filterPopover = this.root.querySelector('.relationship-filter-popover');
        const filterTrigger = this.root.querySelector('.relationship-filter-trigger');
        menu.hidden = !menu.hidden;
        trigger.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
        if (!menu.hidden) {
          filterPopover.hidden = true;
          filterTrigger.setAttribute('aria-expanded', 'false');
          this._closeDisplayPopover();
        }
        return;
      }
      if (action === 'toggle-display-menu') {
        const popover = this.root.querySelector('.relationship-display-popover');
        const trigger = this.root.querySelector('.relationship-display-trigger');
        popover.hidden = !popover.hidden;
        trigger.setAttribute('aria-expanded', popover.hidden ? 'false' : 'true');
        if (!popover.hidden) {
          this._closeFilterPopover();
          this._closeAddMenu();
          this._syncDisplayForm();
          popover.style.transform = '';
          const rect = popover.getBoundingClientRect();
          const view = popover.ownerDocument.defaultView;
          const shift = Math.max(12 - rect.left, Math.min(0, view.innerWidth - 12 - rect.right));
          popover.style.transform = `translateX(${shift}px)`;
          popover.style.maxHeight = `${Math.max(160, view.innerHeight - rect.top - 12)}px`;
        }
        return;
      }
      if (action === 'reset-display-settings') {
        this._resetDisplaySettings();
        return;
      }
      if (action === 'toggle-all-card-details') {
        this._toggleAllCardDetails();
        return;
      }
      if (action === 'toggle-resource-panel') {
        this._togglePanelCollapsed('library');
        return;
      }
      if (action === 'close-resource-panel') {
        this.resourcePanelVisible = false;
        this._syncResourcePanelVisibility();
        return;
      }
      if (action === 'new-board') this._createBoard();
      if (action === 'rename-board') this._renameBoard();
      if (action === 'undo') this.undo();
      if (action === 'redo') this.redo();
      if (action === 'fit') this.fitContent();
      if (action === 'reset-dynamic-layout') this._resetDynamicLayout();
      if (action === 'arrange-by-category') this._arrangeByCategory();
      if (action === 'arrange-by-coolify-projects') this._arrangeByCoolifyProjects();
      if (action === 'arrange-around-selection') this._arrangeAround('selection-centered');
      if (action === 'arrange-around-servers') this._arrangeAround('server-centered');
      if (action === 'refresh-panel') {
        this._refreshPanelTopology({ announce: true });
        return;
      }
      if (action === 'import-json') {
        this._closeAddMenu();
        this._importRelationshipJson();
        return;
      }
      if (action === 'export-json') {
        this._closeAddMenu();
        this._exportCurrentBoard();
        return;
      }
      if (action === 'close-inspector') {
        this.inspectorPinned = false;
        this._clearEntitySelection();
        this.selectedRelationshipId = '';
        this._updateSelectionCss();
        return;
      }
      if (action === 'toggle-inspector-pin') {
        this.inspectorPinned = !this.inspectorPinned;
        this._syncInspectorPinState();
        this._setCanvasAnnouncement(this.inspectorPinned ? '详情窗口已固定在白板上' : '详情窗口已取消固定');
        return;
      }
      if (action === 'verify-now') {
        this._verifySelectedNow();
        return;
      }
      if (action === 'reverse-relationship') {
        this._reverseSelectedRelationship();
        return;
      }
      if (action === 'create-group-from-selection') {
        this._createGroupFromSelection();
        return;
      }
      if (action === 'assign-selection-group') {
        const groupId = this.root.querySelector('[data-relationship-group-target]')?.value || '';
        this._assignSelectionToGroup(groupId);
        return;
      }
      if (action === 'remove-selection-group') {
        this._removeSelectionFromGroups();
        return;
      }
      if (action === 'add-todo-row') {
        const form = event.target.closest('form');
        const list = form?.querySelector('[data-todo-list]');
        if (list && list.children.length < 20) {
          list.insertAdjacentHTML('beforeend', this._todoRowHtml());
          list.lastElementChild?.querySelector('[data-todo-title]')?.focus();
          form.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }
      if (action === 'remove-todo-row') {
        const form = event.target.closest('form');
        event.target.closest('.relationship-todo-row')?.remove();
        form?.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      const groupLayoutId = event.target.closest('[data-group-auto-layout]')?.dataset.groupAutoLayout;
      if (groupLayoutId) { this._toggleGroupLayout(groupLayoutId); return; }

      const resourceSection = event.target.closest('[data-resource-section-toggle]')?.dataset.resourceSectionToggle;
      if (resourceSection) {
        if (this.collapsedResourceSections.has(resourceSection)) this.collapsedResourceSections.delete(resourceSection);
        else this.collapsedResourceSections.add(resourceSection);
        const key = `resource:${resourceSection}`;
        this.panelLayout[key] = { ...this.panelLayout[key], side: this.panelLayout[key]?.side || this.panelLayout.library?.side || 'left', collapsed: this.collapsedResourceSections.has(resourceSection) };
        this._savePanelLayout();
        this._renderResources();
        return;
      }

      const locateEntityId = event.target.closest('[data-relationship-locate-entity]')?.dataset.relationshipLocateEntity;
      if (locateEntityId) {
        this._focusEntityOnBoard(locateEntityId);
        return;
      }

      const panelExternalUrl = event.target.closest('[data-panel-open-external]')?.dataset.panelOpenExternal;
      if (panelExternalUrl) {
        this.bridge.panel?.openExternal?.(panelExternalUrl).catch(error => {
          this.notify(`无法打开链接：${error?.message || String(error)}`, 'error');
        });
        return;
      }

      const revealRepositoryId = event.target.closest('[data-panel-reveal-repository]')?.dataset.panelRevealRepository;
      if (revealRepositoryId) {
        this.revealResource('repository', revealRepositoryId);
        this._setPanelTopology(this.panelTopologyResult);
        return;
      }

      const openRepositoryId = event.target.closest('[data-panel-open-repository]')?.dataset.panelOpenRepository;
      if (openRepositoryId) {
        const repository = this.panelRepositories.find(item => item.id === openRepositoryId && !item.archived && item.available !== false);
        if (!repository?.path) { this.notify('本地目录已不可用，请重新扫描', 'warning'); return; }
        void this._persistNow().then(() => this.onOpenDirectory ? this.onOpenDirectory(repository.path) : this.bridge.fs?.showInFinder(repository.path))
          .catch(error => this.notify(`无法打开目录：${error.message}`, 'error'));
        return;
      }

      const repositorySignal = event.target.closest('[data-repository-signal]')?.dataset.repositorySignal;
      if (repositorySignal) {
        this._selectOnlyEntity(repositorySignal);
        this.expandedCardIds.add(repositorySignal);
        const placement = this._placementForEntity(repositorySignal);
        if (placement) { placement.expanded = true; this._saveDynamicPlacementOverrides([repositorySignal]); this._persistSoon(0); }
        this._renderGraph(); this._updateSummary();
        return;
      }

      const associationButton = event.target.closest('[data-panel-association-action]');
      if (associationButton) {
        this._changeRepositoryAssociation(associationButton.dataset.entityId, associationButton.dataset.panelAssociationAction);
        return;
      }

      const nodeType = event.target.closest('[data-add-node-type]')?.dataset.addNodeType;
      if (nodeType) {
        this.root.querySelector('.relationship-add-menu').hidden = true;
        this.root.querySelector('.relationship-add-trigger').setAttribute('aria-expanded', 'false');
        this._createManualEntity(nodeType, contextPoint);
        return;
      }
      const resourceKey = event.target.closest('[data-add-resource]')?.dataset.addResource;
      if (resourceKey) {
        this._addResource(this.resourceMap.get(resourceKey));
        return;
      }
      const locateResourceKey = event.target.closest('[data-locate-resource]')?.dataset.locateResource;
      if (locateResourceKey) {
        const resource = this.resourceMap.get(locateResourceKey);
        if (resource?.entityId) this._focusEntityOnBoard(resource.entityId);
        return;
      }

      const cardDetailId = event.target.closest('[data-relationship-card-detail]')?.dataset.relationshipCardDetail;
      if (cardDetailId) {
        this._selectOnlyEntity(cardDetailId);
        if (this._allEntitiesById().get(cardDetailId)?.type === 'group') {
          this.inspectorPinned = false;
          this._updateSelectionCss();
        } else {
          if (this.expandedCardIds.has(cardDetailId)) this.expandedCardIds.delete(cardDetailId);
          else this.expandedCardIds.add(cardDetailId);
          this._persistExpandedCards([cardDetailId]);
          this._renderGraph();
        }
        this._updateSummary();
        return;
      }

      const port = event.target.closest('.relationship-port[data-direction="out"]');
      if (port && event.detail === 0) {
        this.keyboardConnectSourceId = port.closest('.relationship-node')?.dataset.entityId || '';
        this._updateSelectionCss();
        this._setCanvasAnnouncement('已选择连接起点。使用 Tab 选择目标节点并按 Enter。');
        return;
      }

      const node = event.target.closest('.relationship-node');
      if (node && !event.target.closest('.relationship-port')) {
        if (this.suppressNextNodeClick) {
          this.suppressNextNodeClick = false;
          return;
        }
        const entityId = node.dataset.entityId;
        if (this.keyboardConnectSourceId && this.keyboardConnectSourceId !== entityId) {
          this._createConnection(this.keyboardConnectSourceId, entityId);
          this.keyboardConnectSourceId = '';
          return;
        }
        if (event.metaKey || event.ctrlKey) {
          const selected = this._entitySelectionIds();
          if (selected.has(entityId)) selected.delete(entityId); else selected.add(entityId);
          this._setEntitySelection(selected, selected.has(entityId) ? entityId : '');
        } else {
          this._selectOnlyEntity(entityId);
        }
        this.suppressedGroupToolbarId = node.dataset.entityType === 'group'
          && !event.target.closest('.relationship-node-header') ? entityId : '';
        this._updateSelectionCss();
        this._updateSummary();
        return;
      }

      const edge = event.target.closest('[data-relationship-id]');
      if (edge) {
        this.selectedRelationshipId = edge.dataset.relationshipId;
        this._clearEntitySelection();
        this._updateSelectionCss();
        this._updateSummary();
      }

      if (!event.target.closest('.relationship-filter-host')) this._closeFilterPopover();
      if (!event.target.closest('.relationship-menu-host')) this._closeAddMenu();
      if (!event.target.closest('.relationship-display-host')) this._closeDisplayPopover();
    }

    _handleChange(event) {
      if (event.target.matches('[data-selection-layout]')) {
        this._arrangeSelection(event.target.value);
        event.target.value = '';
        return;
      }
      if (event.target.matches('[data-selection-display]')) {
        this._setSelectionDisplay(event.target.value);
        event.target.value = '';
        return;
      }
      if (event.target.matches('[data-relationship-layout]')) {
        if (event.target.value === 'coolify-projects') this._arrangeByCoolifyProjects();
        else if (['selection-centered', 'server-centered'].includes(event.target.value)) this._arrangeAround(event.target.value);
        else this._arrangeByCategory();
        event.target.value = '';
        return;
      }
      if (event.target.matches('[data-relationship-snap-mode]')) {
        const board = activeBoard(this.store);
        if (!board) return;
        board.view = { ...this._boardView(), snapMode: String(event.target.value || 'smart') };
        this._persistSoon(0);
        return;
      }
      const displayForm = event.target.closest('[data-relationship-display-form]');
      if (displayForm) {
        this._updateBoardDisplayFromForm(displayForm);
        this.displayLayoutEdit = null;
        return;
      }
      const filterForm = event.target.closest('[data-relationship-filter-form]');
      if (filterForm) {
        this._updateBoardViewFromForm(filterForm);
        return;
      }
      if (event.target.id !== 'relationship-board-select') return;
      if (!this.store.boards.some(board => board.id === event.target.value)) return;
      this.store.activeBoardId = event.target.value;
      this.expandedCardIds = new Set(activeBoard(this.store).placements.filter(item => item.expanded).map(item => item.entityId));
      this.inspectorPinned = false;
      this._clearEntitySelection();
      this.selectedRelationshipId = '';
      this.keyboardConnectSourceId = '';
      this._persistSoon(0);
      this._setPanelTopology(this.panelTopologyResult);
      this.render();
    }

    _handleInput(event) {
      const displayForm = event.target.closest('[data-relationship-display-form]');
      if (displayForm) {
        this._updateBoardDisplayFromForm(displayForm);
        return;
      }
      const filterForm = event.target.closest('[data-relationship-filter-form]');
      if (filterForm) {
        this._updateBoardViewFromForm(filterForm);
        return;
      }
      if (event.target.matches('.relationship-resource-search input')) {
        this.resourceSearch = event.target.value;
        this._renderResources();
        return;
      }
      const form = event.target.closest('[data-relationship-inspector-form], [data-relationship-annotation-form]');
      if (!form) return;
      form.classList.add('is-dirty');
      const saveButton = form.querySelector('[data-inspector-save]');
      if (saveButton) saveButton.disabled = false;
      const error = form.querySelector('.relationship-inspector-error');
      if (error) error.textContent = '';
    }

    _closeFilterPopover() {
      const popover = this.root?.querySelector('.relationship-filter-popover');
      const trigger = this.root?.querySelector('.relationship-filter-trigger');
      if (popover) popover.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
    }

    _closeAddMenu() {
      const menu = this.root?.querySelector('.relationship-add-menu');
      const trigger = this.root?.querySelector('.relationship-add-trigger');
      if (menu) menu.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
    }

    _closeDisplayPopover() {
      this.displayLayoutEdit = null;
      const popover = this.root?.querySelector('.relationship-display-popover');
      const trigger = this.root?.querySelector('.relationship-display-trigger');
      if (popover) popover.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
    }

    _persistExpandedCards(ids) {
      for (const id of ids) {
        const placement = this._placementForEntity(id);
        if (!placement) continue;
        if (this.expandedCardIds.has(id)) placement.expanded = true; else delete placement.expanded;
      }
      this._saveDynamicPlacementOverrides(ids);
      this._persistSoon(0);
    }

    _toggleAllCardDetails() {
      const entitiesById = this._allEntitiesById();
      const visibleIds = this._filteredGraph().placements
        .map(placement => placement.entityId)
        .filter(entityId => !['group', 'text', 'image', 'attachment'].includes(entitiesById.get(entityId)?.type));
      const allExpanded = visibleIds.length > 0 && visibleIds.every(entityId => this.expandedCardIds.has(entityId));
      if (allExpanded) visibleIds.forEach(entityId => this.expandedCardIds.delete(entityId));
      else visibleIds.forEach(entityId => this.expandedCardIds.add(entityId));
      this._persistExpandedCards(visibleIds);
      this._renderGraph();
      this._setCanvasAnnouncement(allExpanded ? '已收起全部卡片详情' : '已展开全部卡片详情');
    }

    _syncExpandAllButton(visibleIds = []) {
      const button = this.root?.querySelector('[data-relationship-action="toggle-all-card-details"]');
      if (!button) return;
      const allExpanded = visibleIds.length > 0 && visibleIds.every(entityId => this.expandedCardIds.has(entityId));
      const label = allExpanded ? '收起全部' : '展开全部';
      button.innerHTML = toolbarIcon(allExpanded ? 'collapse' : 'expand');
      button.setAttribute('aria-label', label);
      button.setAttribute('title', `${label}卡片详情`);
      button.setAttribute('aria-pressed', String(allExpanded));
      button.disabled = visibleIds.length === 0;
    }

    _syncDisplayForm() {
      const form = this.root?.querySelector('[data-relationship-display-form]');
      if (!form) return;
      const display = this._displayViewSettings();
      form.elements.namedItem('mode').value = display.mode;
      form.elements.namedItem('cardScale').value = String(display.cardScale);
      for (const [key, selector] of [['cardWidth', '[data-display-card-width]'], ['cardHeight', '[data-display-card-height]']]) {
        const field = form.elements.namedItem(key); if (field) field.value = String(display[key]);
        const output = form.querySelector(selector); if (output) output.textContent = `${display[key]} px`;
      }
      form.elements.namedItem('textScale').value = String(display.textScale);
      form.elements.namedItem('horizontalSpacing').value = String(display.horizontalSpacing);
      form.elements.namedItem('verticalSpacing').value = String(display.verticalSpacing);
      form.elements.namedItem('cardAppearance').value = display.cardAppearance;
      form.elements.namedItem('cardTitleSource').value = display.cardTitleSource;
      form.elements.namedItem('showGrid').checked = display.showGrid;
      form.elements.namedItem('showEdgeLabels').checked = display.showEdgeLabels;
      form.elements.namedItem('showRuntimeStatus').checked = display.showRuntimeStatus;
      form.elements.namedItem('statusTintOpacity').value = String(display.statusTintOpacity);
      form.elements.namedItem('filterContextOpacity').value = String(display.filterContextOpacity);
      form.elements.namedItem('filterMutedOpacity').value = String(display.filterMutedOpacity);
      form.elements.namedItem('filterMatchHaloOpacity').value = String(display.filterMatchHaloOpacity);
      const cardOutput = form.querySelector('[data-display-card-scale]');
      const textOutput = form.querySelector('[data-display-text-scale]');
      const horizontalSpacingOutput = form.querySelector('[data-display-horizontal-spacing]');
      const verticalSpacingOutput = form.querySelector('[data-display-vertical-spacing]');
      const statusTintOutput = form.querySelector('[data-display-status-tint]');
      const contextOpacityOutput = form.querySelector('[data-display-context-opacity]');
      const mutedOpacityOutput = form.querySelector('[data-display-muted-opacity]');
      const matchHaloOutput = form.querySelector('[data-display-match-halo]');
      if (cardOutput) cardOutput.textContent = `${Math.round(display.cardScale * 100)}%`;
      if (textOutput) textOutput.textContent = `${Math.round(display.textScale * 100)}%`;
      if (horizontalSpacingOutput) horizontalSpacingOutput.textContent = `${Math.round(display.horizontalSpacing)} px`;
      if (verticalSpacingOutput) verticalSpacingOutput.textContent = `${Math.round(display.verticalSpacing)} px`;
      if (statusTintOutput) statusTintOutput.textContent = `${Math.round(display.statusTintOpacity * 100)}%`;
      if (contextOpacityOutput) contextOpacityOutput.textContent = `${Math.round(display.filterContextOpacity * 100)}%`;
      if (mutedOpacityOutput) mutedOpacityOutput.textContent = `${Math.round(display.filterMutedOpacity * 100)}%`;
      if (matchHaloOutput) matchHaloOutput.textContent = `${Math.round(display.filterMatchHaloOpacity * 100)}%`;
      const filterMode = this.root?.querySelector('[data-relationship-filter-form] [name="mode"]');
      if (filterMode) filterMode.value = display.mode;
      const unmatchedDisplay = this.root?.querySelector('[data-relationship-filter-form] [name="unmatchedDisplay"]');
      if (unmatchedDisplay) unmatchedDisplay.value = display.unmatchedDisplay;
    }

    _updateBoardDisplayFromForm(form) {
      const board = activeBoard(this.store);
      if (!board) return;
      const data = new FormData(form);
      const cardScale = Number(data.get('cardScale'));
      const textScale = Number(data.get('textScale'));
      const displayNumber = (name, fallback, min, max) => {
        const value = Number(data.get(name));
        return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
      };
      const currentDisplay = this._displayViewSettings();
      const before = this.displayLayoutEdit || this._captureDisplayLayout();
      board.view = {
        ...this._boardView(),
        mode: String(data.get('mode') || 'full') === 'compact' ? 'compact' : 'full',
        cardScale: Number.isFinite(cardScale) ? Math.min(1.4, Math.max(0.8, cardScale)) : 1,
        cardWidth: displayNumber('cardWidth', currentDisplay.cardWidth, 220, 600),
        cardHeight: displayNumber('cardHeight', currentDisplay.cardHeight, 143, 420),
        textScale: Number.isFinite(textScale) ? Math.min(1.3, Math.max(0.85, textScale)) : 1,
        horizontalSpacing: displayNumber('horizontalSpacing', currentDisplay.horizontalSpacing, 16, 180),
        verticalSpacing: displayNumber('verticalSpacing', currentDisplay.verticalSpacing, 16, 140),
        cardAppearance: String(data.get('cardAppearance') || '') === 'flat' ? 'flat' : 'elevated',
        cardTitleSource: String(data.get('cardTitleSource') || '') === 'note' ? 'note' : 'name',
        showGrid: form.elements.namedItem('showGrid').checked,
        showEdgeLabels: form.elements.namedItem('showEdgeLabels').checked,
        showRuntimeStatus: form.elements.namedItem('showRuntimeStatus').checked,
        statusTintOpacity: displayNumber('statusTintOpacity', currentDisplay.statusTintOpacity, 0, 0.18),
        filterContextOpacity: displayNumber('filterContextOpacity', currentDisplay.filterContextOpacity, 0.15, 0.8),
        filterMutedOpacity: displayNumber('filterMutedOpacity', currentDisplay.filterMutedOpacity, 0.03, 0.4),
        filterMatchHaloOpacity: displayNumber('filterMatchHaloOpacity', currentDisplay.filterMatchHaloOpacity, 0, 0.6)
      };
      const geometryChanged = ['mode', 'cardScale', 'cardWidth', 'cardHeight', 'textScale', 'horizontalSpacing', 'verticalSpacing', 'showRuntimeStatus']
        .some(key => board.view[key] !== currentDisplay[key]);
      if (geometryChanged && !this.displayLayoutEdit) {
        this._pushUndoSnapshot(before.history);
        this.displayLayoutEdit = before;
      }
      this._applyViewMode();
      this._syncDisplayForm();
      this._persistSoon(160);
      this._renderGraph(geometryChanged ? before : null);
      this._refreshHistoryButtons();
      this._updateSummary();
    }

    _resetDisplaySettings() {
      const board = activeBoard(this.store);
      if (!board) return;
      const before = this._captureDisplayLayout();
      this._pushUndoSnapshot(before.history);
      this.displayLayoutEdit = null;
      const defaults = Model.defaultBoardView();
      board.view = {
        ...this._boardView(),
        ...this._displayViewSettings(defaults)
      };
      this._applyViewMode();
      this._syncDisplayForm();
      this._persistSoon(0);
      this._renderGraph(before);
      this._updateSummary();
      this._setCanvasAnnouncement('已恢复当前白板的默认显示');
    }

    _updateBoardViewFromForm(form) {
      const board = activeBoard(this.store);
      if (!board) return;
      const data = new FormData(form);
      board.view = {
        ...this._boardView(),
        ...this._displayViewSettings(),
        mode: String(data.get('mode') || 'full'),
        projection: String(data.get('projection') || 'facts'),
        snapMode: this._boardView().snapMode || 'smart',
        query: Model.cleanText(data.get('query'), 120),
        entityType: 'all',
        entityTypes: data.getAll('entityTypes').map(value => String(value)),
        environment: Model.cleanText(data.get('environment'), 80),
        verification: String(data.get('verification') || 'all'),
        annotation: String(data.get('annotation') || 'all'),
        task: 'all',
        taskFilters: data.getAll('taskFilters').map(value => String(value)),
        runtimeStates: data.getAll('runtimeStates').map(value => String(value)),
        unmatchedDisplay: String(data.get('unmatchedDisplay') || 'dim') === 'hide' ? 'hide' : 'dim',
        label: Model.cleanText(data.get('label'), 24)
      };
      const filtered = this._filteredGraph();
      const visibleIds = new Set(filtered.placements.map(item => item.entityId));
      this._pruneEntitySelection(visibleIds);
      if (this.selectedRelationshipId && !filtered.relationships.some(item => item.id === this.selectedRelationshipId)) {
        this.selectedRelationshipId = '';
      }
      this._applyViewMode();
      this._syncDisplayForm();
      this._persistSoon(160);
      this._renderGraph();
      this._updateFilterSummary();
      this._updateSummary();
    }

    _handleSubmit(event) {
      const form = event.target.closest('[data-relationship-inspector-form], [data-relationship-annotation-form]');
      if (!form) return;
      event.preventDefault();
      if (form.matches('[data-relationship-annotation-form]')) this._saveAnnotationForm(form);
      else this._saveInspectorForm(form);
    }

    _handleDragStart(event) {
      const handle = event.target.closest('[data-panel-drag]');
      if (handle) {
        this.draggedPanelKey = handle.dataset.panelDrag;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-gitfinder-panel', this.draggedPanelKey);
        this.root.classList.add('panel-drag-active');
        this.panelSidebarRoot?.classList.add('panel-drag-active');
        return;
      }
      const item = event.target.closest('[data-resource-key]');
      if (!item) return;
      const key = item.dataset.resourceKey;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-gitfinder-relationship-resource', key);
      event.dataTransfer.setData('text/plain', key);
    }

    _handleDragOver(event) {
      if (this.draggedPanelKey && event.target.closest('[data-panel-dock]')) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        return;
      }
      if (!event.target.closest('.relationship-canvas')) return;
      if (!event.dataTransfer.types.includes('application/x-gitfinder-relationship-resource') && !event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }

    _handleDrop(event) {
      if (this.draggedPanelKey) {
        const dock = event.target.closest('[data-panel-dock]');
        if (dock) {
          event.preventDefault();
          this._setPanelSide(this.draggedPanelKey, dock.dataset.panelDock, event.target.closest('[data-panel-id]')?.dataset.panelId);
        }
        this._clearPanelDrag();
        return;
      }
      const canvas = event.target.closest('.relationship-canvas');
      if (!canvas) return;
      if (event.dataTransfer.files?.length) {
        event.preventDefault(); event.stopPropagation();
        const paths = [...event.dataTransfer.files].map(file => this.bridge.fs?.getPathForFile(file)).filter(Boolean);
        void this._addFiles(paths, this._clientToWorld(event.clientX, event.clientY));
        return;
      }
      const key = event.dataTransfer.getData('application/x-gitfinder-relationship-resource');
      const resource = this.resourceMap.get(key);
      if (!resource) return;
      event.preventDefault();
      this._addResource(resource, this._clientToWorld(event.clientX, event.clientY));
    }

    _renderResources() {
      const list = this._panelElement('.relationship-resource-list');
      if (!list) return;
      const query = this.resourceSearch.trim().toLocaleLowerCase('zh-CN');
      const catalog = this._resourceCatalog();
      this.resourceMap = new Map(catalog.map(resource => [resource.key, resource]));
      const total = this._panelElement('[data-resource-total]');
      if (total) total.textContent = String(catalog.length);
      const filtered = catalog.filter(resource => !query
        || `${resource.name} ${resource.path} ${resource.secondary}`.toLocaleLowerCase('zh-CN').includes(query));
      const sections = this._resourceSections(filtered)
        .filter(section => !query || section.items.length);
      for (const dock of this._panelDocks()) dock?.querySelectorAll(':scope > [data-resource-section]').forEach(item => item.remove());
      if (!sections.length || (query && !filtered.length)) {
        list.innerHTML = `<div class="relationship-resource-empty">${query ? '没有匹配的资源' : '暂无资源'}</div>`;
        this._placePanelComponents();
        return;
      }
      const itemMarkup = resource => {
        if (resource.kind === 'whiteboard') return `<article class="relationship-resource-item whiteboard-library-item">
          <button type="button" class="whiteboard-library-open" data-open-document="${escapeHtml(resource.id)}" title="${escapeHtml(resource.path)}"><strong>▧ ${escapeHtml(resource.name)}</strong><small>${escapeHtml(resource.secondary)}</small></button>
          <button type="button" data-remove-document="${escapeHtml(resource.id)}" title="仅从资源库移除" aria-label="移除 ${escapeHtml(resource.name)} 的资源库记录">×</button>
          <button type="button" data-trash-document="${escapeHtml(resource.id)}" title="移到废纸篓" aria-label="将 ${escapeHtml(resource.name)} 移到废纸篓">♲</button></article>`;
        const canLocate = resource.placed === true;
        const canDrag = !canLocate && (!resource.transient || ['project', 'repository'].includes(resource.kind));
        const action = canLocate
          ? `data-locate-resource="${escapeHtml(resource.key)}" title="在白板中定位" aria-label="在白板中定位 ${escapeHtml(resource.name)}">⌖`
          : `data-add-resource="${escapeHtml(resource.key)}" title="添加到白板" aria-label="将 ${escapeHtml(resource.name)} 添加到白板">＋`;
        return `
          <article class="relationship-resource-item" draggable="${canDrag}" data-resource-key="${escapeHtml(resource.key)}" data-resource-kind="${escapeHtml(resource.kind)}">
            <span class="relationship-resource-icon" data-kind="${escapeHtml(resource.kind)}">${TYPE_ICONS[resource.kind] || '•'}</span>
            <span class="relationship-resource-copy">
              <strong>${escapeHtml(resource.name)}</strong>
              <small title="${escapeHtml(resource.path || resource.secondary)}">${escapeHtml(resource.path || resource.secondary)}</small>
            </span>
            <button type="button" ${action}</button>
          </article>`;
      };
      list.innerHTML = sections.map(section => {
        const collapsed = !query && this.collapsedResourceSections.has(section.key);
        return `
          <section class="relationship-resource-section relationship-dock-component" data-panel-id="resource:${escapeHtml(section.key)}" data-resource-section="${escapeHtml(section.key)}">
            <div class="relationship-resource-component-heading">
            <button class="relationship-resource-section-trigger" type="button" data-resource-section-toggle="${escapeHtml(section.key)}" aria-expanded="${!collapsed}">
              <span class="relationship-resource-section-disclosure" aria-hidden="true">⌄</span>
              <span class="relationship-resource-section-icon" aria-hidden="true">${section.icon}</span>
              <span class="relationship-resource-section-copy"><strong>${escapeHtml(section.label)}</strong>${section.secondary ? `<small title="${escapeHtml(section.secondary)}">${escapeHtml(section.secondary)}</small>` : ''}</span>
              <span class="relationship-resource-section-count">${section.items.length}</span>
            </button>
            ${this._panelMoveControls(`resource:${section.key}`, section.label)}
            </div>
            <div class="relationship-resource-section-items"${collapsed ? ' hidden' : ''}>${section.items.length
              ? section.items.map(itemMarkup).join('')
              : '<div class="relationship-resource-section-empty">暂无资源</div>'}</div>
          </section>`;
      }).join('');
      this._placePanelComponents();
    }

    _cardAttentionRailHtml(todos = []) {
      const openTodos = todos.filter(todo => !todo.completed);
      const now = new Date(this.now());
      const hasReminder = openTodos.some(todo => todo.reminderAt);
      const hasOverdue = openTodos.some(todo => todo.dueAt && new Date(todo.dueAt) < now);
      const segments = [
        openTodos.length ? '<span data-kind="todo" title="有未完成待办"></span>' : '',
        hasReminder ? '<span data-kind="reminder" title="有提醒"></span>' : '',
        hasOverdue ? '<span data-kind="overdue" title="有逾期待办"></span>' : ''
      ].filter(Boolean).join('');
      return segments ? `<span class="relationship-attention-rail" aria-label="待办与提醒状态">${segments}</span>` : '';
    }

    _cardAttentionChipsHtml(todos = []) {
      const openTodos = todos.filter(todo => !todo.completed);
      const now = new Date(this.now());
      const reminderCount = openTodos.filter(todo => todo.reminderAt).length;
      const overdueCount = openTodos.filter(todo => todo.dueAt && new Date(todo.dueAt) < now).length;
      const chips = [
        openTodos.length ? `<span class="relationship-attention-chip todo">待办 ${openTodos.length}</span>` : '',
        reminderCount ? `<span class="relationship-attention-chip reminder">提醒 ${reminderCount}</span>` : '',
        overdueCount ? `<span class="relationship-attention-chip overdue">逾期 ${overdueCount}</span>` : ''
      ].filter(Boolean);
      return chips.length ? chips.join('') : '<span class="relationship-attention-chip neutral">无待办</span>';
    }

    _cardUpdatedLabel(entity) {
      const updatedAt = entity?.runtime?.observedAt || entity?.verifiedAt;
      if (entity?.runtime?.dynamicKind === 'panel-endpoint') return entity.runtime.checking ? '检测中…' : (updatedAt ? `检测 ${this._relativeTime(updatedAt)}` : '尚未检测');
      return updatedAt ? this._relativeTime(updatedAt) : '';
    }

    _cardSummary(entity, fallback = '') {
      if (entity?.runtime?.dynamicKind === 'panel-deployment') {
        return [entity.runtime.environmentName || '默认环境', entity.runtime.status || 'unknown'].join(' · ');
      }
      if (entity?.runtime?.dynamicKind === 'panel-server') {
        const latency = entity.runtime.latencyMs === null ? '延迟未知' : `${entity.runtime.latencyMs} ms`;
        const host = entity.runtime.providerLabel === entity.name && entity.runtime.name !== entity.name
          ? entity.runtime.name
          : entity.name;
        return [host, entity.runtime.status || 'unknown', latency].filter(Boolean).join(' · ');
      }
      if (entity?.runtime?.dynamicKind === 'panel-endpoint') {
        let protocol = '访问端点';
        try {
          protocol = new URL(entity.runtime.url || entity.details?.urlLabel || '').protocol.replace(':', '').toUpperCase() || protocol;
        } catch (_) {}
        return [protocol, entity.runtime.httpStatus ? `HTTP ${entity.runtime.httpStatus}` : this._entityRuntimeStatus(entity).label,
          Number.isFinite(entity.runtime.latencyMs) ? `${entity.runtime.latencyMs} ms` : ''].filter(Boolean).join(' · ');
      }
      return fallback;
    }

    _cardTodoMeta(todo) {
      const parts = [];
      if (todo.dueAt) parts.push(`截止 ${this._relativeTime(todo.dueAt)}`);
      if (todo.reminderAt) parts.push(`提醒 ${this._relativeTime(todo.reminderAt)}`);
      return parts.join(' · ') || (todo.completed ? '已完成' : '未设置日期');
    }

    _deploymentLinkSignalHtml(entity) {
      if (entity.type !== 'deployment' || !entity.runtime) return '';
      const runtime = entity.runtime, mode = runtime.repositoryAssociation?.mode || 'unmatched';
      const count = (runtime.repositoryIds || []).length, missing = (runtime.missingRepositoryIds || []).length;
      const label = missing ? '本地目录缺失' : count ? `已关联本地${count > 1 ? ` ${count}` : ''}`
        : ['ambiguous', 'suggested'].includes(mode) ? `待确认 ${runtime.repositoryAssociation.candidateIds.length}`
        : mode === 'disabled' ? '关联已暂停' : mode === 'no-source' ? '无仓库来源' : '未匹配本地';
      const tone = missing ? 'warning' : count ? 'linked' : ['ambiguous', 'suggested'].includes(mode) ? 'candidate' : 'unlinked';
      const commit = String(runtime.commit || entity.details?.revision || '');
      const known = /^[a-f0-9]{7,64}$/i.test(commit);
      const commitLabel = runtime.commitSource === 'deployment-history' ? '最近部署' : '配置提交';
      return `<div class="relationship-deployment-source"><span class="relationship-deployment-commit" title="${escapeHtml(known ? `${commitLabel}：${commit}${runtime.lastDeployment?.status ? ` · ${runtime.lastDeployment.status}` : ''}` : 'Coolify 未提供确定的提交 SHA')}">${known ? `${commitLabel} ${escapeHtml(commit.slice(0, 8))}` : '提交未知'}</span><button type="button" class="relationship-repository-signal" data-tone="${tone}" data-repository-signal="${escapeHtml(entity.id)}" title="${escapeHtml(label)} · 点击查看仓库路径和关联详情"><span aria-hidden="true">⌁</span> ${escapeHtml(label)}</button></div>`;
    }

    _cardDetailHtml(entity, placement, runtimeStatusView) {
      if (!this.expandedCardIds.has(entity.id)) return '';
      const annotations = normalizePlacementAnnotations(placement);
      const todos = (annotations.todos || []).slice(0, 4);
      const facts = [
        ['状态', runtimeStatusView?.label || (this._entityRuntimeTone(entity) === 'normal' ? '正常' : '无动态状态')],
        ['HTTP', entity.runtime?.httpStatus],
        ['环境', entity.details?.environment],
        ['提交', entity.runtime?.commit || entity.details?.revision],
        ['分支', entity.details?.branch],
        ['延迟', Number.isFinite(entity.runtime?.latencyMs) ? `${entity.runtime.latencyMs} ms` : ''],
        [entity.type === 'endpoint' ? '检测' : '更新', entity.runtime?.observedAt ? this._relativeTime(entity.runtime.observedAt) : '']
      ].filter(([, value]) => value);
      const resource = entity.refId ? this.resourceMap.get(`${entity.type}:${entity.refId}`) : null;
      const resourceFacts = [
        ['资源名称', this._entityBaseName(entity)],
        [entity.runtime?.commitSource === 'deployment-history' ? '最近部署提交' : '配置提交', entity.runtime?.commit || entity.details?.revision],
        ['最近部署结果', entity.runtime?.lastDeployment?.status],
        ['镜像版本', entity.details?.version],
        ['本地目录', resource?.path],
        ['环境', entity.details?.environment],
        ['主机', entity.details?.hostLabel || entity.runtime?.serverName],
        ['访问地址', entity.runtime?.url || entity.details?.urlLabel],
        ['数据源', entity.runtime?.providerLabel || entity.details?.provider]
      ].filter(([, value]) => value);
      const todoKind = todo => todo.completed ? 'completed'
        : (todo.dueAt && new Date(todo.dueAt) < new Date(this.now()) ? 'overdue' : (todo.reminderAt ? 'reminder' : 'todo'));
      const todoLabels = { completed: '已完成', overdue: '逾期', reminder: '提醒', todo: '待办' };
      return `
        <div class="relationship-card-detail-content" data-card-detail-content>
          ${facts.length ? `<dl class="relationship-card-facts">${facts.slice(0, 4).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
          <section class="relationship-card-todos" aria-label="待办与提醒">
            <header><strong>待办与提醒</strong><span>${todos.length}</span></header>
            ${todos.length ? `<ul>${todos.map(todo => `<li data-state="${todo.completed ? 'completed' : 'open'}" data-kind="${todoKind(todo)}"><span class="relationship-card-todo-check" aria-hidden="true"></span><span class="relationship-card-todo-copy"><b>${escapeHtml(todo.title)}</b><small>${escapeHtml(this._cardTodoMeta(todo))}</small></span><span class="relationship-card-todo-kind">${todoLabels[todoKind(todo)]}</span></li>`).join('')}</ul>` : '<p>暂无待办</p>'}
          </section>
          <section class="relationship-card-resources"><strong>资源详情</strong><dl>${resourceFacts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`).join('')}</dl></section>
          ${entity.type === 'deployment' && entity.runtime ? this._repositoryAssociationHtml(entity) : ''}
          ${this._endpointCheckHtml(entity)}
          ${annotations.note ? `<section class="relationship-card-note"><strong>备注</strong><p>${escapeHtml(annotations.note)}</p></section>` : ''}
        </div>`;
    }

    _renderGraph(displayLayoutBefore = null) {
      const board = activeBoard(this.store);
      const nodeLayer = this.root?.querySelector('.relationship-node-layer');
      if (!board || !nodeLayer) return;
      const graph = this._filteredGraph();
      this.root.dataset.filterActive = String(graph.filterActive);
      const visibleIds = new Set(graph.placements.map(placement => placement.entityId));
      const allPlacedIds = new Set(this._combinedPlacements().map(item => item.entityId));
      [...this.expandedCardIds].forEach(entityId => {
        if (!allPlacedIds.has(entityId)) this.expandedCardIds.delete(entityId);
      });
      this._pruneEntitySelection(visibleIds);
      if (this.selectedRelationshipId && !graph.relationships.some(item => item.id === this.selectedRelationshipId)) {
        this.selectedRelationshipId = '';
      }
      const entitiesById = this._allEntitiesById();
      const groupFrames = graph.placements.filter(placement => entitiesById.get(placement.entityId)?.type === 'group')
        .sort((a, b) => this._groupDepth(a.entityId, graph.placements) - this._groupDepth(b.entityId, graph.placements));
      const regularNodes = graph.placements.filter(placement => entitiesById.get(placement.entityId)?.type !== 'group');
      let geometryById = this._displayGeometryMap(graph.placements);
      this._syncExpandAllButton(regularNodes.map(placement => placement.entityId));
      nodeLayer.innerHTML = groupFrames.map(placement => {
        const source = entitiesById.get(placement.entityId);
        const entity = { ...source, name: this._entityDisplayName(source) };
        const geometry = this._placementGeometry(placement, graph.placements, new Set(), geometryById);
        const memberCount = graph.placements.filter(item => item.groupId === entity.id).length;
        const annotations = normalizePlacementAnnotations(placement);
        return `
          <article class="relationship-node relationship-group-frame${graph.filterActive && graph.directIds.has(entity.id) ? ' filter-match' : ''}${graph.contextualIds.has(entity.id) ? ' filter-context' : ''}${graph.mutedIds.has(entity.id) ? ' filter-muted' : ''}" data-entity-id="${escapeHtml(entity.id)}" data-entity-type="group" data-group-id="${escapeHtml(placement.groupId || '')}" tabindex="0" role="button" aria-label="${escapeHtml(entity.name)}，视觉分组，${memberCount} 个成员" aria-pressed="false" style="transform:translate(${geometry.x}px,${geometry.y}px);width:${geometry.width}px;height:${geometry.height}px;--group-background:${escapeHtml(placement.groupBackground || '#7a67c7')};--group-border:${escapeHtml(placement.groupBorder || '#7a67c7')}">
            <button class="relationship-card-expand relationship-card-expand-top" data-relationship-card-detail="${escapeHtml(entity.id)}" type="button" aria-label="展开 ${escapeHtml(entity.name)} 详情" title="展开详情">⌄</button>
            <div class="relationship-node-header">
              <button class="relationship-group-title-button" type="button" aria-label="显示 ${escapeHtml(entity.name)} 群组快捷工具条" title="显示群组快捷工具条">
                <span class="relationship-node-icon">${TYPE_ICONS.group}</span>
                <span class="relationship-node-title">${escapeHtml(entity.name)}</span>
                <span class="relationship-node-kind">${memberCount} 个成员</span>
              </button>
              <button class="relationship-group-auto" data-group-auto-layout="${escapeHtml(entity.id)}" type="button" aria-label="${escapeHtml(entity.name)} 自动排列" aria-pressed="${placement.groupLayout === 'auto'}" title="${placement.groupLayout === 'auto' ? '关闭自动排列，保留当前位置' : '开启自动排列，间距跟随显示设置'}"${placement.locked ? ' disabled' : ''}>▦ <span>自动排列</span></button>
              <button class="relationship-group-edit" data-relationship-card-detail="${escapeHtml(entity.id)}" type="button" aria-label="编辑群组 ${escapeHtml(entity.name)}" title="重命名、配色与嵌套">✎</button>
            </div>
            <span class="relationship-group-drop-label">松手加入此群组</span>
            <div class="relationship-node-subtitle">${escapeHtml(entity.details?.notes || (placement.groupLayout === 'auto' ? '自动排列 · 间距跟随显示设置' : '手动排列 · 拖动右下角调整尺寸'))}</div>
            ${(annotations.labels || []).length ? `<div class="relationship-node-labels">${annotations.labels.slice(0, 3).map((label, index) => `<span data-color-index="${index % 5}">${escapeHtml(label)}</span>`).join('')}</div>` : ''}
            <button class="relationship-card-expand relationship-card-expand-bottom" data-relationship-card-detail="${escapeHtml(entity.id)}" type="button" aria-label="展开 ${escapeHtml(entity.name)} 详情" title="展开详情">⌃</button>
            ${!placement.locked ? `<button class="relationship-group-resize" type="button" data-resize-group="${escapeHtml(entity.id)}" aria-label="调整群组 ${escapeHtml(entity.name)} 尺寸" title="拖动调整群组宽高；自动排列开启时按宽度换行">◢</button>` : ''}
          </article>`;
      }).join('') + regularNodes.map(placement => {
        const freeElement = entitiesById.get(placement.entityId);
        if (['text', 'image', 'attachment'].includes(freeElement?.type)) return this._canvasElementHtml(freeElement, placement, graph);
        const entity = entitiesById.get(placement.entityId);
        if (!entity) return '';
        const resource = entity.refId ? this.resourceMap.get(`${entity.type}:${entity.refId}`) : null;
        const availability = this._entityAvailability(entity);
        const stale = Boolean(availability.missing || (entity.transient && this._panelSnapshotStale()));
        const name = this._entityDisplayName(entity);
        const details = this._entityDisplaySubtitle(entity, this._entitySubtitle(entity, resource, stale, availability));
        const cardSummary = this._cardSummary(entity, details);
        const verification = Model.verificationStatus(entity, { now: this.now() });
        const hasInput = !entity.transient && Model.RELATIONSHIP_TYPES.some(type => Object.values(Model.CONNECTIONS[type] || []).some(pair => pair[1] === entity.type));
        const hasOutput = !entity.transient && Model.RELATIONSHIP_TYPES.some(type => Object.values(Model.CONNECTIONS[type] || []).some(pair => pair[0] === entity.type));
        const runtimeStatus = entity.runtime?.status || '';
        const recentFailure = entity.runtime?.recentFailure?.hasFailure === true;
        const runtimeStatusView = this._cardShowsRuntimeStatus(placement) ? this._entityRuntimeStatus(entity) : null;
        const annotations = normalizePlacementAnnotations(placement);
        const statusTone = this._entityRuntimeTone(entity);
        const cardStatusView = runtimeStatusView || (this._cardShowsRuntimeStatus(placement)
          ? {
              state: availability.missing ? 'unknown' : statusTone,
              label: availability.missing
                ? '无效'
                : (statusTone === 'warning'
                  ? '预警'
                  : (statusTone === 'inactive' ? '已停止' : (entity.type === 'repository' ? '已同步' : '正常')))
            }
          : null);
        const expanded = this.expandedCardIds.has(entity.id);
        const geometry = geometryById.get(entity.id) || { x: placement.x, y: placement.y, ...this._nodeDimensions() };
        return `
          <article class="relationship-node verification-${verification.state}${entity.transient ? ' panel-dynamic' : ''}${recentFailure ? ' panel-recent-failure' : ''}${stale ? ' stale' : ''}${availability.missing ? ' resource-missing' : ''}${expanded ? ' is-detail' : ''}${graph.filterActive && graph.directIds.has(entity.id) ? ' filter-match' : ''}${graph.contextualIds.has(entity.id) ? ' filter-context' : ''}${graph.mutedIds.has(entity.id) ? ' filter-muted' : ''}" data-entity-id="${escapeHtml(entity.id)}" data-entity-type="${entity.type}" data-runtime-status="${escapeHtml(runtimeStatus)}" data-runtime-state="${escapeHtml(runtimeStatusView?.state || '')}" data-status-tone="${statusTone}" data-card-mode="${expanded ? 'detail' : 'compact'}" data-verification-state="${verification.state}" data-resource-state="${availability.missing ? 'missing' : 'ready'}" tabindex="0" role="button" aria-label="${escapeHtml(name)}，${TYPE_LABELS[entity.type]}，${runtimeStatusView ? `${runtimeStatusView.label}，` : ''}${availability.missing ? `${availability.label}，` : ''}${entity.transient ? 'Coolify 只读观测，' : ''}${verification.label}${graph.contextualIds.has(entity.id) ? '，关系上下文' : ''}" aria-pressed="false" style="transform:translate(${geometry.x}px,${geometry.y}px);height:${geometry.height}px">
            <div class="relationship-card-surface">
            ${this._cardAttentionRailHtml(annotations.todos || [])}
            ${['left', 'right', 'top', 'bottom'].map(side => hasOutput
              ? `<button class="relationship-port" data-port-side="${side}" data-direction="out" type="button" aria-label="从 ${escapeHtml(name)} ${ { left: '左', right: '右', top: '上', bottom: '下' }[side]}侧开始连接" title="拖到兼容节点建立关系"></button>`
              : `<span class="relationship-port" data-port-side="${side}"${hasInput ? ' data-direction="in"' : ''} aria-hidden="true"></span>`).join('')}
            <div class="relationship-node-header">
              <span class="relationship-node-icon">${TYPE_ICONS[entity.type]}</span>
              <span class="relationship-node-identity">
                <span class="relationship-node-kind" data-state="${availability.missing ? 'missing' : 'ready'}" title="${escapeHtml(availability.missing ? `${TYPE_LABELS[entity.type]} · ${availability.label}` : TYPE_LABELS[entity.type])}">${availability.missing ? `${TYPE_LABELS[entity.type]} · 缺失` : TYPE_LABELS[entity.type]}</span>
                <strong class="relationship-node-title" title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
              </span>
              <button class="relationship-card-expand relationship-card-expand-top" data-relationship-card-detail="${escapeHtml(entity.id)}" type="button" aria-expanded="${expanded}" aria-label="${expanded ? '收起' : '展开'} ${escapeHtml(name)} 详情" title="${expanded ? '收起详情' : '展开详情'}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8"></path></svg></button>
            </div>
            <div class="relationship-node-status-row">
              ${cardStatusView ? `<span class="relationship-node-runtime-status" data-state="${escapeHtml(cardStatusView.state)}" title="${escapeHtml(runtimeStatusView?.sourceStatus ? `原始状态：${runtimeStatusView.sourceStatus}` : cardStatusView.label)}"><i aria-hidden="true"></i><b>${escapeHtml(cardStatusView.label)}</b></span>` : ''}
              <small>${escapeHtml(this._cardUpdatedLabel(entity))}</small>
            </div>
            <div class="relationship-node-summary">
              <span class="relationship-node-subtitle" title="${escapeHtml(details)}">${escapeHtml(cardSummary)}</span>
            </div>
            ${this._deploymentLinkSignalHtml(entity)}
            <div class="relationship-node-attention-row">
              ${this._cardAttentionChipsHtml(annotations.todos || [])}
              ${(annotations.labels || []).length ? `<div class="relationship-node-labels">${annotations.labels.slice(0, 2).map((label, index) => `<span data-color-index="${index % 5}">${escapeHtml(label)}</span>`).join('')}${annotations.labels.length > 2 ? `<span>+${annotations.labels.length - 2}</span>` : ''}</div>` : ''}
            </div>
            ${this._cardDetailHtml(entity, placement, runtimeStatusView)}
            <button class="relationship-card-expand relationship-card-expand-bottom" data-relationship-card-detail="${escapeHtml(entity.id)}" type="button" aria-expanded="${expanded}" aria-label="${expanded ? '收起' : '展开'} ${escapeHtml(name)} 详情" title="${expanded ? '收起详情' : '展开详情'}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8"></path></svg><b>${expanded ? '收起详情' : '展开详情'}</b></button>
            </div>
          </article>`;
      }).join('');

      // Layout follows the real card content, including font size and expanded details.
      this.cardHeights.clear();
      const cardScale = this._displayViewSettings().cardScale;
      nodeLayer.querySelectorAll('.relationship-card-surface').forEach(surface => {
        this.cardHeights.set(surface.parentElement.dataset.entityId, surface.offsetHeight * cardScale);
      });
      if (displayLayoutBefore) this._reflowDisplayLayout(displayLayoutBefore);
      geometryById = this._displayGeometryMap(graph.placements);
      nodeLayer.querySelectorAll('.relationship-node:not(.relationship-group-frame)').forEach(node => {
        const geometry = geometryById.get(node.dataset.entityId);
        node.style.height = `${geometry.height}px`;
        node.style.transform = `translate(${geometry.x}px,${geometry.y}px)`;
      });
      this._updateGroupFrames();
      const edgeLayer = this.root.querySelector('.relationship-edge-layer');
      edgeLayer.innerHTML = `
        <defs>
          <marker id="relationship-edge-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path class="relationship-edge-arrow" d="M 0 0 L 8 4 L 0 8 Z"></path>
          </marker>
      </defs>` + graph.relationships.map(relationship => {
        const geometry = this._edgeGeometry(relationship, null, geometryById);
        if (!geometry) return '';
        const verification = Model.verificationStatus(relationship, { now: this.now() });
        const relationshipLabel = this._relationshipLabel(relationship);
        const filterClass = graph.filterActive
          ? (graph.directIds.has(relationship.sourceId) && graph.directIds.has(relationship.targetId)
            ? ' filter-match'
            : ((graph.mutedIds.has(relationship.sourceId) && graph.mutedIds.has(relationship.targetId)) ? ' filter-muted' : ' filter-context'))
          : '';
        return `
          <g class="relationship-edge verification-${verification.state}${filterClass}" data-relationship-id="${escapeHtml(relationship.id)}" data-relationship-type="${relationship.type}" data-verification-state="${verification.state}" data-route-obstructed="${geometry.obstructed}" aria-label="${escapeHtml(relationshipLabel)}，${verification.label}">
            <title data-route-title>${geometry.obstructed ? '未找到可通行路线，请调整卡片位置或间距' : escapeHtml(relationshipLabel)}</title>
            <path class="relationship-edge-hit" d="${geometry.path}"></path>
            <path class="relationship-edge-line" d="${geometry.path}" marker-end="url(#relationship-edge-arrow)"></path>
            <text x="${geometry.labelX}" y="${geometry.labelY}">${escapeHtml(relationshipLabel)}</text>
          </g>`;
      }).join('') + graph.summaryRelationships.map(summary => {
        const geometry = this._edgeGeometry(summary, null, geometryById);
        if (!geometry) return '';
        const verificationLabel = summary.verificationState === 'verified'
          ? '已验证'
          : (summary.verificationState === 'stale' ? '待复核' : '待验证');
        const description = summary.title || `${summary.count} 个部署事实链`;
        return `
          <g class="relationship-edge relationship-edge-summary verification-${summary.verificationState}${graph.filterActive ? ' filter-context' : ''}" data-summary-id="${escapeHtml(summary.id)}" data-verification-state="${summary.verificationState}" aria-label="${escapeHtml(summary.label)}，${verificationLabel}">
            <title>${escapeHtml(description)}</title>
            <path class="relationship-edge-line" d="${geometry.path}" marker-end="url(#relationship-edge-arrow)"></path>
            <text x="${geometry.labelX}" y="${geometry.labelY}">${escapeHtml(summary.label)}</text>
          </g>`;
      }).join('');
      this._updateConnectionPorts(graph, geometryById);
      this._refreshMinimapNodes(graph, geometryById);
      this._applyViewport();
      this._updateSelectionCss({ preserveDirtyInspector: true });
    }

    _entitySubtitle(entity, resource, stale, availability = this._entityAvailability(entity)) {
      if (availability.missing) return availability.detail;
      if (stale && !entity.transient) return '引用已失效 · 保留关系事实';
      if (resource) return resource.secondary;
      if (entity.runtime?.dynamicKind === 'panel-server') {
        const latency = entity.runtime.latencyMs === null ? '延迟未知' : `${entity.runtime.latencyMs} ms`;
        const remoteHost = entity.runtime.providerLabel === entity.name && entity.runtime.name !== entity.name
          ? `Coolify 主机 ${entity.runtime.name} · `
          : '';
        return `${remoteHost}${entity.runtime.status || 'unknown'} · ${latency} · 更新 ${this._relativeTime(entity.runtime.observedAt)}`;
      }
      if (entity.runtime?.dynamicKind === 'panel-deployment') {
        const latency = entity.runtime.latencyMs === null ? '延迟未知' : `${entity.runtime.latencyMs} ms`;
        const failure = entity.runtime.recentFailure?.known === false
          ? '最近部署失败：未知'
          : (entity.runtime.recentFailure?.hasFailure ? '最近部署失败：是' : '最近部署失败：否');
        return `${entity.runtime.environmentName || '默认环境'} · ${entity.runtime.status || 'unknown'} · ${latency} · ${failure}`;
      }
      if (entity.runtime?.dynamicKind === 'panel-endpoint') {
        const latency = entity.runtime.latencyMs === null ? '延迟未知' : `${entity.runtime.latencyMs} ms`;
        return `${entity.runtime.url || entity.details.urlLabel || '访问端点'} · ${latency}`;
      }
      if (entity.type === 'server') return entity.details.hostLabel || entity.details.environment || '手工服务器节点';
      if (entity.type === 'deployment') {
        return [
          entity.details.environment,
          entity.details.version,
          entity.details.branch,
          entity.details.revision,
          entity.details.status
        ].filter(Boolean).join(' · ') || '手工部署节点';
      }
      if (entity.type === 'endpoint') return entity.details.urlLabel || '访问端点';
      return entity.details.notes || TYPE_LABELS[entity.type];
    }

    _entityRuntimeStatus(entity) {
      if (!entity || !['server', 'deployment', 'endpoint'].includes(entity.type)) return null;
      const sourceStatus = String(entity.runtime?.status || entity.details?.status || '').trim();
      if (entity.runtime?.dynamicKind === 'panel-endpoint') {
        if (entity.runtime.checking) return { state: 'unknown', label: '检测中', sourceStatus };
        const checkedAt = Date.parse(entity.runtime.observedAt);
        if (Number.isFinite(checkedAt) && new Date(this.now()).getTime() - checkedAt > 120_000) return { state: 'unknown', label: '结果已过期', sourceStatus };
        const labels = { reachable: '可访问', restricted: '访问受限', http_error: 'HTTP 异常', timeout: '检测超时', dns_error: '解析失败', tls_error: '证书异常', unreachable: '连接失败', redirect_error: '重定向异常' };
        return { state: sourceStatus === 'reachable' ? 'running' : (labels[sourceStatus] ? 'fault' : 'unknown'), label: labels[sourceStatus] || '未检测', sourceStatus };
      }
      const normalized = sourceStatus.toLocaleLowerCase('en-US').replaceAll('_', '-');
      if (entity.runtime?.recentFailure?.hasFailure === true) {
        return { state: 'deploy-failed', label: '部署失败', sourceStatus };
      }
      if (/deploying|building|starting|restarting|queued|pending/.test(normalized)) {
        return { state: 'deploying', label: '部署中', sourceStatus };
      }
      if (/deploy-failed|deployment-failed|^failed$/.test(normalized)) {
        return { state: 'deploy-error', label: '部署错误', sourceStatus };
      }
      if (/unhealthy|degraded|fault|crash|error/.test(normalized)) {
        return { state: 'fault', label: '故障', sourceStatus };
      }
      if (/offline|unreachable/.test(normalized)) {
        return { state: 'offline', label: '离线', sourceStatus };
      }
      if (/stopped|exited|paused|disabled|down/.test(normalized)) {
        return { state: 'stopped', label: '已停止', sourceStatus };
      }
      if (/running|online|healthy|active|reachable/.test(normalized)) {
        return { state: 'running', label: '运行中', sourceStatus };
      }
      return { state: 'unknown', label: '状态未知', sourceStatus };
    }

    _entityBaseName(entity) {
      if (!entity) return '未知节点';
      const resource = entity.refId ? this.resourceMap.get(`${entity.type}:${entity.refId}`) : null;
      return resource?.name || entity.name;
    }

    _entityCardTitleBase(entity) {
      const placement = this._placementForEntity(entity?.id) || {};
      const annotations = normalizePlacementAnnotations(placement);
      const configuredSource = annotations.titleSource || 'inherit';
      const source = configuredSource === 'inherit'
        ? this._displayViewSettings().cardTitleSource
        : configuredSource;
      if (source === 'note') {
        return Model.cleanText(annotations.note || entity?.details?.notes, 160) || this._entityBaseName(entity);
      }
      return this._entityBaseName(entity);
    }

    _entityDisplayName(entity) {
      const originalName = this._entityCardTitleBase(entity);
      const annotations = normalizePlacementAnnotations(this._placementForEntity(entity?.id) || {});
      if (!annotations.titleText) return originalName;
      if (annotations.titleMode === 'replace') return annotations.titleText;
      if (annotations.titleMode === 'prefix') return `${annotations.titleText} · ${originalName}`;
      if (annotations.titleMode === 'suffix') return `${originalName} · ${annotations.titleText}`;
      return originalName;
    }

    _cardShowsRuntimeStatus(placement) {
      const annotations = normalizePlacementAnnotations(placement || {});
      if (annotations.statusVisibility === 'show') return true;
      if (annotations.statusVisibility === 'hide') return false;
      return this._displayViewSettings().showRuntimeStatus;
    }

    _entityDisplaySubtitle(entity, subtitle) {
      const annotations = normalizePlacementAnnotations(this._placementForEntity(entity?.id) || {});
      return annotations.titleMode === 'subtitle' && annotations.titleText
        ? `${annotations.titleText} · ${subtitle || TYPE_LABELS[entity?.type] || ''}`
        : subtitle;
    }

    _deploymentVersionContext(entity) {
      if (!entity || entity.type !== 'deployment') return '';
      return [
        entity.details?.environment,
        entity.details?.version,
        entity.details?.branch,
        entity.details?.revision,
        entity.details?.status
      ].filter(Boolean).join(' · ');
    }

    _serverDeploymentContext(serverId) {
      if (!serverId || !this.store) return [];
      const entitiesById = this._allEntitiesById();
      const relationships = this._combinedRelationships();
      const sourceRelationships = relationships.filter(relationship => relationship.type === 'source_of');
      const containsRelationships = relationships.filter(relationship => relationship.type === 'contains');
      const placedIds = new Set(this._combinedPlacements().map(item => item.entityId));
      return relationships
        .filter(relationship => relationship.type === 'runs_on' && relationship.targetId === serverId)
        .map(relationship => {
          const deployment = entitiesById.get(relationship.sourceId);
          if (!deployment || deployment.type !== 'deployment') return null;
          const repositories = sourceRelationships
            .filter(candidate => candidate.targetId === deployment.id)
            .map(candidate => entitiesById.get(candidate.sourceId))
            .filter(entity => entity?.type === 'repository');
          const repositoryIds = new Set(repositories.map(entity => entity.id));
          const projects = containsRelationships
            .filter(candidate => repositoryIds.has(candidate.targetId))
            .map(candidate => entitiesById.get(candidate.sourceId))
            .filter(entity => entity?.type === 'project');
          return {
            deployment,
            repositories: [...new Map(repositories.map(entity => [entity.id, entity])).values()],
            projects: [...new Map(projects.map(entity => [entity.id, entity])).values()],
            versionContext: this._deploymentVersionContext(deployment),
            placed: placedIds.has(deployment.id)
          };
        })
        .filter(Boolean)
        .sort((left, right) => this._entityDisplayName(left.deployment).localeCompare(
          this._entityDisplayName(right.deployment),
          'zh-CN'
        ));
    }

    _serverDeploymentContextHtml(serverId) {
      const context = this._serverDeploymentContext(serverId);
      if (!context.length) {
        return `
          <section class="relationship-server-context" aria-label="关联部署">
            <div class="relationship-inspector-section-title">关联部署</div>
            <p class="relationship-server-context-empty">尚无指向该服务器的“运行于”关系。</p>
          </section>`;
      }
      return `
        <section class="relationship-server-context" aria-label="关联部署">
          <div class="relationship-inspector-section-title">关联部署 · ${context.length}</div>
          <p class="relationship-server-context-note">从现有关系事实派生，不连接服务器或检查实时运行状态。</p>
          <ul>${context.map(item => {
            const projectNames = item.projects.map(entity => this._entityDisplayName(entity));
            const repositoryNames = item.repositories.map(entity => this._entityDisplayName(entity));
            const associations = [
              projectNames.length ? `项目 ${projectNames.join('、')}` : '未关联项目',
              repositoryNames.length ? `仓库 ${repositoryNames.join('、')}` : '未关联仓库'
            ].join(' · ');
            return `
              <li>
                <div>
                  <strong>${escapeHtml(this._entityDisplayName(item.deployment))}</strong>
                  <span title="${escapeHtml(item.versionContext)}">${escapeHtml(item.versionContext || '未记录部署版本上下文')}</span>
                  <small>${escapeHtml(associations)}</small>
                </div>
                <button type="button" data-relationship-locate-entity="${escapeHtml(item.deployment.id)}" ${item.placed ? '' : 'disabled title="该部署未放在当前白板"'}>定位</button>
              </li>`;
          }).join('')}</ul>
        </section>`;
    }

    _focusEntityOnBoard(entityId) {
      const board = activeBoard(this.store);
      const entity = this._allEntitiesById().get(entityId);
      const placement = this._combinedPlacements(board).find(candidate => candidate.entityId === entityId);
      if (!board || !entity || !placement) {
        this.notify('该关联节点未放在当前白板中', 'warning');
        return false;
      }
      const { mode } = this._boardView();
      if (this._hasActiveFilters(board.view) || board.view.projection !== 'facts') {
        board.view = {
          ...Model.defaultBoardView(),
          ...this._displayViewSettings(),
          mode,
          projection: 'facts'
        };
      }
      this._selectOnlyEntity(entityId);
      this.keyboardConnectSourceId = '';
      const canvas = this.root?.querySelector('.relationship-canvas');
      const rect = canvas?.getBoundingClientRect();
      if (rect?.width && rect?.height) {
        const { width, height } = this._nodeDimensions();
        const zoom = board.viewport.zoom;
        board.viewport.x = rect.width / 2 - (placement.x + width / 2) * zoom;
        board.viewport.y = rect.height / 2 - (placement.y + height / 2) * zoom;
      }
      this._applyViewMode();
      this._persistSoon(0);
      this._renderGraph();
      this._updateFilterSummary();
      this._updateSummary();
      this._setCanvasAnnouncement(`已在当前白板定位 ${this._entityDisplayName(entity)}`);
      return true;
    }

    _selectedFact() {
      const selectedIds = this._entitySelectionIds();
      if (selectedIds.size === 1) {
        const value = this._allEntitiesById().get(this.selectedEntityId);
        if (value) return { kind: 'entity', value };
      }
      if (this.selectedRelationshipId) {
        const value = this._combinedRelationships().find(relationship => relationship.id === this.selectedRelationshipId);
        if (value) return { kind: 'relationship', value };
      }
      return null;
    }

    _relationshipLabel(relationship) {
      return Model.cleanText(relationship?.label, 80)
        || RELATIONSHIP_LABELS[relationship?.type]
        || String(relationship?.type || '关系');
    }

    _relationshipTypeOptions(sourceType, targetType, selectedType) {
      return RELATIONSHIP_PRESET_GROUPS.map(group => {
        const options = group.types.filter(type => Model.connectionAllowed(type, sourceType, targetType));
        if (!options.length) return '';
        return `<optgroup label="${escapeHtml(group.label)}">${options.map(type => (
          `<option value="${type}"${type === selectedType ? ' selected' : ''}>${escapeHtml(RELATIONSHIP_LABELS[type])}</option>`
        )).join('')}</optgroup>`;
      }).join('');
    }

    _factSourceOptions(selectedSource) {
      return `<option value=""${selectedSource ? '' : ' selected'}>未注明</option>` + Model.FACT_SOURCES.map(source => (
        `<option value="${source}"${source === selectedSource ? ' selected' : ''}>${FACT_SOURCE_LABELS[source]}</option>`
      )).join('');
    }

    _verificationDescription(fact, status) {
      if (!fact.verifiedAt) return `尚未记录验证时间；当前复核周期为 ${status.maxAgeDays} 天。`;
      const date = new Date(fact.verifiedAt);
      const formatted = Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
        : '时间无效';
      if (status.state === 'stale') return `上次验证于 ${formatted}，已超过 ${status.maxAgeDays} 天复核周期。`;
      return `最近验证于 ${formatted}；按 ${status.maxAgeDays} 天周期复核。`;
    }

    _factFieldsHtml(fact) {
      const status = Model.verificationStatus(fact, { now: this.now() });
      return `
        <div class="relationship-fact-status" data-state="${status.state}">
          <span class="relationship-fact-status-dot" aria-hidden="true"></span>
          <div><strong>${status.label}</strong><small>${escapeHtml(this._verificationDescription(fact, status))}</small></div>
        </div>
        <label class="relationship-inspector-field">
          <span>事实来源</span>
          <select name="source">${this._factSourceOptions(fact.source || '')}</select>
        </label>
        <label class="relationship-inspector-field">
          <span>验证时间</span>
          <input name="verifiedAt" type="datetime-local" value="${escapeHtml(dateTimeLocalValue(fact.verifiedAt))}">
        </label>
        <label class="relationship-inspector-field">
          <span>复核周期（天）</span>
          <input name="reviewIntervalDays" type="number" min="1" max="3650" step="1" value="${escapeHtml(fact.reviewIntervalDays || '')}" placeholder="${Model.VERIFICATION_STALE_DAYS}" inputmode="numeric">
          <small>留空使用默认 ${Model.VERIFICATION_STALE_DAYS} 天；周期只影响待复核提示，不会自动连接或执行操作。</small>
        </label>
        <label class="relationship-inspector-field">
          <span>证据摘要</span>
          <textarea name="evidenceSummary" maxlength="500" rows="4" placeholder="记录核验方式或只读证据，不填写密码、令牌或密钥">${escapeHtml(fact.evidenceSummary || '')}</textarea>
        </label>`;
    }

    _entityDetailFieldsHtml(entity) {
      return (DETAIL_FIELD_DEFINITIONS[entity.type] || []).map(field => {
        const value = entity.details?.[field.key] || '';
        const control = field.multiline
          ? `<textarea name="detail-${field.key}" maxlength="${field.maxLength}" rows="3">${escapeHtml(value)}</textarea>`
          : `<input name="detail-${field.key}" value="${escapeHtml(value)}" maxlength="${field.maxLength}">`;
        return `<label class="relationship-inspector-field"><span>${field.label}</span>${control}</label>`;
      }).join('');
    }

    _todoRowHtml(todo = {}) {
      const normalized = normalizePlacementAnnotations({ todos: [{
        id: todo.id || makeId('todo'),
        title: todo.title || '新待办',
        completed: todo.completed === true,
        dueAt: todo.dueAt,
        reminderAt: todo.reminderAt
      }] }).todos?.[0] || { id: makeId('todo'), title: '新待办', completed: false };
      return `<div class="relationship-todo-row" data-todo-id="${escapeHtml(normalized.id)}">
        <label class="relationship-todo-check" title="完成状态"><input type="checkbox" data-todo-completed ${normalized.completed ? 'checked' : ''}><span class="sr-only">已完成</span></label>
        <input data-todo-title value="${escapeHtml(normalized.title)}" maxlength="160" aria-label="待办内容">
        <label><span>截止</span><input data-todo-due type="datetime-local" value="${escapeHtml(dateTimeLocalValue(normalized.dueAt))}"></label>
        <label><span>提醒</span><input data-todo-reminder type="datetime-local" value="${escapeHtml(dateTimeLocalValue(normalized.reminderAt))}"></label>
        <button type="button" data-relationship-action="remove-todo-row" aria-label="删除待办" title="删除待办">×</button>
      </div>`;
    }

    _annotationEditorHtml(entityId) {
      const placement = this._placementForEntity(entityId) || {};
      const annotations = normalizePlacementAnnotations(placement);
      const entity = this._allEntitiesById().get(entityId);
      const originalName = this._entityBaseName(entity);
      const titleModeOptions = [
        ['original', '保持原名'],
        ['replace', '替换标题'],
        ['prefix', '添加到原名前'],
        ['suffix', '添加到原名后'],
        ['subtitle', '作为副标题']
      ].map(([value, label]) => `<option value="${value}"${annotations.titleMode === value ? ' selected' : ''}>${label}</option>`).join('');
      const titleSource = annotations.titleSource || 'inherit';
      const statusVisibility = annotations.statusVisibility || 'inherit';
      return `<details class="relationship-annotation-section" open>
        <summary><span>卡片显示与注释</span><small>可折叠 · 仅保存到白板</small></summary>
        <div class="relationship-annotation-fields">
          <div class="relationship-title-alias-editor">
            <label class="relationship-inspector-field"><span>标题来源</span><select name="placementTitleSource"><option value="inherit"${titleSource === 'inherit' ? ' selected' : ''}>继承白板默认</option><option value="name"${titleSource === 'name' ? ' selected' : ''}>资源名称</option><option value="note"${titleSource === 'note' ? ' selected' : ''}>卡片备注</option></select></label>
            <label class="relationship-inspector-field"><span>状态显示</span><select name="placementStatusVisibility"><option value="inherit"${statusVisibility === 'inherit' ? ' selected' : ''}>继承白板默认</option><option value="show"${statusVisibility === 'show' ? ' selected' : ''}>始终显示</option><option value="hide"${statusVisibility === 'hide' ? ' selected' : ''}>隐藏状态</option></select></label>
            <label class="relationship-inspector-field"><span>名称显示</span><select name="placementTitleMode">${titleModeOptions}</select></label>
            <label class="relationship-inspector-field"><span>自定义名称</span><input name="placementTitleText" value="${escapeHtml(annotations.titleText || '')}" maxlength="160" placeholder="输入业务别名或补充名称"><small>原始名称：${escapeHtml(originalName)}</small></label>
          </div>
          <label class="relationship-inspector-field"><span>标签</span><input name="placementLabels" value="${escapeHtml((annotations.labels || []).join('，'))}" maxlength="180" placeholder="例如：生产，重点，待迁移"><small>使用逗号分隔，最多 6 个。</small></label>
          <label class="relationship-inspector-field"><span>备注</span><textarea name="placementNote" maxlength="1000" rows="4" placeholder="记录排查线索或上下文；不要填写密码、Token 或密钥">${escapeHtml(annotations.note || '')}</textarea></label>
          <div class="relationship-todo-heading"><span><strong>待办事项</strong><small>可设置截止和提醒时间</small></span><button class="relationship-secondary-button" type="button" data-relationship-action="add-todo-row">＋ 添加</button></div>
          <div class="relationship-todo-list" data-todo-list>${(annotations.todos || []).map(todo => this._todoRowHtml(todo)).join('')}</div>
        </div>
      </details>`;
    }

    _readPlacementAnnotations(form) {
      const data = new FormData(form);
      const titleMode = String(data.get('placementTitleMode') || 'original');
      const titleText = String(data.get('placementTitleText') || '');
      const titleSource = String(data.get('placementTitleSource') || 'inherit');
      const statusVisibility = String(data.get('placementStatusVisibility') || 'inherit');
      const labels = String(data.get('placementLabels') || '')
        .split(/[，,\n]/)
        .map(label => label.trim())
        .filter(Boolean);
      const note = String(data.get('placementNote') || '');
      const todos = [...form.querySelectorAll('.relationship-todo-row')].map(row => ({
        id: row.dataset.todoId || makeId('todo'),
        title: row.querySelector('[data-todo-title]')?.value || '',
        completed: row.querySelector('[data-todo-completed]')?.checked === true,
        dueAt: row.querySelector('[data-todo-due]')?.value || '',
        reminderAt: row.querySelector('[data-todo-reminder]')?.value || ''
      })).filter(todo => String(todo.title).trim());
      return normalizePlacementAnnotations({ titleMode, titleText, titleSource, statusVisibility, labels, note, todos });
    }

    _refreshLabelFilterOptions() {
      const select = this.root?.querySelector('[data-relationship-filter-form] select[name="label"]');
      if (!select) return;
      const selected = this._boardView().label || '';
      const labels = [...new Set(this._combinedPlacements()
        .flatMap(placement => normalizePlacementAnnotations(placement).labels || []))]
        .sort((left, right) => left.localeCompare(right, 'zh-CN'));
      if (selected && !labels.includes(selected)) labels.push(selected);
      select.innerHTML = '<option value="">全部标签</option>' + labels.map(label => (
        `<option value="${escapeHtml(label)}"${label === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`
      )).join('');
    }

    _writePlacementAnnotations(placement, annotations) {
      for (const key of ['titleMode', 'titleText', 'titleSource', 'statusVisibility', 'labels', 'note', 'todos']) {
        if (annotations[key]?.length || (['titleMode', 'titleText', 'titleSource', 'statusVisibility', 'note'].includes(key) && annotations[key])) placement[key] = clone(annotations[key]);
        else delete placement[key];
      }
    }

    _saveAnnotationForm(form) {
      const entityId = form.dataset.entityId;
      const placement = this._placementForEntity(entityId);
      if (!placement) return false;
      try {
        const annotations = this._readPlacementAnnotations(form);
        if (placement.dynamic) {
          this._writePlacementAnnotations(placement, annotations);
          this._saveDynamicPlacementOverrides([entityId]);
        } else {
          this._recordMutation();
          this._writePlacementAnnotations(placement, annotations);
          this.store = Model.assertValidStore(this.store);
          this._persistSoon(0);
          this._refreshHistoryButtons();
        }
        form.classList.remove('is-dirty');
        this._renderGraph();
        this._refreshLabelFilterOptions();
        this._scheduleTaskReminders();
        this._updateFilterSummary();
        this._updateSummary();
        this._setCanvasAnnouncement('白板注释已保存');
        return true;
      } catch (error) {
        this._showInspectorError(form, error?.message || String(error));
        return false;
      }
    }

    _endpointCheckHtml(entity) {
      if (entity.runtime?.dynamicKind !== 'panel-endpoint') return '';
      return `<section class="relationship-endpoint-check">
        ${entity.runtime.checkMessage ? `<p>${escapeHtml(entity.runtime.checkMessage)}</p>` : ''}
        <small>本机 HTTP 检测，不代表登录后或业务功能正常。</small>
        <button class="relationship-secondary-button" type="button" data-endpoint-check="${escapeHtml(entity.id)}" ${entity.runtime.checking ? 'disabled' : ''}>${entity.runtime.checking ? '检测中…' : '重新检测'}</button>
      </section>`;
    }

    _runtimeInspectorRows(entity) {
      const runtime = entity.runtime || {};
      const rows = [];
      const add = (label, value, title = '') => {
        if (value === null || value === undefined || value === '') return;
        rows.push(`<div><dt>${escapeHtml(label)}</dt><dd${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(value)}</dd></div>`);
      };
      add('当前状态', entity.type === 'endpoint' ? this._entityRuntimeStatus(entity)?.label : (runtime.status || 'unknown'));
      if (entity.type === 'server') {
        add('最近延迟', runtime.latencyMs === null ? '未知' : `${runtime.latencyMs} ms`);
        add('部署资源', `${runtime.resourceCount || 0} 个`);
        add('最后观测', this._relativeTime(runtime.observedAt), runtime.observedAt);
        add('最后在线', this._relativeTime(runtime.lastSeenAt), runtime.lastSeenAt);
      } else if (entity.type === 'deployment') {
        add('环境', runtime.environmentName || '默认环境');
        add('服务器', runtime.serverName || '未知服务器');
        add('访问延迟', runtime.latencyMs === null ? '未知' : `${runtime.latencyMs} ms${runtime.latencyKind ? ` · ${runtime.latencyKind}` : ''}`);
        add('最后观测', this._relativeTime(runtime.observedAt), runtime.observedAt);
        add('最近部署失败', runtime.recentFailure?.known === false ? '未知' : (runtime.recentFailure?.hasFailure ? '是' : '否'));
        if (runtime.recentFailure?.hasFailure) {
          add('失败时间', this._relativeTime(runtime.recentFailure.occurredAt), runtime.recentFailure.occurredAt);
          add('失败摘要', runtime.recentFailure.message || '未提供原因');
          if (runtime.recentFailure.recoveredAt) add('恢复时间', this._relativeTime(runtime.recentFailure.recoveredAt), runtime.recentFailure.recoveredAt);
        }
        add('分支', runtime.branch);
        add(runtime.commitSource === 'deployment-history' ? '最近部署提交' : '配置提交', runtime.commit || '未知', runtime.commit);
        add('最近部署结果', runtime.lastDeployment?.status);
        add('镜像', runtime.imageReference, runtime.imageReference);
      } else if (entity.type === 'endpoint') {
        add('访问地址', runtime.url || entity.details.urlLabel);
        add('HTTP 响应', runtime.httpStatus);
        add('HTTP 延迟', Number.isFinite(runtime.latencyMs) ? `${runtime.latencyMs} ms` : '未取得');
        add('最后检测', runtime.observedAt ? this._relativeTime(runtime.observedAt) : '尚未检测', runtime.observedAt);
      }
      return rows.join('');
    }

    _inspectorHeaderActions(closeLabel = '关闭关系详情') {
      return `<div class="relationship-inspector-header-actions">
        ${this._panelMoveControls('inspector', '详情')}
        <button type="button" data-panel-collapse="inspector" aria-label="折叠或展开详情" title="折叠或展开详情">⌄</button>
        <button type="button" data-relationship-action="toggle-inspector-pin" aria-pressed="${this.inspectorPinned}" aria-label="${this.inspectorPinned ? '取消固定详情窗口' : '固定详情窗口'}" title="${this.inspectorPinned ? '取消固定' : '固定在白板上'}">⌖</button>
        <button type="button" data-relationship-action="close-inspector" aria-label="${escapeHtml(closeLabel)}" title="关闭详情">×</button>
      </div>`;
    }

    _syncInspectorPinState() {
      const panel = this._panelElement('.relationship-inspector-panel');
      if (!panel) return;
      panel.dataset.pinned = String(this.inspectorPinned);
      const button = panel.querySelector('[data-relationship-action="toggle-inspector-pin"]');
      if (!button) return;
      button.setAttribute('aria-pressed', String(this.inspectorPinned));
      button.setAttribute('aria-label', this.inspectorPinned ? '取消固定详情窗口' : '固定详情窗口');
      button.title = this.inspectorPinned ? '取消固定' : '固定在白板上';
      this._placePanelComponents();
    }

    _repositoryAssociationMessage(runtime = {}) {
      const mode = runtime.repositoryAssociation?.mode || 'unmatched';
      if (runtime.missingRepositoryIds?.length) return '原关联的本地目录已不可用，请重新选择；原关系已保留';
      const labels = {
        automatic: '自动识别 · 源码地址唯一匹配', manual: '手工关联 · 本机已保存', project: '项目中保存的手工关联',
        ambiguous: '发现多个本地副本，请确认目录', suggested: '源码地址缺少 Git 主机，请确认候选',
        disabled: '已解除关联 · 自动匹配已暂停', unmatched: '尚未找到相同源码地址的本地仓库',
        'no-source': '部署未提供 Git 源码地址，可手动选择仓库；镜像部署不一定有仓库来源'
      };
      return labels[mode] || labels.unmatched;
    }

    _repositoryAssociationHtml(fact) {
      const runtime = fact.runtime || {};
      const association = runtime.repositoryAssociation || { mode: 'unmatched' };
      const repositoryIds = runtime.repositoryIds || [];
      const missingIds = new Set(runtime.missingRepositoryIds || []);
      const candidates = (association.candidateIds || []).filter(id => !repositoryIds.includes(id));
      const action = (mode, label) => `<button class="relationship-secondary-button" type="button" data-panel-association-action="${mode}" data-entity-id="${escapeHtml(fact.id)}" ${this.repositoryAssociationSaving ? 'disabled' : ''}>${label}</button>`;
      return `<section class="relationship-repository-association" aria-label="本地仓库关联">
        <div class="relationship-inspector-section-title">本地仓库关联</div>
        <p class="relationship-association-status" data-association-mode="${escapeHtml(association.mode)}">${escapeHtml(this._repositoryAssociationMessage(runtime))}</p>
        ${association.repositoryKey || runtime.repositoryUrl ? `<small class="relationship-association-source">${escapeHtml(association.repositoryKey || runtime.repositoryUrl)}</small>` : ''}
        <ul class="relationship-panel-repository-list">
          ${repositoryIds.length ? repositoryIds.map(repositoryId => {
            const resource = this.resourceMap.get(`repository:${repositoryId}`);
            return `<li data-state="${missingIds.has(repositoryId) ? 'missing' : 'ready'}">
              <div><strong>${escapeHtml(resource?.name || '仓库暂不可用')}</strong><small title="${escapeHtml(resource?.path || '')}">${escapeHtml(resource?.path || '本机尚无该仓库')}</small>${missingIds.has(repositoryId) ? '<small>目录缺失，保留原有关联</small>' : ''}</div>
              ${resource && !missingIds.has(repositoryId) ? `<div class="relationship-repository-jumps"><button type="button" data-panel-open-repository="${escapeHtml(repositoryId)}">打开目录</button><button type="button" data-panel-reveal-repository="${escapeHtml(repositoryId)}">白板定位</button></div>` : ''}
            </li>`;
          }).join('') : candidates.length ? candidates.map(repositoryId => {
            const resource = this.resourceMap.get(`repository:${repositoryId}`);
            return `<li data-state="candidate"><div><strong>${escapeHtml(resource?.name || '候选仓库')} · 待确认</strong><small>${escapeHtml(resource?.path || '目录暂不可用')}</small></div></li>`;
          }).join('') : '<li data-state="unlinked"><div><strong>未关联本地仓库</strong></div></li>'}
        </ul>
        <p class="relationship-inspector-boundary">使用已扫描的本地仓库索引，仅匹配此部署。新增目录请在资源库中“扫描本地仓库”。</p>
        ${association.mode === 'project' ? '<p class="relationship-inspector-boundary">请在项目详情的部署关联中更换或解除；自动匹配不会覆盖此关联。</p>' : `<div class="relationship-inspector-actions">
          ${action('choose', association.candidateIds?.length > 1 || association.mode === 'suggested' ? '确认候选仓库…' : '手动选择 / 更换仓库…')}
          ${association.mode === 'disabled' || association.mode === 'manual' ? action('automatic', '恢复自动匹配') : action('match', '匹配此部署')}
          ${repositoryIds.length ? action('disabled', '解除关联') : ''}
        </div>`}
      </section>`;
    }

    async _changeRepositoryAssociation(entityId, action) {
      if (this.repositoryAssociationSaving) return;
      const entity = this._allEntitiesById().get(entityId);
      if (entity?.type !== 'deployment' || !entity.runtime?.resourceUuid || entity.runtime.repositoryAssociation?.mode === 'project') return;
      const runtime = entity.runtime;
      if (!['choose', 'automatic', 'disabled', 'match'].includes(action)) return;
      this.repositoryAssociationSaving = true;
      try {
        if (action !== 'match') {
          const repositoryIds = action === 'choose' ? await this._openRepositoryAssociationDialog(entity) : [];
          if (!repositoryIds) return;
          this.repositoryAssociationRevision += 1;
          this.repositoryAssociations = await this.bridge.panel.setRepositoryAssociation({
            providerId: runtime.providerId, resourceUuid: runtime.resourceUuid,
            mode: action === 'choose' ? 'manual' : action, repositoryIds
          });
        }
        this._setPanelTopology(this.panelTopologyResult);
        this._renderResources();
        this._renderGraph();
        this._updateSummary();
        const resolved = this._allEntitiesById().get(entityId)?.runtime;
        this.notify(action === 'disabled' ? '已解除关联，刷新时不会自动重连' : (action === 'choose' ? '本地仓库关联已保存' : this._repositoryAssociationMessage(resolved)), resolved?.repositoryIds?.length || ['choose', 'disabled'].includes(action) ? 'success' : 'warning');
      } catch (error) {
        this.notify(`仓库关联失败：${error?.message || String(error)}`, 'error');
      } finally {
        this.repositoryAssociationSaving = false;
        this._renderInspector();
      }
    }

    _openRepositoryAssociationDialog(entity) {
      const candidates = new Set(entity.runtime.repositoryAssociation?.candidateIds || []);
      const checked = new Set(entity.runtime.repositoryIds || []);
      const repos = this.panelRepositories.filter(repo => repo.id && repo.path && !repo.archived && repo.available !== false)
        .slice().sort((a, b) => Number(candidates.has(b.id)) - Number(candidates.has(a.id)) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'relationship-dialog-overlay';
        overlay.innerHTML = `<form class="relationship-dialog" role="dialog" aria-modal="true" aria-labelledby="repository-association-title">
          <header><h3 id="repository-association-title">选择本地仓库</h3><button type="button" data-dialog-cancel aria-label="关闭">×</button></header>
          <div class="relationship-dialog-body">
            <p>${escapeHtml(this._entityDisplayName(entity))}${entity.runtime.branch ? ` · 部署分支 ${escapeHtml(entity.runtime.branch)}` : ''}</p>
            <p>最多选择 8 个仓库。候选仅供参考；分支和目录名不能单独证明源码一致。关联只保存在本机，不修改项目身份。</p>
            <input class="relationship-repository-search" type="search" placeholder="搜索名称或目录" aria-label="搜索本地仓库">
            <div class="relationship-repository-choices">${repos.map(repo => `<label data-repository-choice>
              <input type="checkbox" name="repositoryId" value="${escapeHtml(repo.id)}" ${checked.has(repo.id) ? 'checked' : ''}>
              <span><strong>${escapeHtml(repo.name || repo.id)}${candidates.has(repo.id) ? ' · 源码候选' : ''}</strong><small>${escapeHtml(repo.path)}</small></span>
            </label>`).join('') || '<p>没有可用的本地仓库，请先添加位置并扫描。</p>'}</div>
            <p class="relationship-inspector-error" role="alert"></p>
          </div>
          <footer><button class="btn" type="button" data-dialog-cancel>取消</button><button class="btn btn-primary" type="submit" ${repos.length ? '' : 'disabled'}>保存关联</button></footer>
        </form>`;
        const finish = value => {
          document.removeEventListener('keydown', onKeydown, true);
          overlay.remove();
          resolve(value);
        };
        const onKeydown = event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); }
        };
        overlay.addEventListener('click', event => { if (event.target.closest('[data-dialog-cancel]')) finish(null); });
        overlay.querySelector('input[type="search"]').addEventListener('input', event => {
          const query = event.target.value.toLocaleLowerCase().trim();
          overlay.querySelectorAll('[data-repository-choice]').forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase().includes(query); });
        });
        overlay.querySelector('form').addEventListener('submit', event => {
          event.preventDefault();
          const ids = [...new Set(new FormData(event.currentTarget).getAll('repositoryId'))];
          if (!ids.length || ids.length > 8) { overlay.querySelector('[role="alert"]').textContent = '请选择 1–8 个本地仓库'; return; }
          finish(ids);
        });
        document.body.appendChild(overlay);
        document.addEventListener('keydown', onKeydown, true);
        overlay.querySelector('input[type="search"]').focus();
      });
    }

    _renderTransientInspector(selected) {
      const panel = this._panelElement('.relationship-inspector-panel');
      const body = this.root?.querySelector('.relationship-body');
      if (!panel || !body) return;
      const fact = selected.value;
      if (['text', 'image', 'attachment'].includes(fact.type)) {
        panel.hidden = false; body.classList.add('has-inspector');
        panel.innerHTML = `<header class="relationship-inspector-header"><h3>${escapeHtml(fact.name)}</h3>${this._inspectorHeaderActions('关闭属性')}</header>
          <div class="whiteboard-element-properties"><p>${fact.type === 'text' ? '文字内容、字号、颜色与对齐' : fact.details.referencePath ? '外部引用，原文件移动后需重新选择。' : fact.details.assetPath ? '媒体保存在白板项目 assets 目录；移动项目时请携带整个文件夹。' : '内嵌图片，随白板文件保存。'}</p>
          <button type="button" data-edit-canvas-element="${escapeHtml(fact.id)}">编辑${TYPE_LABELS[fact.type]}</button>
          <button type="button" data-lock-canvas-element="${escapeHtml(fact.id)}">${this._placementForEntity(fact.id)?.locked ? '解锁位置' : '锁定位置'}</button></div>`;
        this._syncInspectorPinState(); this._applyResourcePanelPosition(); return;
      }
      const entitiesById = this._allEntitiesById();
      let heading;
      let subheading;
      let content;
      if (selected.kind === 'relationship') {
        const source = entitiesById.get(fact.sourceId);
        const target = entitiesById.get(fact.targetId);
        heading = this._relationshipLabel(fact);
        subheading = 'Coolify 派生关系 · 只读';
        content = `
          <dl class="relationship-inspector-identity">
            <div><dt>起点</dt><dd>${escapeHtml(this._entityDisplayName(source))}</dd></div>
            <div><dt>终点</dt><dd>${escapeHtml(this._entityDisplayName(target))}</dd></div>
            <div><dt>来源</dt><dd>Coolify 动态拓扑</dd></div>
          </dl>`;
      } else {
        heading = this._entityDisplayName(fact);
        subheading = fact.runtime?.dynamicKind
          ? `${TYPE_LABELS[fact.type]} · Coolify 只读观测`
          : `${TYPE_LABELS[fact.type]} · 动态投影引用`;
        const runtime = fact.runtime || {};
        const localResource = fact.refId ? this.resourceMap.get(`${fact.type}:${fact.refId}`) : null;
        const repositoriesHtml = fact.type === 'deployment' ? this._repositoryAssociationHtml(fact) : '';
        const externalActions = [
          runtime.panelUrl ? `<button class="relationship-primary-button" type="button" data-panel-open-external="${escapeHtml(runtime.panelUrl)}">打开数据源</button>` : '',
          runtime.coolifyUrl ? `<button class="relationship-secondary-button" type="button" data-panel-open-external="${escapeHtml(runtime.coolifyUrl)}">打开 Coolify</button>` : ''
        ].filter(Boolean).join('');
        content = `
          ${fact.refId ? `<dl class="relationship-inspector-identity"><div><dt>稳定身份</dt><dd title="${escapeHtml(fact.refId)}">${escapeHtml(fact.refId)}</dd></div><div><dt>当前解析位置</dt><dd title="${escapeHtml(localResource?.path || '')}">${escapeHtml(localResource?.path || '本机尚无该资源')}</dd></div></dl>` : `<dl class="relationship-inspector-identity relationship-runtime-facts">${this._runtimeInspectorRows(fact)}</dl>${this._endpointCheckHtml(fact)}`}
          ${repositoriesHtml}
          ${externalActions ? `<div class="relationship-inspector-actions">${externalActions}</div>` : ''}`;
      }
      panel.hidden = false;
      body.classList.add('has-inspector');
      panel.innerHTML = `
        <header class="relationship-inspector-header">
          <div><small>${escapeHtml(subheading)}</small><h3>${escapeHtml(heading)}</h3></div>
          ${this._inspectorHeaderActions()}
        </header>
        <div class="relationship-runtime-inspector">
          ${content}
          <p class="relationship-inspector-boundary">动态事实直接来自 Coolify，只读显示，不写入本机白板，也不会触发部署或修改 Git。</p>
          ${selected.kind === 'entity' ? `<form class="relationship-inspector-form relationship-annotation-form" data-relationship-annotation-form data-entity-id="${escapeHtml(fact.id)}">
            ${this._annotationEditorHtml(fact.id)}
            <p class="relationship-inspector-error" role="alert"></p>
            <div class="relationship-inspector-actions"><button class="relationship-primary-button" type="submit" data-inspector-save disabled>保存注释</button></div>
          </form>` : ''}
        </div>`;
      this._syncInspectorPinState();
      this._applyResourcePanelPosition();
    }

    _renderInspector() {
      const panel = this._panelElement('.relationship-inspector-panel');
      const body = this.root?.querySelector('.relationship-body');
      if (!panel || !body) return;
      const selectedIds = this._entitySelectionIds();
      if (selectedIds.size > 1) {
        const selectedEntities = this._combinedEntities().filter(entity => selectedIds.has(entity.id));
        const selectedMembers = this._selectedMemberPlacements();
        const board = activeBoard(this.store);
        const groupOptions = (board?.placements || []).map(placement => (
          this.store.entities.find(entity => entity.id === placement.entityId)
        )).filter(entity => entity?.type === 'group' && selectedMembers.every(item => this._canJoinGroup(item.entityId, entity.id))).map(entity => (
          `<option value="${escapeHtml(entity.id)}">${escapeHtml(entity.name)}</option>`
        )).join('');
        const hasGroupedMembers = this._combinedPlacements().some(placement => (
          selectedIds.has(placement.entityId) && Boolean(placement.groupId)
        ));
        panel.hidden = false;
        body.classList.add('has-inspector');
        panel.innerHTML = `
          <header class="relationship-inspector-header">
            <div><small>批量布局选择</small><h3>已选择 ${selectedEntities.length} 个节点</h3></div>
            ${this._inspectorHeaderActions('清除节点选择')}
          </header>
          <div class="relationship-multi-selection">
            <p>可以一起拖动、使用 Alt/Option＋方向键移动，或按 Delete 移出当前白板。方向键不加修饰键时平移视图。</p>
            <ul>${selectedEntities.slice(0, 8).map(entity => `<li>${escapeHtml(this._entityDisplayName(entity))}<small>${TYPE_LABELS[entity.type]}</small></li>`).join('')}${selectedEntities.length > 8 ? `<li>另有 ${selectedEntities.length - 8} 个节点…</li>` : ''}</ul>
            ${selectedMembers.length ? `
              <section class="relationship-multi-group-actions" aria-label="视觉分组操作">
                <strong>视觉分组</strong>
                <button class="relationship-primary-button" type="button" data-relationship-action="create-group-from-selection">建立视觉分组…</button>
                ${groupOptions ? `<div><select data-relationship-group-target aria-label="选择已有分组">${groupOptions}</select><button class="relationship-secondary-button" type="button" data-relationship-action="assign-selection-group">归入分组</button></div>` : ''}
                <button class="relationship-secondary-button" type="button" data-relationship-action="remove-selection-group" ${hasGroupedMembers ? '' : 'disabled'}>移出分组</button>
                <small>分组只整理当前白板布局，不会新增关系事实。</small>
              </section>` : ''}
            <p class="relationship-inspector-boundary">为避免混淆来源与核验状态，事实字段必须逐个节点编辑。</p>
          </div>`;
        this._syncInspectorPinState();
        this._applyResourcePanelPosition();
        return;
      }
      const selected = this._selectedFact();
      if (!selected) {
        panel.hidden = true;
        panel.innerHTML = '';
        body.classList.remove('has-inspector');
        this._applyResourcePanelPosition();
        return;
      }

      const fact = selected.value;
      if (fact.transient || ['text', 'image', 'attachment'].includes(fact.type)) {
        this._renderTransientInspector(selected);
        return;
      }
      const isVisualGroup = selected.kind === 'entity' && fact.type === 'group';
      let heading = '';
      let subheading = '';
      let identityHtml = '';
      let availabilityHtml = '';
      let editableFields = '';
      let contextHtml = '';
      if (selected.kind === 'entity') {
        const resource = fact.refId ? this.resourceMap.get(`${fact.type}:${fact.refId}`) : null;
        const availability = this._entityAvailability(fact);
        heading = this._entityDisplayName(fact);
        subheading = TYPE_LABELS[fact.type];
        identityHtml = fact.refId ? `
          <dl class="relationship-inspector-identity">
            <div><dt>稳定身份</dt><dd title="${escapeHtml(fact.refId)}">${escapeHtml(fact.refId)}</dd></div>
            <div><dt>当前解析位置</dt><dd title="${escapeHtml(resource?.path || '')}">${escapeHtml(resource?.path || '引用已失效')}</dd></div>
          </dl>` : '';
        availabilityHtml = availability.missing ? `
          <div class="relationship-resource-missing" role="status">
            <strong>${escapeHtml(availability.label)}</strong>
            <small>${escapeHtml(availability.detail)}。可继续查看、编辑和导出本节点及其关系。</small>
          </div>` : '';
        editableFields = `${fact.refId ? '' : `
          <label class="relationship-inspector-field">
            <span>名称</span>
            <input name="name" value="${escapeHtml(fact.name)}" maxlength="160" required>
          </label>`}${this._entityDetailFieldsHtml(fact)}${isVisualGroup ? this._groupAppearanceEditorHtml(fact.id) : ''}`;
        if (fact.type === 'server') contextHtml = this._serverDeploymentContextHtml(fact.id);
      } else {
        const entitiesById = this._allEntitiesById();
        const source = entitiesById.get(fact.sourceId);
        const target = entitiesById.get(fact.targetId);
        heading = this._relationshipLabel(fact);
        subheading = `${this._entityDisplayName(source)} → ${this._entityDisplayName(target)}`;
        identityHtml = `
          <dl class="relationship-inspector-identity">
            <div><dt>起点</dt><dd>${escapeHtml(this._entityDisplayName(source))}</dd></div>
            <div><dt>终点</dt><dd>${escapeHtml(this._entityDisplayName(target))}</dd></div>
          </dl>`;
        editableFields = `
          <section class="relationship-semantics-editor" aria-label="关系语义与方向">
            <div class="relationship-inspector-section-title">关系语义</div>
            <label class="relationship-inspector-field">
              <span>关系类型</span>
              <select name="relationshipType">${this._relationshipTypeOptions(source?.type, target?.type, fact.type)}</select>
            </label>
            <label class="relationship-inspector-field">
              <span>显示名称（可选）</span>
              <input name="relationshipLabel" value="${escapeHtml(fact.label || '')}" maxlength="80" placeholder="默认使用关系类型名称">
            </label>
            <button class="relationship-secondary-button relationship-reverse-button" type="button" data-relationship-action="reverse-relationship">
              <span aria-hidden="true">⇄</span><span>反转方向</span>
            </button>
            <small>反转时会自动改用语义相反的预设，例如“包含”变为“属于”。</small>
          </section>`;
      }

      panel.hidden = false;
      body.classList.add('has-inspector');
      panel.innerHTML = `
        <header class="relationship-inspector-header">
          <div><small>${escapeHtml(subheading)}</small><h3>${escapeHtml(heading)}</h3></div>
          ${this._inspectorHeaderActions()}
        </header>
        <form class="relationship-inspector-form" data-relationship-inspector-form data-inspector-kind="${selected.kind}" data-inspector-id="${escapeHtml(fact.id)}">
          ${identityHtml}
          ${availabilityHtml}
          ${editableFields}
          ${contextHtml}
          ${selected.kind === 'entity' ? this._annotationEditorHtml(fact.id) : ''}
          ${isVisualGroup ? '<p class="relationship-inspector-boundary">视觉分组只属于当前白板布局，不参与部署或 Git 事实推理。</p>' : `
            <div class="relationship-inspector-section-title">事实与核验</div>
            ${this._factFieldsHtml(fact)}`}
          <p class="relationship-inspector-error" role="alert"></p>
          <div class="relationship-inspector-actions">
            ${isVisualGroup ? '' : '<button class="relationship-secondary-button" type="button" data-relationship-action="verify-now">标记为刚刚验证</button>'}
            <button class="relationship-primary-button" type="submit" data-inspector-save disabled>${isVisualGroup ? '保存分组' : '保存事实'}</button>
          </div>
          ${isVisualGroup ? '' : '<p class="relationship-inspector-boundary">只修改 GitFinder 本机关系事实，不会连接服务器、执行部署或修改 Git。</p>'}
        </form>`;
      this._syncInspectorPinState();
      this._applyResourcePanelPosition();
    }

    _showInspectorError(form, message) {
      const error = form?.querySelector('.relationship-inspector-error');
      if (error) error.textContent = message;
    }

    _saveInspectorForm(form) {
      const kind = form.dataset.inspectorKind;
      const id = form.dataset.inspectorId;
      const nextStore = clone(this.store);
      const target = kind === 'entity'
        ? nextStore.entities.find(entity => entity.id === id)
        : nextStore.relationships.find(relationship => relationship.id === id);
      if (!target) {
        this._showInspectorError(form, '所选事实已不存在，请重新选择。');
        return false;
      }

      try {
        const data = new FormData(form);
        if (kind === 'entity' && !target.refId && data.has('name')) {
          target.name = String(data.get('name') || '');
          const definitions = DETAIL_FIELD_DEFINITIONS[target.type] || [];
          const details = {};
          for (const field of definitions) {
            const value = String(data.get(`detail-${field.key}`) || '');
            if (value.trim()) details[field.key] = value;
          }
          target.details = details;
        }

        if (kind === 'relationship') {
          target.type = String(data.get('relationshipType') || target.type);
          const relationshipLabel = String(data.get('relationshipLabel') || '').trim();
          if (relationshipLabel) target.label = relationshipLabel; else delete target.label;
        }

        if (kind === 'entity') {
          const placement = activeBoard(nextStore)?.placements.find(item => item.entityId === id);
          if (placement) {
            this._writePlacementAnnotations(placement, this._readPlacementAnnotations(form));
            if (target.type === 'group') {
              const groupId = String(data.get('parentGroup') || '');
              if (!this._canJoinGroup(id, groupId)) throw new Error('群组不能加入自身或自己的子群组');
              if (groupId) placement.groupId = groupId; else delete placement.groupId;
              for (const field of ['groupBackground', 'groupBorder']) {
                if (data.has(field)) placement[field] = String(data.get(field));
              }
            }
          }
        }

        const isVisualGroup = kind === 'entity' && target.type === 'group';
        if (!isVisualGroup) {
          const source = String(data.get('source') || '');
          const verifiedAt = localDateTimeToIso(data.get('verifiedAt'));
          const reviewIntervalInput = String(data.get('reviewIntervalDays') || '').trim();
          const evidenceSummary = String(data.get('evidenceSummary') || '');
          if (source) target.source = source; else delete target.source;
          if (verifiedAt) target.verifiedAt = verifiedAt; else delete target.verifiedAt;
          if (reviewIntervalInput) {
            const reviewIntervalDays = Number(reviewIntervalInput);
            if (!Number.isInteger(reviewIntervalDays) || reviewIntervalDays < 1 || reviewIntervalDays > 3650) {
              throw new Error('复核周期必须是 1 到 3650 之间的整数天数');
            }
            target.reviewIntervalDays = reviewIntervalDays;
          } else delete target.reviewIntervalDays;
          if (evidenceSummary.trim()) target.evidenceSummary = evidenceSummary; else delete target.evidenceSummary;
        }

        const normalized = Model.assertValidStore(nextStore);
        if (JSON.stringify(normalized) === JSON.stringify(this.store)) {
          form.classList.remove('is-dirty');
          const saveButton = form.querySelector('[data-inspector-save]');
          if (saveButton) saveButton.disabled = true;
          return true;
        }
        this._recordMutation();
        this.store = normalized;
        this._persistSoon(0);
        form.classList.remove('is-dirty');
        this._renderGraph();
        this._refreshLabelFilterOptions();
        this._scheduleTaskReminders();
        this._refreshHistoryButtons();
        this._updateSummary();
        this._setCanvasAnnouncement(isVisualGroup ? '视觉分组已保存' : '关系事实已保存');
        return true;
      } catch (error) {
        this._showInspectorError(form, error?.message || String(error));
        return false;
      }
    }

    _verifySelectedNow() {
      const selected = this._selectedFact();
      if (!selected) return false;
      const nextStore = clone(this.store);
      const target = selected.kind === 'entity'
        ? nextStore.entities.find(entity => entity.id === selected.value.id)
        : nextStore.relationships.find(relationship => relationship.id === selected.value.id);
      const now = new Date(this.now());
      if (!target || !Number.isFinite(now.getTime())) {
        this.notify('无法记录当前验证时间', 'error');
        return false;
      }
      target.verifiedAt = now.toISOString();
      if (!target.source) target.source = 'manual';
      try {
        const normalized = Model.assertValidStore(nextStore);
        this._recordMutation();
        this.store = normalized;
        this._persistSoon(0);
        this._renderGraph();
        this._refreshHistoryButtons();
        this._updateSummary();
        this._setCanvasAnnouncement('已记录本次人工验证时间');
        return true;
      } catch (error) {
        this.notify(error?.message || String(error), 'error');
        return false;
      }
    }

    _reverseSelectedRelationship() {
      const id = this.selectedRelationshipId;
      const index = this.store?.relationships.findIndex(relationship => relationship.id === id) ?? -1;
      if (index < 0) return false;
      const nextStore = clone(this.store);
      const relationship = nextStore.relationships[index];
      const entities = new Map(nextStore.entities.map(entity => [entity.id, entity]));
      const nextSource = entities.get(relationship.targetId);
      const nextTarget = entities.get(relationship.sourceId);
      if (!nextSource || !nextTarget) return false;
      const preferredTypes = [
        INVERSE_RELATIONSHIP_TYPES[relationship.type],
        relationship.type,
        ...Model.RELATIONSHIP_TYPES
      ].filter(Boolean);
      const nextType = preferredTypes.find((type, candidateIndex) => (
        preferredTypes.indexOf(type) === candidateIndex
          && Model.connectionAllowed(type, nextSource.type, nextTarget.type)
      ));
      if (!nextType) {
        this.notify('这两个节点没有可用的反向关系类型', 'warning');
        return false;
      }
      relationship.type = nextType;
      [relationship.sourceId, relationship.targetId] = [relationship.targetId, relationship.sourceId];
      try {
        const normalized = Model.assertValidStore(nextStore);
        this._recordMutation();
        this.store = normalized;
        this._persistSoon(0);
        this._renderGraph();
        this._refreshHistoryButtons();
        this._updateSummary();
        this._setCanvasAnnouncement(`关系方向已反转为“${this._relationshipLabel(relationship)}”`);
        return true;
      } catch (error) {
        this.notify(error?.message || String(error), 'error');
        return false;
      }
    }

    _edgeGeometry(relationship, overrideTarget = null, geometryById = null) {
      const placements = this._combinedPlacements(activeBoard(this.store));
      const source = placements.find(placement => placement.entityId === relationship.sourceId);
      const target = overrideTarget || placements.find(placement => placement.entityId === relationship.targetId);
      if (!source || !target) return null;
      const displayGeometry = geometryById || this._displayGeometryMap(this._filteredGraph().placements);
      const fallbackDimensions = this._nodeDimensions();
      const sourceGeometry = displayGeometry.get(relationship.sourceId) || { ...source, ...fallbackDimensions };
      const targetGeometry = overrideTarget
        ? { x: target.x, y: target.y, width: 0, height: 0 }
        : (displayGeometry.get(relationship.targetId) || { ...target, ...fallbackDimensions });
      const scale = this._displayViewSettings().cardScale;
      const portOffsetY = (this._displayViewSettings().mode === 'compact' ? 44.5 : 59.5) * scale;
      if (this.edgeRoutingContext?.geometry !== displayGeometry
        || this.edgeRoutingContext?.portOffsetY !== portOffsetY || this.edgeRoutingContext?.scale !== scale) {
        const entities = this._allEntitiesById();
        const previous = this.edgeRoutingContext?.portOffsetY === portOffsetY && this.edgeRoutingContext?.scale === scale
          ? this.edgeRoutingContext : null;
        const obstacles = [...displayGeometry].filter(([id]) => entities.get(id)?.type !== 'group');
        const before = new Map(previous?.obstacles || []), after = new Map(obstacles);
        const same = (a, b) => a && b && ['x', 'y', 'width', 'height'].every(key => a[key] === b[key]);
        const changed = [...new Set([...before.keys(), ...after.keys()])]
          .filter(id => !same(before.get(id), after.get(id)))
          .flatMap(id => [before.get(id), after.get(id)].filter(Boolean));
        this.edgeRoutingContext = { geometry: displayGeometry, routes: new Map(),
          obstacles, changed, same, scale, portOffsetY, previousRoutes: previous?.routes, previousGeometry: previous?.geometry };
      }
      const context = this.edgeRoutingContext;
      const key = `${relationship.sourceId}:${relationship.targetId}`;
      if (!overrideTarget && context.routes.has(key)) return context.routes.get(key);
      const previousRoute = !overrideTarget && context.previousRoutes?.get(key);
      if (previousRoute && !previousRoute.obstructed
        && context.same(sourceGeometry, context.previousGeometry.get(relationship.sourceId))
        && context.same(targetGeometry, context.previousGeometry.get(relationship.targetId))) {
        const bounds = previousRoute.influenceBounds;
        if (bounds && !context.changed.some(r => r.x < bounds.right && r.x + r.width > bounds.left
          && r.y < bounds.bottom && r.y + r.height > bounds.top)) {
          context.routes.set(key, previousRoute); return previousRoute;
        }
      }
      const route = PanelTopologyProjection.routeRelationship(sourceGeometry, targetGeometry,
        context.obstacles.filter(([id]) => id !== relationship.sourceId && id !== relationship.targetId).map(([, rect]) => rect),
        { portOffsetY, inset: 0.5 * scale, sourceSide: overrideTarget ? this.pointerAction?.sourceSide : undefined });
      route.influenceBounds = {
        left: Math.min(sourceGeometry.x, targetGeometry.x, ...route.points.map(p => p.x)) - 20,
        right: Math.max(sourceGeometry.x + sourceGeometry.width, targetGeometry.x + targetGeometry.width, ...route.points.map(p => p.x)) + 20,
        top: Math.min(sourceGeometry.y, targetGeometry.y, ...route.points.map(p => p.y)) - 20,
        bottom: Math.max(sourceGeometry.y + sourceGeometry.height, targetGeometry.y + targetGeometry.height, ...route.points.map(p => p.y)) + 20
      };
      if (!overrideTarget) context.routes.set(key, route);
      return route;
    }

    _updateConnectionPorts(graph, geometryById) {
      const used = new Map();
      for (const edge of [...graph.relationships, ...graph.summaryRelationships]) {
        const route = this._edgeGeometry(edge, null, geometryById);
        if (!route) continue;
        for (const [id, side] of [[edge.sourceId, route.sourceSide], [edge.targetId, route.targetSide]]) {
          if (!used.has(id)) used.set(id, new Set());
          used.get(id).add(side);
        }
      }
      const { cardScale: scale, mode } = this._displayViewSettings();
      this.root?.querySelectorAll?.('.relationship-node').forEach(node => {
        const id = node.dataset.entityId, rect = geometryById.get(id);
        if (!rect) return;
        node.querySelectorAll?.('[data-port-side]').forEach(port => {
          const side = port.dataset.portSide, inset = 0.5 * scale;
          const x = side === 'left' ? inset : side === 'right' ? rect.width - inset : rect.width / 2;
          const y = side === 'top' ? inset : side === 'bottom' ? rect.height - inset : Math.min((mode === 'compact' ? 44.5 : 59.5) * scale, rect.height / 2);
          // Absolute offsets start inside the surface's 1px border.
          port.style.left = `${x / scale - 7.5}px`;
          port.style.top = `${y / scale - 7.5}px`;
          port.classList.toggle('is-connected', used.get(id)?.has(side) || false);
        });
      });
    }

    _updateEdges() {
      const graph = this._filteredGraph();
      const placedIds = new Set(graph.placements.map(item => item.entityId));
      const geometryById = this._displayGeometryMap(graph.placements);
      for (const relationship of graph.relationships) {
        if (!placedIds.has(relationship.sourceId) || !placedIds.has(relationship.targetId)) continue;
        const geometry = this._edgeGeometry(relationship, null, geometryById);
        const group = this.root?.querySelector(`[data-relationship-id="${escapeSelectorValue(relationship.id)}"]`);
        if (!geometry || !group) continue;
        group.querySelectorAll('path').forEach(path => path.setAttribute('d', geometry.path));
        group.setAttribute('data-route-obstructed', String(geometry.obstructed));
        const routeTitle = group.querySelector('[data-route-title]');
        if (routeTitle) routeTitle.textContent = geometry.obstructed ? '未找到可通行路线，请调整卡片位置或间距' : this._relationshipLabel(relationship);
        const label = group.querySelector('text');
        label?.setAttribute('x', geometry.labelX);
        label?.setAttribute('y', geometry.labelY);
      }
      for (const summary of graph.summaryRelationships) {
        const geometry = this._edgeGeometry(summary, null, geometryById);
        const group = this.root?.querySelector(`[data-summary-id="${escapeSelectorValue(summary.id)}"]`);
        if (!geometry || !group) continue;
        group.querySelectorAll('path').forEach(path => path.setAttribute('d', geometry.path));
        const label = group.querySelector('text');
        label?.setAttribute('x', geometry.labelX);
        label?.setAttribute('y', geometry.labelY);
      }
      this._updateConnectionPorts(graph, geometryById);
    }

    _updateGroupFrames() {
      const graph = this._filteredGraph();
      const entitiesById = this._allEntitiesById();
      const displayGeometry = this._displayGeometryMap(graph.placements);
      for (const placement of graph.placements) {
        if (entitiesById.get(placement.entityId)?.type !== 'group') continue;
        const frame = this.root?.querySelector(`[data-entity-id="${escapeSelectorValue(placement.entityId)}"]`);
        if (!frame) continue;
        const dragTarget = this.pointerAction?.type === 'node'
          ? this.pointerAction.groupTargets?.find(target => target.id === placement.entityId) : null;
        const geometry = dragTarget || this._placementGeometry(placement, graph.placements, new Set(), displayGeometry);
        frame.style.transform = `translate(${geometry.x}px,${geometry.y}px)`;
        frame.style.width = `${geometry.width}px`;
        frame.style.height = `${geometry.height}px`;
      }
    }

    _groupAppearanceEditorHtml(entityId) {
      const placement = this._placementForEntity(entityId) || {};
      const options = this._combinedPlacements().filter(item => this._canJoinGroup(entityId, item.entityId))
        .map(item => `<option value="${escapeHtml(item.entityId)}" ${placement.groupId === item.entityId ? 'selected' : ''}>${escapeHtml(this._allEntitiesById().get(item.entityId).name)}</option>`).join('');
      return `<section class="relationship-group-appearance" aria-label="群组外观与嵌套">
        <label class="relationship-inspector-field"><span>上级群组</span><select name="parentGroup"><option value="">无（顶层）</option>${options}</select></label>
        <div class="relationship-group-colors">
          <label class="relationship-inspector-field"><span>背景色</span><input type="color" name="groupBackground" value="${escapeHtml(placement.groupBackground || '#7a67c7')}"></label>
          <label class="relationship-inspector-field"><span>描边色</span><input type="color" name="groupBorder" value="${escapeHtml(placement.groupBorder || '#7a67c7')}"></label>
        </div>
        <small>背景以浅色显示，保留卡片可读性。拖动群组会带上全部子群组和卡片。</small>
      </section>`;
    }

    _groupDropTargets(movingIds) {
      const moving = new Set(movingIds);
      const placements = this._filteredGraph().placements;
      const entities = this._allEntitiesById();
      const geometry = this._displayGeometryMap(placements);
      return placements.filter(item => entities.get(item.entityId)?.type === 'group' && !moving.has(item.entityId))
        .map(item => ({ id: item.entityId, depth: this._groupDepth(item.entityId), ...this._placementGeometry(item, placements, new Set(), geometry) }));
    }

    _groupDropTarget(action, point) {
      return (action.groupTargets || []).filter(target => point.x >= target.x && point.x <= target.x + target.width
        && point.y >= target.y && point.y <= target.y + target.height)
        .sort((a, b) => b.depth - a.depth || a.width * a.height - b.width * b.height)[0]?.id || '';
    }

    _showGroupDropTarget(groupId = '') {
      this.root?.querySelectorAll?.('.relationship-group-frame').forEach(frame => {
        frame.classList.toggle('group-drop-target', frame.dataset.entityId === groupId);
      });
    }

    _applyGroupDrop(action) {
      const targetId = action.groupDropId || '';
      const members = (action.groupMemberIds || []).map(id => this._placementForEntity(id)).filter(Boolean);
      if (!members.every(item => this._canJoinGroup(item.entityId, targetId))) return false;
      let changed = false;
      for (const member of members) {
        if ((member.groupId || '') === targetId) continue;
        if (targetId) member.groupId = targetId; else delete member.groupId;
        changed = true;
      }
      return changed;
    }

    _dragBounds(action, deltaX = 0, deltaY = 0) {
      const entities = this._allEntitiesById();
      const { width, height } = this._nodeDimensions();
      const bounds = [...(action?.origins || new Map()).entries()]
        .filter(([entityId]) => entities.get(entityId)?.type !== 'group')
        .map(([, origin]) => ({
          left: origin.x + deltaX,
          right: origin.x + deltaX + width,
          top: origin.y + deltaY,
          bottom: origin.y + deltaY + height
        }));
      if (!bounds.length) return null;
      const left = Math.min(...bounds.map(item => item.left));
      const right = Math.max(...bounds.map(item => item.right));
      const top = Math.min(...bounds.map(item => item.top));
      const bottom = Math.max(...bounds.map(item => item.bottom));
      return { left, centerX: (left + right) / 2, right, top, centerY: (top + bottom) / 2, bottom };
    }

    _stationarySnapBounds(movingIds = []) {
      const moving = new Set(movingIds);
      const entities = this._allEntitiesById();
      const { width, height } = this._nodeDimensions();
      return this._filteredGraph().placements
        .filter(placement => !moving.has(placement.entityId) && entities.get(placement.entityId)?.type !== 'group')
        .map(placement => ({
          left: placement.x,
          centerX: placement.x + width / 2,
          right: placement.x + width,
          top: placement.y,
          centerY: placement.y + height / 2,
          bottom: placement.y + height
        }));
    }

    _renderSnapGuides(guides = []) {
      const layer = this.root?.querySelector('.relationship-guide-layer');
      if (!layer) return;
      layer.innerHTML = guides.map(guide => (
        `<span class="relationship-snap-guide ${guide.axis === 'x' ? 'vertical' : 'horizontal'}" data-kind="${guide.kind}" style="--guide-position:${Math.round(guide.position)}px"></span>`
      )).join('');
    }

    _clearSnapGuides() {
      const layer = this.root?.querySelector('.relationship-guide-layer');
      if (layer) layer.innerHTML = '';
    }

    _handlePointerDown(event) {
      this._stopWheelPan();
      if (event.button !== 0 && event.button !== 1) return;
      const minimap = event.target.closest('[data-relationship-minimap]');
      if (minimap && event.button === 0) {
        event.preventDefault();
        const canvas = this.root.querySelector('.relationship-canvas');
        this.pointerAction = { type: 'minimap', pointerId: event.pointerId, map: this._minimapTransform(canvas.clientWidth, canvas.clientHeight) };
        minimap.setPointerCapture(event.pointerId);
        this._panFromMinimap(event);
        return;
      }
      if (event.target.closest('.relationship-selection-toolbar, .relationship-navigator')) return;
      const resourcePanelHandle = event.target.closest('[data-resource-panel-handle]');
      if (resourcePanelHandle && event.button === 0 && !event.target.closest('button, input, textarea, select, a')) {
        const panel = resourcePanelHandle.closest('.relationship-resource-panel');
        if (!panel) return;
        event.preventDefault();
        panel.setPointerCapture(event.pointerId);
        panel.classList.add('dragging');
        this.pointerAction = {
          type: 'resource-panel',
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          originX: this.resourcePanelPosition.x,
          originY: this.resourcePanelPosition.y
        };
        return;
      }
      const canvas = event.target.closest('.relationship-canvas');
      if (!canvas) return;
      if (event.button === 1 || (this.spacePan && event.button === 0 && !event.target.closest('input, textarea, select, [contenteditable="true"]'))) {
        event.preventDefault();
        const board = activeBoard(this.store);
        canvas.focus?.({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        this.pointerAction = { type: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
          originX: board.viewport.x, originY: board.viewport.y };
        canvas.classList.add('panning');
        return;
      }
      const groupResize = event.target.closest('[data-resize-group]');
      if (groupResize && event.button === 0) {
        const group = this._placementForEntity(groupResize.dataset.resizeGroup);
        if (!group || group.locked) return;
        event.preventDefault(); canvas.setPointerCapture(event.pointerId);
        const before = this._historySnapshot();
        const items = this._materializeGroupGeometry(group.entityId);
        group.groupLayout ||= 'manual';
        const geometry = this._displayGeometryMap(this._combinedPlacements());
        const members = items.filter(item => item !== group).map(item => geometry.get(item.entityId)).filter(Boolean);
        this._selectOnlyEntity(group.entityId);
        this.pointerAction = { type: 'group-resize', pointerId: event.pointerId, entityId: group.entityId,
          start: this._clientToWorld(event.clientX, event.clientY), width: group.groupWidth, height: group.groupHeight,
          minWidth: group.groupLayout === 'auto' ? GROUP_MIN_WIDTH : Math.max(GROUP_MIN_WIDTH, ...members.map(item => item.x + item.width - group.x + GROUP_PADDING_X)),
          minHeight: group.groupLayout === 'auto' ? GROUP_MIN_HEIGHT : Math.max(GROUP_MIN_HEIGHT, ...members.map(item => item.y + item.height - group.y + GROUP_PADDING_BOTTOM)),
          changedIds: items.map(item => item.entityId), before, moved: false };
        return;
      }
      const resize = event.target.closest('[data-resize-canvas-element]');
      if (resize) {
        const entity = this.store.entities.find(item => item.id === resize.dataset.resizeCanvasElement);
        if (!entity || this._placementForEntity(entity.id)?.locked) return;
        event.preventDefault(); canvas.setPointerCapture(event.pointerId);
        this.pointerAction = { type: 'resize', pointerId: event.pointerId, entityId: entity.id, start: this._clientToWorld(event.clientX, event.clientY), width: Number(entity.details.width), height: Number(entity.details.height), before: this._historySnapshot() };
        return;
      }
      const sourcePort = event.target.closest('.relationship-port[data-direction="out"]');
      if (sourcePort && event.button === 0) {
        event.preventDefault();
        const sourceId = sourcePort.closest('.relationship-node')?.dataset.entityId;
        const sourcePlacement = this._placementForEntity(sourceId);
        if (!sourcePlacement) return;
        canvas.setPointerCapture(event.pointerId);
        this.pointerAction = { type: 'connect', pointerId: event.pointerId, sourceId, sourceSide: sourcePort.dataset.portSide };
        this._renderTemporaryEdge(sourceId, this._clientToWorld(event.clientX, event.clientY));
        return;
      }
      const node = event.target.closest('.relationship-node');
      const nodeControl = event.target.closest('.relationship-port, .relationship-card-detail-content, button, input, textarea, select, a');
      const groupHeader = node?.dataset.entityType === 'group' && event.target.closest('.relationship-node-header');
      if (!nodeControl) canvas.focus?.({ preventScroll: true });
      if (node && !nodeControl && !groupHeader && event.button === 0) {
        event.preventDefault();
        const entityId = node.dataset.entityId;
        this.suppressedGroupToolbarId = node.dataset.entityType === 'group' ? entityId : '';
        const placement = this._placementForEntity(entityId);
        if (!placement) return;
        if (placement.locked) { this._selectOnlyEntity(entityId); this._updateSelectionCss(); return; }
        const point = this._clientToWorld(event.clientX, event.clientY);
        canvas.setPointerCapture(event.pointerId);
        let suppressClick = false;
        if ((event.metaKey || event.ctrlKey) && !this._entitySelectionIds().has(entityId)) {
          this._setEntitySelection(new Set([...this._entitySelectionIds(), entityId]), entityId);
          suppressClick = true;
        } else if (!event.metaKey && !event.ctrlKey && !this._entitySelectionIds().has(entityId)) {
          this._selectOnlyEntity(entityId);
        }
        const movingIds = this._movingEntityIds(entityId);
        const persistentIds = movingIds.filter(id => activeBoard(this.store).placements.some(item => item.entityId === id));
        const dynamicIds = movingIds.filter(id => this.panelProjection?.placements?.some(item => item.dynamic && item.entityId === id));
        const geometry = this._displayGeometryMap(this._combinedPlacements());
        const origins = new Map(this._combinedPlacements(activeBoard(this.store))
          .filter(item => movingIds.includes(item.entityId))
          .map(item => [item.entityId, { x: geometry.get(item.entityId)?.x ?? item.x, y: geometry.get(item.entityId)?.y ?? item.y }]));
        this.pointerAction = {
          type: 'node',
          pointerId: event.pointerId,
          entityId,
          entityIds: movingIds,
          persistentIds,
          dynamicIds,
          origins,
          geometry,
          groupTargets: this._groupDropTargets(movingIds),
          groupMemberIds: this._selectedMemberPlacements().map(item => item.entityId),
          groupDropId: placement.groupId || '',
          pointX: point.x,
          pointY: point.y,
          before: this._historySnapshot(),
          suppressClick,
          moved: false
        };
        for (const movingId of movingIds) {
          this.root.querySelector(`[data-entity-id="${escapeSelectorValue(movingId)}"]`)?.classList.add('dragging');
        }
        this._updateSelectionCss();
        return;
      }
      if (!event.target.closest('.relationship-node, .relationship-edge') && !nodeControl && event.button === 0) {
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        this.root.classList?.add('box-selecting');
        const point = this._clientToWorld(event.clientX, event.clientY);
        this.pointerAction = {
          type: 'box',
          pointerId: event.pointerId,
          startX: point.x, startY: point.y,
          initialSelection: this._entitySelectionIds(),
          baseSelection: event.metaKey || event.ctrlKey ? this._entitySelectionIds() : new Set(),
          moved: false
        };
        this.selectedRelationshipId = '';
        this._renderSelectionBox(point.x, point.y, point.x, point.y);
      }
    }

    _edgePanSpeed(action) {
      const canvas = this.root?.querySelector('.relationship-canvas');
      if (!canvas || !action?.lastPointer) return { x: 0, y: 0 };
      const { clientX: x, clientY: y } = action.lastPointer;
      const covered = globalThis.document?.elementFromPoint?.(x, y)?.closest?.('.relationship-inspector-panel, .relationship-resource-panel, .relationship-selection-toolbar, .relationship-navigator');
      if (covered) return { x: 0, y: 0 };
      return edgePanVelocity({ x, y }, canvas.getBoundingClientRect(), globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    }

    _trackEdgePan(event) {
      const action = this.pointerAction;
      if (action?.type !== 'node' || !action.moved) return;
      action.lastPointer = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, altKey: event.altKey };
      const speed = this._edgePanSpeed(action);
      if (!speed.x && !speed.y) { this._stopEdgePan(); return; }
      if (this.edgePanFrame == null) this.edgePanFrame = requestAnimationFrame(time => this._stepEdgePan(time));
    }

    _stepEdgePan(time) {
      this.edgePanFrame = null;
      const action = this.pointerAction;
      if (!this.root?.isConnected || action?.type !== 'node' || !action.moved || globalThis.document?.hidden) { this._stopEdgePan(); return; }
      const speed = this._edgePanSpeed(action);
      if (!speed.x && !speed.y) { this._stopEdgePan(); return; }
      const elapsed = this.edgePanLastTime == null ? 16 : Math.min(32, Math.max(0, time - this.edgePanLastTime));
      this.edgePanLastTime = time;
      const board = activeBoard(this.store);
      board.viewport.x -= speed.x * elapsed / 1000;
      board.viewport.y -= speed.y * elapsed / 1000;
      action.autoPanned = true;
      this._applyViewport();
      // Recompute world coordinates from the same grab point as the camera moves.
      this._handlePointerMove(action.lastPointer, true);
      if (this.pointerAction === action) this.edgePanFrame = requestAnimationFrame(next => this._stepEdgePan(next));
    }

    _stopEdgePan() {
      if (this.edgePanFrame != null) cancelAnimationFrame(this.edgePanFrame);
      this.edgePanFrame = null;
      this.edgePanLastTime = null;
    }

    _handlePointerMove(event, fromEdgePan = false) {
      const action = this.pointerAction;
      if (!action || action.pointerId !== event.pointerId) return;
      if (action.type === 'group-resize') {
        const point = this._clientToWorld(event.clientX, event.clientY);
        const dx = point.x - action.start.x, dy = point.y - action.start.y;
        if (!action.moved && Math.hypot(dx, dy) < 2) return;
        const group = this._placementForEntity(action.entityId);
        group.groupWidth = Math.round(Math.max(action.minWidth, Math.min(100000, action.width + dx)));
        group.groupHeight = Math.round(Math.max(action.minHeight, Math.min(100000, action.height + dy)));
        action.moved = true;
        this._renderGraph();
        return;
      }
      if (action.type === 'resize') {
        const entity = this.store.entities.find(item => item.id === action.entityId);
        const point = this._clientToWorld(event.clientX, event.clientY);
        const width = Math.max(60, Math.min(1600, action.width + point.x - action.start.x));
        const height = entity.type === 'image' && !event.shiftKey ? width * action.height / action.width : action.height + point.y - action.start.y;
        entity.details.width = String(Math.round(width)); entity.details.height = String(Math.round(Math.max(60, Math.min(1600, height))));
        action.moved = true; this._renderGraph(); return;
      }
      if (action.type === 'minimap') {
        this._panFromMinimap(event);
        return;
      }
      if (action.type === 'resource-panel') {
        this._applyResourcePanelPosition({
          x: action.originX + event.clientX - action.clientX,
          y: action.originY + event.clientY - action.clientY
        });
        return;
      }
      if (action.type === 'node') {
        const point = this._clientToWorld(event.clientX, event.clientY);
        const rawDeltaX = point.x - action.pointX;
        const rawDeltaY = point.y - action.pointY;
        if (!action.moved && Math.hypot(rawDeltaX, rawDeltaY) * activeBoard(this.store).viewport.zoom < 3) return;
        const snap = resolveMagneticSnap({
          mode: event.altKey ? 'off' : this._boardView().snapMode,
          gridSize: GRID_SIZE,
          threshold: 8,
          movingBounds: this._dragBounds(action, rawDeltaX, rawDeltaY),
          stationaryBounds: this._stationarySnapBounds(action.entityIds)
        });
        const deltaX = rawDeltaX + snap.dx;
        const deltaY = rawDeltaY + snap.dy;
        action.moved = action.moved || Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1;
        for (const entityId of action.entityIds) {
          const origin = action.origins.get(entityId);
          const placement = this._placementForEntity(entityId);
          if (!origin || !placement) continue;
          placement.x = Math.round(origin.x + deltaX);
          placement.y = Math.round(origin.y + deltaY);
          const node = this.root.querySelector(`[data-entity-id="${escapeSelectorValue(entityId)}"]`);
          if (node) node.style.transform = `translate(${placement.x}px,${placement.y}px)`;
        }
        this._updateGroupFrames();
        this._updateEdges();
        this._renderSnapGuides(snap.guides);
        action.groupDropId = this._groupDropTarget(action, point);
        this._showGroupDropTarget(action.groupDropId);
        this._refreshMinimapNodes();
        this._updateMinimap();
        this._positionSelectionToolbar();
        if (!fromEdgePan) this._trackEdgePan(event);
        return;
      }
      if (action.type === 'pan') {
        const board = activeBoard(this.store);
        board.viewport.x = action.originX + (event.clientX - action.clientX);
        board.viewport.y = action.originY + (event.clientY - action.clientY);
        this._applyViewport();
        return;
      }
      if (action.type === 'connect') {
        this._renderTemporaryEdge(action.sourceId, this._clientToWorld(event.clientX, event.clientY));
        this._highlightConnectionTarget(event.clientX, event.clientY, action.sourceId);
        return;
      }
      if (action.type === 'box') {
        const point = this._clientToWorld(event.clientX, event.clientY);
        action.moved = action.moved || Math.abs(point.x - action.startX) > 2 || Math.abs(point.y - action.startY) > 2;
        this._renderSelectionBox(action.startX, action.startY, point.x, point.y);
        const hits = this._selectionBoxEntityIds(action.startX, action.startY, point.x, point.y);
        this._setEntitySelection(new Set([...action.baseSelection, ...hits]), hits.at(-1) || '');
        this._updateSelectionCss({ renderInspector: false });
      }
    }

    _handlePointerUp(event) {
      const action = this.pointerAction;
      if (!action || action.pointerId !== event.pointerId) return;
      this._stopEdgePan();
      if (action.autoPanned) this._persistSoon(0);
      if (action.type === 'group-resize') {
        if (action.moved) {
          this._pushUndoSnapshot(action.before);
          this._saveDynamicPlacementOverrides(action.changedIds);
          this._persistSoon(0);
        } else this._restoreHistorySnapshot(action.before);
        this.pointerAction = null;
        this._renderGraph(); this._refreshHistoryButtons(); this._updateSummary();
        return;
      }
      if (action.type === 'resize') {
        if (action.moved) { this._pushUndoSnapshot(action.before); this._persistSoon(0); }
        this.pointerAction = null; this._renderGraph(); this._refreshHistoryButtons(); return;
      }
      if (action.type === 'resource-panel') {
        this.root.querySelector('.relationship-resource-panel')?.classList.remove('dragging');
      } else if (action.type === 'node') {
        this._clearSnapGuides();
        this._showGroupDropTarget();
        for (const entityId of action.entityIds) {
          this.root.querySelector(`[data-entity-id="${escapeSelectorValue(entityId)}"]`)?.classList.remove('dragging');
        }
        if (action.moved) {
          this._applyGroupDrop(action);
          this._pushUndoSnapshot(action.before);
          if (action.persistentIds.length) this._persistSoon(0);
          if (action.dynamicIds.length) this._saveDynamicPlacementOverrides(action.dynamicIds);
          this.pointerAction = null;
          this._renderGraph();
          this._refreshHistoryButtons();
          this._updateSummary();
        }
        if (action.moved || action.suppressClick) {
          this.suppressNextNodeClick = true;
          setTimeout(() => { this.suppressNextNodeClick = false; }, 0);
        }
      } else if (action.type === 'pan') {
        this.root.querySelector('.relationship-canvas')?.classList.remove('panning');
        this._persistSoon(180);
      } else if (action.type === 'connect') {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.relationship-node');
        if (target && target.dataset.entityId !== action.sourceId) {
          this._createConnection(action.sourceId, target.dataset.entityId);
        }
        this._removeTemporaryEdge();
        this.root.querySelectorAll('.connection-compatible').forEach(node => node.classList.remove('connection-compatible'));
      } else if (action.type === 'box') {
        this.root.classList?.remove('box-selecting');
        this._hideSelectionBox();
        if (!action.moved) this._setEntitySelection(action.baseSelection || new Set(), '');
        this._updateSelectionCss();
        this.suppressNextNodeClick = true;
        setTimeout(() => { this.suppressNextNodeClick = false; }, 0);
        this._setCanvasAnnouncement(`已选择 ${this._entitySelectionIds().size} 个节点`);
      }
      this.pointerAction = null;
      this._positionSelectionToolbar();
      this._updateMinimap();
    }

    _cancelPointerAction(preserveCurrent = false) {
      this._stopEdgePan();
      this.root?.classList?.remove('box-selecting');
      const action = this.pointerAction;
      if (!action) return;
      if (preserveCurrent && action.type === 'node' && action.autoPanned) {
        if (action.dynamicIds?.length) this._saveDynamicPlacementOverrides(action.dynamicIds);
        this._persistSoon(0);
      }
      this._clearSnapGuides();
      this._showGroupDropTarget();
      if (!preserveCurrent && ['node', 'resize', 'group-resize'].includes(action.type)) {
        if (action.before) this._restoreHistorySnapshot(action.before);
        for (const [entityId, origin] of action.before ? [] : action.origins || []) {
          const placement = this._placementForEntity(entityId);
          if (!placement) continue;
          placement.x = origin.x;
          placement.y = origin.y;
        }
        this._renderGraph();
      }
      if (!preserveCurrent && action.type === 'box') {
        this._setEntitySelection(action.initialSelection, '');
        this._updateSelectionCss();
      }
      this._removeTemporaryEdge();
      this._hideSelectionBox();
      this.root?.querySelector('.relationship-canvas')?.classList.remove('panning');
      this.root?.querySelector('.relationship-resource-panel')?.classList.remove('dragging');
      this.root?.querySelectorAll('.dragging, .connection-compatible').forEach(element => {
        element.classList.remove('dragging', 'connection-compatible');
      });
      this.pointerAction = null;
    }

    _renderTemporaryEdge(sourceId, target) {
      const edgeLayer = this.root?.querySelector('.relationship-edge-layer');
      const source = activeBoard(this.store)?.placements.find(item => item.entityId === sourceId);
      if (!edgeLayer || !source) return;
      let path = edgeLayer.querySelector('.relationship-edge-temporary');
      if (!path) {
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'relationship-edge-temporary');
        edgeLayer.appendChild(path);
      }
      const geometry = this._edgeGeometry({ sourceId }, target);
      if (geometry) path.setAttribute('d', geometry.path);
    }

    _renderSelectionBox(startX, startY, endX, endY) {
      const box = this.root?.querySelector('.relationship-selection-box');
      if (!box) return;
      const left = Math.min(startX, endX);
      const top = Math.min(startY, endY);
      box.hidden = false;
      box.style.transform = `translate(${left}px,${top}px)`;
      box.style.width = `${Math.abs(endX - startX)}px`;
      box.style.height = `${Math.abs(endY - startY)}px`;
    }

    _selectionBoxEntityIds(startX, startY, endX, endY) {
      const left = Math.min(startX, endX);
      const top = Math.min(startY, endY);
      const right = Math.max(startX, endX);
      const bottom = Math.max(startY, endY);
      const placements = this._filteredGraph().placements;
      const displayGeometry = this._displayGeometryMap(placements);
      return placements.filter(placement => {
        const geometry = this._placementGeometry(placement, placements, new Set(), displayGeometry);
        if (this._allEntitiesById().get(placement.entityId)?.type === 'group') {
          return geometry.x >= left && geometry.x + geometry.width <= right
            && geometry.y >= top && geometry.y + geometry.height <= bottom;
        }
        return geometry.x < right && geometry.x + geometry.width > left
          && geometry.y < bottom && geometry.y + geometry.height > top;
      }).map(placement => placement.entityId);
    }

    _hideSelectionBox() {
      const box = this.root?.querySelector('.relationship-selection-box');
      if (!box) return;
      box.hidden = true;
      box.removeAttribute('style');
    }

    _removeTemporaryEdge() {
      this.root?.querySelector('.relationship-edge-temporary')?.remove();
    }

    _highlightConnectionTarget(clientX, clientY, sourceId) {
      this.root?.querySelectorAll('.connection-compatible').forEach(node => node.classList.remove('connection-compatible'));
      const target = document.elementFromPoint(clientX, clientY)?.closest?.('.relationship-node');
      if (!target || target.dataset.entityId === sourceId) return;
      if (this._connectionType(sourceId, target.dataset.entityId)) target.classList.add('connection-compatible');
    }

    _connectionType(sourceId, targetId) {
      const entities = new Map(this.store.entities.map(entity => [entity.id, entity]));
      const source = entities.get(sourceId);
      const target = entities.get(targetId);
      if (!source || !target) return '';
      return Model.RELATIONSHIP_TYPES.find(type => Model.connectionAllowed(type, source.type, target.type)) || '';
    }

    _createConnection(sourceId, targetId) {
      const type = this._connectionType(sourceId, targetId);
      if (!type) {
        this.notify('这两类节点之间没有允许的关系方向', 'warning');
        return false;
      }
      if (this.store.relationships.some(item => item.type === type && item.sourceId === sourceId && item.targetId === targetId)) {
        this.notify('这条关系已经存在', 'info');
        return false;
      }
      this._recordMutation();
      this.store.relationships.push({
        id: makeId('relationship'),
        type,
        sourceId,
        targetId,
        source: 'manual'
      });
      this._clearEntitySelection();
      this.selectedRelationshipId = this.store.relationships.at(-1).id;
      this._persistSoon(0);
      this._renderGraph();
      this._refreshHistoryButtons();
      this._updateSummary();
      this._setCanvasAnnouncement(`已建立“${this._relationshipLabel(this.store.relationships.at(-1))}”关系`);
      return true;
    }

    _handleWheel(event) {
      if (event.target?.closest?.('.relationship-selection-toolbar, .relationship-navigator')) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.pointerAction) return;
      const board = activeBoard(this.store);
      const canvas = this.root.querySelector('.relationship-canvas');
      const rect = canvas.getBoundingClientRect();
      if (!event.ctrlKey && !event.metaKey) {
        const unitX = event.deltaMode === 2 ? rect.width : (event.deltaMode === 1 ? 16 : 1);
        const unitY = event.deltaMode === 2 ? rect.height : (event.deltaMode === 1 ? 16 : 1);
        const discrete = event.deltaMode > 0 || (event.deltaX === 0 && Math.abs(event.deltaY) >= 80 && event.deltaY % 40 === 0);
        this._queueWheelPan(-event.deltaX * unitX, -event.deltaY * unitY, discrete);
        return;
      }
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      // Chromium emits trackpad pinch as a ctrl-wheel event. Never let it zoom the whole app.
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      this._zoomViewport(board.viewport.zoom * Math.exp(-delta * 0.01), mouseX, mouseY);
    }

    _queueWheelPan(dx, dy, smooth) {
      const board = activeBoard(this.store);
      if (!board || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
      if (typeof requestAnimationFrame !== 'function' || globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        this._stopWheelPan();
        board.viewport.x += dx; board.viewport.y += dy;
        this._applyViewport(); this._persistSoon(220);
        return;
      }
      // Pixel trackpad events stay 1:1; batch paints to one per display frame.
      // Discrete wheel steps converge to the exact target, without extra momentum.
      if (this.wheelPan?.board !== board) this._stopWheelPan();
      this.wheelPan ||= { board, x: board.viewport.x, y: board.viewport.y, time: null };
      this.wheelPan.x += dx; this.wheelPan.y += dy; this.wheelPan.smooth = smooth;
      if (this.wheelPanFrame == null) this.wheelPanFrame = requestAnimationFrame(time => this._stepWheelPan(time));
      this._persistSoon(220);
    }

    _stepWheelPan(time) {
      this.wheelPanFrame = null;
      const pan = this.wheelPan;
      if (!pan || pan.board !== activeBoard(this.store) || !this.root || this.pointerAction) { this._stopWheelPan(); return; }
      const elapsed = pan.time == null ? 16 : Math.max(1, Math.min(64, time - pan.time));
      pan.time = time;
      const view = pan.board.viewport;
      const fraction = pan.smooth ? 1 - Math.exp(-elapsed / 40) : 1;
      view.x += (pan.x - view.x) * fraction;
      view.y += (pan.y - view.y) * fraction;
      const finished = Math.hypot(pan.x - view.x, pan.y - view.y) < 0.25;
      if (finished) { view.x = pan.x; view.y = pan.y; }
      this._applyViewport();
      if (finished) { this.wheelPan = null; this._persistSoon(220); }
      else this.wheelPanFrame = requestAnimationFrame(next => this._stepWheelPan(next));
    }

    _stopWheelPan() {
      if (this.wheelPanFrame != null) cancelAnimationFrame(this.wheelPanFrame);
      this.wheelPanFrame = null;
      this.wheelPan = null;
    }

    _zoomViewport(zoom, anchorX, anchorY) {
      this._stopWheelPan();
      const board = activeBoard(this.store);
      const oldZoom = board.viewport.zoom;
      const nextZoom = Math.min(2.5, Math.max(0.25, zoom));
      const worldX = (anchorX - board.viewport.x) / oldZoom;
      const worldY = (anchorY - board.viewport.y) / oldZoom;
      board.viewport.zoom = nextZoom;
      board.viewport.x = anchorX - worldX * nextZoom;
      board.viewport.y = anchorY - worldY * nextZoom;
      this._applyViewport();
      this._persistSoon(220);
    }

    _applyViewport() {
      const board = activeBoard(this.store);
      const world = this.root?.querySelector('.relationship-world');
      const canvas = this.root?.querySelector('.relationship-canvas');
      if (!board || !world || !canvas) return;
      const { x, y, zoom } = board.viewport;
      world.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
      canvas.style.setProperty('--relationship-viewport-zoom', String(zoom));
      canvas.style.setProperty('--relationship-inverse-zoom', String(1 / zoom));
      canvas.style.setProperty('--relationship-grid-size', `${GRID_SIZE * zoom}px`);
      canvas.style.setProperty('--relationship-grid-x', `${x}px`);
      canvas.style.setProperty('--relationship-grid-y', `${y}px`);
      this._positionSelectionToolbar();
      this._updateMinimap();
    }

    _selectionCardIds() {
      const first = this._entitySelectionIds().values().next().value;
      if (!first) return [];
      const entities = this._allEntitiesById();
      return this._movingEntityIds(first).filter(id => !['group', 'text', 'image', 'attachment'].includes(entities.get(id)?.type));
    }

    _setSelectionDisplay(mode) {
      const ids = this._selectionCardIds();
      if (!ids.length) return false;
      if (mode === 'expand' || mode === 'collapse') {
        ids.forEach(id => mode === 'expand' ? this.expandedCardIds.add(id) : this.expandedCardIds.delete(id));
        this._persistExpandedCards(ids);
      } else {
        const visibility = { 'show-status': 'show', 'hide-status': 'hide', 'inherit-status': 'inherit' }[mode];
        if (!visibility) return false;
        this._recordMutation();
        for (const id of ids) {
          const placement = this._placementForEntity(id);
          if (visibility === 'inherit') delete placement.statusVisibility;
          else placement.statusVisibility = visibility;
        }
        this._saveDynamicPlacementOverrides(ids);
        this._persistSoon(0);
      }
      this._renderGraph();
      this._refreshHistoryButtons();
      return true;
    }

    _arrangeSelection(mode) {
      if (!['left', 'center', 'right', 'top', 'middle', 'bottom', 'row', 'column', 'space-x', 'space-y'].includes(mode)) return false;
      const selected = this._selectedMemberPlacements();
      if (selected.length < 2) return false;
      const placements = this._combinedPlacements();
      const byId = new Map(placements.map(item => [item.entityId, item]));
      const display = this._displayGeometryMap(placements);
      let units = selected.map(placement => ({ placement, entityId: placement.entityId, ...this._placementGeometry(placement, placements, new Set(), display) }));
      const minX = Math.min(...units.map(item => item.x)), minY = Math.min(...units.map(item => item.y));
      const maxX = Math.max(...units.map(item => item.x + item.width)), maxY = Math.max(...units.map(item => item.y + item.height));
      const horizontal = mode === 'row' || mode === 'space-x';
      const sequential = ['row', 'column', 'space-x', 'space-y'].includes(mode);
      const spacing = this._displayViewSettings();
      const axis = horizontal ? 'x' : 'y', size = horizontal ? 'width' : 'height';
      if (mode === 'row' || mode === 'column') units = this._orderedLayoutItems(units, placements, axis);
      else if (sequential) units.sort((a, b) => a[axis] - b[axis] || a.placement.entityId.localeCompare(b.placement.entityId));
      const available = horizontal ? maxX - minX : maxY - minY;
      const gap = mode.startsWith('space-') ? Math.max(0, (available - units.reduce((total, item) => total + item[size], 0)) / (units.length - 1))
        : horizontal ? spacing.horizontalSpacing : spacing.verticalSpacing;
      let cursor = horizontal ? minX : minY;
      this._recordMutation();
      const moved = new Set();
      for (const unit of units) {
        let x = unit.x, y = unit.y;
        if (sequential) {
          if (horizontal) { x = cursor; if (mode === 'row') y = minY; }
          else { y = cursor; if (mode === 'column') x = minX; }
          cursor += unit[size] + gap;
        } else {
          if (mode === 'left') x = minX;
          if (mode === 'center') x = (minX + maxX - unit.width) / 2;
          if (mode === 'right') x = maxX - unit.width;
          if (mode === 'top') y = minY;
          if (mode === 'middle') y = (minY + maxY - unit.height) / 2;
          if (mode === 'bottom') y = maxY - unit.height;
        }
        for (const placement of placements) {
          let parent = placement.entityId;
          const visited = new Set();
          while (parent && !visited.has(parent) && parent !== unit.placement.entityId) {
            visited.add(parent);
            parent = byId.get(parent)?.groupId;
          }
          if (parent !== unit.placement.entityId || moved.has(placement.entityId)) continue;
          placement.x += Math.round(x - unit.x);
          placement.y += Math.round(y - unit.y);
          moved.add(placement.entityId);
        }
      }
      this._saveDynamicPlacementOverrides([...moved]);
      this._persistSoon(0);
      this._renderGraph();
      this._refreshHistoryButtons();
      return true;
    }

    _renderSelectionToolbar() {
      const toolbar = this.root?.querySelector('.relationship-selection-toolbar');
      if (!toolbar) return;
      const entities = this._allEntitiesById();
      const selected = [...this._entitySelectionIds()].map(id => entities.get(id)).filter(Boolean);
      const relation = this.selectedRelationshipId;
      const single = selected.length === 1 ? selected[0] : null;
      toolbar.hidden = (!selected.length && !relation)
        || (single?.type === 'group' && single.id === this.suppressedGroupToolbarId);
      if (toolbar.hidden) return;
      const groupsOnly = selected.length > 0 && selected.every(item => item.type === 'group');
      const canDelete = relation ? this.store.relationships.some(item => item.id === relation)
        : selected.every(item => item.type === 'group' || !item.transient);
      const button = (label, icon, attribute) => `<button type="button" ${attribute} title="${label}" aria-label="${label}"><span aria-hidden="true">${icon}</span></button>`;
      toolbar.innerHTML = `<span class="relationship-selection-count">${relation ? '关系' : single ? TYPE_LABELS[single.type] : `${selected.length} 个元素`}</span>
        ${button('查看属性', '☷', 'data-board-context-action="inspector"')}
        ${single ? button('编辑名称与内容', '✎', `data-board-context-action="${['text', 'image', 'attachment'].includes(single.type) ? 'edit-element' : 'rename'}"`) : ''}
        ${selected.length ? `<select data-selection-layout aria-label="排列所选元素" title="只排列所选元素，群组保持整体"${this._selectedMemberPlacements().length < 2 ? ' disabled' : ''}>
          <option value="">排列 ▾</option><option value="row">横向排列</option><option value="column">纵向排列</option>
          <optgroup label="对齐"><option value="left">左对齐</option><option value="center">水平居中</option><option value="right">右对齐</option><option value="top">顶部对齐</option><option value="middle">垂直居中</option><option value="bottom">底部对齐</option></optgroup>
          <optgroup label="均匀分布"><option value="space-x">水平等间距</option><option value="space-y">垂直等间距</option></optgroup></select>` : ''}
        ${this._selectionCardIds().length ? `<select data-selection-display aria-label="所选卡片显示"><option value="">显示 ▾</option><option value="expand">展开详情</option><option value="collapse">收起详情</option><option value="show-status">显示状态</option><option value="hide-status">隐藏状态</option><option value="inherit-status">状态继承白板默认</option></select>` : ''}
        ${this._selectedMemberPlacements().length > 1 ? button('组成群组', '▣', 'data-relationship-action="create-group-from-selection"') : ''}
        ${canDelete ? button(groupsOnly ? '解散群组（保留成员）' : relation ? '删除关系' : '从白板移除', groupsOnly ? '▱' : '×', 'data-board-context-action="delete" class="is-destructive"') : ''}`;
      this._positionSelectionToolbar();
    }

    _positionSelectionToolbar() {
      const toolbar = this.root?.querySelector('.relationship-selection-toolbar');
      const canvas = this.root?.querySelector('.relationship-canvas');
      if (!toolbar || !canvas || toolbar.hidden) return;
      toolbar.style.visibility = this.pointerAction?.moved || this.pointerAction?.type === 'box' ? 'hidden' : '';
      const ids = this._entitySelectionIds();
      const nodes = [...this.root.querySelectorAll('.relationship-node')].filter(node => ids.has(node.dataset.entityId));
      const edge = this.selectedRelationshipId && this.root.querySelector(`[data-relationship-id="${escapeSelectorValue(this.selectedRelationshipId)}"]`);
      const bounds = (edge ? [edge] : nodes).flatMap(node => {
        const header = node.dataset?.entityType === 'group' && node.querySelector?.('.relationship-node-header');
        return (header ? [node, header] : [node]).map(element => element.getBoundingClientRect());
      });
      if (!bounds.length) { toolbar.hidden = true; return; }
      const canvasRect = canvas.getBoundingClientRect();
      const left = Math.min(...bounds.map(r => r.left)) - canvasRect.left;
      const top = Math.min(...bounds.map(r => r.top)) - canvasRect.top;
      const right = Math.max(...bounds.map(r => r.right)) - canvasRect.left;
      const bottom = Math.max(...bounds.map(r => r.bottom)) - canvasRect.top;
      if (right < 0 || left > canvasRect.width || bottom < 0 || top > canvasRect.height) toolbar.style.visibility = 'hidden';
      const x = Math.max(8, Math.min((left + right - toolbar.offsetWidth) / 2, canvasRect.width - toolbar.offsetWidth - 8));
      const y = Math.max(8, Math.min(top - toolbar.offsetHeight - 12, canvasRect.height - toolbar.offsetHeight - 8));
      toolbar.style.left = `${x}px`;
      toolbar.style.top = `${y}px`;
    }

    _refreshMinimapNodes(graph = this._filteredGraph(), geometry = this._displayGeometryMap(graph.placements)) {
      const entities = this._allEntitiesById();
      this.minimapNodes = graph.placements.map(item => ({
        ...this._placementGeometry(item, graph.placements, new Set(), geometry),
        id: item.entityId, type: entities.get(item.entityId)?.type || 'group',
        muted: graph.mutedIds.has(item.entityId)
      }));
    }

    _minimapTransform(width, height) {
      const view = activeBoard(this.store).viewport;
      const boxes = [...this.minimapNodes, { x: -view.x / view.zoom, y: -view.y / view.zoom, width: width / view.zoom, height: height / view.zoom }];
      const minX = Math.min(...boxes.map(item => item.x)) - 40;
      const minY = Math.min(...boxes.map(item => item.y)) - 40;
      const maxX = Math.max(...boxes.map(item => item.x + item.width)) + 40;
      const maxY = Math.max(...boxes.map(item => item.y + item.height)) + 40;
      const scale = Math.min(220 / (maxX - minX), 128 / (maxY - minY));
      return { x: minX - (220 / scale - (maxX - minX)) / 2, y: minY - (128 / scale - (maxY - minY)) / 2, scale };
    }

    _updateMinimap() {
      const svg = this.root?.querySelector('[data-relationship-minimap]');
      const canvas = this.root?.querySelector('.relationship-canvas');
      if (!svg || !canvas) return;
      const viewport = activeBoard(this.store).viewport;
      this.root.querySelector('[data-zoom-label]').textContent = `${Math.round(viewport.zoom * 100)}%`;
      if (this.minimapCollapsed) return;
      const map = this.pointerAction?.type === 'minimap' ? this.pointerAction.map : this._minimapTransform(canvas.clientWidth, canvas.clientHeight);
      const rectangle = item => `x="${(item.x - map.x) * map.scale}" y="${(item.y - map.y) * map.scale}" width="${Math.max(1, item.width * map.scale)}" height="${Math.max(1, item.height * map.scale)}"`;
      const ids = this._entitySelectionIds();
      svg.innerHTML = this.minimapNodes.map(item => `<rect ${rectangle(item)} rx="1" data-minimap-node="${escapeHtml(item.id)}" class="minimap-${item.type}${ids.has(item.id) ? ' selected' : ''}"${item.muted ? ' opacity="0.2"' : ''}/>`).join('')
        + `<rect ${rectangle({ x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom, width: canvas.clientWidth / viewport.zoom, height: canvas.clientHeight / viewport.zoom })} class="relationship-minimap-viewport"/>`;
    }

    _navigateMinimap(point, map, width, height) {
      const viewport = activeBoard(this.store).viewport;
      viewport.x = width / 2 - (map.x + point.x / map.scale) * viewport.zoom;
      viewport.y = height / 2 - (map.y + point.y / map.scale) * viewport.zoom;
      this._applyViewport();
      this._persistSoon(220);
    }

    _panFromMinimap(event) {
      const svg = this.root.querySelector('[data-relationship-minimap]');
      const rect = svg.getBoundingClientRect();
      const canvas = this.root.querySelector('.relationship-canvas');
      this._navigateMinimap({ x: Math.max(0, Math.min(220, (event.clientX - rect.left) * 220 / rect.width)), y: Math.max(0, Math.min(128, (event.clientY - rect.top) * 128 / rect.height)) }, this.pointerAction.map, canvas.clientWidth, canvas.clientHeight);
    }

    _applyViewMode() {
      const display = this._displayViewSettings();
      const compact = display.mode === 'compact';
      const deploymentSummary = this._boardView().projection === 'deployment-summary';
      this.root?.classList.toggle('compact-mode', compact);
      this.root?.classList.toggle('deployment-summary-mode', deploymentSummary);
      if (this.root) {
        const dimensions = this._nodeDimensions();
        const titleBaseSize = compact ? 13 : 14;
        const subtitleBaseSize = compact ? 9 : 10;
        const metaBaseSize = compact ? 8 : 9;
        this.root.style.setProperty('--relationship-card-scale', String(display.cardScale));
        this.root.style.setProperty('--relationship-text-scale', String(display.textScale));
        this.root.style.setProperty('--relationship-card-width', `${dimensions.width}px`);
        this.root.style.setProperty('--relationship-card-height', `${dimensions.height}px`);
        this.root.style.setProperty('--relationship-title-font-size', `${Math.round(titleBaseSize * display.textScale * 10) / 10}px`);
        this.root.style.setProperty('--relationship-subtitle-font-size', `${Math.round(subtitleBaseSize * display.textScale * 10) / 10}px`);
        this.root.style.setProperty('--relationship-meta-font-size', `${Math.round(metaBaseSize * display.textScale * 10) / 10}px`);
        this.root.style.setProperty('--relationship-filter-context-opacity', String(display.filterContextOpacity));
        this.root.style.setProperty('--relationship-filter-muted-opacity', String(display.filterMutedOpacity));
        this.root.style.setProperty('--relationship-filter-muted-saturation', String(display.filterMutedSaturation));
        this.root.style.setProperty('--relationship-filter-context-edge-opacity', String(display.filterContextEdgeOpacity));
        this.root.style.setProperty('--relationship-filter-muted-edge-opacity', String(display.filterMutedEdgeOpacity));
        this.root.style.setProperty('--relationship-filter-match-halo-opacity', String(display.filterMatchHaloOpacity));
        this.root.style.setProperty('--relationship-status-tint-opacity', `${Math.round(display.statusTintOpacity * 100)}%`);
        this.root.dataset.cardAppearance = display.cardAppearance;
        this.root.dataset.showGrid = String(display.showGrid);
        this.root.dataset.showEdgeLabels = String(display.showEdgeLabels);
        this.root.dataset.unmatchedDisplay = display.unmatchedDisplay;
      }
      const note = this.root?.querySelector('.relationship-projection-note');
      if (note) note.hidden = !deploymentSummary;
    }

    _updateFilterSummary() {
      const trigger = this.root?.querySelector('.relationship-filter-trigger');
      const count = this.root?.querySelector('.relationship-filter-count');
      const summary = this.root?.querySelector('.relationship-filter-summary');
      if (!trigger || !count || !summary) return;
      const graph = this._filteredGraph();
      const activeCount = this._activeFilterCount();
      trigger.classList.toggle('is-active', activeCount > 0);
      count.hidden = activeCount === 0;
      count.textContent = activeCount ? String(activeCount) : '';
      summary.textContent = graph.filterActive
        ? (this._displayViewSettings().unmatchedDisplay === 'hide'
          ? `${graph.directIds.size} 个匹配 · 已隐藏未命中项`
          : `${graph.directIds.size} 个匹配 · ${graph.contextualIds.size} 个一跳上下文 · ${graph.mutedIds.size} 个弱化`)
        : `${this._boardView().projection === 'deployment-summary' ? '部署摘要' : '完整事实'} · ${graph.placements.length} 个节点`;
    }

    _clientToWorld(clientX, clientY) {
      const canvas = this.root.querySelector('.relationship-canvas');
      const rect = canvas.getBoundingClientRect();
      const viewport = activeBoard(this.store).viewport;
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom
      };
    }

    _canvasElementHtml(entity, placement, graph) {
      const d = entity.details;
      const asset = this.documentAssets.get(entity.id);
      const preview = d.imageData || asset?.imageData;
      const isMedia = entity.type !== 'text';
      const unavailable = asset && asset.state !== 'available';
      const filterClass = graph.mutedIds.has(entity.id) ? ' filter-muted' : graph.contextualIds.has(entity.id) ? ' filter-context' : graph.filterActive && graph.directIds.has(entity.id) ? ' filter-match' : '';
      return `<article class="relationship-node whiteboard-free-element${filterClass}" data-entity-id="${escapeHtml(entity.id)}" data-entity-type="${entity.type}" tabindex="0" role="button" aria-label="${escapeHtml(entity.name)}，${TYPE_LABELS[entity.type]}" aria-pressed="false" style="transform:translate(${placement.x}px,${placement.y}px);width:${Number(d.width) || 320}px;height:${Number(d.height) || 180}px">
        ${entity.type === 'text' ? `<div class="whiteboard-text-content" style="font-size:${Number(d.fontSize) || 24}px;color:${escapeHtml(d.color || '#334155')};text-align:${escapeHtml(d.align || 'left')}">${escapeHtml(d.content || '双击编辑文字')}</div>`
          : entity.type === 'image' && preview ? `<img class="whiteboard-image-content" src="${escapeHtml(preview)}" alt="${escapeHtml(d.caption || entity.name)}" draggable="false" style="object-fit:${d.fit === 'cover' ? 'cover' : 'contain'}">` : `<div class="whiteboard-attachment-content"><strong>${entity.type === 'attachment' ? '▱' : '▧'} ${escapeHtml(entity.name)}</strong><span>${escapeHtml(asset?.message || (entity.type === 'image' ? '图片预览加载中或不可用' : d.caption || '文件附件'))}</span></div>`}
        ${isMedia ? `<div class="whiteboard-asset-caption${unavailable ? ' is-missing' : ''}"><span>${unavailable ? escapeHtml(asset.message) : d.referencePath ? '外部引用' : d.assetPath ? '已复制到项目' : '内嵌图片'}</span>${this.documentRecord && asset?.state === 'available' ? `<button type="button" data-reveal-asset="${entity.id}" title="在系统文件管理器中显示，不执行文件">定位文件</button>` : ''}</div>` : ''}
        <div class="whiteboard-element-actions"><button type="button" data-edit-canvas-element="${entity.id}" aria-label="编辑 ${escapeHtml(entity.name)}">✎</button><button type="button" data-lock-canvas-element="${entity.id}" aria-label="${placement.locked ? '解锁' : '锁定'} ${escapeHtml(entity.name)}">${placement.locked ? '🔒' : '◇'}</button></div>
        ${!placement.locked ? `<button class="whiteboard-resize-handle" type="button" data-resize-canvas-element="${entity.id}" aria-label="调整 ${escapeHtml(entity.name)} 尺寸" title="拖动调整尺寸；图片按住 Shift 自由调整">◢</button>` : ''}</article>`;
    }

    async _createCanvasElement(type, point = null) {
      this._closeAddMenu();
      if (type === 'image' && this.documentRecord?.projectDirectory) return this._addFiles(undefined, point, true);
      try {
        let entity;
        if (type === 'image') {
          const image = await this.bridge.relationshipBoards.pickImage();
          if (image.cancelled) return;
          const width = Math.min(440, image.width);
          entity = { id: makeId('entity'), type, name: image.name, details: { imageData: image.data, width: String(width), height: String(Math.max(60, width * image.height / image.width)), fit: 'contain' }, source: 'manual' };
        } else entity = { id: makeId('entity'), type, name: '文字', details: { content: '双击编辑文字', fontSize: '24', color: '#334155', align: 'left', width: '320', height: '180' }, source: 'manual' };
        this._addEntity(entity, point);
        if (type === 'text') await this._editCanvasElement(entity.id);
      } catch (error) { this.notify(error.message, 'error'); }
    }

    async _editCanvasElement(id) {
      const entity = this.store.entities.find(item => item.id === id);
      if (!entity || !['text', 'image', 'attachment'].includes(entity.type)) return;
      const d = entity.details;
      const fields = [{ key: 'name', label: '名称', value: entity.name, required: true }];
      if (entity.type === 'text') fields.push(
        { key: 'content', label: '文字内容', value: d.content, multiline: true, maxLength: 10000 },
        { key: 'fontSize', label: '字号（12–96）', value: d.fontSize || 24, type: 'number', min: 12, max: 96 },
        { key: 'color', label: '文字颜色', value: d.color || '#334155', type: 'color' },
        { key: 'align', label: '对齐', value: d.align, options: [['left', '左对齐'], ['center', '居中'], ['right', '右对齐']] }
      );
      else if (entity.type === 'image') fields.push({ key: 'caption', label: '图片说明', value: d.caption }, { key: 'fit', label: '显示方式', value: d.fit || 'contain', options: [['contain', '完整显示'], ['cover', '填满并居中裁切']] }, { key: 'replace', label: '图片来源', value: 'keep', options: [['keep', '保留当前图片'], ['replace', '选择替换图片…']] });
      else fields.push({ key: 'caption', label: '文件说明', value: d.caption });
      fields.push({ key: 'width', label: '宽度（60–1600）', value: d.width, type: 'number', min: 60, max: 1600 }, { key: 'height', label: '高度（60–1600）', value: d.height, type: 'number', min: 60, max: 1600 });
      const values = await this._openFormDialog({ title: `编辑${TYPE_LABELS[entity.type]}`, fields, submitLabel: '保存' });
      if (!values) return;
      try {
        const next = clone(this.store);
        const edited = next.entities.find(item => item.id === id);
        const { name, replace, ...details } = values;
        edited.name = name; edited.details = { ...d, ...details };
        if (replace === 'replace') {
          const image = await this.bridge.relationshipBoards.pickImage();
          if (image.cancelled) return;
          edited.details.imageData = image.data;
          delete edited.details.assetPath; delete edited.details.referencePath;
        }
        const normalized = Model.assertValidStore(next);
        this._recordMutation(); this.store = normalized; this._persistSoon(0); this._renderGraph(); this._refreshHistoryButtons();
      } catch (error) { this.notify(error.message, 'error'); }
    }

    async _createBoard() {
      if (this.documentRecord) { await this._showLocalWorkspace(); if (this.documentRecord) return; }
      if (this.store.boards.length >= Model.MAX_BOARDS) {
        this.notify(`最多创建 ${Model.MAX_BOARDS} 个白板`, 'warning');
        return;
      }
      const values = await this._openFormDialog({
        title: '新建关系白板',
        submitLabel: '创建',
        fields: [{ key: 'name', label: '白板名称', value: '新白板', required: true, maxLength: 80 }]
      });
      if (!values) return;
      this._recordMutation();
      const id = makeId('board');
      this.store.boards.push({
        id,
        name: values.name,
        viewport: { x: 120, y: 90, zoom: 1 },
        view: { ...Model.defaultBoardView(), topologyLayout: 'coolify-projects' },
        placements: []
      });
      this.store.activeBoardId = id;
      this._setPanelTopology(this.panelTopologyResult);
      this._persistSoon(0);
      this.render();
    }

    async _renameBoard() {
      const board = activeBoard(this.store);
      if (!board) return;
      const values = await this._openFormDialog({
        title: '重命名白板',
        submitLabel: '保存',
        fields: [{ key: 'name', label: '白板名称', value: board.name, required: true, maxLength: 80 }]
      });
      if (!values || values.name === board.name) return;
      this._recordMutation();
      board.name = values.name;
      this._persistSoon(0);
      this.render();
    }

    async _createManualEntity(type, point = null) {
      if (['text', 'image'].includes(type)) return this._createCanvasElement(type, point);
      const labels = {
        server: ['服务器名称', '例如 Con01'],
        deployment: ['部署名称', '例如 MES 生产环境'],
        endpoint: ['端点名称', '例如 MES 公网入口'],
        group: ['分组名称', '例如 生产环境']
      };
      const fields = [{ key: 'name', label: labels[type][0], placeholder: labels[type][1], required: true, maxLength: 160 }];
      if (type === 'server') {
        fields.push({ key: 'environment', label: '环境', placeholder: 'production / staging', maxLength: 240 });
        fields.push({ key: 'hostLabel', label: '主机标签', placeholder: '仅用于识别，不填写密码或密钥', maxLength: 240 });
      }
      if (type === 'deployment') {
        fields.push({ key: 'environment', label: '环境', placeholder: 'production / staging', maxLength: 240 });
        fields.push({ key: 'version', label: '版本', placeholder: '例如 v2.4.1 或镜像标签', maxLength: 240 });
        fields.push({ key: 'branch', label: '分支', placeholder: '例如 main / release', maxLength: 240 });
        fields.push({ key: 'revision', label: '提交', placeholder: '例如 abcdef012345', maxLength: 240 });
        fields.push({ key: 'status', label: '状态', placeholder: '运行中 / 待验证', maxLength: 240 });
      }
      if (type === 'endpoint') fields.push({ key: 'urlLabel', label: '地址标签', placeholder: '例如 https://mes.example.com', maxLength: 240 });
      const values = await this._openFormDialog({ title: `添加${TYPE_LABELS[type]}`, submitLabel: '添加', fields });
      if (!values) return;
      const details = {};
      for (const field of fields.slice(1)) if (values[field.key]) details[field.key] = values[field.key];
      this._addEntity({ id: makeId('entity'), type, name: values.name, details, source: 'manual' }, point);
    }

    _addResource(resource, point = null) {
      if (!resource) return;
      if (resource.entityId) {
        const placement = this._combinedPlacements().find(candidate => candidate.entityId === resource.entityId);
        if (placement) {
          this._focusEntityOnBoard(resource.entityId);
          return;
        }
        const existingEntity = this.store.entities.find(candidate => candidate.id === resource.entityId)
          || (this.documentRecord && this.panelProjection.entities.find(candidate => candidate.id === resource.entityId) ? this._portableEntity(this.panelProjection.entities.find(candidate => candidate.id === resource.entityId)) : null);
        if (!existingEntity) {
          this.notify('该云端资源暂时不可用，请刷新 Coolify 数据', 'warning');
          return;
        }
        this._addEntity(existingEntity, point);
        return;
      }
      let entity = this.store.entities.find(candidate => candidate.type === resource.kind && candidate.refId === resource.refId);
      if (entity && activeBoard(this.store).placements.some(placement => placement.entityId === entity.id)) {
        this._focusEntityOnBoard(entity.id);
        return;
      }
      if (!entity) {
        entity = {
          id: makeId('entity'),
          type: resource.kind,
          name: resource.name,
          refId: resource.refId,
          details: {},
          source: 'gitfinder-registry'
        };
      }
      this._addEntity(entity, point);
    }

    _addEntity(entity, point = null) {
      if (!this.store.entities.some(candidate => candidate.id === entity.id) && this.store.entities.length >= Model.MAX_ENTITIES) {
        this.notify(`最多保存 ${Model.MAX_ENTITIES} 个关系节点`, 'warning');
        return;
      }
      this._recordMutation();
      if (!this.store.entities.some(candidate => candidate.id === entity.id)) this.store.entities.push(entity);
      const board = activeBoard(this.store);
      const fallbackIndex = board.placements.length;
      const placement = point || { x: 80 + (fallbackIndex % 3) * 280, y: 80 + Math.floor(fallbackIndex / 3) * 140 };
      board.placements.push({ entityId: entity.id, x: Math.round(placement.x), y: Math.round(placement.y) });
      this._selectOnlyEntity(entity.id);
      this._persistSoon(0);
      this._renderGraph();
      this._refreshHistoryButtons();
      this._updateSummary();
    }

    _selectedMemberPlacements() {
      const selectedIds = this._entitySelectionIds();
      const placements = this._combinedPlacements();
      const byId = new Map(placements.map(item => [item.entityId, item]));
      return placements.filter(placement => {
        if (!selectedIds.has(placement.entityId)) return false;
        const seen = new Set([placement.entityId]);
        let parent = placement.groupId;
        while (parent && !seen.has(parent)) {
          if (selectedIds.has(parent)) return false;
          seen.add(parent);
          parent = byId.get(parent)?.groupId;
        }
        return true;
      });
    }

    async _createGroupFromSelection() {
      const members = this._selectedMemberPlacements();
      if (members.length < 2) {
        this.notify('请至少选择两个要整理的节点', 'warning');
        return false;
      }
      if (this.store.entities.length >= Model.MAX_ENTITIES) {
        this.notify(`最多保存 ${Model.MAX_ENTITIES} 个关系节点`, 'warning');
        return false;
      }
      const values = await this._openFormDialog({
        title: '建立视觉分组',
        submitLabel: '建立分组',
        fields: [{ key: 'name', label: '分组名称', value: '新分组', required: true, maxLength: 160 }]
      });
      if (!values) return false;
      const groupId = makeId('entity');
      this._recordMutation();
      this.store.entities.push({ id: groupId, type: 'group', name: values.name, details: {}, source: 'manual' });
      const minX = Math.min(...members.map(item => item.x));
      const minY = Math.min(...members.map(item => item.y));
      const parentId = members[0].groupId;
      activeBoard(this.store).placements.push({
        entityId: groupId,
        x: minX - GROUP_PADDING_X,
        y: minY - GROUP_HEADER_HEIGHT,
          ...(parentId && activeBoard(this.store).placements.some(item => item.entityId === parentId) && members.every(item => item.groupId === parentId) ? { groupId: parentId } : {})
      });
      for (const placement of members) placement.groupId = groupId;
      this._saveDynamicPlacementOverrides(members.filter(item => item.dynamic).map(item => item.entityId));
      this._selectOnlyEntity(groupId);
      this._persistSoon(0);
      this._renderGraph();
      this._refreshHistoryButtons();
      this._updateSummary();
      this._setCanvasAnnouncement(`已建立视觉分组 ${values.name}，包含 ${members.length} 个节点`);
      return true;
    }

    _assignSelectionToGroup(groupId) {
      const board = activeBoard(this.store);
      const group = this.store.entities.find(entity => entity.id === groupId && entity.type === 'group');
      if (!board || !group || !board.placements.some(placement => placement.entityId === groupId)) {
        this.notify('所选视觉分组已不在当前白板', 'warning');
        return false;
      }
      const members = this._selectedMemberPlacements().filter(placement => placement.groupId !== groupId);
      if (!members.length) return false;
      if (!members.every(item => this._canJoinGroup(item.entityId, groupId))) {
        this.notify('群组不能加入自身或自己的子群组', 'warning');
        return false;
      }
      this._recordMutation();
      for (const placement of members) placement.groupId = groupId;
      this._saveDynamicPlacementOverrides(members.filter(item => item.dynamic).map(item => item.entityId));
      this._persistSoon(0);
      this._renderGraph();
      this._refreshHistoryButtons();
      this._updateSummary();
      this._setCanvasAnnouncement(`已将 ${members.length} 个节点归入 ${group.name}`);
      return true;
    }

    _removeSelectionFromGroups() {
      const members = this._selectedMemberPlacements().filter(placement => placement.groupId);
      if (!members.length) return false;
      this._recordMutation();
      for (const placement of members) delete placement.groupId;
      this._saveDynamicPlacementOverrides(members.filter(item => item.dynamic).map(item => item.entityId));
      this._persistSoon(0);
      this._renderGraph();
      this._refreshHistoryButtons();
      this._updateSummary();
      this._setCanvasAnnouncement(`已将 ${members.length} 个节点移出视觉分组`);
      return true;
    }

    _deleteSelection() {
      if (this.selectedRelationshipId) {
        const index = this.store.relationships.findIndex(item => item.id === this.selectedRelationshipId);
        if (index < 0) return;
        this._recordMutation();
        this.store.relationships.splice(index, 1);
        this.selectedRelationshipId = '';
      } else if (this._entitySelectionIds().size) {
        const board = activeBoard(this.store);
        const selectedIds = this._entitySelectionIds();
        const entities = this._allEntitiesById();
        if ([...selectedIds].some(id => entities.get(id)?.transient && entities.get(id)?.type !== 'group')) {
          this.notify('实时资源不可删除；可单独选中群组并解散，成员将保留', 'info');
          return;
        }
        const selected = this._combinedPlacements().filter(item => selectedIds.has(item.entityId));
        if (!selected.length) return;
        this._recordMutation();
        const dynamicLayout = this._dynamicLayoutForActiveBoard();
        for (const placement of selected) {
          if (entities.get(placement.entityId)?.transient) {
            dynamicLayout[placement.entityId] = { ...placement, dissolved: true };
          }
        }
        board.placements = board.placements.filter(item => !selectedIds.has(item.entityId));
        const changedDynamicIds = [];
        for (const placement of this._combinedPlacements(board)) {
          if (placement.groupId && selectedIds.has(placement.groupId)) {
            delete placement.groupId;
            if (placement.dynamic) changedDynamicIds.push(placement.entityId);
          }
        }
        this._saveDynamicPlacementOverrides(changedDynamicIds);
        for (const placement of Object.values(dynamicLayout || {})) {
          if (placement.groupId && selectedIds.has(placement.groupId)) delete placement.groupId;
        }
        this._applyDynamicLayoutOverrides();
        this._persistDynamicLayoutsSoon(0);
        const orphanedIds = new Set([...selectedIds].filter(entityId => (
          !this.store.boards.some(candidate => candidate.placements.some(item => item.entityId === entityId))
        )));
        this.store.entities = this.store.entities.filter(entity => !orphanedIds.has(entity.id));
        this.store.relationships = this.store.relationships.filter(item => (
          !orphanedIds.has(item.sourceId) && !orphanedIds.has(item.targetId)
        ));
        this._clearEntitySelection();
      } else return;
      this.keyboardConnectSourceId = '';
      this._persistSoon(0);
      this._renderGraph();
      this._refreshHistoryButtons();
      this._updateSummary();
    }

    _recordMutation() {
      this._pushUndoSnapshot(this._historySnapshot());
      this.redoStack = [];
    }

    _historySnapshot() {
      return JSON.stringify({ store: this.store, dynamicLayouts: this.dynamicLayoutStore, dynamicPlacements: this.panelProjection?.placements || [] });
    }

    _restoreHistorySnapshot(snapshot) {
      const saved = JSON.parse(snapshot);
      const previousLayout = this.store && activeBoard(this.store)?.view?.topologyLayout;
      const dissolvedIds = store => Object.entries(store?.boards?.[activeBoard(this.store)?.id] || {}).filter(([, value]) => value.dissolved).map(([id]) => id).sort().join(',');
      const previousDissolved = dissolvedIds(this.dynamicLayoutStore);
      this.store = saved.store;
      this.dynamicLayoutStore = normalizeDynamicLayoutStore(saved.dynamicLayouts);
      if (previousLayout !== activeBoard(this.store)?.view?.topologyLayout || previousDissolved !== dissolvedIds(this.dynamicLayoutStore)) this._setPanelTopology(this.panelTopologyResult);
      const previous = new Map((saved.dynamicPlacements || []).map(item => [item.entityId, item]));
      if (this.panelProjection) {
        this.panelProjection.placements = (this.panelProjection.placements || []).map(item => previous.get(item.entityId) || item);
      }
    }

    _pushUndoSnapshot(snapshot) {
      if (!snapshot || this.undoStack.at(-1) === snapshot) return;
      this.undoStack.push(snapshot);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }

    undo() {
      const previous = this.undoStack.pop();
      if (!previous) return;
      this.redoStack.push(this._historySnapshot());
      this._restoreHistorySnapshot(previous);
      this._clearEntitySelection();
      this.selectedRelationshipId = '';
      this.keyboardConnectSourceId = '';
      this._persistSoon(0);
      this._persistDynamicLayoutsSoon(0);
      this.render();
    }

    redo() {
      const next = this.redoStack.pop();
      if (!next) return;
      this.undoStack.push(this._historySnapshot());
      this._restoreHistorySnapshot(next);
      this._clearEntitySelection();
      this.selectedRelationshipId = '';
      this.keyboardConnectSourceId = '';
      this._persistSoon(0);
      this._persistDynamicLayoutsSoon(0);
      this.render();
    }

    fitContent(options = {}) {
      this._stopWheelPan();
      const board = activeBoard(this.store);
      const canvas = this.root?.querySelector('.relationship-canvas');
      if (!board || !canvas) return;
      const centered = ['selection-centered', 'server-centered'].includes(board.view?.topologyLayout);
      const minZoom = Number.isFinite(Number(options.minZoom))
        ? Math.min(1, Math.max(0.25, Number(options.minZoom)))
        : centered ? 0.25 : 0.35;
      const placements = this._filteredGraph().placements;
      if (!placements.length) {
        board.viewport = { x: 120, y: 90, zoom: 1 };
      } else {
        const rect = canvas.getBoundingClientRect();
        const displayGeometry = this._displayGeometryMap(placements);
        const geometries = placements.map(item => this._placementGeometry(item, placements, new Set(), displayGeometry));
        const minX = Math.min(...geometries.map(item => item.x));
        const minY = Math.min(...geometries.map(item => item.y));
        const maxX = Math.max(...geometries.map(item => item.x + item.width));
        const maxY = Math.max(...geometries.map(item => item.y + item.height));
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const zoom = Math.min(1.5, Math.max(minZoom, Math.min((rect.width - 120) / width, (rect.height - 120) / height)));
        board.viewport.zoom = zoom;
        board.viewport.x = (rect.width - width * zoom) / 2 - minX * zoom;
        board.viewport.y = (rect.height - height * zoom) / 2 - minY * zoom;
      }
      this._applyViewport();
      this._persistSoon(160);
    }

    _handleKeydown(event) {
      if (!this.root?.isConnected || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (this._handleContextMenuKeydown(event)) return;
      const editing = event.target?.isContentEditable
        || event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === 'Escape' && !this.root.querySelector('.relationship-filter-popover')?.hidden) {
        event.preventDefault();
        this._closeFilterPopover();
        this.root.querySelector('.relationship-filter-trigger')?.focus();
        return;
      }
      if (mod && event.key.toLowerCase() === 'z' && !editing) {
        event.preventDefault();
        if (event.shiftKey) this.redo(); else this.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'g' && !editing) {
        event.preventDefault();
        if (event.shiftKey) this._removeSelectionFromGroups();
        else this._createGroupFromSelection();
        return;
      }
      if (editing) return;
      this._stopWheelPan();
      if (event.key === 'Enter' && this.keyboardConnectSourceId) {
        const targetNode = event.target?.closest?.('.relationship-node');
        if (targetNode && targetNode.dataset.entityId !== this.keyboardConnectSourceId) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const created = this._createConnection(this.keyboardConnectSourceId, targetNode.dataset.entityId);
          if (created) this.keyboardConnectSourceId = '';
          return;
        }
      }
      if (event.key === 'Escape') {
        this.keyboardConnectSourceId = '';
        this._clearEntitySelection();
        this.selectedRelationshipId = '';
        this._cancelPointerAction(false);
        this._updateSelectionCss();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && (this._entitySelectionIds().size || this.selectedRelationshipId)) {
        event.preventDefault();
        this._deleteSelection();
        return;
      }
      const canvas = event.target?.closest?.('.relationship-canvas');
      if (!canvas || mod || this.pointerAction || this.keyboardConnectSourceId
        || event.target?.closest?.('button, a, [role="menu"], [role="menuitem"], [role="slider"]')
        || this.root.querySelector('.relationship-display-popover:not([hidden]), .relationship-filter-popover:not([hidden]), .relationship-add-menu:not([hidden])')
        || Array.from(this.root.ownerDocument?.querySelectorAll('[role="dialog"][aria-modal="true"]') || [])
          .some(dialog => dialog.getClientRects().length > 0)) return;
      if ((event.code === 'Space' || event.key === ' ') && !event.altKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        this.spacePan = true;
        this.root.classList?.add('pan-ready');
        return;
      }
      const direction = {
        w: [0, 1], ArrowUp: [0, 1], s: [0, -1], ArrowDown: [0, -1],
        a: [1, 0], ArrowLeft: [1, 0], d: [-1, 0], ArrowRight: [-1, 0]
      }[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (direction && !event.altKey) {
        const board = activeBoard(this.store);
        if (!board) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        // Camera direction: looking right moves the world left. Use screen pixels at every zoom.
        const step = event.shiftKey ? 120 : 40;
        board.viewport.x += direction[0] * step;
        board.viewport.y += direction[1] * step;
        this._applyViewport();
        this._persistSoon(220);
        return;
      }
      const selectedIds = this._entitySelectionIds();
      if (!event.altKey) return;
      if (!selectedIds.size || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const movingIds = new Set(this._movingEntityIds(this.selectedEntityId || selectedIds.values().next().value));
      for (const id of [...movingIds]) if (this._placementForEntity(id)?.locked) movingIds.delete(id);
      const persistentIds = new Set(activeBoard(this.store).placements
        .filter(item => movingIds.has(item.entityId))
        .map(item => item.entityId));
      const dynamicIds = new Set((this.panelProjection?.placements || [])
        .filter(item => item.dynamic && movingIds.has(item.entityId))
        .map(item => item.entityId));
      const placements = this._combinedPlacements().filter(item => movingIds.has(item.entityId));
      if (!placements.length) return;
      if (persistentIds.size) this._recordMutation();
      const step = event.shiftKey ? 24 : 8;
      for (const placement of placements) {
        if (event.key === 'ArrowLeft') placement.x -= step;
        if (event.key === 'ArrowRight') placement.x += step;
        if (event.key === 'ArrowUp') placement.y -= step;
        if (event.key === 'ArrowDown') placement.y += step;
      }
      if (persistentIds.size) this._persistSoon(80);
      if (dynamicIds.size) this._saveDynamicPlacementOverrides(dynamicIds);
      this._renderGraph();
      this._refreshHistoryButtons();
      this._updateSummary();
    }

    _updateSelectionCss(options = {}) {
      const selectedIds = this._entitySelectionIds();
      this.root?.querySelectorAll('.relationship-node').forEach(node => {
        const selected = selectedIds.has(node.dataset.entityId);
        node.classList.toggle('selected', selected);
        node.setAttribute('aria-pressed', selected ? 'true' : 'false');
        node.classList.toggle('keyboard-connection-source', node.dataset.entityId === this.keyboardConnectSourceId);
      });
      this.root?.querySelectorAll('.relationship-edge').forEach(edge => {
        edge.classList.toggle('selected', edge.dataset.relationshipId === this.selectedRelationshipId);
      });
      const groupButton = this.root?.querySelector('[data-relationship-action="create-group-from-selection"]');
      if (groupButton) groupButton.disabled = this._selectedMemberPlacements().length < 2;
      this._renderSelectionToolbar();
      this._updateMinimap();
      if (options.renderInspector !== false) {
        if (options.preserveDirtyInspector && this._panelElement('.relationship-inspector-form.is-dirty')) return;
        this._renderInspector();
      }
    }

    _refreshHistoryButtons() {
      const undo = this.root?.querySelector('[data-relationship-action="undo"]');
      const redo = this.root?.querySelector('[data-relationship-action="redo"]');
      if (undo) undo.disabled = !this.undoStack.length;
      if (redo) redo.disabled = !this.redoStack.length;
    }

    _saveLabel() {
      if (this.saveState === 'saving') return '正在保存…';
      if (this.saveState === 'error') return '保存失败';
      return this.documentRecord ? '已保存到白板文件' : '已保存在本机';
    }

    _setSaveState(state) {
      this.saveState = state;
      const element = this.root?.querySelector('.relationship-save-state');
      if (element) {
        element.dataset.state = state;
        element.textContent = this._saveLabel();
      }
    }

    _persistSoon(delay = 100) {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this._setSaveState('saving');
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this._persistNow();
      }, delay);
    }

    _persistNow() {
      if (!this.store) return Promise.resolve();
      const snapshot = clone(this.store);
      const record = this.documentRecord;
      let documentSnapshot;
      try { documentSnapshot = record ? this._buildActiveBoardExportStore() : null; }
      catch (error) { this._setSaveState('error'); this.notify(error.message, 'error'); return Promise.resolve(null); }
      this._setSaveState('saving');
      this.saveChain = this.saveChain
        .catch(() => {})
        .then(async () => {
          if (!record) return this.bridge.relationshipBoards.save(snapshot);
          const result = await this.bridge.relationshipBoards.saveDocument({ id: record.id, revision: record.revision, store: documentSnapshot });
          Object.assign(record, result.record);
          if (this.documentRecord === record) {
            let materialized = false;
            for (const saved of result.store?.entities || []) {
              const current = this.store.entities.find(item => item.id === saved.id);
              const original = documentSnapshot.entities.find(item => item.id === saved.id);
              if (current?.details.imageData && current.details.imageData === original?.details.imageData && saved.details.assetPath) {
                delete current.details.imageData; current.details.assetPath = saved.details.assetPath; materialized = true;
              }
            }
            if (materialized) void this._refreshDocumentAssets();
            this.documentLibrary = this.documentLibrary.map(item => item.id === record.id ? { ...item, ...record } : item);
            const tab = this.root?.querySelector(`[data-open-document="${escapeSelectorValue(record.id)}"]`);
            if (tab) tab.textContent = `▧ ${record.name}`;
          }
          return result;
        })
        .then(result => {
          this._setSaveState('saved');
          return result;
        })
        .catch(error => {
          this._setSaveState('error');
          this.notify(`关系白板保存失败：${error?.message || String(error)}`, 'error');
          return null;
        });
      return this.saveChain;
    }

    _updateSummary() {
      const board = activeBoard(this.store);
      if (!board) return;
      if (this.root?.isConnected) this._renderResources();
      const graph = this._filteredGraph();
      this.onSummaryChanged({
        boardName: board.name,
        nodeCount: graph.placements.length,
        relationshipCount: graph.relationships.length,
        totalNodeCount: this._combinedPlacements(board).length,
        filterActive: graph.filterActive
      });
    }

    async _refreshDocumentLibrary() {
      if (!this.bridge.relationshipBoards.listDocuments) return;
      try { this.documentLibrary = await this.bridge.relationshipBoards.listDocuments(); this._renderResources(); }
      catch (error) { this.notify(`白板资源库读取失败：${error.message}`, 'error'); }
    }

    async _refreshDocumentAssets() {
      const record = this.documentRecord;
      if (!record || !this.bridge.relationshipBoards.getAssets) { this.documentAssets.clear(); return; }
      try {
        const assets = await this.bridge.relationshipBoards.getAssets(record.id);
        if (this.documentRecord !== record) return;
        this.documentAssets = new Map(assets.map(item => [item.entityId, item]));
        this._renderGraph();
      } catch (error) { this.notify(`媒体读取失败：${error.message}`, 'error'); }
    }

    async _newDocument() {
      if (this.documentBusy) return;
      const values = await this._openFormDialog({ title: '新建白板项目', submitLabel: '选择保存位置…', fields: [{ key: 'name', label: '白板名称', value: '新白板', required: true, maxLength: 80 }] });
      if (!values) return;
      this.documentBusy = true;
      try {
        clearTimeout(this.saveTimer); this.saveTimer = null;
        if (!await this._persistNow()) return;
        const id = makeId('board');
        const store = Model.assertValidStore({ schemaVersion: 1, activeBoardId: id, entities: [], relationships: [], boards: [{ id, name: values.name, viewport: { x: 80, y: 80, zoom: 1 }, placements: [] }] });
        const result = await this.bridge.relationshipBoards.createDocument({ store });
        if (result.cancelled) return;
        if (!this.documentRecord) this.localWorkspace = this.store;
        this.documentRecord = result.record; this.store = result.store;
        this.openDocumentIds.add(result.record.id); this._resetDocumentSelection();
        await this._refreshDocumentLibrary(); this.render();
        this.notify('已创建独立白板项目；拖入文件默认复制到项目', 'success');
      } catch (error) { this.notify(`新建白板失败：${error.message}`, 'error'); }
      finally { this.documentBusy = false; }
    }

    async _addFiles(paths, point, imagesOnly = false) {
      this._closeAddMenu();
      try {
        if (!paths) {
          const result = await this.bridge.relationshipBoards.pickFiles(imagesOnly);
          if (result.cancelled) return;
          paths = result.paths;
        }
        if (!paths?.length) { this.notify('未获取到本地文件，请使用“文件与媒体…”选择', 'info'); return; }
        if (!this.documentRecord?.projectDirectory) {
          this.notify('先选择白板项目保存位置，以便保存拖入的文件', 'info');
          await this._saveDocument(true);
          if (!this.documentRecord?.projectDirectory) return;
        }
        if (this.store.entities.length + paths.length > Model.MAX_ENTITIES) throw new Error('白板元素数量超过限制');
        const values = await this._openFormDialog({ title: `添加 ${paths.length} 个文件`, submitLabel: '添加到白板', fields: [{ key: 'mode', label: '存储方式（外部引用在原文件移动后会失效）', value: 'copy', options: [['copy', '复制进白板项目（推荐）'], ['reference', '引用原文件，不复制']] }] });
        if (!values) return;
        const record = this.documentRecord;
        const entities = await this.bridge.relationshipBoards.attachFiles({ id: record.id, paths, mode: values.mode });
        if (this.documentRecord !== record) return;
        const board = activeBoard(this.store), canvas = this.root.querySelector('.relationship-canvas');
        point ||= { x: (canvas.clientWidth / 2 - board.viewport.x) / board.viewport.zoom, y: (canvas.clientHeight / 2 - board.viewport.y) / board.viewport.zoom };
        this._recordMutation();
        entities.forEach((entity, index) => { this.store.entities.push(entity); board.placements.push({ entityId: entity.id, x: point.x + index * 40, y: point.y + index * 40 }); });
        this._setEntitySelection(new Set(entities.map(entity => entity.id)));
        await this._persistNow(); await this._refreshDocumentAssets(); await this._refreshDocumentLibrary(); this.render();
      } catch (error) { this.notify(`文件添加失败：${error.message}`, 'error'); }
    }

    async _openDocument(id, fromPackage = false) {
      if (this.documentBusy) return;
      this.documentBusy = true;
      try {
        clearTimeout(this.saveTimer); this.saveTimer = null;
        if (!await this._persistNow()) return;
        const result = await (fromPackage ? this.bridge.relationshipBoards.importPackage() : this.bridge.relationshipBoards.openDocument(id));
        if (result.cancelled) return;
        if (!this.documentRecord) this.localWorkspace = this.store;
        this.documentRecord = result.record;
        this.openDocumentIds.add(result.record.id);
        this.store = Model.assertValidStore(result.store);
        this._resetDocumentSelection();
        await this._refreshDocumentLibrary();
        this._setPanelTopology(this.panelTopologyResult);
        this.render();
        await this._refreshDocumentAssets();
        if (result.warnings?.length) this.notify(`白板已打开；${result.warnings.length} 个附件缺失或需重新授权，已保留占位`, 'info');
      } catch (error) { this.notify(`无法打开白板：${error.message}`, 'error'); }
      finally { this.documentBusy = false; }
    }

    async _saveDocument(saveAs = false) {
      if (this.documentBusy) return;
      this.documentBusy = true;
      try {
        clearTimeout(this.saveTimer); this.saveTimer = null;
        await this.saveChain;
        const snapshot = this._buildActiveBoardExportStore();
        const result = await this.bridge.relationshipBoards.saveDocument({ id: this.documentRecord?.id, revision: this.documentRecord?.revision, saveAs, store: snapshot });
        if (result.cancelled) return;
        const changedDocument = this.documentRecord?.id !== result.record.id;
        if (!this.documentRecord) {
          await this.bridge.relationshipBoards.save(this.store);
          this.localWorkspace = this.store;
        }
        this.documentRecord = result.record;
        this.openDocumentIds.add(result.record.id);
        this.store = result.store || snapshot;
        if (changedDocument) this._resetDocumentSelection();
        await this._refreshDocumentLibrary();
        this._setSaveState('saved');
        this.render();
        await this._refreshDocumentAssets();
      } catch (error) { this._setSaveState('error'); this.notify(`白板保存失败：${error.message}`, 'error'); }
      finally { this.documentBusy = false; }
    }

    _resetDocumentSelection() {
      this._stopWheelPan();
      this.documentAssets.clear();
      this.undoStack = []; this.redoStack = []; this.cardHeights.clear();
      this._clearEntitySelection(); this.selectedRelationshipId = '';
      this.expandedCardIds = new Set((activeBoard(this.store)?.placements || []).filter(item => item.expanded).map(item => item.entityId));
    }

    async _showLocalWorkspace() {
      if (!this.documentRecord || this.documentBusy) return;
      clearTimeout(this.saveTimer); this.saveTimer = null;
      if (!await this._persistNow()) return;
      this.documentRecord = null;
      this.store = this.localWorkspace || Model.normalizeStore((await this.bridge.relationshipBoards.get()).store).value;
      this.localWorkspace = null;
      this._resetDocumentSelection();
      this._setPanelTopology(this.panelTopologyResult);
      this.render();
    }

    async _removeDocument(id, trash = false) {
      if (this.documentBusy) return;
      if (id === this.documentRecord?.id) { await this._showLocalWorkspace(); if (this.documentRecord) return; }
      const result = await this.bridge.relationshipBoards.removeDocument({ id, trash });
      if (result.cancelled) return;
      this.openDocumentIds.delete(id);
      this.documentLibrary = result.library;
      this.render();
    }

    async _exportPackage() {
      if (this.exportInFlight || this.documentBusy) return;
      this.exportInFlight = true;
      try {
        const result = await this.bridge.relationshipBoards.exportPackage({ id: this.documentRecord?.id, store: this._buildActiveBoardExportStore() });
        if (result.cancelled) return;
        this.notify(`已导出 ${result.fileName}，包含 ${result.assetCount} 个附件${result.warnings?.length ? `；${result.warnings.length} 个资源保留外部引用或缺失占位` : ''}`, result.warnings?.length ? 'info' : 'success');
      } catch (error) { this.notify(`白板包导出失败：${error.message}`, 'error'); }
      finally { this.exportInFlight = false; }
    }

    async _exportCurrentBoard() {
      if (this.exportInFlight || !this.bridge?.relationshipBoards?.exportCurrent) return false;
      this.exportInFlight = true;
      try {
        const store = this._buildActiveBoardExportStore();
        const result = await this.bridge.relationshipBoards.exportCurrent({ store });
        if (!result || result.cancelled) return false;
        this.notify(`已导出“${activeBoard(store)?.name || '关系白板'}”：${result.nodeCount} 个节点、${result.relationshipCount} 条关系`, 'success');
        this._setCanvasAnnouncement(`当前关系白板已导出为 ${result.fileName}`);
        return true;
      } catch (error) {
        this.notify(`关系白板导出失败：${error?.message || String(error)}`, 'error');
        return false;
      } finally {
        this.exportInFlight = false;
      }
    }

    async _importRelationshipJson() {
      if (this.importInFlight || !this.bridge?.relationshipBoards?.previewImport) return false;
      if (this.documentRecord) {
        this.notify('导入合并用于本机白板合集。请先切换到“本机白板”；独立文件请使用“打开…”', 'info');
        return false;
      }
      const rootAtStart = this.root;
      this.importInFlight = true;
      try {
        await this._persistNow();
        const preview = await this.bridge.relationshipBoards.previewImport();
        if (!preview || preview.cancelled || this.root !== rootAtStart) return false;
        if (!preview.hasChanges) {
          this.notify('所选 JSON 与当前关系事实没有可合并差异', 'info');
          return false;
        }
        const confirmed = await this._openImportPreviewDialog(preview);
        if (!confirmed || this.root !== rootAtStart) return false;
        const result = await this.bridge.relationshipBoards.applyImport({
          operationId: preview.operationId,
          previewToken: preview.previewToken
        });
        const normalized = Model.assertValidStore(result.store);
        if (JSON.stringify(normalized) !== JSON.stringify(this.store)) {
          this._recordMutation();
          this.store = normalized;
        }
        this._clearEntitySelection();
        this.selectedRelationshipId = '';
        this.keyboardConnectSourceId = '';
        this._setSaveState('saved');
        this.render();
        const backup = result.backupFileName ? `；导入前备份：${result.backupFileName}` : '';
        this.notify(`已合并 ${result.totalChanges} 项关系白板差异${backup}`, 'success');
        this._setCanvasAnnouncement(`已从 ${preview.fileName} 合并 ${result.totalChanges} 项差异`);
        return true;
      } catch (error) {
        this.notify(`关系白板导入失败：${error?.message || String(error)}`, 'error');
        return false;
      } finally {
        this.importInFlight = false;
      }
    }

    _openImportPreviewDialog(preview) {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'relationship-dialog-overlay';
        const countItems = [
          ['新增节点', preview.counts?.addedEntities || 0],
          ['更新节点', preview.counts?.updatedEntities || 0],
          ['新增关系', preview.counts?.addedRelationships || 0],
          ['更新关系', preview.counts?.updatedRelationships || 0],
          ['新增白板', preview.counts?.addedBoards || 0],
          ['补充布局', preview.counts?.updatedBoards || 0]
        ].filter(([, count]) => count > 0);
        const kindLabels = { entity: '节点', relationship: '关系', board: '白板' };
        const actionLabels = { add: '新增', update: '更新' };
        const fieldLabels = {
          name: '名称',
          details: '详情',
          source: '来源',
          verifiedAt: '验证时间',
          reviewIntervalDays: '复核周期',
          evidenceSummary: '证据摘要',
          placements: '布局节点'
        };
        const changes = Array.isArray(preview.changes) ? preview.changes : [];
        const isCoolify = preview.sourceKind === 'coolify';
        const observationLabels = {
          servers: '服务器',
          deployments: '部署资源',
          endpoints: '公开端点',
          matchedRepositories: '已匹配仓库',
          unmatchedRepositories: '未匹配仓库'
        };
        const observations = preview.observations && typeof preview.observations === 'object'
          ? Object.entries(preview.observations).filter(([, count]) => Number(count) > 0)
          : [];
        const warnings = Array.isArray(preview.warnings) ? preview.warnings : [];
        const unmatchedRepositories = Array.isArray(preview.unmatchedRepositories) ? preview.unmatchedRepositories : [];
        const sourceCaption = isCoolify
          ? escapeHtml(`${preview.sourceLabel || 'Coolify'} · 本次只读快照`)
          : `${escapeHtml(preview.fileName)} · ${Math.max(1, Math.ceil(Number(preview.fileSize || 0) / 1024))} KB`;
        const applyGuard = isCoolify
          ? '应用时若本机白板发生变化或预览过期会拒绝操作，并先创建同步前备份。'
          : '应用时若本机白板或源文件发生变化会拒绝操作，并先创建导入前备份。';
        overlay.innerHTML = `
          <form class="relationship-dialog relationship-import-dialog" role="dialog" aria-modal="true" aria-labelledby="relationship-import-title" aria-describedby="relationship-import-boundary">
            <header><div><h3 id="relationship-import-title">${isCoolify ? '确认同步 Coolify 关系' : '确认导入关系事实'}</h3><small>${sourceCaption}</small></div><button type="button" data-dialog-cancel aria-label="关闭">×</button></header>
            <div class="relationship-dialog-body">
              ${observations.length ? `<section class="relationship-import-observations" aria-label="只读观测摘要">${observations.map(([key, count]) => `<span><strong>${Number(count)}</strong>${escapeHtml(observationLabels[key] || key)}</span>`).join('')}</section>` : ''}
              <div class="relationship-import-counts">${countItems.map(([label, count]) => `<div><strong>${count}</strong><span>${label}</span></div>`).join('')}</div>
              <div class="relationship-import-change-list" aria-label="导入差异">${changes.map(change => `
                <article>
                  <span data-action="${escapeHtml(change.action)}">${escapeHtml(actionLabels[change.action] || change.action)}</span>
                  <div><strong>${escapeHtml(change.label)}</strong><small>${escapeHtml(kindLabels[change.kind] || change.kind)} · ${escapeHtml(change.detail || '')}${change.fields?.length ? ` · ${escapeHtml(change.fields.map(field => fieldLabels[field] || field).join('、'))}` : ''}</small></div>
                </article>`).join('')}${preview.truncatedChanges ? `<p>另有 ${Number(preview.truncatedChanges)} 项差异未展开显示。</p>` : ''}</div>
              ${warnings.length ? `<div class="relationship-import-warnings" role="note">${warnings.map(warning => `<p>${escapeHtml(warning)}</p>`).join('')}${unmatchedRepositories.length ? `<small>${escapeHtml(unmatchedRepositories.join('、'))}</small>` : ''}</div>` : ''}
              <p id="relationship-import-boundary" class="relationship-import-boundary">${escapeHtml(preview.boundary)} 确认前不会写入；${applyGuard}</p>
            </div>
            <footer><button class="btn" type="button" data-dialog-cancel>取消</button><button class="btn btn-primary" type="submit">确认合并 ${Number(preview.totalChanges || 0)} 项</button></footer>
          </form>`;
        const finish = value => {
          document.removeEventListener('keydown', escapeListener, true);
          overlay.remove();
          resolve(value);
        };
        const escapeListener = event => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        };
        overlay.addEventListener('click', event => {
          if (event.target.closest('[data-dialog-cancel]')) finish(false);
        });
        overlay.querySelector('form').addEventListener('submit', event => {
          event.preventDefault();
          finish(true);
        });
        document.body.appendChild(overlay);
        document.addEventListener('keydown', escapeListener, true);
        requestAnimationFrame(() => overlay.querySelector('[type="submit"]')?.focus());
      });
    }

    _setCanvasAnnouncement(message) {
      const help = this.root?.querySelector('.relationship-canvas-help');
      if (help) help.textContent = message;
    }

    _openFormDialog(options) {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'relationship-dialog-overlay';
        const fieldHtml = options.fields.map(field => `
          <label class="relationship-dialog-field">
            <span>${escapeHtml(field.label)}</span>
            ${field.options ? `<select name="${escapeHtml(field.key)}">${field.options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === field.value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`
              : field.multiline ? `<textarea name="${escapeHtml(field.key)}" rows="5" maxlength="${field.maxLength || 10000}">${escapeHtml(field.value || '')}</textarea>`
              : `<input name="${escapeHtml(field.key)}" type="${field.type || 'text'}" ${field.min != null ? `min="${field.min}" max="${field.max}"` : ''} value="${escapeHtml(field.value || '')}" placeholder="${escapeHtml(field.placeholder || '')}" maxlength="${field.maxLength || 240}" ${field.required ? 'required' : ''} autocomplete="off">`}
          </label>`).join('');
        overlay.innerHTML = `
          <form class="relationship-dialog" role="dialog" aria-modal="true" aria-labelledby="relationship-dialog-title">
            <header><h3 id="relationship-dialog-title">${escapeHtml(options.title)}</h3><button type="button" data-dialog-cancel aria-label="关闭">×</button></header>
            <div class="relationship-dialog-body">${fieldHtml}<p>仅编辑白板内容，不修改 Git 仓库或部署服务。</p></div>
            <footer><button class="btn" type="button" data-dialog-cancel>取消</button><button class="btn btn-primary" type="submit">${escapeHtml(options.submitLabel || '保存')}</button></footer>
          </form>`;
        const finish = value => {
          document.removeEventListener('keydown', escapeListener, true);
          overlay.remove();
          resolve(value);
        };
        const escapeListener = event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finish(null);
          }
        };
        overlay.addEventListener('click', event => {
          if (event.target.closest('[data-dialog-cancel]')) finish(null);
        });
        overlay.querySelector('form').addEventListener('submit', event => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const values = {};
          for (const field of options.fields) {
            const value = field.multiline ? String(data.get(field.key) || '').slice(0, field.maxLength || 10000) : Model.cleanText(data.get(field.key), field.maxLength || 240);
            if (field.required && !value) return;
            values[field.key] = value;
          }
          finish(values);
        });
        document.body.appendChild(overlay);
        document.addEventListener('keydown', escapeListener, true);
        requestAnimationFrame(() => overlay.querySelector('input')?.focus());
      });
    }
  }

  return Object.freeze({
    Controller,
    normalizeDynamicLayoutStore,
    edgePanVelocity,
    resolveMagneticSnap,
    TYPE_LABELS,
    RESOURCE_CATEGORY_DEFINITIONS,
    RELATIONSHIP_LABELS,
    NODE_WIDTH,
    NODE_HEIGHT,
    COMPACT_NODE_WIDTH,
    COMPACT_NODE_HEIGHT
  });
});
