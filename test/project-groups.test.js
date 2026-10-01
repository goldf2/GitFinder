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

const categoryId = 'project_group_33333333-3333-4333-8333-333333333333';
const childId = 'project_group_44444444-4444-4444-8444-444444444444';
const parentId = 'project_group_55555555-5555-4555-8555-555555555555';
function collectionFixture() {
  return ProjectGroups.normalizeStore({ groups: [
    {groupId:categoryId,name:'业务系统',projectIds:[]},
    {groupId:childId,name:'商城产品',kind:'collection',projectIds:[projectA],collectionIds:[]},
    {groupId:parentId,name:'在线商城',kind:'collection',categoryId,projectIds:[projectB],collectionIds:[childId]}
  ]});
}
const physicalProjects = [
  { projectId:projectA,name:'前端',path:'/a',repositories:[{path:'/a',relativePath:'.'}] },
  { projectId:projectB,name:'支付',path:'/b',repositories:[{path:'/b',relativePath:'.'}] }
];
test('嵌套项目投影只在顶层显示父项目，内部仓库去重且原对象不变',()=>{
  const original=JSON.stringify(physicalProjects), store=collectionFixture();
  const entries=ProjectGroups.projectEntries(physicalProjects,store.groups);
  assert.equal(entries.length,1);assert.equal(entries[0].projectId,parentId);
  assert.equal(entries[0].repositoryCount,2);assert.equal(entries[0].memberProjects[0].projectId,childId);
  assert.equal(entries[0].memberProjects[0].categoryId,categoryId);
  assert.deepEqual(ProjectGroups.projectEntries(physicalProjects,store.groups,childId),[physicalProjects[0]]);
  assert.equal(JSON.stringify(physicalProjects),original);
});
test('父项目仓库筛选包含嵌套子项目，分类继承粗类别',()=>{
  const groups=collectionFixture().groups;
  assert.equal(ProjectGroups.repositoryMatchesType(physicalProjects[0],groups,parentId),true);
  assert.equal(ProjectGroups.repositoryMatchesType(physicalProjects[0],groups,categoryId),true);
  assert.equal(ProjectGroups.repositoryMatchesType(physicalProjects[1],groups,childId),false);
  assert.equal(ProjectGroups.repositoryMatchesType(physicalProjects[0],groups,'unclassified'),false);
});
test('拒绝把祖先放入后代，失败时保留原成员关系',()=>{
  const store=collectionFixture(),before=JSON.stringify(store);
  assert.throws(()=>ProjectGroups.updateGroup(store,childId,{collectionIds:[parentId]}),/子项目/);
  assert.throws(()=>ProjectGroups.updateGroup(store,parentId,{collectionIds:[parentId]}),/自身/);
  assert.equal(JSON.stringify(store),before);
});
test('解除嵌套子项目合并时成员回到父层，不删除项目身份',()=>{
  const result=ProjectGroups.deleteGroup(collectionFixture(),childId);
  const parent=result.store.groups.find(g=>g.groupId===parentId);
  assert.deepEqual(parent.collectionIds,[]);assert.deepEqual(new Set(parent.projectIds),new Set([projectA,projectB]));
  assert.equal(ProjectGroups.projectEntries(physicalProjects,result.store.groups)[0].memberProjects.length,2);
});
test('解除根项目合并恢复独立子项目；未参与合并的项目仍独立',()=>{
  const extra={projectId:'project_66666666-6666-4666-8666-666666666666',name:'独立项目',path:'/extra',repositories:[]};
  const result=ProjectGroups.deleteGroup(collectionFixture(),parentId);
  const entries=ProjectGroups.projectEntries([...physicalProjects,extra],result.store.groups);
  assert.deepEqual(new Set(entries.map(p=>p.projectId)),new Set([childId,projectB,extra.projectId]));
});
test('暂不可用成员保留引用与提示，不把其它目录强制纳入项目',()=>{
  const store=collectionFixture();const entries=ProjectGroups.projectEntries([],store.groups);
  assert.equal(entries.length,1);assert.equal(entries[0].missingMemberCount,1);
  assert.equal(entries[0].memberProjects[0].missingMemberCount,1);
  assert.deepEqual(ProjectGroups.projectEntries([],[]),[]);
});


test('仓库直接分类与分组继承分类并存，不被旧分组覆盖', () => {
  const groups = collectionFixture().groups;
  const directId = 'project_group_66666666-6666-4666-8666-666666666666';
  groups.push({ groupId: directId, name: '研发工具', projectIds: [projectA] });
  assert.equal(ProjectGroups.repositoryMatchesType(physicalProjects[0], groups, directId), true);
  assert.equal(ProjectGroups.repositoryMatchesType(physicalProjects[0], groups, categoryId), true);
  assert.equal(ProjectGroups.repositoryMatchesType(physicalProjects[0], groups, 'unclassified'), false);
  groups.find(group => group.groupId === parentId).categoryId = '';
  assert.equal(ProjectGroups.repositoryMatchesType(physicalProjects[0], groups, 'unclassified'), false);
  groups.find(group => group.groupId === directId).projectIds = [];
  assert.equal(ProjectGroups.repositoryMatchesType(physicalProjects[0], groups, 'unclassified'), true);
});
