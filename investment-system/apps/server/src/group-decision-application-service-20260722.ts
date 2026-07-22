import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AuthService } from './auth-service.js';
import {
  AppError,
  DocumentStatus,
  type AuthUser,
  type GroupDecisionApplicationInput
} from './types.js';

const DOCUMENT_TYPE = 'GROUP_DECISION_APPLICATION';
const investmentDirections = ['STRATEGIC', 'FINANCIAL', 'INDUSTRIAL'] as const;
const domesticOverseasValues = ['DOMESTIC', 'OVERSEAS'] as const;
const investmentMethods = ['EQUITY', 'FIXED_ASSET', 'FUND', 'OTHER'] as const;
const currencyCodes = ['CNY', 'USD', 'EUR', 'HKD'] as const;

interface GroupDecisionRow extends RowDataPacket {
  id: string;
  application_no: string;
  applicant_user_id: string;
  applicant_name: string;
  applicant_unit_id: string | null;
  applicant_unit_name: string | null;
  application_date: string;
  application_year: number;
  applicant_department_id: string | null;
  applicant_department_name: string | null;
  project_name: string | null;
  project_code: string | null;
  project_leader_user_id: string | null;
  project_leader_name: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  investment_entity_id: string | null;
  investment_entity_name: string | null;
  investment_direction: string | null;
  domestic_overseas: string | null;
  investment_method: string | null;
  is_major_project: number | null;
  currency_code: string | null;
  project_total_investment: string | null;
  planned_investment: string | null;
  expected_return_rate: string | null;
  funding_company_owned: string | null;
  funding_group_requested: string | null;
  funding_special_bond: string | null;
  funding_government: string | null;
  funding_loan: string | null;
  funding_other: string | null;
  annual_planned_investment: string | null;
  status: string;
  current_stage: number;
  department_head_approver_id: string | null;
  supervising_leader_approver_id: string | null;
  current_approver_user_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface NormalizedGroupDecisionInput {
  applicationDate: string | null;
  applicationYear: number | null;
  projectName: string | null;
  projectCode: string | null;
  projectLeaderUserId: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  investmentEntityId: string | null;
  investmentDirection: string | null;
  domesticOverseas: string | null;
  investmentMethod: string | null;
  majorProject: boolean | null;
  currencyCode: string | null;
  projectTotalInvestment: string | null;
  plannedInvestment: string | null;
  expectedReturnRate: string | null;
  fundingCompanyOwned: string | null;
  fundingGroupRequested: string | null;
  fundingSpecialBond: string | null;
  fundingGovernment: string | null;
  fundingLoan: string | null;
  fundingOther: string | null;
  annualPlannedInvestment: string | null;
}

interface ApplicantOrganization {
  departmentId: string;
  departmentName: string;
  unitId: string;
  unitName: string;
  departmentHeadUserId: string | null;
  supervisingLeaderUserId: string | null;
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(`${field}格式无效`, 400, 'VALIDATION_ERROR');
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw new AppError(`${field}不能超过${maxLength}个字符`, 400, 'VALIDATION_ERROR');
  }
  return text;
}

function optionalDate(value: unknown, field: string): string | null {
  const text = optionalText(value, field, 10);
  if (text === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new AppError(`${field}格式应为YYYY-MM-DD`, 400, 'VALIDATION_ERROR');
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new AppError(`${field}不是有效日期`, 400, 'VALIDATION_ERROR');
  }
  return text;
}

function optionalYear(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError('申请年度应为2000至2100之间的整数', 400, 'VALIDATION_ERROR');
  }
  return year;
}

function optionalEnum(value: unknown, field: string, allowed: readonly string[]): string | null {
  const text = optionalText(value, field, 64);
  if (text === null) return null;
  if (!allowed.includes(text)) throw new AppError(`${field}取值无效`, 400, 'VALIDATION_ERROR');
  return text;
}

function optionalBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'boolean') throw new AppError(`${field}应为布尔值`, 400, 'VALIDATION_ERROR');
  return value;
}

function optionalMoney(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{1,18}(\.\d{1,2})?$/.test(text)) {
    throw new AppError(`${field}应为非负金额且最多保留两位小数`, 400, 'VALIDATION_ERROR');
  }
  return text;
}

function optionalRate(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(text) || Number(text) > 100) {
    throw new AppError('预计收益率应在0至100之间', 400, 'VALIDATION_ERROR');
  }
  return text;
}

export function validateGroupDecisionInput(input: GroupDecisionApplicationInput): NormalizedGroupDecisionInput {
  const plannedStartDate = optionalDate(input.plannedStartDate, '计划开始日期');
  const plannedEndDate = optionalDate(input.plannedEndDate, '计划结束日期');
  if (plannedStartDate && plannedEndDate && plannedStartDate > plannedEndDate) {
    throw new AppError('计划结束日期不能早于计划开始日期', 400, 'VALIDATION_ERROR');
  }
  const applicationDate = optionalDate(input.applicationDate, '申请日期');
  const applicationYear = optionalYear(input.applicationYear);
  if (applicationDate && applicationYear && Number(applicationDate.slice(0, 4)) !== applicationYear) {
    throw new AppError('申请年度必须与申请日期年度一致', 400, 'VALIDATION_ERROR');
  }
  return {
    applicationDate,
    applicationYear,
    projectName: optionalText(input.projectName, '项目名称', 255),
    projectCode: optionalText(input.projectCode, '项目编码', 64),
    projectLeaderUserId: optionalText(input.projectLeaderUserId, '项目负责人用户ID', 36),
    plannedStartDate,
    plannedEndDate,
    investmentEntityId: optionalText(input.investmentEntityId, '投资主体组织ID', 36),
    investmentDirection: optionalEnum(input.investmentDirection, '投资方向', investmentDirections),
    domesticOverseas: optionalEnum(input.domesticOverseas, '境内外', domesticOverseasValues),
    investmentMethod: optionalEnum(input.investmentMethod, '投资方式', investmentMethods),
    majorProject: optionalBoolean(input.majorProject, '重大项目'),
    currencyCode: optionalEnum(input.currencyCode, '投资币种', currencyCodes),
    projectTotalInvestment: optionalMoney(input.projectTotalInvestment, '项目总投资'),
    plannedInvestment: optionalMoney(input.plannedInvestment, '计划投资额'),
    expectedReturnRate: optionalRate(input.expectedReturnRate),
    fundingCompanyOwned: optionalMoney(input.fundingCompanyOwned, '项目公司自有资金'),
    fundingGroupRequested: optionalMoney(input.fundingGroupRequested, '申请集团资金'),
    fundingSpecialBond: optionalMoney(input.fundingSpecialBond, '项目专项债'),
    fundingGovernment: optionalMoney(input.fundingGovernment, '政府资金'),
    fundingLoan: optionalMoney(input.fundingLoan, '贷款'),
    fundingOther: optionalMoney(input.fundingOther, '其他资金'),
    annualPlannedInvestment: optionalMoney(input.annualPlannedInvestment, '本年计划投资额')
  };
}

export function formatGroupDecisionApplicationNo(date: Date, sequence: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `JTJC-${year}${month}-${String(sequence).padStart(4, '0')}`;
}

function toDto(row: GroupDecisionRow) {
  return {
    id: row.id,
    applicationNo: row.application_no,
    applicantUserId: row.applicant_user_id,
    applicantName: row.applicant_name,
    applicantUnitId: row.applicant_unit_id,
    applicantUnitName: row.applicant_unit_name,
    applicationDate: row.application_date,
    applicationYear: row.application_year,
    applicantDepartmentId: row.applicant_department_id,
    applicantDepartmentName: row.applicant_department_name,
    projectName: row.project_name,
    projectCode: row.project_code,
    projectLeaderUserId: row.project_leader_user_id,
    projectLeaderName: row.project_leader_name,
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    investmentEntityId: row.investment_entity_id,
    investmentEntityName: row.investment_entity_name,
    investmentDirection: row.investment_direction,
    domesticOverseas: row.domestic_overseas,
    investmentMethod: row.investment_method,
    majorProject: row.is_major_project === null ? null : Boolean(row.is_major_project),
    currencyCode: row.currency_code,
    projectTotalInvestment: row.project_total_investment,
    plannedInvestment: row.planned_investment,
    expectedReturnRate: row.expected_return_rate,
    fundingCompanyOwned: row.funding_company_owned,
    fundingGroupRequested: row.funding_group_requested,
    fundingSpecialBond: row.funding_special_bond,
    fundingGovernment: row.funding_government,
    fundingLoan: row.funding_loan,
    fundingOther: row.funding_other,
    annualPlannedInvestment: row.annual_planned_investment,
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

export class GroupDecisionApplicationService {
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
      if (!canReadAll) throw new AppError('无权查看全部集团决策申请', 403, 'FORBIDDEN');
    } else if (mode === 'todo') {
      conditions.push('current_approver_user_id = ?');
      values.push(user.id);
    } else {
      conditions.push('applicant_user_id = ?');
      values.push(user.id);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [counts] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM tz_group_decision_application ${where}`,
      values
    );
    const [rows] = await this.pool.query<GroupDecisionRow[]>(
      `SELECT * FROM tz_group_decision_application ${where}
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
         FROM tz_document_workflow_history
        WHERE document_type = ? AND business_id = ? ORDER BY id ASC`,
      [DOCUMENT_TYPE, id]
    );
    return { ...toDto(row), history };
  }

  async create(input: GroupDecisionApplicationInput, user: AuthUser) {
    this.requireBusinessOrganization(user);
    const normalized = validateGroupDecisionInput(input);
    const organization = await this.resolveApplicantOrganization(user.departmentId!);
    const directory = await this.resolveDirectoryValues(normalized);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const now = new Date();
      const id = randomUUID();
      const applicationNo = await this.nextApplicationNo(connection, now);
      const applicationDate = normalized.applicationDate ?? this.formatDate(now);
      const applicationYear = normalized.applicationYear ?? Number(applicationDate.slice(0, 4));
      const values = [
        id, applicationNo, user.id, user.name,
        organization.unitId, organization.unitName, applicationDate, applicationYear,
        organization.departmentId, organization.departmentName,
        ...this.businessValues(normalized, directory),
        DocumentStatus.PendingSend, 0, user.id, user.id
      ];
      await connection.execute(
        `INSERT INTO tz_group_decision_application (
          id, application_no, applicant_user_id, applicant_name,
          applicant_unit_id, applicant_unit_name, application_date, application_year,
          applicant_department_id, applicant_department_name,
          project_name, project_code, project_leader_user_id, project_leader_name,
          planned_start_date, planned_end_date, investment_entity_id, investment_entity_name,
          investment_direction, domestic_overseas, investment_method, is_major_project,
          currency_code, project_total_investment, planned_investment, expected_return_rate,
          funding_company_owned, funding_group_requested, funding_special_bond,
          funding_government, funding_loan, funding_other, annual_planned_investment,
          status, current_stage, created_by, updated_by
        ) VALUES (${values.map(() => '?').join(', ')})`,
        values
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

  async update(id: string, input: GroupDecisionApplicationInput, user: AuthUser) {
    const current = await this.getRow(id);
    this.assertOwner(current, user);
    if (![DocumentStatus.PendingSend, DocumentStatus.Returned].includes(current.status as never)) {
      throw new AppError('当前状态不允许修改', 409, 'INVALID_STATUS');
    }
    if (!input.version) throw new AppError('缺少数据版本号', 400, 'VALIDATION_ERROR');
    const normalized = validateGroupDecisionInput(input);
    const directory = await this.resolveDirectoryValues(normalized);
    const applicationDate = normalized.applicationDate ?? current.application_date;
    const applicationYear = normalized.applicationYear ?? current.application_year;
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE tz_group_decision_application SET
        application_date = ?, application_year = ?,
        project_name = ?, project_code = ?, project_leader_user_id = ?, project_leader_name = ?,
        planned_start_date = ?, planned_end_date = ?, investment_entity_id = ?, investment_entity_name = ?,
        investment_direction = ?, domestic_overseas = ?, investment_method = ?, is_major_project = ?,
        currency_code = ?, project_total_investment = ?, planned_investment = ?, expected_return_rate = ?,
        funding_company_owned = ?, funding_group_requested = ?, funding_special_bond = ?,
        funding_government = ?, funding_loan = ?, funding_other = ?, annual_planned_investment = ?,
        version = version + 1, updated_by = ?
       WHERE id = ? AND version = ?`,
      [applicationDate, applicationYear, ...this.businessValues(normalized, directory), user.id, id, input.version]
    );
    if (!result.affectedRows) {
      throw new AppError('数据已被其他用户修改，请刷新后重试', 409, 'VERSION_CONFLICT');
    }
    return this.get(id, user, false);
  }

  async submit(id: string, user: AuthUser) {
    this.requireBusinessOrganization(user);
    const current = await this.getRow(id);
    this.assertOwner(current, user);
    if (![DocumentStatus.PendingSend, DocumentStatus.Returned].includes(current.status as never)) {
      throw new AppError('当前状态不允许发送', 409, 'INVALID_STATUS');
    }
    const organization = await this.resolveApplicantOrganization(user.departmentId!, true);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE tz_group_decision_application
            SET status = ?, current_stage = 1,
                applicant_unit_id = ?, applicant_unit_name = ?,
                applicant_department_id = ?, applicant_department_name = ?,
                department_head_approver_id = ?, supervising_leader_approver_id = ?,
                current_approver_user_id = ?, version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [
          DocumentStatus.InReview, organization.unitId, organization.unitName,
          organization.departmentId, organization.departmentName,
          organization.departmentHeadUserId, organization.supervisingLeaderUserId,
          organization.departmentHeadUserId, user.id, id, current.version
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
    if (current.status !== DocumentStatus.InReview || ![1, 2].includes(current.current_stage)) {
      throw new AppError('当前状态不允许审核', 409, 'INVALID_STATUS');
    }
    const isDepartmentStage = current.current_stage === 1;
    const permission = isDepartmentStage
      ? 'investment.group_decision.approve_department'
      : 'investment.group_decision.approve_supervising';
    if (!user.permissions.includes(permission)) throw new AppError('当前用户无权审核此节点', 403, 'FORBIDDEN');
    const nextApprover = isDepartmentStage ? current.supervising_leader_approver_id : null;
    if (isDepartmentStage) {
      await this.assertApproverAvailable(nextApprover, 'investment.group_decision.approve_supervising');
    }
    await this.transition(
      id,
      current,
      'APPROVE',
      isDepartmentStage ? DocumentStatus.InReview : DocumentStatus.Approved,
      isDepartmentStage ? 2 : 3,
      nextApprover,
      user,
      isDepartmentStage ? 'department_head' : 'division_leader',
      comment
    );
    return this.get(id, user, false);
  }

  async returnToInitiator(id: string, user: AuthUser, comment: string | null) {
    const current = await this.getRow(id);
    this.assertCurrentApprover(current, user);
    if (current.status !== DocumentStatus.InReview || ![1, 2].includes(current.current_stage)) {
      throw new AppError('当前状态不允许退回', 409, 'INVALID_STATUS');
    }
    const permission = current.current_stage === 1
      ? 'investment.group_decision.approve_department'
      : 'investment.group_decision.approve_supervising';
    if (!user.permissions.includes(permission)) throw new AppError('当前用户无权退回此节点', 403, 'FORBIDDEN');
    await this.transition(
      id, current, 'RETURN', DocumentStatus.Returned, 0, null, user,
      current.current_stage === 1 ? 'department_head' : 'division_leader', comment
    );
    return this.get(id, user, false);
  }

  private async resolveDirectoryValues(input: NormalizedGroupDecisionInput): Promise<{
    investmentEntityName: string | null;
    projectLeaderName: string | null;
  }> {
    let investmentEntityName: string | null = null;
    if (input.investmentEntityId) {
      const [units] = await this.pool.query<RowDataPacket[]>(
        "SELECT unit_name FROM tz_org_unit WHERE id = ? AND status = 'ACTIVE'",
        [input.investmentEntityId]
      );
      if (!units[0]) throw new AppError('投资主体不存在或已停用', 400, 'INVALID_INVESTMENT_ENTITY');
      investmentEntityName = units[0].unit_name;
    }
    let projectLeaderName: string | null = null;
    if (input.projectLeaderUserId) {
      const [users] = await this.pool.query<RowDataPacket[]>(
        "SELECT display_name FROM tz_sys_user WHERE id = ? AND status = 'ACTIVE'",
        [input.projectLeaderUserId]
      );
      if (!users[0]) throw new AppError('项目负责人不存在或已停用', 400, 'INVALID_PROJECT_LEADER');
      projectLeaderName = users[0].display_name;
    }
    return { investmentEntityName, projectLeaderName };
  }

  private async resolveApplicantOrganization(departmentId: string, requireApprovers = false): Promise<ApplicantOrganization> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT d.id AS department_id, d.department_name, d.department_head_user_id,
              d.supervising_leader_user_id, d.status AS department_status,
              u.id AS unit_id, u.unit_name, u.status AS unit_status,
              h.status AS head_status, h.department_id AS head_department_id,
              l.status AS leader_status, ld.unit_id AS leader_unit_id
         FROM tz_org_department d
         JOIN tz_org_unit u ON u.id = d.unit_id
         LEFT JOIN tz_sys_user h ON h.id = d.department_head_user_id
         LEFT JOIN tz_sys_user l ON l.id = d.supervising_leader_user_id
         LEFT JOIN tz_org_department ld ON ld.id = l.department_id
        WHERE d.id = ?`,
      [departmentId]
    );
    const row = rows[0];
    if (!row || row.department_status !== 'ACTIVE' || row.unit_status !== 'ACTIVE') {
      throw new AppError('申请人所属组织未启用', 409, 'ORGANIZATION_NOT_READY');
    }
    if (requireApprovers) {
      if (!row.department_head_user_id || !row.supervising_leader_user_id) {
        throw new AppError('申请人所属部门尚未配置部门负责人和分管领导', 409, 'APPROVER_NOT_CONFIGURED');
      }
      if (row.head_status !== 'ACTIVE' || row.leader_status !== 'ACTIVE') {
        throw new AppError('审批人员已停用，请联系管理员调整部门负责人', 409, 'APPROVER_INACTIVE');
      }
      if (row.head_department_id !== row.department_id || row.leader_unit_id !== row.unit_id) {
        throw new AppError('审批人员的组织归属已变化，请联系管理员重新配置', 409, 'APPROVER_ORGANIZATION_MISMATCH');
      }
      if (!(await this.auth.hasPermission(row.department_head_user_id, 'investment.group_decision.approve_department')) ||
          !(await this.auth.hasPermission(row.supervising_leader_user_id, 'investment.group_decision.approve_supervising'))) {
        throw new AppError('审批人员缺少对应审批权限', 409, 'APPROVER_PERMISSION_REQUIRED');
      }
    }
    return {
      departmentId: row.department_id,
      departmentName: row.department_name,
      unitId: row.unit_id,
      unitName: row.unit_name,
      departmentHeadUserId: row.department_head_user_id ?? null,
      supervisingLeaderUserId: row.supervising_leader_user_id ?? null
    };
  }

  private businessValues(
    input: NormalizedGroupDecisionInput,
    directory: { investmentEntityName: string | null; projectLeaderName: string | null }
  ): Array<string | number | null> {
    return [
      input.projectName, input.projectCode, input.projectLeaderUserId, directory.projectLeaderName,
      input.plannedStartDate, input.plannedEndDate, input.investmentEntityId, directory.investmentEntityName,
      input.investmentDirection, input.domesticOverseas, input.investmentMethod,
      input.majorProject === null ? null : Number(input.majorProject), input.currencyCode,
      input.projectTotalInvestment, input.plannedInvestment, input.expectedReturnRate,
      input.fundingCompanyOwned, input.fundingGroupRequested, input.fundingSpecialBond,
      input.fundingGovernment, input.fundingLoan, input.fundingOther, input.annualPlannedInvestment
    ];
  }

  private requireBusinessOrganization(user: AuthUser) {
    if (!user.departmentId || !user.positionId) {
      throw new AppError('当前人员尚未配置部门和岗位，不能办理投资业务', 409, 'ORGANIZATION_REQUIRED');
    }
  }

  private assertVisible(row: GroupDecisionRow, user: AuthUser, canReadAll: boolean) {
    if (!canReadAll && row.applicant_user_id !== user.id && row.current_approver_user_id !== user.id &&
        row.department_head_approver_id !== user.id && row.supervising_leader_approver_id !== user.id) {
      throw new AppError('无权查看该集团决策申请', 403, 'FORBIDDEN');
    }
  }

  private assertOwner(row: GroupDecisionRow, user: AuthUser) {
    if (row.applicant_user_id !== user.id) {
      throw new AppError('只能维护本人发起的集团决策申请', 403, 'FORBIDDEN');
    }
  }

  private assertCurrentApprover(row: GroupDecisionRow, user: AuthUser) {
    if (!row.current_approver_user_id || row.current_approver_user_id !== user.id) {
      throw new AppError('当前用户不是该节点指定审批人', 403, 'FORBIDDEN');
    }
  }

  private async assertApproverAvailable(userId: string | null, permission: string) {
    if (!userId) throw new AppError('下一审批人未配置', 409, 'APPROVER_NOT_CONFIGURED');
    const [users] = await this.pool.query<RowDataPacket[]>(
      'SELECT status FROM tz_sys_user WHERE id = ?',
      [userId]
    );
    if (!users[0] || users[0].status !== 'ACTIVE' || !(await this.auth.hasPermission(userId, permission))) {
      throw new AppError('下一审批人已停用或权限不足', 409, 'APPROVER_UNAVAILABLE');
    }
  }

  private async getRow(id: string): Promise<GroupDecisionRow> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new AppError('集团决策申请ID格式无效', 400, 'VALIDATION_ERROR');
    }
    const [rows] = await this.pool.query<GroupDecisionRow[]>(
      'SELECT * FROM tz_group_decision_application WHERE id = ?',
      [id]
    );
    if (!rows[0]) throw new AppError('集团决策申请不存在', 404, 'NOT_FOUND');
    return rows[0];
  }

  private async nextApplicationNo(connection: PoolConnection, now: Date): Promise<string> {
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await connection.execute(
      `INSERT INTO tz_document_monthly_sequence (document_type, period, current_value)
       VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE current_value = current_value + 1`,
      [DOCUMENT_TYPE, period]
    );
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT current_value FROM tz_document_monthly_sequence
        WHERE document_type = ? AND period = ? FOR UPDATE`,
      [DOCUMENT_TYPE, period]
    );
    return formatGroupDecisionApplicationNo(now, Number(rows[0].current_value));
  }

  private async transition(
    id: string,
    current: GroupDecisionRow,
    action: 'APPROVE' | 'RETURN',
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
        `UPDATE tz_group_decision_application
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
    action: 'SUBMIT' | 'APPROVE' | 'RETURN',
    fromStage: number,
    toStage: number,
    user: AuthUser,
    operatorRole: string,
    comment: string | null
  ) {
    await connection.execute(
      `INSERT INTO tz_document_workflow_history (
        document_type, business_id, action, from_stage, to_stage,
        operator_id, operator_name, operator_role, comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [DOCUMENT_TYPE, id, action, fromStage, toStage, user.id, user.name, operatorRole, comment]
    );
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
