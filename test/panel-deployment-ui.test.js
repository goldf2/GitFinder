const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { Controller } = require('../src/renderer/scripts/panelDeploymentController');

const projectRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

function createController() {
  return new Controller({
    app: {
      escapeHtml: value => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    },
    bridge: { panel: {} },
    document: null
  });
}

test('部署面板区分未配置、未关联和已就绪状态', () => {
  const controller = createController();
  assert.match(controller._resultMarkup({ state: 'unconfigured' }, {}), /尚未连接 Xiangshu Panel/);
  assert.match(controller._resultMarkup({ state: 'reauthentication-required' }, {}), /不读取旧版钥匙串凭据/);
  assert.match(controller._resultMarkup({ state: 'unlinked', provider: { label: 'Panel' } }, { name: 'MES' }), /管理关联/);
  const ready = controller._resultMarkup({
    state: 'ready',
    provider: { label: 'Panel' },
    resources: [{
      resourceUuid: 'resource_1', name: '<MES>', type: 'application', status: 'running',
      environmentName: 'production', serverName: 'Con01', domains: ['https://mes.example.com'],
      observedAt: '2026-08-28T06:00:00.000Z', panelUrl: '', coolifyUrl: '', latencyMs: 42,
      latencyKind: 'http', branch: 'main', commit: '0123456789abcdef', recentFailure: { hasFailure: true }
    }]
  }, {});
  assert.match(ready, /panel-status-badge healthy/);
  assert.match(ready, /&lt;MES&gt;/);
  assert.match(ready, /production/);
  assert.match(ready, /Con01/);
  assert.match(ready, /42 ms/);
  assert.match(ready, /最近部署失败/);
  assert.match(ready, /main · 0123456789ab/);
});

test('设置页明确使用应用自有会话且不读取系统钥匙串', () => {
  const controller = createController();
  const fresh = controller.settingsMarkup([]);
  assert.match(fresh, /应用自有会话/);
  assert.match(fresh, /不读取系统钥匙串/);
  assert.match(fresh, /不保存 Panel 密码/);
  assert.match(fresh, /当前系统用户的文件权限保护/);
  assert.match(fresh, /可添加多个 Panel 地址/);
  const multiple = controller.settingsMarkup([
    { configured: true, providerId: 'panel_1', label: '生产 Panel', baseUrl: 'https://panel.example.com', apiVersion: '1.1' },
    { configured: false, reconnectRequired: true, providerId: 'panel_2', label: '旧 Panel', baseUrl: 'https://old.example.com' }
  ]);
  assert.match(multiple, /生产 Panel/);
  assert.match(multiple, /旧 Panel/);
  assert.match(multiple, /1 个已连接 · 2 个已保存/);
  assert.match(multiple, /data-panel-provider-id="panel_1"/);
  assert.match(multiple, /prepare-panel-reconnect/);
});

test('部署关联对话框只能通过关闭按钮或 Escape 关闭', () => {
  const source = read('src/renderer/scripts/panelDeploymentController.js');
  assert.match(source, /panel-binding-close/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.doesNotMatch(source, /overlay\.addEventListener\(['"]click/);
});

test('部署关联使用项目范围内的稳定 repositoryId 且支持多仓库', () => {
  const source = read('src/renderer/scripts/panelDeploymentController.js');
  assert.match(source, /repos\?\.getRegistry/);
  assert.match(source, /name="panel-binding-repository"/);
  assert.match(source, /repositoryIds/);
  assert.match(source, /primaryRepositoryId/);
  assert.doesNotMatch(source, /repositoryIds:\s*\[[^\]]*directoryPath/);
});

test('1.x 界面骨架包含部署详情区、Panel 设置和可信 IPC', () => {
  const html = read('src/renderer/index.html');
  const app = read('src/renderer/scripts/app.js');
  const preload = read('preload.js');
  const main = read('main.js');
  assert.match(html, /data-section-id="deployments"/);
  assert.match(html, /class="empty-state" id="empty-state"/);
  assert.match(html, /scripts\/panelDeploymentController\.js/);
  assert.match(app, /settingsMarkup\(panelConnections\)/);
  assert.match(preload, /panel:getProjectDeployments/);
  assert.match(preload, /panel:saveProjectBinding/);
  assert.match(preload, /panel:getConnections/);
  assert.match(main, /registerPanelIPC\(\)/);
});

test('Panel 数据加载不进入仓库详情主 Promise.all', () => {
  const source = read('src/renderer/scripts/repositoryDetailController.js');
  const selectBody = source.slice(source.indexOf('async select(repoPath)'), source.indexOf('showError('));
  assert.doesNotMatch(selectBody, /getProjectDeployments/);
  assert.match(source, /panelDeploymentController\?\.showRepository\(repo\)/);
});
