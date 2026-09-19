# 部署卡片名称独占整行 · alpha204

2026-09-19 +08:00，GF-CARD-NAME-001。基线alpha203/bb82970。

用户截图中的名称夹在42px图标与状态之间，提前省略。仅部署卡片将名称移至header之后的完整正文行，上方图标收为24px，与类型和状态并列；收紧环境行上间距，不改变卡片持久化尺寸、访问点胶囊或容器标题。

回归：原源码新增用例失败，修复后relationship-flow-engine 20/20。隔离Electron真实DOM检查长名称位置、整行宽度、全名提示及底部按钮边界通过，连同容器标题、拖动、保存重开共29项通过。证据dist/container-headers-ui-p3yw92/result.json及deployment-name.png，已查看截图。

全量检查：默认TMPDIR运行及单测重试均在既有repository-task-ledger测试的projectRoot字符串比较失败（/var与/private/var路径）；未改相关业务，使用规范真实路径 `TMPDIR=/private/tmp npm run check` 通过1413测试、298JS。打包、安装和推送待执行；用户确认pending。不对未知长度名称承诺永不省略，超宽仍省略并保留悬停全名。只读离线夹具不探测远端，不改真实白板。

安装阶段：源码提交7e61176，macOS arm64开发包产物门禁通过。已正常退出旧版，将alpha203移到`/Volumes/project/制品与备份/GitFinder-2-alpha203-before204.app.disabled`，安装到`/Applications/GitFinder 2.app`；codesign验证通过、Info.plist版本alpha204。安装专项正在运行，尚未推送；本包ad-hoc，无正式公证或Windows验收。

安装验收完成：`node scripts/verify-container-headers.js --app '/Applications/GitFinder 2.app/Contents/MacOS/GitFinder 2 Alpha'` 29/29，证据`dist/container-headers-ui-IJNBuG/result.json`。正常启动原用户配置，界面版本alpha204、83节点/33关系已恢复；通过原生UI缩放核对用户所指cyberbegging，名称完整单独一行。未点击刷新/访问/远端操作，仅缩放原视口；没有改动布局或业务数据。用户确认仍pending。下一步推送源码和交付记录。

交付收口：源码`7e61176453d5ff370d3770c95979106d188c3a08`已成功推送origin/main。保持原有10项未提交文件，不发布Windows或正式商店版本。
