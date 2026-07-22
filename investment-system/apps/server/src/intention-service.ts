import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AuthService } from './auth-service.js';
import { AppError, IntentionStatus, type AuthUser, type IntentionInput } from './types.js';
import { formatApplicationNo } from './workflow.js';

interface IntentionRow extends RowDataPacket {
  id: string;
  application_no: string;
  applicant_user_id: string | null;
  applicant_name: string | null;
  applicant_department_id: string | null;
  investment_entity_id: string | null;
  investment_entity_name: string | null;
  application_date: string | null;
  project_name: string | null;
  investment_method: string | null;
  is_major_project: number | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  project_leader_user_id: string | null;
  project_leader_name: string | null;
  contact_phone: string | null;
  project_location: string | null;
  project_summary: string | null;
  main_content: string | null;
  target_company_id: string | null;
  target_company_name: string | null;
  main_business: string | null;
  investment_direction: string | null;
  domestic_overseas: string | null;
  currency_code: string | null;
  exchange_rate: string | null;
  planned_shareholding_ratio: string | null;
  project_total_investment: string | null;
  planned_investment: string | null;
  expected_return_rate: string | null;
  status: string;
  current_stage: number;
  department_head_approver_id: string | null;
  supervising_leader_approver_id: string | null;
  current_approver_user_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function nullable(value: unknown): string | number | null {
  return value === '' || value === undefined ? null : value as string | number | null;
}

function toDto(row: IntentionRow) {
  return {
    id: row.id,
    applicationNo: row.application_no,
    applicantUserId: row.applicant_user_id,
    applicantName: row.applicant_name,
    applicantDepartmentId: row.applicant_department_id,
    investmentEntityId: row.investment_entity_id,
    investmentEntityName: row.investment_entity_name,
    applicationDate: row.application_date,
    projectName: row.project_name,
    investmentMethod: row.investment_method,
    majorProject: row.is_major_project === null ? null : Boolean(row.is_major_project),
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    projectLeaderUserId: row.project_leader_user_id,
    projectLeaderName: row.project_leader_name,
    contactPhone: row.contact_phone,
    projectLocation: row.project_location,
    projectSummary: row.project_summary,
    mainContent: row.main_content,
    targetCompanyId: row.target_company_id,
    targetCompanyName: row.target_company_name,
    mainBusiness: row.main_business,
    investmentDirection: row.investment_direction,
    domesticOverseas: row.domestic_overseas,
    currencyCode: row.currency_code,
    exchangeRate: row.exchange_rate,
    plannedShareholdingRatio: row.planned_shareholding_ratio,
    projectTotalInvestment: row.project_total_investment,
    plannedInvestment: row.planned_investment,
    expectedReturnRate: row.expected_return_rate,
    status: row.status,
    currentStage: row.current_stage,
    departmentHeadApproverId: row.department_head_approver_id,
    supervisingLeaderApproverId: row.supervising_leader_approver_id,
    currentApproverUserId: row.current_approver_user_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class IntentionService {
  constructor(private readonly pool: Pool, private readonly auth: AuthService) {}

  async list(
    user: AuthUser,
    canReadAll: boolean,
    mode: 'mine' | 'todo' | 'all',
    paging: { page: number; pageSize: number; offset: number }
  ) {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (mode === 'all') {
      if (!canReadAll) throw new AppError('无权查看全部投资意向', 403, 'FORBIDDEN');
    } else if (mode === 'todo') {
      conditions.push('current_approver_user_id = ?');
      values.push(user.id);
    } else {
      conditions.push('applicant_user_id = ?');
      values.push(user.id);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [counts] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM tz_investment_intention ${where}`,
      values
    );
    const [rows] = await this.pool.query<IntentionRow[]>(
      `SELECT * FROM tz_investment_intention
        ${where}
        ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, paging.pageSize, paging.offset]
    );
    return {
      items: rows.map(toDto),
      total: Number(counts[0]?.total ?? 0),
      page: paging.page,
      pageSize: paging.pageSize
    };
  }

  async get(id: string, user: AuthUser, canReadAll: boolean) {
    const row = await this.getRow(id);
    this.assertVisible(row, user, canReadAll);
    const [history] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, action, from_stage AS fromStage, to_stage AS toStage,
              operator_id AS operatorId, operator_name AS operatorName,
              operator_role AS operatorRole, comment, created_at AS createdAt
         FROM tz_investment_workflow_history
        WHERE intention_id = ? ORDER BY id ASC`,
      [id]
    );
    const [attachments] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, attachment_category AS category, original_name AS originalName,
              mime_type AS mimeType, file_size AS fileSize, uploaded_at AS uploadedAt
         FROM tz_business_attachment
        WHERE business_type = 'INVESTMENT_INTENTION' AND business_id = ?
        ORDER BY uploaded_at ASC`,
      [id]
    );
    return { ...toDto(row), history, attachments };
  }

  async create(input: IntentionInput, user: AuthUser) {
    this.requireBusinessOrganization(user);
    const directory = await this.resolveDirectoryValues(input);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const applicationNo = await this.nextApplicationNo(connection, new Date());
      const id = randomUUID();
      const values = this.inputValues(input, directory);
      await connection.execute(
        `INSERT INTO tz_investment_intention (
          id, application_no, applicant_user_id, applicant_name, applicant_department_id,
          investment_entity_id, investment_entity_name, application_date,
          project_name, investment_method, is_major_project,
          planned_start_date, planned_end_date,
          project_leader_user_id, project_leader_name, contact_phone,
          project_location, project_summary, main_content,
          target_company_id, target_company_name, main_business,
          investment_direction, domestic_overseas, currency_code, exchange_rate,
          planned_shareholding_ratio, project_total_investment, planned_investment,
          expected_return_rate, status, current_stage, created_by, updated_by
        ) VALUES (${Array(34).fill('?').join(', ')})`,
        [
          id, applicationNo, user.id, user.name, user.departmentId,
          ...values, IntentionStatus.PendingSend, 0, user.id, user.id
        ]
      );
      await connection.commit();
      return this.get(id, user, false);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async update(id: string, input: IntentionInput, user: AuthUser) {
    const current = await this.getRow(id);
    this.assertOwner(current, user);
    if (current.status !== IntentionStatus.PendingSend && current.status !== IntentionStatus.Returned) {
      throw new AppError('当前状态不允许修改', 409, 'INVALID_STATUS');
    }
    if (!input.version) throw new AppError('缺少数据版本号', 400, 'VALIDATION_ERROR');
    const directory = await this.resolveDirectoryValues(input);
    const values = this.inputValues(input, directory);
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE tz_investment_intention SET
        investment_entity_id = ?, investment_entity_name = ?, application_date = ?,
        project_name = ?, investment_method = ?, is_major_project = ?,
        planned_start_date = ?, planned_end_date = ?,
        project_leader_user_id = ?, project_leader_name = ?, contact_phone = ?,
        project_location = ?, project_summary = ?, main_content = ?,
        target_company_id = ?, target_company_name = ?, main_business = ?,
        investment_direction = ?, domestic_overseas = ?, currency_code = ?, exchange_rate = ?,
        planned_shareholding_ratio = ?, project_total_investment = ?, planned_investment = ?,
        expected_return_rate = ?, version = version + 1, updated_by = ?
       WHERE id = ? AND version = ?`,
      [...values, user.id, id, input.version]
    );
    if (!result.affectedRows) throw new AppError('数据已被其他用户修改，请刷新后重试', 409, 'VERSION_CONFLICT');
    return this.get(id, user, false);
  }

  async submit(id: string, user: AuthUser) {
    this.requireBusinessOrganization(user);
    const current = await this.getRow(id);
    this.assertOwner(current, user);
    if (current.status !== IntentionStatus.PendingSend && current.status !== IntentionStatus.Returned) {
      throw new AppError('当前状态不允许发送', 409, 'INVALID_STATUS');
    }
    const [departments] = await this.pool.query<RowDataPacket[]>(
      `SELECT d.department_head_user_id, d.supervising_leader_user_id,
              d.id AS department_id, d.unit_id,
              d.status AS department_status, u.status AS unit_status,
              h.status AS head_status, h.department_id AS head_department_id,
              l.status AS leader_status, ld.unit_id AS leader_unit_id
         FROM tz_org_department d
         JOIN tz_org_unit u ON u.id = d.unit_id
         LEFT JOIN tz_sys_user h ON h.id = d.department_head_user_id
         LEFT JOIN tz_sys_user l ON l.id = d.supervising_leader_user_id
         LEFT JOIN tz_org_department ld ON ld.id = l.department_id
        WHERE d.id = ?`,
      [user.departmentId]
    );
    const department = departments[0];
    if (!department || department.department_status !== 'ACTIVE' || department.unit_status !== 'ACTIVE') {
      throw new AppError('申请人所属组织未启用', 409, 'ORGANIZATION_NOT_READY');
    }
    if (!department.department_head_user_id || !department.supervising_leader_user_id) {
      throw new AppError('申请人所属部门尚未配置部门负责人和分管领导', 409, 'APPROVER_NOT_CONFIGURED');
    }
    if (department.head_status !== 'ACTIVE' || department.leader_status !== 'ACTIVE') {
      throw new AppError('审批人员已停用，请联系管理员调整部门负责人', 409, 'APPROVER_INACTIVE');
    }
    if (department.head_department_id !== department.department_id || department.leader_unit_id !== department.unit_id) {
      throw new AppError('审批人员的组织归属已变化，请联系管理员重新配置', 409, 'APPROVER_ORGANIZATION_MISMATCH');
    }
    if (!(await this.auth.hasPermission(department.department_head_user_id, 'investment.intention.approve_department')) ||
        !(await this.auth.hasPermission(department.supervising_leader_user_id, 'investment.intention.approve_supervising'))) {
      throw new AppError('审批人员缺少对应审批权限', 409, 'APPROVER_PERMISSION_REQUIRED');
    }
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE tz_investment_intention
            SET status = ?, current_stage = 1, applicant_department_id = ?,
                department_head_approver_id = ?, supervising_leader_approver_id = ?,
                current_approver_user_id = ?, version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [
          IntentionStatus.InReview, user.departmentId,
          department.department_head_user_id, department.supervising_leader_user_id,
          department.department_head_user_id, user.id, id, current.version
        ]
      );
      if (!result.affectedRows) throw new AppError('数据已被其他用户处理，请刷新后重试', 409, 'VERSION_CONFLICT');
      await this.insertHistory(connection, id, 'SUBMIT', current.current_stage, 1, user, 'initiator', null);
      await connection.commit();
      return this.get(id, user, false);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async approve(id: string, user: AuthUser, comment: string | null) {
    const current = await this.getRow(id);
    this.assertCurrentApprover(current, user);
    if (current.status !== IntentionStatus.InReview) throw new AppError('当前状态不允许审核', 409, 'INVALID_STATUS');
    const isDepartmentStage = current.current_stage === 1;
    const permission = isDepartmentStage
      ? 'investment.intention.approve_department'
      : 'investment.intention.approve_supervising';
    if (![1, 2].includes(current.current_stage) || !user.permissions.includes(permission)) {
      throw new AppError('当前用户无权审核此节点', 403, 'FORBIDDEN');
    }
    const nextStatus = isDepartmentStage ? IntentionStatus.InReview : IntentionStatus.Approved;
    const nextStage = isDepartmentStage ? 2 : 3;
    const nextApprover = isDepartmentStage ? current.supervising_leader_approver_id : null;
    if (isDepartmentStage) await this.assertApproverAvailable(nextApprover, 'investment.intention.approve_supervising');
    await this.transition(id, current, 'APPROVE', nextStatus, nextStage, nextApprover, user,
      isDepartmentStage ? 'department_head' : 'division_leader', comment);
    return this.get(id, user, false);
  }

  async returnToInitiator(id: string, user: AuthUser, comment: string | null) {
    const current = await this.getRow(id);
    this.assertCurrentApprover(current, user);
    if (current.status !== IntentionStatus.InReview || ![1, 2].includes(current.current_stage)) {
      throw new AppError('当前状态不允许退回', 409, 'INVALID_STATUS');
    }
    const permission = current.current_stage === 1
      ? 'investment.intention.approve_department'
      : 'investment.intention.approve_supervising';
    if (!user.permissions.includes(permission)) throw new AppError('当前用户无权退回此节点', 403, 'FORBIDDEN');
    await this.transition(
      id, current, 'RETURN', IntentionStatus.Returned, 0, null, user,
      current.current_stage === 1 ? 'department_head' : 'division_leader', comment
    );
    return this.get(id, user, false);
  }

  async assertCanView(id: string, user: AuthUser, canReadAll: boolean) {
    const row = await this.getRow(id);
    this.assertVisible(row, user, canReadAll);
    return row;
  }

  async assertCanEdit(id: string, user: AuthUser) {
    const row = await this.getRow(id);
    this.assertOwner(row, user);
    if (![IntentionStatus.PendingSend, IntentionStatus.Returned].includes(row.status as never)) {
      throw new AppError('当前状态不允许上传附件', 409, 'INVALID_STATUS');
    }
    return row;
  }

  private async resolveDirectoryValues(input: IntentionInput): Promise<{
    unitId: string | null; unitName: string | null; leaderId: string | null; leaderName: string | null;
  }> {
    let unitName: string | null = null;
    if (input.investmentEntityId) {
      const [units] = await this.pool.query<RowDataPacket[]>(
        "SELECT unit_name FROM tz_org_unit WHERE id = ? AND status = 'ACTIVE'",
        [input.investmentEntityId]
      );
      if (!units[0]) throw new AppError('投资主体不存在或已停用', 400, 'INVALID_INVESTMENT_ENTITY');
      unitName = units[0].unit_name;
    }
    let leaderName: string | null = null;
    if (input.projectLeaderUserId) {
      const [users] = await this.pool.query<RowDataPacket[]>(
        'SELECT display_name FROM tz_sys_user WHERE id = ? AND status = \'ACTIVE\'',
        [input.projectLeaderUserId]
      );
      if (!users[0]) throw new AppError('项目负责人不存在或已停用', 400, 'INVALID_PROJECT_LEADER');
      leaderName = users[0].display_name;
    }
    return {
      unitId: input.investmentEntityId ?? null,
      unitName,
      leaderId: input.projectLeaderUserId ?? null,
      leaderName
    };
  }

  private inputValues(
    input: IntentionInput,
    directory: { unitId: string | null; unitName: string | null; leaderId: string | null; leaderName: string | null }
  ): Array<string | number | null> {
    return [
      directory.unitId,
      directory.unitName,
      nullable(input.applicationDate),
      nullable(input.projectName),
      nullable(input.investmentMethod ?? 'EQUITY'),
      input.majorProject === null || input.majorProject === undefined ? null : Number(input.majorProject),
      nullable(input.plannedStartDate),
      nullable(input.plannedEndDate),
      directory.leaderId,
      directory.leaderName,
      nullable(input.contactPhone),
      nullable(input.projectLocation),
      nullable(input.projectSummary),
      nullable(input.mainContent),
      nullable(input.targetCompanyId),
      nullable(input.targetCompanyName),
      nullable(input.mainBusiness),
      nullable(input.investmentDirection),
      nullable(input.domesticOverseas),
      nullable(input.currencyCode),
      nullable(input.exchangeRate),
      nullable(input.plannedShareholdingRatio),
      nullable(input.projectTotalInvestment),
      nullable(input.plannedInvestment),
      nullable(input.expectedReturnRate)
    ];
  }

  private requireBusinessOrganization(user: AuthUser) {
    if (!user.departmentId || !user.positionId) {
      throw new AppError('当前人员尚未配置部门和岗位，不能办理投资业务', 409, 'ORGANIZATION_REQUIRED');
    }
  }

  private assertVisible(row: IntentionRow, user: AuthUser, canReadAll: boolean) {
    if (!canReadAll && row.applicant_user_id !== user.id && row.current_approver_user_id !== user.id &&
        row.department_head_approver_id !== user.id && row.supervising_leader_approver_id !== user.id) {
      throw new AppError('无权查看该投资意向', 403, 'FORBIDDEN');
    }
  }

  private assertOwner(row: IntentionRow, user: AuthUser) {
    if (row.applicant_user_id !== user.id) throw new AppError('只能维护本人发起的投资意向', 403, 'FORBIDDEN');
  }

  private assertCurrentApprover(row: IntentionRow, user: AuthUser) {
    if (!row.current_approver_user_id || row.current_approver_user_id !== user.id) {
      throw new AppError('当前用户不是该节点指定审批人', 403, 'FORBIDDEN');
    }
  }

  private async assertApproverAvailable(userId: string | null, permission: string) {
    if (!userId) throw new AppError('下一审批人未配置', 409, 'APPROVER_NOT_CONFIGURED');
    const [users] = await this.pool.query<RowDataPacket[]>(
      "SELECT status FROM tz_sys_user WHERE id = ?",
      [userId]
    );
    if (!users[0] || users[0].status !== 'ACTIVE' || !(await this.auth.hasPermission(userId, permission))) {
      throw new AppError('下一审批人已停用或权限不足', 409, 'APPROVER_UNAVAILABLE');
    }
  }

  private async getRow(id: string): Promise<IntentionRow> {
    const [rows] = await this.pool.query<IntentionRow[]>('SELECT * FROM tz_investment_intention WHERE id = ?', [id]);
    if (!rows[0]) throw new AppError('投资意向不存在', 404, 'NOT_FOUND');
    return rows[0];
  }

  private async nextApplicationNo(connection: PoolConnection, now: Date): Promise<string> {
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await connection.execute(
      `INSERT INTO tz_monthly_sequence (period, current_value)
       VALUES (?, 1) ON DUPLICATE KEY UPDATE current_value = current_value + 1`,
      [period]
    );
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT current_value FROM tz_monthly_sequence WHERE period = ? FOR UPDATE',
      [period]
    );
    return formatApplicationNo(now, Number(rows[0].current_value));
  }

  private async transition(
    id: string,
    current: IntentionRow,
    action: string,
    status: string,
    nextStage: number,
    nextApproverUserId: string | null,
    user: AuthUser,
    operatorRole: string,
    comment: string | null
  ) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE tz_investment_intention
            SET status = ?, current_stage = ?, current_approver_user_id = ?,
                version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [status, nextStage, nextApproverUserId, user.id, id, current.version]
      );
      if (!result.affectedRows) throw new AppError('数据已被其他用户处理，请刷新后重试', 409, 'VERSION_CONFLICT');
      await this.insertHistory(connection, id, action, current.current_stage, nextStage, user, operatorRole, comment);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async insertHistory(
    connection: PoolConnection,
    id: string,
    action: string,
    fromStage: number,
    toStage: number,
    user: AuthUser,
    operatorRole: string,
    comment: string | null
  ) {
    await connection.execute(
      `INSERT INTO tz_investment_workflow_history (
        intention_id, action, from_stage, to_stage,
        operator_id, operator_name, operator_role, comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, action, fromStage, toStage, user.id, user.name, operatorRole, nullable(comment)]
    );
  }
}
