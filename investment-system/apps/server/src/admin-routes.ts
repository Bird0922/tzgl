import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AdminService, type DepartmentInput, type PositionInput, type RoleInput, type UnitInput, type UserInput } from './admin-service.js';
import { AuthService } from './auth-service.js';
import type { AuthContext, EntityStatus } from './types.js';
import {
  nonNegativeInteger, objectBody, optionalId, optionalText, pagination, passwordText,
  positiveInteger, requiredId, requiredText, statusValue, stringArray
} from './validation.js';

function queryObject(request: FastifyRequest): Record<string, unknown> {
  return objectBody(request.query ?? {});
}

function optionalStatus(value: unknown): EntityStatus | undefined {
  return value === undefined || value === '' ? undefined : statusValue(value);
}

function paged<T>(items: T[], page: number, pageSize: number, offset: number) {
  return { items: items.slice(offset, offset + pageSize), total: items.length, page, pageSize };
}

async function adminContext(
  request: FastifyRequest,
  auth: AuthService,
  permission: string,
  write = false
): Promise<AuthContext> {
  const context = await auth.authenticate(request, { csrf: write });
  auth.requirePermission(context, 'admin.access');
  auth.requirePermission(context, permission);
  return context;
}

async function adminAnyContext(request: FastifyRequest, auth: AuthService, permissions: string[]): Promise<AuthContext> {
  const context = await auth.authenticate(request);
  auth.requirePermission(context, 'admin.access');
  auth.requireAnyPermission(context, permissions);
  return context;
}

function unitInput(bodyValue: unknown, requireVersion: boolean): UnitInput {
  const body = objectBody(bodyValue);
  return {
    parentId: optionalId(body.parentId, '上级单位'),
    code: requiredText(body.code, '单位编码', 64, /^[A-Za-z0-9._-]+$/),
    name: requiredText(body.name, '单位名称', 200),
    status: statusValue(body.status ?? 'ACTIVE'),
    sortOrder: nonNegativeInteger(body.sortOrder, '排序号'),
    version: requireVersion ? positiveInteger(body.version, '版本号') : undefined
  };
}

function departmentInput(bodyValue: unknown, requireVersion: boolean): DepartmentInput {
  const body = objectBody(bodyValue);
  return {
    unitId: requiredId(body.unitId, '所属单位'),
    code: requiredText(body.code, '部门编码', 64, /^[A-Za-z0-9._-]+$/),
    name: requiredText(body.name, '部门名称', 200),
    departmentHeadUserId: optionalId(body.departmentHeadUserId, '部门负责人'),
    supervisingLeaderUserId: optionalId(body.supervisingLeaderUserId, '分管领导'),
    status: statusValue(body.status ?? 'ACTIVE'),
    sortOrder: nonNegativeInteger(body.sortOrder, '排序号'),
    version: requireVersion ? positiveInteger(body.version, '版本号') : undefined
  };
}

function positionInput(bodyValue: unknown, requireVersion: boolean): PositionInput {
  const body = objectBody(bodyValue);
  return {
    departmentId: requiredId(body.departmentId, '所属部门'),
    code: requiredText(body.code, '岗位编码', 64, /^[A-Za-z0-9._-]+$/),
    name: requiredText(body.name, '岗位名称', 200),
    status: statusValue(body.status ?? 'ACTIVE'),
    sortOrder: nonNegativeInteger(body.sortOrder, '排序号'),
    version: requireVersion ? positiveInteger(body.version, '版本号') : undefined
  };
}

function roleInput(bodyValue: unknown, requireVersion: boolean): RoleInput {
  const body = objectBody(bodyValue);
  return {
    code: requiredText(body.code, '角色编码', 64, /^[A-Z][A-Z0-9_.:-]*$/),
    name: requiredText(body.name, '角色名称', 200),
    description: optionalText(body.description, '角色说明', 500),
    status: statusValue(body.status ?? 'ACTIVE'),
    permissionCodes: stringArray(body.permissionCodes ?? [], '权限列表'),
    version: requireVersion ? positiveInteger(body.version, '版本号') : undefined
  };
}

function userInput(bodyValue: unknown, requireVersion: boolean): UserInput {
  const body = objectBody(bodyValue);
  const email = optionalText(body.email, '电子邮箱', 200, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const password = body.password === undefined ? undefined : passwordText(body.password, '初始密码');
  return {
    employeeNo: requiredText(body.employeeNo, '人员编号', 64, /^[A-Za-z0-9._-]+$/),
    username: requiredText(body.username, '登录名', 100, /^[A-Za-z0-9._-]+$/),
    displayName: requiredText(body.displayName, '人员姓名', 100),
    mobile: optionalText(body.mobile, '手机号码', 32, /^[0-9+() -]+$/),
    email,
    departmentId: requiredId(body.departmentId, '所属部门'),
    positionId: requiredId(body.positionId, '所属岗位'),
    status: statusValue(body.status ?? 'ACTIVE'),
    roleIds: stringArray(body.roleIds ?? [], '角色列表'),
    password,
    version: requireVersion ? positiveInteger(body.version, '版本号') : undefined
  };
}

export async function registerAdminRoutes(app: FastifyInstance, auth: AuthService, admin: AdminService) {
  app.get('/api/v1/admin/units', async request => {
    await adminAnyContext(request, auth, [
      'admin.unit.read', 'admin.unit.manage', 'admin.department.read', 'admin.department.manage',
      'admin.position.read', 'admin.position.manage', 'admin.user.read', 'admin.user.manage'
    ]);
    const query = queryObject(request);
    const paging = pagination(query);
    const items = await admin.listUnits({
      q: optionalText(query.q, '搜索词', 100) ?? undefined,
      status: optionalStatus(query.status)
    });
    return { success: true, data: paged(items, paging.page, paging.pageSize, paging.offset) };
  });
  app.post('/api/v1/admin/units', async (request, reply) => {
    const context = await adminContext(request, auth, 'admin.unit.manage', true);
    return reply.status(201).send({ success: true, data: await admin.createUnit(unitInput(request.body, false), context, request) });
  });
  app.put<{ Params: { id: string } }>('/api/v1/admin/units/:id', async request => {
    const context = await adminContext(request, auth, 'admin.unit.manage', true);
    return { success: true, data: await admin.updateUnit(requiredId(request.params.id, '单位ID'), unitInput(request.body, true), context, request) };
  });
  app.delete<{ Params: { id: string } }>('/api/v1/admin/units/:id', async request => {
    const context = await adminContext(request, auth, 'admin.unit.manage', true);
    await admin.deleteUnit(requiredId(request.params.id, '单位ID'), context, request);
    return { success: true, data: null };
  });

  app.get('/api/v1/admin/departments', async request => {
    await adminAnyContext(request, auth, [
      'admin.department.read', 'admin.department.manage', 'admin.position.read', 'admin.position.manage',
      'admin.user.read', 'admin.user.manage'
    ]);
    const query = queryObject(request);
    const paging = pagination(query);
    const items = await admin.listDepartments({
      unitId: query.unitId ? requiredId(query.unitId, '单位ID') : undefined,
      q: optionalText(query.q, '搜索词', 100) ?? undefined,
      status: optionalStatus(query.status)
    });
    return { success: true, data: paged(items, paging.page, paging.pageSize, paging.offset) };
  });
  app.post('/api/v1/admin/departments', async (request, reply) => {
    const context = await adminContext(request, auth, 'admin.department.manage', true);
    return reply.status(201).send({ success: true, data: await admin.createDepartment(departmentInput(request.body, false), context, request) });
  });
  app.put<{ Params: { id: string } }>('/api/v1/admin/departments/:id', async request => {
    const context = await adminContext(request, auth, 'admin.department.manage', true);
    return { success: true, data: await admin.updateDepartment(requiredId(request.params.id, '部门ID'), departmentInput(request.body, true), context, request) };
  });
  app.delete<{ Params: { id: string } }>('/api/v1/admin/departments/:id', async request => {
    const context = await adminContext(request, auth, 'admin.department.manage', true);
    await admin.deleteDepartment(requiredId(request.params.id, '部门ID'), context, request);
    return { success: true, data: null };
  });

  app.get('/api/v1/admin/positions', async request => {
    await adminAnyContext(request, auth, [
      'admin.position.read', 'admin.position.manage', 'admin.user.read', 'admin.user.manage'
    ]);
    const query = queryObject(request);
    const paging = pagination(query);
    const items = await admin.listPositions({
      unitId: query.unitId ? requiredId(query.unitId, '单位ID') : undefined,
      departmentId: query.departmentId ? requiredId(query.departmentId, '部门ID') : undefined,
      q: optionalText(query.q, '搜索词', 100) ?? undefined,
      status: optionalStatus(query.status)
    });
    return { success: true, data: paged(items, paging.page, paging.pageSize, paging.offset) };
  });
  app.post('/api/v1/admin/positions', async (request, reply) => {
    const context = await adminContext(request, auth, 'admin.position.manage', true);
    return reply.status(201).send({ success: true, data: await admin.createPosition(positionInput(request.body, false), context, request) });
  });
  app.put<{ Params: { id: string } }>('/api/v1/admin/positions/:id', async request => {
    const context = await adminContext(request, auth, 'admin.position.manage', true);
    return { success: true, data: await admin.updatePosition(requiredId(request.params.id, '岗位ID'), positionInput(request.body, true), context, request) };
  });
  app.delete<{ Params: { id: string } }>('/api/v1/admin/positions/:id', async request => {
    const context = await adminContext(request, auth, 'admin.position.manage', true);
    await admin.deletePosition(requiredId(request.params.id, '岗位ID'), context, request);
    return { success: true, data: null };
  });

  app.get('/api/v1/admin/permissions', async request => {
    await adminContext(request, auth, 'admin.role.read');
    return { success: true, data: await admin.listPermissions() };
  });
  app.get('/api/v1/admin/roles', async request => {
    await adminAnyContext(request, auth, ['admin.role.read', 'admin.role.manage', 'admin.user.read', 'admin.user.manage']);
    const query = queryObject(request);
    const paging = pagination(query);
    return { success: true, data: await admin.listRoles({
      ...paging,
      q: optionalText(query.q, '搜索词', 100) ?? undefined,
      status: optionalStatus(query.status)
    }) };
  });
  app.post('/api/v1/admin/roles', async (request, reply) => {
    const context = await adminContext(request, auth, 'admin.role.manage', true);
    return reply.status(201).send({ success: true, data: await admin.createRole(roleInput(request.body, false), context, request) });
  });
  app.put<{ Params: { id: string } }>('/api/v1/admin/roles/:id', async request => {
    const context = await adminContext(request, auth, 'admin.role.manage', true);
    return { success: true, data: await admin.updateRole(requiredId(request.params.id, '角色ID'), roleInput(request.body, true), context, request) };
  });
  app.delete<{ Params: { id: string } }>('/api/v1/admin/roles/:id', async request => {
    const context = await adminContext(request, auth, 'admin.role.manage', true);
    await admin.deleteRole(requiredId(request.params.id, '角色ID'), context, request);
    return { success: true, data: null };
  });

  app.get('/api/v1/admin/users', async request => {
    await adminContext(request, auth, 'admin.user.read');
    const query = queryObject(request);
    const paging = pagination(query);
    return { success: true, data: await admin.listUsers({
      ...paging,
      q: optionalText(query.q, '搜索词', 100) ?? undefined,
      unitId: query.unitId ? requiredId(query.unitId, '单位ID') : undefined,
      departmentId: query.departmentId ? requiredId(query.departmentId, '部门ID') : undefined,
      status: optionalStatus(query.status)
    }) };
  });
  app.post('/api/v1/admin/users', async (request, reply) => {
    const context = await adminContext(request, auth, 'admin.user.manage', true);
    return reply.status(201).send({ success: true, data: await admin.createUser(userInput(request.body, false), context, request) });
  });
  app.put<{ Params: { id: string } }>('/api/v1/admin/users/:id', async request => {
    const context = await adminContext(request, auth, 'admin.user.manage', true);
    return { success: true, data: await admin.updateUser(requiredId(request.params.id, '人员ID'), userInput(request.body, true), context, request) };
  });
  app.delete<{ Params: { id: string } }>('/api/v1/admin/users/:id', async request => {
    const context = await adminContext(request, auth, 'admin.user.manage', true);
    await admin.deleteUser(requiredId(request.params.id, '人员ID'), context, request);
    return { success: true, data: null };
  });
  app.post<{ Params: { id: string } }>('/api/v1/admin/users/:id/reset-password', async request => {
    const context = await adminContext(request, auth, 'admin.user.manage', true);
    const body = objectBody(request.body);
    await admin.resetPassword(
      requiredId(request.params.id, '人员ID'),
      passwordText(body.password, '临时密码'),
      context,
      request
    );
    return { success: true, data: null };
  });

  app.get('/api/v1/directory/units', async request => {
    const context = await auth.authenticate(request);
    auth.requireAnyPermission(context, [
      'investment.intention.create', 'investment.intention.update',
      'investment.group_decision.create', 'investment.group_decision.update',
      'admin.unit.read'
    ]);
    return { success: true, data: await admin.directoryUnits() };
  });
  app.get('/api/v1/directory/users', async request => {
    const context = await auth.authenticate(request);
    auth.requireAnyPermission(context, [
      'investment.intention.create', 'investment.intention.update',
      'investment.group_decision.create', 'investment.group_decision.update',
      'admin.user.read', 'admin.department.manage'
    ]);
    const query = queryObject(request);
    return { success: true, data: await admin.directoryUsers({
      unitId: query.unitId ? requiredId(query.unitId, '单位ID') : undefined,
      departmentId: query.departmentId ? requiredId(query.departmentId, '部门ID') : undefined,
      permission: optionalText(
        query.permission,
        '权限编码',
        128,
        /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/
      ) ?? undefined
    }) };
  });
}
