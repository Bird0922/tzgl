import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseName = process.env.LTC_INTEGRATION_DB;
const integrationSuite = databaseName ? describe : describe.skip;
const baseHeaders = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:5173' };
const systemAdminRoleId = '00000000-0000-0000-0000-000000000001';

interface Session {
  cookie: string;
  csrfToken: string;
}

function responseBody<T = Record<string, unknown>>(response: LightMyRequestResponse): T {
  return response.json() as T;
}

function sessionFrom(response: LightMyRequestResponse): Session {
  const setCookie = response.headers['set-cookie'];
  const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const body = responseBody<{ data: { csrfToken: string } }>(response);
  return { cookie: String(cookieValue).split(';')[0], csrfToken: body.data.csrfToken };
}

integrationSuite('身份权限与投资审批数据库集成', () => {
  let app: FastifyInstance;
  let pool: Pool;

  beforeAll(async () => {
    pool = mysql.createPool({
      host: process.env.LTC_INTEGRATION_DB_HOST ?? '127.0.0.1',
      port: Number(process.env.LTC_INTEGRATION_DB_PORT ?? 3306),
      user: process.env.LTC_INTEGRATION_DB_USER ?? 'root',
      password: process.env.LTC_INTEGRATION_DB_PASSWORD ?? '',
      database: databaseName,
      multipleStatements: true,
      dateStrings: true
    });
    const [{ runMigrations }, { buildApp }] = await Promise.all([
      import('./database.js'), import('./app.js')
    ]);
    await runMigrations(pool);
    app = await buildApp(pool);
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  async function authenticated(
    session: Session,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
    includeCsrf = method !== 'GET'
  ) {
    return app.inject({
      method,
      url,
      headers: {
        ...baseHeaders,
        cookie: session.cookie,
        ...(includeCsrf ? { 'x-csrf-token': session.csrfToken } : {})
      },
      ...(payload === undefined ? {} : { payload })
    });
  }

  async function login(username: string, password: string) {
    const response = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', headers: baseHeaders, payload: { username, password }
    });
    expect(response.statusCode).toBe(200);
    return sessionFrom(response);
  }

  async function replaceTemporaryPassword(username: string, temporaryPassword: string, newPassword: string) {
    const temporarySession = await login(username, temporaryPassword);
    const response = await authenticated(temporarySession, 'POST', '/api/v1/auth/change-password', {
      currentPassword: temporaryPassword, newPassword
    });
    expect(response.statusCode).toBe(200);
    return login(username, newPassword);
  }

  it('完成初始化、RBAC、组织配置与两级审批闭环', async () => {
    const unknownRoute = await app.inject({
      method: 'GET', url: '/api/v1/internal-path-does-not-exist', headers: { ...baseHeaders, origin: 'https://evil.example' }
    });
    expect(unknownRoute.statusCode).toBe(404);
    expect(responseBody<{ code: string; message: string }>(unknownRoute)).toMatchObject({
      code: 'NOT_FOUND', message: '请求的接口不存在'
    });
    expect(unknownRoute.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    expect(unknownRoute.headers['access-control-allow-origin']).not.toBe('https://evil.example');

    const initialize = (suffix: string) => app.inject({
      method: 'POST',
      url: '/api/v1/setup/initialize',
      headers: baseHeaders,
      payload: {
        employeeNo: `ADMIN-${suffix}`,
        username: `admin.${suffix}`,
        displayName: `系统管理员${suffix}`,
        password: 'Admin-Start-2026!'
      }
    });
    const initializationResults = await Promise.all([initialize('a'), initialize('b')]);
    expect(initializationResults.map(result => result.statusCode).sort()).toEqual([201, 409]);
    const initialization = initializationResults.find(result => result.statusCode === 201)!;
    const adminSession = sessionFrom(initialization);
    const initializedBody = responseBody<{ data: { user: { id: string; username: string } } }>(initialization);
    const adminUser = initializedBody.data.user;

    const firstTabSession = await authenticated(adminSession, 'GET', '/api/v1/auth/me');
    const secondTabSession = await authenticated(adminSession, 'GET', '/api/v1/auth/me');
    expect(responseBody<{ data: { csrfToken: string } }>(firstTabSession).data.csrfToken).toBe(adminSession.csrfToken);
    expect(responseBody<{ data: { csrfToken: string } }>(secondTabSession).data.csrfToken).toBe(adminSession.csrfToken);

    const missingCsrf = await authenticated(adminSession, 'POST', '/api/v1/admin/units', {
      parentId: null, code: 'UNIT-CSRF', name: 'CSRF测试单位', status: 'ACTIVE', sortOrder: 0
    }, false);
    expect(missingCsrf.statusCode).toBe(403);
    expect(responseBody<{ code: string }>(missingCsrf).code).toBe('CSRF_VALIDATION_FAILED');

    const unitResponse = await authenticated(adminSession, 'POST', '/api/v1/admin/units', {
      parentId: null, code: 'UNIT-HQ', name: '测试总部', status: 'ACTIVE', sortOrder: 1
    });
    expect(unitResponse.statusCode).toBe(201);
    const unit = responseBody<{ data: { id: string } }>(unitResponse).data;

    const departmentResponse = await authenticated(adminSession, 'POST', '/api/v1/admin/departments', {
      unitId: unit.id,
      code: 'INVESTMENT',
      name: '投资管理部',
      departmentHeadUserId: null,
      supervisingLeaderUserId: null,
      status: 'ACTIVE',
      sortOrder: 1
    });
    expect(departmentResponse.statusCode).toBe(201);
    const department = responseBody<{ data: { id: string; version: number } }>(departmentResponse).data;

    const positionResponse = await authenticated(adminSession, 'POST', '/api/v1/admin/positions', {
      departmentId: department.id, code: 'MANAGER', name: '投资经理', status: 'ACTIVE', sortOrder: 1
    });
    expect(positionResponse.statusCode).toBe(201);
    const position = responseBody<{ data: { id: string } }>(positionResponse).data;

    const usersResponse = await authenticated(adminSession, 'GET', '/api/v1/admin/users?pageSize=100');
    const adminItem = responseBody<{ data: { items: Array<{
      id: string; employeeNo: string; username: string; displayName: string; version: number;
    }> } }>(usersResponse).data.items.find(item => item.id === adminUser.id)!;
    const adminOrganization = {
      employeeNo: adminItem.employeeNo,
      username: adminItem.username,
      displayName: adminItem.displayName,
      mobile: null,
      email: null,
      departmentId: department.id,
      positionId: position.id,
      status: 'ACTIVE',
      version: adminItem.version
    };
    const removeLastAdmin = await authenticated(adminSession, 'PUT', `/api/v1/admin/users/${adminUser.id}`, {
      ...adminOrganization, roleIds: []
    });
    expect(removeLastAdmin.statusCode).toBe(409);
    expect(responseBody<{ code: string }>(removeLastAdmin).code).toBe('LAST_SYSTEM_ADMIN');
    const updateAdmin = await authenticated(adminSession, 'PUT', `/api/v1/admin/users/${adminUser.id}`, {
      ...adminOrganization, roleIds: [systemAdminRoleId]
    });
    expect(updateAdmin.statusCode).toBe(200);

    const createRole = async (code: string, name: string, permissionCodes: string[]) => {
      const response = await authenticated(adminSession, 'POST', '/api/v1/admin/roles', {
        code, name, description: null, status: 'ACTIVE', permissionCodes
      });
      expect(response.statusCode).toBe(201);
      return responseBody<{ data: { id: string } }>(response).data;
    };
    const departmentRole = await createRole('DEPARTMENT_APPROVER', '部门负责人', [
      'investment.intention.read', 'investment.intention.approve_department'
    ]);
    const supervisingRole = await createRole('SUPERVISING_APPROVER', '分管领导', [
      'investment.intention.read', 'investment.intention.approve_supervising'
    ]);

    const createUser = async (
      employeeNo: string, username: string, displayName: string, password: string, roleId: string
    ) => {
      const response = await authenticated(adminSession, 'POST', '/api/v1/admin/users', {
        employeeNo, username, displayName, password,
        mobile: null, email: null,
        departmentId: department.id,
        positionId: position.id,
        status: 'ACTIVE',
        roleIds: [roleId]
      });
      expect(response.statusCode).toBe(201);
      return responseBody<{ data: { id: string } }>(response).data;
    };
    const departmentHead = await createUser('HEAD-001', 'department.head', '部门负责人', 'Dept-Temp-2026!', departmentRole.id);
    const supervisingLeader = await createUser('LEADER-001', 'supervising.leader', '分管领导', 'Leader-Temp-2026!', supervisingRole.id);

    const updateDepartment = await authenticated(adminSession, 'PUT', `/api/v1/admin/departments/${department.id}`, {
      unitId: unit.id,
      code: 'INVESTMENT',
      name: '投资管理部',
      departmentHeadUserId: departmentHead.id,
      supervisingLeaderUserId: supervisingLeader.id,
      status: 'ACTIVE',
      sortOrder: 1,
      version: department.version
    });
    expect(updateDepartment.statusCode).toBe(200);

    const otherDepartmentResponse = await authenticated(adminSession, 'POST', '/api/v1/admin/departments', {
      unitId: unit.id,
      code: 'FINANCE',
      name: '财务管理部',
      departmentHeadUserId: null,
      supervisingLeaderUserId: null,
      status: 'ACTIVE',
      sortOrder: 2
    });
    expect(otherDepartmentResponse.statusCode).toBe(201);
    const otherDepartment = responseBody<{ data: { id: string } }>(otherDepartmentResponse).data;
    const otherPositionResponse = await authenticated(adminSession, 'POST', '/api/v1/admin/positions', {
      departmentId: otherDepartment.id, code: 'FINANCE-MANAGER', name: '财务经理', status: 'ACTIVE', sortOrder: 1
    });
    expect(otherPositionResponse.statusCode).toBe(201);
    const otherPosition = responseBody<{ data: { id: string } }>(otherPositionResponse).data;
    const headUsersResponse = await authenticated(
      adminSession, 'GET', '/api/v1/admin/users?q=department.head&pageSize=100'
    );
    expect(headUsersResponse.statusCode).toBe(200);
    const headItem = responseBody<{ data: { items: Array<{
      employeeNo: string; username: string; displayName: string; mobile: string | null;
      email: string | null; status: string; version: number;
    }> } }>(headUsersResponse).data.items[0];
    const moveConfiguredHead = await authenticated(adminSession, 'PUT', `/api/v1/admin/users/${departmentHead.id}`, {
      employeeNo: headItem.employeeNo,
      username: headItem.username,
      displayName: headItem.displayName,
      mobile: headItem.mobile,
      email: headItem.email,
      departmentId: otherDepartment.id,
      positionId: otherPosition.id,
      status: headItem.status,
      roleIds: [departmentRole.id],
      version: headItem.version
    });
    expect(moveConfiguredHead.statusCode).toBe(409);
    expect(responseBody<{ code: string }>(moveConfiguredHead).code).toBe('LEADER_ASSIGNMENT_CONFLICT');

    const intentionResponse = await authenticated(adminSession, 'POST', '/api/v1/investment-intentions', {
      investmentEntityId: unit.id,
      applicationDate: '2026-07-22',
      projectName: '身份权限集成测试项目',
      investmentMethod: 'EQUITY',
      projectLeaderUserId: departmentHead.id,
      currencyCode: 'CNY',
      exchangeRate: '1.000000'
    });
    expect(intentionResponse.statusCode).toBe(201);
    const intention = responseBody<{ data: { id: string } }>(intentionResponse).data;
    const boundary = 'ltc-security-boundary-c7a1';
    const disguisedAttachment = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="report.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const rejectedAttachment = await app.inject({
      method: 'POST',
      url: `/api/v1/investment-intentions/${intention.id}/attachments`,
      headers: {
        ...baseHeaders,
        cookie: adminSession.cookie,
        'x-csrf-token': adminSession.csrfToken,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload: disguisedAttachment
    });
    expect(rejectedAttachment.statusCode).toBe(400);
    expect(responseBody<{ code: string }>(rejectedAttachment).code).toBe('INVALID_FILE_TYPE');

    await pool.execute(
      'UPDATE tz_sys_user SET department_id = ?, position_id = ? WHERE id = ?',
      [otherDepartment.id, otherPosition.id, departmentHead.id]
    );
    const invalidOrganizationSubmit = await authenticated(
      adminSession, 'POST', `/api/v1/investment-intentions/${intention.id}/submit`, {}
    );
    expect(invalidOrganizationSubmit.statusCode).toBe(409);
    expect(responseBody<{ code: string }>(invalidOrganizationSubmit).code).toBe('APPROVER_ORGANIZATION_MISMATCH');
    await pool.execute(
      'UPDATE tz_sys_user SET department_id = ?, position_id = ? WHERE id = ?',
      [department.id, position.id, departmentHead.id]
    );
    const submitResponse = await authenticated(adminSession, 'POST', `/api/v1/investment-intentions/${intention.id}/submit`, {});
    expect(submitResponse.statusCode).toBe(200);
    const submitted = responseBody<{ data: { currentApproverUserId: string; currentStage: number } }>(submitResponse).data;
    expect(submitted.currentApproverUserId).toBe(departmentHead.id);
    expect(submitted.currentStage).toBe(1);

    const wrongApprover = await authenticated(adminSession, 'POST', `/api/v1/investment-intentions/${intention.id}/approve`, {
      comment: '不应允许申请人自行审批'
    });
    expect(wrongApprover.statusCode).toBe(403);

    const departmentSession = await replaceTemporaryPassword(
      'department.head', 'Dept-Temp-2026!', 'Dept-New-2026!'
    );
    const departmentApproval = await authenticated(
      departmentSession, 'POST', `/api/v1/investment-intentions/${intention.id}/approve`, { comment: '部门审核通过' }
    );
    expect(departmentApproval.statusCode).toBe(200);
    expect(responseBody<{ data: { currentApproverUserId: string; currentStage: number } }>(departmentApproval).data)
      .toMatchObject({ currentApproverUserId: supervisingLeader.id, currentStage: 2 });

    const supervisingSession = await replaceTemporaryPassword(
      'supervising.leader', 'Leader-Temp-2026!', 'Leader-New-2026!'
    );
    const finalApproval = await authenticated(
      supervisingSession, 'POST', `/api/v1/investment-intentions/${intention.id}/approve`, { comment: '分管领导审核通过' }
    );
    expect(finalApproval.statusCode).toBe(200);
    expect(responseBody<{ data: { status: string; currentStage: number; currentApproverUserId: null } }>(finalApproval).data)
      .toMatchObject({ status: 'APPROVED', currentStage: 3, currentApproverUserId: null });

    for (let index = 0; index < 5; index += 1) {
      const failedLogin = await app.inject({
        method: 'POST', url: '/api/v1/auth/login', headers: baseHeaders,
        payload: { username: 'department.head', password: 'Wrong-Password-2026!' }
      });
      expect(failedLogin.statusCode).toBe(401);
    }
    const rateLimited = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', headers: baseHeaders,
      payload: { username: 'department.head', password: 'Dept-New-2026!' }
    });
    expect(rateLimited.statusCode).toBe(429);
    const [lockedUsers] = await pool.query<Array<RowDataPacket & { failed_login_count: number; locked_until: string | null }>>(
      'SELECT failed_login_count, locked_until FROM tz_sys_user WHERE id = ?', [departmentHead.id]
    );
    expect(Number(lockedUsers[0].failed_login_count)).toBe(5);
    expect(lockedUsers[0].locked_until).not.toBeNull();

    const [audits] = await pool.query<Array<RowDataPacket & { total: number }>>(
      'SELECT COUNT(*) AS total FROM tz_sys_audit_log'
    );
    expect(Number(audits[0].total)).toBeGreaterThan(10);
  }, 30_000);
});
