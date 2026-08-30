(function exposeRelationshipBoardController(root, factory) {
  const projection = root?.PanelTopologyProjection
    || (typeof module !== 'undefined' && module.exports ? require('../../shared/panelTopologyProjection') : null);
  const api = factory(root?.RelationshipGraphModel, projection);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipBoardController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipBoardController(Model, PanelTopologyProjection) {
  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 142;
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
  const TYPE_LABELS = Object.freeze({
    server: '服务器',
    deployment: '部署',
    project: '项目',
    repository: 'Git 仓库',
    endpoint: '访问端点',
    group: '分组'
  });
  const TYPE_ICONS = Object.freeze({
    server: '▰',
    deployment: '◆',
    project: '▣',
    repository: '⑂',
    endpoint: '↗',
    group: '▢'
  });
  const RESOURCE_CATEGORY_DEFINITIONS = Object.freeze([
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
      ...(todos.length ? { todos } : {})
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

  function normalizedResourcePath(value, platform = '') {
    let normalized = String(value || '').trim().replaceAll('\\', '/');
    const unc = normalized.startsWith('//');
    normalized = normalized.replace(/\/{2,}/g, '/');
    if (unc) normalized = `/${normalized}`;
    if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
    if (platform === 'win32' || /^[a-z]:\//i.test(normalized)) normalized = normalized.toLocaleLowerCase('en-US');
    return normalized;
  }

  function resourcePathIsWithin(candidatePath, rootPath, platform = '') {
    const candidate = normalizedResourcePath(candidatePath, platform);
    const root = normalizedResourcePath(rootPath, platform);
    return Boolean(candidate && root && (
      candidate === root
      || (root === '/' ? candidate.startsWith('/') : candidate.startsWith(`${root}/`))
    ));
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
      this.inspectorPinned = false;
      this.keyboardConnectSourceId = '';
      this.pointerAction = null;
      this.suppressNextNodeClick = false;
      this.saveTimer = null;
      this.saveChain = Promise.resolve();
      this.saveState = 'saved';
      this.resourceSearch = '';
      this.resourceScope = 'resources';
      this.resourcePanelVisible = true;
      this.resourcePanelPosition = { x: 12, y: 12 };
      this.directories = [];
      this.collapsedResourceSections = new Set(['repository', 'server', 'deployment', 'endpoint', 'other']);
      this.importInFlight = false;
      this.exportInFlight = false;
      this.panelTopologyResult = { state: 'unconfigured', topology: { servers: [], deployments: [] }, bindings: [] };
      this.panelProjection = { entities: [], relationships: [], placements: [], metadata: { state: 'unconfigured' } };
      this.panelProjects = [];
      this.panelRepositories = [];
      this.panelRefreshTimer = null;
      this.panelRefreshInFlight = false;
      this.panelLastError = '';
      this.dynamicLayoutStore = { version: 1, boards: {} };
      this.dynamicLayoutSaveTimer = null;
      this.reminderTimer = null;
      this.remindedTodoKeys = new Set();
      this.openRequestId = 0;
      this.now = options.now || (() => new Date());
      this._boundKeydown = event => this._handleKeydown(event);
      this._boundResize = () => this._applyResourcePanelPosition();
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
            view: Model.defaultBoardView(),
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
      this.openRequestId += 1;
      document.removeEventListener('keydown', this._boundKeydown, true);
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
        this.bridge.config?.getTreeRoots
          ? this.bridge.config.getTreeRoots().catch(() => [])
          : Promise.resolve([]),
        this.bridge.config?.get
          ? this.bridge.config.get('relationshipDynamicLayouts').catch(() => null)
          : Promise.resolve(null)
      ]).then(([result, registry, treeRoots, dynamicLayouts]) => {
        this.store = Model.normalizeStore(result?.store).value;
        this.dynamicLayoutStore = normalizeDynamicLayoutStore(dynamicLayouts);
        this.panelRepositories = Array.isArray(registry?.repos) ? registry.repos : [];
        this._setDirectories(treeRoots);
        this._setResources([], this.panelRepositories);
        this._setPanelTopology(this.panelTopologyResult);
        this.loaded = true;
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
      const boardLayout = this._dynamicLayoutForActiveBoard();
      if (!boardLayout || !this.panelProjection?.placements) return;
      this.panelProjection.placements = this.panelProjection.placements.map(placement => {
        const override = boardLayout[placement.entityId];
        return override ? {
          ...placement,
          x: override.x,
          y: override.y,
          ...normalizePlacementAnnotations(override),
          userPositioned: true
        } : placement;
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
      const boardLayout = this._dynamicLayoutForActiveBoard();
      if (!boardLayout) return false;
      let changed = false;
      const ids = new Set(entityIds || []);
      for (const placement of this.panelProjection?.placements || []) {
        if (!placement.dynamic || !ids.has(placement.entityId)) continue;
        boardLayout[placement.entityId] = {
          x: Math.round(placement.x),
          y: Math.round(placement.y),
          ...normalizePlacementAnnotations(placement)
        };
        placement.userPositioned = true;
        changed = true;
      }
      if (changed) this._persistDynamicLayoutsSoon();
      return changed;
    }

    _resetDynamicLayout() {
      const boardId = activeBoard(this.store)?.id;
      if (!boardId || !this.dynamicLayoutStore?.boards?.[boardId]) return false;
      const annotations = Object.fromEntries(Object.entries(this.dynamicLayoutStore.boards[boardId])
        .map(([entityId, placement]) => [entityId, normalizePlacementAnnotations(placement)])
        .filter(([, value]) => Object.keys(value).length));
      delete this.dynamicLayoutStore.boards[boardId];
      this._setPanelTopology(this.panelTopologyResult);
      const boardLayout = this._dynamicLayoutForActiveBoard();
      for (const placement of this.panelProjection?.placements || []) {
        if (!annotations[placement.entityId]) continue;
        boardLayout[placement.entityId] = {
          x: Math.round(placement.x),
          y: Math.round(placement.y),
          ...annotations[placement.entityId]
        };
      }
      this._applyDynamicLayoutOverrides();
      this._persistDynamicLayoutsSoon(0);
      this._renderGraph();
      this.fitContent({ minZoom: 1 });
      this.notify('已恢复 Coolify 自动布局', 'success');
      return true;
    }

    _arrangeByCategory() {
      const board = activeBoard(this.store);
      const arrange = PanelTopologyProjection?.arrangeTopologyLanes;
      if (!board || typeof arrange !== 'function') return false;
      const entitiesById = this._allEntitiesById();
      const placements = this._combinedPlacements(board)
        .filter(placement => entitiesById.get(placement.entityId)?.type !== 'group');
      if (!placements.length) return false;
      const persistentIds = new Set(board.placements
        .filter(placement => entitiesById.get(placement.entityId)?.type !== 'group')
        .map(placement => placement.entityId));
      if (persistentIds.size) this._recordMutation();
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
      if (persistentIds.size) this._persistSoon(0);
      const dynamicIds = placements.filter(placement => placement.dynamic).map(placement => placement.entityId);
      if (dynamicIds.length) this._saveDynamicPlacementOverrides(dynamicIds);
      this._renderGraph();
      this.fitContent({ minZoom: 1 });
      this._refreshHistoryButtons();
      this.notify('已按项目、仓库、部署、主机和访问点分列', 'success');
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
      const bindings = Array.isArray(result.bindings) && result.bindings.length
        ? result.bindings
        : (sameProvider ? (this.panelTopologyResult?.bindings || []) : []);
      this.panelTopologyResult = { ...result, bindings };
      const providerErrors = Array.isArray(result.errors) ? result.errors.filter(entry => entry?.message) : [];
      this.panelLastError = providerErrors.length
        ? `${providerErrors.length} 个 Coolify 同步失败：${providerErrors[0].message}`
        : (result.state === 'error' ? String(result.error || 'Coolify 同步失败') : '');
      this.panelProjection = PanelTopologyProjection?.buildProjection?.({
        ...this.panelTopologyResult,
        projects: this.panelProjects,
        repositories: this.panelRepositories,
        existingEntities: this.store?.entities || [],
        layout: {
          ...this._nodeDimensions(),
          horizontalSpacing: this._displayViewSettings().horizontalSpacing,
          verticalSpacing: this._displayViewSettings().verticalSpacing
        }
      }) || { entities: [], relationships: [], placements: [], metadata: { state: result.state || 'unconfigured' } };
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
      if (this.panelRefreshInFlight || !this.bridge?.panel?.getTopology) return false;
      this.panelRefreshInFlight = true;
      this._updatePanelStatus();
      try {
        const result = await this._topologyWithProjectBindings(await this.bridge.panel.getTopology());
        this._setPanelTopology(result);
        if (this.root?.isConnected) {
          this._renderResources();
          this._renderGraph();
          this._updateFilterSummary();
          this._updateSummary();
          this._updatePanelStatus();
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

    _setDirectories(treeRoots) {
      const seen = new Set();
      this.directories = (Array.isArray(treeRoots) ? treeRoots : []).flatMap(root => {
        const path = String(root?.path || '').trim();
        const key = normalizedResourcePath(path, this.bridge?.platform);
        if (!path || !key || seen.has(key)) return [];
        seen.add(key);
        const fallbackName = path.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).at(-1) || path;
        return [{ key, path, name: String(root?.name || fallbackName) }];
      });
      this.directories.slice(1).forEach(directory => this.collapsedResourceSections.add(`directory:${directory.key}`));
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
      const entitiesByReference = new Map(entities
        .filter(entity => entity?.refId)
        .map(entity => [`${entity.type}:${entity.refId}`, entity]));
      const catalog = this.resources.map(resource => {
        const entity = entitiesByReference.get(`${resource.kind}:${resource.refId}`);
        return {
          ...resource,
          category: this._resourceCategory(resource),
          ...(entity ? { entityId: entity.id, transient: entity.transient === true, placed: placedIds.has(entity.id) } : {})
        };
      });
      const existingKeys = new Set(catalog.map(resource => resource.key));
      for (const entity of entities) {
        if (!['server', 'deployment', 'endpoint'].includes(entity.type)) continue;
        const key = `entity:${entity.id}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
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
      return catalog.sort((left, right) => {
        const categoryOrder = RESOURCE_CATEGORY_DEFINITIONS.findIndex(category => category.id === left.category)
          - RESOURCE_CATEGORY_DEFINITIONS.findIndex(category => category.id === right.category);
        return categoryOrder || left.name.localeCompare(right.name, 'zh-CN');
      });
    }

    _resourceSections(scope = this.resourceScope, catalog = this._resourceCatalog()) {
      if (scope !== 'directories') {
        return RESOURCE_CATEGORY_DEFINITIONS.map(category => ({
          ...category,
          key: category.id,
          items: catalog.filter(resource => resource.category === category.id)
        }));
      }
      const pathResources = catalog.filter(resource => resource.path);
      const sections = this.directories.map(directory => ({
        id: `directory:${directory.key}`,
        key: `directory:${directory.key}`,
        label: directory.name,
        secondary: directory.path,
        icon: '▰',
        directory,
        items: []
      }));
      const unassigned = [];
      for (const resource of pathResources) {
        const matches = sections.filter(section => resourcePathIsWithin(resource.path, section.directory.path, this.bridge?.platform));
        const target = matches.sort((left, right) => right.directory.path.length - left.directory.path.length)[0];
        if (target) target.items.push(resource); else unassigned.push(resource);
      }
      if (unassigned.length) {
        sections.push({ id: 'directory:other', key: 'directory:other', label: '其他位置', icon: '▰', items: unassigned });
      }
      return sections.filter(section => section.items.length);
    }

    _combinedEntities() {
      const entities = [...(this.store?.entities || [])];
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
            ...normalizePlacementAnnotations(placement)
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
        const { mode, projection, snapMode } = this._boardView();
        board.view = {
          ...Model.defaultBoardView(),
          ...this._displayViewSettings(),
          mode,
          projection: projection || 'facts',
          snapMode
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
        width: Math.round(dimensions.width * display.cardScale),
        height: Math.round(dimensions.height * display.cardScale)
      };
    }

    _expandedNodeHeight(placement) {
      const { height } = this._nodeDimensions();
      const annotations = normalizePlacementAnnotations(placement || {});
      const todoCount = Math.min(4, (annotations.todos || []).length);
      const noteHeight = annotations.note ? 42 : 0;
      return height + Math.round((110 + todoCount * 42 + noteHeight) * this._displayViewSettings().cardScale);
    }

    _displayGeometryMap(placements = []) {
      const entitiesById = this._allEntitiesById();
      const { width, height } = this._nodeDimensions();
      const gap = Math.max(18, Math.round(24 * this._displayViewSettings().cardScale));
      const regular = placements
        .filter(placement => entitiesById.get(placement.entityId)?.type !== 'group')
        .slice()
        .sort((left, right) => left.y - right.y || left.x - right.x);
      const resolved = [];
      const geometryById = new Map();
      for (const placement of regular) {
        let y = placement.y;
        const expanded = this.expandedCardIds.has(placement.entityId);
        const cardHeight = expanded ? this._expandedNodeHeight(placement) : height;
        for (const previous of resolved) {
          const horizontalOverlap = placement.x < previous.x + width + gap
            && placement.x + width + gap > previous.x;
          const originallyBelow = placement.y >= previous.originalY + height * 0.45;
          if (horizontalOverlap && originallyBelow) y = Math.max(y, previous.y + previous.height + gap);
        }
        const geometry = { x: placement.x, y, width, height: cardHeight, originalY: placement.y };
        resolved.push(geometry);
        geometryById.set(placement.entityId, geometry);
      }
      return geometryById;
    }

    _placementGeometry(placement, placements = this._combinedPlacements()) {
      const entitiesById = this._allEntitiesById();
      const entity = entitiesById.get(placement?.entityId);
      if (entity?.type !== 'group') {
        const { width, height } = this._nodeDimensions();
        return { x: placement.x, y: placement.y, width, height };
      }
      const { width: nodeWidth, height: nodeHeight } = this._nodeDimensions();
      const members = placements.filter(item => item.groupId === entity.id && entitiesById.get(item.entityId)?.type !== 'group');
      if (!members.length) {
        return { x: placement.x, y: placement.y, width: GROUP_MIN_WIDTH, height: GROUP_MIN_HEIGHT };
      }
      const minX = Math.min(...members.map(item => item.x));
      const minY = Math.min(...members.map(item => item.y));
      const maxX = Math.max(...members.map(item => item.x + nodeWidth));
      const maxY = Math.max(...members.map(item => item.y + nodeHeight));
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
      const groupIds = [...movingIds].filter(id => (
        this.store.entities.find(entity => entity.id === id)?.type === 'group'
      ));
      for (const groupId of groupIds) {
        for (const placement of placements) {
          if (placement.groupId === groupId) movingIds.add(placement.entityId);
        }
      }
      return [...movingIds].filter(id => placedIds.has(id));
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
          <header class="relationship-toolbar">
            <div class="relationship-board-control">
              <label class="sr-only" for="relationship-board-select">当前白板</label>
              <select id="relationship-board-select" title="切换白板">${boardOptions}</select>
              <button class="relationship-tool-button" data-relationship-action="new-board" type="button" title="新建白板" aria-label="新建白板">＋</button>
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
            </div>
            <div class="relationship-display-host">
              <button class="relationship-tool-button relationship-display-trigger" data-relationship-action="toggle-display-menu" type="button" aria-haspopup="dialog" aria-expanded="false">
                <span aria-hidden="true">◐</span><span>显示</span><span aria-hidden="true">⌄</span>
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
                  <label class="relationship-display-slider">
                    <span><b>横向间距</b><output data-display-horizontal-spacing>${Math.round(displayView.horizontalSpacing)} px</output></span>
                    <input name="horizontalSpacing" type="range" min="16" max="180" step="4" value="${displayView.horizontalSpacing}" aria-label="卡片横向间距">
                  </label>
                  <label class="relationship-display-slider">
                    <span><b>纵向间距</b><output data-display-vertical-spacing>${Math.round(displayView.verticalSpacing)} px</output></span>
                    <input name="verticalSpacing" type="range" min="16" max="140" step="4" value="${displayView.verticalSpacing}" aria-label="卡片纵向间距">
                  </label>
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
            <button class="relationship-tool-button" data-relationship-action="toggle-all-card-details" type="button" aria-pressed="false" title="展开或收起当前白板的全部卡片详情">展开全部</button>
            <div class="relationship-filter-host">
              <button class="relationship-tool-button relationship-filter-trigger" data-relationship-action="toggle-filter-menu" type="button" aria-haspopup="dialog" aria-expanded="false">
                <span aria-hidden="true">⌕</span><span>筛选</span><span class="relationship-filter-count" hidden></span><span aria-hidden="true">⌄</span>
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
              <button class="relationship-tool-button relationship-add-trigger" data-relationship-action="toggle-add-menu" type="button" aria-haspopup="menu" aria-expanded="false">
                添加节点 <span aria-hidden="true">⌄</span>
              </button>
              <div class="relationship-add-menu" role="menu" hidden>
                <button type="button" role="menuitem" data-add-node-type="server"><span>▰</span><span>服务器</span><small>不保存登录凭据</small></button>
                <button type="button" role="menuitem" data-add-node-type="deployment"><span>◆</span><span>部署</span><small>环境与状态</small></button>
                <button type="button" role="menuitem" data-add-node-type="endpoint"><span>↗</span><span>访问端点</span><small>仅显示标签</small></button>
                <button type="button" role="menuitem" data-add-node-type="group"><span>▢</span><span>分组</span><small>视觉整理</small></button>
                <div class="relationship-menu-separator" role="separator"></div>
                <button type="button" role="menuitem" data-relationship-action="export-json"><span>⇧</span><span>导出当前白板…</span><small>可移植关系快照</small></button>
                <button type="button" role="menuitem" data-relationship-action="import-json"><span>⇩</span><span>导入白板文件…</span><small>先预览差异再合并</small></button>
              </div>
            </div>
            <span class="relationship-toolbar-divider" aria-hidden="true"></span>
            <button class="relationship-tool-button" data-relationship-action="undo" type="button" title="撤销 (⌘Z)" ${this.undoStack.length ? '' : 'disabled'}>↶</button>
            <button class="relationship-tool-button" data-relationship-action="redo" type="button" title="重做 (⇧⌘Z)" ${this.redoStack.length ? '' : 'disabled'}>↷</button>
            <button class="relationship-tool-button" data-relationship-action="fit" type="button" title="适合内容">适合</button>
            <button class="relationship-tool-button" data-relationship-action="reset-dynamic-layout" type="button" title="恢复 Coolify 自动布局">自动整理</button>
            <button class="relationship-tool-button" data-relationship-action="arrange-by-category" type="button" title="将项目、仓库、部署、主机和访问点分别排列成列">按类别分列</button>
            <span class="relationship-save-state" data-state="${this.saveState}" role="status">${this._saveLabel()}</span>
          </header>
          <div class="relationship-body">
            <aside class="relationship-resource-panel" id="relationship-resource-panel" aria-label="白板目录与资源库" style="--relationship-resource-x:${this.resourcePanelPosition.x}px;--relationship-resource-y:${this.resourcePanelPosition.y}px;" ${this.resourcePanelVisible ? '' : 'hidden'}>
              <div class="relationship-resource-heading relationship-resource-drag-handle" data-resource-panel-handle title="拖动资源库">
                <div><strong>资源库</strong><small>浏览并拖入白板</small></div>
                <div class="relationship-resource-heading-actions">
                  <span data-resource-total>${this._resourceCatalog().length}</span>
                  <button class="relationship-resource-close" data-relationship-action="close-resource-panel" type="button" aria-label="关闭资源库" title="关闭资源库">×</button>
                </div>
              </div>
              <div class="relationship-resource-scope" role="tablist" aria-label="资源库范围">
                <button type="button" role="tab" data-resource-scope="directories" aria-selected="${this.resourceScope === 'directories'}">目录</button>
                <button type="button" role="tab" data-resource-scope="resources" aria-selected="${this.resourceScope === 'resources'}">资源</button>
              </div>
              <label class="relationship-resource-search">
                <span aria-hidden="true">⌕</span>
                <input type="search" placeholder="筛选目录或资源" value="${escapeHtml(this.resourceSearch)}" aria-label="筛选目录或资源">
              </label>
              <div class="relationship-resource-list"></div>
              <div class="relationship-boundary-note">本机目录只用于定位；云端资源使用稳定身份。不会部署、连接服务器或修改 Git。</div>
            </aside>
            <div class="relationship-canvas" tabindex="0" aria-label="关系画布。拖动空白区域平移，滚轮缩放，方向键移动选中节点。">
              <div class="relationship-world">
                <svg class="relationship-edge-layer" aria-label="节点关系"></svg>
                <div class="relationship-guide-layer" aria-hidden="true"></div>
                <div class="relationship-node-layer"></div>
                <div class="relationship-selection-box" hidden></div>
              </div>
              <div class="relationship-canvas-help">拖动卡片任意空白处 · Shift 拖框选择 · 按住 Option/Alt 临时关闭吸附 · 从右侧连接点连线</div>
              <div class="relationship-projection-note" hidden>部署摘要 · 派生显示，不修改关系事实</div>
            </div>
            <aside class="relationship-inspector-panel" aria-label="关系详情" hidden></aside>
          </div>
        </section>`;
      this.root = this.container.querySelector('.relationship-workspace');
      this._bindRootEvents();
      this._applyViewMode();
      this._renderResources();
      this._renderGraph();
      this._updateFilterSummary();
      this._updateSummary();
      this._updatePanelStatus();
      this._applyResourcePanelPosition();
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

    _syncResourcePanelVisibility() {
      const panel = this.root?.querySelector('.relationship-resource-panel');
      const trigger = this.root?.querySelector('.relationship-resource-trigger');
      if (panel) panel.hidden = !this.resourcePanelVisible;
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
      this.root.addEventListener('click', event => this._handleClick(event));
      this.root.addEventListener('change', event => this._handleChange(event));
      this.root.addEventListener('input', event => this._handleInput(event));
      this.root.addEventListener('submit', event => this._handleSubmit(event));
      this.root.addEventListener('dragstart', event => this._handleDragStart(event));
      this.root.addEventListener('dragover', event => this._handleDragOver(event));
      this.root.addEventListener('drop', event => this._handleDrop(event));
      this.root.addEventListener('pointerdown', event => this._handlePointerDown(event));
      this.root.addEventListener('pointermove', event => this._handlePointerMove(event));
      this.root.addEventListener('pointerup', event => this._handlePointerUp(event));
      this.root.addEventListener('pointercancel', () => this._cancelPointerAction(false));
      this.root.querySelector('.relationship-canvas')?.addEventListener('wheel', event => this._handleWheel(event), { passive: false });
    }

    _handleClick(event) {
      const action = event.target.closest('[data-relationship-action]')?.dataset.relationshipAction;
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
        const { mode, projection, snapMode } = this._boardView();
        board.view = {
          ...Model.defaultBoardView(),
          ...this._displayViewSettings(),
          mode,
          projection: projection || 'facts',
          snapMode
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
        this.resourcePanelVisible = !this.resourcePanelVisible;
        this._syncResourcePanelVisibility();
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

      const resourceScope = event.target.closest('[data-resource-scope]')?.dataset.resourceScope;
      if (['directories', 'resources'].includes(resourceScope)) {
        this.resourceScope = resourceScope;
        this._renderResources();
        return;
      }

      const resourceSection = event.target.closest('[data-resource-section-toggle]')?.dataset.resourceSectionToggle;
      if (resourceSection) {
        if (this.collapsedResourceSections.has(resourceSection)) this.collapsedResourceSections.delete(resourceSection);
        else this.collapsedResourceSections.add(resourceSection);
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

      const nodeType = event.target.closest('[data-add-node-type]')?.dataset.addNodeType;
      if (nodeType) {
        this.root.querySelector('.relationship-add-menu').hidden = true;
        this.root.querySelector('.relationship-add-trigger').setAttribute('aria-expanded', 'false');
        this._createManualEntity(nodeType);
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
      this.expandedCardIds.clear();
      this.inspectorPinned = false;
      this._clearEntitySelection();
      this.selectedRelationshipId = '';
      this.keyboardConnectSourceId = '';
      this._persistSoon(0);
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
      const popover = this.root?.querySelector('.relationship-display-popover');
      const trigger = this.root?.querySelector('.relationship-display-trigger');
      if (popover) popover.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
    }

    _toggleAllCardDetails() {
      const entitiesById = this._allEntitiesById();
      const visibleIds = this._filteredGraph().placements
        .map(placement => placement.entityId)
        .filter(entityId => entitiesById.get(entityId)?.type !== 'group');
      const allExpanded = visibleIds.length > 0 && visibleIds.every(entityId => this.expandedCardIds.has(entityId));
      if (allExpanded) visibleIds.forEach(entityId => this.expandedCardIds.delete(entityId));
      else visibleIds.forEach(entityId => this.expandedCardIds.add(entityId));
      this._renderGraph();
      this._setCanvasAnnouncement(allExpanded ? '已收起全部卡片详情' : '已展开全部卡片详情');
    }

    _syncExpandAllButton(visibleIds = []) {
      const button = this.root?.querySelector('[data-relationship-action="toggle-all-card-details"]');
      if (!button) return;
      const allExpanded = visibleIds.length > 0 && visibleIds.every(entityId => this.expandedCardIds.has(entityId));
      button.textContent = allExpanded ? '收起全部' : '展开全部';
      button.setAttribute('aria-pressed', String(allExpanded));
      button.disabled = visibleIds.length === 0;
    }

    _syncDisplayForm() {
      const form = this.root?.querySelector('[data-relationship-display-form]');
      if (!form) return;
      const display = this._displayViewSettings();
      form.elements.namedItem('mode').value = display.mode;
      form.elements.namedItem('cardScale').value = String(display.cardScale);
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
      board.view = {
        ...this._boardView(),
        mode: String(data.get('mode') || 'full') === 'compact' ? 'compact' : 'full',
        cardScale: Number.isFinite(cardScale) ? Math.min(1.4, Math.max(0.8, cardScale)) : 1,
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
      this._applyViewMode();
      this._syncDisplayForm();
      this._setPanelTopology(this.panelTopologyResult);
      this._persistSoon(160);
      this._renderGraph();
      this._updateSummary();
    }

    _resetDisplaySettings() {
      const board = activeBoard(this.store);
      if (!board) return;
      const defaults = Model.defaultBoardView();
      board.view = {
        ...this._boardView(),
        ...this._displayViewSettings(defaults)
      };
      this._applyViewMode();
      this._syncDisplayForm();
      this._persistSoon(0);
      this._renderGraph();
      this._updateSummary();
      this._setCanvasAnnouncement('已恢复当前白板的默认显示');
    }

    _updateBoardViewFromForm(form) {
      const board = activeBoard(this.store);
      if (!board) return;
      const data = new FormData(form);
      board.view = {
        ...Model.defaultBoardView(),
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
      const item = event.target.closest('[data-resource-key]');
      if (!item) return;
      const key = item.dataset.resourceKey;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/x-gitfinder-relationship-resource', key);
      event.dataTransfer.setData('text/plain', key);
    }

    _handleDragOver(event) {
      if (!event.target.closest('.relationship-canvas')) return;
      if (!event.dataTransfer.types.includes('application/x-gitfinder-relationship-resource')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }

    _handleDrop(event) {
      const canvas = event.target.closest('.relationship-canvas');
      if (!canvas) return;
      const key = event.dataTransfer.getData('application/x-gitfinder-relationship-resource');
      const resource = this.resourceMap.get(key);
      if (!resource) return;
      event.preventDefault();
      this._addResource(resource, this._clientToWorld(event.clientX, event.clientY));
    }

    _renderResources() {
      const list = this.root?.querySelector('.relationship-resource-list');
      if (!list) return;
      const query = this.resourceSearch.trim().toLocaleLowerCase('zh-CN');
      const catalog = this._resourceCatalog();
      this.resourceMap = new Map(catalog.map(resource => [resource.key, resource]));
      const total = this.root?.querySelector('[data-resource-total]');
      if (total) total.textContent = String(catalog.length);
      this.root?.querySelectorAll('[data-resource-scope]').forEach(button => {
        button.setAttribute('aria-selected', String(button.dataset.resourceScope === this.resourceScope));
      });
      const filtered = catalog.filter(resource => !query
        || `${resource.name} ${resource.path} ${resource.secondary}`.toLocaleLowerCase('zh-CN').includes(query));
      const sections = this._resourceSections(this.resourceScope, filtered)
        .filter(section => !query || section.items.length);
      if (!sections.length || (query && !filtered.length)) {
        list.innerHTML = '<div class="relationship-resource-empty">没有匹配的目录或资源</div>';
        return;
      }
      const itemMarkup = resource => {
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
          <section class="relationship-resource-section" data-resource-section="${escapeHtml(section.key)}">
            <button class="relationship-resource-section-trigger" type="button" data-resource-section-toggle="${escapeHtml(section.key)}" aria-expanded="${!collapsed}">
              <span class="relationship-resource-section-disclosure" aria-hidden="true">⌄</span>
              <span class="relationship-resource-section-icon" aria-hidden="true">${section.icon}</span>
              <span class="relationship-resource-section-copy"><strong>${escapeHtml(section.label)}</strong>${section.secondary ? `<small title="${escapeHtml(section.secondary)}">${escapeHtml(section.secondary)}</small>` : ''}</span>
              <span class="relationship-resource-section-count">${section.items.length}</span>
            </button>
            <div class="relationship-resource-section-items"${collapsed ? ' hidden' : ''}>${section.items.length
              ? section.items.map(itemMarkup).join('')
              : '<div class="relationship-resource-section-empty">暂无资源</div>'}</div>
          </section>`;
      }).join('');
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
        const latency = entity.runtime.latencyMs === null ? '延迟未知' : `${entity.runtime.latencyMs} ms`;
        return `${protocol} · ${latency}`;
      }
      return fallback;
    }

    _cardTodoMeta(todo) {
      const parts = [];
      if (todo.dueAt) parts.push(`截止 ${this._relativeTime(todo.dueAt)}`);
      if (todo.reminderAt) parts.push(`提醒 ${this._relativeTime(todo.reminderAt)}`);
      return parts.join(' · ') || (todo.completed ? '已完成' : '未设置日期');
    }

    _cardDetailHtml(entity, placement, runtimeStatusView) {
      if (!this.expandedCardIds.has(entity.id)) return '';
      const annotations = normalizePlacementAnnotations(placement);
      const todos = (annotations.todos || []).slice(0, 4);
      const facts = [
        ['状态', runtimeStatusView?.label || (this._entityRuntimeTone(entity) === 'normal' ? '正常' : '无动态状态')],
        ['环境', entity.details?.environment],
        ['版本', entity.details?.version || entity.details?.revision],
        ['分支', entity.details?.branch],
        ['延迟', Number.isFinite(entity.runtime?.latencyMs) ? `${entity.runtime.latencyMs} ms` : ''],
        ['更新', entity.runtime?.observedAt ? this._relativeTime(entity.runtime.observedAt) : '']
      ].filter(([, value]) => value);
      return `
        <div class="relationship-card-detail-content" data-card-detail-content>
          ${facts.length ? `<dl class="relationship-card-facts">${facts.slice(0, 4).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`).join('')}</dl>` : ''}
          <section class="relationship-card-todos" aria-label="待办与提醒">
            <header><strong>待办与提醒</strong><span>${todos.length}</span></header>
            ${todos.length ? `<ul>${todos.map(todo => `<li data-state="${todo.completed ? 'completed' : 'open'}"><span class="relationship-card-todo-check" aria-hidden="true"></span><span><b>${escapeHtml(todo.title)}</b><small>${escapeHtml(this._cardTodoMeta(todo))}</small></span></li>`).join('')}</ul>` : '<p>暂无待办</p>'}
          </section>
          ${annotations.note ? `<section class="relationship-card-note"><strong>备注</strong><p>${escapeHtml(annotations.note)}</p></section>` : ''}
        </div>`;
    }

    _renderGraph() {
      const board = activeBoard(this.store);
      const nodeLayer = this.root?.querySelector('.relationship-node-layer');
      if (!board || !nodeLayer) return;
      const graph = this._filteredGraph();
      this.root.dataset.filterActive = String(graph.filterActive);
      const visibleIds = new Set(graph.placements.map(placement => placement.entityId));
      [...this.expandedCardIds].forEach(entityId => {
        if (!visibleIds.has(entityId)) this.expandedCardIds.delete(entityId);
      });
      this._pruneEntitySelection(visibleIds);
      if (this.selectedRelationshipId && !graph.relationships.some(item => item.id === this.selectedRelationshipId)) {
        this.selectedRelationshipId = '';
      }
      const entitiesById = this._allEntitiesById();
      const groupFrames = graph.placements.filter(placement => entitiesById.get(placement.entityId)?.type === 'group');
      const regularNodes = graph.placements.filter(placement => entitiesById.get(placement.entityId)?.type !== 'group');
      const geometryById = this._displayGeometryMap(graph.placements);
      this._syncExpandAllButton(regularNodes.map(placement => placement.entityId));
      nodeLayer.innerHTML = groupFrames.map(placement => {
        const entity = entitiesById.get(placement.entityId);
        const geometry = this._placementGeometry(placement, graph.placements);
        const memberCount = graph.placements.filter(item => item.groupId === entity.id).length;
        const annotations = normalizePlacementAnnotations(placement);
        return `
          <article class="relationship-node relationship-group-frame${graph.filterActive && graph.directIds.has(entity.id) ? ' filter-match' : ''}${graph.contextualIds.has(entity.id) ? ' filter-context' : ''}${graph.mutedIds.has(entity.id) ? ' filter-muted' : ''}" data-entity-id="${escapeHtml(entity.id)}" data-entity-type="group" tabindex="0" role="button" aria-label="${escapeHtml(entity.name)}，视觉分组，${memberCount} 个成员" aria-pressed="false" style="transform:translate(${geometry.x}px,${geometry.y}px);width:${geometry.width}px;height:${geometry.height}px">
            <button class="relationship-card-expand relationship-card-expand-top" data-relationship-card-detail="${escapeHtml(entity.id)}" type="button" aria-label="展开 ${escapeHtml(entity.name)} 详情" title="展开详情">⌄</button>
            <div class="relationship-node-header">
              <span class="relationship-node-icon">${TYPE_ICONS.group}</span>
              <span class="relationship-node-title" title="${escapeHtml(entity.name)}">${escapeHtml(entity.name)}</span>
              <span class="relationship-node-kind">${memberCount} 个成员</span>
            </div>
            <div class="relationship-node-subtitle">${escapeHtml(entity.details?.notes || '视觉整理，不参与事实推理')}</div>
            ${(annotations.labels || []).length ? `<div class="relationship-node-labels">${annotations.labels.slice(0, 3).map((label, index) => `<span data-color-index="${index % 5}">${escapeHtml(label)}</span>`).join('')}</div>` : ''}
            <button class="relationship-card-expand relationship-card-expand-bottom" data-relationship-card-detail="${escapeHtml(entity.id)}" type="button" aria-label="展开 ${escapeHtml(entity.name)} 详情" title="展开详情">⌃</button>
          </article>`;
      }).join('') + regularNodes.map(placement => {
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
            ${this._cardAttentionRailHtml(annotations.todos || [])}
            ${hasInput ? '<button class="relationship-port relationship-port-input" data-direction="in" type="button" tabindex="-1" aria-hidden="true"></button>' : ''}
            <div class="relationship-node-header">
              <span class="relationship-node-icon">${TYPE_ICONS[entity.type]}</span>
              <span class="relationship-node-identity">
                <span class="relationship-node-kind" data-state="${availability.missing ? 'missing' : 'ready'}" title="${escapeHtml(availability.missing ? `${TYPE_LABELS[entity.type]} · ${availability.label}` : TYPE_LABELS[entity.type])}">${availability.missing ? `${TYPE_LABELS[entity.type]} · 缺失` : TYPE_LABELS[entity.type]}</span>
                <strong class="relationship-node-title" title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
              </span>
              ${cardStatusView ? `<span class="relationship-node-runtime-status" data-state="${escapeHtml(cardStatusView.state)}" title="${escapeHtml(runtimeStatusView?.sourceStatus ? `原始状态：${runtimeStatusView.sourceStatus}` : cardStatusView.label)}"><i aria-hidden="true"></i><b>${escapeHtml(cardStatusView.label)}</b></span>` : ''}
              <button class="relationship-card-expand relationship-card-expand-top" data-relationship-card-detail="${escapeHtml(entity.id)}" type="button" aria-expanded="${expanded}" aria-label="${expanded ? '收起' : '展开'} ${escapeHtml(name)} 详情" title="${expanded ? '收起详情' : '展开详情'}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8"></path></svg></button>
            </div>
            <div class="relationship-node-summary">
              <span class="relationship-node-subtitle" title="${escapeHtml(details)}">${escapeHtml(cardSummary)}</span>
              <small>${escapeHtml(this._cardUpdatedLabel(entity))}</small>
            </div>
            <div class="relationship-node-attention-row">
              ${this._cardAttentionChipsHtml(annotations.todos || [])}
              ${(annotations.labels || []).length ? `<div class="relationship-node-labels">${annotations.labels.slice(0, 2).map((label, index) => `<span data-color-index="${index % 5}">${escapeHtml(label)}</span>`).join('')}${annotations.labels.length > 2 ? `<span>+${annotations.labels.length - 2}</span>` : ''}</div>` : ''}
            </div>
            ${this._cardDetailHtml(entity, placement, runtimeStatusView)}
            <button class="relationship-card-expand relationship-card-expand-bottom" data-relationship-card-detail="${escapeHtml(entity.id)}" type="button" aria-expanded="${expanded}" aria-label="${expanded ? '收起' : '展开'} ${escapeHtml(name)} 详情" title="${expanded ? '收起详情' : '展开详情'}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8"></path></svg><b>${expanded ? '收起详情' : '展开详情'}</b></button>
            ${hasOutput ? `<button class="relationship-port relationship-port-output" data-direction="out" type="button" aria-label="从 ${escapeHtml(name)} 开始连接" title="拖到兼容节点建立关系"></button>` : ''}
          </article>`;
      }).join('');

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
          <g class="relationship-edge verification-${verification.state}${filterClass}" data-relationship-id="${escapeHtml(relationship.id)}" data-relationship-type="${relationship.type}" data-verification-state="${verification.state}" aria-label="${escapeHtml(relationshipLabel)}，${verification.label}">
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

    _runtimeInspectorRows(entity) {
      const runtime = entity.runtime || {};
      const rows = [];
      const add = (label, value, title = '') => {
        if (value === null || value === undefined || value === '') return;
        rows.push(`<div><dt>${escapeHtml(label)}</dt><dd${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(value)}</dd></div>`);
      };
      add('当前状态', runtime.status || 'unknown');
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
        add('部署提交', runtime.commit, runtime.commit);
        add('镜像', runtime.imageReference, runtime.imageReference);
      } else if (entity.type === 'endpoint') {
        add('访问地址', runtime.url || entity.details.urlLabel);
        add('访问延迟', runtime.latencyMs === null ? '未知' : `${runtime.latencyMs} ms`);
        add('最后观测', this._relativeTime(runtime.observedAt), runtime.observedAt);
      }
      return rows.join('');
    }

    _inspectorHeaderActions(closeLabel = '关闭关系详情') {
      return `<div class="relationship-inspector-header-actions">
        <button type="button" data-relationship-action="toggle-inspector-pin" aria-pressed="${this.inspectorPinned}" aria-label="${this.inspectorPinned ? '取消固定详情窗口' : '固定详情窗口'}" title="${this.inspectorPinned ? '取消固定' : '固定在白板上'}">⌖</button>
        <button type="button" data-relationship-action="close-inspector" aria-label="${escapeHtml(closeLabel)}" title="关闭详情">×</button>
      </div>`;
    }

    _syncInspectorPinState() {
      const panel = this.root?.querySelector('.relationship-inspector-panel');
      if (!panel) return;
      panel.dataset.pinned = String(this.inspectorPinned);
      const button = panel.querySelector('[data-relationship-action="toggle-inspector-pin"]');
      if (!button) return;
      button.setAttribute('aria-pressed', String(this.inspectorPinned));
      button.setAttribute('aria-label', this.inspectorPinned ? '取消固定详情窗口' : '固定详情窗口');
      button.title = this.inspectorPinned ? '取消固定' : '固定在白板上';
    }

    _renderTransientInspector(selected) {
      const panel = this.root?.querySelector('.relationship-inspector-panel');
      const body = this.root?.querySelector('.relationship-body');
      if (!panel || !body) return;
      const fact = selected.value;
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
        const repositoryIds = Array.isArray(runtime.repositoryIds) ? runtime.repositoryIds : [];
        const missingIds = new Set(runtime.missingRepositoryIds || []);
        const repositoriesHtml = fact.type === 'deployment' ? `
          <div class="relationship-inspector-section-title">本地仓库关联</div>
          <ul class="relationship-panel-repository-list">
            ${repositoryIds.length ? repositoryIds.map(repositoryId => {
              const resource = this.resourceMap.get(`repository:${repositoryId}`);
              return `<li data-state="${missingIds.has(repositoryId) ? 'missing' : 'ready'}">
                <div><strong>${escapeHtml(resource?.name || repositoryId)}</strong><small title="${escapeHtml(resource?.path || '')}">${escapeHtml(resource?.path || '本机尚无该仓库')}</small></div>
                ${resource ? `<button type="button" data-panel-reveal-repository="${escapeHtml(repositoryId)}">定位</button>` : ''}
              </li>`;
            }).join('') : '<li data-state="unlinked"><div><strong>未关联本地仓库</strong><small>请在项目部署关联中选择 repositoryId</small></div></li>'}
          </ul>` : '';
        const externalActions = [
          runtime.panelUrl ? `<button class="relationship-primary-button" type="button" data-panel-open-external="${escapeHtml(runtime.panelUrl)}">打开数据源</button>` : '',
          runtime.coolifyUrl ? `<button class="relationship-secondary-button" type="button" data-panel-open-external="${escapeHtml(runtime.coolifyUrl)}">打开 Coolify</button>` : ''
        ].filter(Boolean).join('');
        content = `
          ${fact.refId ? `<dl class="relationship-inspector-identity"><div><dt>稳定身份</dt><dd title="${escapeHtml(fact.refId)}">${escapeHtml(fact.refId)}</dd></div><div><dt>当前解析位置</dt><dd title="${escapeHtml(localResource?.path || '')}">${escapeHtml(localResource?.path || '本机尚无该资源')}</dd></div></dl>` : `<dl class="relationship-inspector-identity relationship-runtime-facts">${this._runtimeInspectorRows(fact)}</dl>`}
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
      const panel = this.root?.querySelector('.relationship-inspector-panel');
      const body = this.root?.querySelector('.relationship-body');
      if (!panel || !body) return;
      const selectedIds = this._entitySelectionIds();
      if (selectedIds.size > 1) {
        const selectedEntities = this._combinedEntities().filter(entity => selectedIds.has(entity.id));
        const selectedMembers = selectedEntities.filter(entity => entity.type !== 'group');
        const board = activeBoard(this.store);
        const groupOptions = (board?.placements || []).map(placement => (
          this.store.entities.find(entity => entity.id === placement.entityId)
        )).filter(entity => entity?.type === 'group').map(entity => (
          `<option value="${escapeHtml(entity.id)}">${escapeHtml(entity.name)}</option>`
        )).join('');
        const hasGroupedMembers = (board?.placements || []).some(placement => (
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
            <p>可以一起拖动、使用方向键移动，或按 Delete 移出当前白板。</p>
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
      if (fact.transient) {
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
          </label>`}${this._entityDetailFieldsHtml(fact)}`;
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
          if (placement) this._writePlacementAnnotations(placement, this._readPlacementAnnotations(form));
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
      const pointerTarget = Boolean(overrideTarget);
      const targetCenterX = pointerTarget ? targetGeometry.x : targetGeometry.x + targetGeometry.width / 2;
      const sourceCenterX = sourceGeometry.x + sourceGeometry.width / 2;
      const direction = targetCenterX >= sourceCenterX ? 1 : -1;
      const x1 = direction > 0 ? sourceGeometry.x + sourceGeometry.width : sourceGeometry.x;
      const y1 = sourceGeometry.y + Math.min(fallbackDimensions.height, sourceGeometry.height) / 2;
      const x2 = pointerTarget ? targetGeometry.x : (direction > 0 ? targetGeometry.x : targetGeometry.x + targetGeometry.width);
      const y2 = pointerTarget ? targetGeometry.y : targetGeometry.y + Math.min(fallbackDimensions.height, targetGeometry.height) / 2;
      const bend = Math.max(28, Math.abs(x2 - x1) * 0.5);
      return {
        path: `M ${x1} ${y1} C ${x1 + direction * bend} ${y1}, ${x2 - direction * bend} ${y2}, ${x2} ${y2}`,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 8
      };
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
    }

    _updateGroupFrames() {
      const graph = this._filteredGraph();
      const entitiesById = this._allEntitiesById();
      for (const placement of graph.placements) {
        if (entitiesById.get(placement.entityId)?.type !== 'group') continue;
        const frame = this.root?.querySelector(`[data-entity-id="${escapeSelectorValue(placement.entityId)}"]`);
        if (!frame) continue;
        const geometry = this._placementGeometry(placement, graph.placements);
        frame.style.transform = `translate(${geometry.x}px,${geometry.y}px)`;
        frame.style.width = `${geometry.width}px`;
        frame.style.height = `${geometry.height}px`;
      }
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
      if (event.button !== 0 && event.button !== 1) return;
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
      const sourcePort = event.target.closest('.relationship-port[data-direction="out"]');
      if (sourcePort && event.button === 0) {
        event.preventDefault();
        const sourceId = sourcePort.closest('.relationship-node')?.dataset.entityId;
        const sourcePlacement = this._placementForEntity(sourceId);
        if (!sourcePlacement) return;
        canvas.setPointerCapture(event.pointerId);
        this.pointerAction = { type: 'connect', pointerId: event.pointerId, sourceId };
        this._renderTemporaryEdge(sourceId, this._clientToWorld(event.clientX, event.clientY));
        return;
      }
      const node = event.target.closest('.relationship-node');
      const nodeControl = event.target.closest('.relationship-port, .relationship-card-detail-content, button, input, textarea, select, a');
      if (node && !nodeControl && event.button === 0) {
        event.preventDefault();
        const entityId = node.dataset.entityId;
        const placement = this._placementForEntity(entityId);
        if (!placement) return;
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
        const origins = new Map(this._combinedPlacements(activeBoard(this.store))
          .filter(item => movingIds.includes(item.entityId))
          .map(item => [item.entityId, { x: item.x, y: item.y }]));
        this.pointerAction = {
          type: 'node',
          pointerId: event.pointerId,
          entityId,
          entityIds: movingIds,
          persistentIds,
          dynamicIds,
          origins,
          pointX: point.x,
          pointY: point.y,
          before: JSON.stringify(this.store),
          suppressClick,
          moved: false
        };
        for (const movingId of movingIds) {
          this.root.querySelector(`[data-entity-id="${escapeSelectorValue(movingId)}"]`)?.classList.add('dragging');
        }
        this._updateSelectionCss();
        return;
      }
      if (!event.target.closest('.relationship-node, .relationship-edge') && event.button <= 1) {
        event.preventDefault();
        const board = activeBoard(this.store);
        canvas.setPointerCapture(event.pointerId);
        if (event.shiftKey && event.button === 0) {
          const point = this._clientToWorld(event.clientX, event.clientY);
          this.pointerAction = {
            type: 'box',
            pointerId: event.pointerId,
            startX: point.x,
            startY: point.y,
            initialSelection: this._entitySelectionIds(),
            baseSelection: event.metaKey || event.ctrlKey ? this._entitySelectionIds() : new Set(),
            moved: false
          };
          this.selectedRelationshipId = '';
          this._renderSelectionBox(point.x, point.y, point.x, point.y);
          return;
        }
        this.pointerAction = {
          type: 'pan',
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          originX: board.viewport.x,
          originY: board.viewport.y
        };
        if (!this.inspectorPinned) {
          this._clearEntitySelection();
          this.selectedRelationshipId = '';
          this.keyboardConnectSourceId = '';
        }
        canvas.classList.add('panning');
        if (!this.inspectorPinned) this._updateSelectionCss();
      }
    }

    _handlePointerMove(event) {
      const action = this.pointerAction;
      if (!action || action.pointerId !== event.pointerId) return;
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
      if (action.type === 'resource-panel') {
        this.root.querySelector('.relationship-resource-panel')?.classList.remove('dragging');
      } else if (action.type === 'node') {
        this._clearSnapGuides();
        for (const entityId of action.entityIds) {
          this.root.querySelector(`[data-entity-id="${escapeSelectorValue(entityId)}"]`)?.classList.remove('dragging');
        }
        if (action.moved) {
          if (action.persistentIds.length) {
            this._pushUndoSnapshot(action.before);
            this._persistSoon(0);
          }
          if (action.dynamicIds.length) this._saveDynamicPlacementOverrides(action.dynamicIds);
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
        this._hideSelectionBox();
        this._updateSelectionCss();
        this._setCanvasAnnouncement(`已选择 ${this._entitySelectionIds().size} 个节点`);
      }
      this.pointerAction = null;
    }

    _cancelPointerAction(preserveCurrent = false) {
      const action = this.pointerAction;
      if (!action) return;
      this._clearSnapGuides();
      if (!preserveCurrent && action.type === 'node') {
        if (action.before) this.store = JSON.parse(action.before);
        for (const [entityId, origin] of action.origins || []) {
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
      return placements.filter(placement => {
        const geometry = this._placementGeometry(placement, placements);
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
      event.preventDefault();
      const board = activeBoard(this.store);
      const canvas = this.root.querySelector('.relationship-canvas');
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const oldZoom = board.viewport.zoom;
      const factor = Math.exp(-event.deltaY * 0.0015);
      const nextZoom = Math.min(2.5, Math.max(0.35, oldZoom * factor));
      const worldX = (mouseX - board.viewport.x) / oldZoom;
      const worldY = (mouseY - board.viewport.y) / oldZoom;
      board.viewport.zoom = nextZoom;
      board.viewport.x = mouseX - worldX * nextZoom;
      board.viewport.y = mouseY - worldY * nextZoom;
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
      canvas.style.setProperty('--relationship-grid-size', `${GRID_SIZE * zoom}px`);
      canvas.style.setProperty('--relationship-grid-x', `${x}px`);
      canvas.style.setProperty('--relationship-grid-y', `${y}px`);
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

    async _createBoard() {
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
        view: Model.defaultBoardView(),
        placements: []
      });
      this.store.activeBoardId = id;
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

    async _createManualEntity(type) {
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
      this._addEntity({ id: makeId('entity'), type, name: values.name, details, source: 'manual' });
    }

    _addResource(resource, point = null) {
      if (!resource) return;
      if (resource.entityId) {
        const placement = this._combinedPlacements().find(candidate => candidate.entityId === resource.entityId);
        if (placement) {
          this._focusEntityOnBoard(resource.entityId);
          return;
        }
        const existingEntity = this.store.entities.find(candidate => candidate.id === resource.entityId);
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
      const entitiesById = new Map(this.store.entities.map(entity => [entity.id, entity]));
      return (activeBoard(this.store)?.placements || []).filter(placement => (
        selectedIds.has(placement.entityId) && entitiesById.get(placement.entityId)?.type !== 'group'
      ));
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
      activeBoard(this.store).placements.push({
        entityId: groupId,
        x: minX - GROUP_PADDING_X,
        y: minY - GROUP_HEADER_HEIGHT
      });
      for (const placement of members) placement.groupId = groupId;
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
      this._recordMutation();
      for (const placement of members) placement.groupId = groupId;
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
        if (!board.placements.some(item => selectedIds.has(item.entityId))) return;
        this._recordMutation();
        board.placements = board.placements.filter(item => !selectedIds.has(item.entityId));
        for (const placement of board.placements) {
          if (placement.groupId && selectedIds.has(placement.groupId)) delete placement.groupId;
        }
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
      this._pushUndoSnapshot(JSON.stringify(this.store));
      this.redoStack = [];
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
      this.redoStack.push(JSON.stringify(this.store));
      this.store = JSON.parse(previous);
      this._clearEntitySelection();
      this.selectedRelationshipId = '';
      this.keyboardConnectSourceId = '';
      this._persistSoon(0);
      this.render();
    }

    redo() {
      const next = this.redoStack.pop();
      if (!next) return;
      this.undoStack.push(JSON.stringify(this.store));
      this.store = JSON.parse(next);
      this._clearEntitySelection();
      this.selectedRelationshipId = '';
      this.keyboardConnectSourceId = '';
      this._persistSoon(0);
      this.render();
    }

    fitContent(options = {}) {
      const board = activeBoard(this.store);
      const canvas = this.root?.querySelector('.relationship-canvas');
      if (!board || !canvas) return;
      const minZoom = Number.isFinite(Number(options.minZoom))
        ? Math.min(1, Math.max(0.35, Number(options.minZoom)))
        : 0.35;
      const placements = this._filteredGraph().placements;
      if (!placements.length) {
        board.viewport = { x: 120, y: 90, zoom: 1 };
      } else {
        const rect = canvas.getBoundingClientRect();
        const geometries = placements.map(item => this._placementGeometry(item, placements));
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
      if (!this.root?.isConnected) return;
      const editing = event.target?.matches?.('input, textarea, select, [contenteditable="true"]');
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
      const selectedIds = this._entitySelectionIds();
      if (!selectedIds.size || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const movingIds = new Set(this._movingEntityIds(this.selectedEntityId || selectedIds.values().next().value));
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
      if (options.renderInspector !== false) {
        if (options.preserveDirtyInspector && this.root?.querySelector('.relationship-inspector-form.is-dirty')) return;
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
      return '已保存在本机';
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
      this._setSaveState('saving');
      this.saveChain = this.saveChain
        .catch(() => {})
        .then(() => this.bridge.relationshipBoards.save(snapshot))
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
      const graph = this._filteredGraph();
      this.onSummaryChanged({
        boardName: board.name,
        nodeCount: graph.placements.length,
        relationshipCount: graph.relationships.length,
        totalNodeCount: this._combinedPlacements(board).length,
        filterActive: graph.filterActive
      });
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
            <input name="${escapeHtml(field.key)}" value="${escapeHtml(field.value || '')}" placeholder="${escapeHtml(field.placeholder || '')}" maxlength="${field.maxLength || 240}" ${field.required ? 'required' : ''} autocomplete="off">
          </label>`).join('');
        overlay.innerHTML = `
          <form class="relationship-dialog" role="dialog" aria-modal="true" aria-labelledby="relationship-dialog-title">
            <header><h3 id="relationship-dialog-title">${escapeHtml(options.title)}</h3><button type="button" data-dialog-cancel aria-label="关闭">×</button></header>
            <div class="relationship-dialog-body">${fieldHtml}<p>这些信息仅保存在 GitFinder 本机配置中，不会执行部署或 Git 写操作。</p></div>
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
            const value = Model.cleanText(data.get(field.key), field.maxLength || 240);
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
