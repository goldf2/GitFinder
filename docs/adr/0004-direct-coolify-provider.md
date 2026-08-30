# ADR-0004：GitFinder 直接连接 Coolify

- 状态：已接受，首个只读垂直切片已实现
- 日期：2026-08-29
- 取代：ADR-0001、ADR-0002 与 ADR-0003 中将 Xiangshu Panel 作为必需运行依赖的部分

## 背景

GitFinder 的核心闭环是把本地项目、Git 仓库、部署资源、服务器和站点放在同一工作区中。若动态部署事实必须先经过另一个自研面板，GitFinder 的可用性、发布节奏和数据契约都会被该面板约束。

产品决定 GitFinder 应独立实现 Coolify 连接。`coolify-dashboard` 可作为字段归一化和交互经验的参考，但不能成为 GitFinder 的运行依赖或部署前置条件。

## 决策

1. GitFinder 直接连接用户明确添加的一个或多个 Coolify 管理站点根地址。
2. 只使用 Coolify 官方 `/api/v1` GET 端点，首批读取 applications、services、databases、servers、projects 和 application deployment history。
3. Token 必须只具备 `read` 权限；界面明确提示不要授予 `read:sensitive`、`write`、`deploy` 或 `root`。
4. Token 作为应用自有会话保存在 `coolify-session.json`，不读取系统钥匙串，不保存 Coolify 密码，也不进入项目、Git、白板、日志或导出文件。
5. `.gitfinder/deployments.json` 只保存 `providerKind=coolify`、Provider/服务器/项目/环境/资源稳定 ID 和本地 `repositoryId`。
6. 动态服务器与部署继续以只读投影方式加入白板，不写入用户维护的关系事实；断线或资源消失时保留节点并标记缺失。
7. 当前状态和最近部署结果是独立维度。只有取得部署记录时才显示最近失败“是”或“否”；没有证据时显示“未知”。
8. Coolify API 没有提供的主机或站点延迟不得伪造。后续如增加探测，必须标明探测对象、来源、时间和失败语义。
9. 首批不提供部署、重启、停止、删除、日志读取、环境变量读取或服务器配置写入。

## 运行时结构

```text
GitFinder Renderer
  -> 受信 IPC（当前沿用 panel:* 兼容命名）
    -> CoolifyProviderService
      -> https://coolify.example.com/api/v1/*

本机应用数据：coolify-session.json（地址、标签、只读 Token）
项目便携数据：.gitfinder/deployments.json（稳定 ID，不含地址与凭据）
白板文件：节点布局与手工关系（不含 Token、绝对路径和动态响应原文）
```

`panel:*` 只是当前 preload/IPC 的内部兼容命名，不表示请求 Xiangshu Panel，也不是对外契约。后续可在不改变用户数据的前提下迁移为中性的 `deployments:*`。

## 验收标准

- 填写 Coolify 根地址和 `read` Token 后，GitFinder 只发 GET 请求并保持本机登录状态。
- 不存在 `/api/gitfinder/v1` 请求，也不需要部署或修改 `coolify-dashboard`。
- 多个 Coolify 实例的同名资源通过 `providerId + resourceUuid` 隔离。
- 白板可以分类显示服务器、部署和访问端点，并与本地项目/仓库建立显式关系。
- 无部署历史、无服务器映射或接口部分失败时显示未知/部分失败，不伪造健康状态。

## 参考

- [Coolify API Authorization](https://coolify.io/docs/api-reference/authorization)
- [Coolify Applications List](https://coolify.io/docs/api-reference/api/applications/list-applications)
- [Coolify Servers List](https://coolify.io/docs/api-reference/api/servers/list-servers)
- [Coolify Application Deployments](https://coolify.io/docs/api-reference/api/deployments/list-deployments-by-app-uuid)
