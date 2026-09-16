// Read-only adapters for repository-owned progress ledgers. Never execute repository code.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LEDGER_PATHS = Object.freeze(['management/development-tasks.json', 'docs/00-handoff/TASKS.json']);
const SKIP = new Set(['.git', '.gitfinder', 'node_modules', 'dist', 'build', 'coverage', 'out', 'target', '.next', '.cache', '.venv', 'venv', '临时文件', '制品与备份']);
const STATUS = Object.freeze({
  planned: ['计划中', 'info'], ready: ['可开始', 'info'], todo: ['未开始', 'info'],
  in_progress: ['开发中', 'info'], blocked: ['阻塞', 'danger'],
  verified: ['已验证，待交付', 'warning'], in_review: ['待验收', 'warning'],
  delivered: ['已交付', 'success'], done: ['已完成', 'success'], deferred: ['暂缓', 'muted']
});
const text = (value, max = 4000) => String(value ?? '').replace(/\0/g, '').slice(0, max);
const within = (candidate, root) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

class RepositoryTaskLedgerService {
  constructor(options = {}) {
    this.now = options.now || (() => new Date());
    this.maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
    this.maxDirectories = options.maxDirectories ?? 2000;
    this.maxDepth = options.maxDepth ?? 4;
    this.maxTasks = options.maxTasks ?? 5000;
    this.configService = options.configService;
  }

  _exists(candidate) { try { fs.lstatSync(candidate); return true; } catch { return false; } }

  _read(projectRoot, relative, limit = this.maxBytes) {
    if (!relative || path.isAbsolute(relative) || !within(path.resolve(projectRoot, relative), projectRoot)) throw new Error('台账路径超出项目范围');
    let current = projectRoot;
    const parts = relative.split(/[\\/]/);
    for (let i = 0; i < parts.length; i += 1) {
      current = path.join(current, parts[i]);
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory())) throw new Error('台账路径包含符号链接或非目录');
    }
    if (!within(fs.realpathSync.native(current), fs.realpathSync.native(projectRoot))) throw new Error('台账实际路径超出项目范围');
    const fd = fs.openSync(current, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > limit) throw new Error('台账不是普通文件或超过读取上限');
      const chunks = []; let size = 0;
      while (size <= limit) {
        const buffer = Buffer.alloc(Math.min(65536, limit + 1 - size));
        const count = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (!count) break;
        chunks.push(buffer.subarray(0, count)); size += count;
      }
      if (size > limit) throw new Error('台账超过读取上限');
      return Buffer.concat(chunks).toString('utf8');
    } finally { fs.closeSync(fd); }
  }

  _relativeReference(value) {
    const reference = text(value, 2000);
    if (!reference || path.isAbsolute(reference) || /^[a-z]:/i.test(reference) || reference.includes('\\') || reference.split('/').includes('..') || /^[a-z]+:/i.test(reference)) throw new Error('台账证据必须使用项目内相对路径');
    return reference;
  }

  _identity(projectRoot) {
    const localId = hash(projectRoot).slice(0, 20);
    let name = path.basename(projectRoot), manifestId = '';
    try {
      const manifest = JSON.parse(this._read(projectRoot, '.gitfinder/project.json', 256 * 1024));
      if (manifest.schemaVersion === 1 && /^project_[0-9a-f-]{36}$/i.test(manifest.projectId || '')) {
        manifestId = manifest.projectId;
        name = text(manifest.name || name, 160);
      }
    } catch { /* Project identity is optional; never follow unsafe metadata links. */ }
    // Separate local checkouts even when they contain the same portable project identity.
    return { projectId: `ledger-${manifestId || localId}-${localId}`, name, manifestId };
  }

  readPortfolio(roots) {
    const result = { projects: [], tasks: [], dependencies: [], milestones: [], timeline: [], warnings: [], ownedRoots: [] };
    const visited = new Set(), queue = [];
    for (const root of roots || []) queue.push({ directory: root.realPath || root.path, depth: 0 });
    for (const repo of this.configService?.getRepos?.()?.repos || []) {
      if (!repo?.path || !(roots || []).some(root => within(repo.path, root.path) || within(repo.path, root.realPath))) continue;
      try {
        const real = fs.realpathSync.native(repo.path);
        if ((roots || []).some(root => within(real, root.realPath || root.path))) queue.push({ directory: real, depth: 0 });
      } catch { /* Unavailable repositories are not read. */ }
    }
    let scanned = 0;
    while (queue.length && scanned < this.maxDirectories) {
      const { directory, depth } = queue.shift();
      let real;
      try {
        if (fs.lstatSync(directory).isSymbolicLink()) continue;
        real = fs.realpathSync.native(directory);
        if (!fs.statSync(real).isDirectory() || visited.has(real)) continue;
        if (!(roots || []).some(root => within(real, root.realPath || root.path))) continue;
      } catch { continue; }
      visited.add(real); scanned += 1;
      const found = LEDGER_PATHS.filter(relative => this._exists(path.join(real, relative)));
      if (found.length) {
        result.ownedRoots.push(real);
        const identity = this._identity(real);
        const source = { kind: 'repository-ledger', authority: '项目内任务台账', readOnly: true, writebackAllowed: false, schemaVersion: 'repository-ledger/1', projectRoot: real, projectionPath: path.join(real, found[0]), ledgerPath: path.join(real, found[0]), relativePath: found[0] };
        try {
          if (found.length > 1) throw Object.assign(new Error('发现多个任务台账，请在项目内明确唯一事实源'), { ledgerCode: 'ledger-conflict' });
          const raw = this._read(real, found[0]);
          let book;
          try { book = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw new Error('台账JSON无法解析，请修复源文件后刷新'); }
          const normalized = this._normalize(book, identity, real, source, hash(raw));
          for (const key of ['tasks', 'dependencies', 'milestones', 'timeline']) result[key].push(...normalized[key]);
          result.projects.push(normalized.project);
        } catch (error) {
          // Do not expose JSON fragments or turn a broken authority into an empty healthy project.
          const message = error?.code ? '任务源暂不可读取，请检查路径与权限' : (error?.message || '任务源无效');
          result.projects.push({ ...identity, projectRoot: real, source, sourceError: message, generatedAt: '', updatedAt: '', leafTaskCount: 0, completedTaskCount: 0, acceptedTaskCount: 0, acceptedRatio: 0, blockedCount: 0, overdueCount: 0, dueSoonCount: 0, stages: [], nextTaskId: '', projectionStale: true, contentRevision: hash(message) });
          result.warnings.push({ code: error.ledgerCode || 'invalid-ledger', projectId: identity.projectId, path: source.ledgerPath, message });
        }
        continue; // Never crawl an already identified project's source tree for duplicate task sources.
      }
      // Known repos/project containers are candidate roots; their dependency/source trees are not workspaces.
      if (this._exists(path.join(real, '.git')) || this._exists(path.join(real, '.gitfinder/project.json'))) continue;
      if (depth >= this.maxDepth) continue;
      try {
        const entries = fs.readdirSync(real, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
          queue.push({ directory: path.join(real, entry.name), depth: depth + 1 });
        }
      } catch { result.warnings.push({ code: 'ledger-scan-unavailable', path: real, message: '部分受管目录不可读取，当前结果可能不完整' }); }
    }
    if (queue.length) result.warnings.push({ code: 'ledger-scan-limit', message: '达到任务源发现上限；请将项目目录直接加入受管位置，当前结果可能不完整' });
    return result;
  }

  _normalize(book, identity, root, source, contentRevision) {
    if (!book || typeof book !== 'object' || Array.isArray(book)) throw new Error('台账必须是JSON对象');
    const camel = Object.hasOwn(book, 'schemaVersion');
    if ((camel ? book.schemaVersion : book.schema_version) !== 1 || !Array.isArray(book.tasks) || book.tasks.length > this.maxTasks) throw new Error('不支持的台账协议或任务数量超过上限');
    const generatedAt = text(camel ? book.updatedAt : book.updated_at, 100);
    if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('台账缺少有效更新时间');
    source = { ...source, generatedAt, contentRevision, format: camel ? 'development-tasks/v1' : 'handoff-tasks/v1' };
    const byId = new Map();
    for (const raw of book.tasks) {
      if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/.test(raw.id)) throw new Error('台账任务ID无效');
      if (byId.has(raw.id)) throw new Error(`任务ID重复：${raw.id}`);
      if (typeof raw.title !== 'string' || !raw.title.trim() || !Object.hasOwn(STATUS, raw.status)) throw new Error(`任务标题或状态无效：${raw.id}`);
      for (const key of ['acceptance', 'evidence', camel ? 'dependsOn' : 'depends_on']) {
        if (!Array.isArray(raw[key]) || raw[key].length > 1000) throw new Error(`任务字段${key}必须为有界数组：${raw.id}`);
      }
      byId.set(raw.id, raw);
    }
    const seen = new Set(), active = new Set();
    const visit = id => {
      if (active.has(id)) throw new Error('台账任务依赖存在循环');
      if (seen.has(id)) return;
      active.add(id);
      const deps = byId.get(id)[camel ? 'dependsOn' : 'depends_on'];
      if (new Set(deps).size !== deps.length) throw new Error(`依赖重复：${id}`);
      for (const dep of deps) { if (!byId.has(dep)) throw new Error(`依赖任务不存在：${text(dep, 160)}`); visit(dep); }
      active.delete(id); seen.add(id);
    };
    for (const id of byId.keys()) visit(id);
    const nextTaskId = text(camel ? book.nextTaskId : book.current_next_task, 160);
    if (nextTaskId && !byId.has(nextTaskId)) throw new Error('台账下一任务不存在');
    const stages = new Map();
    for (const item of Array.isArray(book.milestones) ? book.milestones : []) {
      if (item && typeof item.id === 'string') stages.set(item.id, { stageId: item.id, name: text(item.title || item.name || item.id, 300), sequence: stages.size, status: '', startDate: '', targetDate: '' });
    }
    const tasks = book.tasks.map(raw => {
      const stageId = text(raw.milestone || 'ungrouped', 160);
      if (!stages.has(stageId)) stages.set(stageId, { stageId, name: stageId, sequence: stages.size, status: '', startDate: '', targetDate: '' });
      const [status, statusTone] = STATUS[raw.status];
      const completed = ['done', 'delivered'].includes(raw.status);
      const targetDate = text(raw.target_date || raw.targetDate || '', 100);
      const due = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? Date.parse(`${targetDate}T23:59:59`) : NaN;
      const remaining = due - this.now().getTime();
      const references = raw.evidence.map((item, index) => {
        const value = typeof item === 'string' ? item : item?.path;
        const reference = this._relativeReference(value);
        return { id: `${raw.id}:evidence:${index}`, type: text(typeof item === 'string' ? '记录引用' : item.kind || '记录引用', 100), summary: text(typeof item === 'string' ? '仓库记录（未由GitFinder重新验证）' : `${item.kind || '证据'} / ${item.result || '未标结果'}（源记录）`), reference, capturedAt: text(raw.updatedAt || raw.updated_at || generatedAt, 100), capturedBy: text(raw.owner || '') };
      });
      const blockers = camel ? (raw.blocker ? [raw.blocker] : []) : (raw.blockers || []);
      if (!Array.isArray(blockers) || blockers.some(item => typeof item !== 'string')) throw new Error(`阻塞字段无效：${raw.id}`);
      return {
        key: `${identity.projectId}:${raw.id}`, projectId: identity.projectId, projectName: identity.name, projectRoot: root,
        taskId: raw.id, parentTaskId: '', stageId, stageName: stages.get(stageId).name,
        title: text(raw.title, 500), owner: text(raw.owner || '未认领', 240), status, statusTone, sourceStatus: raw.status, completed,
        kind: text(raw.kind || 'development', 100), priority: text(raw.priority, 50), nextAction: text(camel ? raw.nextAction : raw.next_action),
        blockers: blockers.map(item => text(item)), startDate: text(raw.start_date || raw.startDate || '', 100), targetDate,
        updatedAt: text(raw.updatedAt || raw.updated_at || generatedAt, 100), isLeaf: true,
        overdue: !completed && raw.status !== 'deferred' && remaining < 0,
        dueSoon: !completed && raw.status !== 'deferred' && remaining >= 0 && remaining <= 7 * 86400000,
        acceptanceTotal: raw.acceptance.length, acceptancePassed: 0,
        acceptance: raw.acceptance.map((item, index) => {
          if (typeof item !== 'string') throw new Error(`验收条件必须是文本：${raw.id}`);
          return { id: `${raw.id}:acceptance:${index}`, criterion: text(item), checkType: '仓库验收条件', result: '未逐项记录', evidenceId: '', checkedAt: '', confirmedBy: '' };
        }),
        evidence: references, repositories: [{ id: identity.projectId, name: identity.name, path: root, available: true, relation: 'context', notes: '项目目录；Git活动不等于任务验收' }],
        implementation: text(raw.implementation || '', 160), deployment: text(raw.deployment || '', 160),
        delivery: raw.delivery && typeof raw.delivery === 'object' ? { version: text(raw.delivery.version, 120), sourceCommit: text(raw.delivery.sourceCommit, 100) } : null,
        userAcceptance: text(raw.userAcceptance || '', 100), predecessors: [], successors: [], source: { ...source }
      };
    });
    const normalizedById = new Map(tasks.map(task => [task.taskId, task]));
    const dependencies = [];
    for (const task of tasks) {
      for (const dep of byId.get(task.taskId)[camel ? 'dependsOn' : 'depends_on']) {
        const peer = normalizedById.get(dep), id = `${dep}->${task.taskId}`, key = `${identity.projectId}:${id}`;
        dependencies.push({ key, dependencyId: id, projectId: identity.projectId, projectName: identity.name, predecessorTaskKey: peer.key, predecessorTaskId: dep, predecessorTitle: peer.title, predecessorStatus: peer.status, predecessorStatusTone: peer.statusTone, successorTaskKey: task.key, successorTaskId: task.taskId, successorTitle: task.title, successorStatus: task.status, successorStatusTone: task.statusTone, relation: 'FS', lagDays: 0, source: { ...source } });
        task.predecessors.push({ key, dependencyId: id, taskKey: peer.key, taskId: peer.taskId, title: peer.title, status: peer.status, statusTone: peer.statusTone, relation: 'FS', lagDays: 0 });
        peer.successors.push({ key, dependencyId: id, taskKey: task.key, taskId: task.taskId, title: task.title, status: task.status, statusTone: task.statusTone, relation: 'FS', lagDays: 0 });
      }
    }
    const completedTaskCount = tasks.filter(task => task.completed).length;
    const project = {
      ...identity, projectRoot: root, registeredPath: root, pathRebound: false, sourceError: '',
      generatedAt, updatedAt: generatedAt, projectionStale: this.now().getTime() - Date.parse(generatedAt) > 14 * 86400000,
      leafTaskCount: tasks.length, completedTaskCount, acceptedTaskCount: 0, acceptedRatio: 0,
      blockedCount: tasks.filter(task => task.status === '阻塞').length,
      overdueCount: tasks.filter(task => task.overdue).length, dueSoonCount: tasks.filter(task => task.dueSoon).length,
      documentationTaskCount: tasks.filter(task => task.kind === 'documentation').length,
      inProgressCount: tasks.filter(task => task.sourceStatus === 'in_progress').length,
      nextTaskId, stages: [...stages.values()], contentRevision, source
    };
    const milestones = [...stages.values()].map(stage => {
      const members = tasks.filter(task => task.stageId === stage.stageId);
      const done = members.filter(task => task.completed).length;
      return { key: `${identity.projectId}:milestone:${stage.stageId}`, projectId: identity.projectId, projectName: identity.name, projectRoot: root, milestoneId: stage.stageId, stageId: stage.stageId, stageName: stage.name, name: stage.name, targetDate: '', status: members.length && done === members.length ? '任务已完成' : '阶段任务汇总', statusTone: members.length && done === members.length ? 'success' : 'info', completed: Boolean(members.length && done === members.length), acceptanceSummary: `任务完成 ${done}/${members.length}；不是单独的里程碑验收记录`, overdue: false, dueSoon: false, source: { ...source } };
    });
    // A current snapshot is not a fabricated change history. Existing task evidence remains in details.
    return { project, tasks, dependencies, milestones, timeline: [] };
  }
}
module.exports = { RepositoryTaskLedgerService, LEDGER_PATHS };
