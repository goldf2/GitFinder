# GitFinder 2 Windows 安装包构建教学

本文说明如何为 GitFinder 2 Alpha 构建并验证 Windows x64 测试包。项目会同时生成：

- NSIS 安装包：适合安装到 Windows，并创建桌面和开始菜单快捷方式。
- 免安装 ZIP：解压后直接运行，适合内部测试。

项目的发布规则要求 Windows 包必须由真正的 Windows 主机生成。macOS 上运行 `npm run pack:win` 会主动失败，不能把交叉打包结果当成已验证的 Windows 版本。

## 一、推荐选择

| 场景 | 推荐方式 |
| --- | --- |
| 手边有 Windows 电脑或虚拟机 | 使用“Windows 本机完整构建” |
| 源码已推送到 GitHub | 使用“GitHub Actions 自动构建” |
| 只有当前这台 Mac，且仓库未配置远程 | 先把源码复制到 Windows；当前不能在 Mac 上直接生成合格的 Windows 包 |

当前仓库的自动流程位于 [release.yml](../.github/workflows/release.yml)，本机构建入口位于 [build-win.js](../scripts/build-win.js)。

## 二、Windows 本机完整构建

### 1. 准备环境

推荐使用 Windows 11 x64，并安装：

1. [Node.js 20 LTS](https://nodejs.org/)——与项目 CI 使用的版本一致。
2. [Git for Windows](https://git-scm.com/download/win)——运行时验收会调用 `git.exe`。
3. PowerShell——Windows 自带版本即可。
4. 可访问 npm 下载源的网络，以及足够保存 Electron 依赖和构建产物的磁盘空间。

安装完成后重新打开 PowerShell，检查环境：

```powershell
node --version
npm --version
git --version
```

`node --version` 推荐显示 `v20.x.x`。

### 2. 取得源码

可以从 Git 仓库克隆，也可以把完整项目目录复制到 Windows。不要只复制部分源码；`package-lock.json`、`scripts`、`src`、`public` 和 `.github` 都应保留。

克隆示例：

```powershell
Set-Location C:\Work
git clone <仓库地址> gitfinder-2
Set-Location .\gitfinder-2
```

如果项目还没有远程仓库，可以把 `/Volumes/project/开发中/gitfinder-2` 复制到 Windows，例如放在 `C:\Work\gitfinder-2`，再进入该目录：

```powershell
Set-Location C:\Work\gitfinder-2
```

先确认准备构建的内容：

```powershell
git status --short
node -p "require('./package.json').version"
```

要分发给别人测试时，建议从已经提交的明确版本构建，不要混入来源不明的未提交文件。

### 3. 如需发布新版本，先同步版本号

只在确实要生成新版本时执行。下面的版本号只是示例，请换成目标版本：

```powershell
npm version 2.0.0-alpha.86 --no-git-tag-version
node -p "require('./package.json').version"
```

该命令会同时更新 `package.json` 和 `package-lock.json`，但不会自动创建 Git 标签。若只是重建同一个内部测试版本，可以跳过此步。

### 4. 安装锁定依赖

```powershell
npm ci
```

这里使用 `npm ci`，以 `package-lock.json` 锁定的版本安装依赖，避免构建机自行升级包。

### 5. 先检查源码

```powershell
npm run check
```

此命令会构建白板渲染代码、运行自动测试并检查 JavaScript 语法。只有它通过后才继续打包。

### 6. 构建安装包与免安装包

```powershell
npm run pack:win
```

构建成功后，`dist` 目录至少应包含：

```text
dist/
├─ GitFinder-2-<版本>-x64-win-setup.exe
├─ GitFinder-2-<版本>-x64-win-setup.exe.blockmap
├─ GitFinder-2-<版本>-x64-win.zip
├─ latest.yml
├─ SHA256SUMS-windows.txt
├─ windows-release-metadata.json
└─ win-unpacked/
   └─ GitFinder 2 Alpha.exe
```

其中：

- `*-win-setup.exe` 是可安装版本。
- `*.exe.blockmap` 和 `latest.yml` 供在线更新检查和差分下载使用，必须与安装包同批发布。
- `*-win.zip` 是免安装版本。
- `SHA256SUMS-windows.txt` 用于确认文件在传输后没有损坏。
- `windows-release-metadata.json` 记录版本、架构、签名状态和产物大小。

### 7. 执行 Windows 运行时验收

```powershell
npm run verify:windows-runtime
```

该验收会在临时目录验证：

- 项目配置是否保持跨平台可移植；
- Git for Windows 仓库发现；
- 文件复制和移动；
- Windows 系统回收站；
- 白板包及附件导入、导出和保存。

通过后会生成：

```text
dist/windows-runtime-verification.json
```

### 8. 验证安装、启动和卸载

```powershell
$version = node -p "require('./package.json').version"
.\scripts\verify-windows-package.ps1 -Version $version
```

脚本会：

1. 检查安装包、ZIP 和解包程序是否存在；
2. 启动未安装程序并确认它没有立即崩溃；
3. 安装到独立的临时目录；
4. 启动安装后的程序；
5. 执行卸载并确认程序已移除；
6. 写入安装验收报告。

通过后会生成：

```text
dist/windows-install-verification.json
```

此过程会短暂启动应用并结束测试进程，不会覆盖默认安装目录中的已有应用。

### 9. 一次执行完整流程

环境和源码确认无误后，可以按以下顺序执行：

```powershell
npm ci
npm run check
npm run pack:win
npm run verify:windows-runtime
$version = node -p "require('./package.json').version"
.\scripts\verify-windows-package.ps1 -Version $version
```

只要其中一步失败，就不要把本次产物标记为“已验证”。

## 三、人工验收安装包

自动验收通过后，还应在普通 Windows 用户环境中人工检查一次：

1. 双击 `dist\GitFinder-2-<版本>-x64-win-setup.exe`。
2. 确认安装向导允许选择安装目录。
3. 确认桌面和开始菜单快捷方式可用。
4. 启动应用，检查显示的版本号与 `package.json` 一致。
5. 添加一个受管目录并扫描本地 Git 仓库。
6. 打开关系白板，检查卡片、连线、详情和拖动。
7. 使用“在资源管理器打开”检查本地目录跳转。
8. 关闭并重新打开应用，确认用户数据仍存在。
9. 从 Windows“已安装的应用”卸载，并确认程序目录和快捷方式被移除。

如测试涉及真实 Coolify，请只使用已授权的测试连接；不要把 Token、会话文件或其他凭据放入 Git、白板包或构建产物。

## 四、GitHub Actions 自动构建

项目已经配置手动工作流。使用前，源码必须位于 GitHub 仓库中；如果当前本地仓库没有配置远程地址，需要先由仓库管理员创建远程仓库并推送代码。

操作步骤：

1. 打开 GitHub 仓库。
2. 进入 **Actions**。
3. 选择 **GitFinder 2 Alpha verification**。
4. 点击 **Run workflow**。
5. 等待 **Verify Windows x64 Alpha** 完成。
6. 在该次运行页面的 **Artifacts** 区域下载 `GitFinder-2-Windows-x64-alpha`。

自动流程会在 `windows-latest` 上依次完成：

- `npm ci`；
- 完整源码检查；
- Windows NSIS 和 ZIP 构建；
- Windows 运行时验收；
- 默认启动、安装、再次启动和卸载验收；
- 签名和 SmartScreen 元数据检查；
- 上传安装包、免安装包与四份校验/验收文件。

注意：当前工作流只上传 Actions 构建产物，不会自动创建 GitHub Release，也不会自动公开发布安装包。

## 五、校验文件与签名状态

### 校验 SHA256

```powershell
$version = node -p "require('./package.json').version"
Get-FileHash -Algorithm SHA256 ".\dist\GitFinder-2-$version-x64-win-setup.exe"
Get-FileHash -Algorithm SHA256 ".\dist\GitFinder-2-$version-x64-win.zip"
Get-Content .\dist\SHA256SUMS-windows.txt
```

计算结果应与 `SHA256SUMS-windows.txt` 一致。

### 查看签名

```powershell
$version = node -p "require('./package.json').version"
Get-AuthenticodeSignature ".\dist\GitFinder-2-$version-x64-win-setup.exe" |
  Format-List Status, StatusMessage, SignerCertificate
```

没有配置 Windows 代码签名证书时，内部 Alpha 通常显示 `NotSigned`，Windows SmartScreen 可能提示“未知发布者”。这不一定表示文件损坏，但该包只能标记为未签名测试版，不能标记为稳定正式版。

如果以后配置正式证书，应通过安全的 CI Secret 或构建机环境变量提供，不要把 `.pfx`、密码或私钥提交到仓库。签名完成后仍须重新运行安装、启动和卸载验收。

## 六、常见问题

### 在 Mac 上运行 `npm run pack:win` 立即失败

这是预期保护。项目不接受 macOS 交叉打包结果。请改用真实 Windows x64 电脑、Windows 虚拟机或 GitHub Actions 的 `windows-latest`。

### `npm ci` 失败

先确认正在使用 Node.js 20，并确认源码中存在完整的 `package-lock.json`。优先在新的、干净的源码目录中重试，不要随意修改锁文件来绕过错误。

### Electron 下载缓慢或中断

正常情况下直接重试 `npm ci` 或 `npm run pack:win`。如果已经从可信来源取得与项目 Electron 版本完全一致的 `win32-x64.zip`，可指定本地缓存：

```powershell
node -p "'electron-v' + require('electron/package.json').version + '-win32-x64.zip'"
$env:GITFINDER_ELECTRON_ZIP = 'D:\cache\electron-v<版本>-win32-x64.zip'
npm run pack:win
```

构建脚本会用 Electron 包内的官方校验值核对文件，版本或 SHA256 不匹配时会拒绝构建。

### 运行时验收提示找不到 `git.exe`

安装 Git for Windows，确认 `git --version` 可以在同一个 PowerShell 窗口执行，然后重新运行验收。

### 安装或启动验收提示应用提前退出

查看启动日志：

```powershell
Get-Content "$env:TEMP\gitfinder-2-startup.log" -Tail 80
```

同时检查 `dist\windows-install-verification.json` 是否生成；若没有生成，以上一次命令显示的第一个错误为准排查。

### 安装包出现 SmartScreen 提示

先核对 SHA256；若元数据中的 `unsignedTestBuild` 为 `true`，这是未签名内部 Alpha 的已知边界。面向外部分发前必须配置可信的 Windows 代码签名并重新验收。

## 七、交付清单

向测试人员交付时，至少提供：

- `GitFinder-2-<版本>-x64-win-setup.exe`；
- `SHA256SUMS-windows.txt`；
- `windows-release-metadata.json`；
- 本次测试范围和已知问题。

内部完整归档还应保存：

- 免安装 ZIP；
- `windows-runtime-verification.json`；
- `windows-install-verification.json`；
- 对应 Git 提交号和源码版本。

历史实机验收示例可参考 [alpha.35 白板包与 Windows 测试版](./verification/2.0.0-alpha.35-whiteboard-packages-windows.md)。
