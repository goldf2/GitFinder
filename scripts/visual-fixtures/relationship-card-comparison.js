/* Browser-only visual fixture: real production renderer, deterministic data, no IPC. */
const referenceFrame = document.querySelector('#reference');
const productionFrame = document.querySelector('#production');
const scaleInput = document.querySelector('#scale');
window.addEventListener('error', event => { document.querySelector('#result').textContent = event.message; });
const fixtures = [
  { id: 'host-con02', type: 'server', name: 'con02', label: '故障', state: 'fault', summary: '健康检查失败 · 连接波动', updated: '1 分钟前', todos: [{ id: 'todo_fixture01', title: '检查主机网络', dueAt: '2026-08-30T00:00:00.000Z' }] },
  { id: 'endpoint-api', type: 'endpoint', name: 'api.mes.csyufeng.com', label: '可访问', state: 'running', summary: 'HTTPS · 200 OK · 58 ms', updated: '26 秒前', todos: [{ id: 'todo_fixture02', title: '检查证书', reminderAt: '2026-08-30T00:00:00.000Z' }] },
  { id: 'deploy-standby', type: 'deployment', name: 'mes-lite · 灰度实例', label: '已停止', state: 'stopped', summary: 'staging · exited', updated: '昨天 23:40', todos: [] },
  { id: 'repo-mes', type: 'repository', name: 'mes-lite', label: '已同步', state: 'running', summary: 'main · a24c7e1', updated: '2 分钟前', todos: [] }
];
let loaded = 0;
let dark = false;
let expanded = false;
let controller;
const selectors = [
  ['', '.relationship-card-surface'],
  ['.card-header', '.relationship-node-header'],
  ['.resource-icon', '.relationship-node-icon'],
  ['.identity strong', '.relationship-node-title'],
  ['.status-pill', '.relationship-node-runtime-status'],
  ['.expand-button', '.relationship-card-expand-top'],
  ['.card-summary', '.relationship-node-summary'],
  ['.attention-row', '.relationship-node-attention-row'],
  ['.bottom-toggle', '.relationship-card-expand-bottom'],
  ['.connection-port', '.relationship-port']
];
function measure(element, card, scale) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const origin = card.getBoundingClientRect();
  const style = getComputedStyle(element);
  return { x: (rect.x - origin.x) / scale, y: (rect.y - origin.y) / scale, width: rect.width / scale, height: rect.height / scale, font: style.fontSize, weight: style.fontWeight, color: style.color, background: style.backgroundColor, shadow: style.boxShadow };
}
function compare() {
  const scale = Number(scaleInput.value);
  const refDoc = referenceFrame.contentDocument;
  const prodDoc = productionFrame.contentDocument;
  refDoc.documentElement.dataset.theme = dark ? 'dark' : 'light';
  prodDoc.documentElement.dataset.effectiveMode = dark ? 'dark' : 'light';
  refDoc.querySelectorAll('.overview-card').forEach((card, index) => {
    card.className = 'overview-card filter-match';
    card.dataset.mode = expanded ? 'detail' : 'compact';
    card.style.cssText = `left:32px;top:${32 + index * 245}px;zoom:${scale};translate:${32 / scale - 32}px ${(32 + index * 245) / scale - (32 + index * 245)}px`;
  });
  if (expanded) {
    let top = 32;
    refDoc.querySelectorAll('.overview-card').forEach(card => {
      card.style.top = `${top / scale}px`;
      card.style.translate = `${32 / scale - 32}px 0`;
      top += card.getBoundingClientRect().height + 32;
    });
  }
  controller.store.boards[0].view.cardScale = scale;
  controller.expandedCardIds = new Set(expanded ? fixtures.map(fixture => fixture.id) : []);
  controller._applyViewMode();
  controller._renderGraph();
  prodDoc.querySelectorAll('.relationship-node').forEach(card => card.classList.add('filter-match'));
  const rows = [];
  fixtures.forEach(fixture => {
    const refCard = refDoc.getElementById(`node-${fixture.id}`);
    const prodCard = prodDoc.querySelector(`[data-entity-id="${fixture.id}"]`);
    for (const [refSelector, prodSelector] of selectors) {
      const a = measure(refSelector ? refCard.querySelector(refSelector) : refCard, refCard, scale);
      const b = measure(prodCard.querySelector(prodSelector) || (refSelector ? null : prodCard), prodCard, scale);
      const different = !a || !b ? ['missing'] : Object.keys(a).filter(key => typeof a[key] === 'number' ? Math.abs(a[key] - b[key]) > 1 : a[key] !== b[key]);
      if (different.length) rows.push({ card: fixture.id, part: refSelector || 'surface', different, reference: a, production: b });
    }
  });
  document.querySelector('#result').textContent = rows.length ? `${rows.length} 处偏差\n${rows.map(row => `${row.card} ${row.part}: ${row.different.join(', ')}`).join('\n')}` : '通过：4 类卡片的尺寸、内容比例、颜色与阴影一致（几何误差 ≤ 1px）';
  document.querySelector('#result').dataset.failures = String(rows.length);
  document.querySelector('#differences').textContent = JSON.stringify(rows, null, 2);
  if (expanded) {
    const rails = [...prodDoc.querySelectorAll('.relationship-attention-rail')];
    const visible = rails.every(rail => getComputedStyle(rail.parentElement).overflow === 'visible' && rail.getBoundingClientRect().height > 100);
    document.querySelector('#result').textContent = `详情检查：${rails.length} 张卡片有左侧待办/提醒条，${visible ? '完整显示' : '显示异常'}。详情使用各自数据，不比较示例内容长度。`;
  }
}
function initialize() {
  if (++loaded !== 2) return;
  const refDoc = referenceFrame.contentDocument;
  const cards = fixtures.map(fixture => refDoc.getElementById(`node-${fixture.id}`).cloneNode(true));
  const staticStyles = refDoc.createElement('style');
  staticStyles.textContent = '*, *::before, *::after { transition: none !important; }';
  refDoc.head.append(staticStyles);
  refDoc.body.replaceChildren();
  const canvas = refDoc.createElement('div');
  canvas.className = 'overview-canvas';
  canvas.dataset.filterActive = 'true';
  canvas.style.cssText = 'height:1080px;min-height:0;transform:none;position:relative';
  for (const card of cards) { card.className = 'overview-card filter-match'; canvas.append(card); }
  refDoc.body.append(canvas);
  const win = productionFrame.contentWindow;
  controller = new win.RelationshipBoardController.Controller({ bridge: {}, now: () => new Date('2026-08-31T00:00:00Z') });
  controller.root = win.document.querySelector('.relationship-workspace');
  controller._updateSelectionCss = () => {};
  controller._panelSnapshotStale = () => false;
  controller._entityAvailability = () => ({ missing: false });
  controller._cardSummary = entity => fixtures.find(item => item.id === entity.id).summary;
  controller._cardUpdatedLabel = entity => fixtures.find(item => item.id === entity.id).updated;
  controller._entityRuntimeStatus = entity => { const fixture = fixtures.find(item => item.id === entity.id); return { state: fixture.state, label: fixture.label }; };
  controller.store = {
    activeBoardId: 'board_visual01',
    entities: fixtures.map(fixture => ({ id: fixture.id, type: fixture.type, name: fixture.name, details: { status: fixture.state }, transient: fixture.type !== 'repository' })),
    relationships: [],
    boards: [{ id: 'board_visual01', name: '卡片对比', viewport: { x: 0, y: 0, zoom: 1 }, view: win.RelationshipGraphModel.defaultBoardView(), placements: fixtures.map((fixture, index) => ({ entityId: fixture.id, x: 32, y: 32 + index * 245, todos: fixture.todos })) }]
  };
  compare();
}
referenceFrame.addEventListener('load', initialize);
productionFrame.addEventListener('load', initialize);
scaleInput.addEventListener('change', compare);
document.querySelector('#theme').addEventListener('click', () => { dark = !dark; compare(); });
document.querySelector('#details').addEventListener('click', () => { expanded = !expanded; compare(); });
document.querySelector('#compare').addEventListener('click', compare);
