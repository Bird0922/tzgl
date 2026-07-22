# 投资管理系统

当前版本包含股权投资意向登记、正式登录会话、RBAC 权限和后台组织人员管理。

## 已实现范围

- 首次本机初始化系统管理员
- 用户名密码登录、数据库会话、CSRF 校验和密码强制修改
- 单位树、部门、岗位、角色、权限和人员管理
- 登录锁定、会话撤销、最后一名系统管理员保护和安全审计
- 我的发起、我的待办和全部投资意向
- 申请人身份从当前会话取得，提交时固化部门负责人和分管领导
- 保存待发、提交、部门负责人审批、分管领导审批和退回
- 附件类型、签名、大小、数量、随机文件名和下载权限校验
- 乐观锁版本控制和版本化 MySQL 迁移

## 技术结构

```text
investment-system/
├── apps/
│   ├── server/       Fastify + TypeScript 后端
│   └── web/          Vue 3 + TypeScript 前端
├── database/
│   └── migrations/   MySQL 版本化迁移脚本
├── uploads/          本地附件目录，运行后生成
├── .env.example      环境配置示例
└── pnpm-workspace.yaml
```

## 本地运行

运行环境：Node.js 24、pnpm 11、MySQL 8。

复制 `.env.example` 为 `.env` 并填写数据库连接信息。数据库密码等敏感信息不得提交到仓库。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

默认地址：

- 前端：http://127.0.0.1:5173/
- 后端：http://127.0.0.1:3000/api/v1/health

后端启动时自动执行尚未应用的 `database/migrations` 迁移，并将结果写入 `tz_schema_migration`。

## 首次初始化

系统无用户时访问 `/setup`。初始化接口只接受服务器 loopback 地址直接发起、且不带代理转发头的请求。必须先在服务器本机完成初始化，再开放反向代理或公网访问。

首次初始化只创建系统管理员。管理员可以暂时没有部门和岗位，但补充组织归属前不能发起投资业务。

## 主要接口

```text
GET    /api/v1/setup/status
POST   /api/v1/setup/initialize
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
POST   /api/v1/auth/change-password

GET/POST       /api/v1/admin/units
GET/POST       /api/v1/admin/departments
GET/POST       /api/v1/admin/positions
GET/POST       /api/v1/admin/roles
GET/POST       /api/v1/admin/users
PUT/DELETE     /api/v1/admin/{resource}/:id
POST           /api/v1/admin/users/:id/reset-password
GET            /api/v1/admin/permissions

GET    /api/v1/directory/units
GET    /api/v1/directory/users

GET/POST   /api/v1/investment-intentions
GET/PUT    /api/v1/investment-intentions/:id
POST       /api/v1/investment-intentions/:id/submit
POST       /api/v1/investment-intentions/:id/approve
POST       /api/v1/investment-intentions/:id/return
POST       /api/v1/investment-intentions/:id/attachments
GET        /api/v1/attachments/:id/download
```

写接口必须携带当前会话对应的 `X-CSRF-Token`。浏览器会话使用 `HttpOnly`、`SameSite=Lax` Cookie；生产环境自动启用 `Secure`。

## 验证命令

```bash
pnpm test
pnpm build
pnpm audit --audit-level high
```
