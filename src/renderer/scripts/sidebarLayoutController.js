(function (root) {
  class SidebarLayoutController {
    constructor(app, sidebar, sizes) {
      this.app = app;
      this.sidebar = sidebar;
      this.sections = [...sidebar.querySelectorAll('.sidebar-section[data-section-id]')];
      this.sizes = {};
      for (const section of this.sections) {
        const value = sizes?.[section.dataset.sectionId];
        if (Number.isFinite(value) && value > 0) this.sizes[section.dataset.sectionId] = Math.max(1, value);
        const grip = section.querySelector('.sidebar-drag-handle');
        if (!grip) continue;
        const name = section.querySelector('.sidebar-title-text').textContent;
        grip.title = `拖动调整${name}的位置；上下方向键也可排序`;
        grip.setAttribute('aria-label', `调整${name}的位置`);
        grip.addEventListener('pointerdown', event => this.startMove(event, section, grip));
        grip.addEventListener('keydown', event => {
          if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          const visible = this.visibleSections();
          const target = visible[visible.indexOf(section) + (event.key === 'ArrowUp' ? -1 : 1)];
          if (!target) return;
          event.preventDefault();
          this.sidebar.insertBefore(section, event.key === 'ArrowUp' ? target : target.nextSibling);
          this.app.saveSidebarSectionOrder();
          this.refresh();
          grip.focus();
        });
      }
      // Only visibility/collapse changes rebuild dividers; our own sizing styles do not.
      this.observer = new MutationObserver(() => {
        if (this.signature() !== this.lastSignature) this.refresh();
      });
      for (const section of this.sections) this.observer.observe(section, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
      this.refresh();
    }

    signature() {
      return this.sections.map(section => `${section.hidden}:${section.style.display}:${section.classList.contains('collapsed')}`).join('|');
    }

    visibleSections() {
      return [...this.sidebar.querySelectorAll('.sidebar-section[data-section-id]')]
        .filter(section => section.querySelector('.sidebar-title') && !section.hidden && getComputedStyle(section).display !== 'none');
    }

    refresh() {
      this.lastSignature = this.signature();
      this.sidebar.querySelectorAll('.sidebar-section-resize').forEach(handle => handle.remove());
      for (const section of this.sections) {
        const value = this.sizes[section.dataset.sectionId];
        if (value) section.style.setProperty('--sidebar-section-weight', value);
        else section.style.removeProperty('--sidebar-section-weight');
      }
      const expanded = this.visibleSections().filter(section => !section.classList.contains('collapsed'));
      expanded.slice(0, -1).forEach((before, index) => {
        const after = expanded[index + 1];
        const handle = document.createElement('div');
        handle.className = 'sidebar-section-resize';
        handle.tabIndex = 0;
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'horizontal');
        handle.setAttribute('aria-label', '调整侧栏区域高度');
        handle.setAttribute('aria-controls', `${before.id} ${after.id}`);
        handle.title = '上下拖动调整高度；双击恢复默认比例；方向键微调';
        handle.addEventListener('pointerdown', event => this.startResize(event, before, after, handle));
        handle.addEventListener('keydown', event => {
          if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          const resize = this.resizePair(before, after, handle);
          resize((event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? 40 : 10));
          this.saveSizes();
        });
        handle.addEventListener('dblclick', () => {
          for (const section of expanded) delete this.sizes[section.dataset.sectionId];
          this.refresh();
          this.saveSizes();
        });
        before.after(handle);
      });
    }

    saveSizes() {
      root.gitFinder.config.set('sidebarSectionSizes', this.sizes)
        .catch(() => this.app._showStatusMessage?.('侧栏高度未能保存', 'warning'));
    }

    resizePair(before, after, handle) {
      const expanded = this.visibleSections().filter(section => !section.classList.contains('collapsed'));
      const heights = new Map(expanded.map(section => [section, section.getBoundingClientRect().height]));
      const initial = heights.get(before);
      const total = initial + heights.get(after);
      const minBefore = parseFloat(getComputedStyle(before).minHeight) || 72;
      const minAfter = parseFloat(getComputedStyle(after).minHeight) || 72;
      return delta => {
        const next = Math.max(minBefore, Math.min(total - minAfter, initial + delta));
        heights.set(before, next);
        heights.set(after, total - next);
        const sum = [...heights.values()].reduce((a, b) => a + b, 0);
        for (const [section, height] of heights) {
          // Grow factors >= 1 let a remaining pane fill the space when its peer is hidden.
          const weight = Math.max(1, height / sum * 100);
          this.sizes[section.dataset.sectionId] = weight;
          section.style.setProperty('--sidebar-section-weight', weight);
        }
        handle.setAttribute('aria-valuenow', String(Math.round(next)));
        handle.setAttribute('aria-valuemin', String(Math.round(minBefore)));
        handle.setAttribute('aria-valuemax', String(Math.round(total - minAfter)));
      };
    }

    startResize(event, before, after, handle) {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      const resize = this.resizePair(before, after, handle);
      const startY = event.clientY;
      const original = { ...this.sizes };
      this.trackPointer(event, handle, current => resize(current.clientY - startY), cancelled => {
        if (cancelled) { this.sizes = original; this.refresh(); }
        else this.saveSizes();
      });
    }

    startMove(event, section, grip) {
      if (event.button !== 0) return;
      event.preventDefault();
      const startY = event.clientY;
      let target, insertBefore;
      const clear = () => this.sections.forEach(item => item.classList.remove('sidebar-drop-before', 'sidebar-drop-after'));
      this.trackPointer(event, grip, current => {
        if (Math.abs(current.clientY - startY) < 5) return;
        section.classList.add('sidebar-section-dragging');
        const others = this.visibleSections().filter(item => item !== section);
        target = others.find(item => current.clientY < item.getBoundingClientRect().bottom) || others.at(-1);
        clear();
        if (!target) return;
        const rect = target.getBoundingClientRect();
        insertBefore = current.clientY < rect.top + rect.height / 2;
        target.classList.add(insertBefore ? 'sidebar-drop-before' : 'sidebar-drop-after');
      }, cancelled => {
        clear();
        section.classList.remove('sidebar-section-dragging');
        if (cancelled || !target) return;
        this.sidebar.insertBefore(section, insertBefore ? target : target.nextSibling);
        this.app.saveSidebarSectionOrder();
        this.refresh();
        grip.focus();
      });
    }

    trackPointer(event, handle, move, finish) {
      handle.setPointerCapture(event.pointerId);
      const onMove = current => { if (current.pointerId === event.pointerId) move(current); };
      const stop = (cancelled, current) => {
        if (current?.pointerId !== undefined && current.pointerId !== event.pointerId) return;
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onCancel);
        document.removeEventListener('keydown', onKey);
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        finish(cancelled);
      };
      const onUp = current => stop(false, current);
      const onCancel = current => stop(true, current);
      const onKey = current => { if (current.key === 'Escape') { current.preventDefault(); stop(true); } };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onCancel);
      document.addEventListener('keydown', onKey);
    }
  }
  root.SidebarLayoutController = SidebarLayoutController;
})(window);
