(function(root) {
  const M = root.NativePanelModel;
  const U = root.DashboardViewUtils;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  class NativePanelController {
    constructor(container, api, openSettings) {
      this.container = container;
      this.api = api;
      this.openSettings = openSettings;
      this.snapshot = {};
      this.checks = [];
      this.remote = null;
      this.active = false;
      this.loading = false;
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem('gitfinder.native-panel.v1') || '{}'); } catch (_) {}
      this.filters = U.normalizeFilterState(saved.filters);
      this.layout = U.normalizeLayoutMode(saved.layout);
      this.build();
    }
    button(text, action) {
      const button = element('button', 'btn btn-small', text);
      button.type = 'button';
      button.addEventListener('click', action);
      return button;
    }
    build() {
      const toolbar = element('div', 'xiangshu-panel-toolbar');
      toolbar.append(element('strong', '', '象数面板'));
      this.search = element('input', 'native-panel-search');
      this.search.type = 'search';
      this.search.placeholder = '搜索服务、主机、项目或网址';
      this.search.setAttribute('aria-label', this.search.placeholder);
      this.search.value = this.filters.query;
      this.search.addEventListener('input', () => { this.filters.query = this.search.value; this.save(); this.render(); });
      toolbar.append(this.search);
      this.layoutButton = this.button('', () => { this.layout = this.layout === 'table' ? 'cards' : 'table'; this.save(); this.render(); });
      this.refreshButton = this.button('同步资源', () => this.load(true));
      toolbar.append(this.layoutButton, this.refreshButton, this.button('读取远端结果', () => this.loadRemote()), this.button('连接设置', () => this.openSettings()));
      this.filterBar = element('div', 'native-panel-filters');
      const legend = element('p', 'native-panel-legend', '部署：Coolify 状态 · 本机：手动 HTTP 检测 · 远端：网站已有检测批次。绿：正常；红：异常；黄：检测中、需授权或已过期；灰：未知。结果有效期 5 分钟。');
      this.status = element('div', 'native-panel-status');
      this.status.setAttribute('role', 'status');
      this.remoteStatus = element('div', 'native-panel-status');
      this.remoteStatus.setAttribute('role', 'status');
      this.content = element('div', 'native-panel-content');
      this.container.replaceChildren(toolbar, this.filterBar, legend, this.status, this.remoteStatus, this.content);
    }
    save() {
      try { localStorage.setItem('gitfinder.native-panel.v1', JSON.stringify({ filters: this.filters, layout: this.layout })); } catch (_) {}
    }
    open() {
      if (this.active) return;
      this.active = true;
      void this.load(false);
      void this.loadRemote();
      this.timer = setInterval(() => { if (this.active) this.updateLamps(); }, 30000);
    }
    close() { this.active = false; clearInterval(this.timer); clearTimeout(this.pollTimer); }
    async load(refresh) {
      if (this.loading) return;
      this.loading = true;
      this.refreshButton.disabled = true;
      this.status.textContent = refresh ? '正在同步 Coolify 资源…' : '正在读取本地缓存…';
      try {
        const snapshot = await (refresh ? this.api.refreshTopology() : this.api.getCachedTopology());
        this.snapshot = snapshot || {};
        this.checks = (await this.api.getEndpointChecks())?.checks || [];
        this.buildFilters();
        this.render();
        const count = this.snapshot.topology?.deployments?.length || 0;
        this.status.textContent = `${count} 个部署 · ${refresh ? '同步结果' : '本地缓存'}${this.snapshot.topology?.generatedAt ? ' · ' + new Date(this.snapshot.topology.generatedAt).toLocaleString() : ''}${this.snapshot.errors?.length ? ' · 部分连接同步异常，保留可用资源' : ''}`;
      } catch (_) { this.status.textContent = '资源读取失败，保留当前显示；可在连接设置检查配置后重试。'; }
      finally { this.loading = false; this.refreshButton.disabled = false; }
    }
    async loadRemote() {
      if (this.remoteLoading) return;
      this.remoteLoading = true;
      this.remoteStatus.textContent = '正在读取远端已有检测结果…';
      try {
        this.remote = await this.api.getRemoteObservations();
        this.remoteStatus.textContent = this.remote.error || `远端批次：${new Date(this.remote.checkedAt).toLocaleString()} · panel.xiangshu.me（最多每分钟读取一次，不触发强制扫描）`;
      } catch (_) {
        this.remote = { checks: (this.remote?.checks || []).map(check => ({ ...check, stale: true })) };
        this.remoteStatus.textContent = '远端结果暂不可读取；不影响本地资源显示。';
      } finally { this.remoteLoading = false; this.updateLamps(); this.updateThumbnails(); }
    }
    buildFilters() {
      this.filterBar.replaceChildren();
      const all = M.rows(this.snapshot);
      for (const [key, field, label] of [['nodes', 'node', '主机'], ['projects', 'project', '项目'], ['types', 'type', '类型']]) {
        const details = element('details', 'native-panel-filter');
        const summary = element('summary', '', `${label}（多选）`);
        details.append(summary);
        const choices = element('div', 'native-panel-choices');
        // Keep unavailable saved selections visible so they can always be cleared.
        for (const value of [...new Set([...all.map(row => row[field]).filter(Boolean), ...this.filters[key]])].sort()) {
          const item = element('label');
          const input = element('input');
          input.type = 'checkbox';
          input.checked = this.filters[key].includes(value);
          input.addEventListener('change', () => { this.filters[key] = U.toggleSelection(this.filters[key], value); this.save(); this.render(); });
          item.append(input, document.createTextNode(value));
          choices.append(item);
        }
        details.append(choices);
        this.filterBar.append(details);
      }
      this.filterBar.append(this.button('清除筛选', () => { this.filters = U.normalizeFilterState({}); this.search.value = ''; this.save(); this.buildFilters(); this.render(); }));
      this.count = element('span', 'native-panel-count');
      this.filterBar.append(this.count);
    }
    rowChecks(row) {
      return [row.deploymentCheck,
        this.checks.find(check => check.providerId === row.providerId && M.urlKey(check.url) === M.urlKey(row.url)),
        M.remoteCheck(row, this.remote)];
    }
    updateThumbnails() {
      for (const { image, placeholder, row } of this.thumbnails || []) {
        const check = M.remoteCheck(row, this.remote);
        const url = M.thumbnailUrl(check?.screenshotUrl);
        if (!url) {
          image.hidden = true;
          image.removeAttribute('src');
          placeholder.hidden = false;
          placeholder.textContent = row.url ? '暂无网页缩略图' : '无公开访问点';
        } else if (image.getAttribute('src') !== url) {
          image.hidden = false;
          placeholder.hidden = false;
          placeholder.textContent = '缩略图加载中…';
          image.title = `${row.name || '网页'} · 远端缓存快照（不代表实时可访问状态）`;
          image.src = url;
        }
      }
    }
    updateLamps() {
      for (const { node, row, index } of this.lamps || []) {
        const check = this.rowChecks(row)[index];
        const state = M.lamp(check);
        node.className = `native-panel-lamp lamp-${state.color}`;
        node.textContent = `${['部署', '本机', '远端'][index]} · ${state.label}`;
        node.title = [node.textContent, index === 2 ? '来源：panel.xiangshu.me；按节点地址、资源 UUID 和访问点精确匹配' : index === 1 ? '来源：当前电脑网络' : '来源：Coolify 资源同步',
          check?.checkedAt ? `记录时间：${new Date(check.checkedAt).toLocaleString()}` : index && !row.url ? '无公开访问点' : '尚未检测或未匹配到检测记录',
          check?.httpStatus ? `HTTP ${check.httpStatus}` : '', check?.latencyMs != null ? `${check.latencyMs} ms` : '', check?.message || '', check?.status || ''].filter(Boolean).join('\n');
        node.setAttribute('aria-label', node.title);
      }
    }
    async probe(row) {
      try {
        const result = await this.api.checkEndpoints({ providerId: row.providerId, url: row.url, force: true });
        this.checks = result.checks || [];
        this.updateLamps();
        if (result.pending && this.active) this.poll();
      } catch (_) { this.status.textContent = '本机检测未启动：请确认资源访问点仍有效。'; }
    }
    poll() {
      clearTimeout(this.pollTimer);
      this.pollTimer = setTimeout(async () => {
        if (!this.active) return;
        try {
          const result = await this.api.getEndpointChecks();
          this.checks = result.checks || [];
          this.updateLamps();
          if (result.pending) this.poll();
        } catch (_) { this.status.textContent = '本机检测结果读取失败，请稍后重试。'; }
      }, 1000);
    }
    render() {
      const all = M.rows(this.snapshot);
      const query = this.filters.query.toLocaleLowerCase().trim();
      const rows = all.filter(row => U.matchesSelection(row.node, this.filters.nodes)
        && U.matchesSelection(row.project, this.filters.projects) && U.matchesSelection(row.type, this.filters.types)
        && [row.name, row.node, row.project, row.url].join(' ').toLocaleLowerCase().includes(query));
      const sortField = this.filters.sort.startsWith('node') ? 'node' : this.filters.sort.startsWith('project') ? 'project' : 'name';
      rows.sort((a, b) => String(a[sortField] || '').localeCompare(String(b[sortField] || ''), 'zh-CN', { numeric: true }) * (this.filters.sort.endsWith('desc') ? -1 : 1));
      this.layoutButton.textContent = this.layout === 'table' ? '切换卡片' : '切换表格';
      if (this.count) this.count.textContent = `${rows.length} / ${all.length} 条访问点与无网址资源`;
      this.content.replaceChildren();
      this.lamps = [];
      this.thumbnails = [];
      if (!rows.length) { this.content.append(element('p', 'native-panel-empty', all.length ? '没有符合筛选条件的资源，可清除筛选。' : '暂无缓存资源。请配置 Coolify 连接后点击“同步资源”。')); return; }
      const target = element(this.layout === 'table' ? 'table' : 'div', `native-panel-${this.layout}`);
      let body = target;
      if (this.layout === 'table') {
        const head = element('thead');
        const tr = element('tr');
        for (const [label, column] of [['网页缩略图'], ['服务', 'service'], ['主机', 'node'], ['项目', 'project'], ['访问点'], ['检测状态'], ['操作']]) {
          const th = element('th');
          if (column) {
            const direction = U.columnSortDirection(column, this.filters.sort);
            if (direction) th.setAttribute('aria-sort', direction);
            th.append(this.button(label + (direction === 'ascending' ? ' ↑' : direction === 'descending' ? ' ↓' : ''), () => { this.filters.sort = U.nextColumnSort(column, this.filters.sort); this.save(); this.render(); }));
          } else th.textContent = label;
          tr.append(th);
        }
        head.append(tr); target.append(head); body = element('tbody'); target.append(body);
      }
      for (const row of rows) {
        const item = element(this.layout === 'table' ? 'tr' : 'article', 'native-panel-resource');
        const cell = text => element(this.layout === 'table' ? 'td' : 'div', '', text);
        const preview = cell();
        const frame = element('div', 'native-panel-thumbnail');
        const placeholder = element('span', '', '暂无网页缩略图');
        const image = element('img');
        image.alt = `${row.name || '网页'}缩略图`;
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.hidden = true;
        image.addEventListener('load', () => { placeholder.hidden = true; });
        image.addEventListener('error', () => { image.hidden = true; placeholder.hidden = false; placeholder.textContent = '缩略图暂不可用'; });
        frame.append(image, placeholder); preview.append(frame);
        this.thumbnails.push({ image, placeholder, row });
        const name = cell(); name.append(element('strong', '', row.name || row.resourceUuid), element('small', '', row.type || '资源'));
        const url = cell(row.url || '无公开访问点'); url.className = 'native-panel-url';
        const lights = cell(); lights.className = 'native-panel-lights';
        for (let index = 0; index < 3; index++) {
          const node = element('span'); node.tabIndex = 0; lights.append(node); this.lamps.push({ node, row, index });
        }
        const actions = cell();
        const probe = this.button('检测本机', () => this.probe(row)); probe.disabled = !row.url;
        const open = this.button('打开', () => this.api.openExternal(row.url).catch(() => { this.status.textContent = '访问点无法打开，请检查连接设置。'; })); open.disabled = !row.url;
        actions.append(probe, open);
        item.append(preview, name, cell(row.node), cell(row.project), url, lights, actions); body.append(item);
      }
      this.content.append(target);
      this.updateLamps();
      this.updateThumbnails();
    }
  }
  root.NativePanelController = NativePanelController;
})(window);
