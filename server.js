const express = require('express');
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const fileService = require('./src/main/services/fileService');
const gitService = require('./src/main/services/gitService');
const { toLegacyWebGitStatus } = require('./src/shared/webGitStatusAdapter');

const app = express();
const DEFAULT_PORT = 3001;
const DEFAULT_HOST = '127.0.0.1';

const CACHE_FILE = path.join(__dirname, '.git-monitor-cache.json');

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf-8');
      const cache = JSON.parse(content);
      if (cache.timestamp && Date.now() - cache.timestamp < 3600000) {
        return cache.data;
      }
    }
  } catch (err) {
    console.error('读取缓存失败:', err);
  }
  return null;
}

function saveCache(data) {
  try {
    const cache = {
      timestamp: Date.now(),
      data
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('保存缓存失败:', err);
  }
}

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/desktop.html', (_req, res) => res.redirect('/'));

function requireWebWrite(req, res, next) {
  if (process.env.GITFINDER_WEB_WRITE_ENABLED === '1') return next();
  return res.status(403).json({
    success: false,
    error: 'Web 写操作默认关闭，请在可信本机环境显式启用'
  });
}

function isGitRepo(dir) {
  try {
    const gitDir = path.join(dir, '.git');
    return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
  } catch {
    return false;
  }
}

function scanGitRepos(basePath, depth = 1, excluded = []) {
  const repos = [];
  const skipDirs = [
    '.git', '.DS_Store', '.DocumentRevisions-V100', '.Spotlight-V100',
    '.TemporaryItems', '.Trashes', '.fseventsd', '.VolumeIcon.icns',
    '.apdisk', '.metadata_never_index', '.metadata_never_index_unless_rootfs',
    'node_modules', 'vendor', '__pycache__', '.venv', 'env'
  ];

  function scan(currentPath, currentDepth) {
    if (currentDepth > depth) return;

    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (skipDirs.includes(entry.name) || entry.name.startsWith('.')) {
            continue;
          }

          const fullPath = path.join(currentPath, entry.name);

          if (excluded.includes(fullPath)) {
            continue;
          }

          if (isGitRepo(fullPath)) {
            repos.push({
              name: entry.name,
              path: fullPath
            });
          } else {
            scan(fullPath, currentDepth + 1);
          }
        }
      }
    } catch (err) {
      console.error('扫描目录失败:', err);
    }
  }

  scan(basePath, 1);
  return repos;
}

async function getWebGitStatuses(repoPaths, autoFetch = false) {
  const requested = repoPaths.map(value => {
    const repoPath = String(value || '');
    return { repoPath, key: path.resolve(repoPath) };
  });
  const uniquePaths = [...new Set(requested.map(item => item.key))];
  const results = [];
  for (let offset = 0; offset < uniquePaths.length; offset += 1000) {
    const chunk = uniquePaths.slice(offset, offset + 1000);
    try {
      results.push(...await gitService.batchStatus(chunk, { autoFetch: Boolean(autoFetch), forceRefresh: true }));
    } catch (error) {
      results.push(...chunk.map(repoPath => ({ path: repoPath, status: { isGitRepo: false }, error: error.message })));
    }
  }
  const resultByPath = new Map(results.map(result => [path.resolve(result.path), result]));
  const statusByPath = new Map(uniquePaths.map(repoPath => [repoPath, toLegacyWebGitStatus(
    repoPath,
    resultByPath.get(repoPath),
    fileService.getReadmePreview(repoPath)
  )]));
  return requested.map(({ repoPath, key }) => ({ ...statusByPath.get(key), name: path.basename(repoPath), path: repoPath }));
}

app.get('/api/default-path', (req, res) => {
  const defaultPath = process.platform === 'win32'
    ? process.env.USERPROFILE + '\\Projects'
    : process.env.HOME + '/Projects';
  res.json({ path: defaultPath });
});

app.get('/api/repos', (req, res) => {
  const defaultPath = process.platform === 'win32'
    ? process.env.USERPROFILE + '\\Projects'
    : process.env.HOME + '/Projects';
  const basePath = req.query.path || defaultPath;
  const depth = parseInt(req.query.depth) || 1;
  const repos = scanGitRepos(basePath, depth);
  res.json({ repos });
});

app.get('/api/cache', (req, res) => {
  const cache = loadCache();
  res.json({
    hasCache: !!cache,
    data: cache
  });
});

app.post('/api/status', async (req, res) => {
  const { path, depth, excluded, autoFetch } = req.body;
  if (!path) {
    return res.status(400).json({ error: '路径不能为空' });
  }

  const scanDepth = parseInt(depth) || 1;
  const excludedList = excluded || [];
  const repos = scanGitRepos(path, scanDepth, excludedList);
  const statuses = await getWebGitStatuses(repos.map(repo => repo.path), autoFetch);

  const result = {
    total: statuses.length,
    statuses,
    cachedAt: new Date().toISOString()
  };

  saveCache(result);

  res.json(result);
});

app.post('/api/refresh', async (req, res) => {
  const { paths, autoFetch } = req.body;
  if (!paths || !Array.isArray(paths)) {
    return res.status(400).json({ error: '路径列表不能为空' });
  }

  const statuses = await getWebGitStatuses(paths, autoFetch);
  res.json({ statuses });
});

app.post('/api/action', requireWebWrite, (req, res) => {
  const { path, action } = req.body;
  if (!path || !action) {
    return res.status(400).json({ error: '参数不能为空' });
  }

  try {
    let result;
    switch (action) {
      case 'pull':
        result = execFileSync('git', ['pull'], { cwd: path, encoding: 'utf-8', timeout: 30000 }).trim();
        break;
      case 'push':
        result = execFileSync('git', ['push'], { cwd: path, encoding: 'utf-8', timeout: 30000 }).trim();
        break;
      case 'fetch':
        result = execFileSync('git', ['fetch', 'origin'], { cwd: path, encoding: 'utf-8', timeout: 30000 }).trim();
        break;
      case 'status':
        result = execFileSync('git', ['status'], { cwd: path, encoding: 'utf-8', timeout: 10000 }).trim();
        break;
      default:
        return res.status(400).json({ error: '不支持的操作' });
    }
    res.json({ success: true, result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/commit', requireWebWrite, (req, res) => {
  const { path, message } = req.body;
  if (!path || !message) {
    return res.status(400).json({ error: '路径和提交信息不能为空' });
  }

  try {
    execFileSync('git', ['add', '--all'], { cwd: path, encoding: 'utf-8', timeout: 10000 });
    const result = execFileSync('git', ['commit', '-m', message], { cwd: path, encoding: 'utf-8', timeout: 10000 }).trim();
    res.json({ success: true, result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/log', (req, res) => {
  const repoPath = req.query.path;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);

  if (!repoPath) {
    return res.status(400).json({ error: '路径不能为空' });
  }

  try {
    const logOutput = execFileSync('git', ['log', '-n', String(limit), '--format=%h|%s|%an|%ad|%ae', '--date=iso'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 5000
    }).trim();

    const commits = logOutput.split('\n').filter(line => line.trim()).map(line => {
      const [hash, subject, author, date, email] = line.split('|');
      return { hash, subject, author, date, email };
    });

    res.json({ commits });
  } catch (err) {
    res.json({ commits: [], error: err.message });
  }
});

app.get('/api/diff', (req, res) => {
  const repoPath = req.query.path;

  if (!repoPath) {
    return res.status(400).json({ error: '路径不能为空' });
  }

  try {
    const statusOutput = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8', timeout: 5000 }).trim();
    const diffOutput = execSync('git diff --stat', { cwd: repoPath, encoding: 'utf-8', timeout: 5000 }).trim();

    const files = statusOutput.split('\n').filter(line => line.trim()).map(line => {
      const status = line.substring(0, 2);
      const file = line.substring(3);
      return { status, file };
    });

    res.json({ files, diff: diffOutput });
  } catch (err) {
    res.json({ files: [], diff: '', error: err.message });
  }
});

app.post('/api/remote', (req, res) => {
  const { path, action, remoteName, remoteUrl } = req.body;

  if (!path || !action) {
    return res.status(400).json({ error: '参数不完整' });
  }

  try {
    let result;
    switch (action) {
      case 'get':
        result = execFileSync('git', ['remote', '-v'], { cwd: path, encoding: 'utf-8', timeout: 5000 }).trim();
        break;
      case 'set':
        if (process.env.GITFINDER_WEB_WRITE_ENABLED !== '1') {
          return requireWebWrite(req, res, () => {});
        }
        if (!remoteUrl) {
          return res.status(400).json({ error: '远程URL不能为空' });
        }
        const remote = remoteName || 'origin';
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) {
          return res.status(400).json({ error: '远程仓库名称无效' });
        }
        try {
          execFileSync('git', ['remote', 'set-url', remote, remoteUrl], { cwd: path, encoding: 'utf-8', timeout: 5000 });
        } catch {
          execFileSync('git', ['remote', 'add', remote, remoteUrl], { cwd: path, encoding: 'utf-8', timeout: 5000 });
        }
        result = `远程仓库 ${remote} 已设置为: ${remoteUrl}`;
        break;
      case 'remove':
            return res.status(403).json({ success: false, error: '删除操作必须在CLI中执行' });
      default:
        return res.status(400).json({ error: '不支持的操作' });
    }
    res.json({ success: true, result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

function startServer({ port = DEFAULT_PORT, host = DEFAULT_HOST } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

module.exports = app;
module.exports.startServer = startServer;

if (require.main === module) {
  startServer().then(server => {
    const address = server.address();
    console.log(`Git状态监控服务运行在 http://${address.address}:${address.port}`);
  }).catch(error => {
    console.error('Git状态监控服务启动失败:', error.message);
    process.exitCode = 1;
  });
}
