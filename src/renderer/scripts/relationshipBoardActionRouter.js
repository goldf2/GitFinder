(function exposeRelationshipBoardActionRouter(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipBoardActionRouter = api;
})(typeof window !== 'undefined' ? window : globalThis, function createRelationshipBoardActionRouter() {
  // [controller method, arguments, close add menu, focus after completion]
  const ACTIONS = Object.freeze({
    'deployment-archive': ['_openDeploymentArchive'],
    'open-document': ['_openDocument'], 'new-document': ['_newDocument'], 'add-files': ['_addFiles'],
    'import-package': ['_openDocument', [null, true], true], 'export-package': ['_exportPackage', [], true],
    'save-document': ['_saveDocument', [false]], 'save-document-as': ['_saveDocument', [true]],
    'add-text': ['_createCanvasElement', ['text']], 'add-image': ['_createCanvasElement', ['image']],
    'check-endpoints': ['_refreshEndpointChecks', [{ force: true }]], 'scan-repositories': ['_scanManagedRepositories'],
    'reset-display-settings': ['_resetDisplaySettings'], 'toggle-all-group-layouts': ['_toggleAllGroupLayouts'],
    'toggle-resource-panel': ['_togglePanelCollapsed', ['library']],
    'new-board': ['_createBoard'], 'rename-board': ['_renameBoard'],
    undo: ['undo'], redo: ['redo'], fit: ['fitContent'], 'reset-dynamic-layout': ['_resetDynamicLayout'],
    'arrange-by-category': ['_arrangeByCategory', [], false, '.relationship-layout-trigger'],
    'arrange-by-coolify-projects': ['_arrangeByCoolifyProjects', [], false, '.relationship-layout-trigger'],
    'arrange-around-selection': ['_arrangeAround', ['selection-centered'], false, '.relationship-layout-trigger'],
    'arrange-around-servers': ['_arrangeAround', ['server-centered'], false, '.relationship-layout-trigger'],
    'server-tree': ['_setStructure', ['server-tree']], 'refresh-panel': ['_refreshPanelTopology', [{ announce: true }]],
    'import-json': ['_importRelationshipJson', [], true], 'export-json': ['_exportCurrentBoard', [], true],
    'verify-now': ['_verifySelectedNow'], 'reverse-relationship': ['_reverseSelectedRelationship'],
    'create-group-from-selection': ['_createGroupFromSelection'], 'remove-selection-group': ['_removeSelectionFromGroups']
  });
  const DISMISS_MENU_ACTIONS = new Set(['new-board', 'rename-board', 'undo', 'redo', 'fit', 'reset-dynamic-layout', 'server-tree']);

  function resolve(action) {
    return ACTIONS[String(action || '')] || null;
  }

  function dismissesTransientMenus(action) {
    return DISMISS_MENU_ACTIONS.has(String(action || ''));
  }

  return Object.freeze({ ACTIONS, resolve, dismissesTransientMenus });
});
