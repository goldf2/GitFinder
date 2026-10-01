const configService = require('./configService');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_ID = /^project_[0-9a-f-]{36}$/i;
const MAX_BYTES = 2 * 1024 * 1024;

function githubReference(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('GitHub 任务链接格式无效'); }
  const match = url.pathname.match(/^\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(issues|pull)\/([1-9][0-9]*)\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash || !match) throw new Error('请使用 GitHub Issue 或 PR 的完整链接');
  return { url: `https://github.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`, repository: `${match[1]}/${match[2]}`, type: match[3] === 'pull' ? 'PR' : 'Issue', number: Number(match[4]) };
}

function taskReference(value) {
  if (value?.kind === 'github') return { kind: 'github', url: githubReference(value.url).url };
  if (value?.kind === 'local' && typeof value.taskId === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value.taskId)) return { kind: 'local', taskId: value.taskId };
  throw new Error('任务关联格式无效');
}

function conversation(values = {}) {
  let source = values.source;
  let threadId = String(values.threadId || '').trim();
  if (values.url) {
    let url;
    try { url = new URL(String(values.url).trim()); } catch { throw new Error('会话链接格式无效'); }
    if (url.username || url.password || url.search || url.hash || url.port) throw new Error('会话链接不能包含额外参数');
    const parsedSource = url.protocol === 'codex:' && url.hostname === 'threads' ? 'codex'
      : url.protocol === 'https:' && url.hostname === 'chatgpt.com' && url.pathname.startsWith('/c/') ? 'chatgpt' : null;
    const match = url.pathname.match(parsedSource === 'codex' ? /^\/([0-9a-f-]{36})\/?$/i : /^\/c\/([0-9a-f-]{36})\/?$/i);
    if (!parsedSource || !match || (source && source !== parsedSource) || (threadId && threadId.toLowerCase() !== match[1].toLowerCase())) throw new Error('请使用 Codex 会话链接或 ChatGPT /c/ 会话链接');
    source = parsedSource;
    threadId = match[1];
  }
  if (!['codex', 'chatgpt'].includes(source) || !UUID.test(threadId)) throw new Error('会话来源或 ID 无效');
  if (!['primary', 'history', 'related'].includes(values.role)) throw new Error('请选择主会话、历史会话或关联会话');
  const title = String(values.title || '').trim();
  if (!title || title.length > 500) throw new Error('会话标题不能为空且不能超过 500 字');
  const result = { source, threadId: threadId.toLowerCase(), title, role: values.role };
  for (const [key, limit] of [['summary', 3000], ['hostId', 160]]) {
    if (values[key]) {
      if (typeof values[key] !== 'string' || values[key].length > limit) throw new Error(`会话 ${key} 长度无效`);
      result[key] = values[key];
    }
  }
  if (values.taskRefs) {
    if (!Array.isArray(values.taskRefs) || values.taskRefs.length > 50) throw new Error('每个会话最多关联 50 个任务');
    result.taskRefs = values.taskRefs.map(taskReference);
    if (new Set(result.taskRefs.map(item => item.url || item.taskId)).size !== result.taskRefs.length) throw new Error('请移除重复的任务关联');
  }
  return result;
}

function project(values) {
  if (!PROJECT_ID.test(values?.projectId) || !Array.isArray(values.conversations) || values.conversations.length > 100) throw new Error('项目会话清单无效');
  const conversations = values.conversations.map(conversation);
  const keys = conversations.map(item => `${item.source}:${item.threadId}`);
  if (new Set(keys).size !== keys.length) throw new Error('同一项目不能重复关联同一会话');
  for (const source of ['codex', 'chatgpt']) {
    if (conversations.filter(item => item.source === source && item.role === 'primary').length > 1) throw new Error('每个项目的 Codex 和 ChatGPT 各只能设置一个主会话');
  }
  return { projectId: values.projectId, conversations };
}

function store(values) {
  if (!values) return { schemaVersion: 1, projects: [] };
  if (Buffer.byteLength(JSON.stringify(values), 'utf8') > MAX_BYTES || values.schemaVersion !== 1 || !Array.isArray(values.projects) || values.projects.length > 1000) throw new Error('导入清单格式无效或超过 2 MiB');
  const projects = values.projects.map(project);
  if (new Set(projects.map(item => item.projectId)).size !== projects.length) throw new Error('清单包含重复项目');
  return { schemaVersion: 1, projects };
}

function urlFor(item) {
  return item.source === 'codex' ? `codex://threads/${item.threadId}` : `https://chatgpt.com/c/${item.threadId}`;
}

class ProjectConversationService {
  constructor(options = {}) {
    this.configService = options.configService || configService;
    this.listProjects = options.listProjects || (() => require('./localProjectService').listProjects());
    this.openExternal = options.openExternal || (url => require('electron').shell.openExternal(url));
    this.getRemotes = options.getRemotes || (repoPath => require('./gitService').getRemotes(repoPath));
    this.readLocalTasks = options.readLocalTasks || (projectRoot => {
      const { RepositoryTaskLedgerService } = require('./repositoryTaskLedgerService');
      return new RepositoryTaskLedgerService().readPortfolio([{ path: projectRoot, realPath: projectRoot }]);
    });
    this.readGithub = options.readGithub || (async repository => {
      const [owner, name] = repository.split('/');
      const query = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){issues(first:50,states:[OPEN],orderBy:{field:UPDATED_AT,direction:DESC}){nodes{url title state updatedAt}} pullRequests(first:50,states:[OPEN],orderBy:{field:UPDATED_AT,direction:DESC}){nodes{url title state updatedAt}}}}';
      const result = await execFile('gh', ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`], { timeout: 60000, maxBuffer: MAX_BYTES, windowsHide: true });
      const data = JSON.parse(result.stdout);
      if (data.errors || !data.data?.repository) throw new Error('GitHub 仓库读取失败');
      return [...data.data.repository.issues.nodes, ...data.data.repository.pullRequests.nodes].map(item => ({ html_url: item.url, title: item.title, state: item.state.toLowerCase(), updated_at: item.updatedAt }));
    });
    this.githubSnapshots = new Map();
  }

  list() { return store(this.configService.get('projectConversations')); }

  _save(value) {
    const next = store(value);
    const previous = this.configService.get('projectConversations');
    try { this.configService.set('projectConversations', next); }
    catch (error) {
      if (this.configService.config) this.configService.config.projectConversations = previous;
      throw error;
    }
    return next;
  }

  async save(projectId, conversations) {
    const entry = project({ projectId, conversations });
    const knownProject = (await this.listProjects()).find(item => item.projectId === projectId);
    if (!knownProject) throw new Error('项目已不在受管位置中');
    await this._validateTaskRefs(knownProject, entry.conversations);
    const next = this.list();
    next.projects = next.projects.filter(item => item.projectId !== projectId);
    if (entry.conversations.length) next.projects.push(entry);
    return this._save(next);
  }

  async import(values) {
    const incoming = store(values);
    const known = new Map((await this.listProjects()).map(item => [item.projectId, item]));
    if (incoming.projects.some(item => !known.has(item.projectId))) throw new Error('导入清单包含未扫描到的项目，请先添加对应受管位置');
    for (const entry of incoming.projects) await this._validateTaskRefs(known.get(entry.projectId), entry.conversations);
    const next = this.list();
    for (const entry of incoming.projects) {
      const existing = next.projects.find(item => item.projectId === entry.projectId);
      const merged = new Map((existing?.conversations || []).map(item => [`${item.source}:${item.threadId}`, item]));
      const primarySources = new Set(entry.conversations.filter(item => item.role === 'primary').map(item => item.source));
      for (const [key, item] of merged) {
        if (primarySources.has(item.source)) merged.set(key, { ...item, role: 'history' });
      }
      for (const item of entry.conversations) {
        const key = `${item.source}:${item.threadId}`;
        const previous = merged.get(key);
        const references = new Map([...(previous?.taskRefs || []), ...(item.taskRefs || [])].map(ref => [ref.url || ref.taskId, ref]));
        merged.set(key, { ...previous, ...item, ...(references.size ? { taskRefs: [...references.values()] } : {}) });
      }
      for (const source of ['codex', 'chatgpt']) {
        if (![...merged.values()].some(item => item.source === source && item.role === 'primary')) {
          const related = [...merged.entries()].find(([, item]) => item.source === source && item.role === 'related');
          if (related) merged.set(related[0], { ...related[1], role: 'primary' });
        }
      }
      next.projects = next.projects.filter(item => item.projectId !== entry.projectId);
      next.projects.push({ projectId: entry.projectId, conversations: [...merged.values()] });
    }
    return this._save(next);
  }

  async open(projectId, source, threadId) {
    const entry = this.list().projects.find(item => item.projectId === projectId);
    const item = source && threadId
      ? entry?.conversations.find(value => value.source === source && value.threadId === threadId)
      : entry?.conversations.find(value => value.role === 'primary' && value.source === source);
    if (!item) throw new Error('尚未关联该会话');
    await this.openExternal(urlFor(item));
    return { opened: true };
  }

  async _repositories(project) {
    const repositories = [];
    for (const repo of project.repositories || []) {
      const remotes = await this.getRemotes(repo.path);
      const remote = remotes.find(item => item.name === 'origin') || remotes[0];
      const match = String(remote?.fetchUrl || '').match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/);
      if (match) repositories.push({ path: repo.path, name: repo.relativePath || repo.name, repository: `${match[1]}/${match[2]}`, url: `https://github.com/${match[1]}/${match[2]}` });
    }
    return repositories;
  }

  async _validateTaskRefs(project, conversations) {
    const references = conversations.flatMap(item => item.taskRefs || []);
    if (!references.length) return;
    const repositories = new Set((await this._repositories(project)).map(item => item.repository.toLowerCase()));
    const localTasks = references.some(item => item.kind === 'local') ? this.readLocalTasks(project.path).tasks.filter(task => path.resolve(task.projectRoot) === path.resolve(project.path)) : [];
    for (const item of references) {
      if (item.kind === 'github' && !repositories.has(githubReference(item.url).repository.toLowerCase())) throw new Error('GitHub 任务必须属于该项目的现有 GitHub 仓库');
      if (item.kind === 'local' && !localTasks.some(task => task.taskId === item.taskId)) throw new Error('关联的任务 ID 未在该项目台账中找到');
    }
  }

  async workspace(projectId, options = {}) {
    const project = (await this.listProjects()).find(item => item.projectId === projectId);
    if (!project) throw new Error('项目已不在受管位置中');
    const repositories = await this._repositories(project);
    const local = this.readLocalTasks(project.path);
    const tasks = local.tasks.filter(task => path.resolve(task.projectRoot) === path.resolve(project.path));
    const githubErrors = [];
    if (options.refreshGithub) {
      const items = [];
      for (const repository of [...new Set(repositories.map(item => item.repository))]) {
        try {
          const rows = await this.readGithub(repository);
          for (const row of rows.slice(0, 100)) {
            const reference = githubReference(row.html_url);
            if (reference.repository.toLowerCase() !== repository.toLowerCase()) {
              const message = `${repository}：GitHub 返回 ${reference.repository}，仓库可能已改名或转移，请核对 origin 地址`;
              if (!githubErrors.includes(message)) githubErrors.push(message);
              continue;
            }
            items.push({ kind: 'github', url: reference.url, title: String(row.title || '').slice(0, 500), type: reference.type, number: reference.number, state: row.state, repository, updatedAt: row.updated_at });
          }
        } catch { githubErrors.push(`${repository}：GitHub 读取失败，请检查本机 gh 登录或仓库权限`); }
      }
      this.githubSnapshots.set(projectId, { items, errors: githubErrors, refreshedAt: new Date().toISOString() });
    }
    return { projectId, projectPath: project.path, repositories, tasks, localErrors: local.projects.filter(item => item.projectRoot === project.path && item.sourceError).map(item => item.sourceError), github: this.githubSnapshots.get(projectId) || null, githubErrors: this.githubSnapshots.get(projectId)?.errors || [] };
  }

  async openRepository(projectId, repository, view = '') {
    if (!['', 'issues', 'pulls'].includes(view)) throw new Error('仓库入口无效');
    const workspace = await this.workspace(projectId);
    const repo = workspace.repositories.find(item => item.repository === repository);
    if (!repo) throw new Error('该仓库未在项目中登记');
    await this.openExternal(`${repo.url}${view ? `/${view}` : ''}`);
    return { opened: true };
  }

  async openGithubTask(projectId, url) {
    const reference = githubReference(url);
    const saved = this.list().projects.find(item => item.projectId === projectId)?.conversations.some(item => item.taskRefs?.some(task => task.kind === 'github' && task.url === reference.url));
    const snapshot = this.githubSnapshots.get(projectId)?.items.some(item => item.url === reference.url);
    if (!saved && !snapshot) throw new Error('该 GitHub 任务尚未关联或刷新');
    const workspace = await this.workspace(projectId);
    if (!workspace.repositories.some(item => item.repository.toLowerCase() === reference.repository.toLowerCase())) throw new Error('该任务已不属于项目的现有仓库');
    await this.openExternal(reference.url);
    return { opened: true };
  }
}

module.exports = new ProjectConversationService();
module.exports.ProjectConversationService = ProjectConversationService;
module.exports.urlFor = urlFor;
module.exports.githubReference = githubReference;
