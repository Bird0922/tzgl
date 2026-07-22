import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { consumeDummyPasswordCheck, equalToken, hashPassword, normalizeUsername, randomToken, sha256, verifyPassword } from './security.js';
import { AppError, type AuthContext, type AuthUser } from './types.js';

export const SESSION_COOKIE_NAME = 'ltc_session';
const SYSTEM_ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001';

interface UserRow extends RowDataPacket {
  id: string;
  employee_no: string;
  username: string;
  password_hash: string;
  display_name: string;
  department_id: string | null;
  position_id: string | null;
  status: string;
  must_change_password: number;
  failed_login_count: number;
  locked_until: string | null;
}

interface SessionRow extends UserRow {
  session_id: string;
  csrf_token_hash: string;
}

export interface LoginResult {
  user: AuthUser;
  sessionToken: string;
  csrfToken: string;
}

function userAgent(request: FastifyRequest): string | null {
  const value = request.headers['user-agent'];
  return typeof value === 'string' ? value.slice(0, 500) : null;
}

export class AuthService {
  constructor(private readonly pool: Pool) {}

  async setupStatus(): Promise<{ initialized: boolean }> {
    const [rows] = await this.pool.query<Array<RowDataPacket & { setting_value: string }>>(
      "SELECT setting_value FROM tz_system_setting WHERE setting_key = 'SETUP_INITIALIZED'"
    );
    return { initialized: rows[0]?.setting_value === '1' };
  }

  async initialize(input: {
    employeeNo: string;
    username: string;
    displayName: string;
    password: string;
  }, request: FastifyRequest): Promise<LoginResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [settings] = await connection.query<Array<RowDataPacket & { setting_value: string }>>(
        "SELECT setting_value FROM tz_system_setting WHERE setting_key = 'SETUP_INITIALIZED' FOR UPDATE"
      );
      if (settings[0]?.setting_value === '1') {
        throw new AppError('系统已经完成初始化', 409, 'ALREADY_INITIALIZED');
      }
      const id = randomUUID();
      const username = normalizeUsername(input.username);
      const passwordHash = await hashPassword(input.password);
      await connection.execute(
        `INSERT INTO tz_sys_user (
          id, employee_no, username, password_hash, display_name,
          department_id, position_id, status, must_change_password, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'ACTIVE', 0, ?, ?)`,
        [id, input.employeeNo, username, passwordHash, input.displayName, id, id]
      );
      await connection.execute(
        'INSERT INTO tz_sys_user_role (user_id, role_id, created_by) VALUES (?, ?, ?)',
        [id, SYSTEM_ADMIN_ROLE_ID, id]
      );
      await connection.execute(
        "UPDATE tz_system_setting SET setting_value = '1' WHERE setting_key = 'SETUP_INITIALIZED'"
      );
      await this.writeAudit(connection, {
        actorUserId: id,
        action: 'INITIALIZE',
        resourceType: 'SYSTEM',
        resourceId: id,
        result: 'SUCCESS',
        ipAddress: request.ip,
        detail: { username }
      });
      await connection.commit();
      return this.createSession(id, request);
    } catch (error) {
      await connection.rollback();
      throw this.normalizeDatabaseError(error);
    } finally {
      connection.release();
    }
  }

  async login(usernameInput: string, password: string, request: FastifyRequest): Promise<LoginResult> {
    const username = normalizeUsername(usernameInput);
    const ipAddress = request.ip.slice(0, 64);
    const [limits] = await this.pool.query<Array<RowDataPacket & { failure_count: number }>>(
      `SELECT COUNT(*) AS failure_count
         FROM tz_auth_login_attempt
        WHERE username = ? AND ip_address = ? AND is_success = 0
          AND attempted_at > DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 15 MINUTE)`,
      [username, ipAddress]
    );
    if (Number(limits[0]?.failure_count ?? 0) >= 5) {
      await this.audit(null, 'LOGIN_RATE_LIMITED', 'AUTH', username, 'FAILURE', request, { username });
      throw new AppError('登录尝试过于频繁，请15分钟后重试', 429, 'LOGIN_RATE_LIMITED');
    }

    const [rows] = await this.pool.query<UserRow[]>(
      'SELECT * FROM tz_sys_user WHERE username = ? LIMIT 1',
      [username]
    );
    const user = rows[0];
    if (!user) {
      await consumeDummyPasswordCheck(password);
      await this.recordLoginAttempt(username, ipAddress, false);
      await this.audit(null, 'LOGIN_FAILURE', 'AUTH', username, 'FAILURE', request, { username });
      throw new AppError('用户名或密码错误', 401, 'INVALID_CREDENTIALS');
    }

    const passwordMatches = await verifyPassword(password, user.password_hash);
    const locked = user.locked_until && new Date(user.locked_until).getTime() > Date.now();
    if (!passwordMatches || locked || user.status !== 'ACTIVE') {
      await this.recordLoginAttempt(username, ipAddress, false);
      if (!passwordMatches && user.status === 'ACTIVE') {
        await this.pool.execute(
          `UPDATE tz_sys_user
              SET failed_login_count = LEAST(failed_login_count + 1, 255),
                  locked_until = CASE
                    WHEN failed_login_count + 1 >= 5 THEN DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 15 MINUTE)
                    ELSE locked_until
                  END
            WHERE id = ?`,
          [user.id]
        );
      }
      await this.audit(user.id, 'LOGIN_FAILURE', 'AUTH', user.id, 'FAILURE', request, { username });
      throw new AppError('用户名或密码错误', 401, 'INVALID_CREDENTIALS');
    }

    await this.pool.execute(
      `UPDATE tz_sys_user
          SET failed_login_count = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?`,
      [user.id]
    );
    await this.pool.execute(
      'DELETE FROM tz_auth_login_attempt WHERE username = ? AND ip_address = ?',
      [username, ipAddress]
    );
    await this.recordLoginAttempt(username, ipAddress, true);
    const result = await this.createSession(user.id, request);
    await this.audit(user.id, 'LOGIN', 'AUTH', user.id, 'SUCCESS', request, null);
    return result;
  }

  async authenticate(request: FastifyRequest, options: { csrf?: boolean; allowPasswordChange?: boolean } = {}): Promise<AuthContext> {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) throw new AppError('请先登录', 401, 'UNAUTHENTICATED');
    const [rows] = await this.pool.query<SessionRow[]>(
      `SELECT
         s.id AS session_id, s.csrf_token_hash,
         u.id, u.employee_no, u.username, u.password_hash, u.display_name,
         u.department_id, u.position_id, u.status, u.must_change_password,
         u.failed_login_count, u.locked_until
       FROM tz_sys_session s
       JOIN tz_sys_user u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL
        AND s.idle_expires_at > CURRENT_TIMESTAMP(3)
        AND s.absolute_expires_at > CURRENT_TIMESTAMP(3)
      LIMIT 1`,
      [sha256(token)]
    );
    const row = rows[0];
    if (!row || row.status !== 'ACTIVE') {
      throw new AppError('登录状态已失效，请重新登录', 401, 'SESSION_EXPIRED');
    }
    if (options.csrf) {
      const csrfToken = request.headers['x-csrf-token'];
      if (typeof csrfToken !== 'string' || !equalToken(csrfToken, row.csrf_token_hash)) {
        throw new AppError('请求安全校验失败', 403, 'CSRF_VALIDATION_FAILED');
      }
    }
    const permissions = await this.permissionsFor(row.id);
    const user = this.toAuthUser(row, permissions);
    if (user.mustChangePassword && !options.allowPasswordChange) {
      throw new AppError('请先修改初始密码', 403, 'PASSWORD_CHANGE_REQUIRED');
    }
    await this.pool.execute(
      `UPDATE tz_sys_session
          SET last_seen_at = CURRENT_TIMESTAMP(3),
              idle_expires_at = LEAST(DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE), absolute_expires_at)
        WHERE id = ?`,
      [row.session_id]
    );
    return { user, sessionId: row.session_id, csrfTokenHash: row.csrf_token_hash };
  }

  async logout(context: AuthContext, request: FastifyRequest): Promise<void> {
    await this.pool.execute(
      'UPDATE tz_sys_session SET revoked_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      [context.sessionId]
    );
    await this.audit(context.user.id, 'LOGOUT', 'AUTH', context.user.id, 'SUCCESS', request, null);
  }

  async changePassword(
    context: AuthContext,
    currentPassword: string,
    newPassword: string,
    request: FastifyRequest
  ): Promise<void> {
    const [rows] = await this.pool.query<UserRow[]>('SELECT * FROM tz_sys_user WHERE id = ?', [context.user.id]);
    const user = rows[0];
    if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
      throw new AppError('当前密码错误', 400, 'INVALID_CURRENT_PASSWORD');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.pool.execute(
      `UPDATE tz_sys_user
          SET password_hash = ?, must_change_password = 0, version = version + 1, updated_by = ?
        WHERE id = ?`,
      [passwordHash, context.user.id, context.user.id]
    );
    await this.revokeUserSessions(context.user.id);
    await this.audit(context.user.id, 'CHANGE_PASSWORD', 'USER', context.user.id, 'SUCCESS', request, null);
  }

  requirePermission(context: AuthContext, permission: string): void {
    if (!context.user.permissions.includes(permission)) {
      throw new AppError('无权执行该操作', 403, 'FORBIDDEN');
    }
  }

  requireAnyPermission(context: AuthContext, permissions: string[]): void {
    if (!permissions.some(permission => context.user.permissions.includes(permission))) {
      throw new AppError('无权执行该操作', 403, 'FORBIDDEN');
    }
  }

  async hasPermission(userId: string, permission: string, connection: Pool | PoolConnection = this.pool): Promise<boolean> {
    const [rows] = await connection.query<Array<RowDataPacket & { permission_code: string }>>(
      `SELECT DISTINCT rp.permission_code
         FROM tz_sys_user_role ur
         JOIN tz_sys_role r ON r.id = ur.role_id AND r.status = 'ACTIVE'
         JOIN tz_sys_role_permission rp ON rp.role_id = r.id
        WHERE ur.user_id = ? AND rp.permission_code = ?`,
      [userId, permission]
    );
    return Boolean(rows[0]);
  }

  async revokeUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    if (exceptSessionId) {
      await this.pool.execute(
        'UPDATE tz_sys_session SET revoked_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND id <> ? AND revoked_at IS NULL',
        [userId, exceptSessionId]
      );
      return;
    }
    await this.pool.execute(
      'UPDATE tz_sys_session SET revoked_at = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL',
      [userId]
    );
  }

  async audit(
    actorUserId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    result: 'SUCCESS' | 'FAILURE',
    request: FastifyRequest,
    detail: Record<string, unknown> | null
  ): Promise<void> {
    await this.writeAudit(this.pool, {
      actorUserId, action, resourceType, resourceId, result,
      ipAddress: request.ip,
      detail
    });
  }

  private async createSession(userId: string, request: FastifyRequest): Promise<LoginResult> {
    const sessionToken = randomToken();
    const csrfToken = sha256(randomToken());
    const sessionId = randomUUID();
    await this.pool.execute(
      `INSERT INTO tz_sys_session (
        id, user_id, token_hash, csrf_token_hash, ip_address, user_agent,
        last_seen_at, idle_expires_at, absolute_expires_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3),
        DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 30 MINUTE),
        DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 8 HOUR)
      )`,
      [sessionId, userId, sha256(sessionToken), csrfToken, request.ip.slice(0, 64), userAgent(request)]
    );
    const [users] = await this.pool.query<UserRow[]>('SELECT * FROM tz_sys_user WHERE id = ?', [userId]);
    const permissions = await this.permissionsFor(userId);
    return { user: this.toAuthUser(users[0], permissions), sessionToken, csrfToken };
  }

  private async permissionsFor(userId: string): Promise<string[]> {
    const [rows] = await this.pool.query<Array<RowDataPacket & { permission_code: string }>>(
      `SELECT DISTINCT rp.permission_code
         FROM tz_sys_user_role ur
         JOIN tz_sys_role r ON r.id = ur.role_id AND r.status = 'ACTIVE'
         JOIN tz_sys_role_permission rp ON rp.role_id = r.id
        WHERE ur.user_id = ?
        ORDER BY rp.permission_code`,
      [userId]
    );
    return rows.map(row => row.permission_code);
  }

  private toAuthUser(row: UserRow, permissions: string[]): AuthUser {
    return {
      id: row.id,
      employeeNo: row.employee_no,
      username: row.username,
      name: row.display_name,
      departmentId: row.department_id,
      positionId: row.position_id,
      mustChangePassword: Boolean(row.must_change_password),
      permissions
    };
  }

  private async recordLoginAttempt(username: string, ipAddress: string, success: boolean): Promise<void> {
    await this.pool.execute(
      'INSERT INTO tz_auth_login_attempt (username, ip_address, is_success) VALUES (?, ?, ?)',
      [username, ipAddress, Number(success)]
    );
  }

  private async writeAudit(
    executor: Pool | PoolConnection,
    entry: {
      actorUserId: string | null;
      action: string;
      resourceType: string;
      resourceId: string | null;
      result: 'SUCCESS' | 'FAILURE';
      ipAddress: string | null;
      detail: Record<string, unknown> | null;
    }
  ): Promise<void> {
    await executor.execute(
      `INSERT INTO tz_sys_audit_log (
        actor_user_id, action, resource_type, resource_id, result, ip_address, detail_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.actorUserId, entry.action, entry.resourceType, entry.resourceId,
        entry.result, entry.ipAddress?.slice(0, 64) ?? null,
        entry.detail ? JSON.stringify(entry.detail) : null
      ]
    );
  }

  private normalizeDatabaseError(error: unknown): unknown {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code === 'ER_DUP_ENTRY') {
      return new AppError('人员编号或用户名已存在', 409, 'DUPLICATE_VALUE');
    }
    return error;
  }
}
