(function exposePanelResize(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RelationshipPanelResize = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPanelResize() {
  const DEFAULT_WIDTH = 264;
  const MIN_WIDTH = 220;
  const MAX_WIDTH = 640;
  const HANDLE_WIDTH = 6;
  const MIN_CANVAS_WIDTH = 280;
  const CONFIG_KEY = 'relationshipRightPanelWidth';

  function normalizeWidth(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return DEFAULT_WIDTH;
    const width = Number(value);
    return Number.isFinite(width) ? Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width))) : DEFAULT_WIDTH;
  }

  function widthBounds(bodyWidth, leftWidth = 0) {
    const available = Math.max(0, (Number(bodyWidth) || 0) - (Number(leftWidth) || 0) - HANDLE_WIDTH);
    const canvas = Math.min(MIN_CANVAS_WIDTH, Math.ceil(available / 2));
    const max = Math.max(0, Math.min(MAX_WIDTH, Math.floor(available - canvas)));
    return { min: Math.min(MIN_WIDTH, max), max };
  }

  class Controller {
    constructor({ config, notify = () => {}, onResize = () => {} } = {}) {
      this.config = config;
      this.notify = notify;
      this.onResize = onResize;
      this.preferredWidth = DEFAULT_WIDTH;
      this.width = DEFAULT_WIDTH;
      this.saveChain = Promise.resolve();
      this.root = null;
      this.drag = null;
      this.dragFrame = null;
      this.pendingDragWidth = null;
      this.refresh = this.refresh.bind(this);
      this._down = event => this.startDrag(event);
      this._move = event => {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        event.preventDefault();
        this.pendingDragWidth = this.drag.width + this.drag.x - event.clientX;
        if (!this.win?.requestAnimationFrame) this.flushDragWidth(true);
        else if (this.dragFrame === null) {
          this.dragFrame = this.win.requestAnimationFrame(() => {
            this.dragFrame = null;
            this.flushDragWidth(true);
          });
        }
      };
      this._up = event => { if (event.pointerId === this.drag?.pointerId) this.finishDrag(true); };
      this._cancel = event => { if (event.pointerId === this.drag?.pointerId) this.finishDrag(false); };
      this._blur = () => this.finishDrag(true);
      this._lost = () => this.finishDrag(true);
      this._dragKey = event => {
        if (this.drag && event.key === 'Escape') {
          event.preventDefault(); event.stopImmediatePropagation(); this.finishDrag(false);
        }
      };
      this._key = event => this.handleKey(event);
      this._reset = event => {
        event.preventDefault(); event.stopPropagation();
        if (this.setWidth(DEFAULT_WIDTH)) this.save();
      };
    }

    loadWidth(value) {
      this.preferredWidth = normalizeWidth(value);
      this.refresh();
    }

    mount(root) {
      this.unmount();
      this.root = root;
      this.body = root?.querySelector('.relationship-body');
      this.left = root?.querySelector('[data-panel-dock="left"]');
      this.dock = root?.querySelector('[data-panel-dock="right"]');
      this.handle = root?.querySelector('[data-relationship-panel-resize]');
      if (!this.body || !this.dock || !this.handle) return;
      this.doc = root.ownerDocument;
      this.win = this.doc.defaultView;
      this.handle.addEventListener('pointerdown', this._down);
      this.handle.addEventListener('lostpointercapture', this._lost);
      this.handle.addEventListener('keydown', this._key);
      this.handle.addEventListener('dblclick', this._reset);
      this.win?.addEventListener('resize', this.refresh);
      if (this.win?.ResizeObserver) {
        this.observer = new this.win.ResizeObserver(this.refresh);
        this.observer.observe(this.body);
        if (this.left) this.observer.observe(this.left);
      }
      if (this.win?.MutationObserver) {
        this.visibilityObserver = new this.win.MutationObserver(this.refresh);
        this.visibilityObserver.observe(this.dock, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      }
      this.refresh();
    }

    unmount() {
      this.finishDrag(true);
      this.observer?.disconnect();
      this.visibilityObserver?.disconnect();
      this.observer = null;
      this.visibilityObserver = null;
      this.win?.removeEventListener('resize', this.refresh);
      this.handle?.removeEventListener('pointerdown', this._down);
      this.handle?.removeEventListener('lostpointercapture', this._lost);
      this.handle?.removeEventListener('keydown', this._key);
      this.handle?.removeEventListener('dblclick', this._reset);
      this.root = this.body = this.dock = this.left = this.handle = this.doc = this.win = null;
    }

    bounds() {
      return widthBounds(this.body?.getBoundingClientRect().width, this.left?.getBoundingClientRect().width);
    }

    refresh() {
      if (!this.body?.isConnected || !this.handle || !this.dock) return;
      this.handle.hidden = ![...this.dock.children].some(child => !child.hidden);
      if (this.handle.hidden) this.finishDrag(true);
      if (this.body.getBoundingClientRect().width <= 0) return;
      const bounds = this.bounds();
      const width = Math.min(bounds.max, Math.max(bounds.min, this.preferredWidth));
      const changed = this.width !== width;
      this.width = width;
      this.body.style.setProperty('--relationship-right-panel-width', `${width}px`);
      this.handle.setAttribute('aria-valuemin', bounds.min);
      this.handle.setAttribute('aria-valuemax', bounds.max);
      this.handle.setAttribute('aria-valuenow', width);
      this.handle.setAttribute('aria-valuetext', `${width} 像素`);
      if (changed) this.onResize();
    }

    setWidth(value) {
      if (!Number.isFinite(value)) return;
      const bounds = this.bounds();
      const preferred = Math.round(Math.max(bounds.min, Math.min(bounds.max, value)));
      if (preferred === this.preferredWidth) return false;
      this.preferredWidth = preferred;
      this.refresh();
      return true;
    }

    flushDragWidth(commit) {
      if (this.dragFrame !== null) this.win?.cancelAnimationFrame(this.dragFrame);
      this.dragFrame = null;
      const value = this.pendingDragWidth;
      this.pendingDragWidth = null;
      if (!commit || value === null) return;
      const bounds = this.bounds();
      const width = Math.round(Math.max(bounds.min, Math.min(bounds.max, value)));
      // A click or outward motion at a constrained edge must not overwrite the
      // wider preference that will be restored when the window grows again.
      if (width !== this.width) this.setWidth(width);
    }

    startDrag(event) {
      if (event.button !== 0 || event.isPrimary === false || this.handle.hidden || this.drag) return;
      event.preventDefault(); event.stopPropagation();
      this.drag = { pointerId: event.pointerId, x: event.clientX, width: this.width, preferred: this.preferredWidth };
      this.root.classList.add('is-panel-resizing');
      this.handle.focus({ preventScroll: true });
      this.doc.addEventListener('pointermove', this._move, true);
      this.doc.addEventListener('pointerup', this._up, true);
      this.doc.addEventListener('pointercancel', this._cancel, true);
      this.doc.addEventListener('keydown', this._dragKey, true);
      this.win?.addEventListener('blur', this._blur);
      this.handle.setPointerCapture?.(event.pointerId);
    }

    finishDrag(commit) {
      const drag = this.drag;
      if (!drag) return;
      this.flushDragWidth(commit);
      this.drag = null;
      this.doc.removeEventListener('pointermove', this._move, true);
      this.doc.removeEventListener('pointerup', this._up, true);
      this.doc.removeEventListener('pointercancel', this._cancel, true);
      this.doc.removeEventListener('keydown', this._dragKey, true);
      this.win?.removeEventListener('blur', this._blur);
      this.root.classList.remove('is-panel-resizing');
      try { this.handle.releasePointerCapture?.(drag.pointerId); } catch (_) { /* The node may have detached during redraw. */ }
      if (!commit) { this.preferredWidth = drag.preferred; this.refresh(); }
      else if (drag.preferred !== this.preferredWidth) this.save();
    }

    handleKey(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || this.handle.hidden) return;
      const step = event.shiftKey ? 32 : 8;
      const bounds = this.bounds();
      const values = { ArrowLeft: this.width + step, ArrowRight: this.width - step, Home: bounds.min, End: bounds.max };
      if (!Object.hasOwn(values, event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const width = Math.round(Math.max(bounds.min, Math.min(bounds.max, values[event.key])));
      if (width !== this.width && this.setWidth(width)) this.save();
    }

    save() {
      const width = this.preferredWidth;
      this.saveChain = this.saveChain.then(() => this.config?.set?.(CONFIG_KEY, width)).catch(error => {
        this.notify(`右侧面板宽度保存失败：${error?.message || error}`, 'error');
      });
      return this.saveChain;
    }
  }

  return Object.freeze({ Controller, normalizeWidth, widthBounds, DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH });
});
