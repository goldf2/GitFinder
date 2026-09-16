#!/usr/bin/env node
'use strict';
// Repository-only progress validation. Never runs tests, mutates task states,
// reads user profiles, calls a network service, or declares a task complete.
const fs = require('node:fs');
const path = require('node:path');
const SOURCE = 'management/development-tasks.json';
const REPORT = 'docs/00-handoff/PROGRESS.md';
const REQUIRED_DOCS = Object.freeze([
  'AGENTS.md', 'README.md', 'CONTEXT.md', 'docs/00-handoff/RELEASE_CHECKLIST.md',
  'docs/00-handoff/README.md', 'docs/00-handoff/DEVELOPMENT_PLAN.md',
  'docs/00-handoff/HANDOFF_PROTOCOL.md', 'docs/00-handoff/RUNBOOK.md',
  'docs/00-handoff/CURRENT_STATE.md', 'docs/00-handoff/NEXT_ACTIONS.md',
  'management/README.md'
]);
const STATUS = Object.freeze({ planned: '计划中', ready: '可开始', in_progress: '开发中', blocked: '阻塞', verified: '已验证', delivered: '已交付', deferred: '暂缓' });
const ACCEPTANCE = Object.freeze({ pending: '待用户反馈', confirmed: '用户已确认', not_required: '不要求用户确认' });
const ID = /^GF-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const SHA = /^[a-f0-9]{40}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

function safeExistingPath(root, relative) {
  if (!text(relative) || relative.includes('\\') || relative.includes('\0') || relative.includes(':')
    || path.posix.isAbsolute(relative) || relative.split('/').some(p => !p || p === '.' || p === '..')) return false;
  try {
    const resolved = fs.realpathSync(path.resolve(root, relative));
    const boundary = path.relative(fs.realpathSync(root), resolved);
    return boundary !== '..' && !boundary.startsWith(`..${path.sep}`) && !path.isAbsolute(boundary);
  } catch { return false; }
}

function validateTracker(data, root) {
  const errors = [];
  if (!object(data)) return ['任务源必须是JSON对象'];
  if (data.schemaVersion !== 1) errors.push('不支持的schemaVersion');
  if (!timestamp(data.updatedAt)) errors.push('updatedAt必须是带时区的ISO时间');
  if (!text(data.scope)) errors.push('scope不能为空');
  if (!object(data.baseline) || !VERSION.test(data.baseline.version) || !SHA.test(data.baseline.sourceCommit)
    || !safeExistingPath(root, data.baseline.evidence)) errors.push('baseline需要版本、完整commit及存在的证据路径');
  if (!Array.isArray(data.milestones) || !data.milestones.length) errors.push('milestones必须为非空数组');
  const phases = new Set();
  for (const m of Array.isArray(data.milestones) ? data.milestones : []) {
    if (!object(m) || !ID.test(m.id) || !text(m.title)) { errors.push('阶段字段无效'); continue; }
    if (phases.has(m.id)) errors.push(`重复阶段: ${m.id}`);
    phases.add(m.id);
  }
  if (!Array.isArray(data.tasks) || !data.tasks.length) return [...errors, 'tasks必须为非空数组'];
  const tasks = new Map();
  for (const task of data.tasks) {
    if (!object(task)) { errors.push('任务字段必须是对象'); continue; }
    const label = text(task.id) ? task.id : '未命名任务';
    if (!ID.test(task.id)) errors.push(`${label}: id无效`);
    if (tasks.has(task.id)) errors.push(`重复任务: ${label}`);
    tasks.set(task.id, task);
    if (!phases.has(task.milestone)) errors.push(`${label}: 未知阶段`);
    if (!text(task.title) || !text(task.owner) || !text(task.nextAction)) errors.push(`${label}: 标题/负责人/下一动作不能为空`);
    if (!['P0', 'P1', 'P2', 'P3'].includes(task.priority)) errors.push(`${label}: priority无效`);
    if (!Object.hasOwn(STATUS, task.status)) errors.push(`${label}: 状态无效`);
    if (!Object.hasOwn(ACCEPTANCE, task.userAcceptance)) errors.push(`${label}: userAcceptance无效`);
    if (!timestamp(task.updatedAt)) errors.push(`${label}: updatedAt必须带时区`);
    else if (timestamp(data.updatedAt) && Date.parse(task.updatedAt) > Date.parse(data.updatedAt)) errors.push(`${label}: 任务时间晚于台账更新时间`);
    if (task.status === 'in_progress' && task.owner === 'unassigned') errors.push(`${label}: 开发中必须填写负责人`);
    if (['blocked', 'deferred'].includes(task.status) && !text(task.blocker)) errors.push(`${label}: 必须填写blocker和恢复条件`);
    for (const field of ['dependsOn', 'sourcePaths', 'acceptance', 'evidence']) {
      const items = task[field];
      if (!Array.isArray(items) || items.some(item => !text(item))) { errors.push(`${label}: ${field}必须是字符串数组`); continue; }
      if (new Set(items).size !== items.length) errors.push(`${label}: ${field}包含重复项`);
      if (['sourcePaths', 'acceptance'].includes(field) && !items.length) errors.push(`${label}: ${field}不能为空`);
      if (['sourcePaths', 'evidence'].includes(field)) for (const relative of items) {
        if (!safeExistingPath(root, relative)) errors.push(`${label}: 无效或缺失路径 ${relative}`);
      }
    }
    if (['verified', 'delivered'].includes(task.status) && !task.evidence?.length) errors.push(`${label}: 已验证/交付必须有证据`);
    if (task.status === 'delivered' && (!object(task.delivery) || !VERSION.test(task.delivery.version) || !SHA.test(task.delivery.sourceCommit))) errors.push(`${label}: delivery需要有效版本与完整40位源码commit`);
  }
  for (const [id, task] of tasks) for (const dependency of Array.isArray(task.dependsOn) ? task.dependsOn : []) {
    if (dependency === id) errors.push(`${id}: 禁止自依赖`);
    if (!tasks.has(dependency)) errors.push(`${id}: 未知依赖 ${dependency}`);
    else if (['ready', 'in_progress', 'verified', 'delivered'].includes(task.status) && tasks.get(dependency).status !== 'delivered') errors.push(`${id}: 依赖未交付 ${dependency}`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`依赖环包含 ${id}`); return; }
    if (visited.has(id) || !tasks.has(id)) return;
    visiting.add(id);
    for (const dep of Array.isArray(tasks.get(id).dependsOn) ? tasks.get(id).dependsOn : []) visit(dep);
    visiting.delete(id); visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  const next = tasks.get(data.nextTaskId);
  if (!next || ['delivered', 'deferred'].includes(next.status)) errors.push('下一任务不存在、已交付或仍被暂缓');
  return errors;
}

function escape(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/`/g, '&#96;').replace(/[\r\n]+/g, ' '); }
function link(relative) {
  const target = path.posix.relative(path.posix.dirname(REPORT), relative).split('/').map(encodeURIComponent).join('/');
  return `[${escape(relative)}](${target})`;
}
function renderProgress(data) {
  const lines = ['# GitFinder 开发进度看板', '', '> 自动生成。只编辑 `management/development-tasks.json`，然后执行 `npm run handoff:update`。', '',
    `更新时间：${escape(data.updatedAt)}。${escape(data.scope)}`, '',
    `核验基线：${escape(data.baseline.version)} / \`${data.baseline.sourceCommit}\`；证据：${link(data.baseline.evidence)}。`, '',
    `**唯一下一任务：${escape(data.nextTaskId)}**`, '', '## 阶段汇总', '', '| 阶段 | 纳入任务 | 已交付 | 开发中/已验证 | 阻塞/暂缓 |', '| --- | ---: | ---: | ---: | ---: |'];
  for (const phase of data.milestones) {
    const items = data.tasks.filter(t => t.milestone === phase.id), count = states => items.filter(t => states.includes(t.status)).length;
    lines.push(`| ${phase.id} ${escape(phase.title)} | ${items.length} | ${count(['delivered'])} | ${count(['in_progress', 'verified'])} | ${count(['blocked', 'deferred'])} |`);
  }
  lines.push('', '以上是本清单任务计数，不代表产品整体完成度。交付与用户反馈分别记录；脚本不会判定验收真假。', '',
    '## 任务列表', '', '| 编号 | 优先级 | 状态 | 负责人 | 任务 |', '| --- | --- | --- | --- | --- |');
  for (const t of data.tasks) lines.push(`| ${t.id} | ${t.priority} | ${STATUS[t.status]} | ${escape(t.owner)} | ${escape(t.title)} |`);
  lines.push('', '## 可执行任务卡', '');
  for (const t of data.tasks) {
    lines.push(`### ${t.id} · ${escape(t.title)}`, '',
      `阶段：${t.milestone}；优先级：${t.priority}；状态：**${STATUS[t.status]}**；负责人：${escape(t.owner)}；用户验收：${ACCEPTANCE[t.userAcceptance]}。`, '',
      `更新：${escape(t.updatedAt)}。依赖：${t.dependsOn.length ? t.dependsOn.join('、') : '无'}。`, '',
      '**验收标准**', ...t.acceptance.map((a, i) => `${i + 1}. ${escape(a)}`), '',
      `**接续动作：** ${escape(t.nextAction)}`, '', `源码/设计入口：${t.sourcePaths.map(link).join('；')}。`, '',
      `证据：${t.evidence.length ? t.evidence.map(link).join('；') : '尚无本任务完成证据；源码文件存在不表示验收通过。'}`);
    if (t.blocker) lines.push('', `**阻塞/暂缓原因：** ${escape(t.blocker)}`);
    if (t.delivery) lines.push('', `交付：${escape(t.delivery.version)}；源码 \`${escape(t.delivery.sourceCommit)}\`。`);
    lines.push('');
  }
  return lines.join('\n');
}

function currentBlock(content, marker) {
  const begin = `<!-- BEGIN ${marker} -->`, end = `<!-- END ${marker} -->`;
  if (content.split(begin).length !== 2 || content.split(end).length !== 2 || content.indexOf(end) <= content.indexOf(begin)) throw new Error(`${marker}: 缺少或重复有效块标记`);
  return content.slice(content.indexOf(begin) + begin.length, content.indexOf(end));
}
function validateDocuments(root, nextTaskId) {
  const errors = [];
  for (const relative of REQUIRED_DOCS) {
    if (!safeExistingPath(root, relative)) { errors.push(`缺少接续文档 ${relative}`); continue; }
    let content = fs.readFileSync(path.join(root, relative), 'utf8');
    const marker = relative.endsWith('/CURRENT_STATE.md') ? 'CURRENT_STATE' : relative.endsWith('/NEXT_ACTIONS.md') ? 'NEXT_ACTIONS' : '';
    if (marker) {
      try { content = currentBlock(content, marker); } catch (error) { errors.push(error.message); continue; }
      if (!content.includes(nextTaskId)) errors.push(`${relative}: 下一任务未出现在当前有效块`);
    }
    // Validate file targets, not anchors or external URLs. Ignore fenced examples.
    content = content.replace(/```[^]*?```/g, '');
    for (const match of content.matchAll(/\[[^\]\n]+\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1];
      if (/^(?:https?:|mailto:|#)/i.test(href)) continue;
      try {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), decodeURIComponent(href.split('#')[0]))).replace(/\/+$/, '');
        // The generated report is validated separately and may not yet exist on --write.
        if (target !== REPORT && !safeExistingPath(root, target)) errors.push(`${relative}: 无效本地链接 ${href}`);
      } catch { errors.push(`${relative}: 无效链接编码 ${href}`); }
    }
  }
  return errors;
}

function run(root, args = [], output = console.log) {
  if (args.length > 1 || (args.length === 1 && !['--write', '--check'].includes(args[0]))) throw new Error('用法: node scripts/handoff-status.js [--write|--check]');
  const source = path.join(root, SOURCE);
  if (!safeExistingPath(root, SOURCE) || !safeExistingPath(root, path.posix.dirname(REPORT))) throw new Error('任务源或看板目录必须位于当前仓库内');
  if (fs.statSync(source).size > 2 * 1024 * 1024) throw new Error('任务源超过2MB限制');
  const data = JSON.parse(fs.readFileSync(source, 'utf8'));
  const errors = validateTracker(data, root);
  if (!errors.length) errors.push(...validateDocuments(root, data.nextTaskId));
  if (errors.length) throw new Error(errors.join('\n'));
  const expected = renderProgress(data), target = path.join(root, REPORT);
  if (args[0] === '--write') {
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('看板不能是符号链接');
    const temporary = `${target}.${process.pid}.tmp`;
    try { fs.writeFileSync(temporary, expected, { flag: 'wx' }); fs.renameSync(temporary, target); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    output(`已生成 ${REPORT}；任务状态未修改。`);
  } else if (args[0] === '--check') {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) throw new Error('看板已过期或缺失，请运行 npm run handoff:update');
    output(`接续检查通过：${data.tasks.length}项任务，${data.milestones.length}个阶段；记录一致性不等于实际验收。`);
  } else {
    output(`下一任务: ${data.nextTaskId}\n基线: ${data.baseline.version}\n更新时间: ${data.updatedAt}`);
    for (const [key, label] of Object.entries(STATUS)) output(`${label}: ${data.tasks.filter(t => t.status === key).length}`);
    for (const t of data.tasks.filter(t => ['in_progress', 'blocked'].includes(t.status))) output(`${t.id} ${STATUS[t.status]} — ${t.nextAction}`);
  }
  return data;
}
if (require.main === module) {
  try { run(path.resolve(__dirname, '..'), process.argv.slice(2)); }
  catch (error) { console.error(`接续检查失败：${error.message}`); process.exitCode = 1; }
}
module.exports = { validateTracker, renderProgress, validateDocuments, run, REQUIRED_DOCS, SOURCE, REPORT };
