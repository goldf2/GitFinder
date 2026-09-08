const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
const stylesheetPath = path.join(projectRoot, 'src/renderer/styles/apple-ui.css');
const entryCss = fs.existsSync(stylesheetPath) ? fs.readFileSync(stylesheetPath, 'utf8') : '';
const moduleNames = ['tokens.css', 'app-shell.css', 'settings-board.css'];
const modules = Object.fromEntries(moduleNames.map(name => {
  const modulePath = path.join(projectRoot, 'src/renderer/styles/apple-ui', name);
  return [name, fs.existsSync(modulePath) ? fs.readFileSync(modulePath, 'utf8') : ''];
}));
const css = Object.values(modules).join('\n');

test('Apple 风格基础层在主题之后以单入口、三个有序职责模块加载', () => {
  assert.ok(fs.existsSync(stylesheetPath), '缺少 Apple 风格基础样式表');
  assert.ok(html.indexOf('styles/theme.css') < html.indexOf('styles/apple-ui.css'));
  assert.deepEqual(
    [...entryCss.matchAll(/@import url\('([^']+)'\)/g)].map(match => match[1]),
    moduleNames.map(name => `./apple-ui/${name}`)
  );
  for (const [name, source] of Object.entries(modules)) {
    assert.ok(source, `缺少 Apple 风格职责模块：${name}`);
    assert.ok(source.split('\n').length <= 220, `${name} 应继续保持轻量`);
  }
});

test('Apple 风格 tokens 复用现有主题色并提供系统设计基础', () => {
  const tokens = modules['tokens.css'];
  for (const token of [
    '--ui-font-family',
    '--ui-radius-control',
    '--ui-radius-surface',
    '--ui-material-toolbar',
    '--ui-material-sidebar',
    '--ui-material-surface',
    '--ui-shadow-surface',
    '--ui-focus-ring',
    '--ui-motion-fast',
    '--ui-disabled-opacity'
  ]) assert.match(tokens, new RegExp(token));
  assert.match(tokens, /var\(--bg-secondary\)/);
  assert.match(tokens, /var\(--accent-primary\)/);
});

test('应用外壳、设置和白板工具条共用同一材质与交互态基础', () => {
  assert.match(modules['app-shell.css'], /:is\(\.toolbar, \.workspace-tab-strip, \.status-bar, \.relationship-toolbar\)/);
  assert.match(modules['app-shell.css'], /\.sidebar\s*\{[^}]*background:\s*var\(--ui-material-sidebar\)/s);
  assert.match(modules['settings-board.css'], /\.app-settings-layout\s*\{[^}]*border-radius:\s*var\(--ui-radius-surface\)/s);
  assert.match(modules['tokens.css'], /:where\([\s\S]*?\.toolbar button[\s\S]*?\.btn[\s\S]*?\.relationship-toolbar button[\s\S]*?\)/);
  assert.match(css, /:focus-visible[^}]*box-shadow:\s*var\(--ui-focus-ring\)/s);
  assert.match(modules['tokens.css'], /&:active:not\(:disabled\)[^}]*transform:\s*scale\(var\(--ui-pressed-scale\)\)/s);
  assert.match(modules['tokens.css'], /&:disabled[^}]*opacity:\s*var\(--ui-disabled-opacity\)/s);
  assert.doesNotMatch(css, /(^|\n)button\s*\{/);
});

test('深色、减少动效、减少透明度和增强对比度均有明确回退', () => {
  assert.match(modules['tokens.css'], /\[data-effective-mode="dark"\]/);
  assert.match(modules['tokens.css'], /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*\(prefers-reduced-transparency:\s*reduce\)/);
  assert.match(modules['tokens.css'], /@media\s*\(prefers-contrast:\s*more\)/);
  assert.match(modules['tokens.css'], /prefers-reduced-motion:[\s\S]*?transform:\s*none\s*!important/s);
  assert.match(css, /prefers-reduced-transparency:[\s\S]*?backdrop-filter:\s*none/s);
});
