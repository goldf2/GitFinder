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
  const MOVE_DIRECTIONS = Object.freeze({
    w: [0, -1], ArrowUp: [0, -1], s: [0, 1], ArrowDown: [0, 1],
    a: [-1, 0], ArrowLeft: [-1, 0], d: [1, 0], ArrowRight: [1, 0]
  });
  const SELECT_ROUTES = Object.freeze([
    ['select[data-selected-group-shape]', 'selectedGroupShape', '_setGroupShape'],
    ['select[data-selected-group-appearance]', 'selectedGroupAppearance', '_setGroupAppearance']
  ]);
  const CLICK_TARGET_SELECTOR = [
    '[data-endpoint-check]', '[data-panel-side]', '[data-panel-collapse]', '[data-board-context-action]',
    '[data-board-layout]', '[data-board-structure]', '[data-relationship-action]', '[data-archive-deployment]',
    '[data-open-document]', '[data-document-home]', '[data-remove-document]', '[data-trash-document]',
    '[data-reveal-asset]', '[data-edit-canvas-element]', '[data-lock-canvas-element]', '[data-lock-descendants]',
    '[data-group-auto-layout]', '[data-resource-section-toggle]', '[data-relationship-locate-entity]',
    '[data-panel-open-external]', '[data-panel-reveal-repository]', '[data-panel-open-repository]',
    '[data-panel-system-repository]', '[data-panel-association-action]', '[data-add-node-type]',
    '[data-add-resource]', '[data-locate-resource]'
  ].join(',');

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

  function routeViewForm(controller, event, commitDisplay = false) {
    const displayForm = event.target.closest('[data-relationship-display-form]');
    if (displayForm) {
      controller._updateBoardDisplayFromForm(displayForm);
      if (commitDisplay) controller.displayLayoutEdit = null; return true;
    }
    const filterForm = event.target.closest('[data-relationship-filter-form]');
    if (!filterForm) return false;
    controller._updateBoardViewFromForm(filterForm);
    return true;
  }

  function handleChange(controller, event) {
    const target = event.target;
    const routedSelect = SELECT_ROUTES.find(([selector]) => target.matches(selector));
    if (routedSelect) {
      const [, dataKey, method] = routedSelect;
      controller[method](target.dataset[dataKey], target.value);
      return;
    }
    if (target.matches('[data-project-endpoints]')) {
      controller._setProjectEndpoints(target.checked); return;
    }
    if (target.matches('[data-relationship-snap-mode]')) {
      const board = activeBoard(controller);
      if (!board) return;
      board.view = { ...controller._boardView(), snapMode: String(target.value || 'smart') };
      controller._persistSoon(0); return;
    }
    if (routeViewForm(controller, event, true)) return;
    if (target.id !== 'relationship-board-select') return;
    if (!controller.store.boards.some(board => board.id === target.value)) return;
    controller.store.activeBoardId = target.value;
    controller.inspectorPinned = false;
    controller._clearEntitySelection();
    controller.selectedRelationshipId = '';
    controller._persistSoon(0); controller._setPanelTopology(controller.panelTopologyResult); controller.render();
  }

  function handleInput(controller, event) {
    const target = event.target;
    if (target.matches('[data-project-endpoints]') || routeViewForm(controller, event)) return;
    if (target.matches('.relationship-resource-search input')) {
      controller.resourceSearch = target.value; controller._renderResources(); return;
    }
    const form = target.closest('[data-relationship-inspector-form], [data-relationship-annotation-form]');
    if (!form) return;
    form.classList.add('is-dirty');
    const saveButton = form.querySelector('[data-inspector-save]');
    if (saveButton) saveButton.disabled = false;
    const error = form.querySelector('.relationship-inspector-error');
    if (error) error.textContent = '';
  }

  function handleSubmit(controller, event) {
    const form = event.target.closest('[data-relationship-inspector-form], [data-relationship-annotation-form]');
    if (!form) return;
    event.preventDefault();
    controller[form.matches('[data-relationship-annotation-form]') ? '_saveAnnotationForm' : '_saveInspectorForm'](form);
  }

  function handleDragStart(controller, event) {
    const handle = event.target.closest('[data-panel-drag]');
    if (handle) {
      controller.draggedPanelKey = handle.dataset.panelDrag;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-gitfinder-panel', controller.draggedPanelKey);
      controller.root.classList.add('panel-drag-active'); controller.panelSidebarRoot?.classList.add('panel-drag-active'); return;
    }
    const item = event.target.closest('[data-resource-key]');
    if (!item) return;
    const key = item.dataset.resourceKey;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-gitfinder-relationship-resource', key);
    event.dataTransfer.setData('text/plain', key);
  }

  function handleDragOver(controller, event) {
    if (controller.draggedPanelKey && event.target.closest('[data-panel-dock]')) {
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; return;
    }
    if (!event.target.closest('.relationship-canvas')) return;
    if (!event.dataTransfer.types.includes('application/x-gitfinder-relationship-resource') && !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
  }

  function handleDrop(controller, event) {
    if (controller.draggedPanelKey) {
      const dock = event.target.closest('[data-panel-dock]');
      if (dock) {
        event.preventDefault();
        controller._setPanelSide(controller.draggedPanelKey, dock.dataset.panelDock, event.target.closest('[data-panel-id]')?.dataset.panelId);
      }
      controller._clearPanelDrag(); return;
    }
    if (!event.target.closest('.relationship-canvas')) return;
    if (event.dataTransfer.files?.length) {
      event.preventDefault(); event.stopPropagation();
      const paths = [...event.dataTransfer.files].map(file => controller.bridge.fs?.getPathForFile(file)).filter(Boolean);
      void controller._addFiles(paths, controller._clientToWorld(event.clientX, event.clientY)); return;
    }
    const key = event.dataTransfer.getData('application/x-gitfinder-relationship-resource');
    const resource = controller.resourceMap.get(key);
    if (!resource) return;
    event.preventDefault();
    controller._addResource(resource, controller._clientToWorld(event.clientX, event.clientY));
  }

  function handleClick(controller, event) {
    const target = event.target;
    const routeTarget = target.closest(CLICK_TARGET_SELECTOR);
    const data = routeTarget?.dataset || {};
    if (data.endpointCheck) {
      const entity = controller._allEntitiesById().get(data.endpointCheck);
      if (!routeTarget.disabled && entity?.runtime?.dynamicKind === 'panel-endpoint') {
        void controller._refreshEndpointChecks({ providerId: entity.runtime.providerId, url: entity.runtime.url, force: true });
      }
      return;
    }
    if (data.panelSide) return controller._setPanelSide(data.panelKey, data.panelSide);
    if (data.panelCollapse) return controller._togglePanelCollapsed(data.panelCollapse);
    if (data.boardContextAction) return routeTarget.disabled ? undefined : controller._runContextAction(data.boardContextAction);

    const contextPoint = target.closest('.relationship-context-menu') ? controller.contextMenuPoint : null;
    controller._closeContextMenu(Boolean(contextPoint));
    const action = data.relationshipAction;
    if (data.boardLayout) {
      controller._closeLayoutMenu(); controller._setLayout(data.boardLayout);
      controller.root?.querySelector('[data-layout-menu="layout"]')?.focus(); return;
    }
    if (data.boardStructure) {
      controller._closeLayoutMenu(); controller._setStructure(data.boardStructure);
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
      const trigger = routeTarget;
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

    if (data.archiveDeployment || action === 'archive-selected-deployment') return controller._setDeploymentArchived(data.archiveDeployment || controller.selectedEntityId, true);
    if (data.openDocument) { void controller._openDocument(data.openDocument); return; }
    if ('documentHome' in data) { void controller._showLocalWorkspace(); return; }
    if (data.removeDocument || data.trashDocument) {
      void controller._removeDocument(data.removeDocument || data.trashDocument, Boolean(data.trashDocument))
        .catch(error => controller.notify(error.message, 'error'));
      return;
    }
    if (data.revealAsset && controller.documentRecord) {
      void controller.bridge.relationshipBoards.revealAsset({ id: controller.documentRecord.id, entityId: data.revealAsset })
        .catch(error => controller.notify(error.message, 'error'));
      return;
    }
    if (data.editCanvasElement) { void controller._editCanvasElement(data.editCanvasElement); return; }
    if (data.lockCanvasElement) {
      controller._recordMutation();
      const placement = controller._placementForEntity(data.lockCanvasElement);
      if (placement.locked) delete placement.locked; else placement.locked = true;
      controller._persistSoon(0); controller._renderGraph(); return;
    }
    if (data.lockDescendants) return controller._toggleLinkedMovement(data.lockDescendants);

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
        queueMicrotask(() => popover.querySelector('[data-relationship-action="close-display-settings"]')?.focus());
      }
      return;
    }
    if (action === 'close-display-settings') { controller._closeDisplayPopover(true); return; }
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
      const form = routeTarget.closest('form'), list = form?.querySelector('[data-todo-list]');
      if (list && list.children.length < 20) {
        list.insertAdjacentHTML('beforeend', controller._todoRowHtml());
        list.lastElementChild?.querySelector('[data-todo-title]')?.focus();
        form.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if (action === 'remove-todo-row') {
      const form = routeTarget.closest('form');
      routeTarget.closest('.relationship-todo-row')?.remove();
      form?.dispatchEvent(new Event('input', { bubbles: true })); return;
    }

    if (data.groupAutoLayout) return controller._toggleGroupLayout(data.groupAutoLayout);
    if (data.resourceSectionToggle) {
      const section = data.resourceSectionToggle;
      if (controller.collapsedResourceSections.has(section)) controller.collapsedResourceSections.delete(section);
      else controller.collapsedResourceSections.add(section);
      const key = `resource:${section}`;
      controller.panelLayout[key] = { ...controller.panelLayout[key], side: controller.panelLayout[key]?.side || controller.panelLayout.library?.side || 'left', collapsed: controller.collapsedResourceSections.has(section) };
      controller._savePanelLayout(); controller._renderResources(); return;
    }
    if (data.relationshipLocateEntity) return controller._focusEntityOnBoard(data.relationshipLocateEntity);
    if (data.panelOpenExternal) {
      controller.bridge.panel?.openExternal?.(data.panelOpenExternal).catch(error => controller.notify(`无法打开链接：${error?.message || String(error)}`, 'error'));
      return;
    }
    if (data.panelRevealRepository) return controller._locateRepositoryOnBoard(data.panelRevealRepository, data.deploymentId);
    if (data.panelOpenRepository || data.panelSystemRepository) {
      void controller._openRepositoryDirectory(data.panelOpenRepository || data.panelSystemRepository, Boolean(data.panelSystemRepository)); return;
    }
    if (data.panelAssociationAction) return controller._changeRepositoryAssociation(data.entityId, data.panelAssociationAction);
    if (data.addNodeType) {
      controller.root.querySelector('.relationship-add-menu').hidden = true;
      controller.root.querySelector('.relationship-add-trigger').setAttribute('aria-expanded', 'false');
      controller._createManualEntity(data.addNodeType, contextPoint); return;
    }
    if (data.addResource) return controller._addResource(controller.resourceMap.get(data.addResource));
    if (data.locateResource) {
      const resource = controller.resourceMap.get(data.locateResource);
      if (resource?.entityId) controller._focusEntityOnBoard(resource.entityId);
      return;
    }
    closeOutsideMenus(controller, event);
  }

  function handleKeydown(controller, event) {
    if (!controller.root?.isConnected || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (controller._handleContextMenuKeydown(event)) return;
    const layoutMenu = controller.root.querySelector('.relationship-layout-menu:not([hidden])');
    if (layoutMenu && !layoutMenu.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); controller._closeLayoutMenu(true); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...layoutMenu.querySelectorAll('button:not(:disabled)')], current = buttons.indexOf(controller.root.ownerDocument.activeElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[index]?.focus(); return;
      }
      if (event.key === 'Tab') controller._closeLayoutMenu();
    }
    const editing = event.target?.isContentEditable
      || event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
    const mod = event.metaKey || event.ctrlKey;
    const displayDialog = controller.root.querySelector('.relationship-display-popover:not([hidden])');
    if (displayDialog) {
      if (event.key === 'Escape') {
        event.preventDefault(); controller._closeDisplayPopover(true); return;
      }
      if (event.key === 'Tab') {
        const focusable = [...displayDialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
          .filter(item => item.getClientRects().length > 0);
        const active = displayDialog.ownerDocument.activeElement;
        if (focusable.length && ((event.shiftKey && active === focusable[0]) || (!event.shiftKey && active === focusable.at(-1)))) {
          event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0]).focus();
        }
      }
    }
    if (event.key === 'Escape' && !controller.root.querySelector('.relationship-filter-popover')?.hidden) {
      event.preventDefault();
      controller._closeFilterPopover();
      controller.root.querySelector('.relationship-filter-trigger')?.focus();
      return;
    }
    if (mod && event.key.toLowerCase() === 'z' && !editing) {
      event.preventDefault();
      if (event.shiftKey) controller.redo(); else controller.undo(); return;
    }
    if (mod && event.key.toLowerCase() === 'g' && !editing) {
      event.preventDefault();
      if (event.shiftKey) controller._removeSelectionFromGroups(); else controller._createGroupFromSelection(); return;
    }
    if (editing) return;
    if (event.key === 'Escape') {
      controller._clearEntitySelection();
      controller.selectedRelationshipId = '';
      controller._updateSelectionCss();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace')
      && (controller._entitySelectionIds().size || controller.selectedRelationshipId)) {
      event.preventDefault(); controller._deleteSelection(); return;
    }
    const canvas = event.target?.closest?.('.relationship-canvas');
    if (!canvas || mod
      || event.target?.closest?.('button, a, [role="menu"], [role="menuitem"], [role="slider"]')
      || controller.root.querySelector('.relationship-display-popover:not([hidden]), .relationship-filter-popover:not([hidden]), .relationship-add-menu:not([hidden])')
      || Array.from(controller.root.ownerDocument?.querySelectorAll('[role="dialog"][aria-modal="true"]') || [])
        .some(dialog => dialog.getClientRects().length > 0)) return;
    const direction = MOVE_DIRECTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (direction && !event.altKey) {
      const board = activeBoard(controller);
      if (!board) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const step = event.shiftKey ? 120 : 40;
      board.viewport.x -= direction[0] * step; board.viewport.y -= direction[1] * step;
      controller._applyViewport(); controller._persistSoon(220); return;
    }
    const selectedIds = controller._entitySelectionIds();
    if (!event.altKey || !selectedIds.size
      || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const movingIds = new Set(controller._movingEntityIds(controller.selectedEntityId || selectedIds.values().next().value));
    const linkedMovement = [...movingIds].some(id => controller._placementForEntity(id)?.moveWithDescendants);
    if (linkedMovement && controller._linkedMoveBlocked(movingIds)) return;
    for (const id of [...movingIds]) if (controller._placementForEntity(id)?.locked) movingIds.delete(id);
    const board = activeBoard(controller);
    const persistentIds = new Set(board.placements.filter(item => movingIds.has(item.entityId)).map(item => item.entityId));
    const dynamicIds = new Set((controller.panelProjection?.placements || [])
      .filter(item => item.dynamic && movingIds.has(item.entityId)).map(item => item.entityId));
    const placements = controller._combinedPlacements().filter(item => movingIds.has(item.entityId));
    if (!placements.length) return;
    if (persistentIds.size || linkedMovement) controller._recordMutation();
    const geometry = linkedMovement ? controller._displayGeometryMap(controller._combinedPlacements()) : null;
    const linkedChangedIds = linkedMovement ? controller._prepareLinkedMove([...movingIds], geometry) : [];
    const step = event.shiftKey ? 24 : 8;
    const offsets = MOVE_DIRECTIONS[event.key].map(value => value * step);
    for (const placement of placements) {
      const rect = geometry?.get(placement.entityId);
      if (rect) { placement.x = rect.x; placement.y = rect.y; }
      placement.x += offsets[0]; placement.y += offsets[1];
    }
    if (persistentIds.size) controller._persistSoon(80);
    if (dynamicIds.size) controller._saveDynamicPlacementOverrides(dynamicIds);
    if (linkedChangedIds.length) {
      controller._saveDynamicPlacementOverrides(linkedChangedIds); controller._persistSoon(0);
    }
    controller._renderGraph(); controller._refreshHistoryButtons();
  }

  return Object.freeze({
    ACTIONS, resolve, dismissesTransientMenus,
    handleClick, handleChange, handleInput, handleSubmit,
    handleDragStart, handleDragOver, handleDrop, handleKeydown
  });
});
