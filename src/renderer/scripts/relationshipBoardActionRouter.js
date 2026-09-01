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

  function activeBoard(controller) {
    return controller.store.boards.find(board => board.id === controller.store.activeBoardId)
      || controller.store.boards[0] || null;
  }

  function closeOutsideMenus(controller, event) {
    if (!event.target.closest('.relationship-filter-host')) controller._closeFilterPopover();
    if (!event.target.closest('.relationship-menu-host')) controller._closeAddMenu();
    if (!event.target.closest('.relationship-display-host')) controller._closeDisplayPopover();
  }

  function handleClick(controller, event) {
    const target = event.target;
    const endpointCheck = target.closest('[data-endpoint-check]');
    if (endpointCheck) {
      const entity = controller._allEntitiesById().get(endpointCheck.dataset.endpointCheck);
      if (!endpointCheck.disabled && entity?.runtime?.dynamicKind === 'panel-endpoint') {
        void controller._refreshEndpointChecks({ providerId: entity.runtime.providerId, url: entity.runtime.url, force: true });
      }
      return;
    }
    const move = target.closest('[data-panel-side]');
    if (move) return controller._setPanelSide(move.dataset.panelKey, move.dataset.panelSide);
    const collapse = target.closest('[data-panel-collapse]');
    if (collapse) return controller._togglePanelCollapsed(collapse.dataset.panelCollapse);
    const contextItem = target.closest('[data-board-context-action]');
    if (contextItem) return contextItem.disabled ? undefined : controller._runContextAction(contextItem.dataset.boardContextAction);

    const contextPoint = target.closest('.relationship-context-menu') ? controller.contextMenuPoint : null;
    controller._closeContextMenu(Boolean(contextPoint));
    const action = target.closest('[data-relationship-action]')?.dataset.relationshipAction;
    const layout = target.closest('[data-board-layout]')?.dataset.boardLayout;
    if (layout) {
      controller._closeLayoutMenu(); controller._setLayout(layout);
      controller.root?.querySelector('[data-layout-menu="layout"]')?.focus(); return;
    }
    const structure = target.closest('[data-board-structure]')?.dataset.boardStructure;
    if (structure) {
      controller._closeLayoutMenu(); controller._setStructure(structure);
      controller.root?.querySelector('[data-layout-menu="structure"]')?.focus(); return;
    }
    if (action !== 'toggle-layout-menu') controller._closeLayoutMenu();
    const directAction = resolve(action);
    if (directAction) {
      const [method, args = [], closeAddMenu = false, focusSelector = ''] = directAction;
      if (closeAddMenu) controller._closeAddMenu();
      controller[method](...args);
      if (focusSelector) controller.root?.querySelector(focusSelector)?.focus();
      if (dismissesTransientMenus(action)) closeOutsideMenus(controller, event);
      return;
    }
    if (action === 'toggle-layout-menu') {
      const trigger = target.closest('.relationship-layout-trigger');
      const menu = trigger.closest('.relationship-layout-host').querySelector('.relationship-layout-menu');
      const opening = menu.hidden;
      controller._closeLayoutMenu();
      menu.hidden = !opening; trigger.setAttribute('aria-expanded', String(opening));
      if (!menu.hidden) {
        controller._closeAddMenu(); controller._closeFilterPopover(); controller._closeDisplayPopover();
        menu.style.transform = '';
        const rect = menu.getBoundingClientRect(), view = menu.ownerDocument.defaultView;
        const workspace = controller.root.getBoundingClientRect();
        menu.style.transform = `translateX(${Math.max(Math.max(12, workspace.left + 8) - rect.left, Math.min(0, Math.min(view.innerWidth - 12, workspace.right - 8) - rect.right))}px)`;
        menu.style.maxHeight = `${Math.max(160, view.innerHeight - rect.top - 12)}px`;
        (menu.querySelector('button[aria-checked="true"]') || menu.querySelector('button'))?.focus();
      }
      return;
    }
    if (action === 'toggle-topology-alerts') {
      const popover = controller.root.querySelector('.relationship-topology-alert-popover');
      const trigger = controller.root.querySelector('.relationship-topology-alert-trigger');
      const opening = popover.hidden;
      controller._closeTopologyAlerts();
      popover.hidden = !opening; trigger.setAttribute('aria-expanded', String(opening));
      if (opening) {
        controller._closeLayoutMenu(); controller._closeFilterPopover(); controller._closeDisplayPopover(); controller._closeAddMenu();
        popover.querySelector('summary, button:not(:disabled)')?.focus({ preventScroll: true });
      }
      return;
    }

    const archiveId = target.closest('[data-archive-deployment]')?.dataset.archiveDeployment;
    if (archiveId || action === 'archive-selected-deployment') return controller._setDeploymentArchived(archiveId || controller.selectedEntityId, true);
    const documentButton = target.closest('[data-open-document]');
    if (documentButton) { void controller._openDocument(documentButton.dataset.openDocument); return; }
    if (target.closest('[data-document-home]')) { void controller._showLocalWorkspace(); return; }
    const removeDocument = target.closest('[data-remove-document], [data-trash-document]');
    if (removeDocument) {
      void controller._removeDocument(removeDocument.dataset.removeDocument || removeDocument.dataset.trashDocument, Boolean(removeDocument.dataset.trashDocument))
        .catch(error => controller.notify(error.message, 'error'));
      return;
    }
    const reveal = target.closest('[data-reveal-asset]');
    if (reveal && controller.documentRecord) {
      void controller.bridge.relationshipBoards.revealAsset({ id: controller.documentRecord.id, entityId: reveal.dataset.revealAsset })
        .catch(error => controller.notify(error.message, 'error'));
      return;
    }
    const editElement = target.closest('[data-edit-canvas-element]');
    if (editElement) { void controller._editCanvasElement(editElement.dataset.editCanvasElement); return; }
    const lockElement = target.closest('[data-lock-canvas-element]');
    if (lockElement) {
      controller._recordMutation();
      const placement = controller._placementForEntity(lockElement.dataset.lockCanvasElement);
      if (placement.locked) delete placement.locked; else placement.locked = true;
      controller._persistSoon(0); controller._renderGraph(); return;
    }
    const linkedMovement = target.closest('[data-lock-descendants]');
    if (linkedMovement) return controller._toggleLinkedMovement(linkedMovement.dataset.lockDescendants);

    if (action === 'toggle-filter-menu') {
      const popover = controller.root.querySelector('.relationship-filter-popover');
      const trigger = controller.root.querySelector('.relationship-filter-trigger');
      const addMenu = controller.root.querySelector('.relationship-add-menu');
      const addTrigger = controller.root.querySelector('.relationship-add-trigger');
      popover.hidden = !popover.hidden;
      trigger.setAttribute('aria-expanded', popover.hidden ? 'false' : 'true');
      if (!popover.hidden) {
        addMenu.hidden = true; addTrigger.setAttribute('aria-expanded', 'false'); controller._closeDisplayPopover();
        globalThis.requestAnimationFrame(() => popover.querySelector('input')?.focus());
      }
      return;
    }
    if (action === 'clear-filters') {
      const board = activeBoard(controller);
      board.view = controller._filterFreeView();
      const form = controller.root.querySelector('[data-relationship-filter-form]');
      if (form) {
        for (const [name, value] of Object.entries({ query: '', entityType: 'all', environment: '', verification: 'all', annotation: 'all', task: 'all', label: '' })) {
          form.elements.namedItem(name).value = value;
        }
        form.querySelectorAll('[name="entityTypes"], [name="taskFilters"], [name="runtimeStates"]').forEach(input => { input.checked = false; });
      }
      controller._persistSoon(0); controller._renderGraph(); controller._scheduleTaskReminders();
      controller._updateFilterSummary(); controller._updateSummary(); return;
    }
    if (action === 'toggle-add-menu') {
      const menu = controller.root.querySelector('.relationship-add-menu');
      const trigger = controller.root.querySelector('.relationship-add-trigger');
      const filterPopover = controller.root.querySelector('.relationship-filter-popover');
      const filterTrigger = controller.root.querySelector('.relationship-filter-trigger');
      menu.hidden = !menu.hidden; trigger.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
      if (!menu.hidden) {
        filterPopover.hidden = true; filterTrigger.setAttribute('aria-expanded', 'false'); controller._closeDisplayPopover();
      }
      return;
    }
    if (action === 'toggle-display-menu') {
      const popover = controller.root.querySelector('.relationship-display-popover');
      const trigger = controller.root.querySelector('.relationship-display-trigger');
      popover.hidden = !popover.hidden; trigger.setAttribute('aria-expanded', popover.hidden ? 'false' : 'true');
      if (!popover.hidden) {
        controller._closeFilterPopover(); controller._closeAddMenu(); controller._syncDisplayForm();
        popover.style.transform = '';
        const rect = popover.getBoundingClientRect(), view = popover.ownerDocument.defaultView;
        popover.style.transform = `translateX(${Math.max(12 - rect.left, Math.min(0, view.innerWidth - 12 - rect.right))}px)`;
        popover.style.maxHeight = `${Math.max(160, view.innerHeight - rect.top - 12)}px`;
      }
      return;
    }
    if (action === 'close-resource-panel') {
      controller.resourcePanelVisible = false; controller._syncResourcePanelVisibility(); return;
    }
    if (action === 'project-endpoints') return controller._setProjectEndpoints(!controller._boardView().projectGroupIncludesEndpoints);
    if (action === 'repository-relations') {
      controller._recordMutation();
      const view = controller._boardView(); view.showRepositoryRelations = !view.showRepositoryRelations;
      controller._persistSoon(0); controller.render(); controller._refreshHistoryButtons(); return;
    }
    if (action === 'close-inspector') {
      controller.inspectorPinned = false; controller._clearEntitySelection(); controller.selectedRelationshipId = '';
      controller._updateSelectionCss(); return;
    }
    if (action === 'toggle-inspector-pin') {
      controller.inspectorPinned = !controller.inspectorPinned; controller._syncInspectorPinState();
      controller._setCanvasAnnouncement(controller.inspectorPinned ? '详情窗口已固定在白板上' : '详情窗口已取消固定'); return;
    }
    if (action === 'assign-selection-group') {
      return controller._assignSelectionToGroup(controller.root.querySelector('[data-relationship-group-target]')?.value || '');
    }
    if (action === 'add-todo-row') {
      const form = target.closest('form'), list = form?.querySelector('[data-todo-list]');
      if (list && list.children.length < 20) {
        list.insertAdjacentHTML('beforeend', controller._todoRowHtml());
        list.lastElementChild?.querySelector('[data-todo-title]')?.focus();
        form.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if (action === 'remove-todo-row') {
      const form = target.closest('form');
      target.closest('.relationship-todo-row')?.remove();
      form?.dispatchEvent(new Event('input', { bubbles: true })); return;
    }

    const groupLayoutId = target.closest('[data-group-auto-layout]')?.dataset.groupAutoLayout;
    if (groupLayoutId) return controller._toggleGroupLayout(groupLayoutId);
    const resourceSection = target.closest('[data-resource-section-toggle]')?.dataset.resourceSectionToggle;
    if (resourceSection) {
      if (controller.collapsedResourceSections.has(resourceSection)) controller.collapsedResourceSections.delete(resourceSection);
      else controller.collapsedResourceSections.add(resourceSection);
      const key = `resource:${resourceSection}`;
      controller.panelLayout[key] = { ...controller.panelLayout[key], side: controller.panelLayout[key]?.side || controller.panelLayout.library?.side || 'left', collapsed: controller.collapsedResourceSections.has(resourceSection) };
      controller._savePanelLayout(); controller._renderResources(); return;
    }
    const locateEntityId = target.closest('[data-relationship-locate-entity]')?.dataset.relationshipLocateEntity;
    if (locateEntityId) return controller._focusEntityOnBoard(locateEntityId);
    const panelExternalUrl = target.closest('[data-panel-open-external]')?.dataset.panelOpenExternal;
    if (panelExternalUrl) {
      controller.bridge.panel?.openExternal?.(panelExternalUrl).catch(error => controller.notify(`无法打开链接：${error?.message || String(error)}`, 'error'));
      return;
    }
    const revealRepository = target.closest('[data-panel-reveal-repository]');
    if (revealRepository) return controller._locateRepositoryOnBoard(revealRepository.dataset.panelRevealRepository, revealRepository.dataset.deploymentId);
    const openRepositoryId = target.closest('[data-panel-open-repository]')?.dataset.panelOpenRepository;
    const systemRepositoryId = target.closest('[data-panel-system-repository]')?.dataset.panelSystemRepository;
    if (openRepositoryId || systemRepositoryId) {
      void controller._openRepositoryDirectory(openRepositoryId || systemRepositoryId, Boolean(systemRepositoryId)); return;
    }
    const associationButton = target.closest('[data-panel-association-action]');
    if (associationButton) return controller._changeRepositoryAssociation(associationButton.dataset.entityId, associationButton.dataset.panelAssociationAction);
    const nodeType = target.closest('[data-add-node-type]')?.dataset.addNodeType;
    if (nodeType) {
      controller.root.querySelector('.relationship-add-menu').hidden = true;
      controller.root.querySelector('.relationship-add-trigger').setAttribute('aria-expanded', 'false');
      controller._createManualEntity(nodeType, contextPoint); return;
    }
    const resourceKey = target.closest('[data-add-resource]')?.dataset.addResource;
    if (resourceKey) return controller._addResource(controller.resourceMap.get(resourceKey));
    const locateResourceKey = target.closest('[data-locate-resource]')?.dataset.locateResource;
    if (locateResourceKey) {
      const resource = controller.resourceMap.get(locateResourceKey);
      if (resource?.entityId) controller._focusEntityOnBoard(resource.entityId);
      return;
    }
    closeOutsideMenus(controller, event);
  }

  return Object.freeze({ ACTIONS, resolve, dismissesTransientMenus, handleClick });
});
