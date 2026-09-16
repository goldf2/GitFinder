(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProjectProgressModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function pathKey(value) {
    const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
    return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized;
  }
  function isComplete(task) { return task?.completed === true || task?.status === '已验收完成'; }
  function matchProject(repoPath, projects) {
    const key = pathKey(repoPath);
    return (projects || []).filter(project => {
      const parent = pathKey(project.projectRoot);
      return parent && (key === parent || key.startsWith(`${parent}/`));
    }).sort((a, b) => pathKey(b.projectRoot).length - pathKey(a.projectRoot).length)[0] || null;
  }
  function scopeRepositories(repos, projects, options = {}) {
    const seen = new Set(), result = [];
    for (const repo of repos || []) {
      const project = matchProject(repo.path, projects);
      const item = project ? { ...repo, path: project.projectRoot, name: project.name, progressProjectId: project.projectId } : repo;
      const key = pathKey(item.path);
      if (!key || seen.has(key)) continue;
      seen.add(key); result.push(item);
    }
    if (options.includeUnlisted) {
      const tokens = String(options.query || '').toLocaleLowerCase('zh-CN').trim().split(/\s+/).filter(Boolean);
      for (const project of projects || []) {
        if ((options.knownRepositories || []).some(repo => matchProject(repo.path, projects)?.projectId === project.projectId)) continue;
        const key = pathKey(project.projectRoot);
        const haystack = `${project.name} ${project.projectRoot}`.toLocaleLowerCase('zh-CN');
        if (!key || seen.has(key) || !tokens.every(token => haystack.includes(token))) continue;
        seen.add(key); result.push({ path: project.projectRoot, name: project.name, progressProjectId: project.projectId });
      }
    }
    return result;
  }
  function fromTaskProject(repo, project, portfolio, now = new Date()) {
    const tasks = (portfolio.tasks || []).filter(task => task.projectId === project.projectId && task.isLeaf !== false);
    const open = tasks.filter(task => !isComplete(task) && task.sourceStatus !== 'deferred');
    const dates = [project.updatedAt, project.generatedAt, ...tasks.map(task => task.updatedAt)]
      .map(value => new Date(value || NaN)).filter(date => Number.isFinite(date.getTime()));
    const lastProgressDate = dates.sort((a, b) => b - a)[0] || null;
    const unavailable = Boolean(project.sourceError);
    const done = tasks.filter(isComplete).length;
    const blockedCount = tasks.filter(task => task.status === '阻塞').length;
    return {
      repo, sourceProject: project, taskSource: true, sourceError: project.sourceError || '', unavailable,
      initialized: !unavailable, tracked: !unavailable && tasks.length > 0, needsControlFiles: false,
      delayed: !unavailable && tasks.some(task => task.overdue), blocked: !unavailable && blockedCount > 0,
      stalled: !unavailable && open.length > 0 && Boolean(lastProgressDate && now - lastProgressDate > 14 * 86400000),
      lastProgressDate, dueDates: [], tasks,
      summary: { progressTotal: tasks.length, progressDone: done, blockedCount },
      documentationTaskCount: tasks.filter(task => task.kind === 'documentation').length,
      inProgressCount: tasks.filter(task => task.sourceStatus === 'in_progress' || task.status === '已有活动但未达标').length,
      milestones: (portfolio.milestones || []).filter(item => item.projectId === project.projectId && item.targetDate && !isComplete(item))
        .map(item => ({ repo, title: item.name, date: new Date(`${item.targetDate}T23:59:59`), status: item.status }))
        .filter(item => Number.isFinite(item.date.getTime()) && item.date >= now)
    };
  }
  function aggregate(projectStats) {
    const total = projectStats.length, percent = n => total ? Math.round(n / total * 100) : 0;
    const result = { total, projectStats };
    for (const key of ['initialized', 'tracked', 'delayed', 'blocked', 'stalled']) {
      const items = projectStats.filter(item => item[key]);
      result[key] = items.length; result[`${key}Percent`] = percent(items.length); result[`${key}Projects`] = items;
    }
    result.sourceProjects = projectStats.filter(item => item.taskSource);
    result.unavailableProjects = projectStats.filter(item => item.unavailable);
    result.missingControlProjects = projectStats.filter(item => item.needsControlFiles ?? !item.initialized);
    result.untrackedProjects = projectStats.filter(item => !item.tracked && !item.unavailable);
    result.upcomingMilestones = projectStats.flatMap(item => item.milestones || []).sort((a, b) => a.date - b.date).slice(0, 8);
    const sourceTasks = result.sourceProjects.flatMap(item => item.tasks || []);
    result.taskCount = sourceTasks.length;
    result.taskCompletedCount = sourceTasks.filter(isComplete).length;
    result.taskBlockedCount = sourceTasks.filter(item => item.status === '阻塞').length;
    result.taskInProgressCount = result.sourceProjects.reduce((n, item) => n + (item.inProgressCount || 0), 0);
    result.documentationTaskCount = sourceTasks.filter(item => item.kind === 'documentation').length;
    return result;
  }
  return { pathKey, isComplete, matchProject, scopeRepositories, fromTaskProject, aggregate };
});
