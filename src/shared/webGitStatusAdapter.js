const path = require('node:path');

function legacyCommitTime(commit) {
  if (commit.authoredAt) return String(commit.authoredAt)
    .replace('T', ' ')
    .replace(/([+-]\d{2}):(\d{2})$/, ' $1$2')
    .replace(/Z$/, ' +0000');
  const timestamp = Number(commit.timestamp);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : '';
}

function toLegacyWebGitStatus(repoPath, result, readme = null) {
  const status = result?.status || {};
  const commit = status.lastCommit || {};
  const count = value => Math.max(0, Number(value) || 0);
  const ahead = count(status.ahead);
  const behind = count(status.behind);
  const modified = count(status.modified);
  const staged = count(status.staged);
  const untracked = count(status.untracked);
  return {
    name: path.basename(repoPath),
    path: repoPath,
    branch: status.branch || '',
    hasUncommitted: modified + staged + untracked > 0,
    hasUnpushed: ahead > 0,
    hasUnpulled: behind > 0,
    aheadCount: ahead,
    behindCount: behind,
    modifiedCount: modified,
    stagedCount: staged,
    untrackedCount: untracked,
    lastCommit: commit.hash ? `${commit.hash} - ${commit.message || ''}` : '',
    lastCommitTime: legacyCommitTime(commit),
    remoteUrl: status.remotes?.find(remote => remote.name === 'origin' && remote.type === 'fetch')?.url || status.remoteUrl || '',
    remoteUrlBackup: status.remoteUrlBackup || '',
    remotes: Array.isArray(status.remotes) ? status.remotes : [],
    readme: readme ? { title: readme.title || '', description: readme.description || '' } : '',
    error: result?.error || status.error || (!result ? 'Git 状态结果缺失' : status.isGitRepo === false ? '不是 Git 仓库' : null)
  };
}
module.exports = { toLegacyWebGitStatus };
