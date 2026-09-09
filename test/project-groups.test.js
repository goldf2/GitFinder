const test = require('node:test');
const assert = require('node:assert/strict');

const ProjectGroups = require('../src/shared/projectGroups');
const serviceSingleton = require('../src/main/services/projectGroupService');
const ProjectGroupService = serviceSingleton.ProjectGroupService;

const projectA = 'project_11111111-1111-4111-8111-111111111111';
const projectB = 'project_22222222-2222-4222-8222-222222222222';

function createService() {
  let store = ProjectGroups.defaultStore();
  const configService = {
    get: key => key === 'projectGroups' ? store : undefined,
    setRendererPreference: (key, value) => {
      assert.equal(key, 'projectGroups');
      store = ProjectGroups.normalizeStore(value);
      return store;
    }
  };
  return { service: new ProjectGroupService({ configService }), getStore: () => store };
}

test('项目组保存名称、说明和子项目 ID，重复项目会去重', () => {
  const { service, getStore } = createService();
  const created = service.create({
    name: 'AI 工具链',
    description: '管理一组子项目',
    color: 'green',
    projectIds: [projectA, projectA, projectB, 'invalid']
  });

  assert.match(created.groupId, /^project_group_[0-9a-f-]{36}$/);
  assert.equal(created.name, 'AI 工具链');
  assert.equal(created.color, 'green');
  assert.deepEqual(created.projectIds, [projectA, projectB]);
  assert.deepEqual(service.list().groups.map(group => group.groupId), [created.groupId]);
  assert.deepEqual(getStore().groups[0].projectIds, [projectA, projectB]);
});

test('更新项目组不会改变 groupId，删除项目组不会删除项目身份', () => {
  const { service } = createService();
  const created = service.create({ name: '原组', projectIds: [projectA] });
  const updated = service.update(created.groupId, { name: '新组', projectIds: [projectB] });

  assert.equal(updated.groupId, created.groupId);
  assert.equal(updated.name, '新组');
  assert.deepEqual(updated.projectIds, [projectB]);
  assert.deepEqual(service.delete(created.groupId), { deleted: true, groupId: created.groupId });
  assert.deepEqual(service.list(), ProjectGroups.defaultStore());
});

test('项目组数据规范化会丢弃非法组 ID并限制字段', () => {
  const store = ProjectGroups.normalizeStore({
    groups: [
      { groupId: 'bad', name: '不会保留', projectIds: [projectA] },
      { groupId: 'project_group_33333333-3333-4333-8333-333333333333', name: '有效组', projectIds: [projectA, projectA] }
    ]
  });

  assert.equal(store.groups.length, 1);
  assert.deepEqual(store.groups[0].projectIds, [projectA]);
  assert.equal(store.groups[0].color, 'purple');
});
