# 多产品数据与 Supabase 策略

## 结论

不为所有应用选择同一种存储，也不立即自建整套 Supabase。按数据职责分层：

| 数据 | 当前推荐 | 可迁移目标 |
| --- | --- | --- |
| GitFinder 离线配置、白板、缓存 | 本机配置文件/SQLite | 保持本地优先 |
| 网站业务数据、协作元数据、用户空间索引 | 托管 PostgreSQL（现阶段可继续 Supabase） | RDS PostgreSQL 或自管 PostgreSQL |
| 登录身份 | Casdoor/OIDC | 同一技术栈，产品用户域可隔离 |
| 安装包、附件、用户大文件 | OSS/对象存储 | 兼容 S3 的其他对象存储 |
| 软件商店发布目录 | PostgreSQL 元数据 + 对象存储制品 | 不长期停留在单机 JSON 文件 |

## 为什么暂不自建整套 Supabase

托管 Supabase 提供的是标准 PostgreSQL，并承担基础设施、备份和可观测性的一部分。自建 Supabase 则需要自行维护数据库、网关、Auth、PostgREST、Realtime、Storage、升级、监控、备份和灾难恢复。既然认证计划独立为 Casdoor，若项目没有重度依赖 Realtime、Storage 和客户端直连 Data API，自建整套 Supabase 的收益通常小于运维成本。

## 避免锁定

- 数据库迁移必须使用普通 SQL migration，业务表避免依赖 Supabase Auth 的 `auth.users` 外键。
- 后端通过仓储/服务层访问 PostgreSQL；桌面和浏览器客户端不持有数据库 service key。
- 用户主键保存产品内 `user_id`，另表保存 `(issuer, subject)` 身份绑定。
- 文件表只保存对象键、大小、哈希和所有者；文件字节不放 PostgreSQL。
- 需要 RLS 时把它作为数据库安全层，不把它当成唯一业务授权层。

## 何时迁移

出现以下任一明确条件再迁移：

- 国内客户的延迟、网络可达性或数据驻留要求不能满足。
- 托管成本连续高于自建加运维的总成本。
- 需要专有网络、审计、备份周期或高可用等级。
- 已具备数据库升级、监控、备份恢复演练和安全值班能力。

优先迁移到托管 RDS PostgreSQL；只有需要整套 Supabase API 且团队愿意承担全部运维时，才自建 Supabase。
