# GitFinder 开发、验证与恢复运行手册

下面命令均在GitFinder仓库根目录运行。主机历史路径为 `/Volumes/project/项目/gitfinder-2`；换机应先定位真实Git边界，不依赖这个绝对路径。Node版本按 `.github/workflows/ci.yml` 使用24；依赖以锁文件为准。

## 1. 安全恢复与只读检查

```bash
pwd
git status -sb
git log -5 --oneline
node -p 'require("./package.json").version'
node -v
npm run handoff:status
npm run check:handoff
```

先读 [AGENTS.md](../../AGENTS.md) 与 [CURRENT_STATE.md](CURRENT_STATE.md)。不要输出真实用户config、Token或外部服务响应。用户数据只做必要的路径/大小/哈希核对，凭据文件不得进入文档或日志。

新克隆使用`npm ci`；已有安装环境先核对锁文件，不在不需要时升级依赖。应用自身CI使用 `npm run check`，本轮加入的进度校验因此也在已有CI入口内执行；CI定义存在不表示远端结果已通过。

## 2. 日常开发和工程进度

```bash
npm run handoff:status
# 编辑 management/development-tasks.json 的实际任务字段
npm run handoff:update
npm run check:handoff
npm run check
```

`npm run electron`启动桌面开发版，会先构建renderer；默认配置可能是真实用户环境。写测试必须传专用profile，不直接操作正常实例。`npm start` / `npm run dev`启动 `server.js` 本机Git工具服务，不是多用户云端产品，不开放公网。

常见专项：

```bash
node --test test/relationship-save-state.test.js test/relationship-save-lifecycle.test.js
node --test test/relationship-media-lifecycle.test.js test/whiteboard-documents.test.js test/whiteboard-package.test.js
node --test test/relationship-project-balanced.test.js test/relationship-layout-controls.test.js
node --test test/relationship-panel-resize.test.js
node --test test/handoff-status.test.js
node --check scripts/handoff-status.js
```

正式完整检查必须使用 `npm run check`，测试发现限定当前 `test/*.test.js`，不要重新使用根目录裸 `node --test` 把dist旧worktree计入通过数。

## 3. 安装版隔离验收

现有脚本包括 `verify-relationship-panel-resize.js`、`verify-relationship-save-lifecycle.js`、`verify-relationship-media-lifecycle.js`、`verify-relationship-layout-options.js`，均在 `scripts/`。调用前读取脚本顶部与上一个版本验收记录，确认fixture清单存在。它们并不负责创建全部测试数据，不能复制真实config或凭据来凑fixture。

```bash
# 以下路径和端口是模板；先确认端口空闲，fixture已在独立profile准备好。
ROOT="$(pwd)"
PROFILE="$ROOT/dist/handoff-smoke/panel-resize-test-profile"
OUTPUT="$ROOT/dist/handoff-smoke/result"
# 不要把PROFILE设成 ~/Library/Application Support/GitFinder*。
open -n '/Applications/GitFinder 2.app' --args \
  "--user-data-dir=$PROFILE" --remote-debugging-port=9444 \
  --remote-debugging-address=127.0.0.1
node scripts/verify-relationship-panel-resize.js 9444 "$PROFILE" "$OUTPUT"
```

脚本检查调试端口进程与profile一致。特殊布局/媒体脚本需要额外fixture；可复用创建流程的任务是GF-QUALITY-001，未完成前不要把上面命令称为一键全套验收。不得关闭隔离保护。完成后正常退出测试实例、确认端口关闭，再`open '/Applications/GitFinder 2.app'`恢复正常实例。

需要比较重启恢复时，在**正常退出后重新启动同一个安装App和同一个隔离profile**，再运行对应脚本的`--reopen`分支。应用中切换视图不等同于进程重启。

## 4. 可追溯构建

按现行AGENTS，包含项目文档修改的默认交付也递增版本、验证、构建、安装后推送；用户明确只修改文档或不安装时记录例外。

```bash
# 先审核dirty，选择明确的下一版本，不把整个工作树一并提交。
npm version <下一alpha版本> --no-git-tag-version --ignore-scripts
npm run handoff:update
npm run check
git diff --check
# git add <本轮明确路径> / git add -p
# git commit -m '<任务ID和变更摘要>'

SOURCE_COMMIT="$(git rev-parse HEAD)"
BUILD="$(mktemp -d "${TMPDIR:-/tmp}/gitfinder-release.XXXXXX")/worktree"
git worktree add --detach "$BUILD" "$SOURCE_COMMIT"
cd "$BUILD"
npm ci
npm run check
npm run pack
```

本机可在已核对锁文件和安装依赖一致的条件下复制已有node_modules加速，不能把未知依赖复制后当干净复现。构建见 `scripts/build-mac.sh` 与 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)。不得删掉仍有未完成任务的worktree。`dist/release-verification.json`必须指向本次源码commit，检查issues、版本、ASAR与ZIP摘要。

## 5. 安装与回退

正常退出旧App前先确认没有需要用户处理的未保存工作。将新包复制到临时安装目录，校验版本与`codesign --verify --deep --strict`，再保留完整旧App到唯一备份路径；备份目录必须不存在，不能覆盖其他版本。仅在旧进程已退出后换入新App，并核对安装ASAR与制品报告一致。

常用只读核对：

```bash
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  '/Applications/GitFinder 2.app/Contents/Info.plist'
codesign --verify --deep --strict '/Applications/GitFinder 2.app'
shasum -a 256 '/Applications/GitFinder 2.app/Contents/Resources/app.asar'
```

回退时停止问题版本，保留问题App和日志，再恢复**已核实路径**的旧App；不要用通配符批量删除 `/Applications/GitFinder*`。用户数据不自动回退；若格式或内容已改变，应先保存差异并单独恢复数据。当前真实备份位置以版本验收记录为准，本手册不硬编码“最新备份”。

## 6. 推送与最终证据

安装启动和本轮专项通过后，按当前跟踪分支普通push并核对远端；不要强推。记录源码commit、制品构建commit、最终文档commit分别是什么，文档收口不需要伪称新制品。

```bash
git branch --show-current
git push origin main
git ls-remote origin refs/heads/main
git rev-parse HEAD
npm run check:handoff
git status -sb
```

不使用存储中的私人token拼URL。公开发行、Windows安装包、Developer ID公证或商店上传不属于普通macOS本机交付；具体步骤见 [在线更新说明](../online-update-publishing.md) 与 [构建发布工作流](../build-publish-workflow.md)，实施前另核验授权、环境和实际版本。
