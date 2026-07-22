# 投资管理系统

当前版本已完成“股权投资意向登记”和“集团决策申请”的全栈业务闭环。

## 已实现范围

- 股权投资意向登记表单
- 所有业务字段可空
- MySQL 持久化
- `TZ-年度-月份-4位序号` 并发安全编号
- 保存待发、发送、同意、退回
- 全局审批策略：所有单据统一按“经办人 → 经办部门负责人 → 经办部门分管领导”流转
- 审批历史记录
- 调研报告附件上传与下载
- 数据版本控制，避免多人同时修改时相互覆盖
- 版本化数据库迁移
- 集团决策申请及资金计划
- 集团决策申请的数据权限、输入校验和全局审批策略复用

## 技术结构

```text
investment-system/
├── apps/
│   ├── server/       Fastify + TypeScript 后端
│   └── web/          Vue 3 + TypeScript 前端
├── database/
│   └── migrations/   MySQL 迁移脚本
├── uploads/          本地附件目录，运行后生成
├── .env.example      环境配置示例
└── pnpm-workspace.yaml
```

## 本地运行要求

- Node.js 24
- pnpm 11
- MySQL 8

复制 `.env.example` 为 `.env`，填写本地数据库密码。真实密码不要提交到代码仓库。

安装依赖：

```bash
pnpm install
```

同时启动前后端：

```bash
pnpm dev
```

启动后访问：

- 前端：http://127.0.0.1:5173/
- 后端健康检查：http://127.0.0.1:3000/api/v1/health

后端启动时会自动执行尚未应用的 `database/migrations` 迁移文件，并将执行记录写入 `tz_schema_migration`。

## 主要接口

```text
GET    /api/v1/investment-intentions
GET    /api/v1/approval-policy
GET    /api/v1/group-decision-applications
POST   /api/v1/group-decision-applications
GET    /api/v1/group-decision-applications/:id
PUT    /api/v1/group-decision-applications/:id
POST   /api/v1/group-decision-applications/:id/submit
POST   /api/v1/group-decision-applications/:id/approve
POST   /api/v1/group-decision-applications/:id/return
POST   /api/v1/investment-intentions
GET    /api/v1/investment-intentions/:id
PUT    /api/v1/investment-intentions/:id
POST   /api/v1/investment-intentions/:id/submit
POST   /api/v1/investment-intentions/:id/approve
POST   /api/v1/investment-intentions/:id/return
POST   /api/v1/investment-intentions/:id/attachments
GET    /api/v1/attachments/:id/download
```

## 当前身份处理

为了在正式用户、组织和登录模块开发前验证业务闭环，当前版本通过以下请求头传递开发用户上下文：

```text
X-User-Id
X-User-Name
X-User-Role
```

角色值包括：

- `initiator`：经办人
- `department_head`：经办部门负责人
- `division_leader`：经办部门分管领导

后续新增单据必须复用后端 `GLOBAL_APPROVAL_POLICY`，不得在各业务模块中另建审批节点顺序。

集团决策申请页面：

```text
http://127.0.0.1:5173/?document=group-decision-application
```

前端的“办理身份”切换仅用于当前开发联调。进入下一阶段后，应替换为正式登录、组织、岗位、角色和数据权限体系。
