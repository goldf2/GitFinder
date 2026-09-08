const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { Controller, detailForState, presentationForState } = require('../src/renderer/scripts/updateController');

test('更新按钮状态覆盖检查、下载和安装三个阶段', () => {
  assert.deepEqual(presentationForState({ enabled: true, phase: 'idle' }), {
    label: '检查更新',
    title: '手动检查软件更新',
    disabled: false,
    tone: '',
  });
  assert.equal(presentationForState({ enabled: true, phase: 'checking' }).label, '正在检查…');
  assert.equal(presentationForState({ enabled: true, phase: 'available', availableVersion: '2.0.0-alpha.87' }).label, '下载 2.0.0-alpha.87');
  assert.equal(presentationForState({ enabled: true, phase: 'downloading', progress: 42.4 }).label, '下载中 42%');
  assert.equal(presentationForState({ enabled: true, phase: 'downloaded' }).label, '重启并安装');
});

test('更新不可用时说明具体原因并禁用按钮', () => {
  assert.deepEqual(presentationForState({ enabled: false, reason: 'development' }), {
    label: '开发模式',
    title: '开发模式不会请求在线更新',
    disabled: true,
    tone: 'disabled',
  });
  assert.equal(presentationForState({ enabled: false, reason: 'invalid-configuration' }).label, '更新配置无效');
});

test('macOS 应用菜单和 Windows 帮助菜单都提供检查更新入口', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'main.js'), 'utf8');
  const renderer = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/scripts/app.js'), 'utf8');
  assert.match(source, /label: '检查更新…'/);
  assert.match(source, /sendShortcut\('check-for-updates'\)/);
  assert.match(source, /label: '帮助'/);
  assert.match(renderer, /action === 'check-for-updates'/);
  assert.match(renderer, /action === 'open-update-settings'/);
});

test('更新设置提供自动检查开关并明确下载前需要确认', () => {
  const controller = new Controller({ bridge: {}, document: {} });
  const markup = controller.settingsMarkup();

  assert.match(markup, /id="settings-update-auto-check"/);
  assert.match(markup, /data-update-auto-check/);
  assert.match(markup, /下载前会再次征求确认/);
});

test('无可用更新时显示线上版本，更新错误保留错误码', () => {
  assert.equal(presentationForState({ enabled: true, phase: 'up-to-date' }).label, '没有可用更新');
  assert.equal(detailForState({ feedHost: 'oaktechz.com', remoteVersion: '2.0.0-alpha.86' }), '更新源：oaktechz.com · 线上版本 v2.0.0-alpha.86');
  assert.equal(detailForState({ errorCode: 'ERR_NETWORK', error: '连接失败' }), '[ERR_NETWORK] 连接失败');
});
