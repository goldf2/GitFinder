const base = {
  entities: [
    { id: 'server', type: 'server', name: 'con01', details: { status: 'online' } },
    { id: 'project', type: 'group', name: '企业官网', details: {}, runtime: { dynamicKind: 'coolify-project-group' } },
    { id: 'app', type: 'deployment', name: 'xiangshu-corporate-site', details: { status: 'running:healthy', environmentName: 'production' } },
    { id: 'preview', type: 'deployment', name: 'preview-site', details: { status: 'exited:unhealthy', environmentName: 'preview' } },
    { id: 'endpoint', type: 'endpoint', name: 'www.xiangshu.me', details: { healthState: 'healthy', url: 'https://www.xiangshu.me' } },
    { id: 'api', type: 'endpoint', name: 'api.xiangshu.me', details: { healthState: 'unknown', url: 'https://api.xiangshu.me' } }
  ],
  placements: [
    { entityId: 'server', x: 60, y: 360 },
    { entityId: 'project', x: 480, y: 160, groupWidth: 760, groupHeight: 520, groupShape: 'rounded' },
    { entityId: 'app', x: 550, y: 280, groupId: 'project' },
    { entityId: 'preview', x: 880, y: 280, groupId: 'project' },
    { entityId: 'endpoint', x: 550, y: 480, groupId: 'project' },
    { entityId: 'api', x: 880, y: 480, groupId: 'project' }
  ],
  relationships: [
    { id: 'runs', sourceId: 'app', targetId: 'server', type: 'runs_on' },
    { id: 'exposes-web', sourceId: 'app', targetId: 'endpoint', type: 'exposes' },
    { id: 'exposes-api', sourceId: 'app', targetId: 'api', type: 'exposes' },
    { id: 'preview-runs', sourceId: 'preview', targetId: 'server', type: 'runs_on' }
  ]
};

let includeEndpoints = true;
let shapeIndex = 0;
let lastWheel = null;
let graph = structuredClone(base);
const shapes = ['rounded', 'circle', 'polygon'];
const root = document.querySelector('#relationship-flow-root');
const syncFixtureData = () => {
  document.querySelector('#fixture-data').textContent = JSON.stringify({
    includeEndpoints,
    shape: shapes[shapeIndex],
    lastWheel,
    graph
  });
};
root.addEventListener('wheel', event => {
  lastWheel = { ctrlKey: event.ctrlKey, metaKey: event.metaKey, deltaX: event.deltaX, deltaY: event.deltaY };
  syncFixtureData();
}, { capture: true, passive: true });

const render = () => {
  const model = window.RelationshipCanvasEngine.toFlowModel(graph);
  canvas.update({ model, onModelChange: next => {
    graph.placements = window.RelationshipCanvasEngine.toPlacements(next.nodes, graph.placements);
    syncFixtureData();
  }, onAction: (action, entity) => {
    const id = typeof entity === 'string' ? entity : entity.id;
    const target = graph.entities.find(item => item.id === id);
    document.querySelector('#fixture-status').textContent = `${action} · ${target?.name || id}`;
    if (action === 'toggle-descendants') {
      const placement = graph.placements.find(item => item.entityId === id);
      placement.moveWithDescendants = !placement.moveWithDescendants;
      syncFixtureData();
      render();
      return placement.moveWithDescendants;
    }
    if (action === 'open-endpoint') window.open(entity.details.url, '_blank', 'noopener');
    return undefined;
  } });
};

const canvas = window.RelationshipCanvasEngine.mount(root, { model: window.RelationshipCanvasEngine.toFlowModel(graph) });
syncFixtureData();
render();

document.querySelector('#toggle-endpoint').addEventListener('click', () => {
  includeEndpoints = !includeEndpoints;
  for (const id of ['endpoint', 'api']) {
    const placement = graph.placements.find(item => item.entityId === id);
    placement.groupId = includeEndpoints ? 'project' : undefined;
    placement.x = includeEndpoints ? (id === 'endpoint' ? 550 : 880) : (id === 'endpoint' ? 1320 : 1320);
    placement.y = includeEndpoints ? 480 : (id === 'endpoint' ? 260 : 500);
  }
  document.querySelector('#fixture-status').textContent = includeEndpoints ? 'Project 内含访问点' : '访问点位于 Project 外部';
  syncFixtureData();
  render();
});

document.querySelector('#toggle-shape').addEventListener('click', () => {
  shapeIndex = (shapeIndex + 1) % shapes.length;
  const project = graph.placements.find(item => item.entityId === 'project');
  project.groupShape = shapes[shapeIndex];
  if (project.groupShape !== 'rounded') project.groupHeight = project.groupWidth;
  syncFixtureData();
  render();
});
