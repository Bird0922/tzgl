# 接口契约

`openapi.yaml` 是投资管理系统前后端接口的唯一契约来源。新增或修改接口时应先更新契约，再修改实现。

约定：

- 服务基地址为 `/api/v1`。
- 除健康检查、初始化状态、初始化和登录外，接口使用 `ltc_session` HttpOnly Cookie 认证。
- 所有 `POST`、`PUT`、`DELETE` 业务请求必须携带当前会话返回的 `X-CSRF-Token`。
- `x-permissions` 表示后端实际强制校验的权限编码；空数组表示公开接口。
- 金额使用十进制字符串传输，最多两位小数；收益率使用十进制字符串传输，单位为百分比。
- 日期使用 `YYYY-MM-DD`，时间使用 ISO 8601。
- JSON 示例统一存放在 `contracts/examples/`，且必须被 `openapi.yaml` 引用。

执行 `pnpm contracts:check` 可校验契约元数据、JSON 示例以及所有 Fastify 路由的一致性。
