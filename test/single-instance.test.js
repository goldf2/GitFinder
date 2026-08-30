const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');

test('桌面 App 使用单实例锁，重复启动只恢复并聚焦现有窗口', () => {
  assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/);
  assert.match(mainSource, /app\.on\('second-instance'/);
  assert.match(mainSource, /BrowserWindow\.getFocusedWindow\(\)[\s\S]*?BrowserWindow\.getAllWindows\(\)/);
  assert.match(mainSource, /targetWindow\.isMinimized\(\)[\s\S]*?targetWindow\.restore\(\)/);
  assert.match(mainSource, /targetWindow\.isVisible\(\)[\s\S]*?targetWindow\.show\(\)/);
  assert.match(mainSource, /targetWindow\.focus\(\)/);
  assert.match(mainSource, /if \(!hasSingleInstanceLock\) return;/);
});

test('macOS 源码运行时使用正式 GitFinder 图标而不是 Electron 默认图标', () => {
  assert.match(mainSource, /process\.platform === 'darwin' && isDev && app\.dock/);
  assert.match(mainSource, /app\.dock\.setIcon\(path\.join\(__dirname, 'public', 'icon\.png'\)\)/);
});
