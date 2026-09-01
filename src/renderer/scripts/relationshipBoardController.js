(function exposeRelationshipBoardController(root, factory) {
  const projection = root?.PanelTopologyProjection
    || (typeof module !== 'undefined' && module.exports ? require('../../shared/panelTopologyProjection') : null);
  const scanner = root?.RepositoryRootScanner
    || (typeof module !== 'undefined' && module.exports ? require('./repositoryRootScanner') : null);
  const primitives = root?.RelationshipLayoutPrimitives
    || (typeof module !== 'undefined' && module.exports ? require('../../shared/relationshipLayoutPrimitives') : null);
  const graphProjection = root?.RelationshipGraphProjection
    || (typeof module !== 'undefined' && module.exports ? require('../../shared/relationshipGraphProjection') : null);
  const actionRouter = root?.RelationshipBoardActionRouter
    || (typeof module !== 'undefined' && module.exports ? require('./relationshipBoardActionRouter') : null);
  const resourceView = root?.RelationshipBoardResourceView
    || (typeof module !== 'undefined' && module.exports ? require('./relationshipBoardResourceView') : null);
  const toolbarView = root?.RelationshipBoardToolbarView
    || (typeof module !== 'undefined' && module.exports ? require('./relationshipBoardToolbarView') : null);
  const api = factory(root?.RelationshipGraphModel, projection, scanner, primitives, graphProjection, actionRouter, resourceView, toolbarView);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipBoardController = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipBoardController(Model, PanelTopologyProjection, RepositoryRootScanner, LayoutPrimitives, GraphProjection, ActionRouter, ResourceView, ToolbarView) {
  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 143;
  const COMPACT_NODE_WIDTH = 236;
  const COMPACT_NODE_HEIGHT = 94;
  const GROUP_PADDING_X = 28;
  const GROUP_HEADER_HEIGHT = 54;
  const GROUP_PADDING_BOTTOM = 28;
  const GROUP_MIN_WIDTH = 320;
  const GROUP_MIN_HEIGHT = 180;
  const GROUP_TITLE_SPACE = 40; // Screen pixels: fixed-size title, its 6px offset and breathing room.
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
      linked: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2'
    };
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
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
  const RESOURCE_CATEGORY_DEFINITIONS = ResourceView.RESOURCE_CATEGORY_DEFINITIONS;
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
      { key: 'repositoryKey', label: '仓库来源（主机/所有者/仓库）', maxLength: 240 },
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
      ...(value.locked === true ? { locked: true } : {}), ...(value.expanded === true ? { expanded: true } : {}),
      ...(value.endpointView === 'web' ? { endpointView: 'web' } : {}),
      ...(typeof value.moveWithDescendants === 'boolean' ? { moveWithDescendants: value.moveWithDescendants } : {}),
      ...(value.archived === true ? { archived: true } : {})
    };
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
          ...(Model.PROJECT_GROUP_SHAPES.includes(placement.groupShape) ? { groupShape: placement.groupShape } : {}),
          ...(Model.GROUP_APPEARANCES.includes(placement.groupAppearance) ? { groupAppearance: placement.groupAppearance } : {}),
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
      this.flowCanvas = null;
      this.flowRenderOptions = null;
      this.flowMutationActive = false;
      this.flowSelectionSync = false;
      this.panelLayout = {};
      this.panelSidebarRoot = null;
      this._panelEvents = {
        click: event => this._handleClick(event), input: event => this._handleInput(event),
        change: event => this._handleChange(event), submit: event => this._handleSubmit(event),
        dragstart: event => this._handleDragStart(event), dragover: event => this._handleDragOver(event),
        drop: event => this._handleDrop(event), dragend: () => this._clearPanelDrag()
      };
      this.inspectorPinned = false;
      this.saveTimer = null;
      this.saveChain = Promise.resolve();
      this.saveState = 'saved';
      this.resourceSearch = '';
      this.displayLayoutEdit = null;
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
      this.documentAssets = new Map();
      this.now = options.now || (() => new Date());
      this._boundKeydown = event => this._handleKeydown(event);
      this._boundBlur = () => {
        this._closeContextMenu();
      };
      this._boundResize = () => { this._closeContextMenu(); this._closeLayoutMenu(); this._applyResourcePanelPosition(); this._applyViewport(); };
      this._boundContextDismiss = event => {
        if (!event.target.closest?.('.relationship-context-menu')) this._closeContextMenu();
        if (!event.target.closest?.('.relationship-layout-host')) this._closeLayoutMenu();
        if (!event.target.closest?.('.relationship-topology-alerts')) this._closeTopologyAlerts();
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
            view: { ...Model.defaultBoardView(), structure: 'coolify-projects', layout: 'compact' },
            placements: []
          });
          this.store.activeBoardId = boardId;
          await this._persistNow();
          if (openRequestId !== this.openRequestId || this.container !== container || !isCurrent()) return;
        }
        this.render();
        if (this.bridge?.panel?.getCachedTopology) {
          void this._restoreCachedPanelTopology().finally(() => this._refreshPanelTopology());
        } else if (this.bridge?.panel?.refreshTopology || this.bridge?.panel?.getTopology) this._refreshPanelTopology();
        else this._schedulePanelRefresh();
        document.addEventListener('keydown', this._boundKeydown, true);
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
      this.displayLayoutEdit = null;
      this.openRequestId += 1;
      clearTimeout(this.endpointCheckTimer);
      this.endpointCheckTimer = null;
      this.endpointCheckRequest = null;
      document.removeEventListener('keydown', this._boundKeydown, true);
      document.removeEventListener('pointerdown', this._boundContextDismiss, true);
      this._closeContextMenu();
      globalThis.window?.removeEventListener('blur', this._boundBlur);
      globalThis.window?.removeEventListener('resize', this._boundResize);
      this.flowCanvas?.unmount?.();
      this.flowCanvas = null;
      this.flowRenderOptions = null;
      this.flowMutationActive = false;
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

    _applyDynamicLayoutOverrides({ preserveStructure = true } = {}) {
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
        const groupId = override && preserveStructure ? override.groupId : placement.groupId;
        const validGroup = groupId && placedIds.has(groupId) && groupIds.has(groupId);
        delete placement.groupId;
        return override ? {
          ...placement,
          x: override.x,
          y: override.y,
          ...(Number.isFinite(override.groupWidth) ? { groupWidth: override.groupWidth } : {}),
          ...(Number.isFinite(override.groupHeight) ? { groupHeight: override.groupHeight } : {}),
          ...normalizePlacementAnnotations(override),
          ...(override.groupShape ? { groupShape: override.groupShape } : {}),
          ...(override.groupAppearance ? { groupAppearance: override.groupAppearance } : {}),
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
          ...(Number.isFinite(placement.groupWidth) ? { groupWidth: Math.round(placement.groupWidth) } : {}),
          ...(Number.isFinite(placement.groupHeight) ? { groupHeight: Math.round(placement.groupHeight) } : {}),
          ...(placement.groupId ? { groupId: placement.groupId } : {}),
          ...(Model.PROJECT_GROUP_SHAPES.includes(placement.groupShape) ? { groupShape: placement.groupShape } : {}),
          ...(Model.GROUP_APPEARANCES.includes(placement.groupAppearance) ? { groupAppearance: placement.groupAppearance } : {}),
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
      this._arrangeCurrentLayout();
      this.render(); this.fitContent(); this._refreshHistoryButtons();
      this.notify('已整理当前布局，结构与群组成员保持不变', 'success');
      return true;
    }

    _isServerTree() { return Boolean(this.store && this._boardView().structure === 'server-tree'); }

    _arrangeCurrentLayout() {
      const placements = this._unarchivedPlacements();
      const geometry = this._displayGeometryMap(placements);
      const entities = this._allEntitiesById();
      const sized = placements.map(item => {
        const rect = geometry.get(item.entityId);
        return { ...item, ...rect, groupId: item.groupId,
          ...(rect && entities.get(item.entityId)?.type === 'group' ? { groupWidth: rect.width, groupHeight: rect.height } : {}) };
      });
      const graph = { entities: this._combinedEntities(), relationships: this._combinedRelationships(placements) };
      const canvas = this.root?.querySelector('.relationship-canvas');
      const options = {
        ...this._nodeDimensions(), ...this._displayViewSettings(),
        style: this._boardView().layout === 'free' ? 'compact' : this._boardView().layout,
        projectGroupIncludesEndpoints: this._boardView().projectGroupIncludesEndpoints,
        preserveGroupContents: true,
        viewportAspectRatio: canvas?.clientWidth / canvas?.clientHeight || 1.6
      };
      const groupTitleScreenHeight = Math.max(GROUP_TITLE_SPACE, options.groupTitleFontSize + 20);
      let groupTitleSpace = groupTitleScreenHeight, arranged;
      // Fitting the result can zoom out further than the current viewport. Size
      // the title allowance for that resulting zoom, starting from the same
      // measured rectangles each pass so repeated tidy never accumulates gaps.
      for (let pass = 0; pass < 8; pass++) {
        arranged = sized.map(item => ({ ...item }));
        const input = { ...graph, placements: arranged };
        const result = this._isServerTree()
          ? PanelTopologyProjection.arrangeServerTree(input, { ...options, groupTitleSpace })
          : PanelTopologyProjection.arrangeBoardLayout(input, { ...options, groupTitleSpace });
        if (!(canvas?.clientWidth > 120 && canvas?.clientHeight > 120) || !result.placements.length
          || !result.placements.some(item => entities.get(item.entityId)?.type === 'group')) break;
        const rects = result.placements.map(item => ({ ...item,
          width: item.groupWidth || item.width || options.width, height: item.groupHeight || item.height || options.height }));
        const width = Math.max(...rects.map(r => r.x + r.width)) - Math.min(...rects.map(r => r.x));
        const height = Math.max(...rects.map(r => r.y + r.height)) - Math.min(...rects.map(r => r.y));
        const zoom = Math.max(Model.MIN_VIEWPORT_ZOOM, Math.min(1, (canvas.clientWidth - 120) / Math.max(1, width), (canvas.clientHeight - 120) / Math.max(1, height)));
        const required = Math.ceil(groupTitleScreenHeight / zoom);
        if (required <= groupTitleSpace + 1) break;
        groupTitleSpace = required;
      }
      const byId = new Map(arranged.map(item => [item.entityId, item]));
      for (const item of placements) {
        const position = byId.get(item.entityId); item.x = Math.round(position.x); item.y = Math.round(position.y);
        if (entities.get(item.entityId)?.type === 'group') {
          for (const key of ['groupWidth', 'groupHeight']) if (position[key] != null) item[key] = position[key];
        }
      }
      this._saveDynamicPlacementOverrides(placements.filter(item => item.dynamic).map(item => item.entityId));
      this._persistSoon(0);
    }

    _setLayout(style) {
      if (!Model.BOARD_LAYOUTS.includes(style)) return false;
      this._recordMutation();
      this._boardView().layout = style;
      if (style !== 'free') this._arrangeCurrentLayout();
      else {
        this._saveDynamicPlacementOverrides(this.panelProjection.placements.map(item => item.entityId));
        this._persistSoon(0);
      }
      this.render();
      if (style !== 'free') this.fitContent();
      this._refreshHistoryButtons();
      return true;
    }

    _setStructure(structure) {
      if (!Model.BOARD_STRUCTURES.includes(structure)) return false;
      const board = activeBoard(this.store);
      if (!board || Model.boardOrganization(board.view).structure === structure) return false;
      if (structure !== 'resources' && !this.documentRecord && !this.panelProjection.metadata?.deploymentCount
        && !this.store.entities.some(item => item.type === 'deployment')) {
        this.notify('请先连接 Coolify 并载入部署数据', 'info'); return false;
      }
      this._recordMutation();
      // Save coordinates and manual annotations before rebuilding only the projection.
      const visibleGeometry = this._displayGeometryMap(this._combinedPlacements());
      const before = new Map(this._combinedPlacements().map(item => [item.entityId, {
        ...clone(item), ...(visibleGeometry.has(item.entityId) ? { x: visibleGeometry.get(item.entityId).x, y: visibleGeometry.get(item.entityId).y,
          ...(this._allEntitiesById().get(item.entityId)?.type === 'group'
            ? { groupWidth: visibleGeometry.get(item.entityId).width, groupHeight: visibleGeometry.get(item.entityId).height } : {}) } : {})
      }]));
      const previousGroups = new Set(this._combinedEntities()
        .filter(item => item.runtime?.dynamicKind === 'coolify-project-group').map(item => item.id));
      board.view = { ...this._boardView(), structure };
      if (!this.documentRecord) {
        this._setPanelTopology(this.panelTopologyResult, { preserveStructure: false });
        for (const item of this.panelProjection.placements) {
          const previous = before.get(item.entityId);
          if (!previous) continue;
          const nextGroup = item.groupId;
          Object.assign(item, normalizePlacementAnnotations(previous), { x: previous.x, y: previous.y });
          if (previous.groupId && !previousGroups.has(previous.groupId)) item.groupId = previous.groupId;
          else if (nextGroup) item.groupId = nextGroup;
          else delete item.groupId;
        }
        // Free placement preserves positions; arranged views give new containers
        // a content-based wrapping width before applying the same chosen layout.
        const generatedGroups = new Set(this.panelProjection.entities.filter(item => item.type === 'group').map(item => item.id));
        for (const group of this.panelProjection.placements.filter(item => generatedGroups.has(item.entityId) && !visibleGeometry.has(item.entityId))) {
          const members = this.panelProjection.placements.filter(item => item.groupId === group.entityId);
          if (!members.length) continue;
          const bounds = members.map(item => ({ x: item.x, y: item.y,
            width: visibleGeometry.get(item.entityId)?.width || this._nodeDimensions().width,
            height: visibleGeometry.get(item.entityId)?.height || this._nodeDimensions().height }));
          if (board.view.layout !== 'free' && !members.some(item => item.locked)) {
            const spacing = this._displayViewSettings();
            const points = PanelTopologyProjection.packRegions(bounds, 1.6, Math.max(spacing.horizontalSpacing, spacing.verticalSpacing));
            group.groupWidth = Math.max(...bounds.map((rect, i) => points[i].x + rect.width)) - Math.min(...points.map(p => p.x)) + GROUP_PADDING_X * 2;
            group.groupLayout = 'auto';
            continue;
          }
          group.x = Math.min(...bounds.map(item => item.x)) - GROUP_PADDING_X;
          group.y = Math.min(...bounds.map(item => item.y)) - GROUP_HEADER_HEIGHT;
          group.groupWidth = Math.max(...bounds.map(item => item.x + item.width)) + GROUP_PADDING_X - group.x;
          group.groupHeight = Math.max(...bounds.map(item => item.y + item.height)) + GROUP_PADDING_BOTTOM - group.y;
          group.groupLayout = 'manual';
        }
        this._saveDynamicPlacementOverrides(this.panelProjection.placements.map(item => item.entityId));
      }
      // A saved document already owns its containers; structure only changes its
      // relationship projection, never replaces them with live Coolify data.
      this._persistSoon(0);
      this.render();
      if (board.view.layout !== 'free') {
        this._arrangeCurrentLayout(); this._renderGraph(); this.fitContent();
      }
      this._refreshHistoryButtons();
      this.notify(board.view.layout === 'free' ? '已切换结构，自由摆放保留原位置' : '已切换结构并应用当前布局，手工群组内部位置保持不变', 'success');
      return true;
    }

    _setProjectEndpoints(include) {
      this._recordMutation();
      this._boardView().projectGroupIncludesEndpoints = include;
      const placements = this._combinedPlacements();
      const before = new Map(placements.map(item => [item.entityId, item.groupId]));
      const entities = this._allEntitiesById();
      PanelTopologyProjection.applyProjectEndpointMembership({ entities: [...entities.values()],
        relationships: this._combinedRelationships(placements), placements }, include);
      for (const item of placements) {
        const previous = before.get(item.entityId);
        // User-created group membership takes priority over generated Project rules.
        if (previous && entities.get(previous)?.type === 'group'
          && entities.get(previous)?.runtime?.dynamicKind !== 'coolify-project-group'
          && !previous.startsWith('entity_panel_projectgroup_')) item.groupId = previous;
        else if (item.groupId && !item.groupId.startsWith('entity_panel_projectgroup_')
          && entities.get(item.groupId)?.runtime?.dynamicKind !== 'coolify-project-group') {
          if (previous) item.groupId = previous; else delete item.groupId;
        }
      }
      this._saveDynamicPlacementOverrides(placements.filter(item => item.dynamic).map(item => item.entityId));
      this._persistSoon(0); this.render();
      if (this._boardView().layout !== 'free') {
        this._arrangeCurrentLayout(); this._renderGraph(); this.fitContent();
      }
      this._refreshHistoryButtons();
    }

    _layoutMenuHtml() {
      const view = this._boardView();
      const layouts = [
        ['free', '自由摆放', '保持手工位置', 'M7 7H12V12H7ZM20 20H25V25H20Z'],
        ['right', '向右树状', '从左向右展开现有关系', 'M5 16H14M14 6V26M14 6H26M14 16H26M14 26H26'],
        ['down', '向下树状', '从上向下展开现有关系', 'M16 4V13M5 13H27M5 13V26M16 13V26M27 13V26'],
        ['bilateral', '左右分叉', '现有分支向两侧展开', 'M16 16H23M23 7V25M23 7H29M23 25H29M16 16H9M9 7V25M9 7H3M9 25H3'],
        ['radial', '环绕放射', '以分支为单位环绕，不拆散群组', 'M16 16L5 5M16 16L27 5M16 16L27 27M16 16L5 27'],
        ['galaxy', '项目星系', '按 Project 聚合部署；访问点位置服从结构开关', 'M16 8A8 8 0 1 0 16 24A8 8 0 1 0 16 8M16 2V5M27 8L24 10M30 19L26 18M22 29L20 25M9 29L11 25M2 19L6 18M5 8L8 10'],
        ['lanes', '按类别分列', '同类元素一列，群组保持完整', 'M5 5H11V27H5ZM21 5H27V27H21Z'],
        ['compact', '紧凑排列', '按可用画布比例平铺', 'M4 4H14V14H4ZM19 4H29V14H19ZM4 19H14V29H4ZM19 19H29V29H19Z']
      ];
      const structures = [
        ['resources', '资源关系', '显示仓库、部署、主机和访问点的原始关联'],
        ['coolify-projects', 'Coolify 项目分组', '按 Project 归属组织，跨项目资源保持独立'],
        ['server-tree', '服务器项目树', '服务器 → 项目容器 → 部署 → 访问点']
      ];
      const menu = (key, label, current, content) => `<div class="relationship-layout-host">
        <button class="relationship-tool-button relationship-layout-trigger" data-relationship-action="toggle-layout-menu" data-layout-menu="${key}" type="button" aria-label="${label}" aria-haspopup="menu" aria-expanded="false" title="${label}：${escapeHtml(current)}">${toolbarIcon(key === 'structure' ? 'group' : 'layout')}<span>${label}</span><span aria-hidden="true">⌄</span></button>
        <div class="relationship-layout-menu" data-layout-panel="${key}" role="menu" aria-label="${label}" hidden>
          <header><strong>${label}</strong><small>当前：${escapeHtml(current)}</small></header>${content}
        </div></div>`;
      const structureMenu = `<p>决定层级与群组成员，并应用所选布局；自由摆放保留原位置。</p>
        <div class="relationship-structure-options">${structures.map(([key, label, hint]) => `<button type="button" role="menuitemradio" aria-checked="${view.structure === key}" data-board-structure="${key}"><span><b>${label}</b><small>${hint}</small></span><span aria-hidden="true">${view.structure === key ? '✓' : ''}</span></button>`).join('')}</div>
        ${this._isServerTree() ? `<div class="relationship-menu-separator" role="separator"></div>
          <button type="button" role="menuitemcheckbox" aria-checked="${view.projectGroupIncludesEndpoints}" data-relationship-action="project-endpoints">${view.projectGroupIncludesEndpoints ? '✓' : '○'} 项目组包含访问点</button>
          <button type="button" role="menuitemcheckbox" aria-checked="${view.showRepositoryRelations}" data-relationship-action="repository-relations">${view.showRepositoryRelations ? '✓' : '○'} 显示仓库相关性</button>` : ''}
        <div class="relationship-menu-separator" role="separator"></div>
        <button type="button" role="menuitem" data-relationship-action="deployment-archive">归档的部署（${this._combinedPlacements().filter(item => item.archived).length}）</button>`;
      const layoutMenu = `<p>只改变位置、方向和间距，不改变结构，也不创建副本。</p>
        <div class="relationship-layout-options">${layouts.map(([key, label, hint, path]) => `<button type="button" role="menuitemradio" aria-checked="${view.layout === key}" aria-label="${label}" data-board-layout="${key}"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="${path}"/></svg><span><b>${label}</b><small>${hint}</small></span><span class="relationship-layout-check" aria-hidden="true">${view.layout === key ? '✓' : ''}</span></button>`).join('')}</div>
        <div class="relationship-menu-separator" role="separator"></div>
        <p>卡片间距在“显示”中调整；关闭组内自动排列的群组整体移动。</p>
        <button type="button" role="menuitem" data-relationship-action="reset-dynamic-layout">整理布局</button>`;
      return menu('structure', '结构', structures.find(([key]) => key === view.structure)?.[1], structureMenu)
        + menu('layout', '布局', layouts.find(([key]) => key === view.layout)?.[1], layoutMenu);
    }


    _arrangeByCategory() { return this._setLayout('lanes'); }

    _arrangeByCoolifyProjects() { return this._setStructure('coolify-projects'); }

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
      board.view = { ...this._boardView(), layout: 'radial' };
      const placements = this._unarchivedPlacements();
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

    _setPanelTopology(result = {}, options = {}) {
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
        groupByProject: this.store && this._boardView().structure === 'coolify-projects',
        serverTree: this._isServerTree(),
        layout: {
          ...this._nodeDimensions(),
          style: this._boardView().layout,
          projectGroupIncludesEndpoints: activeBoard(this.store)?.view?.projectGroupIncludesEndpoints,
          viewportAspectRatio: canvas?.clientWidth && canvas?.clientHeight ? canvas.clientWidth / canvas.clientHeight : 1.6,
          horizontalSpacing: this._displayViewSettings().horizontalSpacing,
          verticalSpacing: this._displayViewSettings().verticalSpacing
        }
      }) || { entities: [], relationships: [], placements: [], metadata: { state: result.state || 'unconfigured' } };
      const board = this.store && activeBoard(this.store);
      if (board?.view?.structure === 'coolify-projects' && board.placements.length) {
        const right = Math.max(...board.placements.map(item => {
          const geometry = this._placementGeometry(item, board.placements);
          return geometry.x + geometry.width;
        }));
        for (const placement of this.panelProjection.placements) placement.x += right + 80;
      }
      this._applyDynamicLayoutOverrides(options);
    }

    _schedulePanelRefresh() {
      if (this.panelRefreshTimer) clearTimeout(this.panelRefreshTimer);
      this.panelRefreshTimer = null;
      if (!this.root?.isConnected || !(this.bridge?.panel?.refreshTopology || this.bridge?.panel?.getTopology)) return;
      if (!['ready', 'error'].includes(this.panelTopologyResult?.state)) return;
      this.panelRefreshTimer = setTimeout(() => this._refreshPanelTopology(), PANEL_REFRESH_INTERVAL_MS);
    }

    async _restoreCachedPanelTopology() {
      if (!this.root?.isConnected || !this.bridge?.panel?.getCachedTopology) return false;
      try {
        const cached = await this.bridge.panel.getCachedTopology();
        if (cached?.state !== 'ready') return false;
        const result = await this._topologyWithProjectBindings(cached);
        this._setPanelTopology(result);
        if (this.root?.isConnected) {
          this._renderGraph();
          this._updateFilterSummary();
          this._updateSummary();
          this._updatePanelStatus();
        }
        return true;
      } catch (error) {
        this.panelLastError = `缓存读取失败：${error?.message || error}`;
        this._updatePanelStatus();
        return false;
      }
    }

    async _refreshPanelTopology(options = {}) {
      if (this.flowMutationActive) { this._schedulePanelRefresh(); return false; }
      const readTopology = this.bridge?.panel?.refreshTopology || this.bridge?.panel?.getTopology;
      if (this.panelRefreshInFlight || !readTopology) return false;
      this.panelRefreshInFlight = true;
      const associationRevision = this.repositoryAssociationRevision;
      this._updatePanelStatus();
      try {
        const [topology, repositories] = await Promise.all([
          readTopology.call(this.bridge.panel),
          this.bridge.panel.getLocalRepositories?.() || Promise.resolve(this.panelRepositories)
        ]);
        if (topology?.state === 'error' && this.panelProjection?.entities?.length) {
          const errors = Array.isArray(topology.errors) ? topology.errors : [];
          this.panelLastError = errors[0]?.message || topology.error || 'Coolify 同步失败';
          this._updatePanelStatus();
          if (options.announce) this.notify(`Coolify 刷新失败：${this.panelLastError}`, 'error');
          return false;
        }
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
        if (this.root?.isConnected && !this.flowMutationActive) {
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
        // Never interrupt a React Flow drag or resize with a model rebuild.
        if (!this.flowMutationActive) this._applyEndpointChecks(snapshot.checks || []);
        if (snapshot.pending || this.flowMutationActive) this.endpointCheckTimer = setTimeout(() => this._refreshEndpointChecks(), 1500);
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
      // Progress belongs in the tooltip/accessible label, not the toolbar's width.
      if (button.textContent !== '◉') button.textContent = '◉';
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

    _resourceCatalog() {
      return ResourceView.catalog({ resources: this.resources, entities: this._combinedEntities(), placements: this._combinedPlacements(),
        documents: this.documentLibrary, displayName: entity => this._entityDisplayName(entity), displaySubtitle: entity => {
          const fallback = this._entitySubtitle(entity, null, false) || TYPE_LABELS[entity.type];
          return this._entityDisplaySubtitle(entity, fallback);
        }
      });
    }

    _resourceSections(catalog = this._resourceCatalog()) {
      return ResourceView.sections(catalog);
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

    _unarchivedPlacements() {
      const placements = this._combinedPlacements();
      const hidden = new Set(placements.filter(item => item.archived).map(item => item.entityId));
      if (!hidden.size) return placements;
      const owners = new Map();
      for (const edge of this._combinedRelationships(placements)) {
        const pair = edge.type === 'exposes' ? [edge.sourceId, edge.targetId]
          : edge.type === 'exposed_by' ? [edge.targetId, edge.sourceId] : null;
        if (!pair) continue;
        if (!owners.has(pair[1])) owners.set(pair[1], []);
        owners.get(pair[1]).push(pair[0]);
      }
      for (const [endpointId, deployments] of owners) {
        if (deployments.every(id => hidden.has(id))) hidden.add(endpointId);
      }
      return placements.filter(item => !hidden.has(item.entityId));
    }

    _setDeploymentArchived(entityId, archived) {
      const entity = this._allEntitiesById().get(entityId), placement = this._placementForEntity(entityId);
      if (entity?.type !== 'deployment' || !placement || Boolean(placement.archived) === archived) return false;
      this._recordMutation();
      const board = activeBoard(this.store);
      let stored = board.placements.find(item => item.entityId === entityId);
      const dynamic = this.panelProjection?.placements?.find(item => item.entityId === entityId);
      if (archived && !stored) {
        // Keep a credential-free snapshot even when this data source is offline.
        if (!this.store.entities.some(item => item.id === entityId)) this.store.entities.push(this._portableEntity(entity));
        stored = { entityId, x: placement.x, y: placement.y, ...normalizePlacementAnnotations(placement) };
        board.placements.push(stored);
      }
      if (archived) stored.archived = true;
      else {
        delete stored.archived;
        if (dynamic && !this.documentRecord) {
          Object.assign(dynamic, { x: stored.x, y: stored.y }, normalizePlacementAnnotations(stored));
          delete dynamic.archived;
          board.placements = board.placements.filter(item => item !== stored);
          this._saveDynamicPlacementOverrides([entityId]);
        }
      }
      this.selectedEntityIds.delete(entityId);
      if (this.selectedEntityId === entityId) this.selectedEntityId = null;
      if (this._boardView().layout === 'galaxy') this._arrangeCurrentLayout();
      this._persistSoon(0); this.render();
      this.notify(archived ? '已归档到当前白板；未停止或删除远端部署' : '已还原到白板；未启动或修改远端部署', 'success');
      return true;
    }

    _openDeploymentArchive() {
      const overlay = document.createElement('div');
      overlay.className = 'relationship-dialog-overlay';
      overlay.innerHTML = `<section class="relationship-dialog" role="dialog" aria-modal="true" aria-labelledby="deployment-archive-title"><header><h3 id="deployment-archive-title">归档的部署</h3><button type="button" data-dialog-cancel aria-label="关闭归档">×</button></header><div class="relationship-dialog-body"><p>仅影响当前白板。归档保留本地快照、备注和待办，不会停止或删除 Coolify 服务。共享访问点继续显示。</p><div data-archive-list></div></div><footer><button type="button" class="btn" data-dialog-cancel>关闭</button></footer></section>`;
      const populate = () => {
        const entities = this._allEntitiesById();
        const items = this._combinedPlacements().filter(item => item.archived && entities.get(item.entityId)?.type === 'deployment');
        overlay.querySelector('[data-archive-list]').innerHTML = items.map(item => {
          const entity = entities.get(item.entityId);
          const facts = DETAIL_FIELD_DEFINITIONS.deployment.filter(field => entity.details?.[field.key]);
          return `<article class="relationship-archive-item"><div class="relationship-archive-row"><strong>${escapeHtml(this._entityDisplayName(entity))}</strong><button type="button" class="btn" data-restore-deployment="${escapeHtml(entity.id)}">还原到白板</button></div><details><summary>查看归档详情</summary><p>以下为本地快照，不代表当前运行状态。</p><dl>${facts.map(field => `<dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(entity.details[field.key])}</dd>`).join('')}</dl>${item.note ? `<p>备注：${escapeHtml(item.note)}</p>` : ''}<p>待办：${(item.todos || []).length}</p><ul>${(item.todos || []).map(todo => `<li>${todo.completed ? '已完成' : '未完成'} · ${escapeHtml(todo.title)}</li>`).join('')}</ul></details></article>`;
        }).join('') || '<p>当前白板没有归档的部署。</p>';
      };
      const finish = () => { document.removeEventListener('keydown', onKeydown, true); overlay.remove(); this.root?.querySelector('.relationship-layout-trigger')?.focus(); };
      const onKeydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
        if (event.key === 'Tab') {
          const targets = [...overlay.querySelectorAll('button, summary')];
          const index = targets.indexOf(document.activeElement);
          if (event.shiftKey && index <= 0 || !event.shiftKey && index === targets.length - 1) {
            event.preventDefault(); targets[event.shiftKey ? targets.length - 1 : 0].focus();
          }
        }
      };
      overlay.addEventListener('click', event => {
        if (event.target.closest('[data-dialog-cancel]')) finish();
        const restore = event.target.closest('[data-restore-deployment]');
        if (restore) { this._setDeploymentArchived(restore.dataset.restoreDeployment, false); populate(); overlay.querySelector('[data-restore-deployment], [data-dialog-cancel]').focus(); }
      });
      populate(); document.body.appendChild(overlay); document.addEventListener('keydown', onKeydown, true);
      overlay.querySelector('[data-dialog-cancel]').focus();
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
            ...(placement.groupShape ? { groupShape: placement.groupShape } : {}),
            ...(placement.groupAppearance ? { groupAppearance: placement.groupAppearance } : {}),
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
        const cachePrefix = this.panelTopologyResult?.cached ? '缓存 · ' : '';
        const providerPrefix = metadata.providerCount > 1 ? `${cachePrefix}${metadata.providerCount} 个 Coolify · ` : `Coolify ${cachePrefix}`;
        return {
          state: stale ? 'stale' : (metadata.failureCount ? 'warning' : 'ready'),
          label: `${providerPrefix}${metadata.serverCount || 0} 台服务器 · ${metadata.deploymentCount || 0} 个部署${failure}`,
          title: `${this.panelTopologyResult?.cached ? '已从本机缓存恢复；' : ''}最后同步 ${this._relativeTime(metadata.generatedAt)}${stale ? '；数据已陈旧' : ''}`
        };
      }
      if (state === 'reauthentication-required') return { state, label: 'Coolify 需要重新连接', title: '请在设置中重新输入只读 API Token' };
      if (state === 'error') return { state, label: 'Coolify 同步失败', title: this.panelLastError || '无法读取动态拓扑' };
      return { state: 'unconfigured', label: 'Coolify 未连接', title: '可在设置中直接连接 Coolify' };
    }

    _topologyAlerts() {
      const placements = this._unarchivedPlacements();
      return PanelTopologyProjection.endpointReuseAlerts({
        entities: this._combinedEntities(),
        relationships: this._combinedRelationships(placements),
        placements
      });
    }

    _topologyAlertItemsHtml(alerts = []) {
      const entities = this._allEntitiesById();
      const placed = new Set(this._unarchivedPlacements().map(item => item.entityId));
      return alerts.map(alert => {
        const endpoint = entities.get(alert.endpointId);
        const hostNames = alert.hostIds.map(id => this._entityDisplayName(entities.get(id))).join('、');
        const deployments = alert.deploymentIds.map(id => {
          const deployment = entities.get(id);
          const hosts = (alert.deploymentHostIds?.[id] || []).map(hostId => this._entityDisplayName(entities.get(hostId))).join('、') || '主机未知';
          return `<li><span>${escapeHtml(this._entityDisplayName(deployment))}</span><small>${escapeHtml(hosts)}</small></li>`;
        }).join('');
        return `<article class="relationship-topology-alert-item" data-topology-alert-id="${escapeHtml(alert.id)}">
          <header><span aria-hidden="true">!</span><strong>${escapeHtml(this._entityDisplayName(endpoint))}</strong><small>严重</small></header>
          <p>${escapeHtml(alert.message)}</p>
          <details><summary>查看涉及的配置</summary><dl><div><dt>主机</dt><dd>${escapeHtml(hostNames)}</dd></div><div><dt>部署</dt><dd><ul>${deployments}</ul></dd></div></dl></details>
          <button type="button" data-relationship-locate-entity="${escapeHtml(alert.endpointId)}"${placed.has(alert.endpointId) ? '' : ' disabled'}>定位访问点</button>
        </article>`;
      }).join('');
    }

    _updateTopologyAlerts(alerts = this._topologyAlerts()) {
      const host = this.root?.querySelector('.relationship-topology-alerts');
      if (!host) return;
      const trigger = host.querySelector('.relationship-topology-alert-trigger');
      const popover = host.querySelector('.relationship-topology-alert-popover');
      const count = alerts.length;
      trigger.hidden = count === 0;
      trigger.querySelector('b').textContent = String(count);
      trigger.setAttribute('aria-label', `配置警报 ${count} 条`);
      popover.querySelector('[data-topology-alert-count]').textContent = `${count} 条`;
      popover.querySelector('[data-topology-alert-list]').innerHTML = this._topologyAlertItemsHtml(alerts);
      if (!count) this._closeTopologyAlerts();
    }

    _closeTopologyAlerts() {
      const popover = this.root?.querySelector('.relationship-topology-alert-popover');
      const trigger = this.root?.querySelector('.relationship-topology-alert-trigger');
      if (popover) popover.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
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
      if (refresh) refresh.disabled = this.panelRefreshInFlight || !(this.bridge?.panel?.refreshTopology || this.bridge?.panel?.getTopology);
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

      if (GraphProjection.hasActiveFilters(board.view)) {
        board.view = this._filterFreeView();
      }
      this._selectOnlyEntity(entity.id);
      this._renderAndCenterEntity(entity.id, placement, board);
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
      board.view = { ...Model.defaultBoardView(), ...(board.view || {}), ...Model.boardOrganization(board.view) };
      delete board.view.topologyLayout;
      delete board.view.treeLayout;
      return board.view;
    }

    _filterFreeView(options = {}) {
      const view = this._boardView();
      const { mode, projection, snapMode, structure, layout, projectGroupIncludesEndpoints, showRepositoryRelations } = view;
      return {
        ...Model.defaultBoardView(),
        ...this._displayViewSettings(view),
        mode,
        projection: options.projection ?? projection ?? 'facts',
        snapMode, structure, layout, projectGroupIncludesEndpoints, showRepositoryRelations
      };
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
        groupTitleFontSize: normalizedNumber(view.groupTitleFontSize, defaults.groupTitleFontSize, 14, 36),
        horizontalSpacing: normalizedNumber(view.horizontalSpacing, defaults.horizontalSpacing, 16, 180),
        verticalSpacing: normalizedNumber(view.verticalSpacing, defaults.verticalSpacing, 16, 140),
        cardAppearance: view.cardAppearance === 'flat' ? 'flat' : 'elevated',
        projectGroupShape: Model.PROJECT_GROUP_SHAPES.includes(view.projectGroupShape) ? view.projectGroupShape : defaults.projectGroupShape,
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

    _nodeDimensions(display = this._displayViewSettings()) {
      const dimensions = display.mode === 'compact'
        ? { width: COMPACT_NODE_WIDTH, height: COMPACT_NODE_HEIGHT }
        : { width: NODE_WIDTH, height: NODE_HEIGHT };
      return {
        width: Math.round(dimensions.width * display.cardScale * display.cardWidth / NODE_WIDTH),
        height: Math.round(dimensions.height * display.cardScale * display.cardHeight / NODE_HEIGHT)
      };
    }

    _captureDisplayLayout() {
      const display = this._displayViewSettings();
      return { boardId: activeBoard(this.store)?.id, display, history: this._historySnapshot(),
        geometry: this._displayGeometryMap(this._combinedPlacements()) };
    }

    _reflowDisplayLayout(before) {
      if (before.boardId !== activeBoard(this.store)?.id) return;
      const placements = this._combinedPlacements();
      const placementIndex = LayoutPrimitives.indexPlacements(placements);
      const entities = this._allEntitiesById();
      const spacing = this._displayViewSettings();
      const dimensions = this._nodeDimensions();
      const geometry = new Map();
      for (const item of placements) {
        const old = before.geometry.get(item.entityId);
        if (!old) continue;
        const card = !['group', 'text', 'image', 'attachment'].includes(entities.get(item.entityId)?.type);
        geometry.set(item.entityId, { ...old, ...(card ? { width: dimensions.width, height: dimensions.height } : {}) });
      }
      const bounds = item => geometry.get(item.entityId);
      const oldBounds = item => before.geometry.get(item.entityId);
      const shift = (item, dx, dy) => {
        for (const child of [item, ...placementIndex.descendants(item.entityId)]) {
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
          const start = previousEnd == null ? oldStart : previousEnd + gap;
          for (const item of track) {
            const delta = start + oldBounds(item)[axis] - oldStart - bounds(item)[axis];
            shift(item, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
          }
          previousEnd = Math.max(...track.map(item => bounds(item)[axis] + bounds(item)[size]));
          previousOldEnd = Math.max(...track.map(item => oldBounds(item)[axis] + oldBounds(item)[size]));
        }
      };
      const arrange = items => {
        if (items.some(item => item.locked || placementIndex.descendants(item.entityId).some(child => child.locked))) return;
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
        .sort((a, b) => placementIndex.depth(b.entityId) - placementIndex.depth(a.entityId));
      const blocked = new Set();
      for (const item of placements.filter(item => item.locked)) {
        blocked.add(item.entityId);
        placementIndex.descendants(item.entityId).forEach(child => blocked.add(child.entityId));
      }
      for (const group of groups) {
        if (blocked.has(group.entityId)) continue;
        const members = placementIndex.children(group.entityId).filter(bounds);
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
      if (this._isServerTree()) placements = PanelTopologyProjection.serverTreeGraph({ entities: this._combinedEntities(), relationships: this._combinedRelationships(placements), placements }).placements;
      if (!this._isServerTree() && placements.length < allPlacements.length && allPlacements.some(item => item.groupLayout === 'auto')) {
        const geometry = this._displayGeometryMap(allPlacements);
        return new Map(placements.filter(item => geometry.has(item.entityId)).map(item => [item.entityId, geometry.get(item.entityId)]));
      }
      const entitiesById = this._allEntitiesById();
      const { width, height } = this._nodeDimensions();
      const spacing = this._displayViewSettings();
      const linkedRoots = placements.filter(item => item.moveWithDescendants).map(item => item.entityId);
      const linkedBranch = new Set(linkedRoots.length ? this._expandMovingIds(linkedRoots) : []);
      const placementIndex = LayoutPrimitives.indexPlacements(placements);
      const placementsById = placementIndex.byId;
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
        const cardHeight = height;
        for (const previous of resolved) {
          if (linkedBranch.has(placement.entityId)) break;
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
        .sort((a, b) => placementIndex.depth(b.entityId) - placementIndex.depth(a.entityId) || a.y - b.y || a.x - b.x);
      const resolvedGroups = [];
      for (const group of groups) {
        const members = placementIndex.children(group.entityId);
        const descendants = placementIndex.descendants(group.entityId);
        const autoLayout = group.groupLayout === 'auto' && !group.locked && !descendants.some(item => item.locked);
        const projectGroup = entitiesById.get(group.entityId)?.runtime?.dynamicKind === 'coolify-project-group'
          || group.entityId.startsWith('entity_panel_projectgroup_');
        const projectGalaxy = this._boardView().layout === 'galaxy' && projectGroup;
        let autoProjectBounds = null;
        if (autoLayout && projectGroup && !projectGalaxy) {
          // Physical membership is authoritative here. Besides deployments and
          // optional endpoints, imported/legacy boards may still contain a
          // repository or nested item; leaving it at its stale coordinate lets
          // the freshly packed Project move on top of that item.
          const projectMembers = this._orderedLayoutItems(members, placements);
          if (projectMembers.length) {
            const groupCopy = { ...group };
            const memberCopies = projectMembers.map(item => {
              const rect = geometryById.get(item.entityId);
              return { ...item, width: rect?.width || width, height: rect?.height || height };
            });
            PanelTopologyProjection.arrangeProjectContainer(groupCopy, memberCopies, {
              ...this._nodeDimensions(),
              ...this._displayViewSettings(),
              projectGroupShape: this._groupShape(group.entityId),
              preserveCenter: true
            });
            memberCopies.forEach(item => geometryById.set(item.entityId, {
              ...geometryById.get(item.entityId), x: item.x, y: item.y
            }));
            autoProjectBounds = {
              x: groupCopy.x,
              y: groupCopy.y,
              width: groupCopy.groupWidth,
              height: groupCopy.groupHeight
            };
          }
        } else if (autoLayout && !projectGalaxy) {
          const innerWidth = (group.groupWidth || GROUP_MIN_WIDTH) - GROUP_PADDING_X * 2;
          let x = 0, y = 0, rowHeight = 0;
          for (const member of this._orderedLayoutItems(members, placements)) {
            const bounds = geometryById.get(member.entityId);
            if (!bounds) continue;
            if (x > 0 && x + bounds.width > innerWidth) { x = 0; y += rowHeight + spacing.verticalSpacing; rowHeight = 0; }
            const dx = group.x + GROUP_PADDING_X + x - bounds.x;
            const dy = group.y + GROUP_HEADER_HEIGHT + y - bounds.y;
            for (const item of [member, ...placementIndex.descendants(member.entityId)]) {
              const child = geometryById.get(item.entityId);
              if (child) geometryById.set(item.entityId, { ...child, x: child.x + dx, y: child.y + dy });
            }
            x += bounds.width + spacing.horizontalSpacing;
            rowHeight = Math.max(rowHeight, bounds.height);
          }
        }
        const containedMembers = projectGalaxy
          ? members.filter(item => entitiesById.get(item.entityId)?.type !== 'endpoint') : members;
        const memberBounds = containedMembers.map(item => geometryById.get(item.entityId)).filter(Boolean);
        // Manual dimensions are a wrapping constraint, not a minimum size for an
        // automatic container. Fit the newly arranged content in both directions.
        const bounds = projectGalaxy ? {
          x: group.x, y: group.y,
          width: Math.max(GROUP_MIN_WIDTH, Number(group.groupWidth) || GROUP_MIN_WIDTH),
          height: Math.max(GROUP_MIN_HEIGHT, Number(group.groupHeight) || GROUP_MIN_HEIGHT)
        } : autoProjectBounds || (autoLayout ? {
          x: group.x, y: group.y,
          width: Math.max(GROUP_MIN_WIDTH, ...memberBounds.map(rect => rect.x + rect.width - group.x + GROUP_PADDING_X)),
          height: Math.max(GROUP_MIN_HEIGHT, ...memberBounds.map(rect => rect.y + rect.height - group.y + GROUP_PADDING_BOTTOM))
        } : this._placementGeometry(group, placements, new Set(), geometryById));
        if (this._isServerTree()) {
          const union = containedMembers.map(item => geometryById.get(item.entityId)).filter(Boolean);
          if (union.length) {
            const right = Math.max(bounds.x + bounds.width, ...union.map(r => r.x + r.width + GROUP_PADDING_X));
            const bottom = Math.max(bounds.y + bounds.height, ...union.map(r => r.y + r.height + GROUP_PADDING_BOTTOM));
            bounds.x = Math.min(bounds.x, ...union.map(r => r.x - GROUP_PADDING_X));
            bounds.y = Math.min(bounds.y, ...union.map(r => r.y - GROUP_HEADER_HEIGHT));
            bounds.width = right - bounds.x; bounds.height = bottom - bounds.y;
          }
          const originalY = bounds.y;
          for (const previous of resolvedGroups) if (autoLayout && !linkedBranch.has(group.entityId) && previous.groupId === group.groupId && bounds.x < previous.x + previous.width && bounds.x + bounds.width > previous.x && originalY > previous.originalY) {
            bounds.y = Math.max(bounds.y, previous.y + previous.height + Math.max(60, spacing.verticalSpacing));
          }
          const dy = bounds.y - originalY;
          if (dy) for (const item of descendants) {
            const child = geometryById.get(item.entityId); if (child) geometryById.set(item.entityId, { ...child, y: child.y + dy });
          }
          resolvedGroups.push({ ...bounds, originalY, groupId: group.groupId });
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

    _groupDescendants(groupId, placements = this._combinedPlacements(), index = LayoutPrimitives.indexPlacements(placements)) {
      return index.descendants(groupId);
    }

    _materializeGroupGeometry(groupId, geometry = this._displayGeometryMap(this._combinedPlacements())) {
      const placements = this._combinedPlacements();
      const group = this._placementForEntity(groupId);
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

    _autoLayoutGroups() {
      const placements = this._combinedPlacements();
      const placementIndex = LayoutPrimitives.indexPlacements(placements);
      const entities = this._allEntitiesById();
      const blocked = new Set();
      for (const item of placements.filter(item => item.locked)) {
        blocked.add(item.entityId);
        placementIndex.descendants(item.entityId).forEach(child => blocked.add(child.entityId));
      }
      return this._unarchivedPlacements().filter(item => entities.get(item.entityId)?.type === 'group'
        && !blocked.has(item.entityId) && !placementIndex.descendants(item.entityId).some(child => child.locked));
    }

    _updateAllGroupLayoutButton() {
      const button = this.root?.querySelector('[data-relationship-action="toggle-all-group-layouts"]');
      if (!button) return;
      const groups = this._autoLayoutGroups();
      const galaxyProjects = this._boardView().layout === 'galaxy' && groups.some(group => this._isProjectGroup(group.entityId));
      const enabled = groups.length > 0 && groups.every(group => group.groupLayout === 'auto');
      button.disabled = !groups.length;
      button.setAttribute('aria-pressed', String(enabled));
      button.classList.toggle('is-active', enabled);
      button.title = !groups.length ? '当前白板没有可排列的未锁定群组'
        : galaxyProjects ? `重新排列全部 ${groups.filter(group => this._isProjectGroup(group.entityId)).length} 个 Project，容器适应内容；可撤销`
        : enabled ? '关闭全部群组自动排列，保留当前位置和尺寸；可撤销'
          : `开启全部 ${groups.length} 个未锁定群组自动排列，容器适应内容，间距跟随显示设置；可撤销`;
    }

    _toggleAllGroupLayouts() {
      const groups = this._autoLayoutGroups();
      if (!groups.length) return;
      if (this._boardView().layout === 'galaxy' && groups.some(group => this._isProjectGroup(group.entityId))) {
        this._recordMutation();
        groups.forEach(group => { if (this._isProjectGroup(group.entityId)) group.groupLayout = 'auto'; });
        this._arrangeCurrentLayout(); this._renderGraph(); this.fitContent(); this._refreshHistoryButtons(); this._updateSummary();
        this._setCanvasAnnouncement('已重新排列全部 Project 与访问点');
        return;
      }
      this._setGroupLayouts(groups, !groups.every(group => group.groupLayout === 'auto'), true);
    }

    _setGroupLayouts(groups, enabled, arrangeBoard = false) {
      this._recordMutation();
      const before = this._displayGeometryMap(this._combinedPlacements());
      const items = [...new Set(groups.flatMap(group => this._materializeGroupGeometry(group.entityId, before)))];
      groups.forEach(group => { group.groupLayout = enabled ? 'auto' : 'manual'; });
      if (enabled) {
        if (arrangeBoard) {
          // A batch tidy also replaces oversized legacy wrapping widths. A
          // single group's switch/resize still honors its user-chosen width.
          const placements = this._combinedPlacements(), spacing = this._displayViewSettings();
          const placementIndex = LayoutPrimitives.indexPlacements(placements);
          for (const group of [...groups].sort((a, b) => placementIndex.depth(b.entityId) - placementIndex.depth(a.entityId))) {
            const geometry = this._displayGeometryMap(placements);
            const members = placements.filter(item => item.groupId === group.entityId).map(item => geometry.get(item.entityId)).filter(Boolean);
            if (!members.length) continue;
            const columns = Math.ceil(Math.sqrt(members.length));
            group.groupWidth = GROUP_PADDING_X * 2 + columns * Math.max(...members.map(rect => rect.width)) + (columns - 1) * spacing.horizontalSpacing;
          }
        }
        const arranged = this._displayGeometryMap(this._combinedPlacements());
        groups.forEach(group => this._materializeGroupGeometry(group.entityId, arranged));
        if (arrangeBoard && this._boardView().layout !== 'free') this._arrangeCurrentLayout();
      }
      this._saveDynamicPlacementOverrides(items.filter(item => item.dynamic).map(item => item.entityId));
      this._finishBoardMutation();
      if (enabled && arrangeBoard && this._boardView().layout !== 'free') this.fitContent();
    }

    _arrangeProjectGroup(groupId) {
      const group = this._placementForEntity(groupId);
      const entities = this._allEntitiesById();
      if (!group || group.locked || !this._isProjectGroup(groupId)) return false;
      const placements = this._combinedPlacements();
      const includeEndpoints = this._boardView().projectGroupIncludesEndpoints !== false;
      const members = placements.filter(item => item.groupId === groupId
        && (entities.get(item.entityId)?.type === 'deployment'
          || (includeEndpoints && entities.get(item.entityId)?.type === 'endpoint')));
      if (members.some(item => item.locked)) {
        this.notify('Project 中有锁定成员，请先解锁再自动排列', 'warning');
        return false;
      }
      const geometry = this._displayGeometryMap(placements);
      const groupCopy = { ...group };
      const memberCopies = members.map(item => {
        const bounds = geometry.get(item.entityId) || this._nodeDimensions();
        return { ...item, width: bounds.width, height: bounds.height };
      });
      this._recordMutation();
      group.groupLayout = 'auto';
      PanelTopologyProjection.arrangeProjectContainer(groupCopy, memberCopies, {
        ...this._nodeDimensions(),
        ...this._displayViewSettings(),
        projectGroupShape: this._groupShape(groupId),
        preserveCenter: true
      });
      group.x = Math.round(groupCopy.x);
      group.y = Math.round(groupCopy.y);
      group.groupWidth = Math.round(groupCopy.groupWidth);
      group.groupHeight = Math.round(groupCopy.groupHeight);
      const originals = new Map(members.map(item => [item.entityId, item]));
      for (const item of memberCopies) {
        const original = originals.get(item.entityId);
        original.x = Math.round(item.x);
        original.y = Math.round(item.y);
      }
      this._saveDynamicPlacementOverrides([group, ...members].filter(item => item.dynamic).map(item => item.entityId));
      this._finishBoardMutation();
      this._setCanvasAnnouncement(`已按当前间距重新排列 ${members.length} 个 Project 成员`);
      return true;
    }

    _settleProjectDeployment(entityId) {
      const groupId = this._logicalProjectGroupForMember(entityId);
      const group = groupId && this._placementForEntity(groupId);
      if (!group || group.locked) return false;
      const entities = this._allEntitiesById();
      const placements = this._combinedPlacements();
      const includeEndpoints = this._boardView().projectGroupIncludesEndpoints !== false;
      const geometry = this._displayGeometryMap(placements);
      const members = placements.filter(item => item.groupId === groupId
        && (entities.get(item.entityId)?.type === 'deployment'
          || (includeEndpoints && entities.get(item.entityId)?.type === 'endpoint')));
      if (!members.length || members.some(item => item.locked)) return false;
      const memberCopies = members.map(item => {
        const bounds = geometry.get(item.entityId) || this._nodeDimensions();
        return { ...item, width: bounds.width, height: bounds.height };
      }).sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2)
        || (a.x + a.width / 2) - (b.x + b.width / 2)
        || a.entityId.localeCompare(b.entityId));
      const groupCopy = { ...group };
      group.groupLayout = 'auto';
      PanelTopologyProjection.arrangeProjectContainer(groupCopy, memberCopies, {
        ...this._nodeDimensions(),
        ...this._displayViewSettings(),
        projectGroupShape: this._groupShape(groupId),
        preserveCenter: true
      });
      Object.assign(group, {
        x: Math.round(groupCopy.x),
        y: Math.round(groupCopy.y),
        groupWidth: Math.round(groupCopy.groupWidth),
        groupHeight: Math.round(groupCopy.groupHeight)
      });
      const originals = new Map(members.map(item => [item.entityId, item]));
      for (const item of memberCopies) Object.assign(originals.get(item.entityId), {
        x: Math.round(item.x),
        y: Math.round(item.y)
      });
      this._saveDynamicPlacementOverrides([group, ...members].filter(item => item.dynamic).map(item => item.entityId));
      this._persistSoon(0);
      this._renderGraph();
      this._updateSummary();
      this._setCanvasAnnouncement(`已对齐 Project 内 ${members.length} 个成员并保持当前间距`);
      return true;
    }

    _toggleGroupLayout(groupId) {
      const group = this._placementForEntity(groupId);
      if (!group || group.locked || this._allEntitiesById().get(groupId)?.type !== 'group') return;
      if (this._isProjectGroup(groupId)) return this._arrangeProjectGroup(groupId);
      const enabled = group.groupLayout !== 'auto';
      if (enabled && this._groupDescendants(groupId).some(item => item.locked)) {
        this.notify('群组中有锁定成员，请先解锁再开启自动排列', 'warning'); return;
      }
      this._setGroupLayouts([group], enabled);
    }

    _isProjectGroup(entityId) {
      const entity = this._allEntitiesById().get(entityId);
      return entity?.type === 'group' && (entity.runtime?.dynamicKind === 'coolify-project-group'
        || String(entityId).startsWith('entity_panel_projectgroup_'));
    }

    _logicalProjectGroupForMember(entityId) {
      if (this._allEntitiesById().get(entityId)?.type !== 'deployment') return '';
      const groupId = this._placementForEntity(entityId)?.groupId || '';
      return this._isProjectGroup(groupId) ? groupId : '';
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

    _movingEntityIds(entityId, includeLinked = true) {
      const board = activeBoard(this.store);
      if (!board) return [];
      const selectedIds = this._entitySelectionIds();
      return this._expandMovingIds(selectedIds.has(entityId) ? selectedIds : [entityId], includeLinked);
    }

    _expandMovingIds(seeds, includeLinked = true) {
      const board = activeBoard(this.store);
      const placements = this._combinedPlacements(board);
      const byId = new Map(placements.map(item => [item.entityId, item]));
      const entities = this._allEntitiesById();
      const children = new Map();
      const endpointParents = new Map();
      const add = (source, target) => {
        if (!byId.has(source) || !byId.has(target)) return;
        if (!children.has(source)) children.set(source, new Set());
        children.get(source).add(target);
      };
      if (includeLinked) {
        const relationships = this._combinedRelationships(placements);
        for (const edge of relationships) {
          const deploymentId = edge.type === 'exposes' ? edge.sourceId : edge.type === 'exposed_by' ? edge.targetId : '';
          const endpointId = edge.type === 'exposes' ? edge.targetId : edge.type === 'exposed_by' ? edge.sourceId : '';
          if (deploymentId && byId.has(deploymentId) && byId.has(endpointId)) {
            if (!endpointParents.has(endpointId)) endpointParents.set(endpointId, new Set());
            endpointParents.get(endpointId).add(deploymentId);
          }
          if (['contains', 'source_of', 'hosts', 'exposes', 'connects_to', 'has_submodule', 'fork_source_for'].includes(edge.type)) add(edge.sourceId, edge.targetId);
          if (['belongs_to', 'deployed_from', 'runs_on', 'exposed_by', 'submodule_of', 'forked_from'].includes(edge.type)) add(edge.targetId, edge.sourceId);
        }
        // A Project is a containing frame, not a source fact. Include the frame
        // on host -> deployment branches without following repository correlations.
        for (const edge of PanelTopologyProjection.serverTreeGraph({ entities: [...entities.values()], relationships, placements }).hierarchy) add(edge.sourceId, edge.targetId);
      }
      const expand = allowedSharedEndpoints => {
        const queue = [...seeds].map(id => [id, false]);
        const movingIds = new Set(), visited = new Set();
        for (const [id, inherited] of queue) {
          const placement = byId.get(id);
          if (!placement) continue;
          const linked = includeLinked && (inherited || placement.moveWithDescendants === true);
          const key = `${id}:${linked}`;
          if (visited.has(key)) continue;
          visited.add(key); movingIds.add(id);
          if (entities.get(id)?.type === 'group') {
            // Physical group membership always moves with its container.
            for (const item of placements) if (item.groupId === id) queue.push([item.entityId, linked]);
          }
          if (linked) for (const child of children.get(id) || []) {
            const parents = endpointParents.get(child);
            if (allowedSharedEndpoints && parents?.size > 1 && !allowedSharedEndpoints.has(child)) continue;
            queue.push([child, true]);
          }
        }
        return movingIds;
      };
      const provisional = expand();
      const allowedSharedEndpoints = new Set([...endpointParents]
        .filter(([, parents]) => parents.size < 2 || [...parents].every(id => provisional.has(id)))
        .map(([endpointId]) => endpointId));
      return [...expand(allowedSharedEndpoints)];
    }

    _toggleLinkedMovement(entityId) {
      const placement = this._placementForEntity(entityId);
      if (!placement) return false;
      this._recordMutation();
      const geometry = this._displayGeometryMap(this._combinedPlacements());
      placement.moveWithDescendants = !placement.moveWithDescendants;
      const ids = placement.moveWithDescendants ? this._expandMovingIds([entityId]) : [entityId];
      for (const id of ids) {
        const item = this._placementForEntity(id), bounds = geometry.get(id);
        if (!bounds) continue;
        item.x = bounds.x; item.y = bounds.y;
        if (this._allEntitiesById().get(id)?.type === 'group') {
          item.groupWidth = Math.round(bounds.width); item.groupHeight = Math.round(bounds.height);
        }
      }
      this._saveDynamicPlacementOverrides(ids);
      this._finishBoardMutation({ updateSummary: false });
      this._setCanvasAnnouncement(placement.moveWithDescendants ? '已锁定下级链接，拖动时保持整条分支的相对位置' : '已解除下级链接锁定');
      return placement.moveWithDescendants;
    }

    _linkedMoveBlocked(ids) {
      const checked = new Set();
      for (const id of ids) {
        let item = this._placementForEntity(id);
        while (item && !checked.has(item.entityId)) {
          checked.add(item.entityId);
          if (item.locked) {
            this.notify('下级分支或所在群组中有位置已锁定的元素，请先解锁位置再拖动。', 'warning');
            return true;
          }
          item = item.groupId && this._placementForEntity(item.groupId);
        }
      }
      return false;
    }

    _prepareLinkedMove(ids, geometry) {
      const moving = new Set(ids), changed = new Set(ids), parents = new Set();
      for (const id of ids) {
        let parent = this._placementForEntity(id)?.groupId;
        const seen = new Set();
        while (parent && !seen.has(parent)) {
          seen.add(parent);
          if (!moving.has(parent) && !this._isProjectGroup(parent) && geometry.has(parent)
            && this._placementForEntity(parent)?.groupLayout === 'auto') parents.add(parent);
          parent = this._placementForEntity(parent)?.groupId;
        }
      }
      for (const id of parents) {
        for (const item of this._materializeGroupGeometry(id, geometry)) changed.add(item.entityId);
        this._placementForEntity(id).groupLayout = 'manual';
      }
      // Materialize full moving frames so saved geometry matches the grab point.
      for (const id of ids) if (this._allEntitiesById().get(id)?.type === 'group') this._materializeGroupGeometry(id, geometry);
      if (parents.size) this.notify('为保留手动拖动的位置，所在群组已切换为手动排列；可撤销恢复。');
      return [...changed];
    }

    _canJoinGroup(entityId, groupId, context = {}) {
      if (!groupId) return true;
      const entities = context.entities || this._allEntitiesById();
      if (activeBoard(this.store)?.placements.some(item => item.entityId === entityId)
        && entities.get(groupId)?.transient) return false;
      const index = context.index || LayoutPrimitives.indexPlacements(context.placements || this._combinedPlacements());
      return entities.get(groupId)?.type === 'group' && index.canNest(entityId, groupId);
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

    _entityRuntimeTone(entity) {
      const availability = this._entityAvailability(entity);
      if (availability.missing) return 'inactive';
      const status = this._entityRuntimeStatus(entity);
      if (!status) return ['project', 'repository'].includes(entity?.type) ? 'normal' : 'inactive';
      if (['deploy-failed', 'deploy-error', 'fault'].includes(status.state)) return 'warning';
      if (['stopped', 'offline', 'unknown'].includes(status.state)) return 'inactive';
      return 'normal';
    }

    _filteredGraph() {
      const board = activeBoard(this.store);
      if (!board) return { placements: [], relationships: [], summaryRelationships: [], directIds: new Set(), contextualIds: new Set(), mutedIds: new Set(), filterActive: false };
      const view = this._boardView();
      const entitiesById = this._allEntitiesById();
      const placements = this._unarchivedPlacements();
      const boardRelationships = this._combinedRelationships(placements);
      const now = this.now();
      const graph = GraphProjection.filterGraph({
        view,
        entitiesById,
        placements,
        relationships: boardRelationships,
        unmatchedDisplay: this._displayViewSettings(view).unmatchedDisplay,
        matchesEntity: (entity, placement) => GraphProjection.entityMatchesView({
          entity,
          view,
          resource: entity.refId ? this.resourceMap.get(`${entity.type}:${entity.refId}`) : null,
          placement,
          model: Model,
          typeLabels: TYPE_LABELS,
          now,
          runtimeTone: candidate => this._entityRuntimeTone(candidate),
          normalizeAnnotations: normalizePlacementAnnotations
        })
      });
      if (this._isServerTree()) {
        const tree = PanelTopologyProjection.serverTreeGraph({ ...graph, entities: [...entitiesById.values()] }, view.showRepositoryRelations);
        return { ...graph, ...tree };
      }
      return GraphProjection.deploymentSummaryProjection({
        graph,
        entitiesById,
        projection: view.projection,
        model: Model,
        now
      });
    }

    render() {
      this._closeContextMenu();
      const board = activeBoard(this.store);
      if (!this.container || !board) return;
      this.flowCanvas?.unmount?.();
      this.flowCanvas = null;
      this.flowRenderOptions = null;
      board.view = { ...Model.defaultBoardView(), ...(board.view || {}) };
      const displayView = this._displayViewSettings(board.view);
      const boardOptions = this.store.boards.map(candidate => (
        `<option value="${escapeHtml(candidate.id)}"${candidate.id === board.id ? ' selected' : ''}>${escapeHtml(candidate.name)}</option>`
      )).join('');
      const environmentOptions = this._environmentOptions(board.view.environment);
      const labels = [...new Set(this._combinedPlacements(board)
        .flatMap(placement => normalizePlacementAnnotations(placement).labels || []))]
        .sort((left, right) => left.localeCompare(right, 'zh-CN'));
      const panelStatus = this._panelStatusView();
      const displayPopover = ToolbarView.displayPopover({ view: displayView, boardView: board.view,
        serverTree: this._isServerTree(), icon: toolbarIcon('display'), escapeHtml });
      const filterPopover = ToolbarView.filterPopover({ view: {
        ...displayView,
        selectedEntityTypes: GraphProjection.selectedEntityTypes(board.view),
        selectedTaskFilters: GraphProjection.selectedTaskFilters(board.view),
        selectedRuntimeStates: GraphProjection.selectedRuntimeStates(board.view)
      }, boardView: board.view, entityTypes: Model.ENTITY_TYPES, typeLabels: TYPE_LABELS,
      verificationFilters: Model.VERIFICATION_FILTERS, verificationLabels: VERIFICATION_LABELS,
      environmentOptions, labels, icon: toolbarIcon('filter'), escapeHtml });
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
            <div class="relationship-panel-status" data-state="${escapeHtml(panelStatus.state)}">
              <span data-panel-topology-status title="${escapeHtml(panelStatus.title)}">${escapeHtml(panelStatus.label)}</span>
              <button class="relationship-tool-button" data-relationship-action="refresh-panel" type="button" title="刷新 Coolify 动态拓扑" aria-label="刷新 Coolify 动态拓扑">↻</button>
              <button class="relationship-tool-button relationship-icon-tool" data-relationship-action="check-endpoints" type="button" title="重新检测全部访问点（本机 HTTP 检测）" aria-label="重新检测全部访问点（本机 HTTP 检测）">◉</button>
            </div>
            ${displayPopover}
            ${filterPopover}
            ${ToolbarView.addMenu(toolbarIcon('add'))}
            <span class="relationship-toolbar-divider" aria-hidden="true"></span>
            <button class="relationship-tool-button" data-relationship-action="undo" type="button" title="撤销 (⌘Z)" ${this.undoStack.length ? '' : 'disabled'}>↶</button>
            <button class="relationship-tool-button" data-relationship-action="redo" type="button" title="重做 (⇧⌘Z)" ${this.redoStack.length ? '' : 'disabled'}>↷</button>
            <button class="relationship-tool-button relationship-icon-tool" data-relationship-action="fit" type="button" aria-label="适合内容" title="适合内容：将整个白板放入视图">${toolbarIcon('fit')}</button>
            ${this._layoutMenuHtml()}
            <button class="relationship-tool-button relationship-all-group-layout" data-relationship-action="toggle-all-group-layouts" type="button" aria-label="全部自动排列" aria-pressed="false" title="开启全部群组自动排列">${toolbarIcon('layout')}<span>全部自动排列</span></button>
            <span class="relationship-save-state" data-state="${this.saveState}" role="status">${this._saveLabel()}</span>
          </header>
          <div class="relationship-body">
            <div class="relationship-panel-dock relationship-inline-left-dock" data-panel-dock="left"></div>
            <aside class="relationship-resource-panel relationship-dock-component" data-panel-id="library" id="relationship-resource-panel" aria-label="白板资源库">
              <div class="relationship-resource-heading">
                <button class="relationship-resource-library-trigger" type="button" data-panel-collapse="library" aria-label="折叠或展开资源库"><span>资源库</span><span class="relationship-library-disclosure" aria-hidden="true">▼</span></button>
                <div class="relationship-resource-heading-actions">
                  <span data-resource-total></span>
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
              <div class="relationship-topology-alerts">
                <button class="relationship-topology-alert-trigger" data-relationship-action="toggle-topology-alerts" type="button" aria-haspopup="dialog" aria-expanded="false" hidden><span aria-hidden="true">!</span><span>配置警报</span><b>0</b></button>
                <section class="relationship-topology-alert-popover" role="dialog" aria-label="拓扑配置警报" hidden>
                  <header><div><strong>拓扑配置警报</strong><small>只读诊断，不会修改 Coolify</small></div><b data-topology-alert-count>0 条</b></header>
                  <div data-topology-alert-list></div>
                </section>
              </div>
              <div class="relationship-flow-root" data-relationship-flow-root></div>
              <div class="relationship-projection-note" hidden>部署摘要 · 派生显示，不修改关系事实</div>
            </div>
            <aside class="relationship-inspector-panel relationship-dock-component" data-panel-id="inspector" aria-label="关系详情" hidden></aside>
            <div class="relationship-panel-dock relationship-right-dock" data-panel-dock="right"></div>
          </div>
          <div class="relationship-context-menu" role="menu" aria-label="白板右键菜单" hidden></div>
        </section>`;
      this.root = this.container.querySelector('.relationship-workspace');
      this.root.classList.add('uses-react-flow');
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
      this.root.addEventListener('click', event => this._handleClick(event));
      this.root.addEventListener('change', event => this._handleChange(event));
      this.root.addEventListener('input', event => this._handleInput(event));
      this.root.addEventListener('submit', event => this._handleSubmit(event));
      this.root.addEventListener('dragstart', event => this._handleDragStart(event));
      this.root.addEventListener('dragover', event => this._handleDragOver(event));
      this.root.addEventListener('drop', event => this._handleDrop(event));
      this.root.addEventListener('dragend', () => this._clearPanelDrag());
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
        items.push(context(single?.type === 'group' ? '群组设置…' : '查看属性…', 'inspector'));
        if (single && ['text', 'image', 'attachment'].includes(single.type)) items.push(context('编辑内容 / 名称…', 'edit-element'));
        else if (single) items.push(context(single.type === 'group' ? '重命名群组…' : '重命名 / 显示别名…', 'rename'), context('备注、标签与待办…', 'annotations'));
        if (single && !(single.type === 'group' && single.transient)) items.push(command('围绕我布局', 'arrange-around-selection'));
        if (single?.type === 'deployment') items.push(command('归档部署（仅当前白板）', 'archive-selected-deployment'));
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
          command('适合画布', 'fit'), command('按类别分列', 'arrange-by-category'), command('初始化分组（Coolify Projects）', 'arrange-by-coolify-projects'), command('服务器为中心', 'arrange-around-servers'));
      }
      items.push(null, command('撤销', 'undo', !this.undoStack.length), command('重做', 'redo', !this.redoStack.length));
      return items;
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
      const fact = this._selectedFact()?.value;
      const group = fact?.type === 'group' && !fact.transient;
      const selector = action === 'rename' ? (group ? '[name="name"]' : '[name="placementTitleText"]')
        : action === 'annotations' ? '[name="placementNote"]' : 'form input, form select, [data-edit-canvas-element]';
      this._revealInspector(selector);
    }

    _revealInspector(selector = 'form input, form select, [data-edit-canvas-element]') {
      if (this.panelLayout.inspector?.collapsed) {
        this.panelLayout.inspector = { ...this.panelLayout.inspector, collapsed: false };
        this._savePanelLayout();
      }
      this._updateSelectionCss({ preserveDirtyInspector: true });
      this._placePanelComponents();
      const panel = this._panelElement('.relationship-inspector-panel');
      const field = panel?.querySelector(selector);
      const details = field?.closest('details');
      if (details) details.open = true;
      field?.scrollIntoView({ block: 'nearest' });
      field?.focus({ preventScroll: true });
    }

    _hideInspector() {
      const panel = this._panelElement('.relationship-inspector-panel');
      if (panel) { panel.hidden = true; panel.innerHTML = ''; }
      this.root?.querySelector('.relationship-body')?.classList.remove('has-inspector');
      this._applyResourcePanelPosition();
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
      const style = event.target.closest('[data-board-layout]')?.dataset.boardLayout;
      if (style) { this._closeLayoutMenu(); this._setLayout(style); this.root?.querySelector('[data-layout-menu="layout"]')?.focus(); return; }
      const structure = event.target.closest('[data-board-structure]')?.dataset.boardStructure;
      if (structure) { this._closeLayoutMenu(); this._setStructure(structure); this.root?.querySelector('[data-layout-menu="structure"]')?.focus(); return; }
      if (action !== 'toggle-layout-menu') this._closeLayoutMenu();
      const directAction = ActionRouter?.resolve(action);
      if (directAction) {
        const [method, args = [], closeAddMenu = false, focusSelector = ''] = directAction;
        if (closeAddMenu) this._closeAddMenu();
        this[method](...args);
        if (focusSelector) this.root?.querySelector(focusSelector)?.focus();
        if (ActionRouter.dismissesTransientMenus(action)) {
          if (!event.target.closest('.relationship-filter-host')) this._closeFilterPopover();
          if (!event.target.closest('.relationship-menu-host')) this._closeAddMenu();
          if (!event.target.closest('.relationship-display-host')) this._closeDisplayPopover();
        }
        return;
      }
      if (action === 'toggle-layout-menu') {
        const trigger = event.target.closest('.relationship-layout-trigger');
        const menu = trigger.closest('.relationship-layout-host').querySelector('.relationship-layout-menu');
        const opening = menu.hidden;
        this._closeLayoutMenu();
        menu.hidden = !opening; trigger.setAttribute('aria-expanded', String(opening));
        if (!menu.hidden) {
          this._closeAddMenu(); this._closeFilterPopover(); this._closeDisplayPopover();
          menu.style.transform = '';
          const rect = menu.getBoundingClientRect(), view = menu.ownerDocument.defaultView;
          const workspace = this.root.getBoundingClientRect();
          menu.style.transform = `translateX(${Math.max(Math.max(12, workspace.left + 8) - rect.left, Math.min(0, Math.min(view.innerWidth - 12, workspace.right - 8) - rect.right))}px)`;
          menu.style.maxHeight = `${Math.max(160, view.innerHeight - rect.top - 12)}px`;
          (menu.querySelector('button[aria-checked="true"]') || menu.querySelector('button'))?.focus();
        }
        return;
      }
      if (action === 'toggle-topology-alerts') {
        const popover = this.root.querySelector('.relationship-topology-alert-popover');
        const trigger = this.root.querySelector('.relationship-topology-alert-trigger');
        const opening = popover.hidden;
        this._closeTopologyAlerts();
        popover.hidden = !opening;
        trigger.setAttribute('aria-expanded', String(opening));
        if (opening) {
          this._closeLayoutMenu(); this._closeFilterPopover(); this._closeDisplayPopover(); this._closeAddMenu();
          popover.querySelector('summary, button:not(:disabled)')?.focus({ preventScroll: true });
        }
        return;
      }
      const archiveId = event.target.closest('[data-archive-deployment]')?.dataset.archiveDeployment;
      if (archiveId || action === 'archive-selected-deployment') { this._setDeploymentArchived(archiveId || this.selectedEntityId, true); return; }
      const documentButton = event.target.closest('[data-open-document]');
      if (documentButton) { void this._openDocument(documentButton.dataset.openDocument); return; }
      if (event.target.closest('[data-document-home]')) { void this._showLocalWorkspace(); return; }
      const removeDocument = event.target.closest('[data-remove-document], [data-trash-document]');
      if (removeDocument) { void this._removeDocument(removeDocument.dataset.removeDocument || removeDocument.dataset.trashDocument, Boolean(removeDocument.dataset.trashDocument)).catch(error => this.notify(error.message, 'error')); return; }
      const reveal = event.target.closest('[data-reveal-asset]');
      if (reveal && this.documentRecord) { void this.bridge.relationshipBoards.revealAsset({ id: this.documentRecord.id, entityId: reveal.dataset.revealAsset }).catch(error => this.notify(error.message, 'error')); return; }
      const editElement = event.target.closest('[data-edit-canvas-element]');
      if (editElement) { void this._editCanvasElement(editElement.dataset.editCanvasElement); return; }
      const lockElement = event.target.closest('[data-lock-canvas-element]');
      if (lockElement) {
        this._recordMutation();
        const placement = this._placementForEntity(lockElement.dataset.lockCanvasElement);
        if (placement.locked) delete placement.locked; else placement.locked = true;
        this._persistSoon(0); this._renderGraph(); return;
      }
      const linkedMovement = event.target.closest('[data-lock-descendants]');
      if (linkedMovement) { this._toggleLinkedMovement(linkedMovement.dataset.lockDescendants); return; }
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
        board.view = this._filterFreeView();
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
      if (action === 'close-resource-panel') {
        this.resourcePanelVisible = false;
        this._syncResourcePanelVisibility();
        return;
      }
      if (action === 'project-endpoints') { this._setProjectEndpoints(!this._boardView().projectGroupIncludesEndpoints); return; }
      if (action === 'repository-relations') {
        this._recordMutation();
        const view = this._boardView();
        view.showRepositoryRelations = !view.showRepositoryRelations;
        this._persistSoon(0); this.render(); this._refreshHistoryButtons();
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
      if (action === 'assign-selection-group') {
        const groupId = this.root.querySelector('[data-relationship-group-target]')?.value || '';
        this._assignSelectionToGroup(groupId);
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
        this._locateRepositoryOnBoard(revealRepositoryId, event.target.closest('[data-panel-reveal-repository]').dataset.deploymentId);
        return;
      }

      const openRepositoryId = event.target.closest('[data-panel-open-repository]')?.dataset.panelOpenRepository;
      const systemRepositoryId = event.target.closest('[data-panel-system-repository]')?.dataset.panelSystemRepository;
      if (openRepositoryId || systemRepositoryId) {
        void this._openRepositoryDirectory(openRepositoryId || systemRepositoryId, Boolean(systemRepositoryId));
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

      if (!event.target.closest('.relationship-filter-host')) this._closeFilterPopover();
      if (!event.target.closest('.relationship-menu-host')) this._closeAddMenu();
      if (!event.target.closest('.relationship-display-host')) this._closeDisplayPopover();
    }

    _handleChange(event) {
      if (event.target.matches('select[data-selected-group-shape]')) {
        this._setGroupShape(event.target.dataset.selectedGroupShape, event.target.value);
        return;
      }
      if (event.target.matches('select[data-selected-group-appearance]')) {
        this._setGroupAppearance(event.target.dataset.selectedGroupAppearance, event.target.value);
        return;
      }
      if (event.target.matches('[data-project-endpoints]')) {
        this._setProjectEndpoints(event.target.checked);
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
      this.inspectorPinned = false;
      this._clearEntitySelection();
      this.selectedRelationshipId = '';
      this._persistSoon(0);
      this._setPanelTopology(this.panelTopologyResult);
      this.render();
    }

    _handleInput(event) {
      if (event.target.matches('[data-project-endpoints]')) return;
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

    _closeLayoutMenu(restoreFocus = false) {
      for (const menu of this.root?.querySelectorAll?.('.relationship-layout-menu') || []) {
        const wasOpen = !menu.hidden;
        menu.hidden = true;
        const trigger = menu.parentElement.querySelector('.relationship-layout-trigger');
        trigger?.setAttribute('aria-expanded', 'false');
        if (restoreFocus && wasOpen) trigger?.focus();
      }
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
      form.elements.namedItem('groupTitleFontSize').value = String(display.groupTitleFontSize);
      form.elements.namedItem('horizontalSpacing').value = String(display.horizontalSpacing);
      form.elements.namedItem('verticalSpacing').value = String(display.verticalSpacing);
      form.elements.namedItem('cardAppearance').value = display.cardAppearance;
      form.elements.namedItem('projectGroupShape').value = display.projectGroupShape;
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
      const groupTitleOutput = form.querySelector('[data-display-group-title-size]');
      const horizontalSpacingOutput = form.querySelector('[data-display-horizontal-spacing]');
      const verticalSpacingOutput = form.querySelector('[data-display-vertical-spacing]');
      const statusTintOutput = form.querySelector('[data-display-status-tint]');
      const contextOpacityOutput = form.querySelector('[data-display-context-opacity]');
      const mutedOpacityOutput = form.querySelector('[data-display-muted-opacity]');
      const matchHaloOutput = form.querySelector('[data-display-match-halo]');
      if (cardOutput) cardOutput.textContent = `${Math.round(display.cardScale * 100)}%`;
      if (textOutput) textOutput.textContent = `${Math.round(display.textScale * 100)}%`;
      if (groupTitleOutput) groupTitleOutput.textContent = `${Math.round(display.groupTitleFontSize)} px`;
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
        groupTitleFontSize: displayNumber('groupTitleFontSize', currentDisplay.groupTitleFontSize, 14, 36),
        horizontalSpacing: displayNumber('horizontalSpacing', currentDisplay.horizontalSpacing, 16, 180),
        verticalSpacing: displayNumber('verticalSpacing', currentDisplay.verticalSpacing, 16, 140),
        cardAppearance: String(data.get('cardAppearance') || '') === 'flat' ? 'flat' : 'elevated',
        projectGroupShape: Model.PROJECT_GROUP_SHAPES.includes(String(data.get('projectGroupShape') || '')) ? String(data.get('projectGroupShape')) : 'rounded',
        cardTitleSource: String(data.get('cardTitleSource') || '') === 'note' ? 'note' : 'name',
        showGrid: form.elements.namedItem('showGrid').checked,
        showEdgeLabels: form.elements.namedItem('showEdgeLabels').checked,
        showRuntimeStatus: form.elements.namedItem('showRuntimeStatus').checked,
        statusTintOpacity: displayNumber('statusTintOpacity', currentDisplay.statusTintOpacity, 0, 0.18),
        filterContextOpacity: displayNumber('filterContextOpacity', currentDisplay.filterContextOpacity, 0.15, 0.8),
        filterMutedOpacity: displayNumber('filterMutedOpacity', currentDisplay.filterMutedOpacity, 0.03, 0.4),
        filterMatchHaloOpacity: displayNumber('filterMatchHaloOpacity', currentDisplay.filterMatchHaloOpacity, 0, 0.6)
      };
      const projectShapeChanged = board.view.projectGroupShape !== currentDisplay.projectGroupShape;
      const galaxyShapeChanged = projectShapeChanged && board.view.layout === 'galaxy';
      const geometryChanged = ['mode', 'cardScale', 'cardWidth', 'cardHeight', 'textScale', 'groupTitleFontSize', 'horizontalSpacing', 'verticalSpacing', 'showRuntimeStatus']
        .some(key => board.view[key] !== currentDisplay[key]);
      if ((geometryChanged || galaxyShapeChanged) && !this.displayLayoutEdit) {
        this._pushUndoSnapshot(before.history);
        this.displayLayoutEdit = before;
      }
      this._applyViewMode();
      this._syncDisplayForm();
      this._persistSoon(160);
      if (galaxyShapeChanged) {
        this._arrangeCurrentLayout();
        this._renderGraph();
      } else this._renderGraph(geometryChanged ? before : null);
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
      const catalog = this._resourceCatalog();
      this.resourceMap = new Map(catalog.map(resource => [resource.key, resource]));
      const total = this._panelElement('[data-resource-total]');
      if (total) total.textContent = String(catalog.length);
      for (const dock of this._panelDocks()) dock?.querySelectorAll(':scope > [data-resource-section]').forEach(item => item.remove());
      list.innerHTML = ResourceView.render({ items: catalog, query: this.resourceSearch, collapsed: this.collapsedResourceSections,
        typeIcons: TYPE_ICONS, escapeHtml, panelMoveControls: (key, label) => this._panelMoveControls(key, label) });
      this._placePanelComponents();
    }

    _flowGraphInput(graph, alerts = this._topologyAlerts()) {
      const sourceEntities = this._allEntitiesById();
      const geometry = this._displayGeometryMap(graph.placements);
      const entities = graph.placements.map(placement => {
        const source = sourceEntities.get(placement.entityId);
        if (!source) return null;
        const asset = source.type === 'image' ? this.documentAssets.get(source.id) : null;
        return {
          ...source,
          name: this._entityDisplayName(source),
          ...(asset?.imageData ? { details: { ...source.details, imageData: asset.imageData } } : {})
        };
      }).filter(Boolean);
      const placements = graph.placements.map(placement => {
        const rect = geometry.get(placement.entityId)
          || this._placementGeometry(placement, graph.placements, new Set(), geometry);
        return {
          ...placement,
          x: rect.x,
          y: rect.y,
          ...(sourceEntities.get(placement.entityId)?.type === 'group'
            ? { groupWidth: rect.width, groupHeight: rect.height, groupShape: this._groupShape(placement.entityId) }
            : { cardWidth: rect.width, cardHeight: rect.height })
        };
      });
      const summaryRelationships = (graph.summaryRelationships || []).map(summary => ({
        ...summary,
        id: summary.id,
        sourceId: summary.sourceId,
        targetId: summary.targetId,
        label: summary.label || ''
      }));
      const alertByRelationshipId = new Map(alerts.flatMap(alert => alert.relationshipIds.map(id => [id, alert])));
      const relationships = graph.relationships.map(relationship => {
        const alert = alertByRelationshipId.get(relationship.id);
        return alert ? {
          ...relationship,
          diagnostic: { alertId: alert.id, code: alert.type, severity: alert.severity }
        } : relationship;
      });
      return { entities, placements, relationships: [...relationships, ...summaryRelationships] };
    }

    _handleFlowModelChange(next) {
      if (!next?.nodes?.length || !globalThis.RelationshipCanvasEngine?.toPlacements) return;
      const current = this._combinedPlacements();
      const changed = globalThis.RelationshipCanvasEngine.toPlacements(next.nodes, current);
      const dynamicIds = [];
      let persistentChanged = false;
      let anyChanged = false;
      for (const candidate of changed) {
        const placement = this._placementForEntity(candidate.entityId);
        if (!placement) continue;
        const fields = ['x', 'y', 'groupWidth', 'groupHeight'];
        if (!fields.some(field => Number.isFinite(candidate[field]) && candidate[field] !== placement[field])) continue;
        if (!this.flowMutationActive) {
          this._recordMutation();
          this.flowMutationActive = true;
        }
        for (const field of fields) {
          if (Number.isFinite(candidate[field])) placement[field] = Math.round(candidate[field] * 100) / 100;
        }
        anyChanged = true;
        if (placement.dynamic) dynamicIds.push(placement.entityId);
        else persistentChanged = true;
      }
      if (!anyChanged) return;
      if (dynamicIds.length) this._saveDynamicPlacementOverrides(dynamicIds);
      if (persistentChanged) this._persistSoon(160);
      this._updateSummary();
    }

    _handleFlowSelection({ nodeIds = [], edgeIds = [] } = {}) {
      if (this.flowSelectionSync) return;
      const nextNodes = new Set(nodeIds);
      const nextEdge = nextNodes.size ? '' : (edgeIds[0] || '');
      const currentNodes = this._entitySelectionIds();
      if (nextEdge === this.selectedRelationshipId && nextNodes.size === currentNodes.size
        && [...nextNodes].every(id => currentNodes.has(id))) return;
      this._setEntitySelection(nextNodes, nodeIds.at(-1) || '');
      this.selectedRelationshipId = nextEdge;
      const groupOnly = nextNodes.size === 1 && this._allEntitiesById().get(nodeIds[0])?.type === 'group';
      this._updateSelectionCss({ preserveDirtyInspector: true, syncFlow: false, renderInspector: !groupOnly });
      if (groupOnly) this._hideInspector();
      this._updateSummary();
    }

    _handleFlowViewportChange(viewport) {
      const board = activeBoard(this.store);
      if (!board || !viewport) return;
      const next = { x: Number(viewport.x) || 0, y: Number(viewport.y) || 0, zoom: Number(viewport.zoom) || 1 };
      if (Math.abs(board.viewport.x - next.x) < 0.01 && Math.abs(board.viewport.y - next.y) < 0.01
        && Math.abs(board.viewport.zoom - next.zoom) < 0.0001) return;
      board.viewport = next;
      this._persistSoon(220);
    }

    _openFlowContextMenu(kind, value, point = {}) {
      if (kind === 'node' && value?.id) this._selectOnlyEntity(value.id);
      else if (kind === 'relationship' && value?.id) {
        this._clearEntitySelection();
        this.selectedRelationshipId = value.id;
      } else {
        this._clearEntitySelection();
        this.selectedRelationshipId = '';
      }
      this._updateSelectionCss({ preserveDirtyInspector: true });
      this._updateSummary();
      const menu = this.root?.querySelector('.relationship-context-menu');
      if (!menu) return;
      const clientX = Number(point.clientX) || 0;
      const clientY = Number(point.clientY) || 0;
      this.contextMenuPoint = this._clientToWorld(clientX, clientY);
      menu.innerHTML = this._contextMenuItems(kind).map(item => {
        if (!item) return '<div class="relationship-menu-separator" role="separator"></div>';
        const attribute = item.contextAction ? `data-board-context-action="${item.contextAction}"`
          : item.nodeType ? `data-add-node-type="${item.nodeType}"` : `data-relationship-action="${item.action}"`;
        return `<button role="menuitem" type="button" ${attribute}${item.disabled ? ' disabled' : ''}${item.contextAction === 'delete' ? ' class="is-destructive"' : ''}>${escapeHtml(item.label)}</button>`;
      }).join('');
      menu.hidden = false;
      const view = menu.ownerDocument.defaultView;
      menu.style.left = `${Math.max(8, Math.min(clientX, view.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(clientY, view.innerHeight - menu.offsetHeight - 8))}px`;
      menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    }

    _handleFlowAction(action, value, point) {
      if (action === 'toggle-descendants' && typeof value === 'string') return this._toggleLinkedMovement(value);
      if (action === 'toggle-endpoint-view' && value?.type === 'endpoint') {
        const placement = this._placementForEntity(value.id);
        if (!placement) return false;
        this._recordMutation();
        if (placement.endpointView === 'web') delete placement.endpointView;
        else placement.endpointView = 'web';
        if (placement.dynamic) this._saveDynamicPlacementOverrides([value.id]);
        this._finishBoardMutation({ updateSummary: false });
        return true;
      }
      if (action === 'edit-canvas-element' && ['text', 'image', 'attachment'].includes(value?.type)) {
        void this._editCanvasElement(value.id);
        return true;
      }
      if (action === 'open-endpoint') {
        const url = this._endpointUrl(value);
        if (url) void this.bridge.panel?.openExternal?.(url).catch(error => this.notify(`无法打开网页：${error?.message || error}`, 'error'));
        return;
      }
      if (action === 'context-node') return this._openFlowContextMenu('node', value, point);
      if (action === 'context-edge') return this._openFlowContextMenu('relationship', value, point);
      if (action === 'context-pane') return this._openFlowContextMenu('canvas', null, point);
      if (!value?.id) return;
      if (action === 'select-group' || action === 'arrange-group') {
        this._selectOnlyEntity(value.id);
        this._updateSelectionCss({ renderInspector: false });
        this._hideInspector();
        if (action === 'arrange-group') return this._toggleGroupLayout(value.id);
        return;
      }
      if (action === 'resize-start') {
        if (!this.flowMutationActive) this._recordMutation();
        this.flowMutationActive = true;
        return;
      }
      if (action === 'resize-end') {
        this.flowMutationActive = false;
        this._persistSoon(80);
        this._refreshHistoryButtons();
        return;
      }
      this._selectOnlyEntity(value.id);
      this._updateSelectionCss();
      if (action === 'delete-group') return this._deleteSelection();
      if (action === 'edit-group') return this._revealInspector('[name="name"]');
      if (action === 'details') return this._revealInspector();
    }

    _renderFlowGraph() {
      const board = activeBoard(this.store);
      const host = this.root?.querySelector('[data-relationship-flow-root]');
      if (!board || !host || !globalThis.RelationshipCanvasEngine?.mount) return false;
      this._updateAllGroupLayoutButton();
      const graph = this._filteredGraph();
      const view = this._boardView();
      const display = this._displayViewSettings(view);
      const visibleIds = new Set(graph.placements.map(placement => placement.entityId));
      this._pruneEntitySelection(visibleIds);
      if (this.selectedRelationshipId && !graph.relationships.some(item => item.id === this.selectedRelationshipId)) this.selectedRelationshipId = '';
      this.root.dataset.filterActive = String(graph.filterActive);
      this.root.dataset.serverTree = String(this._isServerTree());
      this.root.dataset.activeBoardLayout = view.layout;
      this.root.dataset.projectGroupShape = display.projectGroupShape;
      const topologyAlerts = this._topologyAlerts();
      this._updateTopologyAlerts(topologyAlerts);
      const dimensions = this._nodeDimensions(display);
      const linkedNodeIds = Object.fromEntries(graph.placements.map(placement => [
        placement.entityId,
        placement.moveWithDescendants === true ? this._expandMovingIds([placement.entityId]) : [placement.entityId]
      ]));
      const placementById = new Map(graph.placements.map(placement => [placement.entityId, placement]));
      const undraggableIds = new Set();
      for (const placement of graph.placements) {
        let current = placement;
        const seen = new Set();
        while (current && !seen.has(current.entityId)) {
          seen.add(current.entityId);
          if (current.locked) { undraggableIds.add(placement.entityId); break; }
          current = current.groupId ? placementById.get(current.groupId) : null;
        }
        if ((linkedNodeIds[placement.entityId] || []).some(id => placementById.get(id)?.locked)) undraggableIds.add(placement.entityId);
      }
      const model = globalThis.RelationshipCanvasEngine.toFlowModel(this._flowGraphInput(graph, topologyAlerts), {
        cardWidth: dimensions.width,
        cardHeight: dimensions.height,
        showRuntimeStatus: display.showRuntimeStatus,
        selectedIds: this._entitySelectionIds(),
        selectedRelationshipId: this.selectedRelationshipId,
        directIds: graph.directIds,
        contextualIds: graph.contextualIds,
        mutedIds: graph.mutedIds,
        linkedNodeIds,
        undraggableIds,
        zoom: board.viewport.zoom,
        groupTitleFontSize: display.groupTitleFontSize
      });
      this.flowRenderOptions = {
        model,
        fitView: false,
        initialViewport: board.viewport,
        snapMode: view.snapMode || 'smart',
        horizontalSpacing: display.horizontalSpacing,
        verticalSpacing: display.verticalSpacing,
        groupTitleFontSize: display.groupTitleFontSize,
        onModelChange: next => this._handleFlowModelChange(next),
        onSelectionChange: selection => this._handleFlowSelection(selection),
        onInteractionStart: (kind, node) => {
          if (!this.flowMutationActive) this._recordMutation();
          this.flowMutationActive = true;
          if (kind === 'move' && node?.id) {
            const movingIds = linkedNodeIds[node.id] || [node.id];
            const geometry = this._displayGeometryMap(this._combinedPlacements());
            const changedIds = this._prepareLinkedMove(movingIds, geometry);
            this._saveDynamicPlacementOverrides(changedIds.filter(id => this._placementForEntity(id)?.dynamic));
            this._persistSoon(0);
          }
        },
        onInteractionEnd: (kind, node) => {
          if (kind === 'move' && node?.id) this._settleProjectDeployment(node.id);
          this.flowMutationActive = false;
          this._persistSoon(80);
          this._refreshHistoryButtons();
        },
        onViewportChange: viewport => this._handleFlowViewportChange(viewport),
        onAction: (action, value, point) => this._handleFlowAction(action, value, point)
      };
      if (this.flowCanvas) this.flowCanvas.update(this.flowRenderOptions);
      else this.flowCanvas = globalThis.RelationshipCanvasEngine.mount(host, this.flowRenderOptions);
      this._updateSelectionCss({ preserveDirtyInspector: true, syncFlow: false });
      return true;
    }

    _renderGraph(before) {
      if (before) this._reflowDisplayLayout(before);
      if (!this._renderFlowGraph()) {
        throw new Error('React Flow 关系白板引擎未加载');
      }
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

    _endpointUrl(entity) {
      if (entity?.type !== 'endpoint') return '';
      const value = String(entity.runtime?.url || entity.details?.urlLabel || '').trim();
      try {
        const parsed = new URL(value);
        return ['http:', 'https:'].includes(parsed.protocol) ? value : '';
      } catch (_) { return ''; }
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
      if (GraphProjection.hasActiveFilters(board.view) || board.view.projection !== 'facts') {
        board.view = this._filterFreeView({ projection: 'facts' });
      }
      this._selectOnlyEntity(entityId);
      this._renderAndCenterEntity(entityId, placement, board);
      this._updateFilterSummary();
      this._updateSummary();
      this._setCanvasAnnouncement(`已在当前白板定位 ${this._entityDisplayName(entity)}`);
      return true;
    }

    _renderAndCenterEntity(entityId, placement, board = activeBoard(this.store)) {
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
      if (!this.flowCanvas?.setCenter) return;
      const geometry = this._displayGeometryMap(this._combinedPlacements(board)).get(entityId);
      if (geometry) requestAnimationFrame(() => void this.flowCanvas?.setCenter?.(
        geometry.x + geometry.width / 2,
        geometry.y + geometry.height / 2,
        { zoom: Math.max(0.7, board.viewport.zoom), duration: 220 }
      ));
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

    async _openRepositoryDirectory(repositoryId, inSystem) {
      const repository = this.panelRepositories.find(item => item.id === repositoryId && !item.archived && item.available !== false);
      if (!repository?.path) { this.notify('本地目录已不可用，请重新扫描', 'warning'); return false; }
      try {
        if (inSystem) {
          if (!this.bridge.fs?.openDirectory) throw new Error('当前环境不支持系统文件管理器');
          const opened = await this.bridge.fs.openDirectory(repository.path);
          if (opened === false) throw new Error('系统文件管理器未打开目录');
        } else {
          if (!this.onOpenDirectory) throw new Error('当前预览不支持应用标签页，请在 GitFinder 中打开');
          await this._persistNow();
          await this.onOpenDirectory(repository.path);
        }
        return true;
      } catch (error) { this.notify(`无法打开目录：${error.message}`, 'error'); return false; }
    }

    _locateRepositoryOnBoard(repositoryId, deploymentId) {
      const entities = this._allEntitiesById(), visible = this._filteredGraph().placements;
      const match = this._isServerTree()
        ? visible.find(p => p.entityId === deploymentId && entities.get(p.entityId)?.runtime?.repositoryIds?.includes(repositoryId))
          || visible.find(p => entities.get(p.entityId)?.type === 'deployment' && entities.get(p.entityId)?.runtime?.repositoryIds?.includes(repositoryId))
        : visible.find(p => entities.get(p.entityId)?.type === 'repository' && entities.get(p.entityId)?.refId === repositoryId);
      if (!match) { this.notify('当前白板没有可定位的关联卡片；可从资源库添加，不会自动创建节点', 'info'); return false; }
      return this._focusEntityOnBoard(match.entityId);
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
              ${resource && !missingIds.has(repositoryId) ? `<div class="relationship-repository-jumps"><button type="button" data-panel-open-repository="${escapeHtml(repositoryId)}" title="保留当前白板，在 GitFinder 新标签页打开目录">新标签页打开目录</button><button type="button" data-panel-system-repository="${escapeHtml(repositoryId)}">${this.bridge.platform === 'darwin' ? '在访达打开' : this.bridge.platform === 'win32' ? '在资源管理器打开' : '在文件管理器打开'}</button><button type="button" data-panel-reveal-repository="${escapeHtml(repositoryId)}" data-deployment-id="${escapeHtml(fact.id)}" title="${this._isServerTree() ? '定位使用此仓库的部署卡片，不添加仓库节点' : '移到当前白板已有的仓库卡片，不添加节点'}">${this._isServerTree() ? '定位关联部署' : '白板定位'}</button></div>` : ''}
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
      this.root?.querySelectorAll?.('[data-panel-association-action]').forEach(button => { button.disabled = true; });
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
        this._updateSummary();
        const resolved = this._allEntitiesById().get(entityId)?.runtime;
        this.notify(action === 'disabled' ? '已解除关联，刷新时不会自动重连' : (action === 'choose' ? '本地仓库关联已保存' : this._repositoryAssociationMessage(resolved)), resolved?.repositoryIds?.length || ['choose', 'disabled'].includes(action) ? 'success' : 'warning');
      } catch (error) {
        this.notify(`仓库关联失败：${error?.message || String(error)}`, 'error');
      } finally {
        this.repositoryAssociationSaving = false;
        this._renderGraph();
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
        overlay.querySelector('input[type="search"]').addEventListener('input', event => {
          const query = event.target.value.toLocaleLowerCase().trim();
          overlay.querySelectorAll('[data-repository-choice]').forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase().includes(query); });
        });
        this._bindDialogLifecycle(overlay, resolve, {
          focusSelector: 'input[type="search"]',
          onSubmit: event => {
            const ids = [...new Set(new FormData(event.currentTarget).getAll('repositoryId'))];
            if (!ids.length || ids.length > 8) { overlay.querySelector('[role="alert"]').textContent = '请选择 1–8 个本地仓库'; return undefined; }
            return ids;
          }
        });
      });
    }

    _bindDialogLifecycle(overlay, resolve, options = {}) {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKeydown, true);
        overlay.remove();
        resolve(value);
      };
      const onKeydown = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        finish(options.cancelValue ?? null);
      };
      overlay.addEventListener('click', event => {
        if (event.target.closest('[data-dialog-cancel]')) finish(options.cancelValue ?? null);
      });
      overlay.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        const value = options.onSubmit?.(event);
        if (value !== undefined) finish(value);
      });
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKeydown, true);
      requestAnimationFrame(() => overlay.querySelector(options.focusSelector || 'input, [type="submit"]')?.focus());
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
        const placements = this._combinedPlacements();
        const groupContext = {
          placements,
          index: LayoutPrimitives.indexPlacements(placements),
          entities: this._allEntitiesById()
        };
        const board = activeBoard(this.store);
        const groupOptions = (board?.placements || []).map(placement => (
          this.store.entities.find(entity => entity.id === placement.entityId)
        )).filter(entity => entity?.type === 'group' && selectedMembers.every(item => this._canJoinGroup(item.entityId, entity.id, groupContext))).map(entity => (
          `<option value="${escapeHtml(entity.id)}">${escapeHtml(entity.name)}</option>`
        )).join('');
        const hasGroupedMembers = placements.some(placement => (
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
        this._finishBoardMutation();
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
        this._finishBoardMutation();
        this._setCanvasAnnouncement(`关系方向已反转为“${this._relationshipLabel(relationship)}”`);
        return true;
      } catch (error) {
        this.notify(error?.message || String(error), 'error');
        return false;
      }
    }

    _groupShape(entityId) {
      const entity = this._allEntitiesById().get(entityId);
      if (entity?.type !== 'group') return 'rect';
      const placement = this._placementForEntity(entityId);
      if (Model.PROJECT_GROUP_SHAPES.includes(placement?.groupShape)) return placement.groupShape;
      const isProject = entity.runtime?.dynamicKind === 'coolify-project-group'
        || entityId.startsWith('entity_panel_projectgroup_');
      return isProject ? (this._boardView().projectGroupShape || 'rounded') : 'rounded';
    }

    _groupAppearanceEditorHtml(entityId) {
      const placement = this._placementForEntity(entityId) || {};
      const inheritedShape = this._groupShape(entityId);
      const placements = this._combinedPlacements(), entities = this._allEntitiesById();
      const context = { placements, entities, index: LayoutPrimitives.indexPlacements(placements) };
      const options = placements.filter(item => this._canJoinGroup(entityId, item.entityId, context))
        .map(item => `<option value="${escapeHtml(item.entityId)}" ${placement.groupId === item.entityId ? 'selected' : ''}>${escapeHtml(entities.get(item.entityId).name)}</option>`).join('');
      return `<section class="relationship-group-appearance" aria-label="群组外观与嵌套">
        <label class="relationship-inspector-field"><span>上级群组</span><select name="parentGroup"><option value="">无（顶层）</option>${options}</select></label>
        <div class="relationship-group-colors">
          <label class="relationship-inspector-field"><span>容器形状</span><select data-selected-group-shape="${escapeHtml(entityId)}"><option value="inherit"${placement.groupShape ? '' : ' selected'}>跟随白板（${{ rounded: '矩形', polygon: '多边形' }[inheritedShape]}）</option><option value="rounded"${placement.groupShape === 'rounded' ? ' selected' : ''}>矩形</option><option value="polygon"${placement.groupShape === 'polygon' ? ' selected' : ''}>多边形</option></select></label>
          <label class="relationship-inspector-field"><span>显示样式</span><select data-selected-group-appearance="${escapeHtml(entityId)}"><option value="soft"${!placement.groupAppearance || placement.groupAppearance === 'soft' ? ' selected' : ''}>浅色填充</option><option value="outline"${placement.groupAppearance === 'outline' ? ' selected' : ''}>仅描边</option><option value="emphasis"${placement.groupAppearance === 'emphasis' ? ' selected' : ''}>强调填充</option></select></label>
        </div>
        <div class="relationship-group-colors">
          <label class="relationship-inspector-field"><span>背景色</span><input type="color" name="groupBackground" value="${escapeHtml(placement.groupBackground || '#7a67c7')}"></label>
          <label class="relationship-inspector-field"><span>描边色</span><input type="color" name="groupBorder" value="${escapeHtml(placement.groupBorder || '#7a67c7')}"></label>
        </div>
        <small>背景以浅色显示，保留卡片可读性。拖动群组会带上全部子群组和卡片。</small>
      </section>`;
    }

    _applyViewport() {
      const board = activeBoard(this.store);
      if (board && this.flowCanvas?.setViewport) void this.flowCanvas.setViewport(board.viewport, { duration: 0 });
    }

    _setGroupShape(entityId, value) {
      const entity = this._allEntitiesById().get(entityId);
      const placement = this._placementForEntity(entityId);
      if (entity?.type !== 'group' || !placement || (value !== 'inherit' && !Model.PROJECT_GROUP_SHAPES.includes(value))) return false;
      const next = value === 'inherit' ? '' : value;
      if ((placement.groupShape || '') === next) return false;
      this._recordMutation();
      if (next) placement.groupShape = next; else delete placement.groupShape;
      const effective = this._groupShape(entityId);
      if (effective !== 'rounded' && this._boardView().layout !== 'galaxy') {
        const side = Math.max(Number(placement.groupWidth) || 320, Number(placement.groupHeight) || 180);
        placement.groupWidth = side; placement.groupHeight = side;
      }
      if (this._boardView().layout === 'galaxy' && this._isProjectGroup(entityId)) this._arrangeCurrentLayout();
      this._saveDynamicPlacementOverrides([entityId]);
      this._finishBoardMutation();
      this._setCanvasAnnouncement(`已将容器形状设为${{ rounded: '矩形', polygon: '多边形' }[effective]}`);
      return true;
    }

    _setGroupAppearance(entityId, value) {
      const entity = this._allEntitiesById().get(entityId);
      const placement = this._placementForEntity(entityId);
      if (entity?.type !== 'group' || !placement || !Model.GROUP_APPEARANCES.includes(value)) return false;
      const current = placement.groupAppearance || 'soft';
      if (current === value) return false;
      this._recordMutation();
      if (value === 'soft') delete placement.groupAppearance; else placement.groupAppearance = value;
      this._saveDynamicPlacementOverrides([entityId]);
      this._finishBoardMutation();
      this._setCanvasAnnouncement(`已更新容器显示样式`);
      return true;
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
        this.root.style.setProperty('--relationship-text-scale', String(display.textScale));
        this.root.style.setProperty('--relationship-title-font-size', `${Math.round(titleBaseSize * display.textScale * 10) / 10}px`);
        this.root.style.setProperty('--relationship-subtitle-font-size', `${Math.round(subtitleBaseSize * display.textScale * 10) / 10}px`);
        this.root.style.setProperty('--relationship-meta-font-size', `${Math.round(metaBaseSize * display.textScale * 10) / 10}px`);
        this.root.style.setProperty('--relationship-group-title-font-size', `${Math.round(display.groupTitleFontSize)}px`);
        this.root.style.setProperty('--relationship-filter-context-opacity', String(display.filterContextOpacity));
        this.root.style.setProperty('--relationship-filter-muted-opacity', String(display.filterMutedOpacity));
        this.root.style.setProperty('--relationship-filter-muted-saturation', String(display.filterMutedSaturation));
        this.root.style.setProperty('--relationship-filter-context-edge-opacity', String(display.filterContextEdgeOpacity));
        this.root.style.setProperty('--relationship-filter-muted-edge-opacity', String(display.filterMutedEdgeOpacity));
        this.root.style.setProperty('--relationship-filter-match-halo-opacity', String(display.filterMatchHaloOpacity));
        this.root.style.setProperty('--relationship-status-tint-opacity', `${Math.round(display.statusTintOpacity * 100)}%`);
        this.root.dataset.cardAppearance = display.cardAppearance;
        this.root.dataset.projectGroupShape = display.projectGroupShape;
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
      const activeCount = GraphProjection.activeFilterCount(this._boardView());
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
        this._recordMutation(); this.store = normalized; this._finishBoardMutation({ updateSummary: false });
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
        view: { ...Model.defaultBoardView(), structure: 'coolify-projects', layout: 'compact' },
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
      this._finishBoardMutation();
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
      this._finishBoardMutation();
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
      const placements = this._combinedPlacements();
      const context = { placements, entities: this._allEntitiesById(), index: LayoutPrimitives.indexPlacements(placements) };
      if (!members.every(item => this._canJoinGroup(item.entityId, groupId, context))) {
        this.notify('群组不能加入自身或自己的子群组', 'warning');
        return false;
      }
      this._recordMutation();
      for (const placement of members) placement.groupId = groupId;
      this._saveDynamicPlacementOverrides(members.filter(item => item.dynamic).map(item => item.entityId));
      this._finishBoardMutation();
      this._setCanvasAnnouncement(`已将 ${members.length} 个节点归入 ${group.name}`);
      return true;
    }

    _removeSelectionFromGroups() {
      const members = this._selectedMemberPlacements().filter(placement => placement.groupId);
      if (!members.length) return false;
      this._recordMutation();
      for (const placement of members) delete placement.groupId;
      this._saveDynamicPlacementOverrides(members.filter(item => item.dynamic).map(item => item.entityId));
      this._finishBoardMutation();
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
      this._finishBoardMutation();
    }

    _finishBoardMutation({ updateSummary = true } = {}) {
      this._persistSoon(0);
      this._renderGraph();
      this._refreshHistoryButtons();
      if (updateSummary) this._updateSummary();
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
      const previousStructure = this.store && activeBoard(this.store)?.view?.structure;
      const dissolvedIds = store => Object.entries(store?.boards?.[activeBoard(this.store)?.id] || {}).filter(([, value]) => value.dissolved).map(([id]) => id).sort().join(',');
      const previousDissolved = dissolvedIds(this.dynamicLayoutStore);
      this.store = saved.store;
      this.dynamicLayoutStore = normalizeDynamicLayoutStore(saved.dynamicLayouts);
      if (previousStructure !== activeBoard(this.store)?.view?.structure || previousDissolved !== dissolvedIds(this.dynamicLayoutStore)) this._setPanelTopology(this.panelTopologyResult);
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
      this._persistSoon(0);
      this._persistDynamicLayoutsSoon(0);
      this.render();
    }

    fitContent(options = {}) {
      if (!this.flowCanvas?.fitView) return;
      const minZoom = Number.isFinite(Number(options.minZoom))
        ? Math.min(1, Math.max(Model.MIN_VIEWPORT_ZOOM, Number(options.minZoom)))
        : Model.MIN_VIEWPORT_ZOOM;
      void this.flowCanvas.fitView({ padding: 0.16, minZoom: Math.min(0.03, minZoom), maxZoom: 1.5, duration: 180 });
    }

    _handleKeydown(event) {
      if (!this.root?.isConnected || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (this._handleContextMenuKeydown(event)) return;
      const layoutMenu = this.root.querySelector('.relationship-layout-menu:not([hidden])');
      if (layoutMenu && !layoutMenu.hidden) {
        if (event.key === 'Escape') { event.preventDefault(); this._closeLayoutMenu(true); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const buttons = [...layoutMenu.querySelectorAll('button:not(:disabled)')], current = buttons.indexOf(this.root.ownerDocument.activeElement);
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[index]?.focus(); return;
        }
        if (event.key === 'Tab') this._closeLayoutMenu();
      }
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
      if (event.key === 'Escape') {
        this._clearEntitySelection();
        this.selectedRelationshipId = '';
        this._updateSelectionCss();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && (this._entitySelectionIds().size || this.selectedRelationshipId)) {
        event.preventDefault();
        this._deleteSelection();
        return;
      }
      const canvas = event.target?.closest?.('.relationship-canvas');
      if (!canvas || mod
        || event.target?.closest?.('button, a, [role="menu"], [role="menuitem"], [role="slider"]')
        || this.root.querySelector('.relationship-display-popover:not([hidden]), .relationship-filter-popover:not([hidden]), .relationship-add-menu:not([hidden])')
        || Array.from(this.root.ownerDocument?.querySelectorAll('[role="dialog"][aria-modal="true"]') || [])
          .some(dialog => dialog.getClientRects().length > 0)) return;
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
      const linkedMovement = [...movingIds].some(id => this._placementForEntity(id)?.moveWithDescendants);
      if (linkedMovement && this._linkedMoveBlocked(movingIds)) return;
      for (const id of [...movingIds]) if (this._placementForEntity(id)?.locked) movingIds.delete(id);
      const persistentIds = new Set(activeBoard(this.store).placements
        .filter(item => movingIds.has(item.entityId))
        .map(item => item.entityId));
      const dynamicIds = new Set((this.panelProjection?.placements || [])
        .filter(item => item.dynamic && movingIds.has(item.entityId))
        .map(item => item.entityId));
      const placements = this._combinedPlacements().filter(item => movingIds.has(item.entityId));
      if (!placements.length) return;
      if (persistentIds.size || linkedMovement) this._recordMutation();
      const geometry = linkedMovement ? this._displayGeometryMap(this._combinedPlacements()) : null;
      const linkedChangedIds = linkedMovement ? this._prepareLinkedMove([...movingIds], geometry) : [];
      const step = event.shiftKey ? 24 : 8;
      for (const placement of placements) {
        if (geometry?.has(placement.entityId)) {
          placement.x = geometry.get(placement.entityId).x; placement.y = geometry.get(placement.entityId).y;
        }
        if (event.key === 'ArrowLeft') placement.x -= step;
        if (event.key === 'ArrowRight') placement.x += step;
        if (event.key === 'ArrowUp') placement.y -= step;
        if (event.key === 'ArrowDown') placement.y += step;
      }
      if (persistentIds.size) this._persistSoon(80);
      if (dynamicIds.size) this._saveDynamicPlacementOverrides(dynamicIds);
      if (linkedChangedIds.length) { this._saveDynamicPlacementOverrides(linkedChangedIds); this._persistSoon(0); }
      this._renderGraph();
      this._refreshHistoryButtons();
      this._updateSummary();
    }

    _updateSelectionCss(options = {}) {
      const selectedIds = this._entitySelectionIds();
      if (options.syncFlow !== false && this.flowCanvas?.setSelection) {
        this.flowSelectionSync = true;
        this.flowCanvas.setSelection([...selectedIds], this.selectedRelationshipId);
        queueMicrotask(() => { this.flowSelectionSync = false; });
      }
      const groupButton = this.root?.querySelector('[data-relationship-action="create-group-from-selection"]');
      if (groupButton) groupButton.disabled = this._selectedMemberPlacements().length < 2;
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
      this.documentAssets.clear();
      this.undoStack = []; this.redoStack = [];
      this._clearEntitySelection(); this.selectedRelationshipId = '';
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
        this._bindDialogLifecycle(overlay, resolve, {
          cancelValue: false,
          focusSelector: '[type="submit"]',
          onSubmit: () => true
        });
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
        this._bindDialogLifecycle(overlay, resolve, {
          onSubmit: event => {
            const data = new FormData(event.currentTarget);
            const values = {};
            for (const field of options.fields) {
              const value = field.multiline ? String(data.get(field.key) || '').slice(0, field.maxLength || 10000) : Model.cleanText(data.get(field.key), field.maxLength || 240);
              if (field.required && !value) return undefined;
              values[field.key] = value;
            }
            return values;
          }
        });
      });
    }
  }

  return Object.freeze({
    Controller,
    normalizeDynamicLayoutStore,
    TYPE_LABELS,
    RESOURCE_CATEGORY_DEFINITIONS,
    RELATIONSHIP_LABELS,
    NODE_WIDTH,
    NODE_HEIGHT,
    COMPACT_NODE_WIDTH,
    COMPACT_NODE_HEIGHT
  });
});
