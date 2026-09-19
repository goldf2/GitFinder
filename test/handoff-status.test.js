const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateTracker, renderProgress, run, REQUIRED_DOCS, SOURCE, REPORT } = require('../scripts/handoff-status');

function tracker() {
  return { schemaVersion: 1, updatedAt: '2026-09-16T16:00:00+08:00', scope: '测试范围，不表示整体完成度',
    baseline: { version: '2.0.0-alpha.193', sourceCommit: 'a'.repeat(40), evidence: 'docs/record.md' },
    nextTaskId: 'GF-TEST-001', milestones: [{ id: 'GF-P0', title: '测试阶段' }], tasks: [{
      id: 'GF-TEST-001', milestone: 'GF-P0', title: '测试任务', priority: 'P1', status: 'ready', owner: 'unassigned',
      updatedAt: '2026-09-16T15:00:00+08:00', dependsOn: [], sourcePaths: ['src/main.js'], acceptance: ['真实验收'],
      evidence: [], nextAction: '运行独立测试', blocker: '', delivery: null, userAcceptance: 'not_required'
    }] };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitfinder-handoff-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => { const p = path.join(root, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
  for (const name of [...REQUIRED_DOCS, 'docs/record.md', 'src/main.js']) write(name, '# 测试\n');
  write('docs/00-handoff/CURRENT_STATE.md', '<!-- BEGIN CURRENT_STATE -->\nGF-TEST-001\n<!-- END CURRENT_STATE -->\n');
  write('docs/00-handoff/NEXT_ACTIONS.md', '<!-- BEGIN NEXT_ACTIONS -->\nGF-TEST-001\n<!-- END NEXT_ACTIONS -->\n');
  const data = tracker(); write(SOURCE, JSON.stringify(data, null, 2));
  return { root, data, write };
}

test('合法台账保留计划与交付区别，生成结果确定且无整体完成百分比', t => {
  const { root, data } = fixture(t);
  assert.deepEqual(validateTracker(data, root), []);
  const before = structuredClone(data), markdown = renderProgress(data);
  assert.equal(renderProgress(data), markdown); assert.deepEqual(data, before);
  assert.match(markdown, /GF-TEST-001/); assert.match(markdown, /可开始/);
  assert.doesNotMatch(markdown, /\d+%/);
});
test('拒绝重复任务ID和未知阶段', t => {
  const { root, data } = fixture(t); data.tasks.push({ ...data.tasks[0], milestone: 'GF-NO' });
  assert.match(validateTracker(data, root).join('\n'), /重复任务/);
  assert.match(validateTracker(data, root).join('\n'), /未知阶段/);
});
test('未知依赖、自依赖与依赖环均被拒绝', t => {
  const { root, data } = fixture(t);
  data.tasks[0].status = 'planned'; data.tasks[0].dependsOn = ['GF-NO-001'];
  assert.match(validateTracker(data, root).join('\n'), /未知依赖/);
  data.tasks[0].dependsOn = ['GF-TEST-001'];
  assert.match(validateTracker(data, root).join('\n'), /自依赖|依赖环/);
  data.tasks.push({ ...data.tasks[0], id: 'GF-TEST-002', dependsOn: ['GF-TEST-001'] });
  data.tasks[0].dependsOn = ['GF-TEST-002'];
  assert.match(validateTracker(data, root).join('\n'), /依赖环/);
});
test('尚未交付的依赖不能被标成可以开始', t => {
  const { root, data } = fixture(t);
  data.tasks.push({ ...data.tasks[0], id: 'GF-TEST-002', status: 'planned' });
  data.tasks[0].dependsOn = ['GF-TEST-002'];
  assert.match(validateTracker(data, root).join('\n'), /依赖未交付/);
});
test('开发中要认领，阻塞/暂缓要给出恢复条件', t => {
  const { root, data } = fixture(t); data.tasks[0].status = 'in_progress';
  assert.match(validateTracker(data, root).join('\n'), /负责人/);
  for (const status of ['blocked', 'deferred']) { data.tasks[0].status = status; assert.match(validateTracker(data, root).join('\n'), /blocker/); }
});
test('已交付必须有证据和真实格式的版本/完整commit字段', t => {
  const { root, data } = fixture(t); data.tasks[0].status = 'delivered';
  assert.match(validateTracker(data, root).join('\n'), /证据/);
  data.tasks[0].evidence = ['docs/record.md']; data.tasks[0].delivery = { version: 'v-next', sourceCommit: '123' };
  assert.match(validateTracker(data, root).join('\n'), /delivery/);
});
test('拒绝缺失路径、绝对路径和目录穿越', t => {
  const { root, data } = fixture(t);
  for (const value of ['src/missing.js', '/private/data', '../outside', 'src/../outside', 'C:\\secret']) {
    data.tasks[0].sourcePaths = [value]; assert.ok(validateTracker(data, root).length > 0, value);
  }
});
test('拒绝省略时区、非法状态、无验收和不存在的下一任务', t => {
  const { root, data } = fixture(t);
  data.updatedAt = '2026-09-16'; data.tasks[0].status = 'finished'; data.tasks[0].acceptance = []; data.nextTaskId = 'GF-MISSING-001';
  const errors = validateTracker(data, root).join('\n');
  for (const pattern of [/时区/, /状态/, /acceptance/, /下一任务/]) assert.match(errors, pattern);
});
test('空值与错误数组结构给出校验错误而非崩溃', t => {
  const { root, data } = fixture(t);
  for (const value of [null, [], {}, { ...data, tasks: [null] }, { ...data, milestones: [null] }]) {
    assert.ok(validateTracker(value, root).length > 0);
  }
});
test('生成不会修改任务源，check不写文件且识别过期看板', t => {
  const { root } = fixture(t); const source = fs.readFileSync(path.join(root, SOURCE));
  run(root, ['--write'], () => {});
  assert.deepEqual(fs.readFileSync(path.join(root, SOURCE)), source);
  const report = fs.readFileSync(path.join(root, REPORT)); run(root, ['--check'], () => {});
  assert.deepEqual(fs.readFileSync(path.join(root, REPORT)), report);
  fs.writeFileSync(path.join(root, REPORT), report.toString().replace(/\n/g, '\r\n'));
  run(root, ['--check'], () => {});
  fs.appendFileSync(path.join(root, REPORT), '\n手改\n');
  assert.throws(() => run(root, ['--check'], () => {}), /看板已过期/);
});
test('检查缺失文档和失效本地链接', t => {
  const { root, write } = fixture(t);
  write(REQUIRED_DOCS[0], '[missing](no-such-document.md)');
  assert.throws(() => run(root, ['--write'], () => {}), /链接/);
  fs.unlinkSync(path.join(root, REQUIRED_DOCS[0]));
  assert.throws(() => run(root, ['--check'], () => {}), /缺少/);
});
test('下一任务必须出现在两个当前有效块，历史提及不算', t => {
  const { root, write } = fixture(t);
  write('docs/00-handoff/NEXT_ACTIONS.md', '<!-- BEGIN NEXT_ACTIONS -->\n旧任务\n<!-- END NEXT_ACTIONS -->\nGF-TEST-001');
  assert.throws(() => run(root, ['--write'], () => {}), /下一任务/);
});
test('未知命令参数不会写文件', t => {
  const { root } = fixture(t);
  assert.throws(() => run(root, ['--complete'], () => {}), /用法/);
  assert.equal(fs.existsSync(path.join(root, REPORT)), false);
});

test('工程进度台账不打进macOS应用运行资源', () => {
  const { ignoredSource } = require('../scripts/package-mac');
  assert.ok(ignoredSource.test('/management/development-tasks.json'));
  assert.ok(ignoredSource.test('/management/README.md'));
});

test('文档中的仓库内目录链接允许尾部斜线', t => {
  const { root, write } = fixture(t);
  write('AGENTS.md', '[资料目录](docs/)\n');
  assert.doesNotThrow(() => run(root, ['--write'], () => {}));
});
