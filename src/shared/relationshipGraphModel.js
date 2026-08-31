(function exposeRelationshipGraphModel(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipGraphModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipGraphModel() {
  const VERSION = 1;
  const MAX_BOARDS = 20;
  const MAX_ENTITIES = 200;
  const MAX_RELATIONSHIPS = 400;
  const MIN_VIEWPORT_ZOOM = 0.05;
  const MAX_VIEWPORT_ZOOM = 8;
  const ENTITY_TYPES = Object.freeze(['server', 'deployment', 'project', 'repository', 'endpoint', 'group', 'text', 'image', 'attachment']);
  const RELATIONSHIP_TYPES = Object.freeze([
    'contains',
    'belongs_to',
    'source_of',
    'deployed_from',
    'runs_on',
    'hosts',
    'exposes',
    'exposed_by',
    'depends_on',
    'required_by',
    'forked_from',
    'fork_source_for',
    'mirrors',
    'submodule_of',
    'has_submodule',
    'connects_to',
    'related_to'
  ]);
  const FACT_SOURCES = Object.freeze(['manual', 'imported', 'observed', 'gitfinder-registry']);
  const VERIFICATION_STALE_DAYS = 30;
  const BOARD_VIEW_MODES = Object.freeze(['full', 'compact']);
  const BOARD_PROJECTIONS = Object.freeze(['facts', 'deployment-summary']);
  const BOARD_SNAP_MODES = Object.freeze(['off', 'grid', 'smart']);
  const BOARD_CARD_APPEARANCES = Object.freeze(['elevated', 'flat']);
  const BOARD_CARD_TITLE_SOURCES = Object.freeze(['name', 'note']);
  const ANNOTATION_FILTERS = Object.freeze(['all', 'has-note']);
  const TASK_FILTERS = Object.freeze(['all', 'has-todos', 'no-todos', 'open', 'overdue', 'due-today', 'reminder-today', 'completed']);
  const RUNTIME_FILTERS = Object.freeze(['normal', 'warning', 'inactive']);
  const VERIFICATION_FILTERS = Object.freeze(['all', 'unverified', 'verified', 'stale']);
  const UNMATCHED_DISPLAY_MODES = Object.freeze(['dim', 'hide']);
  const PLACEMENT_TITLE_MODES = Object.freeze(['original', 'replace', 'prefix', 'suffix', 'subtitle']);
  const PLACEMENT_TITLE_SOURCES = Object.freeze(['inherit', 'name', 'note']);
  const PLACEMENT_STATUS_VISIBILITIES = Object.freeze(['inherit', 'show', 'hide']);
  const MAX_PLACEMENT_LABELS = 6;
  const MAX_PLACEMENT_TODOS = 20;
  const ENTITY_ID_PATTERN = /^entity_[a-z0-9][a-z0-9_-]{7,79}$/i;
  const BOARD_ID_PATTERN = /^board_[a-z0-9][a-z0-9_-]{7,79}$/i;
  const RELATIONSHIP_ID_PATTERN = /^relationship_[a-z0-9][a-z0-9_-]{7,79}$/i;
  const TODO_ID_PATTERN = /^todo_[a-z0-9][a-z0-9_-]{7,79}$/i;
  const REFERENCE_ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]{2,159}$/i;
  const SENSITIVE_KEY_PATTERN = /(password|passwd|secret|token|credential|private.?key|access.?key)/i;
  const DETAILS_KEYS = Object.freeze({
    server: new Set(['environment', 'hostLabel', 'notes']),
    deployment: new Set(['environment', 'version', 'branch', 'revision', 'status', 'notes', 'repositoryKey']),
    project: new Set(),
    repository: new Set(),
    endpoint: new Set(['urlLabel', 'notes']),
    group: new Set(['notes']),
    text: new Set(['content', 'fontSize', 'color', 'align', 'width', 'height']),
    image: new Set(['imageData', 'assetPath', 'referencePath', 'width', 'height', 'fit', 'caption']),
    attachment: new Set(['assetPath', 'referencePath', 'width', 'height', 'caption', 'fileSize'])
  });
  const FACT_ENTITY_TYPES = ENTITY_TYPES.filter(type => type !== 'group');
  const GENERAL_CONNECTIONS = Object.freeze(FACT_ENTITY_TYPES.flatMap(source => (
    FACT_ENTITY_TYPES.map(target => Object.freeze([source, target]))
  )));
  const CONNECTIONS = Object.freeze({
    contains: [['project', 'repository']],
    belongs_to: [['repository', 'project']],
    source_of: [['repository', 'deployment']],
    deployed_from: [['deployment', 'repository']],
    runs_on: [['deployment', 'server']],
    hosts: [['server', 'deployment']],
    exposes: [['deployment', 'endpoint']],
    exposed_by: [['endpoint', 'deployment']],
    depends_on: [
      ['project', 'project'],
      ['repository', 'repository'],
      ['deployment', 'deployment'],
      ['deployment', 'repository']
    ],
    required_by: [
      ['project', 'project'],
      ['repository', 'repository'],
      ['deployment', 'deployment'],
      ['repository', 'deployment']
    ],
    forked_from: [['repository', 'repository']],
    fork_source_for: [['repository', 'repository']],
    mirrors: [['repository', 'repository']],
    submodule_of: [['repository', 'repository']],
    has_submodule: [['repository', 'repository']],
    connects_to: GENERAL_CONNECTIONS,
    related_to: GENERAL_CONNECTIONS
  });

  class RelationshipGraphValidationError extends Error {
    constructor(message, issues = []) {
      super(message);
      this.name = 'RelationshipGraphValidationError';
      this.issues = issues;
    }
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cleanText(value, maxLength, fallback = '') {
    const cleaned = String(value ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (cleaned || fallback).slice(0, maxLength);
  }

  function finiteNumber(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  }

  function normalizeFactSource(value, issues, pathPrefix) {
    const source = cleanText(value, 80);
    if (!source) return '';
    if (!FACT_SOURCES.includes(source)) {
      issues.push(`${pathPrefix} 不是允许的事实来源`);
      return '';
    }
    return source;
  }

  function normalizeVerifiedAt(value, issues, pathPrefix) {
    const verifiedAt = cleanText(value, 40);
    if (!verifiedAt) return '';
    const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
    const timestamp = Date.parse(verifiedAt);
    if (!isoTimestamp.test(verifiedAt) || !Number.isFinite(timestamp)) {
      issues.push(`${pathPrefix} 必须是带时区的 ISO 时间`);
      return '';
    }
    return new Date(timestamp).toISOString();
  }

  function normalizeReviewIntervalDays(value, issues, pathPrefix) {
    if (value == null || value === '') return null;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 3650) {
      issues.push(`${pathPrefix} 必须是 1 到 3650 之间的整数天数`);
      return null;
    }
    return value;
  }

  function verificationStatus(fact, options = {}) {
    const requestedMaxAgeDays = options.maxAgeDays ?? fact?.reviewIntervalDays;
    const maxAgeDays = finiteNumber(requestedMaxAgeDays, VERIFICATION_STALE_DAYS, 1, 3650);
    const timestamp = Date.parse(String(fact?.verifiedAt || ''));
    if (!Number.isFinite(timestamp)) {
      return Object.freeze({ state: 'unverified', label: '待验证', ageDays: null, maxAgeDays });
    }
    const nowValue = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const nowTimestamp = Number.isFinite(nowValue.getTime()) ? nowValue.getTime() : Date.now();
    const ageDays = Math.max(0, (nowTimestamp - timestamp) / 86400000);
    if (ageDays > maxAgeDays) {
      return Object.freeze({ state: 'stale', label: '待复核', ageDays, maxAgeDays });
    }
    return Object.freeze({ state: 'verified', label: '已验证', ageDays, maxAgeDays });
  }

  function defaultStore() {
    return {
      schemaVersion: VERSION,
      activeBoardId: '',
      entities: [],
      relationships: [],
      boards: []
    };
  }

  function defaultBoardView() {
    return {
      mode: 'full',
      projection: 'facts',
      topologyLayout: 'lanes',
      showRepositoryRelations: false,
      snapMode: 'smart',
      cardScale: 1,
      cardWidth: 280,
      cardHeight: 143,
      textScale: 1,
      horizontalSpacing: 64,
      verticalSpacing: 36,
      cardAppearance: 'elevated',
      showGrid: true,
      showEdgeLabels: true,
      cardTitleSource: 'name',
      showRuntimeStatus: true,
      unmatchedDisplay: 'dim',
      filterContextOpacity: 0.34,
      filterMutedOpacity: 0.07,
      filterMutedSaturation: 0.12,
      filterContextEdgeOpacity: 0.28,
      filterMutedEdgeOpacity: 0.04,
      filterMatchHaloOpacity: 0.3,
      statusTintOpacity: 0.08,
      query: '',
      entityType: 'all',
      entityTypes: [],
      environment: '',
      verification: 'all',
      annotation: 'all',
      task: 'all',
      taskFilters: [],
      runtimeStates: [],
      label: ''
    };
  }

  function normalizeBoardView(raw, issues, pathPrefix, strict) {
    const view = isPlainObject(raw) ? raw : {};
    if (raw != null && !isPlainObject(raw)) issues.push(`${pathPrefix} 必须是对象`);
    const mode = String(view.mode || 'full');
    const projection = String(view.projection || 'facts');
    const topologyLayout = String(view.topologyLayout || 'lanes');
    const snapMode = String(view.snapMode || 'smart');
    const cardAppearance = String(view.cardAppearance || 'elevated');
    const cardTitleSource = String(view.cardTitleSource || 'name');
    const entityType = String(view.entityType || 'all');
    const verification = String(view.verification || 'all');
    const annotation = String(view.annotation || 'all');
    const task = String(view.task || 'all');
    const unmatchedDisplay = String(view.unmatchedDisplay || 'dim');
    const entityTypes = Array.isArray(view.entityTypes)
      ? [...new Set(view.entityTypes.map(value => String(value)).filter(value => ENTITY_TYPES.includes(value)))]
      : [];
    const taskFilters = Array.isArray(view.taskFilters)
      ? [...new Set(view.taskFilters.map(value => String(value)).filter(value => TASK_FILTERS.includes(value) && value !== 'all'))]
      : [];
    const runtimeStates = Array.isArray(view.runtimeStates)
      ? [...new Set(view.runtimeStates.map(value => String(value)).filter(value => RUNTIME_FILTERS.includes(value)))]
      : [];
    if (!BOARD_VIEW_MODES.includes(mode)) issues.push(`${pathPrefix}.mode 无效`);
    if (!BOARD_PROJECTIONS.includes(projection)) issues.push(`${pathPrefix}.projection 无效`);
    if (!['lanes', 'coolify-projects', 'selection-centered', 'server-centered', 'server-tree'].includes(topologyLayout)) issues.push(`${pathPrefix}.topologyLayout 无效`);
    if (!BOARD_SNAP_MODES.includes(snapMode)) issues.push(`${pathPrefix}.snapMode 无效`);
    if (!BOARD_CARD_APPEARANCES.includes(cardAppearance)) issues.push(`${pathPrefix}.cardAppearance 无效`);
    if (!BOARD_CARD_TITLE_SOURCES.includes(cardTitleSource)) issues.push(`${pathPrefix}.cardTitleSource 无效`);
    if (strict && view.showGrid != null && typeof view.showGrid !== 'boolean') issues.push(`${pathPrefix}.showGrid 必须是布尔值`);
    if (strict && view.showEdgeLabels != null && typeof view.showEdgeLabels !== 'boolean') issues.push(`${pathPrefix}.showEdgeLabels 必须是布尔值`);
    if (strict && view.showRepositoryRelations != null && typeof view.showRepositoryRelations !== 'boolean') issues.push(`${pathPrefix}.showRepositoryRelations 必须是布尔值`);
    if (strict && view.showRuntimeStatus != null && typeof view.showRuntimeStatus !== 'boolean') issues.push(`${pathPrefix}.showRuntimeStatus 必须是布尔值`);
    if (entityType !== 'all' && !ENTITY_TYPES.includes(entityType)) issues.push(`${pathPrefix}.entityType 无效`);
    if (!VERIFICATION_FILTERS.includes(verification)) issues.push(`${pathPrefix}.verification 无效`);
    if (!ANNOTATION_FILTERS.includes(annotation)) issues.push(`${pathPrefix}.annotation 无效`);
    if (!TASK_FILTERS.includes(task)) issues.push(`${pathPrefix}.task 无效`);
    if (!UNMATCHED_DISPLAY_MODES.includes(unmatchedDisplay)) issues.push(`${pathPrefix}.unmatchedDisplay 无效`);
    if (strict && view.entityTypes != null && (!Array.isArray(view.entityTypes) || view.entityTypes.some(value => !ENTITY_TYPES.includes(String(value))))) issues.push(`${pathPrefix}.entityTypes 无效`);
    if (strict && view.taskFilters != null && (!Array.isArray(view.taskFilters) || view.taskFilters.some(value => !TASK_FILTERS.includes(String(value)) || value === 'all'))) issues.push(`${pathPrefix}.taskFilters 无效`);
    if (strict && view.runtimeStates != null && (!Array.isArray(view.runtimeStates) || view.runtimeStates.some(value => !RUNTIME_FILTERS.includes(String(value))))) issues.push(`${pathPrefix}.runtimeStates 无效`);
    if (strict) {
      for (const key of Object.keys(view)) {
        if (!['mode', 'projection', 'topologyLayout', 'showRepositoryRelations', 'snapMode', 'cardScale', 'cardWidth', 'cardHeight', 'textScale', 'horizontalSpacing', 'verticalSpacing', 'cardAppearance', 'showGrid', 'showEdgeLabels', 'cardTitleSource', 'showRuntimeStatus', 'unmatchedDisplay', 'filterContextOpacity', 'filterMutedOpacity', 'filterMutedSaturation', 'filterContextEdgeOpacity', 'filterMutedEdgeOpacity', 'filterMatchHaloOpacity', 'statusTintOpacity', 'query', 'entityType', 'entityTypes', 'environment', 'verification', 'annotation', 'task', 'taskFilters', 'runtimeStates', 'label'].includes(key)) {
          issues.push(`${pathPrefix}.${key} 不是允许的字段`);
        }
      }
    }
    return {
      mode: BOARD_VIEW_MODES.includes(mode) ? mode : 'full',
      projection: BOARD_PROJECTIONS.includes(projection) ? projection : 'facts',
      topologyLayout: ['lanes', 'coolify-projects', 'selection-centered', 'server-centered', 'server-tree'].includes(topologyLayout) ? topologyLayout : 'lanes',
      showRepositoryRelations: view.showRepositoryRelations === true,
      snapMode: BOARD_SNAP_MODES.includes(snapMode) ? snapMode : 'smart',
      cardScale: finiteNumber(view.cardScale, 1, 0.8, 1.4),
      cardWidth: finiteNumber(view.cardWidth, 280, 220, 600),
      cardHeight: finiteNumber(view.cardHeight, 143, 143, 420),
      textScale: finiteNumber(view.textScale, 1, 0.85, 1.3),
      horizontalSpacing: finiteNumber(view.horizontalSpacing, 64, 16, 180),
      verticalSpacing: finiteNumber(view.verticalSpacing, 36, 16, 140),
      cardAppearance: BOARD_CARD_APPEARANCES.includes(cardAppearance) ? cardAppearance : 'elevated',
      showGrid: view.showGrid !== false,
      showEdgeLabels: view.showEdgeLabels !== false,
      cardTitleSource: BOARD_CARD_TITLE_SOURCES.includes(cardTitleSource) ? cardTitleSource : 'name',
      showRuntimeStatus: view.showRuntimeStatus !== false,
      unmatchedDisplay: UNMATCHED_DISPLAY_MODES.includes(unmatchedDisplay) ? unmatchedDisplay : 'dim',
      filterContextOpacity: finiteNumber(view.filterContextOpacity, 0.34, 0.15, 0.8),
      filterMutedOpacity: finiteNumber(view.filterMutedOpacity, 0.07, 0.03, 0.4),
      filterMutedSaturation: finiteNumber(view.filterMutedSaturation, 0.12, 0, 0.8),
      filterContextEdgeOpacity: finiteNumber(view.filterContextEdgeOpacity, 0.28, 0.1, 0.8),
      filterMutedEdgeOpacity: finiteNumber(view.filterMutedEdgeOpacity, 0.04, 0.01, 0.3),
      filterMatchHaloOpacity: finiteNumber(view.filterMatchHaloOpacity, 0.3, 0, 0.6),
      statusTintOpacity: finiteNumber(view.statusTintOpacity, 0.08, 0, 0.18),
      query: cleanText(view.query, 120),
      entityType: entityType === 'all' || ENTITY_TYPES.includes(entityType) ? entityType : 'all',
      entityTypes,
      environment: cleanText(view.environment, 80),
      verification: VERIFICATION_FILTERS.includes(verification) ? verification : 'all',
      annotation: ANNOTATION_FILTERS.includes(annotation) ? annotation : 'all',
      task: TASK_FILTERS.includes(task) ? task : 'all',
      taskFilters,
      runtimeStates,
      label: cleanText(view.label, 24)
    };
  }

  function normalizePlacementLabels(raw, issues, pathPrefix, strict) {
    if (raw == null) return [];
    if (!Array.isArray(raw)) {
      issues.push(`${pathPrefix} 必须是数组`);
      return [];
    }
    if (raw.length > MAX_PLACEMENT_LABELS) issues.push(`${pathPrefix} 不能超过 ${MAX_PLACEMENT_LABELS} 个`);
    const labels = [];
    const seen = new Set();
    for (const [index, value] of raw.slice(0, MAX_PLACEMENT_LABELS).entries()) {
      if (strict && typeof value !== 'string') issues.push(`${pathPrefix}[${index}] 必须是文本`);
      const label = cleanText(value, 24);
      if (!label) continue;
      const key = label.toLocaleLowerCase('zh-CN');
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(label);
    }
    return labels;
  }

  function normalizePlacementTodos(raw, issues, pathPrefix, strict) {
    if (raw == null) return [];
    if (!Array.isArray(raw)) {
      issues.push(`${pathPrefix} 必须是数组`);
      return [];
    }
    if (raw.length > MAX_PLACEMENT_TODOS) issues.push(`${pathPrefix} 不能超过 ${MAX_PLACEMENT_TODOS} 项`);
    const todos = [];
    const seen = new Set();
    for (const [index, value] of raw.slice(0, MAX_PLACEMENT_TODOS).entries()) {
      const prefix = `${pathPrefix}[${index}]`;
      if (!isPlainObject(value)) {
        issues.push(`${prefix} 必须是对象`);
        continue;
      }
      const id = String(value.id || '');
      const title = cleanText(value.title, 160);
      if (!TODO_ID_PATTERN.test(id)) issues.push(`${prefix}.id 无效`);
      if (!title) issues.push(`${prefix}.title 不能为空`);
      if (seen.has(id)) issues.push(`${prefix}.id 重复`);
      if (strict && typeof value.completed !== 'boolean') issues.push(`${prefix}.completed 必须是布尔值`);
      if (strict) {
        for (const key of Object.keys(value)) {
          if (!['id', 'title', 'completed', 'dueAt', 'reminderAt'].includes(key)) issues.push(`${prefix}.${key} 不是允许的字段`);
        }
      }
      if (!TODO_ID_PATTERN.test(id) || !title || seen.has(id)) continue;
      seen.add(id);
      const dueAt = normalizeVerifiedAt(value.dueAt, issues, `${prefix}.dueAt`);
      const reminderAt = normalizeVerifiedAt(value.reminderAt, issues, `${prefix}.reminderAt`);
      const todo = { id, title, completed: value.completed === true };
      if (dueAt) todo.dueAt = dueAt;
      if (reminderAt) todo.reminderAt = reminderAt;
      todos.push(todo);
    }
    return todos;
  }

  function normalizeDetails(type, rawDetails, issues, pathPrefix, strict) {
    const details = {};
    if (rawDetails == null) return details;
    if (!isPlainObject(rawDetails)) {
      issues.push(`${pathPrefix} 必须是对象`);
      return details;
    }
    const allowed = DETAILS_KEYS[type] || new Set();
    for (const [key, rawValue] of Object.entries(rawDetails)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        issues.push(`${pathPrefix}.${key} 不允许保存凭据或敏感信息`);
        continue;
      }
      if (!allowed.has(key)) {
        if (strict) issues.push(`${pathPrefix}.${key} 不是允许的字段`);
        continue;
      }
      if (key === 'imageData') {
        if (typeof rawValue !== 'string' || rawValue.length > 5600000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(rawValue)) {
          issues.push(`${pathPrefix}.imageData 必须是内嵌 PNG、JPEG 或 WebP（最多 4 MB）`);
        } else details[key] = rawValue;
        continue;
      }
      if (key === 'assetPath') {
        if (!/^assets\/[a-z0-9][a-z0-9._-]{0,180}$/i.test(rawValue) || String(rawValue).includes('..')) issues.push(`${pathPrefix}.assetPath 必须是项目媒体目录内的相对路径`);
        else details[key] = rawValue;
        continue;
      }
      if (key === 'referencePath') {
        if (typeof rawValue !== 'string' || rawValue.length > 4096 || /[\u0000-\u001f]/.test(rawValue) || !/^(\/|[a-z]:[\\/])/i.test(rawValue)) issues.push(`${pathPrefix}.referencePath 必须是本地绝对路径`);
        else details[key] = rawValue;
        continue;
      }
      if (['text', 'image', 'attachment'].includes(type)) {
        if (key === 'content') { details.content = String(rawValue ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 10000); continue; }
        if (['width', 'height', 'fontSize'].includes(key)) {
          details[key] = String(finiteNumber(rawValue, key === 'fontSize' ? 24 : 240, key === 'fontSize' ? 12 : 60, key === 'fontSize' ? 96 : 1600)); continue;
        }
        if (key === 'color' && !/^#[0-9a-f]{6}$/i.test(rawValue)) { issues.push(`${pathPrefix}.color 无效`); continue; }
        if (key === 'align' && !['left', 'center', 'right'].includes(rawValue)) { issues.push(`${pathPrefix}.align 无效`); continue; }
        if (key === 'fit' && !['contain', 'cover'].includes(rawValue)) { issues.push(`${pathPrefix}.fit 无效`); continue; }
      }
      const limit = key === 'notes' ? 1000 : 240;
      const value = cleanText(rawValue, limit);
      if (value) details[key] = value;
    }
    return details;
  }

  function normalizeEntity(raw, issues, index, strict) {
    const prefix = `entities[${index}]`;
    if (!isPlainObject(raw)) {
      issues.push(`${prefix} 必须是对象`);
      return null;
    }
    const id = String(raw.id || '');
    const type = String(raw.type || '');
    if (!ENTITY_ID_PATTERN.test(id)) issues.push(`${prefix}.id 无效`);
    if (!ENTITY_TYPES.includes(type)) issues.push(`${prefix}.type 无效`);
    const name = cleanText(raw.name, 160);
    if (!name) issues.push(`${prefix}.name 不能为空`);
    if (!ENTITY_ID_PATTERN.test(id) || !ENTITY_TYPES.includes(type) || !name) return null;

    const referenceType = type === 'project' || type === 'repository';
    const refId = cleanText(raw.refId, 160);
    if (referenceType && !REFERENCE_ID_PATTERN.test(refId)) {
      issues.push(`${prefix}.refId 必须使用稳定项目或仓库身份`);
      return null;
    }
    if (!referenceType && refId && strict) issues.push(`${prefix}.refId 仅适用于项目或仓库节点`);

    if (strict) {
      for (const key of Object.keys(raw)) {
        if (!['id', 'type', 'name', 'refId', 'details', 'source', 'verifiedAt', 'reviewIntervalDays', 'evidenceSummary'].includes(key)) {
          issues.push(`${prefix}.${key} 不是允许的字段`);
        }
      }
    }

    const entity = {
      id,
      type,
      name,
      details: normalizeDetails(type, raw.details, issues, `${prefix}.details`, strict)
    };
    if (referenceType) entity.refId = refId;
    const source = normalizeFactSource(raw.source, issues, `${prefix}.source`);
    const verifiedAt = normalizeVerifiedAt(raw.verifiedAt, issues, `${prefix}.verifiedAt`);
    const reviewIntervalDays = normalizeReviewIntervalDays(raw.reviewIntervalDays, issues, `${prefix}.reviewIntervalDays`);
    const evidenceSummary = cleanText(raw.evidenceSummary, 500);
    if (source) entity.source = source;
    if (verifiedAt) entity.verifiedAt = verifiedAt;
    if (reviewIntervalDays) entity.reviewIntervalDays = reviewIntervalDays;
    if (evidenceSummary) entity.evidenceSummary = evidenceSummary;
    return entity;
  }

  function connectionAllowed(type, sourceType, targetType) {
    return Boolean(CONNECTIONS[type]?.some(([source, target]) => source === sourceType && target === targetType));
  }

  function normalizeRelationship(raw, issues, index, entitiesById, strict) {
    const prefix = `relationships[${index}]`;
    if (!isPlainObject(raw)) {
      issues.push(`${prefix} 必须是对象`);
      return null;
    }
    const id = String(raw.id || '');
    const type = String(raw.type || '');
    const sourceId = String(raw.sourceId || '');
    const targetId = String(raw.targetId || '');
    const label = cleanText(raw.label, 80);
    if (!RELATIONSHIP_ID_PATTERN.test(id)) issues.push(`${prefix}.id 无效`);
    if (!RELATIONSHIP_TYPES.includes(type)) issues.push(`${prefix}.type 无效`);
    if (!entitiesById.has(sourceId)) issues.push(`${prefix}.sourceId 引用了不存在的节点`);
    if (!entitiesById.has(targetId)) issues.push(`${prefix}.targetId 引用了不存在的节点`);
    if (sourceId === targetId) issues.push(`${prefix} 不能连接节点自身`);
    if (!RELATIONSHIP_ID_PATTERN.test(id)
      || !RELATIONSHIP_TYPES.includes(type)
      || !entitiesById.has(sourceId)
      || !entitiesById.has(targetId)
      || sourceId === targetId) return null;
    const source = entitiesById.get(sourceId);
    const target = entitiesById.get(targetId);
    if (!connectionAllowed(type, source.type, target.type)) {
      issues.push(`${prefix} 不允许 ${source.type} 通过 ${type} 连接到 ${target.type}`);
      return null;
    }
    if (strict) {
      for (const key of Object.keys(raw)) {
        if (!['id', 'type', 'sourceId', 'targetId', 'label', 'source', 'verifiedAt', 'reviewIntervalDays', 'evidenceSummary'].includes(key)) {
          issues.push(`${prefix}.${key} 不是允许的字段`);
        }
      }
    }
    const relationship = { id, type, sourceId, targetId };
    if (label) relationship.label = label;
    const evidenceSource = normalizeFactSource(raw.source, issues, `${prefix}.source`);
    const verifiedAt = normalizeVerifiedAt(raw.verifiedAt, issues, `${prefix}.verifiedAt`);
    const reviewIntervalDays = normalizeReviewIntervalDays(raw.reviewIntervalDays, issues, `${prefix}.reviewIntervalDays`);
    const evidenceSummary = cleanText(raw.evidenceSummary, 500);
    if (evidenceSource) relationship.source = evidenceSource;
    if (verifiedAt) relationship.verifiedAt = verifiedAt;
    if (reviewIntervalDays) relationship.reviewIntervalDays = reviewIntervalDays;
    if (evidenceSummary) relationship.evidenceSummary = evidenceSummary;
    return relationship;
  }

  function normalizePlacement(raw, issues, boardIndex, index, entitiesById, strict) {
    const prefix = `boards[${boardIndex}].placements[${index}]`;
    if (!isPlainObject(raw)) {
      issues.push(`${prefix} 必须是对象`);
      return null;
    }
    const entityId = String(raw.entityId || '');
    if (!entitiesById.has(entityId)) {
      issues.push(`${prefix}.entityId 引用了不存在的节点`);
      return null;
    }
    const groupId = String(raw.groupId || '');
    const entity = entitiesById.get(entityId);
    const group = groupId ? entitiesById.get(groupId) : null;
    if (groupId && !group) issues.push(`${prefix}.groupId 引用了不存在的节点`);
    if (groupId && group && group.type !== 'group') issues.push(`${prefix}.groupId 必须引用分组节点`);
    if (strict) {
      for (const key of Object.keys(raw)) {
        if (!['entityId', 'x', 'y', 'groupId', 'groupBackground', 'groupBorder', 'groupLayout', 'groupWidth', 'groupHeight', 'titleMode', 'titleText', 'titleSource', 'statusVisibility', 'labels', 'note', 'todos', 'locked', 'expanded'].includes(key)) issues.push(`${prefix}.${key} 不是允许的字段`);
      }
      if (!Number.isFinite(Number(raw.x)) || !Number.isFinite(Number(raw.y))) {
        issues.push(`${prefix} 坐标必须是有限数字`);
      }
    }
    const placement = {
      entityId,
      x: finiteNumber(raw.x, 0, -100000, 100000),
      y: finiteNumber(raw.y, 0, -100000, 100000)
    };
    if (raw.locked === true) placement.locked = true;
    if (raw.expanded === true) placement.expanded = true;
    if (raw.groupLayout != null) {
      if (entity?.type !== 'group' || !['auto', 'manual'].includes(raw.groupLayout)) issues.push(`${prefix}.groupLayout 必须是分组的 auto 或 manual`);
      else placement.groupLayout = raw.groupLayout;
    }
    for (const [key, min] of [['groupWidth', 320], ['groupHeight', 180]]) {
      if (raw[key] == null) continue;
      if (entity?.type !== 'group' || !Number.isFinite(Number(raw[key])) || Number(raw[key]) < min || Number(raw[key]) > 100000) issues.push(`${prefix}.${key} 必须是分组的有效尺寸`);
      else placement[key] = Math.round(Number(raw[key]));
    }
    if (groupId && group?.type === 'group') placement.groupId = groupId;
    for (const key of ['groupBackground', 'groupBorder']) {
      if (raw[key] == null) continue;
      if (entity?.type !== 'group' || !/^#[0-9a-f]{6}$/i.test(raw[key])) {
        issues.push(`${prefix}.${key} 必须是分组的六位十六进制颜色`);
      } else placement[key] = raw[key].toLowerCase();
    }
    const titleMode = String(raw.titleMode || 'original');
    const titleText = cleanText(raw.titleText, 160);
    if (!PLACEMENT_TITLE_MODES.includes(titleMode)) issues.push(`${prefix}.titleMode 无效`);
    if (titleText) {
      placement.titleMode = PLACEMENT_TITLE_MODES.includes(titleMode) ? titleMode : 'original';
      placement.titleText = titleText;
    }
    const titleSource = String(raw.titleSource || 'inherit');
    const statusVisibility = String(raw.statusVisibility || 'inherit');
    if (!PLACEMENT_TITLE_SOURCES.includes(titleSource)) issues.push(`${prefix}.titleSource 无效`);
    if (!PLACEMENT_STATUS_VISIBILITIES.includes(statusVisibility)) issues.push(`${prefix}.statusVisibility 无效`);
    if (PLACEMENT_TITLE_SOURCES.includes(titleSource) && titleSource !== 'inherit') placement.titleSource = titleSource;
    if (PLACEMENT_STATUS_VISIBILITIES.includes(statusVisibility) && statusVisibility !== 'inherit') placement.statusVisibility = statusVisibility;
    const labels = normalizePlacementLabels(raw.labels, issues, `${prefix}.labels`, strict);
    const note = cleanText(raw.note, 1000);
    const todos = normalizePlacementTodos(raw.todos, issues, `${prefix}.todos`, strict);
    if (labels.length) placement.labels = labels;
    if (note) placement.note = note;
    if (todos.length) placement.todos = todos;
    return placement;
  }

  function normalizeBoard(raw, issues, index, entitiesById, strict) {
    const prefix = `boards[${index}]`;
    if (!isPlainObject(raw)) {
      issues.push(`${prefix} 必须是对象`);
      return null;
    }
    const id = String(raw.id || '');
    const name = cleanText(raw.name, 80);
    if (!BOARD_ID_PATTERN.test(id)) issues.push(`${prefix}.id 无效`);
    if (!name) issues.push(`${prefix}.name 不能为空`);
    if (!BOARD_ID_PATTERN.test(id) || !name) return null;
    const viewport = isPlainObject(raw.viewport) ? raw.viewport : {};
    if (strict && raw.viewport != null && !isPlainObject(raw.viewport)) issues.push(`${prefix}.viewport 必须是对象`);
    const placements = [];
    const seen = new Set();
    const rawPlacements = Array.isArray(raw.placements) ? raw.placements : [];
    if (!Array.isArray(raw.placements) && raw.placements != null) issues.push(`${prefix}.placements 必须是数组`);
    for (let placementIndex = 0; placementIndex < rawPlacements.length; placementIndex += 1) {
      const placement = normalizePlacement(rawPlacements[placementIndex], issues, index, placementIndex, entitiesById, strict);
      if (!placement) continue;
      if (seen.has(placement.entityId)) {
        issues.push(`${prefix}.placements 不能重复放置同一节点`);
        continue;
      }
      seen.add(placement.entityId);
      placements.push(placement);
    }
    for (let placementIndex = 0; placementIndex < placements.length; placementIndex += 1) {
      const placement = placements[placementIndex];
      if (!placement.groupId || seen.has(placement.groupId)) continue;
      issues.push(`${prefix}.placements[${placementIndex}].groupId 引用的分组不在当前白板`);
      delete placement.groupId;
    }
    const placementsById = new Map(placements.map(placement => [placement.entityId, placement]));
    for (const placement of placements) {
      const ancestors = new Set([placement.entityId]);
      let parentId = placement.groupId;
      while (parentId) {
        if (ancestors.has(parentId)) {
          issues.push(`${prefix}.placements 的分组不能包含自身或形成循环嵌套`);
          delete placement.groupId;
          break;
        }
        ancestors.add(parentId);
        parentId = placementsById.get(parentId)?.groupId;
      }
    }
    if (strict) {
      for (const key of Object.keys(raw)) {
        if (!['id', 'name', 'viewport', 'placements', 'view'].includes(key)) issues.push(`${prefix}.${key} 不是允许的字段`);
      }
      for (const key of Object.keys(viewport)) {
        if (!['x', 'y', 'zoom'].includes(key)) issues.push(`${prefix}.viewport.${key} 不是允许的字段`);
      }
    }
    return {
      id,
      name,
      viewport: {
        x: finiteNumber(viewport.x, 0, -100000, 100000),
        y: finiteNumber(viewport.y, 0, -100000, 100000),
        zoom: finiteNumber(viewport.zoom, 1, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM)
      },
      view: normalizeBoardView(raw.view, issues, `${prefix}.view`, strict),
      placements
    };
  }

  function normalizeStore(raw, options = {}) {
    const strict = options.strict === true;
    const issues = [];
    const candidate = isPlainObject(raw) ? raw : defaultStore();
    if (!isPlainObject(raw) && raw != null) issues.push('白板数据必须是对象');
    if (candidate.schemaVersion != null && Number(candidate.schemaVersion) !== VERSION) {
      issues.push(`暂不支持白板数据版本：${candidate.schemaVersion}`);
    }
    const rawEntities = Array.isArray(candidate.entities) ? candidate.entities : [];
    const rawRelationships = Array.isArray(candidate.relationships) ? candidate.relationships : [];
    const rawBoards = Array.isArray(candidate.boards) ? candidate.boards : [];
    if (rawEntities.length > MAX_ENTITIES) issues.push(`节点数量不能超过 ${MAX_ENTITIES}`);
    if (rawRelationships.length > MAX_RELATIONSHIPS) issues.push(`关系数量不能超过 ${MAX_RELATIONSHIPS}`);
    if (rawBoards.length > MAX_BOARDS) issues.push(`白板数量不能超过 ${MAX_BOARDS}`);

    const entities = [];
    const entityIds = new Set();
    const referenceKeys = new Set();
    for (let index = 0; index < rawEntities.slice(0, MAX_ENTITIES).length; index += 1) {
      const entity = normalizeEntity(rawEntities[index], issues, index, strict);
      if (!entity) continue;
      if (entityIds.has(entity.id)) {
        issues.push(`entities[${index}].id 重复`);
        continue;
      }
      const referenceKey = entity.refId ? `${entity.type}:${entity.refId}` : '';
      if (referenceKey && referenceKeys.has(referenceKey)) {
        issues.push(`entities[${index}] 重复引用同一${entity.type === 'project' ? '项目' : '仓库'}`);
        continue;
      }
      entityIds.add(entity.id);
      if (referenceKey) referenceKeys.add(referenceKey);
      entities.push(entity);
    }

    const entitiesById = new Map(entities.map(entity => [entity.id, entity]));
    const relationships = [];
    const relationshipIds = new Set();
    const relationshipKeys = new Set();
    for (let index = 0; index < rawRelationships.slice(0, MAX_RELATIONSHIPS).length; index += 1) {
      const relationship = normalizeRelationship(rawRelationships[index], issues, index, entitiesById, strict);
      if (!relationship) continue;
      if (relationshipIds.has(relationship.id)) {
        issues.push(`relationships[${index}].id 重复`);
        continue;
      }
      const relationshipKey = `${relationship.type}:${relationship.sourceId}:${relationship.targetId}`;
      if (relationshipKeys.has(relationshipKey)) {
        issues.push(`relationships[${index}] 是重复关系`);
        continue;
      }
      relationshipIds.add(relationship.id);
      relationshipKeys.add(relationshipKey);
      relationships.push(relationship);
    }

    const boards = [];
    const boardIds = new Set();
    for (let index = 0; index < rawBoards.slice(0, MAX_BOARDS).length; index += 1) {
      const board = normalizeBoard(rawBoards[index], issues, index, entitiesById, strict);
      if (!board) continue;
      if (boardIds.has(board.id)) {
        issues.push(`boards[${index}].id 重复`);
        continue;
      }
      boardIds.add(board.id);
      boards.push(board);
    }
    const requestedActiveBoardId = String(candidate.activeBoardId || '');
    const activeBoardId = boardIds.has(requestedActiveBoardId) ? requestedActiveBoardId : (boards[0]?.id || '');
    if (strict && requestedActiveBoardId && !boardIds.has(requestedActiveBoardId)) {
      issues.push('activeBoardId 引用了不存在的白板');
    }
    if (strict) {
      for (const key of Object.keys(candidate)) {
        if (!['schemaVersion', 'activeBoardId', 'entities', 'relationships', 'boards'].includes(key)) {
          issues.push(`${key} 不是允许的根字段`);
        }
      }
    }

    const value = { schemaVersion: VERSION, activeBoardId, entities, relationships, boards };
    return { value, issues };
  }

  function assertValidStore(raw) {
    const result = normalizeStore(raw, { strict: true });
    if (result.issues.length) {
      throw new RelationshipGraphValidationError(`关系白板数据无效：${result.issues[0]}`, result.issues);
    }
    return result.value;
  }

  return Object.freeze({
    VERSION,
    MAX_BOARDS,
    MAX_ENTITIES,
    MAX_RELATIONSHIPS,
    MIN_VIEWPORT_ZOOM,
    MAX_VIEWPORT_ZOOM,
    ENTITY_TYPES,
    RELATIONSHIP_TYPES,
    FACT_SOURCES,
    VERIFICATION_STALE_DAYS,
    BOARD_VIEW_MODES,
    BOARD_PROJECTIONS,
    BOARD_SNAP_MODES,
    BOARD_CARD_APPEARANCES,
    BOARD_CARD_TITLE_SOURCES,
    ANNOTATION_FILTERS,
    TASK_FILTERS,
    RUNTIME_FILTERS,
    VERIFICATION_FILTERS,
    UNMATCHED_DISPLAY_MODES,
    PLACEMENT_TITLE_MODES,
    PLACEMENT_TITLE_SOURCES,
    PLACEMENT_STATUS_VISIBILITIES,
    CONNECTIONS,
    RelationshipGraphValidationError,
    defaultStore,
    defaultBoardView,
    normalizeStore,
    assertValidStore,
    connectionAllowed,
    verificationStatus,
    cleanText
  });
});
