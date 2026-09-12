#!/usr/bin/env node
// Run only against a disposable Electron profile, never a user's running App.
const assert = require('node:assert/strict');
async function main() {
  const port = Number(process.argv[2] || 9337);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find(target => target.type === 'page' && target.url.endsWith('/src/renderer/index.html'));
  assert.ok(page, 'GitFinder renderer required');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  async function evaluate(expression) {
    const requestId = ++id;
    const result = new Promise(resolve => pending.set(requestId, resolve));
    socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    const message = await result;
    if (message.result?.exceptionDetails || message.error) throw new Error(JSON.stringify(message));
    return message.result.result.value;
  }
  try {
    await evaluate(`(() => {
      window.__nativePanelCalls = { refresh: 0, probes: 0 };
      const checkedAt = new Date().toISOString();
      const snapshot = { providers: [{ providerId: 'fixture', label: '测试主机', baseUrl: 'https://node.test' }], topology: { generatedAt: checkedAt, deployments: [
        { providerId: 'fixture', resourceUuid: 'a', name: '示例 API', projectName: '测试项目', type: 'application', status: 'running:healthy', domains: ['https://app.test'] },
        { providerId: 'fixture', resourceUuid: 'b', name: '无网址数据库', projectName: '内部服务', type: 'database', status: 'stopped', domains: [] }
      ] } };
      const api = {
        getCachedTopology: async () => snapshot,
        refreshTopology: async () => { __nativePanelCalls.refresh++; return snapshot; },
        getEndpointChecks: async () => ({ checks: [{ providerId: 'fixture', url: 'https://app.test', httpStatus: 403, checkedAt }], pending: 0 }),
        getRemoteObservations: async () => ({ checkedAt, checks: [{ nodeUrl: 'https://node.test', resourceUuid: 'a', url: 'https://app.test', httpStatus: 503, checkedAt }] }),
        checkEndpoints: async () => { __nativePanelCalls.probes++; return { checks: [{ providerId: 'fixture', url: 'https://app.test', httpStatus: 200, checkedAt }], pending: 0 }; },
        openExternal: async () => true
      };
      App.nativePanelController?.close();
      localStorage.removeItem('gitfinder.native-panel.v1');
      App.nativePanelController = new NativePanelController(document.getElementById('xiangshu-panel-view'), api, () => {});
      App.switchView('panel');
    })()`);
    // Waiting for the existing async IPC-shaped fixture promises, not network.
    const result = await evaluate(`(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      const view = document.getElementById('xiangshu-panel-view');
      const text = view.innerText;
      return { rows: view.querySelectorAll('tbody tr').length, text, calls: __nativePanelCalls,
        lights: [...view.querySelectorAll('.native-panel-lamp')].map(n => n.className),
        scrollable: view.querySelector('.native-panel-content').clientHeight > 100 };
    })()`);
    assert.equal(result.rows, 2);
    assert.equal(result.calls.refresh, 0);
    assert.equal(result.calls.probes, 0);
    assert.equal(result.scrollable, true);
    assert.deepEqual(result.lights.sort(), ['gray', 'gray', 'green', 'red', 'red', 'yellow'].map(color => 'native-panel-lamp lamp-' + color).sort());
    assert.match(result.text, /需授权访问/);
    assert.match(result.text, /HTTP 503/);
    const interactions = await evaluate(`(async () => {
      const controller = App.nativePanelController;
      const view = controller.container;
      const nodeChoice = view.querySelector('.native-panel-choices input');
      nodeChoice.click();
      const selected = controller.filters.nodes.length;
      nodeChoice.click();
      controller.search.value = '示例'; controller.search.dispatchEvent(new Event('input'));
      const filtered = view.querySelectorAll('tbody tr').length;
      [...view.querySelectorAll('button')].find(b => b.textContent === '检测本机' && !b.disabled).click();
      await Promise.resolve(); await Promise.resolve();
      const localGreen = [...view.querySelectorAll('.lamp-green')].some(n => n.textContent.startsWith('本机'));
      controller.layoutButton.click();
      const cards = view.querySelectorAll('article').length;
      controller.close(); controller.open();
      await new Promise(resolve => setTimeout(resolve, 20));
      return { selected, filtered, cards, localGreen, retainedQuery: controller.search.value, probes: __nativePanelCalls.probes };
    })()`);
    assert.deepEqual(interactions, { selected: 1, filtered: 1, cards: 1, localGreen: true, retainedQuery: '示例', probes: 1 });
    const themes = await evaluate(`(() => {
      const html = document.documentElement;
      const previous = ['data-effective-mode', 'data-scheme', 'data-reminder'].map(key => [key, html.getAttribute(key)]);
      const output = [];
      for (const mode of ['light', 'dark']) for (const scheme of ['github', 'onedark', 'dracula', 'monokai', 'solarized', 'nord', 'muted']) {
        html.setAttribute('data-effective-mode', mode); html.setAttribute('data-scheme', scheme);
        const controller = App.nativePanelController;
        const view = controller.container;
        const rootStyle = getComputedStyle(html);
        const primary = rootStyle.getPropertyValue('--bg-primary').trim();
        // Resolve theme colors through a DOM swatch, independent of hex/rgb spelling.
        const swatch = document.createElement('span'); swatch.style.background = primary; view.append(swatch);
        const expected = getComputedStyle(swatch).backgroundColor;
        const card = getComputedStyle(view.querySelector('article')).backgroundColor;
        const input = getComputedStyle(controller.search).backgroundColor;
        const popover = getComputedStyle(view.querySelector('.native-panel-choices')).backgroundColor;
        controller.layoutButton.click();
        const table = getComputedStyle(view.querySelector('table')).backgroundColor;
        controller.layoutButton.click();
        swatch.remove();
        output.push({ mode, scheme, matches: [card, input, popover, table].every(color => color === expected) });
      }
      const statusColors = [];
      for (const reminder of ['classic', 'vivid', 'soft', 'colorblind']) {
        html.setAttribute('data-reminder', reminder);
        const node = document.querySelector('.native-panel-lamp.lamp-green');
        statusColors.push(getComputedStyle(node, '::before').backgroundColor);
      }
      for (const [key, value] of previous) { if (value === null) html.removeAttribute(key); else html.setAttribute(key, value); }
      return { variants: output, reminderColors: statusColors };
    })()`);
    assert.equal(themes.variants.length, 14);
    assert.ok(themes.variants.every(item => item.matches), JSON.stringify(themes));
    assert.equal(new Set(themes.reminderColors).size, 4);
    console.log(JSON.stringify({ ok: true, rows: result.rows, interactions, themeVariants: themes.variants.length, reminderVariants: themes.reminderColors.length }));
  } finally { socket.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
