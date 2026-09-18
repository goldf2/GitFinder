# alpha.199 · 在线/离线 Project 操作一致性

任务：GF-CONTAINER-LIFECYCLE-001。基线：`a9dae12` / alpha.198。

## 用户问题与范围

接续资源容器修复中尚未完成的生命周期诊断。alpha.198 的卡片 Coolify 入口与系统默认浏览器策略已经交付，本轮不重复实现、不默认开启实验进度页，不合入并行双源更新。工作在 `dist/agentdock-container-lifecycle-20260918/work` 的独立分支 `fix/container-lifecycle-199`；主目录原10项未提交内容已保存字节、SHA-256和原差异。

## 根因与修复

便携白板按现有规则剥离 runtime，且已用稳定实体 ID 保留 Project 身份。若部分操作仍只检查 `runtime.dynamicKind`，同一来源 Project 在离线重开后会被当成手动群组：Delete 可能变成解散并解绑成员，成员可能被移出或重新分组，标题、右键和属性表单还会给出不一致操作。

本轮复用 `relationshipResourceComposition.isProjectContainer()`，没有增加文件格式、管理字段或数据库迁移。

| 检查点 | 修正后的行为 |
| --- | --- |
| Project 标题操作 | 在线和离线均“从白板隐藏”，不再因断网变成“解散容器”。 |
| 删除快捷键和右键 | 来源 Project 只隐藏，不删除其实体、成员和关系；手动群组仍可解散并保留成员。 |
| 成员归属 | 来源 Project 和其成员均不能用手工分组操作改变采样归属。也不能通过离线目标容器接纳原本不属于它的手工元素。 |
| 属性面板 | 来源 Project 不显示不适用的“上级群组”选择器；外观调整保留。 |
| 范围选择 | 离线 Project 仍出现在 Project 范围选项内。 |
| 隐藏恢复 | 使用已有隐藏记录、历史和资源库恢复逻辑，单独隐藏的子项不因恢复父级而被强行显示，共享访问点不误伤另一主机。 |

剩余 `runtime.dynamicKind` 使用未一律替换。实时同步需要区别临时投影和已保存快照，不能把实时属性条件机械替换成永久身份判断。本轮不改远端数据、不修改普通卡片删除语义、不批量重写现有白板。

## 回归证据

- 对 alpha.198 新增10项行为/装配检查，9项失败、1项通过；多个失败覆盖同一根因的不同入口，不宣称发现9个独立缺陷。
- 修正后39/39（既有29项资源组合加新10项生命周期）通过。涵盖在线/离线成员、作为目标的Project、隐藏/删除、上下文/属性、恢复、共享访问点、普通分组和范围选择。
- 原始日志：`dist/agentdock-container-lifecycle-20260918/lifecycle-before.log`、`lifecycle-after.log`。
- `scripts/verify-resource-containers.js`扩展离线重启后的真实标题点击、隐藏保存读回、撤销/重做、再次重启、资源库恢复、Cmd+Shift+G与Backspace。合成来源且只使用自建profile，真实文件服务与磁盘读回；CDP输入不冒充原生系统辅助功能测试。

## 实际文件读回发现的第二处缺口

首轮扩展UI到重做隐藏时，内存hiddenResourceIds正确，但真实磁盘文件没有该字段。核对保存链路发现`_buildActiveBoardExportStore()`只复制view/placements等，遗漏模型已支持的hiddenResourceIds。它同时用于独立文档保存、另存为和导出，因此这不是测试夹具问题。修复仅保留既有隐藏列表的副本，不保存新字段或删除资源。

新增两项导出/真实文件服务回归，修复前2/2失败，修复后41/41专项通过；初轮全量1355/1355、293JS是此修正前结果，不作为最终交付数量。失败日志见`source-ui-hidden-save-before.log`及`persistence-before.log`。

## 当前状态与交付门槛

最终41项资源/生命周期专项、源码29项UI（原21+新8）通过。用户可见离线标题菜单截图已核对只提供隐藏，真实文件隐藏状态经冷启动保持、资源库可以恢复。下一步从本轮提交重跑完整检查并构建、可恢复安装与推送；未完成前不声称已交付。用户实际体验确认与内部验收分开。

复跑：`node --test test/relationship-resource-composition.test.js`；`node scripts/verify-resource-containers.js`，安装版追加 `--app '/Applications/GitFinder 2.app/Contents/MacOS/GitFinder 2 Alpha'`。

第二轮UI在恢复成功后的断言中错误地认为空隐藏列表必须存在；现有模型会省略空数组。已修正测试对可选字段的读取，未更改产品空列表语义；失败日志`source-ui-optional-field-before.log`保留。工具一次只读调用安全状态未确定，原样重试成功，未改变安全设置。
