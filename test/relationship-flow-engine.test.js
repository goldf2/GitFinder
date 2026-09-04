const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/relationship-canvas/index.jsx'), 'utf8');
const cardIconSource = fs.readFileSync(path.join(__dirname, '../src/renderer/relationship-canvas/CardIcon.jsx'), 'utf8');
const canvasCss = fs.readFileSync(path.join(__dirname, '../src/renderer/relationship-canvas/relationshipCanvas.css'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, '../scripts/visual-fixtures/relationship-flow-engine.js'), 'utf8');
const rendererHtml = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
const controllerSource = fs.readFileSync(path.join(__dirname, '../src/renderer/scripts/relationshipBoardController.js'), 'utf8');
const toolbarViewSource = fs.readFileSync(path.join(__dirname, '../src/renderer/scripts/relationshipBoardToolbarView.js'), 'utf8');

test('新画布直接使用成熟库提供框选、拖动平移、滚轮缩放、边缘滚动和小地图', () => {
  assert.match(source, /selectionOnDrag/);
  assert.match(source, /panOnScroll=\{false\}/);
  assert.match(source, /zoomOnScroll/);
  assert.doesNotMatch(source, /zoomOnScroll=\{false\}/);
  assert.match(source, /zoomActivationKeyCode=\{\['Meta', 'Control'\]\}/);
  assert.match(source, /autoPanOnNodeDrag/);
  assert.match(source, /<MiniMap/);
  assert.match(source, /<NodeToolbar/);
  assert.doesNotMatch(source, /addEventListener\(['"](?:pointermove|wheel)/);
});

test('动态端点变化后主动刷新 React Flow 节点内部信息，避免拖动时连线消失', () => {
  assert.match(source, /useUpdateNodeInternals/);
  assert.match(source, /updateNodeInternals\(nodeId\)/);
});

test('新画布使用更宽缩放范围，多边形容器强制等比缩放', () => {
  assert.match(source, /minZoom=\{0\.03\}/);
  assert.match(source, /maxZoom=\{8\}/);
  assert.match(source, /keepAspectRatio=\{shape === 'polygon'\}/);
  assert.doesNotMatch(canvasCss, /\.gf-flow-group\.is-circle/);
});

test('隔离夹具通过只读 DOM 快照供浏览器验收，不接触用户白板', () => {
  assert.match(fixture, /fixture-data/);
  assert.match(fixture, /JSON\.stringify\(\{\s*includeEndpoints,\s*shape: shapes\[shapeIndex\],\s*lastWheel,\s*graph/s);
  assert.doesNotMatch(fixture, /gitFinder|relationshipBoards|localStorage/);
});

test('正式白板仅加载 React Flow 产物，不再保留旧 DOM/SVG 回退画布', () => {
  assert.match(rendererHtml, /generated\/relationship-canvas\.css/);
  assert.match(rendererHtml, /generated\/relationship-canvas\.js[\s\S]*scripts\/relationshipBoardController\.js/);
  assert.match(controllerSource, /this\.root\.classList\.add\('uses-react-flow'\)/);
  assert.match(controllerSource, /if \(!this\._renderFlowGraph\(\)\)[\s\S]*React Flow 关系白板引擎未加载/);
  assert.match(controllerSource, /RelationshipCanvasEngine\.toPlacements/);
  assert.doesNotMatch(controllerSource, /relationship-(?:world|node-layer|edge-layer|selection-box)/);
  assert.doesNotMatch(controllerSource, /_handlePointer(?:Down|Move|Up)|_edgeGeometry|_handleWheel/);
});

test('正式桥接保留选择、右键菜单、视口和位置持久化入口', () => {
  assert.match(controllerSource, /onSelectionChange: selection => this\._handleFlowSelection\(selection\)/);
  assert.match(controllerSource, /onViewportChange: viewport => this\._handleFlowViewportChange\(viewport\)/);
  assert.match(controllerSource, /context-node/);
  assert.match(controllerSource, /this\._persistSoon\(160\)/);
  assert.match(source, /onNodeContextMenu/);
  assert.match(source, /onPaneContextMenu/);
  assert.match(source, /change\.type === 'dimensions' && change\.resizing === true/);
});

test('新引擎补回固定下级工具，并在拖动时应用联动位移和 Project 边界', () => {
  assert.match(source, /toggle-descendants/);
  assert.match(source, /固定下级/);
  assert.match(source, /Adapter\.applyLinkedDrag/);
  assert.match(source, /Adapter\.constrainProjectNodes/);
  assert.match(controllerSource, /linkedNodeIds/);
  assert.match(controllerSource, /undraggableIds/);
  assert.match(controllerSource, /action === 'toggle-descendants'/);
});

test('Project 内部署使用模块化智能吸附，并在拖动结束后保持自动间距', () => {
  assert.match(source, /Adapter\.snapProjectDeployment/);
  assert.match(source, /modifierState\.current\.alt/);
  assert.match(source, /horizontalSpacing/);
  assert.match(source, /verticalSpacing/);
  assert.match(controllerSource, /_settleProjectDeployment\(node\.id\)/);
  assert.match(controllerSource, /已对齐 Project 内/);
});

test('访问点由新引擎显示 HTTP 摘要，并支持卡片和隔离网页预览切换', () => {
  assert.match(source, /HTTP \$\{runtime\.httpStatus\}/);
  assert.match(source, /toggle-endpoint-view/);
  assert.match(source, /sandbox="allow-scripts allow-forms"/);
  assert.match(source, /referrerPolicy="no-referrer"/);
  assert.match(controllerSource, /placement\.endpointView === 'web'/);
  assert.match(controllerSource, /delete placement\.endpointView/);
});

test('卡片底部操作复用统一事件按钮，避免详情打开后被节点点击立即关闭', () => {
  assert.match(source, /<ToolbarButton data=\{data\} action="details" entity=\{entity\}>详情<\/ToolbarButton>/);
  assert.match(source, /<ToolbarButton data=\{data\} action="toggle-endpoint-view" entity=\{entity\}>/);
  assert.match(source, /<ToolbarButton data=\{data\} action="open-endpoint" entity=\{entity\}>访问<\/ToolbarButton>/);
  assert.doesNotMatch(source, /<button[^>]+onClick=\{\(\) => data\.onAction\?\.\('details'/);
});

test('资源卡复用内部线性 SVG 图标且关闭图标时不保留空占位', () => {
  assert.match(source, /import CardIcon, \{ defaultCardIcon \} from '\.\/CardIcon'/);
  assert.match(cardIconSource, /function CardIcon\(\{ name \}\)/);
  for (const icon of ['server', 'deployment', 'endpoint', 'repository', 'project', 'database', 'service']) {
    if (icon === 'service') assert.match(cardIconSource, /data-card-icon="service"/);
    else assert.match(cardIconSource, new RegExp(`name === '${icon}'`));
  }
  assert.match(cardIconSource, /data-card-icon=\{name\}/);
  assert.match(source, /iconKey !== 'none' \? <span className="gf-flow-card-icon"/);
  assert.match(canvasCss, /\.gf-flow-card-icon svg\s*\{[^}]*display:\s*block[^}]*width:\s*24px[^}]*height:\s*24px/s);
  assert.doesNotMatch(source, /entityGlyph/);
});

test('文字、图片和附件由新引擎直接渲染并保留编辑入口', () => {
  assert.match(source, /function CanvasElementContent/);
  assert.match(source, /gf-flow-text-element/);
  assert.match(source, /gf-flow-media-element/);
  assert.match(source, /edit-canvas-element/);
  assert.match(controllerSource, /this\._editCanvasElement\(value\.id\)/);
});

test('Project 标题使用 React Flow 屏幕空间工具条，缩放时保持统一字号', () => {
  assert.match(source, /<NodeToolbar isVisible className="gf-flow-group-title-toolbar"/);
  assert.doesNotMatch(source, /className="gf-flow-group-title"/);
});

test('Project 标题完整显示，成员数量不参与标题宽度竞争且字号可配置', () => {
  assert.match(canvasCss, /--relationship-group-title-font-size/);
  assert.doesNotMatch(canvasCss, /\.gf-flow-group-title-toolbar strong\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.doesNotMatch(canvasCss, /\.gf-flow-group-title-toolbar button\s*\{[^}]*max-width:\s*calc/s);
  assert.match(toolbarViewSource, /key: 'groupTitleFontSize'/);
  assert.match(controllerSource, /--relationship-group-title-font-size/);
});

test('Project 快捷操作复用标题栏，不创建第二条工具栏争抢顶部空间', () => {
  assert.match(source, /className="gf-flow-group-actions" role="toolbar"/);
  assert.match(source, /data\.onAction\?\.\('select-group', entity\)/);
  assert.doesNotMatch(source, /gf-flow-group-title-button[^\n]*data\.onAction\?\.\('details', entity\)/);
  assert.doesNotMatch(source, /<NodeToolbar isVisible=\{selected\} className="gf-flow-node-toolbar" position=\{Position\.Top\} offset=\{52\}>/);
  assert.doesNotMatch(source, /className="gf-flow-node-toolbar gf-flow-group-action-toolbar"/);
  assert.match(canvasCss, /\.gf-flow-card button,\s*\.gf-flow-node-toolbar button,\s*\.gf-flow-group-actions button/);
  assert.match(controllerSource, /action === 'select-group' \|\| action === 'arrange-group'/);
  assert.match(controllerSource, /if \(groupOnly\) this\._hideInspector\(\)/);
});

test('共用工具按钮阻止画布在 click 前取消选择，避免条件工具条按钮失效', () => {
  assert.match(source, /onPointerDown=\{event => event\.stopPropagation\(\)\}/);
  assert.match(source, /onMouseDown=\{event => event\.stopPropagation\(\)\}/);
});

test('部署节点在新卡片中显示提交和本地仓库关联信号', () => {
  assert.match(source, /最近部署 \$\{commit\.slice\(0, 8\)\}/);
  assert.match(source, /已关联本地/);
  assert.match(source, /本地目录缺失/);
  assert.match(source, /待确认/);
});
