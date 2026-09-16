(function exposeRelationshipBoardPersistence(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipBoardPersistence = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipBoardPersistence() {
  const clone = value => JSON.parse(JSON.stringify(value));

  function cancelTimer(c) {
    if (c.saveTimer) clearTimeout(c.saveTimer);
    c.saveTimer = null;
  }

  function schedule(c, delay = 100) {
    c.saveRequestId++;
    c._setSaveState('saving');
    cancelTimer(c);
    if (c.documentSaveInFlight) { c.saveAfterDocument = true; return; }
    c.saveTimer = setTimeout(() => { c.saveTimer = null; c._persistNow(); }, delay);
  }

  function acceptDocumentResult(c, record, snapshot, result) {
    Object.assign(record, result.record);
    if (c.documentRecord !== record) return;
    let materialized = false;
    const originals = new Map(snapshot.entities.map(item => [item.id, item]));
    const current = new Map(c.store.entities.map(item => [item.id, item]));
    for (const saved of result.store?.entities || []) {
      const entity = current.get(saved.id), original = originals.get(saved.id);
      if (entity?.details.imageData && entity.details.imageData === original?.details.imageData && saved.details.assetPath) {
        delete entity.details.imageData;
        entity.details.assetPath = saved.details.assetPath;
        materialized = true;
      }
    }
    if (materialized || c._documentAssetsNeedRefresh?.()) void c._refreshDocumentAssets();
    c.documentLibrary = c.documentLibrary.map(item => item.id === record.id ? { ...item, ...record } : item);
    for (const tab of c.root?.querySelectorAll?.('[data-open-document]') || []) {
      if (tab.dataset.openDocument === record.id) tab.textContent = `▧ ${record.name}`;
    }
  }

  function persistNow(c) {
    cancelTimer(c); // An immediate save consumes the pending debounce, not an extra write.
    if (!c.store) return Promise.resolve();
    const requestId = ++c.saveRequestId;
    c._setSaveState('saving');
    if (c.documentSaveInFlight) {
      c.saveAfterDocument = true;
      return c.saveChain;
    }
    const record = c.documentRecord;
    let snapshot;
    try { snapshot = record ? c._buildActiveBoardExportStore() : clone(c.store); }
    catch (error) { c._setSaveState('error'); c.notify(error.message, 'error'); return Promise.resolve(null); }
    c.saveChain = c.saveChain.catch(() => {}).then(async () => {
      if (!record) return c.bridge.relationshipBoards.save(snapshot);
      const result = await c.bridge.relationshipBoards.saveDocument({ id: record.id, revision: record.revision, store: snapshot });
      acceptDocumentResult(c, record, snapshot, result);
      return result;
    }).then(result => {
      if (requestId === c.saveRequestId) c._setSaveState('saved');
      return result;
    }).catch(error => {
      if (requestId === c.saveRequestId) c._setSaveState('error');
      c.notify(`关系白板保存失败：${error?.message || String(error)}`, 'error');
      return null;
    });
    return c.saveChain;
  }

  async function saveDocument(c, saveAs = false) {
    if (c.documentBusy) return;
    const previousState = c.saveState;
    const hadPending = Boolean(c.saveTimer) || previousState === 'saving';
    cancelTimer(c);
    c.documentBusy = true;
    c.documentSaveInFlight = true;
    c.saveAfterDocument = false;
    const requestId = ++c.saveRequestId;
    c._setSaveState('saving');
    let cancelled = false, newerSnapshot = false, result;
    // Reserve the same queue as auto-save before awaiting the native dialog or IPC.
    c.saveChain = c.saveChain.catch(() => {}).then(async () => {
      const record = c.documentRecord;
      const snapshot = c._buildActiveBoardExportStore();
      const saved = await c.bridge.relationshipBoards.saveDocument({ id: record?.id, revision: record?.revision, saveAs, store: snapshot });
      if (saved.cancelled) { cancelled = true; return null; }
      if (!record) {
        const workspace = c.store;
        await c.bridge.relationshipBoards.save(clone(workspace));
        c.localWorkspace = workspace;
      }
      const latest = c._buildActiveBoardExportStore();
      newerSnapshot = JSON.stringify(latest) !== JSON.stringify(snapshot);
      const changedDocument = record?.id !== saved.record.id;
      c.documentRecord = changedDocument ? saved.record : record;
      c.localWorkspaceMode = false;
      c.openDocumentIds.add(saved.record.id);
      // Keep edits made while the save dialog/IO was in flight. Only reconcile
      // materialized image paths whose original image data is still unchanged.
      c.store = newerSnapshot ? latest : (saved.store || snapshot);
      acceptDocumentResult(c, c.documentRecord, snapshot, saved);
      if (changedDocument) c._resetDocumentSelection();
      await c._refreshDocumentLibrary();
      if (requestId === c.saveRequestId && !newerSnapshot) c._setSaveState('saved');
      c.render();
      await c._refreshDocumentAssets();
      return saved;
    }).catch(error => {
      if (requestId === c.saveRequestId) c._setSaveState('error');
      c.notify(`白板保存失败：${error.message}`, 'error');
      return null;
    });
    try {
      result = await c.saveChain;
      c.documentSaveInFlight = false;
      const followup = newerSnapshot || c.saveAfterDocument || (cancelled && hadPending);
      c.saveAfterDocument = false;
      if (followup) await persistNow(c);
      else if (cancelled && requestId === c.saveRequestId) c._setSaveState(previousState);
      return result;
    } finally {
      c.documentSaveInFlight = false;
      c.documentBusy = false;
    }
  }

  return Object.freeze({ schedule, persistNow, saveDocument });
});
