const test = require('node:test');
const assert = require('node:assert/strict');
const Projection = require('../src/shared/panelTopologyProjection');

test('Project 纵向列表按主机分列且重复排列稳定，不改变归属', () => {
  const graph = {
    entities: [
      { id: 'host1', type: 'server', name: 'AL01' }, { id: 'host2', type: 'server', name: 'AL02' },
      { id: 'a', type: 'group', name: 'A' }, { id: 'b', type: 'group', name: 'B' },
      { id: 'c', type: 'group', name: 'C' },
      ...['a', 'b', 'c'].map(id => ({ id: `d${id}`, type: 'deployment', name: id }))
    ],
    placements: [
      ...['host1', 'host2'].map(entityId => ({ entityId, x: 0, y: 0 })),
      ...['b', 'c', 'a'].flatMap(entityId => [
        { entityId, x: 20, y: 20, groupWidth: 400, groupHeight: 240 },
        { entityId: `d${entityId}`, groupId: entityId, x: 50, y: 80 }
      ])
    ],
    relationships: ['a', 'b', 'c'].map(id => ({ sourceId: `d${id}`, targetId: id === 'c' ? 'host2' : 'host1', type: 'runs_on' }))
  };
  const options = { style: 'project-columns', preserveGroupContents: true, groupTitleSpace: 60 };
  const edges = structuredClone(graph.relationships);
  Projection.arrangeBoardLayout(graph, options);
  const byId = new Map(graph.placements.map(p => [p.entityId, p]));
  assert.equal(byId.get('a').x, byId.get('b').x);
  assert.ok(byId.get('a').y < byId.get('b').y);
  assert.ok(byId.get('c').x > byId.get('a').x + byId.get('a').groupWidth);
  assert.ok(byId.get('host1').y < byId.get('a').y);
  assert.equal(byId.get('da').groupId, 'a');
  assert.deepEqual(graph.relationships, edges);
  const before = structuredClone(graph);
  Projection.arrangeBoardLayout(graph, options);
  assert.deepEqual(graph, before);
});

const shrinkOptions = {
  style: 'project-columns', preserveGroupContents: true, shrinkAutoProjectGroups: true,
  width: 240, height: 100, horizontalSpacing: 48, verticalSpacing: 32, groupTitleSpace: 60,
  viewportAspectRatio: 1.6
};

function historicalProjects(projects) {
  const graph = {
    entities: [{ id: 'host', type: 'server', name: 'Host' }],
    placements: [{ entityId: 'host', x: 0, y: 0, width: 240, height: 100 }],
    relationships: []
  };
  for (const [index, project] of projects.entries()) {
    const id = project.id, x = index * 5000, y = 300;
    graph.entities.push({ id, type: 'group', name: project.name || id,
      ...(project.sampled !== false ? { runtime: { dynamicKind: 'coolify-project-group' } } : {}) });
    graph.placements.push({ entityId: id, x, y, groupLayout: project.groupLayout || 'auto',
      groupWidth: 4800, groupHeight: 7200, ...(project.locked ? { locked: true } : {}) });
    for (let member = 0; member < (project.count || 6); member++) {
      const memberId = `${id}_deployment${member}`;
      graph.entities.push({ id: memberId, type: 'deployment', name: `Deployment ${member}` });
      graph.placements.push({ entityId: memberId, groupId: id, x: x + 36 + member * 500,
        y: y + 64 + member * 800, width: 240, height: 100, note: 'keep',
        ...(project.lockedMember && !member ? { locked: true } : {}) });
      graph.relationships.push({ sourceId: memberId, targetId: 'host', type: 'runs_on' });
    }
  }
  return graph;
}

for (const project of [
  { id: 'runtime_project' },
  { id: 'entity_panel_projectgroup_saved', sampled: false }
]) {
  test(`Project 纵向列表收紧历史自动采样容器并形成紧凑网格：${project.id}`, () => {
    const graph = historicalProjects([project]);
    const facts = structuredClone({ entities: graph.entities, relationships: graph.relationships,
      members: graph.placements.map(({ entityId, groupId, note }) => ({ entityId, groupId, note })) });
    Projection.arrangeBoardLayout(graph, shrinkOptions);
    const group = graph.placements.find(item => item.entityId === project.id);
    const members = graph.placements.filter(item => item.groupId === project.id);
    assert.ok(group.groupWidth < 1600 && group.groupHeight < 1000, '旧 4800×7200 边界必须按内容收紧');
    assert.ok(new Set(members.map(item => item.x)).size > 1, '六张卡片应排成多列');
    assert.ok(new Set(members.map(item => item.y)).size > 1, '六张卡片应排成多行');
    assert.ok(new Set(members.map(item => item.x)).size < members.length, '同一列卡片须对齐');
    assert.ok(new Set(members.map(item => item.y)).size < members.length, '同一行卡片须对齐');
    for (const [index, item] of members.entries()) {
      assert.ok(item.x >= group.x && item.y >= group.y
        && item.x + item.width <= group.x + group.groupWidth
        && item.y + item.height <= group.y + group.groupHeight, '每张卡片都应在收紧后的容器内');
      for (const other of members.slice(index + 1)) {
        assert.ok(!(item.x < other.x + other.width && item.x + item.width > other.x
          && item.y < other.y + other.height && item.y + item.height > other.y), '网格成员不能相互遮挡');
      }
    }
    assert.deepEqual({ entities: graph.entities, relationships: graph.relationships,
      members: graph.placements.map(({ entityId, groupId, note }) => ({ entityId, groupId, note })) }, facts);
    const first = structuredClone(graph);
    Projection.arrangeBoardLayout(graph, shrinkOptions);
    assert.deepEqual(graph, first, '再次排列不增长尺寸、不移动成员、不改变事实');
  });
}

test('Project 纵向列表收紧时保留手工组、锁定组、锁定成员及非采样组', () => {
  const protectedProjects = [
    { id: 'manual_project', groupLayout: 'manual' },
    { id: 'locked_project', locked: true },
    { id: 'locked_member_project', lockedMember: true },
    { id: 'ordinary_group', sampled: false }
  ];
  const graph = historicalProjects([{ id: 'auto_project' }, ...protectedProjects]);
  const before = new Map(structuredClone(graph.placements).map(item => [item.entityId, item]));
  Projection.arrangeBoardLayout(graph, shrinkOptions);
  for (const project of protectedProjects) {
    const group = graph.placements.find(item => item.entityId === project.id), previous = before.get(project.id);
    assert.deepEqual([group.groupWidth, group.groupHeight], [previous.groupWidth, previous.groupHeight], `${project.id} 保留原尺寸`);
    for (const item of graph.placements.filter(item => item.groupId === project.id)) {
      const old = before.get(item.entityId);
      assert.deepEqual([item.x - group.x, item.y - group.y], [old.x - previous.x, old.y - previous.y], `${project.id} 保留内部相对位置`);
      if (project.locked || project.lockedMember) assert.deepEqual(item, old, '含锁定点的整组不能移动');
    }
    if (project.locked || project.lockedMember) assert.deepEqual(group, previous, '含锁定点的容器保持原位');
  }
});

test('Project 纵向列表中不同宽度的自动 Project 按名称排序且左边缘对齐', () => {
  const graph = historicalProjects([{ id: 'wide', name: 'B', count: 6 }, { id: 'narrow', name: 'A', count: 1 }]);
  Projection.arrangeBoardLayout(graph, shrinkOptions);
  const wide = graph.placements.find(item => item.entityId === 'wide');
  const narrow = graph.placements.find(item => item.entityId === 'narrow');
  assert.notEqual(wide.groupWidth, narrow.groupWidth, '夹具需要不同的实际内容宽度');
  assert.equal(wide.x, narrow.x, 'Project 列须左对齐，不能按最大宽度居中');
  assert.ok(narrow.y + narrow.groupHeight < wide.y, '按名称排放且容器之间保留间距');
  const first = structuredClone(graph);
  Projection.arrangeBoardLayout(graph, shrinkOptions);
  assert.deepEqual(graph, first);
});

test('Project 纵向列表未启用收紧选项时继续保留历史容器与内部位置', () => {
  const graph = historicalProjects([{ id: 'preserved_project' }]);
  const before = structuredClone(graph.placements);
  Projection.arrangeBoardLayout(graph, { ...shrinkOptions, shrinkAutoProjectGroups: false });
  const group = graph.placements[1], previous = before[1];
  assert.deepEqual([group.groupWidth, group.groupHeight], [previous.groupWidth, previous.groupHeight]);
  for (const item of graph.placements.filter(item => item.groupId === group.entityId)) {
    const old = before.find(entry => entry.entityId === item.entityId);
    assert.deepEqual([item.x - group.x, item.y - group.y], [old.x - previous.x, old.y - previous.y]);
  }
});
