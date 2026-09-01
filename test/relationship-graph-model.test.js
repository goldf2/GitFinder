const test = require('node:test');
const assert = require('node:assert/strict');
const RelationshipGraphModel = require('../src/shared/relationshipGraphModel');

function validStore() {
  return {
    schemaVersion: 1,
    activeBoardId: 'board_12345678',
    entities: [
      { id: 'entity_project1', type: 'project', name: 'MES', refId: 'project_12345678-1234-4234-9234-123456789abc', details: {} },
      { id: 'entity_repo0001', type: 'repository', name: 'MES Repo', refId: 'r_123456789abc', details: {} },
      {
        id: 'entity_deploy01',
        type: 'deployment',
        name: 'Production',
        details: {
          environment: 'production',
          version: 'v1.30.5',
          branch: 'main',
          revision: 'abcdef012345'
        }
      },
      { id: 'entity_server01', type: 'server', name: 'Con01', details: { hostLabel: 'con01.internal' } }
    ],
    relationships: [
      { id: 'relationship_00000001', type: 'contains', sourceId: 'entity_project1', targetId: 'entity_repo0001' },
      { id: 'relationship_00000002', type: 'source_of', sourceId: 'entity_repo0001', targetId: 'entity_deploy01' },
      { id: 'relationship_00000003', type: 'runs_on', sourceId: 'entity_deploy01', targetId: 'entity_server01' }
    ],
    boards: [{
      id: 'board_12345678',
      name: '生产部署',
      viewport: { x: 20, y: 30, zoom: 1 },
      placements: [
        { entityId: 'entity_project1', x: 0, y: 0 },
        { entityId: 'entity_repo0001', x: 320, y: 0 },
        { entityId: 'entity_deploy01', x: 640, y: 0 },
        { entityId: 'entity_server01', x: 960, y: 0 }
      ]
    }]
  };
}

test('关系模型接受项目到仓库再到部署和服务器的受约束链路', () => {
  const normalized = RelationshipGraphModel.assertValidStore(validStore());
  assert.equal(normalized.relationships.length, 3);
  assert.equal(normalized.boards[0].placements.length, 4);
  assert.deepEqual(normalized.boards[0].view, RelationshipGraphModel.defaultBoardView());
  assert.deepEqual(normalized.entities[2].details, {
    environment: 'production',
    version: 'v1.30.5',
    branch: 'main',
    revision: 'abcdef012345'
  });
});

test('旧版服务器树状图副本链只保留当前白板并恢复原名称', () => {
  const store = validStore();
  const base = store.boards[0];
  const first = structuredClone(base);
  Object.assign(first, { id: 'board_legacy001', name: `${base.name} · 服务器树状图` });
  const active = structuredClone(base);
  Object.assign(active, {
    id: 'board_legacy002',
    name: `${first.name} · 服务器树状图`,
    placements: active.placements.slice(0, 2),
    view: { ...RelationshipGraphModel.defaultBoardView(), structure: 'server-tree', layout: 'bilateral' }
  });
  store.boards.push(first, active);
  store.activeBoardId = active.id;

  const normalized = RelationshipGraphModel.normalizeStore(store);

  assert.equal(normalized.value.boards.length, 1);
  assert.equal(normalized.value.activeBoardId, active.id);
  assert.equal(normalized.value.boards[0].name, base.name);
  assert.equal(normalized.value.boards[0].placements.length, 2);
  assert.equal(normalized.value.boards[0].view.structure, 'server-tree');
  assert.match(normalized.issues.join('\n'), /旧版服务器树状图副本/);
});

test('没有对应原白板时不把用户名称误判为旧版副本链', () => {
  const store = validStore();
  store.boards[0].name = '仅存档 · 服务器树状图';
  const normalized = RelationshipGraphModel.normalizeStore(store);
  assert.equal(normalized.value.boards.length, 1);
  assert.equal(normalized.value.boards[0].name, store.boards[0].name);
  assert.doesNotMatch(normalized.issues.join('\n'), /旧版服务器树状图副本/);
});

test('白板保存和重新读取保留 5% 到 800% 缩放范围', () => {
  for (const zoom of [0.05, 0.1, 0.25, 1, 4, 8]) {
    const store = validStore();
    store.boards[0].viewport.zoom = zoom;
    const saved = RelationshipGraphModel.assertValidStore(store);
    assert.equal(saved.boards[0].viewport.zoom, zoom);
    assert.equal(RelationshipGraphModel.assertValidStore(JSON.parse(JSON.stringify(saved))).boards[0].viewport.zoom, zoom);
  }
});

test('关系白板按白板保存卡片、文字和画布显示偏好', () => {
  const store = validStore();
  store.boards[0].view = {
    ...RelationshipGraphModel.defaultBoardView(),
    cardScale: 1.25,
    textScale: 1.15,
    groupTitleFontSize: 28,
    cardAppearance: 'flat',
    showGrid: false,
    showEdgeLabels: false,
    cardTitleSource: 'note',
    deploymentTitleSource: 'note',
    endpointTitleSource: 'website',
    cardIcons: { server: 'database', deployment: 'service', endpoint: 'none', repository: 'project', project: 'repository' },
    showRuntimeStatus: false,
    unmatchedDisplay: 'hide',
    filterContextOpacity: 0.42,
    filterMutedOpacity: 0.09,
    filterMutedSaturation: 0.2,
    filterContextEdgeOpacity: 0.36,
    filterMutedEdgeOpacity: 0.06,
    filterMatchHaloOpacity: 0.38,
    statusTintOpacity: 0.1
  };

  const normalized = RelationshipGraphModel.assertValidStore(store);

  assert.deepEqual(normalized.boards[0].view, store.boards[0].view);
  assert.equal(RelationshipGraphModel.defaultBoardView().cardScale, 1);
  assert.equal(RelationshipGraphModel.defaultBoardView().textScale, 1);
  assert.equal(RelationshipGraphModel.defaultBoardView().groupTitleFontSize, 20);
  assert.equal(RelationshipGraphModel.defaultBoardView().cardAppearance, 'elevated');
  assert.equal(RelationshipGraphModel.defaultBoardView().showGrid, true);
  assert.equal(RelationshipGraphModel.defaultBoardView().showEdgeLabels, true);
  assert.equal(RelationshipGraphModel.defaultBoardView().cardTitleSource, 'name');
  assert.equal(RelationshipGraphModel.defaultBoardView().deploymentTitleSource, 'name');
  assert.equal(RelationshipGraphModel.defaultBoardView().endpointTitleSource, 'domain');
  assert.deepEqual(RelationshipGraphModel.defaultBoardView().cardIcons, RelationshipGraphModel.DEFAULT_CARD_ICONS);
  assert.equal(RelationshipGraphModel.defaultBoardView().projectGroupShape, 'rounded');
  assert.equal(RelationshipGraphModel.defaultBoardView().showRuntimeStatus, true);
  assert.equal(RelationshipGraphModel.defaultBoardView().unmatchedDisplay, 'dim');
  assert.equal(RelationshipGraphModel.defaultBoardView().statusTintOpacity, 0.08);
});

test('Project 容器形状与布局分别保存，支持矩形和多边形并迁移旧圆形', () => {
  for (const projectGroupShape of ['rounded', 'polygon']) {
    const store = validStore();
    store.boards[0].view = { ...RelationshipGraphModel.defaultBoardView(), layout: 'galaxy', projectGroupShape };
    const view = RelationshipGraphModel.assertValidStore(store).boards[0].view;
    assert.equal(view.layout, 'galaxy');
    assert.equal(view.projectGroupShape, projectGroupShape);
  }
  const legacy = validStore();
  legacy.boards[0].view = { ...RelationshipGraphModel.defaultBoardView(), projectGroupShape: 'circle' };
  assert.equal(RelationshipGraphModel.assertValidStore(legacy).boards[0].view.projectGroupShape, 'rounded');
  const invalid = validStore();
  invalid.boards[0].view = { ...RelationshipGraphModel.defaultBoardView(), projectGroupShape: 'star' };
  assert.throws(() => RelationshipGraphModel.assertValidStore(invalid), /projectGroupShape/);
});

test('关系模型接受常用 Git 关系预设和自定义显示名称', () => {
  const store = validStore();
  store.entities.push({
    id: 'entity_repo0002',
    type: 'repository',
    name: 'MES Fork',
    refId: 'r_fork123456789',
    details: {}
  });
  store.boards[0].placements.push({ entityId: 'entity_repo0002', x: 320, y: 180 });
  store.relationships.push({
    id: 'relationship_00000004',
    type: 'forked_from',
    sourceId: 'entity_repo0002',
    targetId: 'entity_repo0001',
    label: '客户定制分支'
  });

  const normalized = RelationshipGraphModel.assertValidStore(store);

  assert.equal(normalized.relationships.at(-1).type, 'forked_from');
  assert.equal(normalized.relationships.at(-1).label, '客户定制分支');
  assert.equal(RelationshipGraphModel.connectionAllowed('mirrors', 'repository', 'repository'), true);
  assert.equal(RelationshipGraphModel.connectionAllowed('has_submodule', 'repository', 'repository'), true);
  assert.equal(RelationshipGraphModel.connectionAllowed('forked_from', 'project', 'repository'), false);
});

test('部署节点只接受结构化版本上下文字段', () => {
  const store = validStore();
  store.entities[2].details.imageTag = 'latest';

  assert.throws(
    () => RelationshipGraphModel.assertValidStore(store),
    /details\.imageTag 不是允许的字段/
  );
});

test('白板视图配置保存筛选和精简模式并兼容旧数据', () => {
  const store = validStore();
  store.boards[0].view = {
    ...RelationshipGraphModel.defaultBoardView(),
    mode: 'compact',
    projection: 'deployment-summary',
    snapMode: 'grid',
    query: 'MES production',
    entityType: 'deployment',
    entityTypes: ['deployment', 'server'],
    environment: 'production',
    verification: 'stale',
    annotation: 'has-note',
    task: 'overdue',
    taskFilters: ['open', 'overdue'],
    runtimeStates: ['normal', 'warning'],
    label: '生产'
  };

  const normalized = RelationshipGraphModel.assertValidStore(store);

  assert.deepEqual(normalized.boards[0].view, store.boards[0].view);
});

test('白板元素保存标签、可折叠备注和带截止提醒的待办，而不污染关系事实', () => {
  const store = validStore();
  store.boards[0].placements[0] = {
    ...store.boards[0].placements[0],
    titleMode: 'prefix',
    titleText: '核心',
    titleSource: 'note',
    statusVisibility: 'hide',
    iconKey: 'database',
    labels: ['生产', '关键'],
    note: '发布前复核数据库备份。',
    todos: [{
      id: 'todo_release01',
      title: '核对发布清单',
      completed: false,
      dueAt: '2026-08-31T10:00:00+08:00',
      reminderAt: '2026-08-31T09:30:00+08:00'
    }]
  };

  const normalized = RelationshipGraphModel.assertValidStore(store);

  assert.deepEqual(normalized.boards[0].placements[0], {
    entityId: 'entity_project1',
    x: 0,
    y: 0,
    titleMode: 'prefix',
    titleText: '核心',
    titleSource: 'note',
    statusVisibility: 'hide',
    iconKey: 'database',
    labels: ['生产', '关键'],
    note: '发布前复核数据库备份。',
    todos: [{
      id: 'todo_release01',
      title: '核对发布清单',
      completed: false,
      dueAt: '2026-08-31T02:00:00.000Z',
      reminderAt: '2026-08-31T01:30:00.000Z'
    }]
  });
  assert.equal(normalized.entities[0].details.notes, undefined);
});

test('访问点单卡可覆盖域名或网站标题来源', () => {
  const store = validStore();
  store.boards[0].placements[0].titleSource = 'website';
  assert.equal(RelationshipGraphModel.assertValidStore(store).boards[0].placements[0].titleSource, 'website');
  store.boards[0].placements[0].titleSource = 'domain';
  assert.equal(RelationshipGraphModel.assertValidStore(store).boards[0].placements[0].titleSource, 'domain');
});

test('图标设置只改变白板显示偏好并拒绝未知图标', () => {
  const store = validStore();
  store.boards[0].view = {
    ...RelationshipGraphModel.defaultBoardView(),
    cardIcons: { ...RelationshipGraphModel.DEFAULT_CARD_ICONS, deployment: 'database', endpoint: 'none' }
  };
  store.boards[0].placements[2].iconKey = 'service';
  const normalized = RelationshipGraphModel.assertValidStore(store);
  assert.equal(normalized.boards[0].view.cardIcons.deployment, 'database');
  assert.equal(normalized.boards[0].view.cardIcons.endpoint, 'none');
  assert.equal(normalized.boards[0].placements[2].iconKey, 'service');
  assert.equal(normalized.entities[2].type, 'deployment');

  const legacy = validStore();
  legacy.boards[0].view = { ...RelationshipGraphModel.defaultBoardView() };
  delete legacy.boards[0].view.cardIcons;
  assert.deepEqual(RelationshipGraphModel.assertValidStore(legacy).boards[0].view.cardIcons, RelationshipGraphModel.DEFAULT_CARD_ICONS);

  store.boards[0].placements[2].iconKey = 'unknown-icon';
  assert.throws(() => RelationshipGraphModel.assertValidStore(store), /iconKey 无效/);
});

test('白板视图配置拒绝未知模式、筛选枚举和额外字段', () => {
  const store = validStore();
  store.boards[0].view = {
    mode: 'dense',
    projection: 'guessed-runtime',
    query: '',
    entityType: 'folder',
    environment: '',
    verification: 'trusted',
    hiddenFact: true
  };

  assert.throws(
    () => RelationshipGraphModel.assertValidStore(store),
    /mode 无效|entityType 无效|verification 无效|不是允许的字段/
  );
});

test('关系模型拒绝不符合类型方向的连线', () => {
  const store = validStore();
  store.relationships[0] = {
    id: 'relationship_00000009',
    type: 'runs_on',
    sourceId: 'entity_server01',
    targetId: 'entity_deploy01'
  };
  assert.throws(
    () => RelationshipGraphModel.assertValidStore(store),
    /不允许 server 通过 runs_on 连接到 deployment/
  );
});

test('关系模型不允许路径字段和服务器凭据进入持久化数据', () => {
  const store = validStore();
  store.entities[0].path = '/Volumes/project/secret';
  store.entities[3].details.password = 'do-not-store';
  assert.throws(() => RelationshipGraphModel.assertValidStore(store), /不是允许的字段|敏感信息/);
});

test('关系模型拒绝重复引用和悬空布局', () => {
  const duplicate = validStore();
  duplicate.entities.push({
    id: 'entity_project2',
    type: 'project',
    name: 'MES duplicate',
    refId: duplicate.entities[0].refId,
    details: {}
  });
  assert.throws(() => RelationshipGraphModel.assertValidStore(duplicate), /重复引用/);

  const dangling = validStore();
  dangling.boards[0].placements.push({ entityId: 'entity_missing1', x: 10, y: 10 });
  assert.throws(() => RelationshipGraphModel.assertValidStore(dangling), /不存在的节点/);
});

test('视觉分组成员关系只保存在同一白板布局中', () => {
  const store = validStore();
  store.entities.push({ id: 'entity_group001', type: 'group', name: '生产链路', details: {} });
  store.boards[0].placements.push({ entityId: 'entity_group001', x: -40, y: -60 });
  store.boards[0].placements[0].groupId = 'entity_group001';
  store.boards[0].placements[1].groupId = 'entity_group001';

  const normalized = RelationshipGraphModel.assertValidStore(store);

  assert.equal(normalized.boards[0].placements[0].groupId, 'entity_group001');
  assert.equal(normalized.boards[0].placements[1].groupId, 'entity_group001');
  assert.equal(normalized.entities.find(entity => entity.id === 'entity_group001').type, 'group');
});

test('视觉分组拒绝悬空引用和非分组目标，允许无环嵌套', () => {
  const missing = validStore();
  missing.boards[0].placements[0].groupId = 'entity_missing1';
  assert.throws(() => RelationshipGraphModel.assertValidStore(missing), /groupId.*不存在|分组.*当前白板/);

  const wrongType = validStore();
  wrongType.boards[0].placements[0].groupId = 'entity_server01';
  assert.throws(() => RelationshipGraphModel.assertValidStore(wrongType), /groupId.*分组节点/);

  const nested = validStore();
  nested.entities.push(
    { id: 'entity_group001', type: 'group', name: '外层', details: {} },
    { id: 'entity_group002', type: 'group', name: '内层', details: {} }
  );
  nested.boards[0].placements.push(
    { entityId: 'entity_group001', x: 0, y: 160, groupId: 'entity_group002' },
    { entityId: 'entity_group002', x: 320, y: 160 }
  );
  assert.equal(RelationshipGraphModel.assertValidStore(nested).boards[0].placements.at(-2).groupId, 'entity_group002');
  nested.boards[0].placements.at(-1).groupId = 'entity_group001';
  assert.throws(() => RelationshipGraphModel.assertValidStore(nested), /循环嵌套/);
  nested.boards[0].placements.at(-1).groupId = 'entity_group002';
  assert.throws(() => RelationshipGraphModel.assertValidStore(nested), /自身|循环嵌套/);
});

test('群组配色保存在白板布局，拒绝非法颜色和普通卡片的群组样式', () => {
  const store = validStore();
  store.entities.push({ id: 'entity_group001', type: 'group', name: '生产链路', details: {} });
  store.boards[0].placements.push({ entityId: 'entity_group001', x: 10, y: 10, groupBackground: '#ABCDEF', groupBorder: '#123456' });
  const normalized = RelationshipGraphModel.assertValidStore(store);
  assert.equal(normalized.boards[0].placements.at(-1).groupBackground, '#abcdef');
  assert.equal(normalized.boards[0].placements.at(-1).groupBorder, '#123456');
  store.boards[0].placements.at(-1).groupBorder = 'red; background:url(x)';
  assert.throws(() => RelationshipGraphModel.assertValidStore(store), /十六进制颜色/);
  delete store.boards[0].placements.at(-1).groupBorder;
  store.boards[0].placements[0].groupBackground = '#123456';
  assert.throws(() => RelationshipGraphModel.assertValidStore(store), /分组.*颜色/);
});

test('单个群组可保存矩形、多边形和三种显示样式，并迁移旧圆形', () => {
  const store = validStore();
  store.entities.push({ id: 'entity_group001', type: 'group', name: '项目容器', details: {} });
  store.boards[0].placements.push({ entityId: 'entity_group001', x: 10, y: 10,
    groupShape: 'polygon', groupAppearance: 'outline' });
  const placement = RelationshipGraphModel.assertValidStore(store).boards[0].placements.at(-1);
  assert.equal(placement.groupShape, 'polygon');
  assert.equal(placement.groupAppearance, 'outline');
  const legacy = structuredClone(store); legacy.boards[0].placements.at(-1).groupShape = 'circle';
  assert.equal(RelationshipGraphModel.assertValidStore(legacy).boards[0].placements.at(-1).groupShape, 'rounded');
  for (const [key, value] of [['groupShape', 'star'], ['groupAppearance', 'glass']]) {
    const invalid = structuredClone(store); invalid.boards[0].placements.at(-1)[key] = value;
    assert.throws(() => RelationshipGraphModel.assertValidStore(invalid), new RegExp(key));
  }
  store.boards[0].placements[0].groupShape = 'circle';
  assert.throws(() => RelationshipGraphModel.assertValidStore(store), /groupShape/);
});

test('群组排列方式和尺寸可保存并校验，普通卡片不能使用群组字段', () => {
  const store = validStore();
  store.entities.push({ id: 'entity_group001', type: 'group', name: '生产环境', details: {} });
  const group = { entityId: 'entity_group001', x: 10, y: 20, groupLayout: 'auto', groupWidth: 800, groupHeight: 600 };
  store.boards[0].placements.push(group);
  assert.deepEqual(RelationshipGraphModel.assertValidStore(store).boards[0].placements.at(-1), group);
  for (const [key, value] of [['groupLayout', 'other'], ['groupWidth', 100], ['groupHeight', Infinity]]) {
    const invalid = structuredClone(store);
    invalid.boards[0].placements.at(-1)[key] = value;
    assert.throws(() => RelationshipGraphModel.assertValidStore(invalid), new RegExp(key));
  }
  store.boards[0].placements[0].groupLayout = 'auto';
  assert.throws(() => RelationshipGraphModel.assertValidStore(store), /groupLayout/);
});

test('访问点可按单张卡片保存卡片或网页预览模式', () => {
  const store = validStore();
  store.entities.push({ id: 'entity_endpoint01', type: 'endpoint', name: 'MES', details: { urlLabel: 'https://mes.example.com' } });
  store.boards[0].placements.push({ entityId: 'entity_endpoint01', x: 1280, y: 0, endpointView: 'web' });
  assert.equal(RelationshipGraphModel.assertValidStore(store).boards[0].placements.at(-1).endpointView, 'web');
  store.boards[0].placements.at(-1).endpointView = 'invalid';
  assert.throws(() => RelationshipGraphModel.assertValidStore(store), /endpointView/);
  store.boards[0].placements.at(-1).endpointView = 'web';
  store.boards[0].placements[0].endpointView = 'web';
  assert.throws(() => RelationshipGraphModel.assertValidStore(store), /endpointView/);
});

test('事实来源和验证时间使用受控值并规范化为 ISO 时间', () => {
  const store = validStore();
  store.relationships[2].source = 'observed';
  store.relationships[2].verifiedAt = '2026-08-27T14:30:00+08:00';
  store.relationships[2].evidenceSummary = '只读检查部署状态';

  const normalized = RelationshipGraphModel.assertValidStore(store);

  assert.equal(normalized.relationships[2].source, 'observed');
  assert.equal(normalized.relationships[2].verifiedAt, '2026-08-27T06:30:00.000Z');
  assert.equal(normalized.relationships[2].evidenceSummary, '只读检查部署状态');
});

test('关系模型拒绝伪造来源和无时区验证时间', () => {
  const invalidSource = validStore();
  invalidSource.relationships[0].source = 'auto-trusted';
  assert.throws(() => RelationshipGraphModel.assertValidStore(invalidSource), /不是允许的事实来源/);

  const invalidTime = validStore();
  invalidTime.relationships[0].verifiedAt = '2026-08-27 14:30';
  assert.throws(() => RelationshipGraphModel.assertValidStore(invalidTime), /带时区的 ISO 时间/);
});

test('事实核验状态明确区分待验证、已验证和超过三十天待复核', () => {
  const now = new Date('2026-08-27T12:00:00.000Z');
  assert.equal(RelationshipGraphModel.verificationStatus({}, { now }).state, 'unverified');
  assert.equal(RelationshipGraphModel.verificationStatus({
    verifiedAt: '2026-08-20T12:00:00.000Z'
  }, { now }).state, 'verified');
  const stale = RelationshipGraphModel.verificationStatus({
    verifiedAt: '2026-07-01T12:00:00.000Z'
  }, { now });
  assert.equal(stale.state, 'stale');
  assert.equal(stale.label, '待复核');
  assert.ok(stale.ageDays > RelationshipGraphModel.VERIFICATION_STALE_DAYS);
});

test('单条事实可覆盖默认复核周期并保持整数天边界', () => {
  const store = validStore();
  store.entities[3].verifiedAt = '2026-08-20T12:00:00.000Z';
  store.entities[3].reviewIntervalDays = 7;
  store.relationships[0].verifiedAt = '2026-08-20T12:00:00.000Z';
  store.relationships[0].reviewIntervalDays = 90;

  const normalized = RelationshipGraphModel.assertValidStore(store);
  const now = new Date('2026-08-28T12:00:00.000Z');

  assert.equal(normalized.entities[3].reviewIntervalDays, 7);
  assert.equal(normalized.relationships[0].reviewIntervalDays, 90);
  assert.equal(RelationshipGraphModel.verificationStatus(normalized.entities[3], { now }).state, 'stale');
  assert.equal(RelationshipGraphModel.verificationStatus(normalized.entities[3], { now }).maxAgeDays, 7);
  assert.equal(RelationshipGraphModel.verificationStatus(normalized.relationships[0], { now }).state, 'verified');

  for (const invalidValue of [0, 3651, 7.5, '7']) {
    const invalid = validStore();
    invalid.entities[3].reviewIntervalDays = invalidValue;
    assert.throws(
      () => RelationshipGraphModel.assertValidStore(invalid),
      /reviewIntervalDays 必须是 1 到 3650 之间的整数天数/
    );
  }
});
