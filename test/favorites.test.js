const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');

test('已撤下的收藏夹不再保留渲染、桥接或主进程接口', () => {
  const htmlSource = read('src', 'renderer', 'index.html');
  const appSource = read('src', 'renderer', 'scripts', 'app.js');
  const actionBarSource = read('src', 'renderer', 'scripts', 'fileActionBarController.js');
  const operationSource = read('src', 'renderer', 'scripts', 'fileOperationController.js');
  const preloadSource = read('preload.js');
  const configIpcSource = read('src', 'main', 'ipc', 'config.js');
  const filesystemIpcSource = read('src', 'main', 'ipc', 'filesystem.js');
  const configServiceSource = read('src', 'main', 'services', 'configService.js');
  const fileServiceSource = read('src', 'main', 'services', 'fileService.js');

  assert.doesNotMatch(htmlSource, /favorites-list|file-favorite|data-context-action="favorite"|detail-fav-btn/);
  assert.doesNotMatch(appSource, /AppState\.favorites|favoritePathKey|loadFavorites|toggleFavorite|favorites-list|action === 'favorite'/);
  assert.doesNotMatch(actionBarSource, /file-favorite|isFavoritePath/);
  assert.doesNotMatch(operationSource, /loadFavorites/);
  assert.doesNotMatch(preloadSource, /FavoriteDirectory|config:getFavorites|config:addFavorite|config:toggleFavorite|config:removeFavorite/);
  assert.doesNotMatch(configIpcSource, /config:(?:get|add|toggle|remove)Favorite/);
  assert.doesNotMatch(filesystemIpcSource, /fs:(?:getFavoriteDirectoryInfos|resolveFavoriteDirectory)/);
  assert.doesNotMatch(configServiceSource, /getFavorites\(|addFavorite\(|toggleFavorite|removeFavorite\(|removedFavorites/);
  assert.doesNotMatch(fileServiceSource, /inspectFavoriteDirectories|resolveFavoriteDirectory/);
});

test('收藏夹专属系统快捷位置删除后仍保留受管目录与项目快捷入口', () => {
  const appSource = read('src', 'renderer', 'scripts', 'app.js');
  const preloadSource = read('preload.js');
  const filesystemIpcSource = read('src', 'main', 'ipc', 'filesystem.js');
  const fileServiceSource = read('src', 'main', 'services', 'fileService.js');
  const configServiceSource = read('src', 'main', 'services', 'configService.js');

  assert.doesNotMatch(appSource, /getQuickLocations|hiddenQuickLocations|favoritesIndex/);
  assert.doesNotMatch(preloadSource, /getQuickLocations/);
  assert.doesNotMatch(filesystemIpcSource, /fs:getQuickLocations/);
  assert.doesNotMatch(fileServiceSource, /getQuickLocations\(/);
  assert.doesNotMatch(preloadSource, /getMountedVolumes/);
  assert.doesNotMatch(filesystemIpcSource, /fs:getMountedVolumes/);
  assert.doesNotMatch(fileServiceSource, /getMountedVolumes\(/);
  assert.match(configServiceSource, /obsoleteKeys = \['fileLabels', 'favorites', 'hiddenQuickLocations'\]/);
  assert.equal((configServiceSource.match(/hiddenQuickLocations/g) || []).length, 1);

  assert.match(preloadSource, /getWorkspaceDirectoryInfos/);
  assert.match(preloadSource, /getTreeRoots/);
  assert.match(preloadSource, /selectFolder/);
  assert.match(configServiceSource, /projectShortcuts/);
});
