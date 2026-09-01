(function exposeAppControllerRegistry(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.AppControllerRegistry = api;
})(typeof window !== 'undefined' ? window : globalThis, function createAppControllerRegistry() {
  const CONTROLLER_KEYS = Object.freeze([
    'quickLookController', 'fileOperationController', 'fileOperationDialogController',
    'fileActionBarController', 'directoryTerminalController',
    'fileSelectionDetailController', 'panelDeploymentController', 'repositoryDetailController',
    'fileOperationHistoryController', 'fileInfoController', 'batchRenameController',
    'fileTransferController', 'contentFilterController', 'smartCollectionsController',
    'projectShortcutsController', 'directoryNavigationController', 'sidebarTreeController',
    'repositoryRootScanner', 'directoryPerformanceController', 'unavailableLocationController',
    'directorySelectionController', 'relationshipBoardController', 'workspaceTabOverflowController'
  ]);
  const CONTROLLER_NAMESPACES = Object.freeze([
    'QuickLookController', 'FileOperationController', 'FileOperationDialogController',
    'FileActionBarController', 'DirectoryTerminalController',
    'FileSelectionDetailController', 'PanelDeploymentController', 'RepositoryDetailController',
    'FileOperationHistoryController', 'FileInfoController', 'BatchRenameController',
    'FileTransferController', 'ContentFilterController', 'SmartCollectionsController',
    'ProjectShortcutsController', 'DirectoryNavigationController', 'SidebarTreeController',
    'RepositoryRootScanner', 'DirectoryPerformanceController', 'UnavailableLocationController',
    'DirectorySelectionController', 'RelationshipBoardController', 'WorkspaceTabOverflowController'
  ]);
  const BOUND_CONTROLLER_KEYS = Object.freeze([
    'quickLookController', 'fileOperationDialogController',
    'fileOperationHistoryController', 'fileInfoController', 'batchRenameController',
    'contentFilterController', 'smartCollectionsController', 'projectShortcutsController',
    'directoryPerformanceController'
  ]);
  const DELEGATE_MAP = Object.freeze({
    openSelectedInTerminal: ['directoryTerminalController', 'open'],
    loadProjectShortcuts: ['projectShortcutsController', 'load'],
    loadLocalProjects: ['projectShortcutsController', 'loadLocalProjects'],
    refreshProjectShortcuts: ['projectShortcutsController', 'refresh'],
    recordProjectVisit: ['projectShortcutsController', 'recordVisit'],
    toggleProjectShortcutPinned: ['projectShortcutsController', 'togglePinned'],
    openProjectShortcut: ['projectShortcutsController', 'open'],
    renderProjectShortcuts: ['projectShortcutsController', 'render'],
    initSidebarTree: ['sidebarTreeController', 'init'],
    loadTreeRoots: ['sidebarTreeController', 'loadRoots'],
    addTreeRootDialog: ['sidebarTreeController', 'addRootDialog'],
    addTreeRoot: ['sidebarTreeController', 'addRoot'],
    removeTreeRoot: ['sidebarTreeController', 'removeRoot'],
    renderSidebarTree: ['sidebarTreeController', 'render'],
    _bindTreeEvents: ['sidebarTreeController', 'bind'],
    _syncTreeSelection: ['sidebarTreeController', 'syncSelection'],
    _syncTreeToCurrentPath: ['sidebarTreeController', 'syncToCurrentPath'],
    navigateTo: ['directoryNavigationController', 'navigateTo'],
    goBack: ['directoryNavigationController', 'goBack'],
    goForward: ['directoryNavigationController', 'goForward'],
    goUp: ['directoryNavigationController', 'goUp'],
    getParentPath: ['directoryNavigationController', 'getParentPath'],
    updateBreadcrumbs: ['directoryNavigationController', 'updateBreadcrumbs'],
    updateNavButtons: ['directoryNavigationController', 'updateNavButtons'],
    reconcileFileKeyboardFocus: ['directorySelectionController', 'reconcileFileKeyboardFocus'],
    bindCardEvents: ['directorySelectionController', 'bindCardEvents'],
    bindCardElements: ['directorySelectionController', 'bindCardElements'],
    transferProgressHtml: ['fileTransferController', 'transferProgressHtml'],
    transferPlanHtml: ['fileTransferController', 'transferPlanHtml'],
    executeTransferWithProgress: ['fileTransferController', 'executeTransferWithProgress'],
    openTransferReview: ['fileTransferController', 'openTransferReview'],
    changeTransferConflictPolicy: ['fileTransferController', 'changeTransferConflictPolicy'],
    setTransferStructureRiskAcknowledged: ['fileTransferController', 'setStructureRiskAcknowledged'],
    renderTransferReview: ['fileTransferController', 'renderTransferReview'],
    applyReviewedTransfer: ['fileTransferController', 'applyReviewedTransfer'],
    handleTransferReviewCancel: ['fileTransferController', 'handleTransferReviewCancel'],
    closeTransferReview: ['fileTransferController', 'closeTransferReview'],
    openExternalImportPreview: ['fileTransferController', 'openExternalImportPreview'],
    renderExternalImportPreview: ['fileTransferController', 'renderExternalImportPreview'],
    applyExternalImport: ['fileTransferController', 'applyExternalImport'],
    closeExternalImportModal: ['fileTransferController', 'closeExternalImportModal'],
    handleExternalImportCancel: ['fileTransferController', 'handleExternalImportCancel'],
    handleVirtualizedListKeyboardNavigation: ['directorySelectionController', 'handleVirtualizedListKeyboardNavigation'],
    handleFileKeyboardNavigation: ['directorySelectionController', 'handleFileKeyboardNavigation'],
    handleFileSelectionClick: ['directorySelectionController', 'handleFileSelectionClick'],
    syncFileSelectionUI: ['directorySelectionController', 'syncFileSelectionUI'],
    syncFileItemElement: ['directorySelectionController', 'syncFileItemElement'],
    clearFileSelection: ['directorySelectionController', 'clearFileSelection'],
    selectSingleFileItem: ['directorySelectionController', 'selectSinglePath'],
    showFileSelectionDetail: ['fileSelectionDetailController', 'show'],
    updateFileActionBar: ['fileActionBarController', 'update'],
    loadFileOperationHistory: ['fileOperationController', 'loadHistory'],
    openFileOperationDialog: ['fileOperationDialogController', 'open'],
    submitFileOperationDialog: ['fileOperationDialogController', 'submit'],
    copySelectedItems: ['fileOperationController', 'copySelectedItems'],
    copySelectedPathnames: ['fileOperationController', 'copySelectedPathnames'],
    cutSelectedItems: ['fileOperationController', 'cutSelectedItems'],
    pasteFileClipboard: ['fileOperationController', 'pasteFileClipboard'],
    duplicateSelectedItems: ['fileOperationController', 'duplicateSelectedItems'],
    ensureFileItemVisible: ['directorySelectionController', 'ensureFileItemVisible'],
    undoLastFileOperation: ['fileOperationController', 'undoLastFileOperation'],
    redoLastFileOperation: ['fileOperationController', 'redoLastFileOperation'],
    runFileOperation: ['fileOperationController', 'run'],
    getEditActionContext: ['fileOperationController', 'getEditActionContext'],
    handleEditAction: ['fileOperationController', 'handleEditAction'],
    selectAllVisibleFiles: ['directorySelectionController', 'selectAllVisibleFiles'],
    selectRepo: ['repositoryDetailController', 'select'],
    cancelRepoSelection: ['repositoryDetailController', 'cancel'],
    showDetailError: ['repositoryDetailController', 'showError'],
    updateDetailSections: ['repositoryDetailController', 'updateSections'],
    applyDetailSectionOrder: ['repositoryDetailController', 'applySectionOrder'],
    saveDetailSectionOrder: ['repositoryDetailController', 'saveSectionOrder'],
    setupDetailSectionDrag: ['repositoryDetailController', 'setupSectionDrag'],
    updateDetailPanel: ['repositoryDetailController', 'render']
  });

  function installDelegates(app, controllers = app) {
    const entries = Object.entries(DELEGATE_MAP);
    for (const [publicName] of entries) {
      if (publicName in app) {
        throw new Error(`兼容入口已存在：${publicName}`);
      }
    }
    for (const [, [controllerKey, methodName]] of entries) {
      if (typeof controllers[controllerKey]?.[methodName] !== 'function') {
        throw new Error(`兼容入口目标缺失：${controllerKey}.${methodName}`);
      }
    }
    for (const [publicName, [controllerKey, methodName]] of entries) {
      Object.defineProperty(app, publicName, {
        configurable: true,
        enumerable: true,
        writable: true,
        value(...args) {
          return controllers[controllerKey][methodName](...args);
        }
      });
    }
    return app;
  }

  function create({ app, state, host, document, terminal = null }) {
    const bridge = host.gitFinder;
    const shared = { app, state, bridge, document, window: host };
    const controllers = {};
    const options = (keys, extra = {}) => Object.assign(
      Object.fromEntries(keys.map(key => [key, shared[key]])), extra
    );
    const add = (key, namespace, keys, extra, lifecycle, constructorName = 'Controller') => {
      const Constructor = host[namespace]?.[constructorName];
      if (typeof Constructor !== 'function') throw new Error(`缺少控制器：${namespace}.${constructorName}`);
      const instance = new Constructor(options(keys, extra));
      if (lifecycle) instance[lifecycle]();
      controllers[key] = instance;
    };

    add('quickLookController', 'QuickLookController', [], {
      renderMarkdown: content => app.renderMarkdown(content),
      escapeHtml: value => app.escapeHtml(value),
      formatFileSize: value => app.formatFileSize(value),
      formatItemDate: value => app.formatItemDate(value),
      getItemByPath: itemPath => state.visibleItems.find(candidate => candidate.path === itemPath),
      activateDirectory: item => app.activateFileItem(item),
      getNavigationState: itemPath => app.getQuickLookNavigationState(itemPath),
      navigateItem: (direction, itemPath) => app.selectQuickLookNavigationItem(direction, itemPath),
      restoreSelectionFocus: itemPath => app.directorySelectionController.focusPath(itemPath)
    }, 'bind');
    add('fileOperationController', 'FileOperationController', ['app', 'state', 'bridge'], { editActionRouter: host.EditActionRouter });
    add('fileOperationDialogController', 'FileOperationDialogController', ['document', 'window'], {}, 'bind');
    add('fileActionBarController', 'FileActionBarController', ['app', 'state', 'document']);
    add('directoryTerminalController', 'DirectoryTerminalController', ['app', 'state', 'bridge']);
    add('fileSelectionDetailController', 'FileSelectionDetailController', ['app', 'state', 'document'], { fileBrowser: host.FileBrowser });
    add('panelDeploymentController', 'PanelDeploymentController', ['app', 'bridge', 'document']);
    add('repositoryDetailController', 'RepositoryDetailController', ['app', 'state', 'bridge', 'document'], { terminal });
    add('fileOperationHistoryController', 'FileOperationHistoryController', ['app', 'state', 'bridge', 'document', 'window'], {}, 'bind');
    add('fileInfoController', 'FileInfoController', ['app', 'bridge', 'document', 'window'], {}, 'bind');
    add('batchRenameController', 'BatchRenameController', ['app', 'state', 'bridge', 'document', 'window'], { model: host.BatchRename }, 'bind');
    add('fileTransferController', 'FileTransferController', ['app', 'state', 'bridge'], { presentation: host.FileTransfers, contentQuery: host.ContentQuery });
    add('contentFilterController', 'ContentFilterController', ['app', 'state'], { contentQuery: host.ContentQuery }, 'bind');
    add('smartCollectionsController', 'SmartCollectionsController', ['app', 'state', 'bridge'], { contentQuery: host.ContentQuery }, 'bind');
    add('projectShortcutsController', 'ProjectShortcutsController', ['app', 'state', 'bridge', 'document'], { platform: bridge.platform }, 'bind');
    add('directoryNavigationController', 'DirectoryNavigationController', ['app', 'state', 'bridge'], { workspaceTabs: host.WorkspaceTabs, contentQuery: host.ContentQuery });
    add('sidebarTreeController', 'SidebarTreeController', ['app', 'state', 'bridge', 'document'], { platform: bridge.platform });
    add('repositoryRootScanner', 'RepositoryRootScanner', ['bridge'], { platform: bridge.platform }, '', 'Scanner');
    add('directoryPerformanceController', 'DirectoryPerformanceController', ['app', 'state', 'document'], {
      performanceApi: host.DirectoryPerformance,
      virtualWindow: host.VirtualDirectoryWindow,
      progressiveRender: host.ProgressiveDirectoryRender
    }, 'bind');
    add('unavailableLocationController', 'UnavailableLocationController', ['app', 'bridge', 'document']);
    add('directorySelectionController', 'DirectorySelectionController', ['app', 'state'], {
      fileBrowser: host.FileBrowser,
      progressiveRenderer: host.ProgressiveDirectoryRender
    });
    add('relationshipBoardController', 'RelationshipBoardController', ['bridge'], {
      notify: (message, type) => app._showStatusMessage(message, type),
      onOpenDirectory: directory => app.createWorkspaceTab(directory),
      onSummaryChanged: summary => {
        state.relationshipSummary = summary;
        if (state.currentMode === 'relationships') app.updateStatusBar();
      }
    });
    add('workspaceTabOverflowController', 'WorkspaceTabOverflowController', ['document', 'window'], {}, 'mount');
    installDelegates(app, controllers);
    return controllers;
  }

  return Object.freeze({ CONTROLLER_KEYS, CONTROLLER_NAMESPACES, BOUND_CONTROLLER_KEYS, DELEGATE_MAP, installDelegates, create });
});
