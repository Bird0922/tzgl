import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AuthService } from './auth-service.js';
import { hashPassword, normalizeUsername } from './security.js';
import { AppError, type AuthContext, type EntityStatus } from './types.js';

const SYSTEM_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001';

export interface UnitInput {
  parentId: string | null;
  code: string;
  name: string;
  status: EntityStatus;
  sortOrder: number;
  version?: number;
}

export interface DepartmentInput {
  unitId: string;
  code: string;
  name: string;
  departmentHeadUserId: string | null;
  supervisingLeaderUserId: string | null;
  status: EntityStatus;
  sortOrder: number;
  version?: number;
}

export interface PositionInput {
  departmentId: string;
  code: string;
  name: string;
  status: EntityStatus;
  sortOrder: number;
  version?: number;
}

export interface RoleInput {
  code: string;
  name: string;
  description: string | null;
  status: EntityStatus;
  permissionCodes: string[];
  version?: number;
}

export interface UserInput {
  employeeNo: string;
  username: string;
  displayName: string;
  mobile: string | null;
  email: string | null;
  departmentId: string;
  positionId: string;
  status: EntityStatus;
  roleIds: string[];
  password?: string;
  version?: number;
}

function duplicateError(error: unknown): unknown {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'ER_DUP_ENTRY') return new AppError('编码、登录名或人员编号已存在', 409, 'DUPLICATE_VALUE');
  if (code === 'ER_ROW_IS_REFERENCED_2') return new AppError('数据已被引用，不能删除', 409, 'RESOURCE_IN_USE');
  return error;
}

export class AdminService {
  constructor(private readonly pool: Pool, private readonly auth: AuthService) {}

  async listUnits(query: { q?: string; status?: EntityStatus }) {
    const conditions: string[] = [];
    const values: Array<string> = [];
    if (query.q) {
      conditions.push('(unit_code LIKE ? OR unit_name LIKE ?)');
      values.push(`%${query.q}%`, `%${query.q}%`);
    }
    if (query.status) {
      conditions.push('status = ?');
      values.push(query.status);
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, parent_id, unit_code, unit_name, status, sort_order, version, created_at, updated_at
         FROM tz_org_unit
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY parent_id, sort_order, unit_name`,
      values
    );
    return rows.map(row => ({
      id: row.id, parentId: row.parent_id, code: row.unit_code, name: row.unit_name,
      status: row.status, sortOrder: row.sort_order, version: row.version,
      createdAt: row.created_at, updatedAt: row.updated_at
    }));
  }

  async createUnit(input: UnitInput, context: AuthContext, request: FastifyRequest) {
    await this.validateUnitParent(input.parentId, input.status);
    const id = randomUUID();
    try {
      await this.pool.execute(
        `INSERT INTO tz_org_unit (
          id, parent_id, unit_code, unit_name, status, sort_order, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.parentId, input.code, input.name, input.status, input.sortOrder, context.user.id, context.user.id]
      );
      await this.auth.audit(context.user.id, 'CREATE', 'UNIT', id, 'SUCCESS', request, { code: input.code });
      return (await this.listUnits({})).find(item => item.id === id);
    } catch (error) {
      throw duplicateError(error);
    }
  }

  async updateUnit(id: string, input: UnitInput, context: AuthContext, request: FastifyRequest) {
    if (input.parentId === id) throw new AppError('单位不能将自身设为上级单位', 400, 'INVALID_HIERARCHY');
    await this.validateUnitParent(input.parentId, input.status);
    if (input.parentId) {
      const [cycles] = await this.pool.query<RowDataPacket[]>(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM tz_org_unit WHERE parent_id = ?
           UNION ALL
           SELECT u.id FROM tz_org_unit u JOIN descendants d ON u.parent_id = d.id
         ) SELECT id FROM descendants WHERE id = ? LIMIT 1`,
        [id, input.parentId]
      );
      if (cycles[0]) throw new AppError('上级单位不能选择当前单位的下级单位', 400, 'INVALID_HIERARCHY');
    }
    if (input.status === 'DISABLED') {
      const [active] = await this.pool.query<RowDataPacket[]>(
        `SELECT
           (SELECT COUNT(*) FROM tz_org_unit WHERE parent_id = ? AND status = 'ACTIVE') +
           (SELECT COUNT(*) FROM tz_org_department WHERE unit_id = ? AND status = 'ACTIVE') AS active_count`,
        [id, id]
      );
      if (Number(active[0]?.active_count ?? 0) > 0) {
        throw new AppError('请先停用该单位下的启用单位和部门', 409, 'ACTIVE_DEPENDENCY');
      }
    }
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `UPDATE tz_org_unit
            SET parent_id = ?, unit_code = ?, unit_name = ?, status = ?, sort_order = ?,
                version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [input.parentId, input.code, input.name, input.status, input.sortOrder, context.user.id, id, input.version!]
      );
      this.ensureUpdated(result);
      await this.auth.audit(context.user.id, 'UPDATE', 'UNIT', id, 'SUCCESS', request, { code: input.code });
      return (await this.listUnits({})).find(item => item.id === id);
    } catch (error) {
      throw duplicateError(error);
    }
  }

  async deleteUnit(id: string, context: AuthContext, request: FastifyRequest) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM tz_org_unit WHERE parent_id = ?) AS child_units,
         (SELECT COUNT(*) FROM tz_org_department WHERE unit_id = ?) AS departments,
         (SELECT COUNT(*) FROM tz_investment_intention WHERE investment_entity_id = ?) AS intentions`,
      [id, id, id]
    );
    if (Number(rows[0]?.child_units) + Number(rows[0]?.departments) + Number(rows[0]?.intentions) > 0) {
      throw new AppError('单位存在下级、部门或业务引用，不能删除', 409, 'RESOURCE_IN_USE');
    }
    const [result] = await this.pool.execute<ResultSetHeader>('DELETE FROM tz_org_unit WHERE id = ?', [id]);
    this.ensureFound(result);
    await this.auth.audit(context.user.id, 'DELETE', 'UNIT', id, 'SUCCESS', request, null);
  }

  async listDepartments(query: { unitId?: string; q?: string; status?: EntityStatus }) {
    const conditions: string[] = [];
    const values: string[] = [];
    if (query.unitId) { conditions.push('d.unit_id = ?'); values.push(query.unitId); }
    if (query.q) { conditions.push('(d.department_code LIKE ? OR d.department_name LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`); }
    if (query.status) { conditions.push('d.status = ?'); values.push(query.status); }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT d.*, u.unit_name,
              h.display_name AS department_head_name,
              l.display_name AS supervising_leader_name
         FROM tz_org_department d
         JOIN tz_org_unit u ON u.id = d.unit_id
         LEFT JOIN tz_sys_user h ON h.id = d.department_head_user_id
         LEFT JOIN tz_sys_user l ON l.id = d.supervising_leader_user_id
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY u.sort_order, u.unit_name, d.sort_order, d.department_name`,
      values
    );
    return rows.map(row => ({
      id: row.id, unitId: row.unit_id, unitName: row.unit_name,
      code: row.department_code, name: row.department_name,
      departmentHeadUserId: row.department_head_user_id,
      departmentHeadName: row.department_head_name,
      supervisingLeaderUserId: row.supervising_leader_user_id,
      supervisingLeaderName: row.supervising_leader_name,
      status: row.status, sortOrder: row.sort_order, version: row.version,
      createdAt: row.created_at, updatedAt: row.updated_at
    }));
  }

  async createDepartment(input: DepartmentInput, context: AuthContext, request: FastifyRequest) {
    if (input.departmentHeadUserId || input.supervisingLeaderUserId) {
      throw new AppError('请先创建部门和人员，再编辑部门配置负责人', 400, 'LEADER_CONFIGURATION_ORDER');
    }
    await this.requireActiveUnit(input.unitId, input.status === 'ACTIVE');
    const id = randomUUID();
    try {
      await this.pool.execute(
        `INSERT INTO tz_org_department (
          id, unit_id, department_code, department_name, status, sort_order, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.unitId, input.code, input.name, input.status, input.sortOrder, context.user.id, context.user.id]
      );
      await this.auth.audit(context.user.id, 'CREATE', 'DEPARTMENT', id, 'SUCCESS', request, { code: input.code });
      return (await this.listDepartments({})).find(item => item.id === id);
    } catch (error) {
      throw duplicateError(error);
    }
  }

  async updateDepartment(id: string, input: DepartmentInput, context: AuthContext, request: FastifyRequest) {
    await this.requireActiveUnit(input.unitId, input.status === 'ACTIVE');
    await this.validateDepartmentLeaders(id, input);
    if (input.status === 'DISABLED') {
      const [active] = await this.pool.query<RowDataPacket[]>(
        `SELECT
           (SELECT COUNT(*) FROM tz_org_position WHERE department_id = ? AND status = 'ACTIVE') +
           (SELECT COUNT(*) FROM tz_sys_user WHERE department_id = ? AND status = 'ACTIVE') AS active_count`,
        [id, id]
      );
      if (Number(active[0]?.active_count ?? 0) > 0) {
        throw new AppError('请先停用该部门下的岗位和人员', 409, 'ACTIVE_DEPENDENCY');
      }
    }
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `UPDATE tz_org_department
            SET unit_id = ?, department_code = ?, department_name = ?,
                department_head_user_id = ?, supervising_leader_user_id = ?,
                status = ?, sort_order = ?, version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [
          input.unitId, input.code, input.name, input.departmentHeadUserId,
          input.supervisingLeaderUserId, input.status, input.sortOrder,
          context.user.id, id, input.version!
        ]
      );
      this.ensureUpdated(result);
      await this.auth.audit(context.user.id, 'UPDATE', 'DEPARTMENT', id, 'SUCCESS', request, { code: input.code });
      return (await this.listDepartments({})).find(item => item.id === id);
    } catch (error) {
      throw duplicateError(error);
    }
  }

  async deleteDepartment(id: string, context: AuthContext, request: FastifyRequest) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM tz_org_position WHERE department_id = ?) AS positions,
         (SELECT COUNT(*) FROM tz_sys_user WHERE department_id = ?) AS users,
         (SELECT COUNT(*) FROM tz_investment_intention WHERE applicant_department_id = ?) AS intentions`,
      [id, id, id]
    );
    if (Number(rows[0]?.positions) + Number(rows[0]?.users) + Number(rows[0]?.intentions) > 0) {
      throw new AppError('部门存在岗位、人员或业务引用，不能删除', 409, 'RESOURCE_IN_USE');
    }
    const [result] = await this.pool.execute<ResultSetHeader>('DELETE FROM tz_org_department WHERE id = ?', [id]);
    this.ensureFound(result);
    await this.auth.audit(context.user.id, 'DELETE', 'DEPARTMENT', id, 'SUCCESS', request, null);
  }

  async listPositions(query: { unitId?: string; departmentId?: string; q?: string; status?: EntityStatus }) {
    const conditions: string[] = [];
    const values: string[] = [];
    if (query.unitId) { conditions.push('d.unit_id = ?'); values.push(query.unitId); }
    if (query.departmentId) { conditions.push('p.department_id = ?'); values.push(query.departmentId); }
    if (query.q) { conditions.push('(p.position_code LIKE ? OR p.position_name LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`); }
    if (query.status) { conditions.push('p.status = ?'); values.push(query.status); }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT p.*, d.department_name, d.unit_id, u.unit_name
         FROM tz_org_position p
         JOIN tz_org_department d ON d.id = p.department_id
         JOIN tz_org_unit u ON u.id = d.unit_id
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY u.sort_order, d.sort_order, p.sort_order, p.position_name`,
      values
    );
    return rows.map(row => ({
      id: row.id, unitId: row.unit_id, unitName: row.unit_name,
      departmentId: row.department_id, departmentName: row.department_name,
      code: row.position_code, name: row.position_name,
      status: row.status, sortOrder: row.sort_order, version: row.version,
      createdAt: row.created_at, updatedAt: row.updated_at
    }));
  }

  async createPosition(input: PositionInput, context: AuthContext, request: FastifyRequest) {
    await this.requireActiveDepartment(input.departmentId, input.status === 'ACTIVE');
    const id = randomUUID();
    try {
      await this.pool.execute(
        `INSERT INTO tz_org_position (
          id, department_id, position_code, position_name, status, sort_order, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.departmentId, input.code, input.name, input.status, input.sortOrder, context.user.id, context.user.id]
      );
      await this.auth.audit(context.user.id, 'CREATE', 'POSITION', id, 'SUCCESS', request, { code: input.code });
      return (await this.listPositions({})).find(item => item.id === id);
    } catch (error) {
      throw duplicateError(error);
    }
  }

  async updatePosition(id: string, input: PositionInput, context: AuthContext, request: FastifyRequest) {
    await this.requireActiveDepartment(input.departmentId, input.status === 'ACTIVE');
    const [current] = await this.pool.query<RowDataPacket[]>('SELECT department_id FROM tz_org_position WHERE id = ?', [id]);
    if (!current[0]) throw new AppError('岗位不存在', 404, 'NOT_FOUND');
    if (current[0].department_id !== input.departmentId) {
      const [users] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM tz_sys_user WHERE position_id = ?', [id]);
      if (Number(users[0]?.count ?? 0) > 0) throw new AppError('岗位已分配人员，不能变更所属部门', 409, 'RESOURCE_IN_USE');
    }
    if (input.status === 'DISABLED') {
      const [users] = await this.pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS count FROM tz_sys_user WHERE position_id = ? AND status = 'ACTIVE'",
        [id]
      );
      if (Number(users[0]?.count ?? 0) > 0) throw new AppError('岗位仍有启用人员，不能停用', 409, 'ACTIVE_DEPENDENCY');
    }
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `UPDATE tz_org_position
            SET department_id = ?, position_code = ?, position_name = ?, status = ?, sort_order = ?,
                version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [input.departmentId, input.code, input.name, input.status, input.sortOrder, context.user.id, id, input.version!]
      );
      this.ensureUpdated(result);
      await this.auth.audit(context.user.id, 'UPDATE', 'POSITION', id, 'SUCCESS', request, { code: input.code });
      return (await this.listPositions({})).find(item => item.id === id);
    } catch (error) {
      throw duplicateError(error);
    }
  }

  async deletePosition(id: string, context: AuthContext, request: FastifyRequest) {
    const [users] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM tz_sys_user WHERE position_id = ?', [id]);
    if (Number(users[0]?.count ?? 0) > 0) throw new AppError('岗位已分配人员，不能删除', 409, 'RESOURCE_IN_USE');
    const [result] = await this.pool.execute<ResultSetHeader>('DELETE FROM tz_org_position WHERE id = ?', [id]);
    this.ensureFound(result);
    await this.auth.audit(context.user.id, 'DELETE', 'POSITION', id, 'SUCCESS', request, null);
  }

  async listPermissions() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT permission_code, permission_name, permission_group, description
         FROM tz_sys_permission ORDER BY permission_group, permission_code`
    );
    return rows.map(row => ({
      code: row.permission_code, name: row.permission_name,
      group: row.permission_group, description: row.description
    }));
  }

  async listRoles(query: { q?: string; status?: EntityStatus; page: number; pageSize: number; offset: number }) {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (query.q) { conditions.push('(r.role_code LIKE ? OR r.role_name LIKE ?)'); values.push(`%${query.q}%`, `%${query.q}%`); }
    if (query.status) { conditions.push('r.status = ?'); values.push(query.status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [counts] = await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM tz_sys_role r ${where}`, values);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.* FROM tz_sys_role r ${where}
        ORDER BY r.is_system DESC, r.role_name LIMIT ? OFFSET ?`,
      [...values, query.pageSize, query.offset]
    );
    const items = [];
    for (const row of rows) {
      const [permissions] = await this.pool.query<RowDataPacket[]>(
        'SELECT permission_code FROM tz_sys_role_permission WHERE role_id = ? ORDER BY permission_code',
        [row.id]
      );
      items.push({
        id: row.id, code: row.role_code, name: row.role_name, description: row.description,
        isSystem: Boolean(row.is_system), status: row.status, version: row.version,
        permissionCodes: permissions.map(permission => permission.permission_code),
        createdAt: row.created_at, updatedAt: row.updated_at
      });
    }
    return { items, total: Number(counts[0]?.total ?? 0), page: query.page, pageSize: query.pageSize };
  }

  async createRole(input: RoleInput, context: AuthContext, request: FastifyRequest) {
    await this.validatePermissionCodes(input.permissionCodes);
    const id = randomUUID();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO tz_sys_role (
          id, role_code, role_name, description, is_system, status, created_by, updated_by
        ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
        [id, input.code, input.name, input.description, input.status, context.user.id, context.user.id]
      );
      await this.replaceRolePermissions(connection, id, input.permissionCodes, context.user.id);
      await connection.commit();
      await this.auth.audit(context.user.id, 'CREATE', 'ROLE', id, 'SUCCESS', request, { code: input.code });
      return (await this.listRoles({ page: 1, pageSize: 100, offset: 0 })).items.find(item => item.id === id);
    } catch (error) {
      await connection.rollback();
      throw duplicateError(error);
    } finally {
      connection.release();
    }
  }

  async updateRole(id: string, input: RoleInput, context: AuthContext, request: FastifyRequest) {
    const [current] = await this.pool.query<RowDataPacket[]>('SELECT is_system FROM tz_sys_role WHERE id = ?', [id]);
    if (!current[0]) throw new AppError('角色不存在', 404, 'NOT_FOUND');
    if (current[0].is_system) throw new AppError('系统内置角色不允许修改', 409, 'SYSTEM_ROLE_PROTECTED');
    await this.validatePermissionCodes(input.permissionCodes);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE tz_sys_role
            SET role_code = ?, role_name = ?, description = ?, status = ?,
                version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [input.code, input.name, input.description, input.status, context.user.id, id, input.version!]
      );
      this.ensureUpdated(result);
      await this.replaceRolePermissions(connection, id, input.permissionCodes, context.user.id);
      await connection.commit();
      await this.auth.audit(context.user.id, 'UPDATE', 'ROLE', id, 'SUCCESS', request, { code: input.code });
      return (await this.listRoles({ page: 1, pageSize: 100, offset: 0 })).items.find(item => item.id === id);
    } catch (error) {
      await connection.rollback();
      throw duplicateError(error);
    } finally {
      connection.release();
    }
  }

  async deleteRole(id: string, context: AuthContext, request: FastifyRequest) {
    const [roles] = await this.pool.query<RowDataPacket[]>('SELECT is_system FROM tz_sys_role WHERE id = ?', [id]);
    if (!roles[0]) throw new AppError('角色不存在', 404, 'NOT_FOUND');
    if (roles[0].is_system) throw new AppError('系统内置角色不允许删除', 409, 'SYSTEM_ROLE_PROTECTED');
    const [users] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM tz_sys_user_role WHERE role_id = ?', [id]);
    if (Number(users[0]?.count ?? 0) > 0) throw new AppError('角色已分配人员，不能删除', 409, 'RESOURCE_IN_USE');
    await this.pool.execute('DELETE FROM tz_sys_role WHERE id = ?', [id]);
    await this.auth.audit(context.user.id, 'DELETE', 'ROLE', id, 'SUCCESS', request, null);
  }

  async listUsers(query: {
    q?: string; unitId?: string; departmentId?: string; status?: EntityStatus;
    page: number; pageSize: number; offset: number;
  }) {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (query.q) {
      conditions.push('(u.employee_no LIKE ? OR u.username LIKE ? OR u.display_name LIKE ?)');
      values.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`);
    }
    if (query.unitId) { conditions.push('d.unit_id = ?'); values.push(query.unitId); }
    if (query.departmentId) { conditions.push('u.department_id = ?'); values.push(query.departmentId); }
    if (query.status) { conditions.push('u.status = ?'); values.push(query.status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const join = 'LEFT JOIN tz_org_department d ON d.id = u.department_id LEFT JOIN tz_org_unit ou ON ou.id = d.unit_id LEFT JOIN tz_org_position p ON p.id = u.position_id';
    const [counts] = await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM tz_sys_user u ${join} ${where}`, values);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT u.id, u.employee_no, u.username, u.display_name, u.mobile, u.email,
              u.department_id, d.department_name, d.unit_id, ou.unit_name,
              u.position_id, p.position_name, u.status, u.must_change_password,
              u.locked_until, u.last_login_at, u.version, u.created_at, u.updated_at
         FROM tz_sys_user u ${join} ${where}
        ORDER BY u.display_name, u.employee_no LIMIT ? OFFSET ?`,
      [...values, query.pageSize, query.offset]
    );
    const items = [];
    for (const row of rows) {
      const [roles] = await this.pool.query<RowDataPacket[]>(
        `SELECT r.id, r.role_code, r.role_name
           FROM tz_sys_user_role ur JOIN tz_sys_role r ON r.id = ur.role_id
          WHERE ur.user_id = ? ORDER BY r.is_system DESC, r.role_name`,
        [row.id]
      );
      items.push({
        id: row.id, employeeNo: row.employee_no, username: row.username, displayName: row.display_name,
        mobile: row.mobile, email: row.email, unitId: row.unit_id, unitName: row.unit_name,
        departmentId: row.department_id, departmentName: row.department_name,
        positionId: row.position_id, positionName: row.position_name,
        status: row.status, mustChangePassword: Boolean(row.must_change_password),
        lockedUntil: row.locked_until, lastLoginAt: row.last_login_at, version: row.version,
        roles: roles.map(role => ({ id: role.id, code: role.role_code, name: role.role_name })),
        roleIds: roles.map(role => role.id), createdAt: row.created_at, updatedAt: row.updated_at
      });
    }
    return { items, total: Number(counts[0]?.total ?? 0), page: query.page, pageSize: query.pageSize };
  }

  async createUser(input: UserInput, context: AuthContext, request: FastifyRequest) {
    if (!input.password) throw new AppError('初始密码不能为空', 400, 'VALIDATION_ERROR');
    await this.validateUserOrganization(input.departmentId, input.positionId, input.status);
    await this.validateRoleIds(input.roleIds);
    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO tz_sys_user (
          id, employee_no, username, password_hash, display_name, mobile, email,
          department_id, position_id, status, must_change_password, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          id, input.employeeNo, normalizeUsername(input.username), passwordHash, input.displayName,
          input.mobile, input.email, input.departmentId, input.positionId, input.status,
          context.user.id, context.user.id
        ]
      );
      await this.replaceUserRoles(connection, id, input.roleIds, context.user.id);
      await connection.commit();
      await this.auth.audit(context.user.id, 'CREATE', 'USER', id, 'SUCCESS', request, { username: normalizeUsername(input.username) });
      return (await this.listUsers({ page: 1, pageSize: 100, offset: 0 })).items.find(item => item.id === id);
    } catch (error) {
      await connection.rollback();
      throw duplicateError(error);
    } finally {
      connection.release();
    }
  }

  async updateUser(id: string, input: UserInput, context: AuthContext, request: FastifyRequest) {
    await this.validateUserOrganization(input.departmentId, input.positionId, input.status);
    await this.validateUserLeadershipOrganization(id, input.departmentId);
    await this.validateRoleIds(input.roleIds);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.protectLastSystemAdmin(connection, id, input.status, input.roleIds);
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE tz_sys_user
            SET employee_no = ?, username = ?, display_name = ?, mobile = ?, email = ?,
                department_id = ?, position_id = ?, status = ?, version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [
          input.employeeNo, normalizeUsername(input.username), input.displayName, input.mobile, input.email,
          input.departmentId, input.positionId, input.status, context.user.id, id, input.version!
        ]
      );
      this.ensureUpdated(result);
      await this.replaceUserRoles(connection, id, input.roleIds, context.user.id);
      if (input.status === 'DISABLED') {
        await connection.execute(
          'UPDATE tz_sys_session SET revoked_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL',
          [id]
        );
      }
      await connection.commit();
      await this.auth.audit(context.user.id, 'UPDATE', 'USER', id, 'SUCCESS', request, { username: normalizeUsername(input.username) });
      return (await this.listUsers({ page: 1, pageSize: 100, offset: 0 })).items.find(item => item.id === id);
    } catch (error) {
      await connection.rollback();
      throw duplicateError(error);
    } finally {
      connection.release();
    }
  }

  async resetPassword(id: string, password: string, context: AuthContext, request: FastifyRequest) {
    const passwordHash = await hashPassword(password);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE tz_sys_user
          SET password_hash = ?, must_change_password = 1, failed_login_count = 0,
              locked_until = NULL, version = version + 1, updated_by = ?
        WHERE id = ?`,
      [passwordHash, context.user.id, id]
    );
    this.ensureFound(result);
    await this.auth.revokeUserSessions(id);
    await this.auth.audit(context.user.id, 'RESET_PASSWORD', 'USER', id, 'SUCCESS', request, null);
  }

  async deleteUser(id: string, context: AuthContext, request: FastifyRequest) {
    if (id === context.user.id) throw new AppError('不能删除当前登录用户', 409, 'SELF_DELETE_FORBIDDEN');
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.protectLastSystemAdmin(connection, id, 'DISABLED', []);
      const [refs] = await connection.query<RowDataPacket[]>(
        `SELECT
           (SELECT COUNT(*) FROM tz_org_department WHERE department_head_user_id = ? OR supervising_leader_user_id = ?) AS leaders,
           (SELECT COUNT(*) FROM tz_investment_intention WHERE applicant_user_id = ? OR project_leader_user_id = ?
             OR department_head_approver_id = ? OR supervising_leader_approver_id = ? OR current_approver_user_id = ?) AS intentions,
           (SELECT COUNT(*) FROM tz_investment_workflow_history WHERE operator_id = ?) AS histories,
           (SELECT COUNT(*) FROM tz_business_attachment WHERE uploaded_by = ?) AS attachments`,
        [id, id, id, id, id, id, id, id, id]
      );
      if (Number(refs[0]?.leaders) + Number(refs[0]?.intentions) + Number(refs[0]?.histories) + Number(refs[0]?.attachments) > 0) {
        throw new AppError('人员存在组织、业务或审批引用，不能删除', 409, 'RESOURCE_IN_USE');
      }
      const [result] = await connection.execute<ResultSetHeader>('DELETE FROM tz_sys_user WHERE id = ?', [id]);
      this.ensureFound(result);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw duplicateError(error);
    } finally {
      connection.release();
    }
    await this.auth.audit(context.user.id, 'DELETE', 'USER', id, 'SUCCESS', request, null);
  }

  async directoryUnits() {
    return this.listUnits({ status: 'ACTIVE' });
  }

  async directoryUsers(query: { unitId?: string; departmentId?: string; permission?: string }) {
    const conditions = ["u.status = 'ACTIVE'", "d.status = 'ACTIVE'", "ou.status = 'ACTIVE'", "p.status = 'ACTIVE'"];
    const values: string[] = [];
    if (query.unitId) { conditions.push('d.unit_id = ?'); values.push(query.unitId); }
    if (query.departmentId) { conditions.push('u.department_id = ?'); values.push(query.departmentId); }
    if (query.permission) {
      conditions.push(`EXISTS (
        SELECT 1 FROM tz_sys_user_role ur
        JOIN tz_sys_role r ON r.id = ur.role_id AND r.status = 'ACTIVE'
        JOIN tz_sys_role_permission rp ON rp.role_id = r.id
        WHERE ur.user_id = u.id AND rp.permission_code = ?
      )`);
      values.push(query.permission);
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT u.id, u.employee_no, u.display_name, u.department_id, d.department_name,
              d.unit_id, ou.unit_name, u.position_id, p.position_name
         FROM tz_sys_user u
         JOIN tz_org_department d ON d.id = u.department_id
         JOIN tz_org_unit ou ON ou.id = d.unit_id
         JOIN tz_org_position p ON p.id = u.position_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY u.display_name, u.employee_no`,
      values
    );
    return rows.map(row => ({
      id: row.id, employeeNo: row.employee_no, name: row.display_name,
      unitId: row.unit_id, unitName: row.unit_name,
      departmentId: row.department_id, departmentName: row.department_name,
      positionId: row.position_id, positionName: row.position_name
    }));
  }

  private ensureUpdated(result: ResultSetHeader) {
    if (!result.affectedRows) throw new AppError('数据已被修改或不存在，请刷新后重试', 409, 'VERSION_CONFLICT');
  }

  private ensureFound(result: ResultSetHeader) {
    if (!result.affectedRows) throw new AppError('数据不存在', 404, 'NOT_FOUND');
  }

  private async validateUnitParent(parentId: string | null, mustBeActive: boolean | EntityStatus) {
    if (!parentId) return;
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT status FROM tz_org_unit WHERE id = ?', [parentId]);
    if (!rows[0]) throw new AppError('上级单位不存在', 400, 'INVALID_REFERENCE');
    if ((mustBeActive === true || mustBeActive === 'ACTIVE') && rows[0].status !== 'ACTIVE') {
      throw new AppError('启用单位不能隶属于停用单位', 409, 'INACTIVE_PARENT');
    }
  }

  private async requireActiveUnit(unitId: string, requireActive: boolean) {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT status FROM tz_org_unit WHERE id = ?', [unitId]);
    if (!rows[0]) throw new AppError('所属单位不存在', 400, 'INVALID_REFERENCE');
    if (requireActive && rows[0].status !== 'ACTIVE') throw new AppError('启用部门必须属于启用单位', 409, 'INACTIVE_PARENT');
  }

  private async requireActiveDepartment(departmentId: string, requireActive: boolean) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT d.status, u.status AS unit_status FROM tz_org_department d
       JOIN tz_org_unit u ON u.id = d.unit_id WHERE d.id = ?`,
      [departmentId]
    );
    if (!rows[0]) throw new AppError('所属部门不存在', 400, 'INVALID_REFERENCE');
    if (requireActive && (rows[0].status !== 'ACTIVE' || rows[0].unit_status !== 'ACTIVE')) {
      throw new AppError('启用岗位必须属于启用单位和部门', 409, 'INACTIVE_PARENT');
    }
  }

  private async validateDepartmentLeaders(id: string, input: DepartmentInput) {
    if (input.departmentHeadUserId) {
      const [heads] = await this.pool.query<RowDataPacket[]>(
        'SELECT department_id, status FROM tz_sys_user WHERE id = ?',
        [input.departmentHeadUserId]
      );
      if (!heads[0] || heads[0].status !== 'ACTIVE' || heads[0].department_id !== id) {
        throw new AppError('部门负责人必须是该部门的启用人员', 400, 'INVALID_DEPARTMENT_HEAD');
      }
      if (!(await this.auth.hasPermission(input.departmentHeadUserId, 'investment.intention.approve_department'))) {
        throw new AppError('部门负责人缺少部门负责人审批权限', 409, 'APPROVER_PERMISSION_REQUIRED');
      }
    }
    if (input.supervisingLeaderUserId) {
      const [leaders] = await this.pool.query<RowDataPacket[]>(
        `SELECT d.unit_id, u.status
           FROM tz_sys_user u JOIN tz_org_department d ON d.id = u.department_id
          WHERE u.id = ?`,
        [input.supervisingLeaderUserId]
      );
      if (!leaders[0] || leaders[0].status !== 'ACTIVE' || leaders[0].unit_id !== input.unitId) {
        throw new AppError('分管领导必须是所属单位内的启用人员', 400, 'INVALID_SUPERVISING_LEADER');
      }
      if (!(await this.auth.hasPermission(input.supervisingLeaderUserId, 'investment.intention.approve_supervising'))) {
        throw new AppError('分管领导缺少分管领导审批权限', 409, 'APPROVER_PERMISSION_REQUIRED');
      }
    }
  }

  private async validatePermissionCodes(codes: string[]) {
    if (!codes.length) return;
    const placeholders = codes.map(() => '?').join(',');
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT permission_code FROM tz_sys_permission WHERE permission_code IN (${placeholders})`,
      codes
    );
    if (rows.length !== codes.length) throw new AppError('包含不存在的权限编码', 400, 'INVALID_PERMISSION');
  }

  private async replaceRolePermissions(connection: PoolConnection, roleId: string, codes: string[], actorId: string) {
    await connection.execute('DELETE FROM tz_sys_role_permission WHERE role_id = ?', [roleId]);
    for (const code of codes) {
      await connection.execute(
        'INSERT INTO tz_sys_role_permission (role_id, permission_code, created_by) VALUES (?, ?, ?)',
        [roleId, code, actorId]
      );
    }
  }

  private async validateRoleIds(roleIds: string[]) {
    if (!roleIds.length) return;
    const placeholders = roleIds.map(() => '?').join(',');
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id FROM tz_sys_role WHERE id IN (${placeholders}) AND status = 'ACTIVE'`,
      roleIds
    );
    if (rows.length !== roleIds.length) throw new AppError('包含不存在或已停用的角色', 400, 'INVALID_ROLE');
  }

  private async validateUserOrganization(departmentId: string, positionId: string, status: EntityStatus) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT p.department_id, p.status AS position_status,
              d.status AS department_status, u.status AS unit_status
         FROM tz_org_position p
         JOIN tz_org_department d ON d.id = p.department_id
         JOIN tz_org_unit u ON u.id = d.unit_id
        WHERE p.id = ?`,
      [positionId]
    );
    if (!rows[0] || rows[0].department_id !== departmentId) {
      throw new AppError('岗位不存在或不属于所选部门', 400, 'INVALID_POSITION');
    }
    if (status === 'ACTIVE' && (
      rows[0].position_status !== 'ACTIVE' || rows[0].department_status !== 'ACTIVE' || rows[0].unit_status !== 'ACTIVE'
    )) {
      throw new AppError('启用人员必须属于启用单位、部门和岗位', 409, 'INACTIVE_ORGANIZATION');
    }
  }

  private async validateUserLeadershipOrganization(userId: string, departmentId: string) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM tz_org_department
           WHERE department_head_user_id = ? AND id <> ?) AS head_conflicts,
         (SELECT COUNT(*)
            FROM tz_org_department configured
            JOIN tz_org_department target ON target.id = ?
           WHERE configured.supervising_leader_user_id = ?
             AND configured.unit_id <> target.unit_id) AS leader_conflicts`,
      [userId, departmentId, departmentId, userId]
    );
    if (Number(rows[0]?.head_conflicts ?? 0) > 0) {
      throw new AppError('该人员已配置为部门负责人，不能移出对应部门', 409, 'LEADER_ASSIGNMENT_CONFLICT');
    }
    if (Number(rows[0]?.leader_conflicts ?? 0) > 0) {
      throw new AppError('该人员已配置为分管领导，不能移出对应单位', 409, 'LEADER_ASSIGNMENT_CONFLICT');
    }
  }

  private async replaceUserRoles(connection: PoolConnection, userId: string, roleIds: string[], actorId: string) {
    await connection.execute('DELETE FROM tz_sys_user_role WHERE user_id = ?', [userId]);
    for (const roleId of roleIds) {
      await connection.execute(
        'INSERT INTO tz_sys_user_role (user_id, role_id, created_by) VALUES (?, ?, ?)',
        [userId, roleId, actorId]
      );
    }
  }

  private async protectLastSystemAdmin(
    connection: PoolConnection,
    userId: string,
    status: EntityStatus,
    roleIds: string[]
  ) {
    await connection.query('SELECT id FROM tz_sys_role WHERE id = ? FOR UPDATE', [SYSTEM_ADMIN_ROLE_ID]);
    const [current] = await connection.query<RowDataPacket[]>(
      'SELECT 1 FROM tz_sys_user_role WHERE user_id = ? AND role_id = ?',
      [userId, SYSTEM_ADMIN_ROLE_ID]
    );
    if (!current[0] || (status === 'ACTIVE' && roleIds.includes(SYSTEM_ADMIN_ROLE_ID))) return;
    const [others] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count
         FROM tz_sys_user u JOIN tz_sys_user_role ur ON ur.user_id = u.id
        WHERE ur.role_id = ? AND u.status = 'ACTIVE' AND u.id <> ?`,
      [SYSTEM_ADMIN_ROLE_ID, userId]
    );
    if (Number(others[0]?.count ?? 0) < 1) {
      throw new AppError('必须至少保留一名启用的系统管理员', 409, 'LAST_SYSTEM_ADMIN');
    }
  }
}
