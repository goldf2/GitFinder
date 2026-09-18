const test = require('node:test');
const assert = require('node:assert/strict');
const Model = globalThis.RelationshipGraphModel = require('../src/shared/relationshipGraphModel');
const Toolbar = require('../src/renderer/scripts/relationshipBoardToolbarView');
const Routing = require('../src/shared/relationshipFlowRouting');
const { Controller } = require('../src/renderer/scripts/relationshipBoardController');
const limits = { textScale: [.5, 3], groupTitleFontSize: [8, 96], edgeLabelFontSize: [6, 48], memberLabelFontSize: [6, 48] };
function store(view = {}, fontSize = '24') {
  return { schemaVersion: 1, activeBoardId: 'board_text_range', entities: [{ id: 'entity_text_range', type: 'text', name: '文字', details: { content: '示例', fontSize, width: '800', height: '800' }, source: 'manual' }], relationships: [], boards: [{ id: 'board_text_range', name: '字号', view: { ...Model.defaultBoardView(), ...view }, viewport: { x: 0, y: 0, zoom: 1 }, placements: [{ entityId: 'entity_text_range', x: 100, y: 100 }] }] };
}
function controller(view = {}) {
  const c = new Controller({ bridge: {}, notify() {} });
  c.store = store(view);
  return c;
}
for (const [key, [min, max]] of Object.entries(limits)) {
  test(`${key} 控件、显示和模型保存接受扩大后的两个端点`, () => {
    for (const value of [min, max]) {
      const c = controller({ [key]: value });
      const normalized = Model.assertValidStore(c.store);
      assert.equal(normalized.boards[0].view[key], value);
      const display = c._displayViewSettings(); assert.equal(display[key], value);
      const html = Toolbar.displayPopover({ view: display, boardView: c.store.boards[0].view, icon: '', cardIconOptions: [], escapeHtml: value => String(value ?? '') });
      const input = html.match(new RegExp(`<input name="${key}"[^>]*>`))?.[0];
      assert.ok(input); assert.match(input, new RegExp(`min="${min}"`)); assert.match(input, new RegExp(`max="${max}"`));
      assert.match(input, new RegExp(`value="${value}"`));
    }
  });
}
test('扩大范围不改变既有默认和合法旧值', () => {
  const defaults = Model.defaultBoardView();
  assert.equal(defaults.textScale, 1); assert.equal(defaults.groupTitleFontSize, 20);
  assert.equal(defaults.edgeLabelFontSize, 10); assert.equal(defaults.memberLabelFontSize, 12);
  const view = { textScale: 1.15, groupTitleFontSize: 28, edgeLabelFontSize: 16, memberLabelFontSize: 18 };
  const saved = Model.assertValidStore(store(view)).boards[0].view;
  for (const [key, value] of Object.entries(view)) assert.equal(saved[key], value);
});
test('超界与非有限字号按约定回退，不产生无界尺寸', () => {
  for (const [key, [min, max]] of Object.entries(limits)) {
    for (const [input, expected] of [[-100, min], [1e6, max], [NaN, Model.defaultBoardView()[key]]]) {
      const c = controller({ [key]: input });
      assert.equal(c._displayViewSettings()[key], expected);
      assert.equal(Model.assertValidStore(c.store).boards[0].view[key], expected);
    }
  }
});
test('显示表单写入不再把新字号截回旧上限', t => {
  const before = globalThis.FormData;
  globalThis.FormData = class { constructor(form) { this.values = form.values; } get(key) { return this.values[key] ?? null; } };
  t.after(() => { globalThis.FormData = before; });
  const c = controller(); c._captureDisplayLayout = () => ({ history: 'test' });
  for (const key of ['_pushUndoSnapshot', '_applyViewMode', '_syncDisplayForm', '_persistSoon', '_renderGraph', '_refreshHistoryButtons']) c[key] = () => {};
  const values = { ...c._displayViewSettings(), ...Object.fromEntries(Object.entries(limits).map(([k,v])=>[k,v[1]])) };
  c._updateBoardDisplayFromForm({ values, elements: { namedItem: key => ({ checked: values[key] }) } });
  for (const [key, [,max]] of Object.entries(limits)) assert.equal(c.store.boards[0].view[key], max);
});
test('独立文字编辑提供8–256字号，模型和导出保留而不是截断', async () => {
  const c = controller(); let field;
  c._openFormDialog = async config => { field = config.fields.find(item => item.key === 'fontSize'); return null; };
  await c._editCanvasElement('entity_text_range');
  assert.equal(field.min, 8); assert.equal(field.max, 256);
  for (const value of ['8', '256']) {
    const normalized = Model.assertValidStore(store({}, value));
    assert.equal(normalized.entities[0].details.fontSize, value);
    c.store = normalized;
    assert.equal(c._buildActiveBoardExportStore().entities[0].details.fontSize, value);
  }
});
test('路由的标题宽高估计使用96px，不残留36px上限', () => {
  const entity = { id: 'entity_group_test', name: '文字范围测试文字范围测试', type: 'group' };
  assert.ok(Routing.titleWidth(entity, 2, 96) > Routing.titleWidth(entity, 2, 36) * 2);
  const node = { id: entity.id, type: 'relationshipGroup', data: { entity }, position: { x: 0, y: 0 }, style: { width: 800, height: 600 } };
  const obstacles = Routing.visualObstacles([node], new Map([[node.id, { x: 0, y: 0, width: 800, height: 600 }]]), { zoom: 1, groupTitleFontSize: 96 });
  assert.ok(obstacles.find(x=>x.kind==='title').height >= 106);
});
test('真实文件往返保留扩大的字号和隐藏状态', t => {
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {WhiteboardDocumentService}=require('../src/main/services/whiteboardDocumentService');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gitfinder-fonts-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const service=new WhiteboardDocumentService({baseDirectory:path.join(dir,'profile')});
  const input=store(Object.fromEntries(Object.entries(limits).map(([k,v])=>[k,v[1]])), '256');
  input.boards[0].hiddenResourceIds=['entity_text_range'];
  const written=service.save({store:input},path.join(dir,'font.gitfinder-board.json'));
  const reopened=service.open(written.record.id).store;
  for (const [key,[,max]] of Object.entries(limits)) assert.equal(reopened.boards[0].view[key],max);
  assert.equal(reopened.entities[0].details.fontSize,'256');
  assert.deepEqual(reopened.boards[0].hiddenResourceIds,['entity_text_range']);
});

test('大字体预留空间，默认与旧范围卡片尺寸不变', () => {
  const c=controller();
  const normal=c._nodeDimensions();
  assert.deepEqual(c._nodeDimensions({...c._displayViewSettings(),textScale:1.3}),normal);
  const large=c._nodeDimensions({...c._displayViewSettings(),textScale:3});
  assert.ok(large.height>normal.height+200);assert.ok(large.width>normal.width);
  assert.equal(c._textLayoutMetrics().containerHeaderHeight,72);
  assert.ok(c._textLayoutMetrics({...c._displayViewSettings(),groupTitleFontSize:96}).containerHeaderHeight>195);
});
test('放大的Project标题边界保留锁定成员世界坐标，不累加位移', () => {
  const Adapter=require('../src/shared/relationshipFlowAdapter');
  const graph={entities:[{id:'entity_panel_projectgroup_font',name:'Project',type:'group'},{id:'entity_font_child',name:'Child',type:'deployment'}],placements:[{entityId:'entity_panel_projectgroup_font',x:100,y:100,groupWidth:400,groupHeight:300,groupLayout:'manual'},{entityId:'entity_font_child',x:124,y:172,groupId:'entity_panel_projectgroup_font',locked:true}],relationships:[]};
  const before=JSON.stringify(graph),c=controller({groupTitleFontSize:96,memberLabelFontSize:48});
  const options={hostContainers:true,layout:'free',...c._textLayoutMetrics()};
  const model=Adapter.toFlowModel(graph,options),group=model.nodes.find(n=>n.type==='relationshipGroup'),child=model.nodes.find(n=>n.id==='entity_font_child');
  assert.equal(group.position.x+child.position.x,124);assert.equal(group.position.y+child.position.y,172);
  assert.ok(child.position.y>=options.containerHeaderHeight);
  assert.equal(child.draggable,false);assert.equal(JSON.stringify(graph),before);
  assert.deepEqual(Adapter.toFlowModel(graph,options),model);
});
test('独立256px文字的小文本框至少能显示完整一行，默认大小保持', () => {
  const Adapter=require('../src/shared/relationshipFlowAdapter');const c=controller();
  c.store.entities[0].details.height='180';
  const dimensions=()=>Adapter.toFlowModel({entities:c.store.entities,placements:c.store.boards[0].placements,relationships:[]},{}).nodes[0].style;
  assert.equal(dimensions().height,180);
  c.store.entities[0].details.fontSize='256';assert.ok(dimensions().height>=391);
  assert.ok(c._displayGeometryMap(c.store.boards[0].placements).get('entity_text_range').height>=391);
});
