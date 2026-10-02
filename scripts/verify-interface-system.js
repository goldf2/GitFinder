#!/usr/bin/env node
// Geometry and navigation acceptance in a disposable Electron profile. Never opens the user's profile.
// Run from source, or pass --app /path/to/packaged/executable. Screenshots require human review.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const dimensions = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 800, height: 740 }];

function createFixture(profile) {
  const managed = path.join(profile, 'projects');
  fs.mkdirSync(managed, { recursive: true });
  const names = ['shop-web', 'shop-api', 'media-workbench', 'research-lab', 'desktop-tools', 'independent'];
  const titles = ['在线商城 · 用户端', '在线商城 · 订单与支付服务', '素材工作台：检索、预览与内容创作', '投资研究', '桌面开发工具', '独立仓库'];
  const descriptions = [
    '为客户提供商品浏览、购物车、订单跟踪与售后服务。',
    '订单、库存与支付回调服务。'.repeat(12),
    '管理本地素材和创作记录，在一个工作区完成内容检索。',
    '',
    '日常开发工具。',
    '没有项目属性的普通 Git 仓库仍然可以浏览和进入工作区。'
  ];
  const repositories = names.map((name, index) => {
    const directory = path.join(managed, name);
    fs.mkdirSync(directory);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', directory]);
    fs.writeFileSync(path.join(directory, 'README.md'), `# ${titles[index]}\n\n${descriptions[index]}\n\n## 使用说明\n\n通过左侧列表选择内容，在主区域阅读和编辑。\n`);
    fs.writeFileSync(path.join(directory, 'index.txt'), 'Original fixture data\n');
    if (index < 5) {
      fs.mkdirSync(path.join(directory, '.gitfinder'));
      const digit = String(index + 1);
      fs.writeFileSync(path.join(directory, '.gitfinder/project.json'), JSON.stringify({
        schemaVersion: 1,
        projectId: `project_${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`,
        name: titles[index], description: descriptions[index], color: ['blue', 'green', 'purple', 'orange', 'blue'][index],
        lifecycle: ['active', 'maintenance', 'active', 'planned', 'paused'][index], repositories: { excluded: [] }
      }));
    }
    execFileSync('git', ['-C', directory, 'add', '.']);
    execFileSync('git', ['-C', directory, '-c', 'user.name=UI Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Initialize fixture']);
    return directory;
  });
  const target = repositories[0];
  const documents = {
    'docs/00-handoff/CURRENT_STATE.md': '# 当前进展\n\n订单结算流程已完成开发，正在整理测试证据。\n\n## 下一步\n\n核对验收清单并安排发布。\n',
    'docs/00-handoff/SESSION_LOG.md': '# 开发日志\n\n## 2026-10-02\n\n完成订单流程的布局和验收材料整理。\n\n### 验证记录\n\n此文档只存在于 UI 验证隔离目录中。\n',
    'docs/02-requirements/REQUIREMENTS.md': '# 商城结算需求\n\n## 使用流程\n\n1. 选择商品。\n2. 确认地址和金额。\n3. 提交订单。\n\n## 验收标准\n\n- 页面明确显示付款总额。\n- 库存不足时提供可恢复的操作。\n',
    'docs/03-design/DEVELOPMENT_PLAN.md': '# 开发方案与计划\n\n## 本期目标\n\n用户能够清晰了解订单状态。\n\n## 实施顺序\n\n先确认需求，再开发与验证，最后交付。\n',
    'docs/04-validation/TEST_PLAN.md': '# 测试与验收\n\n验证支付成功、取消和失败三条路径。\n',
    'docs/05-delivery/RELEASE_CHECKLIST.md': '# 交付清单\n\n- [ ] 核对构建版本\n- [ ] 保存测试证据\n- [ ] 确認回退路径\n',
    'docs/ai-context/conversations/fixture.md': '# 商城开发讨论\n\n先确认订单状态与异常操作，再安排实施。\n'
  };
  for (const [relative, content] of Object.entries(documents)) {
    fs.mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
    fs.writeFileSync(path.join(target, relative), content);
  }
  fs.mkdirSync(path.join(target, 'management'));
  fs.writeFileSync(path.join(target, 'management/development-tasks.json'), JSON.stringify({
    schemaVersion: 1, updatedAt: '2026-10-02T00:00:00Z', nextTaskId: 'TASK-2', tasks: [
      { id: 'TASK-1', title: '确认订单状态与取消流程', status: 'delivered', owner: '用户', nextAction: '等待下一轮反馈', acceptance: ['异常状态有明确说明'], evidence: [], dependsOn: [] },
      { id: 'TASK-2', title: '完善结算流程并整理验收证据', status: 'in_progress', owner: '开发者', nextAction: '核对订单失败后的恢复入口', acceptance: ['能返回上一步修改订单', '金额与支付状态一致'], evidence: ['docs/04-validation/TEST_PLAN.md'], dependsOn: ['TASK-1'] },
      { id: 'TASK-3', title: '处理外部支付回调的重复与延迟', status: 'blocked', owner: '开发者', blocker: '等待支付服务测试数据', nextAction: '核对测试数据', acceptance: ['重复回调不产生重复订单'], evidence: [], dependsOn: ['TASK-2'] },
      { id: 'TASK-4', title: '补充交付清单与用户使用说明', status: 'ready', owner: '开发者', nextAction: '补充已知限制', acceptance: ['交付说明包含回退方式'], evidence: [], dependsOn: [] }
    ]
  }));
  fs.writeFileSync(path.join(target, 'index.txt'), 'Changed fixture data\n');
  fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({
    treeRoots: [{ path: managed, name: '界面验证项目', expanded: true }], lastPath: managed, defaultScanPath: managed,
    autoRefresh: false, automaticUpdateChecks: false, themeMode: 'light', sidebarHidden: false,
    detailPanelHidden: false, sidebarWidth: 238, detailPanelWidth: 316, projectCardSize: 'medium'
  }));
  return { managed, repositories, target };
}

async function main() {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const output = fs.mkdtempSync(path.join(root, 'dist', 'interface-ui-'));
  const profile = path.join(output, 'profile');
  const fixture = createFixture(profile);
  const originalGit = execFileSync('git', ['-C', fixture.target, 'status', '--porcelain'], { encoding: 'utf8' });
  const originalTasks = fs.readFileSync(path.join(fixture.target, 'management/development-tasks.json'), 'utf8');
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const appArgument = process.argv.indexOf('--app');
  const executable = appArgument < 0 ? require('electron') : path.resolve(process.argv[appArgument + 1]);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const log = fs.openSync(path.join(output, 'electron.log'), 'a');
  const child = spawn(executable, [...(appArgument < 0 ? [root] : []), `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { cwd: root, env, stdio: ['ignore', log, log] });
  let socket, sequence = 0;
  const pending = new Map(), results = [], snapshots = [];
  console.log('Evidence:', output);
  try {
    let page;
    for (let count = 0; count < 150; count++) {
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(item => item.type === 'page' && item.url.endsWith('src/renderer/index.html')); } catch (_) {}
      if (page) break;
      if (child.exitCode !== null) throw Error('Fixture app exited before the renderer became available');
      await delay(100);
    }
    assert.ok(page, 'Renderer unavailable');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', event => {
      const reply = JSON.parse(event.data), request = pending.get(reply.id);
      if (!request) return;
      pending.delete(reply.id); clearTimeout(request.timer);
      reply.error ? request.reject(Error(JSON.stringify(reply.error))) : request.resolve(reply.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timeout`)); }, 25000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (reply.exceptionDetails) throw Error(JSON.stringify(reply.exceptionDetails));
      return reply.result.value;
    };
    const wait = async expression => {
      for (let attempt = 0; attempt < 200; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      throw Error(`Condition timeout: ${expression}`);
    };
    const screenshot = async filename => {
      await delay(150);
      const image = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, filename), Buffer.from(image.data, 'base64'));
    };
    const inspect = async () => evaluate(`(() => {
      const rect = selector => { const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,display:s.display,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};};
      return {viewport:{width:innerWidth,height:innerHeight},theme:document.documentElement.dataset.effectiveMode,root:rect('html'),sidebar:rect('#sidebar'),content:rect('main.content-area'),inspector:rect('#detail-panel'),toolbar:rect('.toolbar'),workspace:rect('#repository-workspace-tabs'),list:rect('.workflow-list'),reader:rect('.workflow-reader'),controls:['#sort-menu-trigger','#toggle-sidebar','#toggle-detail-panel','#search-input'].map(selector=>({selector,rect:rect(selector),hit:(()=>{const r=document.querySelector(selector).getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.outerHTML.slice(0,160)})()})),focus:document.activeElement?.outerHTML.slice(0,500)};
    })()`);
    const check = async (name, expression) => {
      const actual = await evaluate(expression);
      if (actual !== true) {
        const diagnostics = await inspect();
        await screenshot('failure.png');
        fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ name, actual, diagnostics }, null, 2));
        console.error('CHECK_DIAGNOSTICS', JSON.stringify({ name, actual, diagnostics }));
      }
      assert.equal(actual, true, name); results.push(name); console.log('PASS', name);
    };
    const click = async (selector, count = 1) => {
      const point = await evaluate(`(() => {
        const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)throw Error('Unavailable control: '+${JSON.stringify(selector)});
        el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
        if(!r.width||!r.height||x<0||x>innerWidth||y<0||y>innerHeight||!(hit===el||el.contains(hit)))throw Error('Control is clipped or obscured: '+${JSON.stringify(selector)});
        return{x,y};
      })()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: count, ...point });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: count, ...point });
    };
    const key = async (value, code, virtualCode, modifiers = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, windowsVirtualKeyCode: virtualCode, modifiers });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode: virtualCode, modifiers });
    };
    const focusCheck = async (prefix, selector) => {
      // A real Tab transition enables keyboard focus; Shift-Tab returns to the target.
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      await key('Tab', 'Tab', 9); await key('Tab', 'Tab', 9, 8);
      await check(`${prefix}键盘焦点可辨识`, `(() => {const el=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(el),r=el.getBoundingClientRect();return document.activeElement===el&&el.matches(':focus-visible')&&r.width>0&&r.height>0&&((s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=1&&s.outlineColor!=='rgba(0, 0, 0, 0)')||s.boxShadow!=='none');})()`);
    };
    const shellCheck = async prefix => {
      await check(`${prefix}页面与主区无横向溢出`, "document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#content-scroll').scrollWidth<=document.querySelector('#content-scroll').clientWidth+1");
      await check(`${prefix}标题、工具条和内容没有覆盖`, `(() => {const title=document.querySelector('.window-titlebar').getBoundingClientRect(),toolbar=document.querySelector('.toolbar').getBoundingClientRect(),main=document.querySelector('.main-container').getBoundingClientRect();return title.bottom<=toolbar.top+1&&toolbar.bottom<=main.top+1&&toolbar.right<=innerWidth+1;})()`);
      await check(`${prefix}侧栏与主区保留可用宽度`, `(() => {
        const visible=el=>getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().width>0;
        const content=document.querySelector('main.content-area').getBoundingClientRect(),left=document.querySelector('#sidebar'),right=document.querySelector('#detail-panel');
        return content.width>=319&&content.left>=0&&content.right<=innerWidth+1&&(!visible(left)||(left.getBoundingClientRect().width>=179&&left.getBoundingClientRect().right<=content.left+1))&&(!visible(right)||(right.getBoundingClientRect().width>=239&&content.right<=right.getBoundingClientRect().left+1));
      })()`);
      await check(`${prefix}工具条主要操作可命中`, `['#sort-menu-trigger','#toggle-sidebar','#toggle-detail-panel','#search-input'].every(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.width>=20&&r.height>=20&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&(hit===el||el.contains(hit));})`);
    };
    const cardCheck = async prefix => {
      await check(`${prefix}同排卡片与进入按钮对齐`, `(() => {
        const cards=[...document.querySelectorAll('#content-area .repo-card')].map(el=>({card:el.getBoundingClientRect(),button:el.querySelector('[data-app-action="open-repository-workspace"]')?.getBoundingClientRect()}));
        if(cards.length!==6||cards.some(x=>!x.button||x.card.width<220||x.button.bottom>x.card.bottom||x.button.right>x.card.right))return false;
        return cards.every((a,i)=>cards.slice(i+1).every(b=>Math.abs(a.card.top-b.card.top)>2||(Math.abs(a.card.bottom-b.card.bottom)<=2&&Math.abs(a.button.bottom-b.button.bottom)<=2)));
      })()`);
    };
    const workspaceCheck = async (prefix, view) => {
      await click(`[data-workspace-view="${view}"]`);
      await wait(view === 'tasks' ? "!!document.querySelector('[data-flow-task-form]')" : "!!document.querySelector('[data-flow-preview-body]')");
      await check(`${prefix}${view} 列表与正文独立且不覆盖`, `(() => {
        const list=document.querySelector('.workflow-list'),reader=document.querySelector('.workflow-reader'),a=list.getBoundingClientRect(),b=reader.getBoundingClientRect(),split=document.querySelector('.workflow-split').getBoundingClientRect();
        const separate=a.right<=b.left+1||a.bottom<=b.top+1||b.right<=a.left+1;
        return separate&&a.width>=120&&a.height>=75&&b.width>=220&&b.height>=180&&a.left>=split.left-1&&b.left>=split.left-1&&a.right<=split.right+1&&b.right<=split.right+1&&list.scrollWidth<=list.clientWidth+1&&reader.scrollWidth<=reader.clientWidth+1;
      })()`);
      await check(`${prefix}${view} 选择后的正文有实际内容`, view === 'tasks' ? "document.querySelector('[data-flow-task-form] [name=title]').value.includes('结算')" : "document.querySelector('[data-flow-preview-body]').textContent.trim().length>25");
      await shellCheck(`${prefix}${view} `);
      await screenshot(`${prefix}${view}.png`);
      if (view === 'tasks') {
        await click('[data-flow-task-form] details:last-of-type summary');
        await click('[data-flow-task-form] [name=dependsOn]');
        await check(`${prefix}任务末尾字段可聚焦且保存按钮可达`, "(()=>{const field=document.querySelector('[name=dependsOn]'),save=document.querySelector('[data-flow-task-form] button[type=submit]'),r=save.getBoundingClientRect();return document.activeElement===field&&r.top>=0&&r.bottom<=innerHeight&&save.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})()");
        await click('[data-flow-task-form] details:last-of-type summary');
      }

    };

    await wait("typeof App!=='undefined'&&typeof AppState!=='undefined'&&AppState.localProjects.length===5");
    await evaluate("App.applyContentPreset('all-repositories')");
    await wait("AppState.repoEnrichmentComplete===true&&AppState.visibleItems.length===6");
    const card = repository => `.repo-card[data-path="${repository}"]`;
    await check('扫描完成后主卡片显示真实分支、变更状态与最近提交', `(()=>{const card=document.querySelector('.repo-card[data-path="${fixture.target}"]');return card?.querySelector('.repo-branch-badge').textContent.includes('main')&&card.querySelector('.repo-status-label').textContent==='有变更'&&card.querySelector('.repo-last-commit').textContent.includes('Initialize fixture')&&!card.textContent.includes('读取中');})()`);

    await click('#repository-filter-trigger'); await click('#status-filter-btn');
    await click('#status-filter-dropdown input[value="dirty"]');
    await wait("AppState.visibleItems.length===1");
    await check('状态筛选影响仓库列表且不污染全局临时条件', `AppState.visibleItems[0].path===${JSON.stringify(fixture.target)}&&AppState.contentQuery.gitStatuses.includes('dirty')&&AppState.selectedStatuses.length===0`);
    await key('Escape','Escape',27); await click('#clear-all-filters');
    await wait("AppState.visibleItems.length===6");
    for (const theme of ['light', 'dark']) {
      await evaluate(`App.setMode(${JSON.stringify(theme)})`);
      for (const size of dimensions) {
        const prefix = `${theme}-${size.width}-`;
        await send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false });
        await delay(200);
        if (await evaluate("document.querySelector('#toggle-detail-panel').getAttribute('aria-expanded')==='true'")) await click('#toggle-detail-panel');
        await shellCheck(`${prefix}列表 `);
        await cardCheck(prefix);
        await click('#sort-menu-trigger');
        await wait("!document.querySelector('#sort-menu').hidden");
        await check(`${prefix}显示菜单完整位于可用窗口`, "(()=>{const r=document.querySelector('#sort-menu').getBoundingClientRect();return r.width>100&&r.left>=0&&r.right<=innerWidth+1&&r.top>=document.querySelector('.window-titlebar').getBoundingClientRect().bottom&&r.bottom<=innerHeight+1;})()");
        await screenshot(`${prefix}display-menu.png`);
        await key('Escape', 'Escape', 27); await wait("document.querySelector('#sort-menu').hidden");
        await screenshot(`${prefix}catalog.png`);
        await click('#repository-filter-trigger');
        await wait("!document.querySelector('#repository-filter-options').hidden");
        await check(`${prefix}仓库筛选面板可见且不被内容遮挡`, "(()=>{const el=document.querySelector('#repository-filter-options'),r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.bottom-12);return r.width>200&&r.left>=0&&r.right<=innerWidth&&r.bottom<innerHeight&&el.contains(hit);})()");
        await click('#filter-readme-check');
        await check(`${prefix}筛选开关生效且面板保留`, "!AppState.filterEnabled.readme&&!document.querySelector('#repository-filter-options').hidden");
        await click('#filter-readme-check');
        await focusCheck(`${prefix}筛选 `, '#filter-name-check');
        await screenshot(`${prefix}filter-panel.png`);
        await key('Escape', 'Escape', 27); await wait("document.querySelector('#repository-filter-options').hidden");

        await click('#toggle-detail-panel');
        await click(card(fixture.repositories[1]) + ' .repo-name');
        await wait(`AppState.selectedRepo?.path===${JSON.stringify(fixture.repositories[1])}`);
        await click(card(fixture.target) + ' .repo-name');
        await wait(`AppState.selectedRepo?.path===${JSON.stringify(fixture.target)}`);
        await check(`${prefix}连续单击预览且保留仓库列表`, "!AppState.workspaceRepository&&document.querySelectorAll('#content-area .repo-card').length===6&&document.querySelector('.repo-card.selected')?.getAttribute('aria-selected')==='true'&&getComputedStyle(document.querySelector('#detail-panel')).display!=='none'");
        await shellCheck(`${prefix}预览 `);
        await focusCheck(prefix, card(fixture.target));
        await screenshot(`${prefix}preview-focus.png`);
        await click(card(fixture.target) + ' [data-app-action="open-repository-workspace"]');
        await wait("!!document.querySelector('#git-workspace-view')");
        await check(`${prefix}显式进入工作区且资料栏收起`, "!!AppState.workspaceRepository&&getComputedStyle(document.querySelector('#detail-panel')).display==='none'");
        for (const view of ['planning', 'tasks', 'records']) await workspaceCheck(prefix, view);
        await focusCheck(`${prefix}工作区 `, '[data-flow-search]');
        await screenshot(`${prefix}workspace-focus.png`);
        await click('#toggle-detail-panel');
        await check(`${prefix}工作区资料栏可按需展开`, "getComputedStyle(document.querySelector('#detail-panel')).display!=='none'&&document.querySelector('#workspace-inspector').getBoundingClientRect().height>50");
        await shellCheck(`${prefix}辅助资料 `);
        await screenshot(`${prefix}workspace-inspector.png`);
        await click('#toggle-detail-panel');
        await click('[data-workspace-back]');
        await wait(`!AppState.workspaceRepository&&AppState.selectedRepo?.path===${JSON.stringify(fixture.target)}`);
        await check(`${prefix}返回恢复选中项和预览`, `document.querySelector('.repo-card.selected')?.dataset.path===${JSON.stringify(fixture.target)}&&getComputedStyle(document.querySelector('#detail-panel')).display!=='none'`);
        snapshots.push({ name: prefix, layout: await inspect() });
      }
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await click('#search-input'); await send('Input.insertText', { text: 'shop-web' });
    await wait("AppState.visibleItems.length===1");
    await click(card(fixture.target) + ' [data-app-action="open-repository-workspace"]');
    await wait("!!AppState.workspaceRepository");
    await click('[data-workspace-back]'); await wait("!AppState.workspaceRepository&&AppState.visibleItems.length===1");
    await check('明确进入及返回保留原搜索条件', "document.querySelector('#search-input').value==='shop-web'&&AppState.searchQuery==='shop-web'");
    await click(card(fixture.target) + ' .repo-name', 2); await wait("!!AppState.workspaceRepository");
    await check('双击仍可快捷进入工作区', `AppState.workspaceRepository.path===${JSON.stringify(fixture.target)}`);
    assert.equal(execFileSync('git', ['-C', fixture.target, 'status', '--porcelain'], { encoding: 'utf8' }), originalGit, 'Browsing must not change fixture Git status');
    assert.equal(fs.readFileSync(path.join(fixture.target, 'management/development-tasks.json'), 'utf8'), originalTasks, 'Browsing must not edit the task ledger');
    results.push('浏览过程未改写项目文件或任务台账');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: results.length, checks: results, viewportSnapshots: snapshots, humanReviewRequired: true }, null, 2));
    console.log('PASSED', results.length);
  } finally {
    for (const request of pending.values()) clearTimeout(request.timer);
    if (socket) socket.close();
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      for (let count = 0; count < 60 && child.exitCode === null; count++) await delay(100);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    fs.closeSync(log);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
