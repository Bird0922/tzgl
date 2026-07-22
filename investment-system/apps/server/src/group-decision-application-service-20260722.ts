import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  AppError,
  DocumentStatus,
  type Actor,
  type GroupDecisionApplicationInput
} from './types.js';
import { approveTransition, returnTransition, submitTransition } from './workflow.js';

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
  projectLeaderName: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  investmentEntityId: string | null;
  investmentEntityName: string | null;
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

function optionalEnum(
  value: unknown,
  field: string,
  allowed: readonly string[]
): string | null {
  const text = optionalText(value, field, 64);
  if (text === null) return null;
  if (!allowed.includes(text)) {
    throw new AppError(`${field}取值无效`, 400, 'VALIDATION_ERROR');
  }
  return text;
}

function optionalBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'boolean') {
    throw new AppError(`${field}应为布尔值`, 400, 'VALIDATION_ERROR');
  }
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
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(text)) {
    throw new AppError('预计收益率格式无效', 400, 'VALIDATION_ERROR');
  }
  const rate = Number(text);
  if (rate < 0 || rate > 100) {
    throw new AppError('预计收益率应在0至100之间', 400, 'VALIDATION_ERROR');
  }
  return text;
}

function normalizeComment(value: string | null): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2000) {
    throw new AppError('审批意见不能超过2000个字符', 400, 'VALIDATION_ERROR');
  }
  return value.trim() || null;
}

export function validateGroupDecisionInput(
  input: GroupDecisionApplicationInput
): NormalizedGroupDecisionInput {
  const plannedStartDate = optionalDate(input.plannedStartDate, '计划开始日期');
  const plannedEndDate = optionalDate(input.plannedEndDate, '计划结束日期');
  if (plannedStartDate && plannedEndDate && plannedStartDate > plannedEndDate) {
    throw new AppError('计划结束日期不能早于计划开始日期', 400, 'VALIDATION_ERROR');
  }

  return {
    applicationDate: optionalDate(input.applicationDate, '申请日期'),
    applicationYear: optionalYear(input.applicationYear),
    projectName: optionalText(input.projectName, '项目名称', 255),
    projectCode: optionalText(input.projectCode, '项目编码', 64),
    projectLeaderUserId: optionalText(input.projectLeaderUserId, '项目负责人用户ID', 64),
    projectLeaderName: optionalText(input.projectLeaderName, '项目负责人', 128),
    plannedStartDate,
    plannedEndDate,
    investmentEntityId: optionalText(input.investmentEntityId, '投资主体组织ID', 64),
    investmentEntityName: optionalText(input.investmentEntityName, '投资主体', 255),
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
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function assertInitiator(actor: Actor): void {
  if (actor.role !== 'initiator') {
    throw new AppError('只有经办人可以新建或修改集团决策申请', 403, 'FORBIDDEN');
  }
}

function assertInitiatorOwns(row: GroupDecisionRow, actor: Actor): void {
  assertInitiator(actor);
  if (row.applicant_user_id !== actor.id) {
    throw new AppError('无权处理其他经办人的集团决策申请', 403, 'FORBIDDEN');
  }
}

function assertCanRead(row: GroupDecisionRow, actor: Actor): void {
  if (actor.role === 'initiator' && row.applicant_user_id !== actor.id) {
    throw new AppError('无权查看其他经办人的集团决策申请', 403, 'FORBIDDEN');
  }
}

function actorValue(value: string | undefined, field: string, maxLength: number): string | null {
  if (value === undefined || value === '') return null;
  if (value.length > maxLength) {
    throw new AppError(`${field}长度无效`, 400, 'INVALID_ACTOR');
  }
  return value;
}

export class GroupDecisionApplicationService {
  constructor(private readonly pool: Pool) {}

  async list(actor: Actor) {
    const params: string[] = [];
    const where = actor.role === 'initiator' ? 'WHERE applicant_user_id = ?' : '';
    if (actor.role === 'initiator') params.push(actor.id);
    const [rows] = await this.pool.query<GroupDecisionRow[]>(
      `SELECT * FROM tz_group_decision_application ${where}
       ORDER BY created_at DESC LIMIT 100`,
      params
    );
    return rows.map(toDto);
  }

  async get(id: string, actor: Actor) {
    const row = await this.getRow(id);
    assertCanRead(row, actor);
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

  async create(input: GroupDecisionApplicationInput, actor: Actor) {
    assertInitiator(actor);
    const normalized = validateGroupDecisionInput(input);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const now = new Date();
      const id = randomUUID();
      const applicationNo = await this.nextApplicationNo(connection, now);
      const applicationDate = normalized.applicationDate ?? this.formatDate(now);
      const applicationYear = normalized.applicationYear ?? Number(applicationDate.slice(0, 4));
      const values = [
        id,
        applicationNo,
        actor.id,
        actor.name,
        actorValue(actor.unitId, '申请单位ID', 64),
        actorValue(actor.unitName, '申请单位名称', 255),
        applicationDate,
        applicationYear,
        actorValue(actor.departmentId, '申请部门ID', 64),
        actorValue(actor.departmentName, '申请部门名称', 255),
        ...this.businessValues(normalized),
        DocumentStatus.PendingSend,
        0,
        actor.id,
        actor.id
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
      return this.get(id, actor);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async update(id: string, input: GroupDecisionApplicationInput, actor: Actor) {
    const current = await this.getRow(id);
    assertInitiatorOwns(current, actor);
    if (current.status !== DocumentStatus.PendingSend && current.status !== DocumentStatus.Returned) {
      throw new AppError('当前状态不允许修改', 409, 'INVALID_STATUS');
    }
    const normalized = validateGroupDecisionInput(input);
    const applicationDate = normalized.applicationDate ?? current.application_date;
    const applicationYear = normalized.applicationYear ?? current.application_year;
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE tz_group_decision_application SET
        application_date = ?, application_year = ?,
        project_name = ?, project_code = ?, project_leader_user_id = ?, project_leader_name = ?,
        planned_start_date = ?, planned_end_date = ?,
        investment_entity_id = ?, investment_entity_name = ?,
        investment_direction = ?, domestic_overseas = ?, investment_method = ?, is_major_project = ?,
        currency_code = ?, project_total_investment = ?, planned_investment = ?, expected_return_rate = ?,
        funding_company_owned = ?, funding_group_requested = ?, funding_special_bond = ?,
        funding_government = ?, funding_loan = ?, funding_other = ?, annual_planned_investment = ?,
        version = version + 1, updated_by = ?
       WHERE id = ? AND version = ?`,
      [
        applicationDate,
        applicationYear,
        ...this.businessValues(normalized),
        actor.id,
        id,
        current.version
      ]
    );
    if (!result.affectedRows) {
      throw new AppError('数据已被其他用户修改，请刷新后重试', 409, 'VERSION_CONFLICT');
    }
    return this.get(id, actor);
  }

  async submit(id: string, actor: Actor) {
    const current = await this.getRow(id);
    assertInitiatorOwns(current, actor);
    if (current.status !== DocumentStatus.PendingSend && current.status !== DocumentStatus.Returned) {
      throw new AppError('当前状态不允许发送', 409, 'INVALID_STATUS');
    }
    const next = submitTransition(current.current_stage, actor.role);
    await this.transition(id, current, 'SUBMIT', next.status, next.nextStage, actor, null);
    return this.get(id, actor);
  }

  async approve(id: string, actor: Actor, comment: string | null) {
    const current = await this.getRow(id);
    if (current.status !== DocumentStatus.InReview) {
      throw new AppError('当前状态不允许审核', 409, 'INVALID_STATUS');
    }
    const next = approveTransition(current.current_stage, actor.role);
    await this.transition(
      id,
      current,
      'APPROVE',
      next.status,
      next.nextStage,
      actor,
      normalizeComment(comment)
    );
    return this.get(id, actor);
  }

  async returnToInitiator(id: string, actor: Actor, comment: string | null) {
    const current = await this.getRow(id);
    if (current.status !== DocumentStatus.InReview) {
      throw new AppError('当前状态不允许退回', 409, 'INVALID_STATUS');
    }
    const next = returnTransition(current.current_stage, actor.role);
    await this.transition(
      id,
      current,
      'RETURN',
      next.status,
      next.nextStage,
      actor,
      normalizeComment(comment)
    );
    return this.get(id, actor);
  }

  private businessValues(input: NormalizedGroupDecisionInput): Array<string | number | null> {
    return [
      input.projectName,
      input.projectCode,
      input.projectLeaderUserId,
      input.projectLeaderName,
      input.plannedStartDate,
      input.plannedEndDate,
      input.investmentEntityId,
      input.investmentEntityName,
      input.investmentDirection,
      input.domesticOverseas,
      input.investmentMethod,
      input.majorProject === null ? null : Number(input.majorProject),
      input.currencyCode,
      input.projectTotalInvestment,
      input.plannedInvestment,
      input.expectedReturnRate,
      input.fundingCompanyOwned,
      input.fundingGroupRequested,
      input.fundingSpecialBond,
      input.fundingGovernment,
      input.fundingLoan,
      input.fundingOther,
      input.annualPlannedInvestment
    ];
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
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE current_value = current_value + 1`,
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
    action: 'SUBMIT' | 'APPROVE' | 'RETURN',
    status: string,
    nextStage: number,
    actor: Actor,
    comment: string | null
  ): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE tz_group_decision_application
            SET status = ?, current_stage = ?, version = version + 1, updated_by = ?
          WHERE id = ? AND version = ?`,
        [status, nextStage, actor.id, id, current.version]
      );
      if (!result.affectedRows) {
        throw new AppError('数据已被其他用户处理，请刷新后重试', 409, 'VERSION_CONFLICT');
      }
      await connection.execute(
        `INSERT INTO tz_document_workflow_history (
          document_type, business_id, action, from_stage, to_stage,
          operator_id, operator_name, operator_role, comment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          DOCUMENT_TYPE,
          id,
          action,
          current.current_stage,
          nextStage,
          actor.id,
          actor.name,
          actor.role,
          comment
        ]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
