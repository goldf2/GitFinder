const cloneDocument = value => structuredClone(value);
let documentStore = RelationshipGraphModel.normalizeStore({ schemaVersion: 1, activeBoardId: 'board_documents1', entities: [
  { id: 'entity_intro001', type: 'text', name: '部署说明', details: { content: '生产环境\n拖入截图，记录部署步骤。', width: '340', height: '160', fontSize: '24', color: '#334155', align: 'left' } },
  { id: 'entity_server01', type: 'server', name: 'Con01', details: { environment: 'production' } },
  { id: 'entity_group001', type: 'group', name: '发布检查', details: {} }
], relationships: [], boards: [{ id: 'board_documents1', name: '工作白板', viewport: { x: 40, y: 70, zoom: 1 }, placements: [
  { entityId: 'entity_intro001', x: 320, y: 30 }, { entityId: 'entity_server01', x: 320, y: 290, groupId: 'entity_group001' }, { entityId: 'entity_group001', x: 300, y: 250 }
] }] }).value;
const documentFiles = new Map();
const documentPrefs = {};
let sequence = 0;
const documentController = new RelationshipBoardController.Controller({ bridge: {
  fs: { getPathForFile: file => `/模拟拖入/${file.name}` },
  config: { get: async key => cloneDocument(documentPrefs[key] ?? null), set: async (key, value) => { documentPrefs[key] = cloneDocument(value); } },
  relationshipBoards: {
    createDocument: async request => {
      const id = `doc-${++sequence}`;
      const record = { id, name: request.store.boards[0].name, path: `/模拟文件/${id}.gitfinder-board/board.json`, projectDirectory: `/模拟文件/${id}.gitfinder-board`, nodeCount: request.store.entities.length, revision: String(Date.now()) };
      documentFiles.set(id, { record, store: cloneDocument(request.store) });
      return { record: cloneDocument(record), store: cloneDocument(request.store) };
    },
    pickFiles: async () => ({ paths: ['/模拟文件/示例媒体.mp4'] }),
    attachFiles: async request => request.paths.map((path, index) => ({ id: `entity_attachment${++sequence}${index}`, type: 'attachment', name: path.split('/').at(-1), details: { width: '360', height: '140', ...(request.mode === 'reference' ? { referencePath: path } : { assetPath: `assets/demo${sequence}.mp4` }), fileSize: '1024' } })),
    getAssets: async id => (documentFiles.get(id)?.store.entities || []).filter(entity => ['image', 'attachment'].includes(entity.type)).map(entity => ({ entityId: entity.id, state: 'available', imageData: entity.details.imageData, size: 1024 })),
    revealAsset: async () => { document.querySelector('#notice').textContent = '原生应用将在系统文件管理器定位；此页只演示'; },
    get: async () => ({ store: cloneDocument(documentStore) }), save: async store => { documentStore = cloneDocument(store); return { saved: true }; },
    listDocuments: async () => [...documentFiles.values()].map(item => cloneDocument(item.record)),
    saveDocument: async request => {
      const id = request.id && !request.saveAs ? request.id : `doc-${++sequence}`;
      const record = { id, name: request.store.boards[0].name, path: `/模拟文件/${id}.gitfinder-board/board.json`, projectDirectory: `/模拟文件/${id}.gitfinder-board`, nodeCount: request.store.entities.length, revision: String(Date.now()) };
      documentFiles.set(id, { record, store: cloneDocument(request.store) });
      document.querySelector('#notice').textContent = `已保存：${record.name} · ${record.nodeCount} 个元素`;
      return { record: cloneDocument(record), store: cloneDocument(request.store) };
    },
    openDocument: async id => cloneDocument(documentFiles.get(id || [...documentFiles.keys()][0]) || { cancelled: true }),
    removeDocument: async request => { documentFiles.delete(request.id); return { library: [...documentFiles.values()].map(item => cloneDocument(item.record)) }; },
    pickImage: async () => {
      const blob = await (await fetch('../../public/icon.png')).blob();
      const data = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
      return { name: 'GitFinder 图标.png', data, width: 1024, height: 1024 };
    }
  },
  repos: { getRegistry: async () => ({ repos: [] }) }, localProjects: { list: async () => [] }
}, notify: message => { document.querySelector('#notice').textContent = message; } });
documentController.open(document.querySelector('#board'));
